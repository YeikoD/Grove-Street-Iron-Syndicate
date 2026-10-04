// GSIS - Inventory: logic
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Mover items: al inventario, al baul, y sacarlos.
//
// Y las dos reglas que hacen que una operacion de inventario no trague cosas:
//
//   1. NADA PARCIAL. Si no hay `qty` unidades, no se toca nada y se devuelve
//      false. No se quita "lo que haya" y se dice que salio. Durante un tiempo si
//      se hacia, y el bug era de las tres formas:
//
//        - Pedir 5 con 3 en un stack: `qty - 5` daba negativo, la fila se borraba
//          entera (3 reales) y la funcion devolvia true. Perdia 3 y reportaba
//          exito. Ahora devuelve false y el item no se mueve.
//        - Un id apilable repartido en DOS filas (2 + 1) contaba 3 unidades pero
//          el bucle solo tocaba la primera: cobrabas 3 y solo se perdia la
//          primera fila. Ahora se recorren todas.
//        - Un item INSTANCIADO con 3 filas y qty 5: el bucle sacaba las 3, y el
//          `if (removed < qty) return false` de despues ya no podia volver
//          atras. Devolvia false con las 3 filas ya spliceadas de la copia, asi
//          que perdia 3 y reportaba que no se habia hecho nada. El chequeo va
//          antes del bucle ahora, como en `addToTrunk`.
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
//
// Y las dos se comprueban probandose, no leyendo: .IronSyndicate/tools/inventario.mjs
// tiene una seccion que rompe el invariante a proposito y ejercita las ramas de
// instanciado con un item temporal. Ver seccion 6 de ese archivo.
// ============================================================================

// ============================================================================
// LO QUE SE FUE CON EL SISTEMA DE ARMAS
// ============================================================================
//   entregaOpts()        que estado trae un item QUE SE ENTREGA. Antes era el
//                        camino unico de "un arma se entrega DESNUDA" y "un
//                        cargador se entrega NUEVO y lleno", y los tres que lo
//                        llamaban (DealerPickup, flow.js, el debug del modulo)
//                        lo llamaban para no depender de una copia de la regla.
//                        Con el catalogo de una fila no hay ningun estado que
//                        decidir: `addItem(id, qty)` y listo.
//
//   equipMagToBelt()    el cinturon de cargadores: 3 casillas ficticias donde
//   unequipBeltMag()     vivian los cargadores puestos, alimentadas por la tecla
//                        R. Sin armas no hay nada que poner ahi.
//
// Las dos rutas de apilables de este archivo —addItem/removeItem y
// addToTrunk/removeFromTrunk— ya tienen su rama de "instanciado" y hoy toman
// siempre la de "apilable". Se conservan: son la parte de la regla que no depende
// del catalogo, y volverian a ser la correcta en cuanto haya un item
// instanciado. Ver isInstanced() en data/gsis_item_data.js.
// ============================================================================

import { getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { MISC } from "../../core/gsis_Config.js";
import { t } from "../../core/gsis_L10n.js";
import { ITEMS, SALUD_MAX, clampSalud, isInstanced } from "../../data/gsis_item_data.js";
import { municionDeFabrica } from "../../data/gsis_weapons.js";
import {
    SAVE_KEY, getItems, getTotalWeight, ensureTrunks, getTrunkMaxCapacity
} from "./state.js";

// entregaOpts — QUE ESTADO TRAE UN ITEM QUE SE ENTREGA.
//
// SE BORRO CON EL SISTEMA DE ARMAS. Existia por una regla que ya no tiene objeto:
// "un arma se entrega DESNUDA, sin cargador y con 0 balas" y "un cargador se
// entrega NUEVO y lleno". Las dos mitades se fueron con el catalogo, asi que no
// queda ningun estado que decidir: `addItem(id, qty)` arma la fila entera.
//
// Y no se reemplazo por un `undefined` en los tres que la llamaban: un reexport
// que devuelve siempre lo mismo es ruido. El que lo consumia de verdad —el
// preview del pedido de la armeria— ya no tiene que mostrar municion porque la
// armeria no vende nada.

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

    // Instancias (una fila por unidad, sin stack)
    //
    // `ammo` se escribe SIEMPRE, tambien en cero. Es lo que distingue una fila de
    // arma desnuda de una fila de cargador vacio, y sin el campo el cargador
    // partiria indistinguible de uno nuevo. Lo decide data/gsis_weapons.js: un arma
    // nace con 0 y un cargador con las balas que trae de fabrica.
    if (isInstanced(id)) {
        for (var m = 0; m < qty; m++) {
            data.items.push({
                id: id,
                qty: 1,
                salud: SALUD_MAX,
                ammo: municionDeFabrica(id)
            });
        }
        setModuleData(SAVE_KEY, data);
        return true;
    }

    // EL TOPE POR FILA, Y POR QUE SOLO LO RESPETA EL QUE LO DECLARA
    //
    // `maxStack` es opt-in a proposito. Un item que no lo declara se apila en una
    // sola fila y punto: la chatarra con 400 unidades es UNA fila, que es como se
    // comportaba antes de que existieran las balas y como se sigue comportando.
    // Ponerle un tope general habria roto el arbol entero para acomodar un caso, y
    // habria que decidir un numero que todavia no existe.
    //
    // Y con tope, la fila LLENA se COMPLETA antes de abrir una nueva: agregar 30
    // balas a un stock de 37 da 50 y 17 en dos filas, no una de 67. Al reves se
    // desperdiciaria el hueco de la primera fila para siempre.
    var tope = ITEMS[id].maxStack || 0;

    if (tope > 0) {
        var quedan = qty;
        for (var s = 0; s < data.items.length && quedan > 0; s++) {
            if (data.items[s].id !== id) continue;
            var hueco = tope - (data.items[s].qty || 0);
            if (hueco <= 0) continue;
            // NO se toca su salud: el stack es una fila con una salud, y agregar no
            // cambia la unidad que ya estaba ahi. La regla de "gastar de un stack
            // gastado" la aplica quien consuma, no el alta.
            var entra = Math.min(hueco, quedan);
            data.items[s].qty += entra;
            quedan -= entra;
        }
        while (quedan > 0) {
            var nuevas = Math.min(tope, quedan);
            data.items.push({ id: id, qty: nuevas, salud: SALUD_MAX });
            quedan -= nuevas;
        }
        setModuleData(SAVE_KEY, data);
        return true;
    }

    for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === id) {
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

    // Instancias: una fila por unidad, y se quita de a UNA fila.
    //
    // EL CHEQUEO VA ANTES DE TOCAR NADA, y ese es el punto entero: la version
    // anterior hacia los `splice` en el bucle y recien despues miraba si habia
    // sobrado o faltado. Con 3 filas y `qty: 5` sacaba 3, devolvia false, y para
    // entonces ya habia modificado `data.items` de la copia: las tres filas se
    // perdian igual y el modulo informaba "no se pudo".
    //
    // Es el mismo bug que el comentario de `addToTrunk` describe como ya
    // corregido alla. Esta rama no se toco cuando se corrigio el otro lado, y
    // llevaba el tiempo muerto: con `ITEMS` sin nada instanciado, la rama no se
    // ejecutaba nunca y no se podia notar.
    //
    // La version buena esta en `addToTrunk`: se cuenta primero, se compara con lo
    // pedido, y solo entonces se mueve.
    if (isInstanced(id)) {
        var disponible = 0;
        for (var c0 = 0; c0 < data.items.length; c0++) {
            if (data.items[c0].id === id) disponible++;
        }
        // Menos de las pedidas: no se saca NINGUNA. Un "quedaste sin 2 de 5"
        // parcial es peor que un "no hay" limpio, porque el jugador no sabe si
        // perdio algo.
        if (disponible <= 0) return false;
        if (disponible < qty) return false;
        var movidos = 0;
        for (var m = 0; m < data.items.length && movidos < qty; ) {
            if (data.items[m].id === id) {
                data.items.splice(m, 1);
                movidos++;
            } else {
                m++;
            }
        }
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
