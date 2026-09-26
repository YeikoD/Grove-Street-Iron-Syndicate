// GSIS - WebData
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS WebData - view models para la pagina web
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
import { getDirtyMoney } from "../core/gsis_SaveManager.js";
import { getItems, getTotalWeight, getBelt } from "../modules/gsis_Items.js";
import { getEquipped } from "../modules/gsis_Ballistic.js";
import { getItemName, getItemWeight, getItemType } from "../data/gsis_item_data.js";
import { getClipSizeByItemId, getSellPrice } from "../data/gsis_weapon_data.js";

var MAX_WEIGHT = MISC.MAX_INVENTORY_WEIGHT;

// ------------------------------------------------------------------ HELPERS --

// Municion de una instancia como "30/30". Un item apilado de material no tiene
// ammo y devuelve null: la celda queda con guion, no con un cero inventado.
function ammoCell(it) {
    if (it.ammo === undefined || it.ammo === null) {
        return null;
    }
    var cap = getClipSizeByItemId(it.id);
    if (cap === null || cap === undefined) {
        cap = 0;
    }
    return String(it.ammo) + "/" + String(cap);
}

// Valor de reventa. Solo las armas tienen precio en WEAPON_DATA, asi que
// materiales y cargadores devuelven null y no un 0 que se lee como "gratis".
function valueCell(id) {
    var v = getSellPrice(id);
    return v ? v : null;
}

// ---------------------------------------------------------------- INVENTARIO --

// Una fila de la tabla. Los items instanciados (cargadores, armas) llegan del
// mod como un elemento por unidad con su propia municion; los materiales llegan
// apilados con qty > 1. El nombre lo arma la pagina, que es quien decide si
// muestra "x5" segun el tipo.
function itemRow(it) {
    var w = getItemWeight(it.id) * (it.qty || 1);
    return {
        id: it.id,
        cat: getItemType(it.id),
        name: getItemName(it.id),
        qty: it.qty || 1,
        ammo: ammoCell(it),
        weight: Math.round(w * 100) / 100,
        value: valueCell(it.id),
        tip: tipFor(it)
    };
}

function tipFor(it) {
    var parts = [getItemName(it.id)];
    if (it.qty > 1) {
        parts.push(it.qty + " unidades");
    } else {
        parts.push("instanciado");
    }
    parts.push(getItemWeight(it.id) + " kg c/u");
    var a = ammoCell(it);
    if (a) {
        parts.push(a + " balas");
    }
    if (it.quality !== undefined && it.quality !== null) {
        parts.push("calidad " + it.quality);
    }
    if (it.hasMag === false) {
        parts.push("sin cargador");
    }
    return parts.join(" · ");
}

// Cinturon de cargadores. Siempre 3 casillas, con null en las libres — la pagina
// las dibuja igual para que se vean los huecos.
function beltSnap() {
    var belt = getBelt();
    var out = [];
    for (var i = 0; i < belt.length; i++) {
        var m = belt[i];
        if (!m) {
            out.push(null);
            continue;
        }
        out.push({
            index: i,
            id: m.id,
            name: getItemName(m.id),
            ammo: m.ammo,
            cap: getClipSizeByItemId(m.id) || 0,
            quality: m.quality || 1
        });
    }
    return out;
}

// Armas equipadas. El mod las indexa por slot del juego (2 = pistola, 5 = rifle),
// y eso no es un array contiguo, asi que se aplana a una lista ordenada por slot.
function equippedSnap() {
    var eq = getEquipped();
    var out = [];
    for (var slot in eq) {
        if (!eq[slot]) continue;
        out.push({
            slot: parseInt(slot, 10),
            id: eq[slot].id,
            name: getItemName(eq[slot].id),
            hasMag: eq[slot].hasMag !== false
        });
    }
    out.sort(function (a, b) { return a.slot - b.slot; });
    return out;
}

export function snapInventory() {
    var items = getItems();
    var rows = [];
    for (var i = 0; i < items.length; i++) {
        rows.push(itemRow(items[i]));
    }
    return {
        money: getDirtyMoney(),
        weight: Math.round(getTotalWeight() * 100) / 100,
        maxWeight: MAX_WEIGHT,
        rows: rows,
        belt: beltSnap(),
        equipped: equippedSnap()
    };
}
