// GSIS - WebBridge
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS WebBridge - puente entre la pagina web y los modulos del mod
//
// Reemplaza al UIManager de ImGui (borrado en el commit 13588b1) usando el
// runtime SAWebUI en vez de una ventana nativa.
//
// Modelo de dos niveles, igual que el UIManager:
//   - El bridge es dueno del estado de visibilidad. La pagina solo refleja.
//   - El browser NUNCA se cierra. Se oculta y se muestra la seccion con
//     .hidden, asi el DOM sigue vivo y el tick() sigue corriendo a 60fps.
//
// LA PAGINA NO MANDA NADA. En CLEO Redux 1.5.0 los scripts JS no reciben
// eventos: asyncWait no reanuda la corrutina, setTimeout/setInterval no
// disparan y addEventListener nunca entrega. Probado el 26/09 con un script
// suelto en cleo\ (sin tocar el mod): timers=0, eventos=0 con 1500 ticks.
//
// O sea que no hay router de comandos ni puede haber. La unica direccion que
// funciona es CLEO -> pagina, que es un comando nativo. Este modulo se limita
// a PUSH: el es dueno del estado y le empuja a la pagina "panels" cuando cambia
// y "inv" con el inventario troceado cada PUSH_MS. Las acciones (equipar,
// guardar en cinturon) quedan sin hacer: no hay canal de vuelta.
//
// Orden de imports: este archivo va DESPUES de Trunk / WeaponDealer /
// DealerPickup / WeaponSeller en gsis_index.js, porque el orden de imports es
// el orden de updateAll(). Asi los flags de proximidad de este frame ya estan
// calculados cuando el bridge los lee.
//
// ============================================================================
// ACCIONES — NO FUNCIONAN (limite del runtime, no del mod)
// ============================================================================
//
// Equipar, guardar en cinturon, sacar del cinturon, vender: nada de eso se puede
// hacer desde la pagina. Requeriría que la pagina mande un "cmd" al mod, y esa
// direccion esta muerta: el plugin de CLEO dispara TriggerEvent("saweb:main:cmd")
// pero los scripts JS de CLEO Redux 1.5.0 no reciben eventos. Medido el 26/09 con
// un script suelto en cleo\: asyncWait no reanuda la corrutina, setTimeout y
// setInterval no disparan, y addEventListener nunca entrega ni con un
// dispatchEvent propio. Ensamblado 1500 ticks con timers=0 y eventos=0.
//
// El inventario es de SOLO LECTURA. La UI muestra lo que hay y se actualiza
// sola. Las acciones quedan para cuando el runtime las soporte; si se arregla
// ever, el camino es:
//   1. la pagina manda emit("cmd", {cmd:"inv:equip", id:...})
//   2. el bridge on("main","cmd") lo despacha
//   3. equipWeapon(id) y se devuelve el snapshot nuevo
// Todo el lado del modulo ya existe y se provó (gsis_WebData.js), lo que falta es
// solo el canal de vuelta.
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { KEYS } from "../core/gsis_Config.js";
import { snapInventory } from "./gsis_WebData.js";
import SAWeb from "../../../../SAWebUI/cleo/SAWebUI/SAWeb.js";

var UI_ID = "main";
var DEBOUNCE_MS = 200;
var KEY_ESC = 27;

// El brake de pulsaciones vive en DEBOUNCE_MS, arriba. CMD_MIN_MS se fue con el
// router de comandos: la pagina ya no puede mandar nada, asi que no hay
// reintentos que frenar.

var _uiState = {
    menuVisible: false,
    keyDebounce: 0
};

var _prevKeyI = false;
var _prevKeyEsc = false;

// Ultimo valor propagado a la pagina. Sirve de latch: sin esto habria que
// mandar los eventos input/panels en cada frame y se taparia la cola de 256.
var _lastInput = null;
var _lastPanels = null;

// ------------------------------------------------------------------ ESTADO --
//
// No se toca SET_PLAYER_CONTROL. El default del runtime es CursorMode.HIDDEN y
// el juego conserva mouse y teclado con el menu abierto: el click llega por el
// WndProc hook de la ASI, no por el cursor del sistema, y el input se enruta
// por donde esta el puntero (dentro de la UI -> CEF, fuera -> GTA). Bloquear al
// jugador era copie-pega de ImGui y ademas rompia poder jugar con el menu
// abierto, que es justamente lo que se quiere.

export function isMenuVisible() {
    return _uiState.menuVisible;
}

export function openMenu() {
    _uiState.menuVisible = true;
    _uiState.keyDebounce = Date.now();
}

export function closeMenu() {
    _uiState.menuVisible = false;
    _uiState.keyDebounce = Date.now();
}

// -------------------------------------------------------------- ENVIO A PAGINA --

function send(name, data) {
    try {
        return SAWeb.ui.send(UI_ID, name, data);
    } catch (e) {
        log("[WebBridge] Error enviando '" + name + "': " + e.message);
        return false;
    }
}

// anyVisible se deriva de los modulos en las fases siguientes. Por ahora solo
// el menu principal: los overlays de baul / dealer / retiro / trueque se
// enchufan aca con sus isXxxMenuVisible().
function computeVisible() {
    return _uiState.menuVisible;
}

function broadcast() {
    var anyVisible = computeVisible();

    // Si el browser no esta abierto no hay a quien mandarle nada, y el cursor
    // tiene que quedar apagado igual.
    var browserOpen = false;
    try {
        browserOpen = SAWeb.ui.isOpen(UI_ID);
    } catch (e) { }
    if (!browserOpen) {
        anyVisible = false;
    }

    // input: el cursor y el teclado cuelgan del mismo comando nativo, asi que
    // son un solo interruptor. La pagina no puede llamarlo, hay que avisarle.
    if (_lastInput !== anyVisible) {
        _lastInput = anyVisible;
        try {
            SAWeb.setCursor(anyVisible ? SAWeb.CursorMode.VISIBLE : SAWeb.CursorMode.HIDDEN);
        } catch (e) { }
        send("input", { enabled: anyVisible });
    }

    // panels: que seccion tiene que verse. El browser sigue abierto siempre.
    var panels = { menu: anyVisible };
    if (_lastPanels === null || _lastPanels.menu !== panels.menu) {
        _lastPanels = panels;
        send("panels", panels);
    }
}

// ------------------------------------------------------------------ TECLADO --

// isKeyPressed es estado sostenido, no flanco, asi que el rising edge va aqui.
// Se usa el codigo virtual crudo y no Pad.IsKeyJustPressed porque el juego
// sigue teniendo el teclado (el runtime solo se queda con el suyo cuando hay
// una UI abierta), y el menu tiene que responder igual con los dos.
function pollKeys() {
    var now = Date.now();

    var keyI = false;
    var keyEsc = false;
    try { keyI = isKeyPressed(KEYS.INVENTORY); } catch (e) { keyI = Pad.IsKeyJustPressed(KEYS.INVENTORY); }
    try { keyEsc = isKeyPressed(KEY_ESC); } catch (e) { }

    var justI = keyI && !_prevKeyI;
    var justEsc = keyEsc && !_prevKeyEsc;

    _prevKeyI = keyI;
    _prevKeyEsc = keyEsc;

    if (justI) {
        if (now - _uiState.keyDebounce > DEBOUNCE_MS) {
            if (_uiState.menuVisible) {
                closeMenu();
            } else {
                openMenu();
            }
        }
    } else if (justEsc && _uiState.menuVisible) {
        if (now - _uiState.keyDebounce > DEBOUNCE_MS) {
            closeMenu();
        }
    }

    // El estado de visibilidad se propaga TODOS los frames, no solo cuando cambia
    // la tecla. broadcast() esta latcheado (_lastInput / _lastPanels), asi que
    // solo manda algo cuando el valor difiere de verdad: el costo por frame es un
    // isOpen() y un par de comparaciones.
    //
    // Sin esto la I da vuelta menuVisible por dentro y no se lo dice a nadie:
    // el toggle queda muerto. Y como el primer frame siempre pasa (los latches
    // arrancan en null), la pagina recibe el estado inicial apenas el browser
    // esta abierto, sin depender de ningun evento de la pagina.
    broadcast();

    // El inventario se empuja con el menu abierto. pushInventory() se auto
    // limita por tiempo, asi que llamarlo cada frame no genera trafico: solo
    // corta un evento cada PUSH_MS.
    if (_uiState.menuVisible) {
        pushInventory();
    }
}

// ------------------------------------------------------------------- INIT --

function initWebBridge() {
    log("[WebBridge] Bridge CLEO <-> " + UI_ID + " inicializado");
    log("[WebBridge] Tecla " + String.fromCharCode(KEYS.INVENTORY) + " abre/cierra, ESC cierra");
    try {
        log("[WebBridge] isOpen('" + UI_ID + "') -> " + SAWeb.ui.isOpen(UI_ID));
    } catch (e) {
        log("[WebBridge] isOpen fallo: " + e.message);
    }
}

// ================================================================= PUSH DEL INVENTARIO ==
//
//Por que push y no pedido/respuesta: en CLEO Redux 1.5.0 los scripts JS no
//reciben eventos. Probado el 26/09 con cleo\zz_sonda.js, sin tocar el mod:
//
//   [S2] A: async entro
//   [S2] E: tick sincrono 90 (asyncWait=0 timers=0)     <- asyncWait no reanuda
//   timers=0  eventos=0
//
// o sea: wait(0) rinde, asyncWait no reanuda, setTimeout/setInterval no
//disparan y addEventListener nunca entrega. La pagina -> CLEO esta muerta: el
// TriggerEvent del plugin no tiene a quien entregale. La unica direccion que
// funciona es CLEO -> pagina, que es un comando nativo y anda (los "panels"
// llegaban).
//
// Asique el puente no espera que la pagina pida nada: le empuja el snapshot y la
// pagina se dibuja sola.
//
// CUANDO SE EMPUJA. No cada frame: la UI vieja (ImGui) leia getItems() en vivo
// y solo dibujaba cuando algo cambiaba. Aca el equivalente es comparar el
// snapshot con el ultimo enviado y mandar solo si difiere. Se sigue mirando cada
// PUSH_MS para no pagar el stringify en cada frame, pero si no cambio no sale
// nada. El precio: un cambio tarda hasta PUSH_MS en verse, 400ms, que es
// imperceptible para un menu.
//
// TROCEADO: el dataJson de SAWEB_SEND_EVENT viaja como string de comando CLEO.
// El plugin lo lee con GetStringParam(ctx, buffer, 255) y maxlen es unsigned char,
// o sea 255 es el tope DURO del parametro (SAWEB_API.md seccion 8 dice "~255
// caracteres utiles", lo que implica que el payload real es menor).
//
// Con CHUNK=160 el dataJson llegaba a 222 chars: demasiado cerca del tope. Si se
// trunca, el chunk llega como JSON valido pero corrupto, la pagina arma una
// string rota, JSON.parse falla, y el error se va a console — invisible sin
// devtools, y el menu se ve vacio sin explicacion. Por eso 60: el dataJson queda
// en ~80 chars, lejos de cualquier tope plausible.
var PUSH_MS = 400;
var PUSH_CHUNK = 60;
var _lastPush = 0;
var _lastJson = null;

// Solo se loguea la primera tanda y solo si algo va mal. Asi el log dice si el
// transporte funciona sin llenarse de ruido.
var _diag = { primera: true, fallos: 0 };

function _diagSend(i, total, dataJson, ok) {
    if (ok) {
        return;
    }
    if (_diag.fallos < 3) {
        _diag.fallos++;
        log("[WebBridge] send('inv', " + i + "/" + total + ") fallo. dataJson=" + dataJson.length + " chars");
    }
}

function pushInventory() {
    var now = Date.now();
    if (now - _lastPush < PUSH_MS) {
        return;
    }
    _lastPush = now;

    var json;
    try {
        json = JSON.stringify(snapInventory());
    } catch (e) {
        log("[WebBridge] snapInventory fallo: " + e.message);
        return;
    }

    // Solo si cambio. Un menu abierto en el juego no genera trafico.
    if (json === _lastJson) {
        return;
    }
    _lastJson = json;

    var total = Math.max(1, Math.ceil(json.length / PUSH_CHUNK));
    for (var i = 0; i < total; i++) {
        var dataJson = JSON.stringify({ i: i, n: total, d: json.substr(i * PUSH_CHUNK, PUSH_CHUNK) });
        var ok = send("inv", { i: i, n: total, d: json.substr(i * PUSH_CHUNK, PUSH_CHUNK) });
        _diagSend(i, total, dataJson, ok);
    }

    if (_diag.primera) {
        _diag.primera = false;
        log("[WebBridge] inventario empujado: " + json.length + " chars en " + total + " chunks");
    }
}

// ------------------------------------------------------------------- REGISTRO --

register({
    name: "WebBridge",
    init: initWebBridge,
    update: pollKeys
});