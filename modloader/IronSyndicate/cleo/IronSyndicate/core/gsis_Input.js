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
//     (sin el no se puede clickear una fila), pero el freeze se lo aplica el que
//     llama. Hoy los llama el bridge con la misma condicion para todos: TODOS los
//     menus son de pausa. Ver la seccion CONGELAR.
//
//  5. NOTA DE ESTADO — no queda ningun menu de proximidad.
//
//     El bridge sigue teniendo escrito el camino de proximidad (ancla,
//     setMenuKeyPassthrough, setMenuGameMouse, updateProximityMove) y lo deja
//     apagado a proposito: los cuatro menus de esfera se abren apretando ESPACIO
//     y se cierran con ESC, igual que el inventario, asi que congelan al jugador
//     y no hay nada que anclar ni teclas que dejar pasar. Las funciones quedan
//     porque son el unico lugar donde se sabe como se le habla a la ASI para eso,
//     y volverlas a encender es cambiar los argumentos que les pasa el bridge, no
//     reescribirlas.
//
//     Lo que si quedo sin consumidor es updateProximityMove(): ya no lo llama
//     nadie. Anclar existia para que el jugador pudiera CAMINAR con el menu
//     abierto, y congelado no puede; y el otro problema que resolvia —la W
//     fantasma del WndProc— no aparece con la lista de teclas apagada, porque la
//     tecla se traba con el menu cerrado y no con el abierto.
//
// Sin imports de modulos: las fuentes de visibilidad se registran con
// registerMenuSource desde el init de cada modulo, no se importan. Respeta la
// misma regla que gsis_EventBus.js.
// ============================================================================

import { MOVE_KEYS } from "./gsis_Config.js";
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
// TODOS los menus son de pausa. Antes habia dos clases y cada una receive lo suyo:
// el que se abria a mano (el inventario) congelaba, y los de proximidad no —se
// cerraban alejandose, y congelado no se puede caminar, o sea que congelarlos era
// un soft-lock: la tecla que los abria tambien esta suprimida mientras hay un menu
// abierto. En vez de eso esos tenian el ancla de mas abajo.
//
// Los de esfera ahora se abren con una tecla (ESPACIO) y se cierran con ESC, o sea
// que son exactamente el caso del inventario: se congelan. Por eso
// setMenuGameState() recibe la misma condicion para todos y no tiene que
// preguntarle a cada modulo de que clase es.
//
// Lo que sigue needing el freeze y no el ancla: el menu de pausa tiene que dejar
// de hacer lo que estaba haciendo el gameplay. Sin esto el jugador ve a su
// personaje corriendo o disparando al fondo mientras elige un item, y la camara se
// queda donde el gameplay la dejo.
//
// No se usa SET_PLAYER_CONTROL para bloquear, sino para CONGELAR: el teclado no
// se le quita a nadie. El teclado de la pagina se queda igual (lo maneja la ASI
// segun el hover) y el del juego tambien; lo que cambia es que un player
// congelado no reacciona a ninguna de las dos, con lo que el estado se ve limpio
// en vez de medio partido.
//
// El freeze vive aca y no en el WebInterface para que valga para todos los menus
// sin que el bridge tenga que acordarse de cada uno: lo pide el unico menu que se
// abre a mano, y cada modulo se registra solo con registerMenuSource.

var _playerFrozen = null;  // null = todavia no se toco
var _warnedNoFreeze = false;
var _warnedNoPassthrough = false;
var _warnedNoMouseBlock = false;

// El estado del juego frente al menu abierto. Se llama desde el mismo lugar que
// decide el cursor, y comparte su latch: una sola transicion, una sola vez.
//
// Hoy el que llama le pasa "hay algun menu visible", sin distinciones: con la
// apertura por tecla no quedan menus que sean otra cosa.
//
// El cursor NO va aca. Va en su propio setter porque los dos ya no se apagan
// juntos: asi fue cuando el menu de proximidad dejaba al jugador libre para
// irse. Hoy los dos van juntos (los menus son de pausa), y siguen separados para
// que volver a encender el camino de proximidad sea cambiar un argumento.
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
// DORMIDA: el bridge la llama con null desde que no hay menus de proximidad. El
// texto de abajo esta como estaba, y explica el problema que existia y que
// volveria a existir el dia que un menu vuelva a cerrarse alejandose.
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

// Que el JUEGO no vea el mouse, sin tocar el teclado.
//
// DORMIDO: el bridge la llama con false desde que no hay menus de proximidad. Con
// el jugador congelado el click que se escapa a la pagina no hace nada, asi que
// no hay nada que tapar.
//
// El sintoma que resuelve: con un menu de proximidad abierto, clickear a un personaje
// lo golpeaba. La razon de que se cuele es que tragar el click en el WndProc no
// alcanza — el teclado pasa por los mensajes de ventana y ahi un "return 0" lo frena,
// pero el mouse lo lee GTA de DirectInput, que lo deposita en el estado del mouse del
// pad sin pasar por el WndProc. Por eso el teclado se arreglo en la v4 y el mouse no:
// son dos caminos distintos.
//
// Lo que el runtime pone a cero son los botones, la rueda y los deltas de camara. Los
// deltas tambien, y no solo los botones: con la camara libre, apuntar a una fila
// barre la mira por el mundo y el click sale sobre cualquier NPC que pase por abajo.
//
// El teclado NO se toca, y es lo importante: el menu de proximidad se cierra
// alejandose, asi que W tiene que llegar al juego. El passthrough de arriba sigue
// siendo lo que garantiza eso, y los dos van juntos por la misma razon: sin el
// passthrough el menu es un soft-lock, sin el bloqueo del mouse cada click es un
// golpe.
//
// El cursor tampoco se toca, y por eso esto no puede hacerse ocultando el cursor: el
// del menu y el del juego son el mismo cursor del sistema. Las filas se siguen
// clickeando porque el click le llega igual a la pagina por el WndProc.
//
// Va con su propio latch, como el cursor y el passthrough: se manda una vez por
// cambio, no por frame. Y el estado inicial es null para no mandar nada en el primer
// frame de la sesion, que no es un cambio.
//
// Devuelve true si el estado cambio.
var _mouseBlock = null;

export function setMenuGameMouse(block) {
    var want = !!block;

    if (_mouseBlock !== null && _mouseBlock === want) {
        return false;
    }
    _mouseBlock = want;

    if (typeof SAWeb.setGameMouseBlock !== "function") {
        // ASI v4: el facade no tiene la funcion. No es un error — la v4 no tiene el
        // export — asi que el mod sigue funcionando y lo unico que falta es que el
        // click no golpee. El teclado NO se ve afectado, que es lo importante.
        if (!_warnedNoMouseBlock) {
            _warnedNoMouseBlock = true;
            log("[Input] SAWeb.setGameMouseBlock no existe (facade v4): con un menu de " +
                "proximidad abierto, clickear sigue llegando al juego y el jugador " +
                "golpea a quien tenga enfrente. El teclado y el cursor del menu no se " +
                "ven afectados. Actualizar la ASI a v5.");
        }
        return false;
    }
    if (!SAWeb.setGameMouseBlock(want)) {
        // Dos causas con el mismo sintoma, y el aviso tiene que nombrarlas a las dos:
        // el comando no esta declarado en cleo\.config\sa.json (que se edita a mano y
        // es un archivo aparte del facade), o el valor no entra. La primera es MUCHAS
        // veces mas probable, y es la que paso con el passthrough.
        if (!_warnedNoMouseBlock) {
            _warnedNoMouseBlock = true;
            log("[Input] SAWeb.setGameMouseBlock devolvio false: el runtime no tomo el " +
                "bloqueo. Si el facade es v5, casi seguro falta declarar " +
                "SAWEB_SET_GAME_MOUSE_BLOCK en cleo\\.config\\sa.json — ese archivo se " +
                "edita a mano, no se toma del mod. Sin esto el click sigue golpeando.");
        }
        return false;
    }
    return true;
}
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
    // transicion: es el estado de partida. Sin esto, el PRIMER menu de la sesion
    // (cualquiera: todos congelan) pasaria por el camino de descongelar, que al
    // final hace SET_CAMERA_BEHIND_CHAR. O sea: el menu abriria bien pero con la
    // camara del gameplay todavia, sin tirar al jugador.
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

// ------------------------------------------------------------- EL ANCLA --
//
// DORMIDO: el bridge la llama con false. Los menus se abren con una tecla y
// congelan al jugador, y el ancla existia justo para lo contrario: dejarle
// caminar con el menu abierto para que pudiera alejarse y cerrarlo. El texto de
// abajo esta como estaba.
//
// El menu de proximidad es un toggle: se abre al tocar la esfera y se cierra al
// salir caminando. Para que el toggle sirva, el jugador tiene que PODER
// salir caminando —y al entrar tiene que QUEDARSE parado, que es lo que nunca
// paso—.
//
// El bug: con la pagina tomando el teclado, el juego no ve el WM_KEYUP de la W
// que el jugador solto (el WndProc lo enruto a la pagina y la tecla ya se
// perdio), asi que el "W apretada" del juego queda trabada. El personaje sigue
// derecho, se sale de la esfera y el menu se le cierra en la cara. La lista de
// WASD (setMenuKeyPassthrough) NO lo arregla: esa lista sirve para que la tecla
// LLEGUE al juego, no para soltar la que quedo pegada, y la v5 del runtime no
// tiene ningun comando para mandarle un key-up.
//
// Y SET_PLAYER_CONTROL(0) tampoco lo arregla: congelado no se puede caminar, y
// caminar es como se cierra el menu. Eso si es un soft-lock.
//
// Asi que lo que se le hace al ped es devolverle las coordenadas mientras el
// jugador no este apretando una direccion de verdad:
//
//   - NO es un freeze. El player conserva el control entero: camara, clicks,
//     armas, entrar a un auto. Lo unico que no puede es MOVERSE, y en el frame
//     en que aprieta una direccion el ancla se suelta y camina normal.
//   - El punto del ancla es donde estaba, no el centro de la esfera: el jugador
//     tiene que poder quedarse donde entro.
//   - El heading se vuelve a poner despues de cada correccion, porque
//     SET_CHAR_COORDINATES no lo conserva y el ped giraria solo.
//
// Cuando se engancha, una sola vez, se borra la tarea del ped: si entro
// caminando, sin eso se queda con la animacion de caminar puesta. Despues el
// juego le vuelve a poner la tarea de caminar (por el input que el cree
// apretado) y por eso esta el snap de cada frame; CLEAR_CHAR_TASKS por frame no
// alcanza, porque la tarea se vuelve a crear en el mismo frame.
var _anclaOn = false;
var _anclaX = 0;
var _anclaY = 0;
var _anclaZ = 0;
var _anclaHeading = 0;

// Menos de esto es jitter de la fisica y no vale la pena un native. Dos
// centimetros.
var ANCLA_EPS = 0.02;

// Un salto mayor no es drift del teclado: es otra cosa moviendo al ped (un
// script, una explosion, un vehiculo). En ese caso el ancla se CORRE al lugar
// nuevo en vez de teletransportarlo de vuelta, que ademas podria arruinarle una
// cutscene al jugador.
var ANCLA_SALTO = 3.0;

var _warnedSalto = false;

// Poner o quitar el ancla. La llama el WebInterface una vez por frame, y el
// mantenimiento (el snap) va aca adentro: el que decide sigue siendo el bridge,
// que es el que sabe de que clase de menu se trata.
export function setMenuAnchor(on) {
    var ped = null;
    try {
        ped = new Player(0).getChar();
    } catch (e) {
        ped = null;
    }
    if (!ped) {
        _anclaOn = false;
        return false;
    }

    if (!on) {
        if (_anclaOn) {
            log("[Input] ancla suelta: el jugador vuelve a tener el control del movimiento");
        }
        _anclaOn = false;
        return false;
    }

    // En un auto el menu ya se cerro (closeSpotFlow), asi que
    // esto es el caso raro de un script que mete al player en un vehiculo con el
    // menu abierto. Tirarlo del ancla: el ancla existe para que no camine, y en un
    // auto no hay nada que frenar.
    try {
        if (ped.isInAnyCar()) {
            if (_anclaOn) {
                log("[Input] ancla suelta: el player esta en un vehiculo");
            }
            _anclaOn = false;
            return false;
        }
    } catch (e2) { }

    if (!_anclaOn) {
        var pos = null;
        try {
            pos = ped.getCoordinates();
        } catch (e3) {
            return false;
        }
        _anclaX = pos.x;
        _anclaY = pos.y;
        _anclaZ = pos.z;
        try {
            _anclaHeading = ped.getHeading();
        } catch (e4) {
            _anclaHeading = 0;
        }
        _anclaOn = true;

        try {
            native("CLEAR_CHAR_TASKS", ped);
        } catch (e5) { }

        log("[Input] ancla puesta: el menu de proximidad para al player en (" +
            Math.round(_anclaX) + ", " + Math.round(_anclaY) + "). Una pulsacion de WASD la suelta.");
        _avisarFantasma();
        return true;
    }

    // Mantener: la correccion es por frame, pero solo cuando se movio de verdad.
    var q = null;
    try {
        q = ped.getCoordinates();
    } catch (e6) {
        return true;
    }
    var dx = q.x - _anclaX;
    var dy = q.y - _anclaY;
    var dz = q.z - _anclaZ;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d <= ANCLA_EPS) {
        return true;
    }

    if (d > ANCLA_SALTO) {
        _anclaX = q.x;
        _anclaY = q.y;
        _anclaZ = q.z;
        if (!_warnedSalto) {
            _warnedSalto = true;
            log("[Input] ancla: el player se movio " + d.toFixed(1) + " m de golpe, que no es " +
                "el teclado. El ancla se corre al lugar nuevo en vez de teletransportarlo.");
        }
        return true;
    }

    try {
        native("SET_CHAR_COORDINATES", ped, _anclaX, _anclaY, _anclaZ);
        // El heading va aparte: SET_CHAR_COORDINATES no lo lleva, y sin esto el
        // ped queda mirando al heading 0 (al norte) cada vez que se corrige.
        native("SET_CHAR_HEADING", ped, _anclaHeading);
    } catch (e7) { }
    return true;
}

// ------------------------------------------------- PIDIO MOVERSE (LA SALIDA) --
//
// DORMIDO: ya no lo llama nadie (ver la nota 5 del header). Con los menus
// congelando, anclar es al reves de lo que hacia falta.
//
// Con el ancla puesta, el jugador se para. Para irse tiene que APRETAR una tecla
// de movimiento: ahi el ancla se suelta, camina con el menu abierto, se aleja de
// la esfera y el menu se cierra solo, que es el contrato de la proximidad.
//
// Devuelve true desde el primer FLANCO de WASD hasta que el menu se cierra. Son
// dos decisiones distintas y las dos importan:
//
//   - Flanco, no nivel: el caso que se arregla es entrar a la esfera con la W
//     apretada. Con el nivel, esa W ya apretada contaria como "el jugador pide
//     moverse" y el ancla no se pondria nunca: seria el bug original.
//   - Latch: si dependiera del nivel, cada vez que el jugador suelta la direccion
//     volveria a pararse en el medio de un paso, que se ve peor que el problema
//     que arregla.
//
// El flanco se lee del TECLADO REAL (readDown, que va isKeyPressed → GetAsyncKeyState),
// no del estado del juego. Es lo unico que no depende de lo que el juego creo que
// el jugador tiene apretado, que es justamente lo que esta trabado: leido del
// juego, la W fantasma contaria como "el jugador pide moverse" y el ancla no se
// pondria nunca.
//
// Si este build no tiene lectura de teclado real, no se ancla: el ancla sin
// forma de soltarse seria el soft-lock que este modulo no va a tener. Se avisa
// una vez y el menu se comporta como antes (el jugador camina y se sale de la
// esfera, que es el bug reportado).
var _pideMover = false;
var _prevMove = false;
var _warnedNoReal = false;

export function updateProximityMove(proxOpen) {
    var down = moveKeyDown();
    var flanco = down && !_prevMove;
    _prevMove = down;

    if (!proxOpen) {
        // Sin menu de proximidad el latch se limpia, y el estado de la tecla se
        // sigue leyendo igual: si el jugador entra a la esfera con la W
        // apretada, el proximo frame tiene que ver que la W ya estaba apretada y
        // NO contarla como flanco.
        _pideMover = false;
        return false;
    }

    if (!_movimientoConfiable()) {
        return false;
    }
    if (flanco) {
        if (!_pideMover) {
            log("[Input] el jugador pidio moverse con el menu de proximidad abierto: " +
                "se suelta el ancla y el menu se cierra alejandose");
        }
        _pideMover = true;
    }
    return _pideMover;
}

// Si la lectura sostenida viene del teclado real y no del estado del juego:
function _movimientoConfiable() {
    if (_downFuente === null) {
        _probarFuenteSostenida();
    }
    if (_downFuente === "isKeyPressed") {
        return true;
    }
    if (!_warnedNoReal) {
        _warnedNoReal = true;
        log("[Input] sin lectura de teclado REAL (la que hay es '" + _downFuente +
            "'): el menu de proximidad NO va a parar al player. El flanco de " +
            "movimiento no se puede leer sin confundir una tecla trabada en el " +
            "juego con una pulsacion del jugador, y un ancla sin salida seria un " +
            "soft-lock.");
    }
    return false;
}

function moveKeyDown() {
    for (var i = 0; i < MOVE_KEYS.length; i++) {
        if (readDown(MOVE_KEYS[i])) return true;
    }
    return false;
}

// ------------------------------------------------------- TECLA FANTASMA --
//
// El diagnostico del bug, y la unica forma de saberlo sin adivinar: en el
// momento en que el ancla se engancha, se compara lo que el TECLADO dice con lo
// que el JUEGO cree. Si no coinciden, hay una tecla que el juego tiene apretada y
// que nadie esta apretando: el key-up se perdio en el WndProc.
//
// Se pregunta una sola vez por menu (dentro de setMenuAnchor) y con el estado del
// juego, que es la unica fuente que puede mostrar la fantasma: Pad.IsKeyPressed
// lee el pad del juego. Si la escalera de lectura sostenida ya cayo en un
// Pad.*, esto no dice nada —no hay forma de distinguir las dos fuentes— y no
// loguea nada, porque un "no hay fantasma" sin fuentes distintas seria mentira.
//
// Por que importa saberlo: la fantasma se limpia sola con la proxima pulsacion
// de esa tecla que llegue al juego (el WndProc le pasa el WM_KEYDOWN y despues el
// WM_KEYUP), asi que si el log dice que hay fantasma, el unico caso troublesome
// es el de entrar a la esfera con la W apretada, soltarla con el menu abierto y
// salirse apretando otra tecla: ahi la W fantasma sobrevive al menu y el
// personaje puede seguir de largo despues. Con la W todavia apretada no hay nada
// raro: al menu cerrarse, el WM_KEYUP llega al juego y la borra.
var _fantasma = {};

function _avisarFantasma() {
    if (_downFuente !== null && _downFuente.indexOf("Pad") !== 0) {
        return;  // la lectura sostenida no es el pad: no hay dos fuentes que comparar
    }
    for (var i = 0; i < MOVE_KEYS.length; i++) {
        var vk = MOVE_KEYS[i];
        if (_fantasma[vk]) continue;
        var mio = readDown(vk);
        var suyo = false;
        try {
            suyo = Pad.IsKeyPressed(vk) === true;
        } catch (e) {
            try {
                suyo = Pad.IsKeyDown(vk) === true;
            } catch (e2) {
                suyo = false;
            }
        }
        if (suyo && !mio) {
            _fantasma[vk] = true;
            log("[Input] tecla fantasma: el juego cree que la " + String.fromCharCode(vk) +
                " esta apretada y el teclado no. El key-up se perdio en el WndProc; se " +
                "limpia con la proxima pulsacion de esa tecla que llegue al juego. " +
                "Por eso el ancla existe.");
        }
    }
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
        // No hay nada que preguntar: con el menu cerrado la respuesta es
        // "cerrado" y no vale la pena ir a la ASI.
        //
        // OJO con _state.read: NO se toca. read significa "el getter se pudo
        // leer", y dejarlo en false cada vez que no hay menu hace que la pagina
        // (y sus diagnosticos) digan que no se pudo leer cuando en realidad se
        // leyo bien. El resto de los campos si se ponen en cero, porque con el
        // menu cerrado su valor correcto es ese.
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
// Son condiciones distintas, y la distincion se nota: con el menu abierto, el
// juego deja de ver TODAS las teclas —la region de input de la UI es la pantalla
// completa, ver arriba— y ademas el mod no podria abrir ni cerrar nada con una
// tecla pollada. Asi que suprimir por "la pagina tiene el teclado" dejaria
// disparar los hotkeys del mod en el instante en que la pagina suelte el
// teclado, que es un momento que el jugador no controla. Que el menu se sienta
// modal depende de que la supresion valga siempre que haya menu.
//
// La otra razon es historica y sigue valiendo: si la supresion dependiera de una
// bandera que el runtime puede cambiar en cualquier frame, el modulo seeria
// impredecible. "Hay menu" es del mod y no cambia por sorpresa.
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

// FLANCO, sin supresion. Es lo que lee keyJustPressed().
//
// Va junto a readDown() y no en otro lado a proposito: las dos son la misma
// pregunta con distinta respuesta ("acabo de apretar" y "esta apretada"), y
// Havinglas separadas en archivos distintos ya costo un bug —readDown cayo a esta
// por un fallback mal hecho, y despues un edit borro la funcion sin borrar la
// llamada, dejando keyJustPressed() tiranto 'readJustPressed is not defined' en
// todos los hotkeys del mod.
function readJustPressed(vk) {
    try {
        return Pad.IsKeyJustPressed(vk) === true;
    } catch (e) {
        return false;
    }
}

// ------------------------------------------------------- FLANCO DE TECLA REAL --
//
// La lectura de tecla del dueno de los menus. La usan el WebInterface para la I,
// la ESPACIO y el ESC, y arma el flanco el mismo (down && !_prev): ninguna de las
// tres pasa por aca. Ver el comentario de pollKeys() en modules/gsis_WebInterface.js
// para por que el flanco tiene que armarse con esta lectura y no con
// Pad.IsKeyJustPressed.
//
// Lo que si es de aca: la escalera de fuentes para el estado sostenido, que es lo
// que hace que la lectura no cambie de semantica segun el build. Un flanco
// disfrazado de sostenido es peor que no tener lectura: por eso aca solo hay
// fuentes SOSTENIDAS.
// ------------------------------------------------------------ LECTURA DE TECLA --
//
// Estas dos son las unicas del mod que se leen SIN supresion, y por eso tienen que
// ser las mas cuidadas del archivo: el WebInterface arma su propio flanco con ellas
// (justI = keyI && !_prevKeyI, y lo mismo con la ESPACIO y el ESC), o sea que espera
// ESTADO SOSTENIDO.
//
// El fallback anterior caia a IsKeyJustPressed, que es un FLANCO. Y un flanco
// alimentado a otro detector de flancos produce pulsos dobles: al frame siguiente
// CLEO puede volver a reportar "recien pulsada" y el WebInterface lo toma como un
// flanco nuevo. Con eso, una sola pulsacion de I abria y cerraba el inventario
// dos veces —cuatro transiciones de pantalla en el log— y el primer efecto
// visible era que el inventario se abria solo justo despues de cerrar un menu de
// esfera. Cuatro toggles de una tecla.
//
// Un fallback que cambia la semantica es peor que no tener fallback, asi que la
// escalera es solo de fuentes SOSTENIDAS, en este orden:
//
//   1. isKeyPressed(vk)      global de CLEO
//   2. Pad.IsKeyPressed(vk)  el mismo concepto en el objeto Pad
//   3. Pad.IsKeyDown(vk)     "esta apretada ahora", tambien sostenido
//
// Si ninguna existe, se devuelve false y se avisa UNA vez. Perder la I es un
// costo visible; un flanco disfrazado de sostenido es un bug invisible.
var _downFuente = null;   // null = sin probar todavia
var _warnedNoDown = false;

function _probarFuenteSostenida() {
    try {
        isKeyPressed(0);
        _downFuente = "isKeyPressed";
    } catch (e) {
        try {
            Pad.IsKeyPressed(0);
            _downFuente = "Pad.IsKeyPressed";
        } catch (e2) {
            try {
                Pad.IsKeyDown(0);
                _downFuente = "Pad.IsKeyDown";
            } catch (e3) {
                _downFuente = "ninguna";
            }
        }
    }
    // Se loguea porque no se puede deducir leyendo: el global puede existir en un
    // build y no en otro, y el sintoma (la I se dobro sola) no dice nada de eso.
    log("[Input] lectura de tecla sostenida: " + _downFuente);
}

function readDown(vk) {
    if (_downFuente === null) {
        _probarFuenteSostenida();
    }
    if (_downFuente === "isKeyPressed") {
        try {
            return isKeyPressed(vk) === true;
        } catch (e) {
            _downFuente = "ninguna";
        }
    } else if (_downFuente === "Pad.IsKeyPressed") {
        try {
            return Pad.IsKeyPressed(vk) === true;
        } catch (e) {
            _downFuente = "ninguna";
        }
    } else if (_downFuente === "Pad.IsKeyDown") {
        try {
            return Pad.IsKeyDown(vk) === true;
        } catch (e) {
            _downFuente = "ninguna";
        }
    }
    if (!_warnedNoDown) {
        _warnedNoDown = true;
        log("[Input] NO hay lectura de tecla sostenida en este build (ni isKeyPressed, " +
            "ni Pad.IsKeyPressed, ni Pad.IsKeyDown). No se puede abrir NINGUN menu a " +
            "mano: ni el inventario (I) ni los de esfera (ESPACIO). El Escape tampoco " +
            "responde desde el mod —el menu sigue cerrandose con el boton de la pagina " +
            "o con el Escape de la pagina—, asi que no es un soft-lock.");
    }
    return false;
}
