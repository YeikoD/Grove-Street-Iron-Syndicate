// GSIS - UI: index
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El modulo de la UI: cuando se registra, que se manda a la pagina cada frame,
// y que teclas abren y cierran menus.
//
// Antes era modules/ui/index.js, un archivo de 1122 lineas que mezclaba
// el transporte con el estado con la tabla de comandos. La division es por lo que
// cambia junto:
//
//   bridge.js    el cable con el runtime de la pagina. Cambia si el runtime
//                cambia; nadie mas se entera.
//   commands.js  que significa cada verbo de la pagina. Cambia si la pagina
//                agrega un boton.
//   views/       los snapshots que la pagina dibuja. Cambian si cambia lo que
//                la pagina dibuja, y no tocan nada del resto.
//   index.js     esto. Cambia si cambia el ciclo de vida del modulo.
//
// ============================================================================
// EL MODELO, QUE NO CAMBIO
// ============================================================================
// La UI es una pagina web, dibujada con el runtime SAWebUI (CEF). Antes lo era
// con un framework de ventanas nativo.
//
// Modelo de dos niveles, igual que el UIManager:
//   - El bridge es dueno del estado de visibilidad. La pagina solo refleja.
//   - El browser NUNCA se cierra. Se oculta y se muestra la seccion con
//     .hidden, asi el DOM sigue vivo y el tick() sigue corriendo a 60fps.
//
// Orden de imports: este archivo va DESPUES de Trunk / WeaponDealer /
// DealerPickup / WeaponSeller en gsis_index.js, porque el orden de imports es el
// orden de updateAll(). Asi los flags de este frame ya estan calculados cuando
// el bridge los lee.
//
// QUE TECLA ABRE QUE. Es una sola tabla y un solo despacho, resolverTecla().
//
//   MENU CERRADO                  MENU ABIERTO
//   --------------------------    --------------------------
//   I     -> inventario           I     -> (REGLA 1: no abre nada)
//   SPACE -> abrir flujo          INTRO -> (la pagina acepta la fila)
//   INTRO -> abrir flujo          F     -> cerrar
//   F     -> abrir flujo          ESC   -> cerrar
//
// Los cuatro menus de esfera (baul, armeria, retiro, trueque) abren con tres
// teclas y por UNA sola funcion, abrirFlujo(): no son tres caminos de apertura,
// es uno con tres teclas. El unico que cambia entre los cuatro es la esfera
// donde esta parado el jugador —el resto es el panel de inventario con otra
// lista— asi que el gesto se unifica y la condicion no.
//
// Y ninguno de los tres CIERRA. El cierre es F o ESC, en los cinco menus. Una
// tecla que abre y cierra hace que el jugador aprenda dos reglas por tecla en
// vez de una, y el error de ese segundo sentido es un menu que se abre solo.
//
// F es la unica con doble sentido, y por eso su despacho pregunta PRIMERO si hay
// un menu visible: si lo hay, cierra; solo si no hay nada busca una esfera para
// abrir. Un F con el menu abierto no puede reabrir.
//
// Por que las teclas las lee el bridge y no cada modulo: si los cuatro leyeran
// la suya, la pulsacion que abre un menu seria vista por todos en el mismo frame,
// y el primero que la consumiera se la sacaria al resto. Con un dueno solo, la
// pulsacion se gasta una vez en una decision.
//
// La I con un menu de esfera abierto no abre el inventario (REGLA 1), y el SPACE
// con el inventario abierto tampoco. La pagina manda "ui:toggle" con la I,
// "flow:open" con SPACE e INTRO y "ui:close" con F y ESC, o sea que los dos
// caminos de cada tecla pasan por las mismas funciones que la tecla del mod.
//
// Todos los menus congelan al jugador, esconden el radar y le dan el teclado a
// la pagina.
// ============================================================================

import { register } from "../../core/gsis_ModuleRegistry.js";
import { KEYS, MISC } from "../../core/gsis_Config.js";
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
} from "../../core/gsis_Input.js";
import { hasNotice, takeNotice } from "../../core/gsis_Notice.js";

import { UI_ID, send, pushChunked, canCommand, drainCommands, isOpen as isBrowserOpen } from "./bridge.js";
import { handleCommand } from "./commands.js";
import { snapInventory } from "./views/inventory.js";
import { snapCatalog } from "./views/catalog.js";
import { currentFlow, closeFlow, openFlow, snapFlow } from "./views/flow.js";

// El brake de pulsaciones. Comparte reloj con TODOS los comandos de teclado, y por
// eso es UNO: con dos relojes, la I y el F presionadas juntas se comerian la una a
// la otra —la segunda en llegar seria descartada por el debounce de la primera— y
// dos menus cerrando en el mismo frame es la forma mas rapida de llegar a un
// estado imposible.
var DEBOUNCE_MS = 200;

var _uiState = {
    menuVisible: false,
    keyDebounce: 0
};

// El estado sostenido de cada tecla del contrato, para armar el flanco. El flanco
// lo arma ESTE archivo (down && !_prev) y no keyJustPressed: el flanco del juego
// (Pad.IsKeyJustPressed) puede reportar la misma pulsacion dos frames seguidos, y
// una pulsacion que se ve dos veces abre y cierra el menu en el mismo instante.
var _prev = {};

// Las teclas del contrato, en la forma que las lee el despacho. El arreglo es la
// unica declaracion del contrato de teclado en el lado del mod: resolverTecla()
// lo recorre, y las paginas de la UI (app.js) tienen el espejo de esta tabla.
//
//   abrir   con el menu cerrado, por abrirFlujo() — una sola funcion para tres teclas
//   cerrar  con el menu abierto, por cerrarVisible() — una sola para dos
//   panel   el inventario, con su propio toggle porque es el unico que no depende
//           de una esfera
var TECLAS = {
    panel: { vk: KEYS.INVENTORY, nombre: "tecla I" },
    abrir: [
        { vk: KEYS.FLOW, nombre: "tecla ESPACIO" },
        { vk: KEYS.ENTER, nombre: "tecla INTRO" },
        { vk: KEYS.F, nombre: "tecla F" }
    ],
    cerrar: [
        { vk: KEYS.F, nombre: "tecla F" },
        { vk: KEYS.ESC, nombre: "tecla ESC" }
    ]
};

// Firma de lo ultimo propagado a la pagina. Sirve de latch: sin esto habria que
// mandar el estado cada frame y se taparia la cola de 256. Es una firma y no el
// objeto porque inputState() devuelve una copia nueva en cada llamada.
var _lastUiState = null;

// Ultimo valor enviado a Hud.DisplayRadar. Mismo latch que el de arriba.
var _lastRadar = false;

// El catalogo se manda una vez por sesion de UI. El flag se pone solo si el
// pushChunked() devolvio true: si fallo, se reintenta en el proximo frame en vez
// de dejar la pagina sin iconos para siempre.
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
            log("[UI] no se pudo cambiar el radar: " + e2.message);
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
        browserOpen = isBrowserOpen();
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
    //   - el bloqueo del mouse (setMenuGameMouse) AHORA SE PONE EN TRUE, y antes
    //     pasaba en false. La razon de antes ("congelado no hay a quien pegarle") era
    //     correcta para el golpe, pero se equivocaba en lo que de verdad lo
    //     rompia: SET_PLAYER_CONTROL al reves CONGELA al jugador y NO suelta el
    //     mouse. El juego sigue leyendo los deltas del mouse para la camara, y eso
    //     es lo que|centeriza el cursor del sistema: el jugador abria el panel, movia
    //     el mouse y este volvia solo al centro, sin poder clickear nada fuera de ahi.
    //
    //     El bloqueo del mouse de la ASI (SAWEB_SET_GAME_MOUSE_BLOCK) pone en cero
    //     CPad::NewMouseControllerState y PCTempMouseControllerState, que son
    //     justamente los deltas que mueven la camara, y ademas pone
    //     bDisablePlayerFireWeapon para que el click no dispare. O sea que hace
    //     las dos cosas que se le pedian.
    //
    //     Y NO ciega a la pagina: la UI no lee el mouse de DirectInput, lo lee de
    //     WM_MOUSEMOVE, que es un mensaje de ventana. El bloqueo solo toca
    //     DirectInput y el pad, asi que el cursor de la pagina se sigue moviendo
    //     normal. Eso se verifico en el source de la ASI antes de tocar aca.
    //
    // Las cuatro tienen su latch: mandan una vez el cambio y despues no vuelven a
    // tocar la ASI.
    setMenuCursor(anyVisible);
    setMenuGameState(anyVisible);
    setMenuKeyPassthrough(null);
    setMenuGameMouse(anyVisible);
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
    // pantallaVisible(), que es lo que el mod CREE que deberia verse. Eso no es lo
    // que la pagina recibe, y la diferencia entre las dos cosas es el bug —
    // "se abrio el inventario" es exactamente el caso en que anyVisible es true y
    // el flujo es "". Con la variable equivocada en el log, el bug se veía limpio.
    //
    // La linea lleva las dos: lo que la pagina recibe (menu y flow) y la pantalla
    // que el mod cree. Cuando discrepan, se ve en la misma linea.
    var etiqueta = "menu=" + (st.menu ? 1 : 0) + " flow=\"" + flow + "\" (" + (visible || "nada") + ")";
    if (_lastVisible !== etiqueta) {
        log("[UI] pagina: " + (_lastVisible || "(nada)") + " -> " + etiqueta);
        _lastVisible = etiqueta;
    }

    // La divergencia que rompe la REGLA 1, sale sola porque es la unica forma de
    // que la pagina muestre el inventario sin que nadie lo haya abierto: "hay
    // algo visible" pero el flujo visible es ninguno. Con las dos lineas de arriba
    // esto se ve, pero llega tarde —en el log del frame siguiente— y con el sintoma
    // de por medio. Sale aca, en el frame en que pasa.
    if (anyVisible && !flow && !_uiState.menuVisible) {
        log("[UI] DIVERGE: hay menu visible pero ninguno en pantalla. " +
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
            log("[UI] snapCatalog fallo: " + e.message);
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
            log("[UI] " + flow + ": el menu esta visible pero snapFlow() dio null. " +
                "El panel se va a ver vacio. Revisar si el modulo publico su visibilidad antes " +
                "de tener datos (ui/views/flow.js).");
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
        log("[UI] snapshot de flujo fallo: " + e.message);
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
        log("[UI] panel principal cerrado por " + de);
        closeMenu();
        return true;
    }
    var flow = currentFlow();
    if (flow) {
        // REGLA 1: con un flujo abierto la I no abre el inventario. Y no lo
        // "cierra" tampoco, porque no hay inventario abierto que cerrar.
        log("[UI] toggle ignorado (" + de + "): hay un flujo abierto (" + flow + ")");
        return false;
    }
    log("[UI] panel principal abierto por " + de);
    openMenu();
    return true;
}

// ABRIR un menu de esfera. Es el UNICO camino de apertura de los cuatro, y lo
// comparten tres teclas (ESPACIO, INTRO y F): tres teclas, una funcion. No son tres
// caminos que TIENEN que terminar en el mismo lado —son el mismo camino, con tres
// nombres.
//
// No cierra nada. Ese es el otro medio del contrato: el cierre es F o ESC, por
// cerrarVisible(). Si esta funcion cerrara, el F —que es la tecla de cierre—
// cerraria al abrir, y el menu duraria un frame.
//
// El debounce va con el del panel, no uno propio: todas las teclas se leen en el
// mismo frame y comparten el mismo reloj. Y es tambien lo que hace que la tecla
// que ABRE no actue de nuevo enseguida: el open es lo que queda despues, con el
// reloj puesto en now, asi que la segunda mitad de la misma pulsacion cae dentro
// de la ventana. Sin eso el menu duraria un frame, que es lo que se ve como un
// parpadeo.
function abrirFlujo(now, de) {
    if (now - _uiState.keyDebounce <= DEBOUNCE_MS) {
        return false;
    }
    // REGLA 1 al reves: con el inventario en pantalla ninguna de las tres teclas
    // abre nada. El inventario se abre con la I y se cierra con la I, con F o con
    // ESC, asi que no hay forma de que un menu de esfera aparezca por debajo.
    if (_uiState.menuVisible) {
        return false;
    }
    // openFlow() prueba los cuatro en el orden de FLUJOS y gana el primero que
    // puede. Cada modulo decide si puede desde su openXMenu(), con su propia idea
    // de "cerca" y su propio estado para dejar listo al abrir.
    var abierto = openFlow();
    if (!abierto) {
        // Nadie pudo abrir: el jugador no esta en ninguna esfera con la suya
        // prendida. No se avisa con un showTextBox porque la ESPACIO tambien es
        // saltar, y castigar el salto con un cartel en pantalla seria peor que no
        // decir nada. Ademas el menu de esfera tiene su hint en el panel.
        return false;
    }
    _uiState.keyDebounce = now;
    log("[UI] menu de " + abierto + " abierto por " + de);
    return true;
}

// CERRAR lo que se esta viendo: el panel si esta abierto, y si no el menu de
// esfera. Es el UNICO camino de cierre de los cinco menus, y lo comparten F y ESC.
//
// Cierra "lo que se ve", no "lo que haya abierto": es la misma regla 1 que decide
// que pantalla se ve (pantallaVisible), y por eso usa la misma funcion que ella.
// Con el panel abierto y un flujo esperando turno, el F tiene que cerrar el
// inventario, no un menu que el jugador ni esta mirando.
//
// El debounce va en el CIERRE tambien, no solo en la apertura: la misma pulsacion
// puede llegar por los dos caminos —el mod la ve por GetAsyncKeyState y la pagina
// la manda por el comando— y sin este reloj puesto aca, la segunda mitad de la
// pulsacion abriria otra vez lo recien cerrado.
function cerrarVisible(now, de) {
    if (now - _uiState.keyDebounce <= DEBOUNCE_MS) {
        return false;
    }
    if (_uiState.menuVisible) {
        log("[UI] panel principal cerrado por " + de);
        closeMenu();
        _uiState.keyDebounce = now;
        return true;
    }
    var flow = currentFlow();
    if (!flow) {
        // No hay nada que cerrar. No es un error: el F es la misma tecla que abre,
        // asi que llega aqui con el juego, con el inventario cerrado y sin ninguna
        // esfera alrededor. Lo que tiene que hacer en ese caso es ABRIR, y eso lo
        // decide el despacho (resolverTecla), no esta funcion.
        return false;
    }
    closeFlow();
    _uiState.keyDebounce = now;
    log("[UI] menu de " + flow + " cerrado por " + de);
    return true;
}

// EL DESPACHO. La tabla de prioridad del contrato, escrita en el mismo orden en que
// se ejecuta, para que se pueda leer contra la documentacion sin traducir.
//
//   1. Con un menu VISIBLE:
//        ESC -> cerrarVisible()          el de mayor prioridad, como el de siempre
//        F   -> cerrarVisible()          el segundo, con el MISMO camino que el ESC
//        (INTRO y SPACE no hacen nada aca: con el menu abierto el INTRO lo
//        atiende la pagina —es la tecla de aceptar— y la ESPACIO ya no cierra)
//
//   2. Sin menu visible:
//        I     -> togglePanel()         el inventario
//        SPACE -> abrirFlujo()
//        INTRO -> abrirFlujo()
//        F     -> abrirFlujo()
//
// El punto 1.2 es la regla de la doble funcion de F, y esta escrito como esta a
// proposito: la pregunta "¿hay un menu visible?" va PRIMERO y en un solo lugar. Si
// cada tecla preguntara por su cuenta, el F terminaria cerrando y despues
// buscando una esfera para abrir en el mismo frame, y el menu cerraria y abriria
// solo. El F solo llega a abrirFlujo() cuando no hay nada abierto.
function resolverTecla(now) {
    // PRIMERO se leen TODAS las teclas del contrato, y solo despues se decide.
    //
    // El orden importa y no es cosmetico. Si cada tecla se leyera en el momento de
    // usarla, el estado del frame anterior de las teclas NO usadas quedaria viejo,
    // y de ahi sale un fallo que no se ve: el jugador llega a un menu con el INTRO
    // apretado (nada que ver con la apertura, el INTRO no abre si hay menu), lo
    // cierra con el ESC, y al frame siguiente el INTRO se lee como recien
    // apretado y le reabre el menu que acababa de cerrar. Leyendo todo primero, el
    // _prev de cada tecla esta siempre al dia y un menu recien cerrado no se
    // reabre solo por una tecla que el jugador venia manteniendo.
    var pulsadas = _leerTeclas();

    var panelAbierto = _uiState.menuVisible;
    var flowAbierto = panelAbierto ? "" : currentFlow();

    // 1. Hay un menu en pantalla: se cierra con F o con ESC.
    if (panelAbierto || flowAbierto) {
        for (var i = 0; i < TECLAS.cerrar.length; i++) {
            if (pulsadas[TECLAS.cerrar[i].vk]) {
                return cerrarVisible(now, TECLAS.cerrar[i].nombre);
            }
        }
        return false;
    }

    // 2. No hay nada en pantalla: la I es del inventario, y las tres de abrir van
    // por la misma funcion.
    if (pulsadas[TECLAS.panel.vk]) {
        return togglePanel(now, TECLAS.panel.nombre);
    }
    for (var j = 0; j < TECLAS.abrir.length; j++) {
        if (pulsadas[TECLAS.abrir[j].vk]) {
            return abrirFlujo(now, TECLAS.abrir[j].nombre);
        }
    }
    return false;
}

// El estado SOSTENIDO de cada tecla del contrato, y el estado anterior de cada una.
// Se devuelven los flancos (una bajada de "no apretada" a "apretada" en este frame),
// indexados por VK, porque el indice es el contrato: las teclas son DATOS de TECLAS,
// no codigo, y asi agregar una es agregar una linea a esa tabla.
//
// El flanco lo arma ESTE archivo y no keyJustPressed: el flanco del juego
// (Pad.IsKeyJustPressed) puede reportar la misma pulsacion dos frames seguidos, y
// una pulsacion que se ve dos veces abre y cierra el menu en el mismo instante.
function _leerTeclas() {
    var pulsadas = {};
    pulsadas[TECLAS.panel.vk] = _flanco(TECLAS.panel.vk);
    for (var i = 0; i < TECLAS.abrir.length; i++) {
        pulsadas[TECLAS.abrir[i].vk] = _flanco(TECLAS.abrir[i].vk);
    }
    for (var j = 0; j < TECLAS.cerrar.length; j++) {
        pulsadas[TECLAS.cerrar[j].vk] = _flanco(TECLAS.cerrar[j].vk);
    }
    return pulsadas;
}

function _flanco(vk) {
    var down = rawKeyDown(vk);
    var prev = _prev[vk] === true;
    _prev[vk] = down;
    return down && !prev;
}

// ============================================================ LA X NO LA VE LA PAGINA ==
//
// POR QUE ESTA FUNCION EXISTE
// ----------------------------
// La X es la accion principal de la fila, y la decides en la PAGINA: el registro
// ACCIONES, `actionFor` y la fila elegida son todos de app.js. Si la X llegara
// hasta alla, no haria falta nada de esto.
//
// No llega. El runtime de la pagina tiene una lista de teclas que manda al JUEGO
// en vez de a la pagina, y la X esta en ella. Se ve en el log del CEF:
//
//   SAWeb tecla UI abierta: VK=88 bajada (passthrough)
//
// Y no es una lista que el mod pueda vaciar: `setMenuKeyPassthrough(null)` se
// llama todos los frames desde broadcast() y el runtime lo aplica —"SAWeb key
// passthrough: 0 tecla(s)", 348 veces en el log— y las teclas siguen yendo al
// juego. O sea que el comando escribe una lista y el log lista de otra, y la que
// manda es la segunda. Las que manda al juego incluyen la X, la R, la D, la T y
// las flechas; las que si ve la pagina incluyen W, S, A, ESPACIO, I, ESC, INTRO.
//
// Por eso la X va por el camino del puente, que es el dueno de las teclas de menu
// (ver gsis_INPUT.md 4.1) y las lee con `rawKeyDown`, igual que I, ESPACIO y ESC:
// el mod la ve, y se la reenvia a la pagina con el tiempo que estuvo apretada.
//
// QUE NO HACE ESTO
// -----------------
// No decide que hacer con la X, no mira el inventario, y no sabe si lo que hay a la
// vista es el panel o un menu de esfera. Todo eso lo decide la pagina, que es
// donde vive ACCIONES. Este archivo solo dice "la X bajo" y "la X subo tras N ms".
//
// LAS DOS MEDIDAS NO SE DUPLICAN
// ------------------------------
// La pagina puede ver la X en el preview —sin puente no hay runtime que la
// retenga— y en el juego no la ve. Si las dos llegaran, la accion se correria dos
// veces. No puede: `armarX`/`resolverX` son idempotentes, la segunda llamada
// encuentra `_xDownAt` en 0 o `_xFired` en true y no hace nada. Por eso la pagina
// comparte las dos mitades entre su teclado y este canal, en vez de tener dos
// copias de la logica.
//
// Cuando no hay nada en pantalla no se reenvia: la X no es de este mod con los
// menus cerrados, y el `ms` de un reenvia con el panel cerrado haria que la pagina
// resolviera una fila que no esta a la vista.
var _xAbajo = false;
var _xDesde = 0;

function reenviarX(now) {
    var down = rawKeyDown(KEYS.ACTION);

    if (down !== _xAbajo) {
        _xAbajo = down;
        if (!(_uiState.menuVisible || currentFlow())) {
            // Bajo o subio, pero no hay nada a la vista: se olvida el reloj y no
            // se manda nada. Sin esto, abrir el panel con la X todavia apretada
            // mandaria un "up" con el tiempo de la pulsacion anterior.
            _xDesde = 0;
            return;
        }
        if (down) {
            _xDesde = now;
            send("x", { fase: "down" });
        } else {
            var ms = _xDesde ? now - _xDesde : 0;
            _xDesde = 0;
            send("x", { fase: "up", ms: ms });
            // La pagina va a ejecutar algo —equipar, llenar, tirar— y eso cambia el
            // inventario. El latch de "solo si cambio" compararia el JSON nuevo
            // contra el viejo y lo mandaria, pero el THROTTLE lo comeria: el cambio
            // se veria hasta 400 ms despues, y para una accion que el jugador acaba
            // de hacer se siente roto.
            //
            // Por eso el throttle es lo unico que se limpia. El `_lastJson` no se
            // toca a proposito: limpiarlo haria que se mande un snapshot aunque la
            // accion no haya movido nada —el caso de un "Tirar" que el modulo
            // rechaza— y se veria el panel redibujarse sin motivo.
            _lastPush = 0;
        }
    }
}

// ------------------------------------------------------------------ TECLADO --
//
// Estas teclas son las unicas que se leen SIN supresion, y a proposito: son
// las que abren y cierran los menus, asi que tienen que funcionar justo cuando el
// menu esta visible, que es el unico momento en que interesan. La supresion de
// gsis_Input existe para los atajos del juego, no para el dueno del menu.
//
// Se leen con rawKeyDown y el flanco lo arma este archivo (down && !_prev), no con
// keyJustPressed: el flanco del juego (Pad.IsKeyJustPressed) puede reportar la
// misma pulsacion dos frames seguidos, y una pulsacion que se ve dos veces abre y
// cierra el menu en el mismo instante. GetAsyncKeyState da false en cuanto el dedo
// suelta, haya pasado la tecla por el WndProc o no.
//
// Y hay una trampa que las atraviesa: cuando la pagina se queda con el teclado, el
// WndProc hace return 0 y el juego NUNCA ve ese WM_KEYDOWN. O sea que con el
// puntero encima de la UI, estas teclas dejan de existir para el mod y el menu no
// se puede cerrar desde aca. Antes eso no se notaba porque tampoco se podia saber
// que estaba pasando.
//
// La salida es el canal de retorno: la pagina manda "ui:close" / "ui:toggle" /
// "flow:open" con emit(), que no depende del input. Ese camino anda siempre.
// Estas teclas siguen sirviendo para el caso normal (menu recien abierto, puntero
// todavia afuera) y para cuando la pagina no tiene el teclado.
function pollKeys() {
    var now = Date.now();

    // El estado real va primero: decide si el resto de este frame tiene sentido.
    refreshInput();

    resolverTecla(now);

    // La X se lee fuera del despacho de arriba a proposito: `resolverTecla` decide
    // abrir y cerrar, y su unica decision con un menu abierto es CERRAR —con F o
    // ESC—. Si la X estuviera en esa tabla, alcanzaria para cerrar el panel, que es
    // lo contrario de lo que tiene que hacer. Ademas necesita los dos flancos —bajo
    // y subo— y el umbral de 600 ms se mide con el reloj del mod.
    reenviarX(now);

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
    var acted = drainCommands(_alComando);

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

// ================================================================= PUSH DEL INVENTARIO ==
//
// Por que push y no pedido/respuesta: en CLEO Redux 1.5.0 los scripts JS no
// reciben eventos (la medicion esta en bridge.js, con su sonda). La unica
// direccion que funciona de origen es CLEO -> pagina.
//
// CUANDO SE EMPUJA. No cada frame: la UI anterior leia getItems() en vivo
// y solo dibujaba cuando algo cambiaba. Aca el equivalente es comparar el
// snapshot con el ultimo enviado y mandar solo si difiere. Se sigue mirando cada
// PUSH_MS para no pagar el stringify en cada frame, pero si no cambio no sale
// nada. El precio: un cambio tarda hasta PUSH_MS en verse, 400ms, que es
// imperceptible para un menu.
var PUSH_MS = 400;
var _lastPush = 0;
var _lastJson = null;

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
        log("[UI] snapInventory fallo: " + e.message);
        return;
    }

    // Solo si cambio. Un menu abierto en el juego no genera trafico.
    if (json === _lastJson) {
        return;
    }
    _lastJson = json;

    pushChunked("inv", json);
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

// ------------------------------------------------------------------- EL PUENTE
// CON commands.js
// ---------------------------------------------------------------------------
// commands.js necesita llamar a togglePanel, abrirFlujo, cerrarVisible, closeMenu y
// closeFlow, que viven aca; y este archivo necesita handleCommand, que vive alla.
// Importar en las dos direcciones seria un ciclo, y un ciclo entre dos archivos de
// este paquete es un undefined en el menu.
//
// Asi que el que decide QUE hacer con un comando no se importa: se le pasa un
// objeto con lo que necesita. El objeto se arma una vez, aca, y no se
// reasigna nunca.
//
// Las tres funciones que van por aca son las MISMAS que atiende resolverTecla(), no
// una version para el camino del comando. Si el comando de la pagina tuviera su
// propia logica de apertura, "SPACE en el teclado" y "SPACE en la pagina" podrian
// abrir menus distintos, y la pagina no tendria forma de saber cual de los dos
// nombres es el que sirve.
//
// Lo que NO va por aca: nada del transporte. Que haya un comando no depende de
// si el canal anda, y meterlo en la misma caja haria que un problema de SAWeb
// pareciera un problema de la UI.
var _alComando = (function () {
    return function (cmd) {
        return handleCommand(cmd, {
            keyDebounce: function () { return _uiState.keyDebounce; },
            debounceMs: DEBOUNCE_MS,
            isMenuVisible: isMenuVisible,
            closeMenu: closeMenu,
            closeFlow: closeFlow,
            togglePanel: togglePanel,
            abrirFlujo: abrirFlujo,
            cerrarVisible: cerrarVisible
        });
    };
})();

// ------------------------------------------------------------------- INIT --

function initUI() {
    log("[UI] Bridge CLEO <-> " + UI_ID + " inicializado");
    // El contrato de teclas, tal como lo aplica resolverTecla(). El log de
    // arranque tiene que decir lo mismo que dice el codigo: antes decia que
    // ESPACIO "abre y cierra" los menus de esfera, y no es lo que pasa — ESPACIO
    // solo abre (abrirFlujo() no cierra nunca), y cerrar es F o ESC en los cinco
    // menus. Un log que promete un segundo sentido para una tecla es lo que hace
    // que un menu que se abrio solo se busque donde el log dice que no estaba.
    log("[UI] Tecla " + String.fromCharCode(KEYS.INVENTORY) +
        " abre/cierra el inventario (ignorado si hay un menu de esfera abierto)");
    log("[UI] Tecla " + String.fromCharCode(KEYS.FLOW) + " (espacio), INTRO o " +
        String.fromCharCode(KEYS.F) + " abren un menu de esfera, parado adentro de ella");
    log("[UI] Tecla " + String.fromCharCode(KEYS.F) + " o " +
        String.fromCharCode(KEYS.ESC) + " cierran el menu que se este viendo");
    try {
        log("[UI] isOpen('" + UI_ID + "') -> " + isBrowserOpen());
    } catch (e) {
        log("[UI] isOpen fallo: " + e.message);
    }
    canCommand();
}

// ------------------------------------------------------------------- REGISTRO --

register({
    name: "WebInterface",
    init: initUI,
    update: pollKeys
});
