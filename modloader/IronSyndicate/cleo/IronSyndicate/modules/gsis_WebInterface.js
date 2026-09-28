// GSIS - WebInterface
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS WebInterface - puente entre la pagina web y los modulos del mod
//
// La UI es una pagina web. Antes lo era con un framework de ventanas nativo; ahora se
// dibuja con el runtime SAWebUI (CEF).
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
// el orden de updateAll(). Asi los flags de este frame ya estan calculados
// cuando el bridge los lee.
//
// QUE TECLA ABRE QUE. El inventario, con I. Los cuatro menus de esfera (baul,
// armeria, retiro, trueque), con ESPACIO y solo parado adentro de su esfera —
// cada modulo decide si puede abrir desde openXMenu() y el bridge elige a quien
// llamar (openFlow, en modules/gsis_FlowSerialization.js). La misma tecla abre y
// cierra, y el Escape tambien cierra.
//
// Por que la ESPACIO la lee el bridge y no cada modulo: si los cuatro leyeran la
// suya, la pulsacion que abre un menu seria vista por todos en el mismo frame, y
// el primero que la consumiera se la sacaria al resto. Con un dueno solo, la
// pulsacion se gasta una vez en una decision: cerrar lo que esta abierto, o abrir
// lo que el jugador tiene adelante. Que el open y el close esten en la MISMA
// funcion es justamente lo que evita que una pulsacion haga las dos cosas.
//
// La I con un menu de esfera abierto no abre el inventario (REGLA 1), y la
// ESPACIO con el inventario abierto no abre un menu de esfera. La pagina manda
// "ui:toggle" con la I y "flow:toggle" con la ESPACIO, o sea que los dos caminos
// de cada tecla pasan por la misma funcion.
//
// Todos los menus se cierran con ESC, y todos se comportan igual: congelan al
// jugador, esconden el radar y le dan el teclado a la pagina.
//
// ============================================================================
// ACCIONES — functioning (SAWeb v2)
// ============================================================================
//
// Equipar, cinturon y tirar YA NO son de solo lectura. La pagina manda
// emit("cmd:<algo>", {id, slot}) y el runtime lo encola; este bridge lo PULLA
// con SAWeb.takeCommand() una vez por frame y lo despacha a los modulos.
//
// El canal de ida (TriggerEvent -> addEventListener) sigue muerto: los scripts
// JS de CLEO Redux 1.5.0 no reciben eventos, y eso no se cambio. Lo que se
// cambio fue agregar el otro extremo del mismo transporte, que es un native()
// por frame — eso si funciona. Ver SAWeb_PollCommand en el runtime.
//
// Por eso NO se usa on("main", "cmd"): seria el camino que ya se midio roto.
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { KEYS, MISC } from "../core/gsis_Config.js";
import {
    setMenuVisible,
    anyMenuVisible,
    refresh as refreshInput,
    inputState,
    rawKeyDown,
    setMenuCursor,
    setMenuGameState,
    setMenuAnchor,
    setMenuKeyPassthrough,
    setMenuGameMouse
} from "../core/gsis_Input.js";
import { snapInventory, snapCatalog } from "./gsis_InventorySerialization.js";
import { currentFlow, closeFlow, openFlow, snapFlow } from "./gsis_FlowSerialization.js";
import { equipWeapon, unequipWeapon } from "./gsis_Ballistic.js";
import { removeItem, equipMagToBelt, unequipBeltMag } from "./gsis_Items.js";
import { putInTrunk, takeFromTrunk } from "./gsis_Trunk.js";
import { addToCart, removeFromCart, resetCart, checkout } from "./gsis_WeaponDealer.js";
import { doOffer } from "./gsis_WeaponSeller.js";
import { collectItem, collectAll, cancelOrder } from "./gsis_DealerPickup.js";
import { clearNotice, hasNotice, takeNotice } from "../core/gsis_Notice.js";
import SAWeb from "../../../../SAWebUI/cleo/SAWebUI/SAWeb.js";

var UI_ID = "main";
var DEBOUNCE_MS = 200;

// Cuantos comandos se atienden por frame. Es un tope de seguridad: si la
// pagina mandara en bucle, el mod no se queda pegado draining. Con un click
// por vez, 4 es de sobra.
var MAX_COMMANDS_PER_FRAME = 4;

// El canal se detecta una vez. Con la ASI v1 (sin SAWeb_PollCommand) el
// comando no existe y native() tira; se desactiva para no reintentar cada
// frame, y la pagina queda en solo lectura sin que se note.
var _canCommand = null;

// El brake de pulsaciones vive en DEBOUNCE_MS, arriba.

var _uiState = {
    menuVisible: false,
    keyDebounce: 0
};

var _prevKeyI = false;
var _prevKeySpace = false;
var _prevKeyEsc = false;

// Firma de lo ultimo propagado a la pagina. Sirve de latch: sin esto habria que
// mandar el estado cada frame y se taparia la cola de 256. Es una firma y no el
// objeto porque inputState() devuelve una copia nueva en cada llamada.
var _lastUiState = null;

// Ultimo valor enviado a Hud.DisplayRadar. Mismo latch que el de arriba.
var _lastRadar = null;

// El catalogo se manda una vez por sesion de UI. El flag se pone solo si el
// send() volvio true: si fallo, se reintenta en el proximo frame en vez de
// dejar la pagina sin iconos para siempre.
var _catalogSent = false;

// Log de una sola vez si el build no expone ninguna de las dos formas de tocar
// el radar, para no spamear el log en cada toggle.
var _radarFallo = false;

// ------------------------------------------------------------------ ESTADO --
//
// El estado del juego NO se toca aca: eso es gsis_Input.js, y son varias llamadas
// porque el cursor, el freeze y el teclado ya no se apagan juntos.
//
//   setMenuCursor(anyVisible)      el cursor, con cualquier menu. Sin el no se
//                                  puede clickear una fila
//   setMenuGameState(anyVisible)   SET_PLAYER_CONTROL invertido (congelar al
//                                  player) + SET_CAMERA_BEHIND_CHAR
//   setMenuKeyPassthrough(null)    sin teclas para el juego: el menu congela y
//                                  no se sale caminando
//   setMenuGameMouse(false)        el click llega a la pagina: con el jugador
//                                  congelado no hay nada a quien pegarle
//   setMenuAnchor(false)           sin ancla: el ancla era para el menu que
//                                  dejaba caminar, y este congela
//
// TODOS los menus son de pausa. Antes habia dos clases —el inventario, que se
// abria con I, y los cuatro de esfera, que se abrian al tocarlas y se cerraban
// alejandose— y por eso el estado se daba distinto a cada una: congelar al
// primero, anclar al segundo. Los de esfera ahora se abren con una tecla
// (ESPACIO) y se cierran con ESC, o sea que son el mismo caso que el
// inventario. Por eso lo que decide ya no es "que clase de menu es" sino "hay
// alguno": las tres llamadas de proximidad se pasan en false y quedan apagadas
// (ver la nota 5 del header de gsis_Input.js).
//
// Lo que cambio con la v3 del runtime es que ahora SE PUEDE SABER por donde va.
// Antes el bridge suponia: si el menu esta visible, el cursor es visible y el
// teclado es de la pagina. Las dos primeras estan atadas en la ASI, pero el
// teclado tiene una condicion mas (que el puntero haya pasado por encima de la
// UI), asi que la suposicion era falsa justo en el caso que mas importa. El
// estado real lo trae gsis_Input, que consulta SAWeb_GetInputState.

export function isMenuVisible() {
    return _uiState.menuVisible;
}

export function openMenu() {
    _uiState.menuVisible = true;
    _uiState.keyDebounce = Date.now();
    setMenuVisible(true);
}

export function closeMenu() {
    _uiState.menuVisible = false;
    _uiState.keyDebounce = Date.now();
    setMenuVisible(false);
}

// -------------------------------------------------------------- ENVIO A PAGINA --

function send(name, data) {
    try {
        return SAWeb.ui.send(UI_ID, name, data);
    } catch (e) {
        log("[WebInterface] Error enviando '" + name + "': " + e.message);
        return false;
    }
}

// El radar se esconde con la UI. Hud.DisplayRadar es la forma documentada en
// CLEO Redux; native("DISPLAY_RADAR", ...) es el mismo comando por su nombre
// clasico (0581) y es el camino que ya usa SAWeb.js, asi que va de respaldo:
// si el build no expone el namespace, el radar igual se oculta. Un Hud que no
// existe tira ReferenceError, que es catcheable, asi que el fallback dispara
// solo en vez de tener que detectarlo.
//
// 0581 es write-only: no hay getter del estado del radar en ningun lado, asi
// que no se puede restaurar "el estado previo". Cerrar la UI lo fuerza
// visible, que es el default del juego.
//
// Ojo: 0581 saca el disco Y los blips (asi lo documenta Sanny Builder). Con la
// UI abierta tampoco se ve el sprite del punto de retiro, ni ningun otro blip.
function setRadar(show) {
    try {
        Hud.DisplayRadar(show);
        return;
    } catch (e) { }
    try {
        native("DISPLAY_RADAR", show ? 1 : 0);
    } catch (e2) {
        if (!_radarFallo) {
            _radarFallo = true;
            log("[WebInterface] no se pudo cambiar el radar: " + e2.message);
        }
    }
}

// AnyVisible ya no se deriva a mano: gsis_Input ORea el menu principal con las
// fuentes que cada modulo registro en su init (baul, dealer, retiro, trueque).
//
// Antes miraba solo el menu principal, con un comentario que decia "los
// overlays se enchufan aca". Se enchufaron de la otra forma, que es mejor: cada
// modulo publica su propia visibilidad y no hay que acordarse de venir a
// actualizar esta funcion cada vez que aparece un menu nuevo.
function computeVisible() {
    return anyMenuVisible();
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

    // Lo que broadcast() decidio este frame sobre "hay algo que mirar". Lo leen los
    // dos pushes de abajo, y es distinto de _uiState.menuVisible: ese es el flag
    // del panel principal, y un menu de esfera se abre con ESPACIO sin apretar I.
    _anyVisible = anyVisible;

    // Que pantalla se esta viendo, porque el estado del juego y el push dependen
    // de eso.
    //
    // REGLA 1: la pantalla visible es una sola. Si el panel principal esta
    // abierto, ningun menu de esfera toma la pantalla —el flujo sigue "abierto"
    // del lado del modulo, pero espera su turno— y al cerrarse el panel aparece.
    // Ver pantallaVisible().
    var visible = pantallaVisible();
    var flow = visible === "inventario" ? "" : visible;

    // Se publica para pollKeys(), que limpia los caches de los pushes cuando el
    // flujo visible cambia. No se recalcula alla: una segunda decision del mismo
    // dato es donde aparecen las discrepancias, y con REGLA 1 el flujo abierto y
    // el flujo mostrado no son lo mismo.
    _flowVisible = flow;

    // REGLA 2: TODOS los menus son de pausa, asi que el estado del juego es el
    // mismo para los cinco.
    //
    // El cursor lo necesita cualquiera de los cinco, porque sin el no se puede
    // clickear una fila, y por eso va con su propia llamada y no con el freeze.
    //
    // El freeze es lo que hace que esto sea "exactamente como el inventario":
    // SET_PLAYER_CONTROL al reves + la camara detras del personaje. Sin esto el
    // jugador ve a su personaje corriendo o disparando al fondo mientras elige un
    // item, y la camara se queda donde el gameplay la dejo.
    //
    // Lo que se apaga, y por que:
    //
    //   - el ancla (setMenuAnchor) era para el menu que dejaba caminar al jugador
    //     para que se alejara y lo cerrara. Acá el menu congela, y con el jugador
    //     parado adentro de la esfera el menu se cierra con ESC.
    //   - el passthrough de WASD (setMenuKeyPassthrough) existia por lo mismo: con
    //     un panel en pantalla la pagina se queda con el teclado entero, y sin la
    //     lista el juego no veia la W con la que el jugador se iba.
    //   - el bloqueo del mouse (setMenuGameMouse) era porque con el menu de
    //     proximidad el mundo seguia vivo y un click que se escapaba golpeaba a
    //     quien estuviera enfrente. Congelado no hay a quien pegarle.
    //
    // Las tres se pasan en false, y cada una tiene su latch: mandan una vez el
    // cambio y despues no vuelven a tocar la ASI.
    setMenuCursor(anyVisible);
    setMenuGameState(anyVisible);
    setMenuKeyPassthrough(null);
    setMenuGameMouse(false);
    setMenuAnchor(false);

    // radar: mismo interruptor que el freeze y por la misma razon. Con cualquier
    // menu en pantalla el radar no se ve.
    if (MISC.HIDE_RADAR_WHEN_MENU && _lastRadar !== anyVisible) {
        _lastRadar = anyVisible;
        setRadar(!anyVisible);
    }

    // uistate: un solo evento con todo el estado, en vez de "input" y "panels"
    // por separado. La pagina tiene tres banderas propias (menu abierto, teclado
    // prendido, foco) y antes las armaba ella misma a partir de dos señales
    // que no la dejaban distinguir "el menu esta visible" de "la pagina esta
    // recibiendo teclas" — que son cosas distintas, y la segunda es la que
    // importa. Ahora la respuesta llega hecha y con la fuente etiquetada.
    //
    // flow es cual de los cuatro menus de esfera esta abierto ("", "trunk",
    // "dealer", "seller", "pickup"). Sin el, la pagina solo sabia que ALGUN menu
    // estaba abierto, y no puede dibujar un panel sin saber de que tipo es. Va
    // en uistate y no en el snapshot de "screen" a proposito: uistate va
    // latcheado por firma, asi que el cambio llega en el frame en que pasa,
    // mientras que "screen" tiene throttle de 400ms y el panel cerraria tarde.
    //
    // REGLA 1 desde el otro lado: `flow` va "" con el panel principal abierto,
    // que es como la pagina se entera de que el que se ve es el inventario. El
    // `flow` de arriba ya viene con esa regla aplicada (pantallaVisible).
    var st = inputState();
    st.menu = anyVisible;
    st.flow = flow;

    // Que se le esta diciendo a la pagina, y como se cambio. Una linea por cambio,
    // latcheada, asi que no cuesta nada por frame.
    //
    // Esta aca, DESPUES de armar st, y no antes: la version anterior logueaba
    // pantallaVisible(), que es lo que el mod CREEE que deberia verse. Eso no es lo
    // que la pagina recibe, y la diferencia entre las dos cosas es el bug —
    // "se abrio el inventario" es exactamente el caso en que anyVisible es true y
    // el flujo es "". Con la variable equivocada en el log, el bug se veía limpio.
    //
    // La linea lleva las dos: lo que la pagina recibe (menu y flow) y la pantalla
    // que el mod cree. Cuando discrepan, se ve en la misma linea.
    var etiqueta = "menu=" + (st.menu ? 1 : 0) + " flow=\"" + flow + "\" (" + (visible || "nada") + ")";
    if (_lastVisible !== etiqueta) {
        log("[WebInterface] pagina: " + (_lastVisible || "(nada)") + " -> " + etiqueta);
        _lastVisible = etiqueta;
    }

    // La divergencia que rompe la REGLA 1, sale sola porque es la unica forma de
    // que la pagina muestre el inventario sin que nadie lo haya abierto: "hay
    // algo visible" pero el flujo visible es ninguno. Con las dos lineas de arriba
    // esto se ve, pero llega tarde —en el log del frame siguiente— y con el sintoma
    // de por medio. Sale aca, en el frame en que pasa.
    if (anyVisible && !flow && !_uiState.menuVisible) {
        log("[WebInterface] DIVERGE: hay menu visible pero ninguno en pantalla. " +
            "La pagina va a mostrar el inventario. anyMenuVisible()=" +
            anyMenuVisible() + " menuVisible=" + _uiState.menuVisible);
    }

    var sig = st.read + "|" + st.mode + "|" + st.keys + "|" + st.focus + "|" + st.anyMenu + "|" + st.flow;
    if (_lastUiState !== sig) {
        _lastUiState = sig;
        send("uistate", st);
    }

    // catalog: los datos estaticos (iconos, bandas, peso maximo). Se mandan una
    // sola vez, la primera vez que se abre el menu, y no en cada push: no
    // cambian, y mandarlos cada 400ms seria llenar un canal de 255 chars con
    // datos que la pagina ya tiene. Antes de mandarlos, la pagina muestra la
    // tabla sin iconos y sin el peso maximo, asi que el orden importa: primero
    // "uistate" (abre el panel), despues "catalog".
    if (anyVisible && !_catalogSent) {
        var catJson;
        try {
            catJson = JSON.stringify(snapCatalog());
        } catch (e) {
            log("[WebInterface] snapCatalogo fallo: " + e.message);
            catJson = null;
        }
        // El flag se levanta solo si la tanda salio completa: si fallo, se
        // reintenta al frame siguiente en vez de dejar la pagina sin iconos.
        if (catJson !== null) {
            _catalogSent = pushChunked("catalog", catJson);
        }
    }
}

// El snapshot del menu de proximidad abierto.
//
// Va aparte de "inv" y no se manda cuando no hay ninguno: el inventario se dibuja
// siempre que el panel esta abierto, pero el baul solo existe si el jugador esta
// parado al lado de un baul abierto. Mandar "screen" con null en cada push
// llenaria el canal de 255 chars con la palabra "null" cada 400ms.
//
// El throttle y el "solo si cambio" son los del inventario, y la razon de que
// importen mas aca es el tamano: el baul con dos listas de 12 filas es el payload
// mas pesado que se manda (unos 2.400 chars, 40 trozos) y no cambia salvo que el
// jugador mueva algo.
//
// El aviso se consulta DESPUES del throttle y se manda aunque los datos no hayan
// cambiado, que es justo el caso de "no cabe": ahi no se movio nada y sin esto el
// jugador no leeria nunca por que. Al reves —consumirlo antes de saber si el push
// sale— el throttle se lo comia.
//
// La comparacion de "cambio" es sin el aviso a proposito: si fuera con el, dos
// avisos seguidos (apretar dos veces el mismo boton que falla) darian el mismo
// json y el segundo no se veria.
function pushScreen(force) {
    var flow = currentFlow();
    if (!flow) return false;

    var now = Date.now();
    if (!force && now - _lastScreenAt < PUSH_MS) return false;
    _lastScreenAt = now;

    var snap = snapFlow();
    if (!snap) {
        // El menu esta abierto pero no hay snapshot. Sin esto se veia un panel
        // vacio y no habia nada en el log: el sintoma es "se ve el rectangulo sin
        // nada adentro", que no dice si fallo el push, el snapshot o el render.
        // Una vez por flujo, no cada 400ms.
        if (_sinSnapDe !== flow) {
            _sinSnapDe = flow;
            log("[WebInterface] " + flow + ": el menu esta visible pero snapFlow() dio null. " +
                "El panel se va a ver vacio. Revisar si el modulo publico su visibilidad antes " +
                "de tener datos (gsis_FlowSerialization.js).");
        }
        return false;
    }
    _sinSnapDe = null;

    var data = JSON.stringify(snap);
    if (data === _lastScreenData && !hasNotice()) return false;
    _lastScreenData = data;

    snap.notice = takeNotice();
    var json;
    try {
        json = JSON.stringify(snap);
    } catch (e) {
        log("[WebInterface] snapshot de flujo fallo: " + e.message);
        return false;
    }
    return pushChunked("screen", json);
}

var _lastScreenAt = 0;
// El json de los DATOS, sin el aviso. Ver el comentario de arriba.
var _lastScreenData = null;
// Que flujo dio null la ultima vez, para avisar una sola vez por apertura.
var _sinSnapDe = null;

// ---------------------------------------------------------------- PANTALLAS --
//
// REGLA 1 — una sola pantalla a la vez.
//
// El inventario y los cuatro menus de esfera son ventanas que ocupan el mismo
// lugar. Si hubiera dos abiertas, se taparian entre si y el jugador no sabria
// cual esta leyendo: el inventario abajo se apagaria solo al cerrarse el flujo, y
// la tecla que abria uno cerraria el otro sin querer.
//
// El que gana es el que YA esta abierto, por dos razones distintas:
//
//   - El panel principal se abre con una tecla y en cualquier parte. Si el
//     jugador aprieta I, quiere el inventario; que le aparezca una armeria
//     porque esta parado en la esfera seria lo contrario de lo que pidio.
//   - Un menu de esfera se abre con ESPACIO y solo con la esfera prendida. No
//     puede abrirse "desde arriba" —no hay I para sacarlo de arriba— y una vez
//     abierto tampoco se cancela desde el inventario: espera su turno, y cuando
//     el panel se cierra aparece.
//
// O sea: el panel principal tapa a los flujos, y con un flujo abierto el panel
// principal no se puede abrir. Las dos mitades estan en pantallaVisible() y en
// togglePanel().
//
// REGLA 2 — todos los menus son de pausa.
//
// El panel principal congela porque es un menu de pausa, y los de esfera
// ahora tambien: se abren con la tecla, se cierran con el Escape, y el jugador
// no se aleja para cerrar. Antes un menu de esfera NO congelaba —se cerraba
// alejandose, y congelado no se puede caminar— y en vez de congelar se le
// ponia el ancla. Ver la nota de REGLA 2 en broadcast() y el header de
// gsis_Input.js.
//
// Devuelve "inventario", el id del flujo, o "" si no hay nada en pantalla.
function pantallaVisible() {
    if (_uiState.menuVisible) {
        return "inventario";
    }
    return currentFlow();
}

// Abrir o cerrar el panel principal. Es la MISMA accion que llega por la tecla y
// por el comando ui:toggle de la pagina, asi que vive en una sola funcion: si
// cada camino decidiera por su cuenta, uno de los dos se desincroniza y la
// pagina hace algo distinto de lo que hace la tecla.
//
// El parametro "de" dice quien la llamo y va al log. No es decorativo: el panel
// principal tiene una sola puerta (esta funcion), asi que cuando aparece sin que
// nadie la haya pedido, el log tiene que poder decir quien lo pidio. Sin eso la
// pregunta "por que se abrio el inventario" no tiene respuesta.
function togglePanel(now, de) {
    if (now - _uiState.keyDebounce <= DEBOUNCE_MS) {
        return false;
    }
    if (_uiState.menuVisible) {
        log("[WebInterface] panel principal cerrado por " + de);
        closeMenu();
        return true;
    }
    var flow = currentFlow();
    if (flow) {
        // REGLA 1: con un flujo abierto la I no abre el inventario. Y no lo
        // "cierra" tampoco, porque no hay inventario abierto que cerrar.
        log("[WebInterface] toggle ignorado (" + de + "): hay un flujo abierto (" + flow + ")");
        return false;
    }
    log("[WebInterface] panel principal abierto por " + de);
    openMenu();
    return true;
}

// Abrir o cerrar un menu de esfera con la MISMA tecla (ESPACIO), igual que el
// panel principal con la I. Es la misma funcion para el camino de la tecla y para
// el comando "flow:toggle" de la pagina, por el mismo motivo que togglePanel: si
// cada camino decidiera por su cuenta, uno de los dos se desincroniza y la pagina
// hace algo distinto de lo que hace la tecla.
//
// El orden de las preguntas es el de "que esta en pantalla":
//
//   1. Hay un menu de esfera abierto → se cierra. No se mira donde esta el
//      jugador: si esta abierto, se cierra, y punto. Y la pulsacion que lo abrio
//      no cuenta, porque abrir y cerrar pasan por el mismo debounce (abajo).
//   2. El panel principal esta abierto → no se hace nada. El panel se abre con la
//      I y se cierra con la I o con Escape; la ESPACIO no lo toca, asi que no
//      hay forma de que un menu de esfera aparezca por debajo del inventario.
//   3. No hay nada abierto → se abre el menu de esfera que tenga al jugador
//      adentro (openFlow, que prueba los cuatro y gana el primero que puede).
//
// El debounce va con el del panel, no uno propio: las dos teclas se leen en el
// mismo frame y comparten el mismo reloj. Con dos relojes, la I y la ESPACIO
// presionadas juntas se comerian la una a la otra —la segunda en llegar seria
// descartada por el debounce de la primera— y dos menus cerrando en el mismo
// frame es la forma mas rapida de llegar a un estado imposible.
//
// Y el debounce es tambien lo que hace que la tecla que ABRE no cierre enseguida:
// el open es lo que queda despues, con el reloj puesto en now, asi que la segunda
// mitad de la misma pulsacion cae dentro de la ventana. Sin eso el menu duraria un
// frame, que es lo que se ve como un parpadeo.
function toggleFlow(now, de) {
    if (now - _uiState.keyDebounce <= DEBOUNCE_MS) {
        return false;
    }
    var flow = currentFlow();
    if (flow) {
        closeFlow();
        // El debounce tambien en el cierre, no solo en la apertura. La misma
        // pulsacion puede llegar por los dos caminos —el mod la ve por
        // GetAsyncKeyState y la pagina la manda por el comando—, y sin este reloj
        // puesto aca, la segunda mitad de la pulsacion abriria el menu de al lado:
        // el primero en cerrar es el que se lleva el menu, y el otro busca otro
        // punto donde abrir.
        _uiState.keyDebounce = now;
        log("[WebInterface] menu de " + flow + " cerrado por " + de);
        return true;
    }
    if (_uiState.menuVisible) {
        // REGLA 1 al reves: con el inventario en pantalla la ESPACIO no abre nada.
        return false;
    }
    var abierto = openFlow();
    if (!abierto) {
        // Nadie pudo abrir: el jugador no esta en ninguna esfera con la suya
        // prendida. No se avisa con un showTextBox porque la ESPACIO tambien es
        // saltar, y castigar el salto con un cartel en pantalla seria peor que no
        // decir nada. Ademas el menu de esfera tiene su hint en el panel.
        return false;
    }
    _uiState.keyDebounce = now;
    log("[WebInterface] menu de " + abierto + " abierto por " + de);
    return true;
}

// ------------------------------------------------------------------ TECLADO --
//
// Estas tres teclas son las unicas que se leen SIN supresion, y a proposito: son
// las que abren y cierran los menus, asi que tienen que funcionar justo cuando el
// menu esta visible, que es el unico momento en que interesan. La supresion de
// gsis_Input existe para los atajos del juego, no para el dueno del menu.
//
// Las tres se leen con rawKeyDown y el flanco lo arma este archivo
// (down && !_prev), no con keyJustPressed: el flanco del juego (Pad.IsKeyJustPressed)
// puede reportar la misma pulsacion dos frames seguidos, y una pulsacion que se ve
// dos veces abre y cierra el menu en el mismo instante. GetAsyncKeyState da false
// en cuanto el dedo suelta, haya pasado la tecla por el WndProc o no.
//
// Y hay una trampa que las atraviesa: cuando la pagina se queda con el teclado, el
// WndProc hace return 0 y el juego NUNCA ve ese WM_KEYDOWN. O sea que con el
// puntero encima de la UI, estas teclas dejan de existir para el mod y el menu no
// se puede cerrar desde aca. Antes eso no se notaba porque tampoco se podia saber
// que estaba pasando.
//
// La salida es el canal de retorno: la pagina manda "ui:close" / "ui:toggle" /
// "flow:toggle" con emit(), que no depende del input. Ese camino anda siempre.
// Estas tres teclas siguen sirviendo para el caso normal (menu recien abierto,
// puntero todavia afuera) y para cuando la pagina no tiene el teclado.
function pollKeys() {
    var now = Date.now();

    // El estado real va primero: decide si el resto de este frame tiene sentido.
    refreshInput();

    var keyI = rawKeyDown(KEYS.INVENTORY);
    var keySpace = rawKeyDown(KEYS.FLOW);
    var keyEsc = rawKeyDown(KEYS.ESC);

    var justI = keyI && !_prevKeyI;
    var justSpace = keySpace && !_prevKeySpace;
    var justEsc = keyEsc && !_prevKeyEsc;

    _prevKeyI = keyI;
    _prevKeySpace = keySpace;
    _prevKeyEsc = keyEsc;

    if (justI) {
        togglePanel(now, "tecla I");
    } else if (justSpace) {
        toggleFlow(now, "tecla ESPACIO");
    } else if (justEsc && now - _uiState.keyDebounce > DEBOUNCE_MS) {
        // El Escape cierra lo que se ESTA VIENDO, como el "ui:close" de la pagina:
        // el panel si esta abierto, y si no el menu de esfera. Los dos casos con el
        // mismo debounce, porque si no un Escape cerraria el panel en el frame en
        // que se abrio.
        if (_uiState.menuVisible) {
            closeMenu();
        } else {
            var cerrado = closeFlow();
            if (cerrado) log("[WebInterface] Escape cerro el menu de " + cerrado);
        }
    }

    // El estado se propaga TODOS los frames, no solo cuando cambia la tecla.
    // broadcast() esta latcheado por firma, asi que solo manda cuando algo del
    // estado difiere de verdad: el costo por frame es un isOpen() y un par de
    // comparaciones.
    //
    // Sin esto la I da vuelta menuVisible por dentro y no se lo dice a nadie:
    // el toggle queda muerto. Y como el primer frame siempre pasa (el latch
    // arranca en null), la pagina recibe el estado inicial apenas el browser
    // esta abierto, sin depender de ningun evento de la pagina.
    broadcast();

    // Los comandos se drenan con el menu CERRADO tambien, y no es un detalle:
    // "ui:toggle" es justamente el comando que reabre, asi que gatearlo por
    // menuVisible lo deja muerto por construccion. Antes no se notaba porque no
    // existia ningun comando que el menu cerrado pudiera mandar.
    //
    // El costo es un takeCommand() por frame con el menu cerrado. La pagina
    // visible esta siempre (el browser nunca se cierra), asi que en teoria
    // podria mandar algo en cualquier momento, y dejarlo accumulating en la cola
    // seria peor: se atenderian todas juntas en el frame que se abriera.
    var acted = dispatchCommands();

    // Los dos pushes, y con REGLA 1 son excluyentes por construccion: hay una
    // sola pantalla visible, asi que hay un solo snapshot que el panel que se ve
    // necesita. Pushar los dos seria pagar 10 a 14 trozos cada 400ms para algo
    // que nadie esta mirando. El baul no es la excepcion: su pane de la mochila
    // viene en "screen", no en "inv".
    //
    // Cada uno se auto limita por tiempo, asi que llamarlos cada frame no genera
    // trafico. pushScreen() sale en el primer return si no hay ningun flujo.
    if (_uiState.menuVisible) {
        pushInventory(acted);
    } else {
        pushScreen(acted);
    }

    // Cuando el flujo cambia, los dos caches de "solo si cambio" se limpian. Sin
    // esto, guardar algo en el baul deja el "inv" con el mismo JSON que ya se
    // mando, asi que no se reenvia, y al cerrarse el flujo el inventario del panel
    // se ve como estaba antes del guardado. El latch de datos se compara con el
    // ultimo enviado, no con el ultimo distinto.
    //
    // Los dos throttles tambien se limpian, por el mismo motivo de "se ve lo que
    // se manda": el panel aparece en el mismo frame en que llega el uistate, asi
    // que si el push del snapshot quedara throttleado se veria el rectangulo
    // vacido hasta 400ms. Un menu que acaba de abrir no espera.
    //
    // Usa _flowVisible y no currentFlow() a proposito. Son cosas distintas con
    // REGLA 1: si el panel principal esta abierto con un flujo esperando turno,
    // el flujo sigue abierto del lado del modulo pero NO es lo que se esta
    // mostrando, y limpiar sus caches seria tirar la info de un panel que nadie
    // esta mirando. _flowVisible es lo que broadcast() calculo este frame con la
    // misma regla que uso para decidir cual de los dos pushes va.
    if (_flowVisible !== _lastFlow) {
        _lastFlow = _flowVisible;
        _lastJson = null;
        _lastScreenData = null;
        _lastPush = 0;
        _lastScreenAt = 0;
        _sinSnapDe = null;
    }
}

var _lastFlow = "";
// Lo que broadcast() calculo este frame: hay algun menu visible Y el browser
// esta abierto. Lo usan los dos pushes, y es la unica diferencia con
// _uiState.menuVisible (el flag del panel principal).
var _anyVisible = false;
// El flujo que se esta MOSTRANDO, ya con la REGLA 1 aplicada: "" si lo que se ve
// es el inventario. Lo calcula broadcast() y lo leen los resets de throttle de
// pollKeys(). Vive aca y no como local de broadcast() porque lo necesitan dos
// funciones y duplicar el calculo es como se desincronizan.
var _flowVisible = "";
// La ultima pantalla que se le dijo a la pagina, para el log de transiciones de
// arriba. Arranca en "" y no en null a proposito: el log tiene que arrancar con
// "(nada) -> lo que sea", porque un null inicial haria que la primera pantalla no
// se registrara y ahi empieza justo el bug que se quiere ver.
var _lastVisible = "";

// ------------------------------------------------------------ COMANDOS DE LA PAGINA --
//
// Lado CLEO del canal que-described en el header. La pagina emite
// "cmd:<algo>" y el nombre llega encolado como "saweb:main:cmd:<algo>"; aca se
// saca con takeCommand(), que es un native() y por lo tanto anda.
//
// Se drena SIEMPRE, este frame, y no con throttle: un click que tarda 400ms en
// notarse se siente roto. El costo es una llamada nativa por frame con la
// pagina cerrada, que es lo unico que hace el trabajo.

function detectCommandChannel() {
    if (_canCommand !== null) {
        return _canCommand;
    }
    try {
        SAWeb.takeCommand(UI_ID);
        _canCommand = true;
        log("[WebInterface] canal de acciones activo (SAWeb v2)");
    } catch (e) {
        _canCommand = false;
        log("[WebInterface] canal de acciones NO disponible: " + e.message +
            " — la UI queda en solo lectura (hace falta SAWeb v2)");
    }
    return _canCommand;
}

// Devuelve true si se atendio al menos un comando, para forzar el push del
// inventario despues.
function dispatchCommands() {
    if (!detectCommandChannel()) {
        return false;
    }

    var acted = false;
    for (var i = 0; i < MAX_COMMANDS_PER_FRAME; i++) {
        var cmd = SAWeb.takeCommand(UI_ID);
        if (!cmd) {
            break;
        }
        if (handleCommand(cmd)) {
            acted = true;
        }
    }
    return acted;
}

var _unknownCmds = {};

function handleCommand(cmd) {
    var what = cmd && cmd.cmd;
    var id = cmd ? cmd.id : null;

        try {
            switch (what) {
                // v3: la pagina cierra el menu. Es el unico camino que anda
                // cuando la pagina se quedo con el teclado, porque en ese estado
                // el WndProc consume la tecla y el juego no la ve: el menu solo
                // se cerraba sacando el puntero de la UI.
                //
                // Cierra lo que se ESTA VIENDO, no lo que haya abierto: con el
                // panel principal abierto y un flujo esperando turno, el Escape
                // tiene que cerrar el inventario, no un menu que el jugador ni
                // esta mirando. Es la misma regla 1 que decide que pantalla se
                // ve, y por eso usa pantallaVisible().
                //
                // El debounce va aca tambien. Sin el, cerrar con Escape desde la
                // pagina y la I del mod en el mismo frame seanhacian y el menu
                // cierra y abre.
                case "ui:close":
                    if (Date.now() - _uiState.keyDebounce <= DEBOUNCE_MS) return false;
                    if (_uiState.menuVisible) {
                        closeMenu();
                        log("[WebInterface] la pagina cerro el menu");
                        return true;
                    }
                    var cerrado = closeFlow();
                    if (cerrado) {
                        log("[WebInterface] la pagina cerro el flujo " + cerrado);
                        return true;
                    }
                    return false;

                 // La I de la pagina. Es la misma accion que la tecla del mod, y va
                 // por la misma funcion: si cada camino decidiera por su cuenta,
                 // uno de los dos terminaria abriendo algo que el otro prohibe.
                 case "ui:toggle":
                     if (!togglePanel(Date.now(), "comando ui:toggle")) return false;
                     return true;

                 // La ESPACIO de la pagina, para los menus de esfera. Existe por lo
                 // mismo que "ui:close": cuando la pagina se queda con el teclado el
                 // WndProc consume la tecla y el mod no la ve, asi que sin este
                 // camino el toggle de la ESPACIO solo funcionaria con el puntero
                 // afuera de la UI.
                 //
                 // El debounce de toggleFlow es lo que hace que las dos mitades no
                 // se cancelen: con el teclado en la pagina, el mod igual lee la
                 // tecla por GetAsyncKeyState, asi que la misma pulsacion llega por
                 // los dos caminos. La segunda cae dentro de la ventana.
                 case "flow:toggle":
                     if (!toggleFlow(Date.now(), "comando flow:toggle")) return false;
                     return true;

                // La pagina reporta que le llego y que quedo en el DOM. No es una
                // accion: no cambia nada, se loguea y se sigue.
                //
                // Existe porque la pagina era ciega para diagnosticar: sus _diag()
                // van a console.log y el runtime no captura OnConsoleMessage, asi
                // que no quedan en ningun archivo. Con el mod diciendo "menu=0" y
                // la pagina mostrando un panel, los dos lados tienen que estar en el
                // mismo log; si no, la contradiccion se busca a ciegas.
                //
                // "hidden" es el que sirve: es la clase que REALMENTE quedo en el
                // DOM, no la que se pidio. El bug del panel que no se apagaba era
                // dos funciones peleandose por la misma clase, y eso solo se
                // diferencia mirando el resultado.
                case "ui:diag":
                    // Los campos vienen en `cmd`, no en un `data`: handleCommand
                    // declara `what` e `id` y nada mas, asi que leer `data` era un
                    // ReferenceError tragado por el catch de abajo — el canal de
                    // diagnostico nunca se emitio.
                    log("[WebInterface] pagina dice: " + (cmd && cmd.dice) +
                        " flow=\"" + (cmd && cmd.flow) + "\"" +
                        " menu=" + (cmd && cmd.menu) +
                        " #panel" + (cmd && cmd.hidden ? " OCULTO" : " VISIBLE"));
                    return false;

                case "inv:equip":
                if (!id) return false;
                equipWeapon(id);
                log("[WebInterface] equipó " + id);
                return true;

            case "inv:unequip":
                if (cmd.slot === undefined || cmd.slot === null) return false;
                unequipWeapon(parseInt(cmd.slot, 10));
                log("[WebInterface] desequipó el slot " + cmd.slot);
                return true;

            case "inv:belt":
                if (!id) return false;
                equipMagToBelt(id);
                log("[WebInterface] cargador al cinturón: " + id);
                return true;

            // El camino de vuelta del cinturon. No estaba: unequipBeltMag ya
            // existia pero nadie la llamaba, asi que un cargador equipado no
            // tenia forma de volver al inventario desde la pagina. La pagina lo
            // manda con slot = indice de casilla, no con id, porque en el
            // cinturon puede haber dos cargadores del mismo tipo y la casilla es
            // lo unico que las distingue.
            case "inv:belt:off":
                if (cmd.slot === undefined || cmd.slot === null) return false;
                unequipBeltMag(parseInt(cmd.slot, 10));
                log("[WebInterface] cargador fuera del cinturón: casilla " + cmd.slot);
                return true;


            case "inv:drop":
                if (!id) return false;
                //qty viene del boton "tirar": 1 por defecto, o lo que pida la
                // pagina. removeItem es el unico que saca de verdad.
                removeItem(id, cmd.qty ? parseInt(cmd.qty, 10) : 1);
                log("[WebInterface] tirar " + id);
                return true;

            // ------------------------------------------------------------- FLUJOS --
            //
            // Los cuatro menus de proximidad. Cada caso es una linea: el
            // prechequeo de peso, el aviso y la validacion viven en el modulo
            // owner (putInTrunk, doOffer, collectItem), no aca.
            //
            // Eso es lo que hace que el modulo tenga que ser el que valida: la
            // pagina ve un snapshot que tiene hasta 400ms. Si el peso lo
            // calculara la pagina, su respuesta seria la de hace un snapshot.
            //
            // El clearNotice() del principio no es cosmetico: un comando que
            // vuelve temprano (payload invalido) no escribe aviso, y si el
            // anterior seguiera pendiente la pagina repetiria el mensaje viejo
            // como si fuera la respuesta de este.

            case "trunk:put":
            case "trunk:take":
                if (!id) return false;
                if (what === "trunk:put") {
                    putInTrunk(id, cmd.qty);
                } else {
                    takeFromTrunk(id, cmd.qty);
                }
                log("[WebInterface] baul: " + what + " " + id + " x" + cmd.qty);
                return true;

            case "dealer:add":
                if (!id) return false;
                clearNotice();
                addToCart(id, cmd.qty);
                log("[WebInterface] carrito +" + (cmd.qty || 1) + " " + id);
                return true;

            // Quitar de la lista del carrito (el pane derecho de la armeria).
            // Mismo esquema que dealer:add: el modulo decide si habia algo que
            // sacar, y el aviso lo escribe el (ver removeFromCart / setNotice).
            case "dealer:cart:remove":
                if (!id) return false;
                clearNotice();
                removeFromCart(id, cmd.qty);
                log("[WebInterface] carrito -" + (cmd.qty || 1) + " " + id);
                return true;

            case "dealer:cart:clear":
                clearNotice();
                resetCart();
                log("[WebInterface] carrito vaciado");
                return true;

            case "dealer:checkout":
                clearNotice();
                checkout();
                log("[WebInterface] carrito pagado");
                return true;

            case "pickup:take":
                clearNotice();
                if (!id) return false;
                collectItem(id, cmd.qty);
                log("[WebInterface] retiro " + id + " x" + cmd.qty);
                return true;

            case "pickup:takeAll":
                clearNotice();
                collectAll();
                log("[WebInterface] retiro de todo el pedido");
                return true;

            case "pickup:cancel":
                // clearNotice() SI va, aunque no haya id que validar: cancelOrder
                // escribe su propio aviso (cancelado / no hay pedido), y sin
                // limpiar el aviso anterior de la pantalla sobrevive a este
                // comando y la pagina lo repite como si fuera la respuesta.
                clearNotice();
                cancelOrder();
                log("[WebInterface] cancelacion del pedido pendiente");
                return true;

            case "seller:offer":
                if (!id) return false;
                doOffer(id, cmd.qty, cmd.price);
                log("[WebInterface] oferta " + id + " x" + cmd.qty + " a " + cmd.price);
                return true;

            default:
                if (!_unknownCmds[String(what)]) {
                    _unknownCmds[String(what)] = true;
                    log("[WebInterface] comando desconocido: " + JSON.stringify(cmd));
                }
                return false;
        }
    } catch (e) {
        // Un comando que revienta no puede llevarse por delante el loop: se
        // loguea y el frame sigue.
        log("[WebInterface] comando '" + what + "' fallo: " + e.message);
        return false;
    }
}

// ------------------------------------------------------------------- INIT --

function initWebInterface() {
    log("[WebInterface] Bridge CLEO <-> " + UI_ID + " inicializado");
    log("[WebInterface] Tecla " + String.fromCharCode(KEYS.INVENTORY) + " abre/cierra, ESC cierra");
    log("[WebInterface] Tecla " + String.fromCharCode(KEYS.FLOW) +
        " (espacio) abre y cierra los menus de esfera, parado adentro de la esfera");
    try {
        log("[WebInterface] isOpen('" + UI_ID + "') -> " + SAWeb.ui.isOpen(UI_ID));
    } catch (e) {
        log("[WebInterface] isOpen fallo: " + e.message);
    }
    detectCommandChannel();
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
// CUANDO SE EMPUJA. No cada frame: la UI anterior leia getItems() en vivo
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

// Solo se loguea la primera tanda de cada canal y solo si algo va mal. Asi el
// log dice si el transporte funciona sin llenarse de ruido.
var _diag = { primera: {}, fallos: 0 };

function _diagSend(name, i, total, dataJson, ok) {
    if (ok) {
        return;
    }
    if (_diag.fallos < 3) {
        _diag.fallos++;
        log("[WebInterface] send('" + name + "', " + i + "/" + total + ") fallo. dataJson=" + dataJson.length + " chars");
    }
}

// Trocea y manda un JSON ya serializado. El sobre es el mismo para todos los
// canales ({i, n, d}) y la pagina reensambla igual, asi que agregar un canal
// troceado no obliga a tocar el otro. Devuelve true si salieron todos los trozos.
//
// El troceado no es opcional: el limite de 255 chars es del comando, no de la
// frecuencia. Mandarlo entero una sola vez no lo esquiva. El catalogo son ~1440
// chars (45 iconos + 3 bandas) y sin trocear llegaba cortado al parser.
function pushChunked(name, json) {
    var total = Math.max(1, Math.ceil(json.length / PUSH_CHUNK));
    var ok = true;

    for (var i = 0; i < total; i++) {
        var piece = { i: i, n: total, d: json.substr(i * PUSH_CHUNK, PUSH_CHUNK) };
        if (!send(name, piece)) {
            _diagSend(name, i, total, JSON.stringify(piece).length, false);
            ok = false;
        }
    }

    // La primera tanda de cada canal se loguea, y solo si salió bien: es lo que
    // dice si el transporte funciona sin llenarse de ruido.
    if (ok && !_diag.primera[name]) {
        _diag.primera[name] = true;
        log("[WebInterface] " + name + ": " + json.length + " chars en " + total + " chunks");
    }
    return ok;
}

// force saltea el throttle de PUSH_MS: se usa despues de una accion de la
// pagina, donde esperar 400ms a ver el resultado se siente roto. El throttle
// existe para no pagar el stringify en cada frame con el menu abierto, no para
// retrasar la reaction a un click.
function pushInventory(force) {
    var now = Date.now();
    if (!force && now - _lastPush < PUSH_MS) {
        return;
    }
    _lastPush = now;

    var json;
    try {
        json = JSON.stringify(snapInventory());
    } catch (e) {
        log("[WebInterface] snapInventory fallo: " + e.message);
        return;
    }

    // Solo si cambio. Un menu abierto en el juego no genera trafico.
    if (json === _lastJson) {
        return;
    }
    _lastJson = json;

    pushChunked("inv", json);
}

// ------------------------------------------------------------------- REGISTRO --

register({
    name: "WebInterface",
    init: initWebInterface,
    update: pollKeys
});
