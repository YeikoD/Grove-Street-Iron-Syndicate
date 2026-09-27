// GSIS - Input
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Input - dueno unico del estado de teclado y menus
// ============================================================================
//
// Uso:
//   import { keyJustPressed, refresh, setMenuVisible, registerMenuSource } from "../core/gsis_Input.js";
//
// Que resuelve
// ------------
// El input estaba repartido en tres capas sin dueno. Cada modulo llamaba
// Pad.IsKeyJustPressed por su cuenta, el bridge tenia su propio flag de menu, y
// la pagina inventaba su propio "tengo el foco". Tres verdades sin validar
// ninguna contra las otras, y el que mas sufria era el que no podia preguntar.
//
// El problema de fondo es que la pagina NO puede saber si el teclado le llega:
// en la ASI el teclado cuelga del mismo interruptor que el cursor
// (SAWEB_SET_CURSOR) y no hay ningun getter. Un mod terminaba deduciendolo de
// "el menu esta visible", que no es lo mismo, y la pagina terminaba mostrando
// avisos inventados — uno de ellos le pedia al jugador apretar F12, que no
// existia en ningun lado del proyecto.
//
// Desde la v3 del runtime existe SAWeb_GetInputState, que devuelve el gate real
// del WndProc. Este modulo lo consulta una vez por frame y lo reparte. A partir
// de aca "el teclado esta en la pagina" es un dato, no una opinion.
//
// Las dos cosas que el getter NO resuelve, y que conviene tener a mano:
//
//  1. keys === true CONSUME la tecla. El WndProc hace return 0 en el camino que
//     enruta a la pagina, asi que el juego nunca ve ese WM_KEYDOWN. While el
//     teclado este con la UI, el mod no puede cerrar su propio menu con una
//     tecla pollada: la orden tiene que venir por el canal de retorno
//     (cmd:ui:close). Por eso rawKeyDown() existe y solo lo usa el bridge.
//
//  2. El hover NO da el foco, y esa es la razon por la que las teclas del juego
//     se pierden. gFocusedUiId se llena cuando el puntero pasa por encima de la
//     UI, sin click, pero la region de input de la UI es la PANTALLA COMPLETA: la
//     ASI dibuja el panel como un quad de pantalla completa y usa ese rect para
//     decidir a quien le llega la tecla. Asi que "el puntero esta encima de la UI"
//     es cierto en cualquier punto mientras haya un menu abierto — el puntero no
//     puede estar "afuera" de algo que es toda la pantalla.
//
//     Consecuencia: el foco queda seteado al primer movimiento de mouse y no se
//     limpia hasta que el panel cierra. De ahi en adelante el juego no ve ni W ni
//     A ni S ni D, aunque el panel este en una esquina y el mouse lejos.
//
//     Por eso el juego recupera unicamente lo que el mod declara con
//     setMenuKeyPassthrough(): la lista se consulta antes que el foco, asi que
//     gana. Ver la seccion de ABAJO.
//
//  3. Por que suprimir por "hay menu" y no por "la pagina tiene el teclado": la
//     supresion es una decision del mod (no dejar que I abra un menu mientras
//     hay otro) y tiene que valer en los dos casos, no solo cuando la pagina
//     agarro el teclado.
//
//  4. El cursor y el freeze no van juntos. El cursor lo necesita cualquier menu
//     (sin el no se puede clickear una fila), pero el freeze es solo del menu
//     que se abre a mano: los de proximidad se cierran alejandose, y congelado
//     no se puede caminar. Ver la seccion CONGELAR.
//
// Sin imports de modulos: las fuentes de visibilidad se registran con
// registerMenuSource desde el init de cada modulo, no se importan. Respeta la
// misma regla que gsis_EventBus.js.
// ============================================================================

import SAWeb from "../../../../SAWebUI/cleo/SAWebUI/SAWeb.js";

// --------------------------------------------------------------- ESTADO --

// El menu principal (la pagina del inventario). Lo maneja el WebBridge porque
// es el dueno de la visibilidad de la UI; aca solo se guarda el valor.
var _mainMenuVisible = false;

// Fuentes de visibilidad registradas por los modulos. Cada una es una funcion
// que devuelve bool y se consulta sin cachear: los modulos ya calculan sus
// flags de proximidad en este frame, asi que no hay trabajo extra.
var _menuSources = [];

// Lo que devolvio el getter de la ASI en el ultimo refresh.
var _state = {
    read: false,      // se pudo leer el estado real?
    mode: 0,          // -1 auto, 0 oculto, 1 visible
    keys: false,      // la UI se esta quedando con el teclado AHORA
    focus: "",        // id de la UI con foco
    openUis: 0,
    cursor: false
};

// Se loguea una sola vez, no en cada frame.
var _warnedNoGetter = false;
var _warnedNoCursor = false;

// ------------------------------------------------------------- MENUS --

// El WebBridge lo llama cuando abre o cierra. No usa registerMenuSource
// porque el flag vive adentro, no en una funcion externa.
export function setMenuVisible(visible) {
    _mainMenuVisible = !!visible;
}

// Un modulo con menu propio (baul, dealer, retiro, trueque) se registra en su
// init. La funcion se consulta por frame, asi que tiene que ser barata y no
// tener efectos.
export function registerMenuSource(name, fn) {
    if (typeof fn !== "function") {
        log("[Input] registerMenuSource de '" + name + "' recibio algo que no es funcion");
        return;
    }
    _menuSources.push({ name: name, fn: fn });
}

// Hay algun menu de cualquier modulo visible. Es lo que decide si el teclado
// es del juego o del mod: con un menu abierto, ningun hotkey del mod tiene que
// disparar, tenga o no el puntero la UI encima.
//
// Antes esto miraba solo el menu principal, asi que abrir el baul con la 3 no
// apagaba nada y la R del menu del baul competia con la R de recargar.
export function anyMenuVisible() {
    if (_mainMenuVisible) return true;
    for (var i = 0; i < _menuSources.length; i++) {
        try {
            if (_menuSources[i].fn()) return true;
        } catch (e) {
            // Una fuente que revienta no puede voltear el estado de todo el mod.
            log("[Input] fuente de menu '" + _menuSources[i].name + "' fallo: " + e.message);
            _menuSources[i].fn = function () { return false; };
        }
    }
    return false;
}

// ------------------------------------------------------------ CURSOR --
//
// El modo del cursor ES el interruptor del teclado: en la ASI son la misma
// variable (SAWEB_SET_CURSOR escribe gCursorMode, y UiTakesKeyboard lo lee). No
// hay dos cosas que prender, hay una.
//
// Que este seteado no significa que la pagina tenga el teclado. El gate real
// suma la condicion de foco, asi que entre este setter y la pagina hay un hueco
// en el que el cursor esta visible y las teclas todavia son del juego.

var _uiActive = null;  // null = todavia no se fijo en esta sesion

// ---------------------------------------------------------- CONGELAR --
//
// Hay dos clases de menu y el estado del juego se les da distinto.
//
// EL PRINCIPAL (el que se abre apretando I) es un menu de pausa: congela al
// player y le vuelve a poner la camara detras. Es lo que hace el menu de pausa
// de San Andreas, y es la diferencia entre "una pagina dibujada encima del
// juego" y "un menu del juego". Sin esto el jugador ve a su personaje corriendo o
// disparando al fondo mientras elige un item, y la camara se queda donde el
// gameplay la dejo.
//
// LOS DE PROXIMIDAD (baul, armeria, retiro, trueque) NO se congelan. Se abren
// al tocar la esfera y se cierran al alejarse, y congelado no hay forma de
// alejarse: el menu se queda abierto y el player tampoco puede cerrarlo, porque
// las teclas que lo abren estan suprimidas mientras hay un menu abierto. Es un
// soft-lock, no una cuestion de estetica. Lo que si necesitan es el cursor, para
// poder clickear una fila, y eso lo hace el otro setter.
//
// No se usa SET_PLAYER_CONTROL para bloquear, sino para CONGELAR: el teclado no
// se le quita a nadie. El teclado de la pagina se queda igual (lo maneja la ASI
// segun el hover) y el del juego tambien; lo que cambia es que un player
// congelado no reacciona a ninguna de las dos, con lo que el estado se ve limpio
// en vez de medio partido.
//
// El freeze vive aca y no en el WebInterface para que valga para todos los menus
// sin que el bridge tenga que acordarse de cada uno: el principal lo pide, los
// de proximidad no, y cada modulo se registra solo con registerMenuSource.

var _playerFrozen = null;  // null = todavia no se toco
var _warnedNoFreeze = false;
var _warnedNoPassthrough = false;

// El estado del juego frente al menu que se abrio A MANO. Se llama desde el mismo
// lugar que decide el cursor, y comparte su latch: una sola transicion, una sola
// vez.
//
// El cursor NO va aca. Va en su propio setter porque los dos ya no se apagan
// juntos: con un menu de proximidad abierto el cursor tiene que seguir visible
// (hay que clickear filas) mientras el freeze se levanta. Si los dos vivieran en el
// mismo setter, cada frame uno apagaria lo que el otro acaba de prender.
export function setMenuGameState(frozen) {
    setPlayerFrozen(!!frozen);
}

// El cursor, para cualquier menu. Es el interruptor del teclado de la pagina, asi
// que hace falta siempre que haya un panel en pantalla, congele o no.
export function setMenuCursor(visible) {
    setUiActive(visible);
}

// Las teclas que son del JUEGO aunque la pagina tenga el teclado.
//
// Este es el pedazo que faltaba para que un menu de proximidad se pueda cerrar. No
// alcanza con no congelar al player: mientras haya un panel abierto, la region de
// input de la UI es la pantalla completa (la ASI dibuja el panel como un quad de
// pantalla completa y usa ese rect para decidir a quien le llega la tecla), asi que
// en el WndProc "el puntero esta encima de la UI" es cierto en cualquier punto. Al
// primer movimiento de mouse la pagina se queda con TODAS las teclas y el juego no
// vuelve a ver una hasta que el panel cierra.
//
// Consecuencia: con el baul abierto, W no camina. Y el baul se cierra alejandose.
// O sea, sin salida — salvo Escape, que es la pagina mandando ui:close. Eso es un
// soft-lock con una sola puerta, y la puerta se cerraria con el mismo bug.
//
// Asi que el mod declara cuales son sus teclas de juego y la ASI las deja pasar. La
// lista se consulta antes que el foco, o sea que gana: si la tecla esta en la
// lista, va al juego y la pagina no la ve. La pagina conserva el resto —flechas,
// Enter, Escape— que es lo que necesita para moverse por su panel.
//
// Va con su propio latch, como el cursor: la lista se manda una vez por cambio, no
// por frame. Y el estado inicial es null, no [], para no mandar una lista vacia en
// el primer frame de la sesion y dejar el log lleno de un cambio que no es un
// cambio.
//
// Devuelve true si la lista cambio.
var _passthrough = null;

export function setMenuKeyPassthrough(vks) {
    var list = vks ? vks.slice() : [];

    if (_passthrough !== null) {
        var igual = _passthrough.length === list.length;
        for (var i = 0; igual && i < list.length; i++) {
            if (_passthrough[i] !== list[i]) {
                igual = false;
            }
        }
        if (igual) {
            return false;
        }
    }
    _passthrough = list;

    if (typeof SAWeb.setKeyPassthrough !== "function") {
        // ASI v3: el facade no tiene la funcion. No es un error, la v3 no tiene el
        // export, asi que el mod sigue funcionando y lo unico que falta es poder
        // alejarse del baul con W.
        if (!_warnedNoPassthrough) {
            _warnedNoPassthrough = true;
            log("[Input] SAWeb.setKeyPassthrough no existe (facade v3): con un menu de " +
                "proximidad abierto el juego no va a ver W/A/S/D. Se cierra con Escape " +
                "o moviendo el mouse. Actualizar la ASI a v4.");
        }
        return false;
    }
    if (!SAWeb.setKeyPassthrough(list)) {
        // Dos causas con el mismo sintoma, y por eso el aviso tiene que nombrarlas
        // a las dos: el comando no esta declarado en cleo\.config\sa.json (que es un
        // archivo aparte del facade, y hay que editarlo a mano), o la lista no
        // entra. La primera es MUCHO mas probable: el facade puede ser v4 con el
        // sa.json en v3, y entro native() tira y este shim devuelve false.
        if (!_warnedNoPassthrough) {
            _warnedNoPassthrough = true;
            log("[Input] SAWeb.setKeyPassthrough devolvio false: el runtime no tomo " +
                list.length + " tecla(s). Si el facade es v4, casi seguro falta declarar " +
                "SAWEB_SET_KEY_PASSTHROUGH en cleo\\.config\\sa.json — ese archivo se " +
                "edita a mano, no se toma del mod. Sin esto el juego no ve W/A/S/D con " +
                "un menu de proximidad abierto.");
        }
        return false;
    }
    return true;
}

// El estado de control del player. Path defensivo por la misma razon que el
// radar en el WebInterface: si la forma con namespace no existe, tiran
// ReferenceError, que es catcheable, y el comando crudo por nombre es el
// mismo opcode.
//
// OJO con la polaridad: el parametro de SET_PLAYER_CONTROL es "el jugador tiene
// control", NO "esta congelado". Congelar es mandarle false. Por eso abajo se
// llama con !frozen y no con frozen: pasar el flag crudo al opcode lo invierte
// sin que se note, porque el comando no devuelve error ni falla, simplemente
// hace lo contrario de lo pedido. Esta es la funcion donde mas facil es dar vuelta
// esa bandera.
function setPlayerFrozen(frozen) {
    var want = !!frozen;

    // El juego arranca sin congelar, asi que el primer "no congelar" no es una
    // transicion: es el estado de partida. Sin esto, abrir el PRIMER menu de la
    // sesion seria un menu de proximidad — que no congela — y la llamada pasaria
    // por el camino de descongelar, que al final hace SET_CAMERA_BEHIND_CHAR.
    // O sea: abrir un menu junto a una esfera le tiraria la camara al jugador.
    if (_playerFrozen === null) {
        _playerFrozen = false;
    }
    if (_playerFrozen === want) {
        return false;
    }
    _playerFrozen = want;

    // El parametro del comando, con la polaridad ya traducida.
    var control = want ? 0 : 1;

    var p = null;
    try {
        p = new Player(0);
    } catch (e) {
        p = null;
    }

    var ok = false;
    try {
        SET_PLAYER_CONTROL(p, control);
        ok = true;
    } catch (e) { }
    if (!ok) {
        try {
            native("SET_PLAYER_CONTROL", p, control);
            ok = true;
        } catch (e2) { }
    }
    if (!ok && p) {
        try {
            native("SET_PLAYER_CONTROL", 0, control);
            ok = true;
        } catch (e3) { }
    }

    if (!ok) {
        _playerFrozen = null;
        if (!_warnedNoFreeze) {
            _warnedNoFreeze = true;
            log("[Input] SET_PLAYER_CONTROL no se pudo llamar: el menu va a quedar " +
                "abierto sin congelar al jugador. Revisar la firma del comando en " +
                "cleo\\.config\\sa.json contra como lo invoca este modulo.");
        }
        return false;
    }

    // La camara vuelve a la vista detras del personaje. En ambos sentidos: al
    // abrir, para no dejar la camara donde la dejo el gameplay; al cerrar, para
    // que no quede un residuo de la UI.
    try {
        SET_CAMERA_BEHIND_CHAR();
    } catch (e4) {
        try {
            native("SET_CAMERA_BEHIND_CHAR");
        } catch (e5) {
            // Sin camara el menu igual anda; no vale la pena frenar por eso.
        }
    }
    return true;
}

// Fija el modo del cursor. Devuelve true si cambio, para que el que llama sepa
// si hay algo que propagar. El latch evita llamar cada frame: es un native() y
// ademas cada llamada resincroniza el puntero del sistema.
function setUiActive(active) {
    var want = !!active;
    if (_uiActive === want) {
        return false;
    }
    _uiActive = want;
    try {
        SAWeb.setCursor(want ? SAWeb.CursorMode.VISIBLE : SAWeb.CursorMode.HIDDEN);
    } catch (e) {
        _uiActive = null;  // No quedamos creyendo que quedo fijo
        if (!_warnedNoCursor) {
            _warnedNoCursor = true;
            log("[Input] SAWeb.setCursor fallo: " + e.message);
        }
        return false;
    }
    return true;
}

// ------------------------------------------------------------ LECTURA --

// El estado real del input, tal como lo devolvio la ASI. Devuelve una copia
// para que nadie lo mute por accidente.
//
// Se llama inputState y no state a proposito: "state" sola, en un modulo que
// maneja teclas, menus y cursor, es un nombre que no dice de que estado habla.
export function inputState() {
    return {
        read: _state.read,
        mode: _state.mode,
        keys: _state.keys,
        focus: _state.focus,
        openUis: _state.openUis,
        cursor: _state.cursor,
        anyMenu: anyMenuVisible()
    };
}

// Consulta la ASI y actualiza el estado. La llama el WebInterface una vez por
// frame.
//
// Con un menu abierto hace un native() por frame. Con el juego normal no llama
// nada: no hay menu que atender y el teclado es del juego por definicion, asi
// que el getter solo confirmaria lo que ya se sabe.
export function refresh() {
    if (!anyMenuVisible()) {
        _state.read = false;
        _state.mode = 0;
        _state.keys = false;
        _state.focus = "";
        _state.openUis = 0;
        _state.cursor = false;
        return;
    }

    var raw;
    try {
        raw = SAWeb.getInputState();
    } catch (e) {
        raw = null;
    }

    if (raw && typeof raw === "object") {
        _state.read = true;
        _state.mode = typeof raw.mode === "number" ? raw.mode : 0;
        _state.keys = raw.keys === true || raw.keys === 1;
        _state.focus = typeof raw.focus === "string" ? raw.focus : "";
        _state.openUis = typeof raw.openUis === "number" ? raw.openUis : 0;
        _state.cursor = raw.cursor === true || raw.cursor === 1;
        return;
    }

    // Sin getter (ASI vieja, o el comando fallo). No se inventa: se deja
    // marcado que no se pudo leer y se deriva lo unico que si se sabe, que es
    // que con un menu abierto el juego se queda con las teclas por default.
    _state.read = false;
    _state.keys = false;
    _state.focus = "";
    _state.openUis = 0;
    _state.cursor = true;
    if (!_warnedNoGetter) {
        _warnedNoGetter = true;
        log("[Input] SAWeb_GetInputState no esta disponible: el estado de teclado " +
            "sale derivado, no real. Revisa que la ASI y el SAWeb.cleo sean de la " +
            "misma version.");
    }
}

// ------------------------------------------------------------- TECLAS --

// El unico camino de lectura de teclas del mod. Devuelve false mientras haya
// un menu visible, que es lo que hace que el menu sea modal de verdad: sin
// esto, Q abre el mapa de GTA, R recarga el arma y F abre el dealer mientras el
// jugador esta eligiendo un item.
//
// Se suprime por "hay menu" y no por "la pagina tiene el teclado" a proposito.
// Son condiciones distintas: con el menu abierto y el puntero AFUERA de la UI,
// las teclas las tiene el juego —la pagina no las ve— y los hotkeys del mod
// seguirian disparando. Que el menu se sienta modal depende de que la
// supresion valga en los dos casos.
//
// rawKeyDown es la unica excepcion, y es del WebInterface: sus teclas de abrir
// y cerrar tienen que funcionar justo cuando el menu esta visible, que es el
// unico momento en que interesan.
export function keyJustPressed(vk) {
    if (anyMenuVisible()) return false;
    return readJustPressed(vk);
}

// Estado sostenido, sin supresion. Lo usa el WebInterface para I y ESC.
export function rawKeyDown(vk) {
    return readDown(vk);
}

function readJustPressed(vk) {
    try {
        return Pad.IsKeyJustPressed(vk) === true;
    } catch (e) {
        return false;
    }
}

// isKeyPressed es estado sostenido, no flanco, y no todos los builds lo tienen:
// el fallback es IsKeyJustPressed, que si es flanco. Quien necesite deducir un
// flanco sostenido tiene que carry su propio registro, como hace el WebInterface
// con sus dos teclas.
function readDown(vk) {
    try {
        return isKeyPressed(vk) === true;
    } catch (e) {
        return readJustPressed(vk);
    }
}
