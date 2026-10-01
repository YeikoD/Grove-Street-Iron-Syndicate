// UI: views/flow
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS FlowSerialization - los view models de los menus de proximidad
//
// Los cuatro menus que no son el inventario (baul, armeria, retiro, trueque) son
// del mismo material: una lista de items y un pie con dos numeros. La pagina los
// dibuja con la misma tabla, asi que lo unico que cambia entre ellos es QUE se
// muestra, y eso es lo que hay aca.
//
// "De proximidad" es el nombre que viene de antes, cuando se abrian al tocar la
// esfera y se cerraban alejandose. Ahora se abren con ESPACIO parado adentro de la
// esfera (core/gsis_SpotRuntime.js) y la misma tecla los cierra —tambien el ESC—,
// como el inventario: lo que queda de la proximidad es la condicion para abrir y
// la cooldown de la esfera, no el cierre.
//
// Un archivo para los cuatro, y no uno por menu, por dos razones:
//
//   1. El canal de la pagina es uno ("screen") y lo que viaja es { id, ...panes }.
//      Si cada menu tuviera su archivo, la forma del payload quedaria repartida
//      en cuatro lugares y cualquier campo nuevo habria que acordarlo cuatro
//      veces. Un archivo es un contrato.
//   2. currentFlow() y closeFlow() necesitan conocer a los cuatro. Esa funcion es
//      la que decide que panel esta abierto; si el id viviera en cada modulo, el
//      unico que las cuatro conoce seria el bridge, y entonces el bridge seria el
//      lugar donde se decide que menu hay.
//
// Shape del payload (el mismo para los cuatro):
//   {
//     id:        "trunk" | "dealer" | "seller" | "pickup",
//     titulo:    string, primera linea del panel
//     subtitulo: string, segunda linea (null si no aplica)
//     notice:    string, feedback de la ultima accion. NO se arma aca: lo agrega
//                el bridge, que es el unico que sabe si el push sale en este
//                frame o en el siguiente, y consumirlo antes de tiempo lo
//                perderia. Va ya traducido y con los codigos ~r~/~g~ del juego:
//                la pagina saca el tono del prefijo. Es de un solo uso.
//     panes:     [ { key, titulo, weight, max, vacio, rows } ],  un pane = menu
//                simple. vacio es lo que se dibuja cuando no hay filas, y lo
//                manda el mod porque es una frase traducida y especifica del
//                menu: "no tenes cargadores" no aplica en el baul.
//     pie:       { izq, der }  textos ya armados, o null
//   }
//
// Las filas son de gsis_ItemRow.js —misma forma que las del inventario— mas las
// claves que cada menu necesita. La pagina dibuja las columnas que la pantalla
// declara, asi que una clave que nadie lee no se manda.
//
// Regla de la casa: esto importa de core/ y data/, y de modules/ SOLO a traves de
// sus funciones exportadas. No se toca GameState ni se muta nada: los snapshot
// son de lectura. Las acciones viven en los modulos owners (putInTrunk, doOffer,
// collectItem, addToCart), que son los que validan.
// ============================================================================

import { MISC } from "../../../core/gsis_Config.js";
import { t, money } from "../../../core/gsis_L10n.js";
import { query } from "../../../core/gsis_EventBus.js";
import { getModuleData } from "../../../core/gsis_SaveManager.js";
import { getItemType } from "../../../data/gsis_item_data.js";
import { WEAPON_DATA, getSellPrice } from "../../../data/gsis_weapon_data.js";
import { getVehicleName } from "../../../data/gsis_vehicle_data.js";
import { itemRow } from "./itemRow.js";
import {
    getItems, getTotalWeight, entregaOpts,
    getTrunkItems, getTrunkWeight, getTrunkMaxCapacity
} from "../../inventory/index.js";import {
    isTrunkMenuVisible, closeTrunkMenu, openTrunkMenu, getTrunkVehicleId
} from "../../gsis_Trunk.js";
import {
    isDealerMenuVisible, closeDealerMenu, openDealerMenu, getActiveCharacterId,
    getDealerPrice, getCart, getCartTotal, getCJMoney
} from "../../gsis_WeaponDealer.js";
import {
    isSellMenuVisible, closeSellMenu, openSellMenu, getSellState, getOffer
} from "../../gsis_WeaponSeller.js";
import {
    isPickupMenuVisible, closePickupMenu, openPickupMenu, getOrder
} from "../../gsis_DealerPickup.js";

// Los cuatro menus, en el orden en que se consultan. El orden importa: dos
// menus pueden quedar visibles a los vez si el jugador esta entre dos esferas, y
// en ese caso gana el primero de la lista. La lista es la unica fuente: el
// bridge no mantiene su propia copia.
//
// Cada entrada tiene las tres puertas del menu: si esta visible (lo consulta
// cualquierMenuVisible), como se abre y como se cierra. Abrir y cerrar estan
// juntos en el mismo lugar por una razon que no es estetica: la Cool-DOWN se pide
// en la transición de abierto a cerrado, y el que la ve es el modulo dueño (su
// update). Si el "cerrar" viviera en el bridge, el bridge tendria que acordarse
// de los cuatro.
//
// Los nombres son los mismos que usa registerMenuSource() en cada modulo, asi
// que el id del payload, el nombre de la fuente y el prefijo del comando
// ("trunk:put") dicen lo mismo sin traducciones.
var FLUJOS = [
    { id: "trunk", visible: isTrunkMenuVisible, close: closeTrunkMenu, open: openTrunkMenu },
    { id: "dealer", visible: isDealerMenuVisible, close: closeDealerMenu, open: openDealerMenu },
    { id: "seller", visible: isSellMenuVisible, close: closeSellMenu, open: openSellMenu },
    { id: "pickup", visible: isPickupMenuVisible, close: closePickupMenu, open: openPickupMenu }
];

// Que flujo esta abierto, o "" si ninguno. "" es lo que la pagina lee como "no hay
// panel de flujo".
export function currentFlow() {
    for (var i = 0; i < FLUJOS.length; i++) {
        try {
            if (FLUJOS[i].visible()) return FLUJOS[i].id;
        } catch (e) { }
    }
    return "";
}

// Abre el menu de esfera que corresponda. Devuelve el id del que abrio, o "" si
// ninguno: el jugador esta lejos de todos, o el que tiene cerca no puede abrir
// todavia (esfera apagada por la cooldown, o esta en un vehiculo).
//
// Se prueban los cuatro en el orden de FLUJOS, o sea que el primero que puede
// abrir gana. No es una carrera entre ellos porque cada uno decide por su propia
// esfera: solo uno puede estar a menos de DIST.DEALER_ACCESS del jugador, salvo
// que dos puntos esten pegados, y en ese caso gana el de la lista.
//
// La razon de que la apertura pase por aca y no la haga el bridge con un
// "cual esta cerca": cada modulo tiene su propia idea de "cerca" (el baul busca
// entre los autos con el baul ABIERTO, el retiro exige que haya pedido) y su
// propio estado para dejar listo al abrir (el NPC del carrito, el presupuesto del
// trueque). Este archivo es el que ya conoce a los cuatro.
export function openFlow() {
    for (var i = 0; i < FLUJOS.length; i++) {
        try {
            if (FLUJOS[i].open()) return FLUJOS[i].id;
        } catch (e) {
            log("[FlowSerialization] no se pudo abrir " + FLUJOS[i].id + ": " + e.message);
        }
    }
    return "";
}

// Cierra el flujo abierto. Devuelve el id del que cerro, o "" si no habia
// ninguno: es lo que la pagina necesita para saber si su Escape hizo algo.
//
// NO es lo que apaga la esfera. La cooldown la pide el modulo dueño, en su update,
// al ver la transicion de abierto a cerrado (beginSpotCooldown de
// gsis_SpotRuntime.js). Que sea el modulo y no esta funcion es lo que hace que
// TODOS los caminos de cierre la disparen —el Escape de la pagina, el Escape del
// mod, el auto-cierre por distancia, la 3 del baul— sin que este archivo tenga que
// saber que existen: el unico que ve el menu cerrarse es el que lo tiene.
export function closeFlow() {
    var id = currentFlow();
    if (!id) return "";
    for (var i = 0; i < FLUJOS.length; i++) {
        if (FLUJOS[i].id !== id) continue;
        try {
            FLUJOS[i].close();
        } catch (e) {
            log("[FlowSerialization] no se pudo cerrar " + id + ": " + e.message);
        }
    }
    return id;
}

// El snapshot del flujo abierto, o null si no hay ninguno. Null y no un objeto
// vacio: la pagina lo usa para decidir si muestra un panel de flujo o el de
// inventario, y un objeto vacio no se distingue de un menu sin datos.
export function snapFlow() {
    var id = currentFlow();
    if (!id) return null;

    var out = null;
    try {
        if (id === "trunk") out = _snapTrunk();
        else if (id === "dealer") out = _snapDealer();
        else if (id === "seller") out = _snapSeller();
        else if (id === "pickup") out = _snapPickup();
    } catch (e) {
        log("[FlowSerialization] snapshot de " + id + " fallo: " + e.message);
        return null;
    }
    if (!out) return null;

    out.id = id;
    return out;
}

// ------------------------------------------------------------------- BAUL --
//
// El unico con dos listas, asi que el unico con dos panes. El de la izquierda es
// la mochila y el de la derecha el baul; la pagina los dibuja lado a lado.
//
// Las dos listas son itemRow() sin mas: los items del baul son los mismos
// objetos que los de la mochila, con la misma forma. Lo que los diferencia es de
// donde se leen, y eso lo decide el pane, no la fila.
function _snapTrunk() {
    var vid = getTrunkVehicleId();
    if (vid === -1) return null;

    return {
        titulo: t("TRK_TTL", { name: _vehicleName(vid), model: _vehicleModel(vid) }),
        // Sin subtitulo propio: el del baul lo arma la pagina con partirTituloBaul,
        // que saca el nombre del auto de aca. Y la guia de teclas no viaja en el
        // snapshot —la dibuja la pagina con HINT_TECLAS, que es la misma para los
        // cinco menus. Antes aca iba un texto propio del baul ("ESPACIO: menu | 3:
        // cerrar maletero") que ademas prometia una tecla que no hace nada con el
        // menu abierto.
        subtitulo: "",
        panes: [
            {
                key: "mochila",
                titulo: t("TRK_MOC"),
                vacio: t("TRK_EMI"),
                weight: _round(getTotalWeight()),
                max: MISC.MAX_INVENTORY_WEIGHT,
                rows: _rows(getItems())
            },
            {
                key: "baul",
                titulo: t("TRK_H"),
                vacio: t("TRK_EMB"),
                weight: _round(getTrunkWeight(vid)),
                max: getTrunkMaxCapacity(vid),
                rows: _rows(getTrunkItems(vid))
            }
        ],
        pie: null
    };
}

function _rows(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
        out.push(itemRow(items[i]));
    }
    return out;
}

// ----------------------------------------------------------------- ARMERIA --
//
// El catalogo es WEAPON_DATA filtrado por precio, no una tabla propia: lo que no
// tiene precio no se vende. El precio sale de getDealerPrice, asi que el markup y
// el catalogo acotado de cada NPC ya estan aplicados.
//
// La banda de grupo de cada fila es la CATEGORIA del arma (Pistolas, Escopetas),
// no el type del item: en la armeria todas las filas son type weapon, y con el
// type quedaria una sola banda, que es el inventario con otros numeros.
function _snapDealer() {
    var charId = getActiveCharacterId();
    var cart = getCart();

    var rows = [];
    var cartRows = [];
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        var w = WEAPON_DATA[i];
        if (!w.itemId) continue;
        var p = getDealerPrice(w.itemId, charId);
        if (!p) continue; // este NPC no lo vende
        // La fila del catalogo. Sin estado de municion, como toda cosa que todavia no
// es del jugador. _filaDeItem le pasa lo que dicta entregaOpts, que para un arma
// es hasMag:false — y asi la celda de municion sale con guion en vez de "17/17":
// lo que se vende llega sin cargador, asi que un "17/17" en el catalogo seria
// prometer municion que no viene. body_armor no es instanciado, asi que no le
// llega hasMag y su tooltip no dice "sin cargador".
var fila = itemRow(_filaDeItem(w.itemId, 1));
        fila.cat = w.category || w.itemId;
        fila.precio = p;
        fila.enCarrito = cart[w.itemId] || 0;
        rows.push(fila);

        // La segunda lista es el carrito: las mismas filas de arriba (mismas
        // columnas, mismas bandas — el jugador compara catalogo contra carrito
        // con los mismos numeros) pero SOLO las elegidas, y con maxQty, el
        // tope de cuanto se puede sacar.
        //
        // Va en una COPIA y no en la misma fila: maxQty es tope de la barra
        // (la pagina lo lee en r.maxQty), y si viviera en la fila del catalogo
        // agregar tambien se toparia contra lo que ya esta en el carrito —
        // "tenes 2, no puedes pedir un tercero", que no es ninguna regla.
        //
        // La copia reasigna "fila" a proposito: la del catalogo ya quedo en
        // rows, y a partir de aca esa variable ES la del carrito (y por eso
        // la linea de abajo es fila.maxQty, que es como check_pantallas lee
        // que este snapshot escribe esa clave).
        if (fila.enCarrito > 0) {
            var enCarrito = fila.enCarrito;
            var copia = {};
            for (var k in fila) {
                if (fila.hasOwnProperty(k)) copia[k] = fila[k];
            }
            fila = copia;
            fila.maxQty = enCarrito;
            cartRows.push(fila);
        }
    }

    return {
        titulo: t("DLR_TTL"),
        // Sin _subtitulo(): la armeria lleva el encabezado en UNA sola linea
        // (.panel-header--linea) y ahi "Emmet | ESPACIO o ESC..." queda pegado
        // al titulo y no se lee. Solo el nombre del vendedor.
        subtitulo: _dealerName(charId),
        panes: [
            { key: "catalogo", titulo: t("DLR_CAT"), vacio: t("DLR_NON"), weight: 0, max: 0, rows: rows },
            { key: "carrito", titulo: t("DLR_CRT"), vacio: t("CRT_NON"), weight: 0, max: 0, rows: cartRows }
        ],
        // money() va en TODOS los numeros del pie: la pagina parsea estos
        // textos para el total del carrito y el saldo (renderPie), y sin el
        // punto de miles "Tu dinero: $4200" no se leia como la misma cifra de
        // las columnas ("$4.200", fmtDinero en app.js).
        pie: {
            izq: t("DLR_DIN", { n: money(getCJMoney()) }),
            der: _cartVacio(cart) ? t("CRT_UI") : t("DLR_TOT", { n: money(getCartTotal()) })
        }
    };
}

function _cartVacio(cart) {
    for (var k in cart) {
        if (cart.hasOwnProperty(k) && cart[k] > 0) return false;
    }
    return true;
}

// Nombre del personaje que esta vendiendo. Sale del modulo de personajes por
// query, no de CHARACTERS: asi el titulo muestra el nombre que el juego ya tiene
// en pantalla y no un segundo nombre posible. characterId no se pasa como
// characterId: el query lo llama id.
function _dealerName(charId) {
    try {
        var info = query("characters:name", { id: charId });
        if (info && info.name) return info.name;
    } catch (e) { }
    return t("DLR_TTL");
}

// ----------------------------------------------------------------- TRUEQUE --
//
// Las filas son las armas del jugador que el NPC compra. El presupuesto NO se
// arma aca: getSellState() ya lo devuelve null hasta la primera oferta, asi que
// el dato no sale del mod (ver el comentario de getSellState).
//
// Encabezado y pie, con las mismas recetas que la armeria:
//
//   subtitulo   SOLO el segundo dato que identifica ("Cliente"), en la misma
//               linea que el titulo (.panel-header--linea). "Busca hoy: ..." es
//               una frase y no cabe ahi, y el cierre " | ESPACIO o ESC" ya no se
//               anuncia en ningun menu: se fue al pie.
//   pie.izq     lo que busca el NPC, que es el dato que decide que le conviene
//               ofrecerle.
//   pie.der     el presupuesto cuando se lo dijo (getSellState lo oculta hasta
//               la primera oferta) y "se cumplio" cuando ya le conseguiste lo
//               que buscaba.
function _snapSeller() {
    var items = getItems();
    var rows = [];
    for (var i = 0; i < items.length; i++) {
        var base = getSellPrice(items[i].id);
        if (!base) continue; // el NPC no compra esto
        // El trueque es de ARMAS. Los cargadores tienen precio (lo necesitan para
        // el dealer y la columna Valor) asi que getSellPrice no los descarta, y
        // sin este filtro el panel ofreceria cargadores: el NPC tiene su propio
        // filtro por type (gsis_WeaponSeller._esArmaVendible) y rechazaria la
        // oferta con un error, o peor, la pagaria. La misma regla en los dos
        // lados: el que ofrece y el que acepta.
        if (getItemType(items[i].id) !== "weapon") continue;
        var fila = itemRow(items[i]);
        fila.base = base;
        // La oferta arranca en el valor base y el jugador la mueve desde la
        // pagina (seller:quote → moveOffer). Sale del mod y no de la pagina
        // porque es estado del NPC: asi el snapshot es la unica verdad y mover
        // la oferta no se pierde al cambiar de fila. base queda como columna de
        // referencia — es lo que vale el arma en el mercado, y es la unica
        // diferencia entre las dos cifras de la fila.
        fila.oferta = getOffer(items[i].id);
        rows.push(fila);
    }

    var st = getSellState();
    return {
        titulo: t("SEL_TTL"),
        subtitulo: t("SEL_NPC"),
        panes: [{ key: "venta", titulo: t("SEL_ARMAS"), vacio: t("SEL_NON"), weight: 0, max: 0, rows: rows }],
        pie: {
            izq: t("SEL_BUS", { list: st.interests.length ? st.interests.join(", ") : "-" }),
            // El presupuesto va aca y no a la izquierda porque el que decide
            // mostrarlo es el mod (getSellState lo devuelve null hasta la primera
            // oferta) y "se cumplio" ocupa el mismo lugar cuando ya le
            // conseguiste lo que buscaba: son dos estados del mismo dato.
            der: st.fulfilled
                ? t("SEL_OK")
                : (st.budget == null ? t("SEL_BUDH") : t("SEL_BUD", { n: money(st.budget) }))
        }
    };
}

// La base de una fila que todavia no es del jugador: el id, la cantidad, y el
// estado que va a traer. entregaOpts decide ese estado una sola vez en todo el
// mod y esta es su segunda mitad —la primera es la entrega, en
// collectItem/collectAll de gsis_DealerPickup.js.
//
// La usan el CATALOGO de la armeria y el RETIRO, y por eso son dos pantallas con
// la misma regla: la fila de una compra real y la del producto que se esta
// mirando tienen que decir lo mismo, o el panel y la entrega divergen y el
// jugador cobra por una promesa.
//
// Solo se copian ammo y hasMag. El resto de la forma de la instancia lo pone
// makeInstance del lado del mod, y la salud en particular no se copia: una fila
// pendiente no es una unidad, es un producto o un pedido, y su salud es
// SALUD_MAX por definicion.
function _filaDeItem(id, qty) {
    var o = { id: id, qty: qty };
    var e = entregaOpts(id);
    if (e) {
        if (e.hasMag !== undefined) o.hasMag = e.hasMag;
        if (e.ammo !== undefined) o.ammo = e.ammo;
    }
    return o;
}

// ------------------------------------------------------------------ RETIRO --
//
// Las filas son lineas de pedido, no inventario: el item todavia no esta en la
// mochila. El qty que se ve es el que quedo del pedido, y por eso la fila se arma
// con esa cantidad y no con la que tendria en la mochila.
//
// La fila se arma con entregaOpts —la MISMA regla que usa collectItem al
// entregar— para que el panel y la entrega digan lo mismo. Sin eso, un AK-47
// pendiente se veria "30/30" (ammoCell cae al default de un arma) y llegaria a
// 0/30: el panel promete 30 balas y entrega 0. Se pasan solo ammo/hasMag;
// `salud` no, porque lo decide addItem en la entrega y una fila pendiente no
// tiene salud todavia.
function _snapPickup() {
    var order = getOrder();
    if (!order) return null;

    var rows = [];
    for (var i = 0; i < order.items.length; i++) {
        var linea = order.items[i];
        var fila = itemRow(_filaDeItem(linea.id, linea.qty));
        fila.disponible = linea.qty;
        rows.push(fila);
    }

    return {
        titulo: t("PKC_TTL"),
        // El subtitulo IDENTIFICA, igual que en la armeria (Emmet) y en el
        // trueque (Cliente): el encabezado va en UNA linea
        // (.panel-header--linea) y ahi una frase larga se pega al titulo y lo
        // tapa. Los dos numeros que traia PKC_ORD no se pierden, se van a la
        // caja de control: el total por pie.der, que ctrlRetiro pinta en la
        // tarjeta "Tu pedido", y el peso lo suma la pagina fila por fila.
        subtitulo: t("CH_EMM"),
        panes: [{ key: "pedido", titulo: t("PKC_LIN"), vacio: t("PKC_NON"), weight: 0, max: 0, rows: rows }],
        pie: {
            izq: t("PKC_LIB", { free: _round(MISC.MAX_INVENTORY_WEIGHT - getTotalWeight()) }),
            der: t("PKC_TOT", { n: money(order.total) })
        }
    };
}

// ------------------------------------------------------------------ COMUN --

function _round(kg) {
    return Math.round(kg * 10) / 10;
}

// El vehiculo del baul. El VehicleModule es de otro modulo y no se importa: se
// le pregunta por el registro, que es como el resto de los modulos se alcanzan.
// Mismo camino que usa getTrunkMaxCapacity() en gsis_Items.js.
function _vehicleEntry(vehicleId) {
    var data = getModuleData("VehicleModule");
    if (!data || !data.vehicles) return null;
    for (var i = 0; i < data.vehicles.length; i++) {
        if (data.vehicles[i].id === vehicleId) return data.vehicles[i];
    }
    return null;
}

function _vehicleModel(vehicleId) {
    var v = _vehicleEntry(vehicleId);
    return v && v.model !== undefined ? v.model : "?";
}

function _vehicleName(vehicleId) {
    var v = _vehicleEntry(vehicleId);
    if (v && v.name) return v.name;
    var m = _vehicleModel(vehicleId);
    try {
        var n = getVehicleName(m);
        if (n) return n;
    } catch (e) { }
    return String(m);
}
