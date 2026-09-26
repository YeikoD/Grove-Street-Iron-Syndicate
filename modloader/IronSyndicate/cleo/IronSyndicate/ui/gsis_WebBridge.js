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
// La pagina nunca alcanza una native: todo entra por el router de comandos
// CMDS, que es una tabla blanca de nombre -> funcion de modulo.
//
// Orden de imports: este archivo va DESPUES de Trunk / WeaponDealer /
// DealerPickup / WeaponSeller en gsis_index.js, porque el orden de imports es
// el orden de updateAll(). Asi los flags de proximidad de este frame ya estan
// calculados cuando el bridge los lee.
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { KEYS } from "../core/gsis_Config.js";
import SAWeb, { onAny } from "../../../../SAWebUI/cleo/SAWebUI/SAWeb.js";

var UI_ID = "main";
var DEBOUNCE_MS = 200;
var KEY_ESC = 27;

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

// ------------------------------------------------------------------ JUGADOR --

function setPlayerControl(enable) {
    try {
        native("SET_PLAYER_CONTROL", 0, enable ? 1 : 0);
    } catch (e) { }
}

// ------------------------------------------------------------------ ESTADO --

export function isMenuVisible() {
    return _uiState.menuVisible;
}

export function openMenu() {
    _uiState.menuVisible = true;
    _uiState.keyDebounce = Date.now();
    setPlayerControl(false);
}

export function closeMenu() {
    _uiState.menuVisible = false;
    _uiState.keyDebounce = Date.now();
    setPlayerControl(true);
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

// -------------------------------------------------------------- ROUTER COMANDOS --

// Tabla blanca. La pagina solo puede invocar lo que este aca. Cada handler
// devuelve un valor serializable o null; el resultado vuelve a la pagina como
// el evento "reply" con el id que ella mando.
var CMDS = {
    ping: function () {
        return { pong: true, at: Date.now() };
    }
};

function dispatch(name, data) {
    var fn = CMDS[name];
    if (!fn) {
        log("[WebBridge] Comando desconocido: " + name);
        send("reply", { cmd: name, ok: false, error: "unknown_command" });
        return;
    }
    try {
        var result = fn(data || {});
        send("reply", { cmd: name, ok: true, data: result === undefined ? null : result });
    } catch (e) {
        log("[WebBridge] Error en '" + name + "': " + e.message);
        send("reply", { cmd: name, ok: false, error: String(e) });
    }
}

// ------------------------------------------------------------------ TECLADO --

// isKeyPressed es estado sostenido, no flanco, asi que el rising edge va aqui.
// Se usa el codigo virtual crudo y no el sistema de input del juego a proposito:
// el menu tiene que responder aunque los controles de CJ esten bloqueados por
// SET_PLAYER_CONTROL.
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

onAny(UI_ID, function (event, data) {
    if (!event) {
        return;
    }
    if (event === "ready") {
        log("[WebBridge] Pagina lista: " + JSON.stringify(data));
        // La pagina arranca creyendo que el input esta apagado. Se le manda el
        // estado real de una vez, no solo cuando cambie.
        _lastInput = null;
        _lastPanels = null;
        broadcast();
        return;
    }
    if (event === "cmd") {
        var d = data || {};
        dispatch(d.cmd, d);
        return;
    }
    if (event === "pong") {
        log("[WebBridge] pong de la pagina: " + JSON.stringify(data));
        return;
    }
    log("[WebBridge] Evento sin manejar: " + event);
});

function updateWebBridge() {
    pollKeys();
    broadcast();
}

register({
    name: "WebBridge",
    init: initWebBridge,
    update: updateWebBridge
});
