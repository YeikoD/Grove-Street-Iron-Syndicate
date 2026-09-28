// GSIS - InventorySerialization
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS InventorySerialization - view models para la pagina web
//
// Un archivo por grupo de datos, no uno por panel. Cada snapshot() lee el
// estado de los modulos y devuelve algo que se pueda meter en JSON y cruzar la
// capa IPC. Nada de esto se dibuja: aca no hay DOM ni HTMLElement.
//
// Regla de la casa: esto importa de core/ y data/, y de modules/ SOLO a traves
// de sus funciones exportadas. No se toca GameState ni se muta nada — todos los
// snapshot son de lectura. Las acciones viven en el bridge, que es quien decide
// si un comando de la pagina se acepta.
// ============================================================================

import { MISC } from "../core/gsis_Config.js";
import { getItems, getTotalWeight, getBelt } from "./gsis_Items.js";
import { getEquipped, getEquippedAmmo } from "./gsis_Ballistic.js";
import { ITEMS } from "../data/gsis_item_data.js";
import { WEB_ICONS, WEB_CAT_ORDER, WEB_CAT_LABELS } from "../data/gsis_web_data.js";
import { itemRow } from "./gsis_ItemRow.js";

var MAX_WEIGHT = MISC.MAX_INVENTORY_WEIGHT;

// --------------------------------------------------------------- CATALOGO --

// Lo estatico que la pagina no puede deducir. Se manda una sola vez al abrir el
// menu, no en cada snapshot: son datos que no cambian, y mandarlos cada 400ms
// sumaria trozos a un canal con tope de 255 chars por evento.
export function snapCatalog() {
    return {
        maxWeight: MAX_WEIGHT,
        icons: WEB_ICONS,
        cats: buildCats()
    };
}

// Las bandas de grupo, en el orden de WEB_CAT_ORDER. Los tipos no se inventan
// aca: salen de ITEMS. Si el catalogo tiene un tipo que WEB_CAT_ORDER no lista,
// se avisa en el log y la banda se cae al final, en vez de items sin agrupar.
var _catsChecked = false;
function buildCats() {
    var out = [];
    var known = {};

    for (var c = 0; c < WEB_CAT_ORDER.length; c++) {
        var key = WEB_CAT_ORDER[c];
        known[key] = true;
        out.push({ key: key, label: WEB_CAT_LABELS[key] || key });
    }

    if (!_catsChecked) {
        _catsChecked = true;
        var missing = [];
        for (var id in ITEMS) {
            var t = ITEMS[id].type;
            if (t && !known[t]) {
                known[t] = true;
                missing.push(t);
            }
        }
        if (missing.length > 0) {
            log("[InventorySerialization] Tipo de item sin banda en WEB_CAT_ORDER: " + missing.join(", ") +
                " — agregalo a data/gsis_web_data.js o esos items no se agrupan");
        }
    }

    return out;
}

// ---------------------------------------------------------------- INVENTARIO --
//
// La fila en si (itemRow, ammoCell, valueCell, tipFor) vive en gsis_ItemRow.js:
// la usan tambien el baul, el retiro y el resto de las pantallas de items, y una
// copia por pantalla divergen calladas. Aca queda solo lo que es del inventario.

// Armas equipadas y cargadores al cinturon, como filas MAS del inventario.
//
// Razon de que existan aca: el mod saca lo equipado de items[] al equiparlo
// (equipMagToBelt hace splice, equipWeapon pide items:takeWeapon) y por eso no
// pesa —getTotalWeight() solo suma items[]. El efecto secundario es que
// desaparecer de la lista en cuanto lo equipabas, y eso se leia como perder el
// item. Se arman con itemRow() para que salgan con la MISMA forma que el resto:
// la pagina no los distingue por estructura, solo por el flag equipado.
//
// ranura dice donde esta ("arma" / "cinturon") y slot es el indice, y los dos
// hacen falta para devolverlo: unequipWeapon(slot) para el arma,
// unequipBeltMag(index) para el cargador.
//
// El cargador DENTRO de un arma no sale, y es lo que se busca. No esta ni en
// items[] ni en el cinturon: lo tiene equipped[slot].hasMag, o sea que ya se
// consumio en el arma. Si alguna vez hay que mostrarlo, hay que armarlo desde
// ahi —getEquipped() no lo expone— y no agregarlo desde esta funcion.
function equipadasSnap() {
    var out = [];

    var eq = getEquipped();
    for (var slot in eq) {
        if (!eq[slot]) continue;
        // getEquipped() no guarda el ammo, asi que se lee del ped. null si no se
        // pudo leer, y null es lo que ammoCell necesita para NO invente un
        // cargador lleno: esVivo desactiva el fallback.
        var live = getEquippedAmmo(slot);
        // salud y hasMag SI estan en el registro (Ballistic.equipped[slot]), asi
        // que viajan tal cual. hasMag antes no viajava y la fila no podia
        // distinguir un arma descargada de un cargador vacio montado —las dos
        // salian "0/17"—; ahora ademas lo dice el tooltip ("sin cargador").
        var w = itemRow({
            id: eq[slot].id,
            qty: 1,
            ammo: live == null ? null : String(live),
            salud: eq[slot].salud,
            hasMag: eq[slot].hasMag
        }, true);
        w.equipado = true;
        w.ranura = "arma";
        w.slot = parseInt(slot, 10);
        out.push(w);
    }

    var belt = getBelt();
    for (var i = 0; i < belt.length; i++) {
        if (!belt[i]) continue;
        var m = itemRow({
            id: belt[i].id,
            qty: 1,
            ammo: belt[i].ammo,
            salud: belt[i].salud
        });
        m.equipado = true;
        m.ranura = "cinturon";
        m.slot = i;
        out.push(m);
    }

    return out;
}

// El snapshot del inventario son DOS claves: las filas y el peso.
//
// Lo que se saco, y por que: maxWeight es estatico y va en el catalogo; y
// money / belt / equipped no los leia nadie. Se pagaban en cada push —unos 200
// chars por snapshot, un tercio de lo que viajaba— y la pagina los descartaba al
// primer asignar. La franja de equipo, si algún dia la dibuja la pagina, los
// vuelve a pedir; el dinero de cada pantalla lo lleva su propio snapshot, que
// sabe de que fuente talking es (getDirtyMoney en el inventario, el storeScore
// nativo en armeria y trueque).
export function snapInventory() {
    var items = getItems();
    var rows = [];
    for (var i = 0; i < items.length; i++) {
        rows.push(itemRow(items[i]));
    }
    // Lo equipado va PRIMERO y no en una clave aparte: la pagina dibuja una sola
    // lista y armanda las bandas filtrando por cat, asi que el orden dentro de
    // rows es el orden dentro de la banda. Concatenando lo equipado adelante,
    // el arma aparece en cabeza de ARMAS y el cargador en cabeza de CARGADORES,
    // que es donde el jugador mira primero. Ver equipadasSnap().
    rows = equipadasSnap().concat(rows);
    return {
        weight: Math.round(getTotalWeight() * 100) / 100,
        rows: rows
    };
}
