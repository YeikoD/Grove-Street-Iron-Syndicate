// GSIS - Inventory: logic
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Mover items: al inventario, al baul, al cinturon, y sacarlos.
//
// Y las dos reglas que hacen que una operacion de inventario no trague cosas:
//
//   1. NADA PARCIAL. Si no hay `qty` unidades, no se toca nada y se devuelve
//      false. No se quita "lo que haya" y se dice que salio. Durante un tiempo si
//      se hacia, y el bug era de las dos formas:
//
//        - Pedir 5 con 3 en un stack: `qty - 5` daba negativo, la fila se borraba
//          entera (3 reales) y la funcion devolvia true. Perdia 3 y reportaba
//          exito. Ahora devuelve false y el item no se mueve.
//        - Un id apilable repartido en DOS filas (2 + 1) contaba 3 unidades pero
//          el bucle solo tocaba la primera: cobrabas 3 y solo se perdia la
//          primera fila. Ahora se recorren todas.
//
//   2. CONTAR ANTES DE RESTAR. En toda operacion que mueve unidades, el conteo
//      se hace entero antes de tocar la primera fila. Restar sobre la marcha y
//      cortar despues dejaba el clon del cache a medias (el `setModuleData` nunca
//      llegaba), y sin el conteo previo, restar mas de lo que hay CREABA
//      material: la fila se borraba entera y el contenedor de destino recibia la
//      cantidad completa.
//
// Las dos reglas estan repetidas archivo por archivo a proposito. Son la
// diferencia entre "el inventario anda" y "el inventario anda casi siempre", y
// un comentario en el que la regla se escribio no sobrevive al que la rompe.
// ============================================================================

import { getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { MISC } from "../../core/gsis_Config.js";
import { t } from "../../core/gsis_L10n.js";
import { ITEMS, SALUD_MAX, clampSalud, isInstanced } from "../../data/gsis_item_data.js";
import {
    SAVE_KEY, isMagazine, capacityOfItem, makeInstance,
    getItems, getTotalWeight, ensureTrunks, ensureBelt,
    getTrunkMaxCapacity
} from "./state.js";

// entregaOpts — que estado trae un item QUE SE ENTREGA (compra, retiro, premio).
// undefined = usar el default de addItem.
//
// La regla: un arma se entrega DESNUDA, sin cargador montado y con el total en
// 0 ({ hasMag: false, ammo: 0 }). Antes llegaba con cargador puesto y lleno,
// porque el addItem sin opts caía en el default de makeWeaponInstance — y eso
// hacia que el arma unproductive.traiga municion de regalo, y que la
// municion no tuviera un canal propio.
//
// Un cargador, en cambio, se entrega NUEVO y lleno: es lo unico que hace un
// cargador nuevo, y el `salud` no se pasa (nace a SALUD_MAX).
//
// Materiales y body_armor caen en undefined: no son instanciados y siguen
// apilándose con el default.
//
// Vive aca y no en el modulo del dealer porque el preview del pedido necesita
// EXACTAMENTE la misma regla: si el panel dice una cosa y la entrega otra, el
// jugador cobra por una promesa. Dos copias de "que llega vacio" divergen
// calladas, que es la falla que la casa ya marca para itemRow.
export function entregaOpts(id) {
    if (isMagazine(id)) return { ammo: capacityOfItem(id) || 0 };
    if (isInstanced(id)) return { hasMag: false, ammo: 0 };
    return undefined;
}

// Agregar item al inventario (verifica MISC.MAX_INVENTORY_WEIGHT)
// opts por instancia: { ammo, salud, hasMag } | opts.force = ignora peso
// (adopcion de armas del ped: ya iban encima del jugador)
export function addItem(id, qty, opts) {
    if (!ITEMS[id]) return false;
    qty = qty || 1;
    var peso = ITEMS[id].weight * qty;
    var currentWeight = getTotalWeight();
    if ((!opts || !opts.force) && currentWeight + peso > MISC.MAX_INVENTORY_WEIGHT) {
        showTextBox(t("INV_FUL"));
        return false;
    }
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];

    // Instancias (cargadores y armas): una entrada por unidad (sin stack)
    if (isInstanced(id)) {
        for (var m = 0; m < qty; m++) {
            data.items.push(makeInstance(id, opts));
        }
        setModuleData(SAVE_KEY, data);
        return true;
    }

    for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === id) {
            // Une al stack que ya esta: NO se toca su salud. El stack es una
            // fila con una salud, y agregar no esmbia la unidad que ya estaba
            // ahi. La regla de "gastar de un stack gastado" la aplica quien
            // consuma, no la alta.
            data.items[i].qty += qty;
            setModuleData(SAVE_KEY, data);
            return true;
        }
    }
    data.items.push({ id: id, qty: qty, salud: SALUD_MAX });
    setModuleData(SAVE_KEY, data);
    return true;
}

// Quitar item del inventario. Ver la REGLA 1 del header.
//
// Quien llama decide que hacer con un false: el wrapper de la pagina ya avisa
// (el modulo no usa setNotice, muestra avisos con showTextBox).
export function removeItem(id, qty) {
    if (qty === undefined || qty === null) qty = 1;
    if (qty < 1) return false;
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [] };
    if (!data.items) data.items = [];

    // Instancias (cargadores/armas): quitar instancias sueltas
    if (isInstanced(id)) {
        var removed = 0;
        for (var m = 0; m < data.items.length && removed < qty; ) {
            if (data.items[m].id === id) {
                data.items.splice(m, 1);
                removed++;
            } else {
                m++;
            }
        }
        if (removed <= 0) return false;
        if (removed < qty) return false;  // no habia todas: no se toca nada (arriba dice por que)
        setModuleData(SAVE_KEY, data);
        return true;
    }

    // Apilables: primero se cuenta cuanto hay, en TODAS las filas del id, y solo
    // despues se resta. Ver la REGLA 2 del header.
    var disponible = 0;
    for (var c = 0; c < data.items.length; c++) {
        if (data.items[c].id === id) disponible += (data.items[c].qty || 1);
    }
    if (disponible <= 0) return false;
    if (disponible < qty) return false;  // no hay todas: no se toca nada

    var faltan = qty;
    for (var i = 0; i < data.items.length && faltan > 0; ) {
        if (data.items[i].id !== id) { i++; continue; }
        var toma = data.items[i].qty || 1;
        if (toma > faltan) toma = faltan;
        data.items[i].qty -= toma;
        faltan -= toma;
        if (data.items[i].qty <= 0) {
            data.items.splice(i, 1);
            // NO se avanza i: el splice dejo en i la fila siguiente, que tambien
            // puede ser del mismo id. Si la fila sobrevive (toma < qty) entonces
            // faltan quedo en 0 y el for sale solo.
        }
    }
    setModuleData(SAVE_KEY, data);
    return true;
}

// ============================================================================
// BAUL
// ============================================================================

// Mover item del inventario al baul
export function addToTrunk(vehicleId, id, qty) {
    qty = qty || 1;
    if (!ITEMS[id]) return false;

    var data = ensureTrunks(getModuleData(SAVE_KEY));

    // Verificar peso del baul
    var def = ITEMS[id];
    var currentWeight = 0;
    var trunkItems = data.trunks[vehicleId] || [];
    for (var i = 0; i < trunkItems.length; i++) {
        var itemDef = ITEMS[trunkItems[i].id];
        if (itemDef) currentWeight += itemDef.weight * trunkItems[i].qty;
    }
    var maxCap = getTrunkMaxCapacity(vehicleId);
    if (currentWeight + def.weight * qty > maxCap) {
        return false;
    }

    if (!data.trunks[vehicleId]) data.trunks[vehicleId] = [];
    var trunkArr = data.trunks[vehicleId];

    // Instancias (cargadores/armas): mover instancias con su estado intacto
    if (isInstanced(id)) {
        var disponible = 0;
        for (var c = 0; c < data.items.length; c++) {
            if (data.items[c].id === id) disponible++;
        }
        // Menos de las pedidas → no se mueve NADA. Antes se movian las que
        // hubiera y se devolvia true: el panel informaba "guardaste 5" con 3 en
        // la mano. Y si no hubiera ninguna, el `moved <= 0` de abajo cortaba
        // DESPUES de haber hecho push al baul, dejando el clon del cache a medio
        // camino.
        if (disponible < qty) return false;
        // `disponible` es el conteo; el que frena el bucle es `movidos`. (Usar el
        // conteo como contador movia todas las filas y no las `qty` pedidas.)
        var movidos = 0;
        for (var m = 0; m < data.items.length && movidos < qty; ) {
            if (data.items[m].id === id) {
                trunkArr.push(data.items[m]);
                data.items.splice(m, 1);
                movidos++;
            } else {
                m++;
            }
        }
        setModuleData(SAVE_KEY, data);
        return true;
    }

    // Apilables: se cuenta antes de restar, por el mismo motivo que removeItem.
    // La salud que viaja es la de la PRIMERA fila del id: un stack tiene una sola
    // salud, y si hay varias filas es porque un save viejo las partio, no porque
    // sean unidades distintas con estados distintos.
    var hay = 0;
    var salud = SALUD_MAX;
    var saludTomada = false;
    for (var c2 = 0; c2 < data.items.length; c2++) {
        if (data.items[c2].id !== id) continue;
        hay += (data.items[c2].qty || 1);
        if (!saludTomada) { salud = clampSalud(data.items[c2].salud); saludTomada = true; }
    }
    if (hay < qty) return false;  // no hay todas: no se crea material de la nada

    // Quitar del inventario. La salud sale de la fila que se saca (antes del
    // splice), por el mismo motivo que en removeFromTrunk: la unidad no llega
    // nueva al baul, llega con la salud que tenia.
    var faltan = qty;
    for (var j = 0; j < data.items.length && faltan > 0; ) {
        if (data.items[j].id !== id) { j++; continue; }
        var toma = data.items[j].qty || 1;
        if (toma > faltan) toma = faltan;
        data.items[j].qty -= toma;
        faltan -= toma;
        if (data.items[j].qty <= 0) data.items.splice(j, 1);
    }

    // Agregar al baul
    for (var k = 0; k < trunkArr.length; k++) {
        if (trunkArr[k].id === id) {
            trunkArr[k].qty += qty;
            setModuleData(SAVE_KEY, data);
            return true;
        }
    }
    trunkArr.push({ id: id, qty: qty, salud: salud });
    setModuleData(SAVE_KEY, data);
    return true;
}

// Mover item del baul al inventario
export function removeFromTrunk(vehicleId, id, qty) {
    qty = qty || 1;
    if (!ITEMS[id]) return false;

    var data = ensureTrunks(getModuleData(SAVE_KEY));

    // Verificar peso del inventario
    var def = ITEMS[id];
    var currentWeight = getTotalWeight();
    if (currentWeight + def.weight * qty > MISC.MAX_INVENTORY_WEIGHT) {
        showTextBox(t("INV_FUL"));
        return false;
    }

    var trunkArr = data.trunks[vehicleId] || [];

    // Instancias (cargadores/armas): mover instancias con su estado intacto
    if (isInstanced(id)) {
        var disponible = 0;
        for (var c = 0; c < trunkArr.length; c++) {
            if (trunkArr[c].id === id) disponible++;
        }
        if (disponible < qty) return false;  // ver addToTrunk: sin movimiento parcial
        // OJO: `disponible` es el conteo, no el contador del bucle. Si se
        // decrementa aca, el for termina cuando se acaba el conteo y mueve
        // TODAS las filas, no `qty`: sacar 1 de 2 llevaria las dos.
        var movidos = 0;
        for (var m = 0; m < trunkArr.length && movidos < qty; ) {
            if (trunkArr[m].id === id) {
                data.items.push(trunkArr[m]);
                trunkArr.splice(m, 1);
                movidos++;
            } else {
                m++;
            }
        }
        setModuleData(SAVE_KEY, data);
        return true;
    }

    // Quitar del baul. La salud sale DE LA FILA QUE SE SACA, no de un default:
    // un stack de chatarra al 40% en el baul sigue al 40% cuando llega a la
    // mochila. Se cuenta antes de restar, por el mismo motivo que en addToTrunk.
    var hay = 0;
    var salud = SALUD_MAX;
    var saludTomada = false;
    for (var i = 0; i < trunkArr.length; i++) {
        if (trunkArr[i].id !== id) continue;
        hay += (trunkArr[i].qty || 1);
        if (!saludTomada) { salud = clampSalud(trunkArr[i].salud); saludTomada = true; }
    }
    if (hay < qty) return false;

    var faltan = qty;
    for (var i2 = 0; i2 < trunkArr.length && faltan > 0; ) {
        if (trunkArr[i2].id !== id) { i2++; continue; }
        var toma = trunkArr[i2].qty || 1;
        if (toma > faltan) toma = faltan;
        trunkArr[i2].qty -= toma;
        faltan -= toma;
        if (trunkArr[i2].qty <= 0) trunkArr.splice(i2, 1);
    }

    // Agregar al inventario
    for (var j = 0; j < data.items.length; j++) {
        if (data.items[j].id === id) {
            data.items[j].qty += qty;
            setModuleData(SAVE_KEY, data);
            return true;
        }
    }
    data.items.push({ id: id, qty: qty, salud: salud });
    setModuleData(SAVE_KEY, data);
    return true;
}

// ============================================================================
// CINTURON — cargadores equipados (MISC.MAG_BELT_SLOTS casillas ficticias)
// ============================================================================

// equipMagToBelt — mueve 1 cargador del inventario a la primera casilla libre.
// El cargador equipado deja de contar peso (sale de items[]).
export function equipMagToBelt(id) {
    if (!isMagazine(id)) return false;
    var data = ensureTrunks(getModuleData(SAVE_KEY));
    var belt = ensureBelt(data);
    var free = -1;
    for (var i = 0; i < belt.length; i++) {
        if (!belt[i]) { free = i; break; }
    }
    if (free < 0) { showTextBox(t("BELTFUL")); return false; }
    var best = -1;
    for (var m = 0; m < data.items.length; m++) {
        var it = data.items[m];
        if (it.id !== id) continue;
        if (best < 0 || (it.ammo || 0) > (data.items[best].ammo || 0)) best = m;
    }
    if (best < 0) return false; // sin cargador de ese tipo en el inventario
    belt[free] = data.items[best];
    data.items.splice(best, 1);
    setModuleData(SAVE_KEY, data);
    return true;
}

// unequipBeltMag — devuelve la casilla al inventario (respeta el peso maximo)
export function unequipBeltMag(index) {
    var data = ensureTrunks(getModuleData(SAVE_KEY));
    var belt = ensureBelt(data);
    var mag = belt[index];
    if (!mag) return false;
    var def = ITEMS[mag.id];
    if (def && getTotalWeight() + def.weight * (mag.qty || 1) > MISC.MAX_INVENTORY_WEIGHT) {
        showTextBox(t("INV_FUL"));
        return false;
    }
    belt[index] = null;
    data.items.push(mag);
    setModuleData(SAVE_KEY, data);
    return true;
}
