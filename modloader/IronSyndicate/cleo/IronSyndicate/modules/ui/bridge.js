// GSIS - UI: bridge
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El UNICO archivo del mod que habla con el runtime de la pagina (SAWeb). Todo lo
// que cruza el cable —en los dos sentidos— pasa por aca.
//
// Que sea uno solo y no este esparcido es lo que hace que el transporte se pueda
// cambiar. Hoy es SAWeb con un comando nativo por frame; si manana es otro runtime,
// lo que se toca es este archivo. ui/index.js (que decide QUE mandar) y
// ui/commands.js (que decide QUE hacer con lo que llega) no se enteran.
//
// ============================================================================
// POR QUE push Y NO PEDIDO/RESPUESTA
// ============================================================================
// En CLEO Redux 1.5.0 los scripts JS no reciben eventos. Probado el 26/09 con
// cleo\zz_sonda.js, sin tocar el mod:
//
//   [S2] A: async entro
//   [S2] E: tick sincrono 90 (asyncWait=0 timers=0)     <- asyncWait no reanuda
//   timers=0  eventos=0
//
// o sea: wait(0) rinde, asyncWait no reanuda, setTimeout/setInterval no disparan
// y addEventListener nunca entrega. La pagina -> CLEO por el canal de eventos esta
// muerta: el TriggerEvent del plugin no tiene a quien entregarle. La unica
// direccion que funciona es CLEO -> pagina, que es un comando nativo y anda (los
// "panels" llegaban).
//
// Asique el puente no espera que la pagina pida nada: le empuja el snapshot y la
// pagina se dibuja sola. La pagina -> CLEO se resolvio despues, agregar el otro
// extremo del mismo transporte (un native() por frame, que si funciona). Ver
// SAWeb_PollCommand en el runtime, y ui/commands.js para el lado que llega.
// ============================================================================

// El runtime de la pagina. Vive FUERA de este paquete (modloader/SAWebUI/), asi
// que el camino sale del arbol del mod: cinco niveles para llegar a la raiz de
// modloader/ y de ahi al hermano. Antes vivia en modules/ y eran cuatro; si se
// mueve este archivo, este es el numero que hay que cambiar, y el unico motivo por
// el que la ruta se escribe explicita es que un path relativo no se puede componer.
import SAWeb from "../../../../../SAWebUI/cleo/SAWebUI/SAWeb.js";

// El id de la pagina. Hay una sola, y por eso es una constante y no un argumento:
// pasarlo por todos lados es la forma de que dos llamadores pasen dos ids
// distintos y cada uno hable con una pagina que no existe.
export var UI_ID = "main";

// ---------------------------------------------------------------------------
// EL TOPE DEL PARAMETRO
// ---------------------------------------------------------------------------
// El dataJson de SAWEB_SEND_EVENT viaja como string de comando CLEO. El plugin lo
// lee con GetStringParam(ctx, buffer, 255) y maxlen es unsigned char, o sea 255 es
// el tope DURO del parametro (SAWEB_API.md seccion 8 dice "~255 caracteres
// utiles", lo que implica que el payload real es menor).
//
// Con CHUNK=160 el dataJson llegaba a 222 chars: demasiado cerca del tope. Si se
// trunca, el chunk llega como JSON valido pero corrupto, la pagina arma una string
// rota, JSON.parse falla, y el error se va a console — invisible sin devtools, y
// el menu se ve vacio sin explicacion. Por eso 60: el dataJson queda en ~80 chars,
// lejos de cualquier tope plausible.
//
// Y el troceado no es opcional por frecuencia: mandar el JSON entero UNA sola vez
// no lo esquiva, porque el tope es del comando. El catalogo son ~1440 chars (45
// iconos + 3 bandas) y sin trocear llegaba cortado al parser.
var PUSH_CHUNK = 60;

// Cuantos comandos se atienden por frame. Es un tope de seguridad: si la pagina
// mandara en bucle, el mod no se queda pegado draining. Con un click por vez, 4 es
// de sobra.
var MAX_COMMANDS_PER_FRAME = 4;

// El canal se detecta una vez. Con la ASI v1 (sin SAWeb_PollCommand) el comando
// no existe y native() tira; se desactiva para no reintentar cada frame, y la
// pagina queda en solo lectura sin que se note.
var _canCommand = null;

// Solo se loguea la primera tanda de cada canal y solo si algo va mal. Asi el
// log dice si el transporte funciona sin llenarse de ruido.
var _diag = { primera: {}, fallos: 0 };

// ---------------------------------------------------------------------------
// CLEO -> PAGINA
// ---------------------------------------------------------------------------

// Si el navegador de la pagina esta abierto. Va por aca y no por un import de
// SAWeb en el que sea, por el mismo motivo que send(): este archivo es el UNICO
// que habla con el runtime, y un segundo lugar que puede mandar o preguntar por
// el navegador convierte el transporte en algo que hay que buscar en dos sitios.
export function isOpen() {
    try {
        return SAWeb.ui.isOpen(UI_ID);
    } catch (e) {
        return false;
    }
}

// Un envio crudo. Devuelve false si el runtime no lo agarro, y eso NO se ignora:
// quien llama decide si reintenta, y un envio fallido que se pierde en silencio es
// un menu que no se actualiza.
export function send(name, data) {
    try {
        return SAWeb.ui.send(UI_ID, name, data);
    } catch (e) {
        log("[UI] Error enviando '" + name + "': " + e.message);
        return false;
    }
}

// Trocea y manda un JSON ya serializado. El sobre es el mismo para todos los
// canales ({i, n, d}) y la pagina reensambla igual, asi que agregar un canal
// troceado no obliga a tocar el otro. Devuelve true si salieron todos los trozos.
export function pushChunked(name, json) {
    var total = Math.max(1, Math.ceil(json.length / PUSH_CHUNK));
    var ok = true;

    for (var i = 0; i < total; i++) {
        var piece = { i: i, n: total, d: json.substr(i * PUSH_CHUNK, PUSH_CHUNK) };
        if (!send(name, piece)) {
            _diagFallo(name, i, total, JSON.stringify(piece).length);
            ok = false;
        }
    }

    // La primera tanda de cada canal se loguea, y solo si salio bien: es lo que
    // dice si el transporte funciona sin llenarse de ruido.
    if (ok && !_diag.primera[name]) {
        _diag.primera[name] = true;
        log("[UI] " + name + ": " + json.length + " chars en " + total + " chunks");
    }
    return ok;
}

function _diagFallo(name, i, total, len) {
    if (_diag.fallos < 3) {
        _diag.fallos++;
        log("[UI] send('" + name + "', " + i + "/" + total + ") fallo. dataJson=" +
            len + " chars");
    }
}

// ---------------------------------------------------------------------------
// PAGINA -> CLEO
// ---------------------------------------------------------------------------
// Lado CLEO del canal. La pagina emite "cmd:<algo>" y el nombre llega encolado como
// "saweb:main:cmd:<algo>"; aca se saca con takeCommand(), que es un native() y por
// tanto anda.
//
// Se drena SIEMPRE, este frame, y no con throttle: un click que tarda 400ms en
// notarse se siente roto. El costo es una llamada nativa por frame con la pagina
// cerrada, que es lo unico que hace el trabajo.

export function canCommand() {
    if (_canCommand !== null) {
        return _canCommand;
    }
    try {
        SAWeb.takeCommand(UI_ID);
        _canCommand = true;
        log("[UI] canal de acciones activo (SAWeb v2)");
    } catch (e) {
        _canCommand = false;
        log("[UI] canal de acciones NO disponible: " + e.message +
            " — la UI queda en solo lectura (hace falta SAWeb v2)");
    }
    return _canCommand;
}

// Drena la cola y le pasa cada comando al handler. Devuelve true si se atendio al
// menos uno, para forzar el push del inventario despues.
//
// El handler va POR PARAMETRO y no se importa: el handler es ui/commands.js, que
// necesita llamar a las funciones de este mismo paquete (togglePanel, closeMenu),
// y si este lo importara habria un ciclo entre los dos archivos. Que el que decide
// que hacer con un comando no viva en el transporte es lo que corta el ciclo.
export function drainCommands(handler) {
    if (!canCommand()) {
        return false;
    }

    var acted = false;
    for (var i = 0; i < MAX_COMMANDS_PER_FRAME; i++) {
        var cmd = SAWeb.takeCommand(UI_ID);
        if (!cmd) {
            break;
        }
        if (handler(cmd)) {
            acted = true;
        }
    }
    return acted;
}
