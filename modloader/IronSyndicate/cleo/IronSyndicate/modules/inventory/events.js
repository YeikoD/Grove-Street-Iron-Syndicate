// GSIS - Inventory: events
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Los handlers del bus que el modulo de inventario ATIENDE. Todos son de armas:
// sacar, devolver, y tocar la municion de un cargador.
//
//   items:takeWeapon     sacar UN arma del inventario. Responde la fila, o null.
//   items:storeWeapon    devolverla. El arma vuelve DESNUDA: su municion es la del
//                        cargador que tiene puesto, y ese se va por otro lado.
//   items:takeMagazine   sacar UN cargador. Responde la fila, o null.
//   items:storeMagazine  devolver UN cargador, con las balas que le quedaron.
//   items:magAmmo        leer la municion de un cargador de la mochila, por indice.
//   items:setMagAmmo     escribirla, sin sacarlo de la mochila.
//   items:magSource      la fila de la mochila con mas balas de un id, sin sacarla.
//
// Que vuelvan es la razon de ser del archivo: un `events.js` que no atiende nada
// es un archivo vacio con un import, y este fue el lugar donde el modulo de armas
// declaro el contrato con el.
//
// ============================================================================
// LAS TRES REGLAS DE ESTOS HANDLERS
// ============================================================================
// 1. NADA PARCIAL. Si no hay el item, se responde `null` y no se toca nada. Un
//    "quedaste sin 1 de 2" es peor que un "no hay": el jugador no sabe si perdio
//    algo. Es la misma REGLA 1 de logic.js, y se repite por el mismo motivo.
//
// 2. SE DEVUELVE LA FILA, NO UNA COPIA. El que pide la fila la tiene, y por eso el
//    que la devolvio tiene que GUARDARLA con el estado que le fue agregado —si
//    no, la municion que cargo se pierde—.
//
// 3. EL GASTO ES DEL QUE PIDE. Quien pide el item decide si lo usa: si el motor
//    lo rechaza, avisa con `items:storeWeapon` y la pieza vuelve intacta. Si el
//    inventario gastara la pieza y esperara que se la devuelvan, un fallo del
//    otro lado seria una pieza perdida.
// ============================================================================

import { on } from "../../core/gsis_EventBus.js";
import { getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { ITEMS, SALUD_MAX } from "../../data/gsis_item_data.js";
import { capacidadDeclarada } from "../../data/gsis_weapons.js";
import { MISC } from "../../core/gsis_Config.js";
import {
    ITEMS_TAKE_WEAPON, ITEMS_STORE_WEAPON, ITEMS_TAKE_MAGAZINE, ITEMS_STORE_MAGAZINE,
    ITEMS_TAKE_ACCESSORY, ITEMS_STORE_ACCESSORY,
    ITEMS_MAG_AMMO, ITEMS_SET_MAG_AMMO, ITEMS_MAG_SOURCE
} from "../../core/gsis_EventNames.js";
import { SAVE_KEY, getTotalWeight } from "./state.js";

// Los handlers se registran al IMPORTAR este archivo, no en init().
//
// Razon en el init del modulo: initSaveManager() corre loadGame() antes que
// initAll(), y si un modulo preguntara el inventario durante la carga de un save,
// el handler tiene que existir YA.

// Un arma se saca por el id, este con el que venga. Un arma desnuda es una fila
// valida: no se filtra por municion.
on(ITEMS_TAKE_WEAPON, function (e) {
    e.respond(_sacarUno(e.data ? e.data.id : null, false));
});

// Un cargador se saca solo si TIENE balas, y se saca el que las tenga: si hay dos
// cargadores y uno esta vacio, sacar el vacio primero obliga a una segunda llamada
// para el bueno, y la segunda puede no tener.
//
// Que el cargador salga del inventario con su municion es lo que hace que dos
// cargadores del mismo id no sean la misma cosa.
on(ITEMS_TAKE_MAGAZINE, function (e) {
    e.respond(_sacarUno(e.data ? e.data.id : null, true));
});

// Devolver un arma al inventario. Es el camino de vuelta de dos lugares: el
// desequipar, y el modulo de armas revirtiendo un give que el motor no acepto.
//
// `ammo` viaja en la fila. No se tira: es lo que hace que desequipar a mitad de
// un cargador devuelva un arma con balas y no una desnuda.
//
// `silenciador` tambien viaja, y es el que hace que esto no sea un bug. El
// silenciador esta MONTADO en el arma y por eso no es un item de la mochila: su unico
// hogar es la fila. Si este handler no lo copiara, `desequipar` devolveria el arma
// sin el silenciador y `equipar` la devolveria pelada, y el jugador perderia la
// pieza —el silenciador volveria a la mochila por el camino de `quitarSilenciador` y
// el arma pelada se llevaria el juego entero—. Un item que viaja con otro es un dato
// mas de la fila, no una tabla aparte.
on(ITEMS_STORE_WEAPON, function (e) {
    var d = e.data;
    if (!d || !d.id) {
        e.respond(null);
        return;
    }
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];
    data.items.push({
        id: d.id,
        qty: 1,
        salud: d.salud === undefined ? SALUD_MAX : d.salud,
        ammo: d.ammo || 0,
        silenciador: !!d.silenciador
    });
    setModuleData(SAVE_KEY, data);
    e.respond(true);
});

// Devolver un cargador al inventario. Lo emite el modulo de armas cuando el jugador
// saca uno de la ranura de equipados.
//
// La fila NO lleva `salud`, y esa es la diferencia con el handler de arriba: un
// cargador no tiene desgaste. `ammo` si viaja, y con lo que le queda: un cargador de
// 15 usado en un arma de 8 vuelve con 7, no con 15.
on(ITEMS_STORE_MAGAZINE, function (e) {
    var d = e.data;
    if (!d || !d.id) {
        e.respond(null);
        return;
    }
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];
    data.items.push({
        id: d.id,
        qty: 1,
        ammo: d.ammo || 0
    });
    setModuleData(SAVE_KEY, data);
    e.respond(true);
});

// Sacar una fila por id, sin filtro de municion. Es el camino de las piezas que no
// son armas ni cargadores: el silenciador.
on(ITEMS_TAKE_ACCESSORY, function (e) {
    e.respond(_sacarUno(e.data ? e.data.id : null, false));
});

// Devolver un accesorio a la mochila.
//
// EL PESO SE CHEQUEA ACA y el handler devuelve false si no entra, en vez de
// agregar la fila y avisar despues. La razon es el ORDEN de las escrituras del
// modulo de armas: para desmontar un silenciador hace falta saber que vuelve a la
// mochila ANTES de cambiar el flag del arma y el tipo del motor. Con un handler que
// siempre agrega, el modulo no tendria forma de saber si la pieza se perdio, y un
// silenciador que desaparece del mundo no se puede recuperar.
on(ITEMS_STORE_ACCESSORY, function (e) {
    var d = e.data;
    if (!d || !d.id || !ITEMS[d.id]) {
        e.respond(false);
        return;
    }
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];

    var peso = ITEMS[d.id].weight;
    if (getTotalWeight() + peso > MISC.MAX_INVENTORY_WEIGHT) {
        e.respond(false);
        return;
    }

    data.items.push({ id: d.id, qty: 1, salud: SALUD_MAX, ammo: 0 });
    setModuleData(SAVE_KEY, data);
    e.respond(true);
});

// Saca UNA fila del id pedido y la devuelve. null si no hay.
//
// Se elige la fila CON balas cuando el que pide las quiere, y no la primera que
// aparezca: es la misma razon del handler de arriba.
function _sacarUno(id, conBalas) {
    if (!id) return null;
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];

    var elegido = -1;
    for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id !== id) continue;
        if (conBalas && (data.items[i].ammo || 0) <= 0) continue;
        elegido = i;
        break;
    }
    // Si pedia balas y no hay ninguna fila con balas, NO se saca una vacia: la
    // respuesta es null y el modulo de armas le avisa al jugador que no tiene
    // cargador. Un cargador de cero balas montado en un arma vacia es un
    // "no tenes cargador" que el jugador no entiende.
    if (elegido < 0) return null;

    var fila = data.items[elegido];
    data.items.splice(elegido, 1);
    setModuleData(SAVE_KEY, data);

    // `silenciador` se copia siempre, y no solo cuando es true. Es lo que hace que
    // el arma vuelva a la mochila CON el silenciador montado: el modulo lo lee de
    // aca en `equipar` y lo escribe en el registro del slot. Un arma que perdiera el
    // flag en este viaje ya no lo recuperaria nunca, porque el silenciador ya no
    // esta en ningun otro lado del modulo.
    return {
        id: fila.id,
        salud: fila.salud === undefined ? SALUD_MAX : fila.salud,
        ammo: fila.ammo || 0,
        silenciador: !!fila.silenciador
    };
}

// ---------------------------------------------------------------------------
// LA MUNICION DE UN CARGADOR, POR INDICE
// ---------------------------------------------------------------------------
// Los tres handlers de la accion de RELLENAR. Ver la seccion de EventNames.js.
//
// La regla que los atraviesa: NADA se saca ni se agrega. Rellenar solo ESCRIBE la
// municion de dos filas que ya estan ahi. Si algo se moviera, los indices correrian
// y el segundo escribiria en la fila equivocada — que es la forma sutil de que un
// cargador aparezca con las balas de otro.

// Leer la fila de un indice. { id, ammo } o null si el indice no es un cargador.
//
// El `indice` se valida contra la lista viva, no contra un cache: por eso el
// handler lee el modulo otra vez y no confía en lo que le pasaron.
on(ITEMS_MAG_AMMO, function (e) {
    var d = e.data || {};
    var indice = d.indice;
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.items) { e.respond(null); return; }
    if (typeof indice !== "number" || indice < 0 || indice >= data.items.length) {
        e.respond(null);
        return;
    }
    var fila = data.items[indice];
    if (!fila || fila.ammo === undefined) { e.respond(null); return; }
    e.respond({ id: fila.id, ammo: fila.ammo || 0 });
});

// Escribir la municion de una fila, sin sacarla. true si se escribio.
//
// El `ammo` se recorta a la capacidad declarada del item: es el mismo techo que
// usa la tabla y no uno nuevo, para que "lleno" signifique lo mismo aca que en la
// fila que ve el jugador.
on(ITEMS_SET_MAG_AMMO, function (e) {
    var d = e.data || {};
    var indice = d.indice;
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.items) { e.respond(false); return; }
    if (typeof indice !== "number" || indice < 0 || indice >= data.items.length) {
        e.respond(false);
        return;
    }
    var fila = data.items[indice];
    if (!fila) { e.respond(false); return; }

    var cap = capacidadDeclarada(fila.id);
    var n = Math.max(0, Math.min(cap > 0 ? cap : d.ammo || 0, d.ammo || 0));
    fila.ammo = n;
    setModuleData(SAVE_KEY, data);
    e.respond(true);
});

// La fila de la mochila con MAS BALAS de un id. { indice, ammo } o null.
//
// No saca la fila: la devuelve con su indice. "Con mas balas" y no "la primera
// con balas" porque rellenar tiene que vaciarle a la que mejor puede, que es la
// unica que el jugador va a notar que se movio.
//
// `excluir` es el indice del cargador que se esta rellenando, y esta ahi por una
// razon muy concreta: si el destino tiene balas y es el mas lleno de la mochila,
// sin esto la "fuente" seria el mismo cargador que se quiere llenar, y el modulo se
// llenaria a si mismo sin mover un solo proyectil.
on(ITEMS_MAG_SOURCE, function (e) {
    var d = e.data || {};
    var id = d.id;
    var excluir = typeof d.excluir === "number" ? d.excluir : -1;
    if (!id) { e.respond(null); return; }
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.items) { e.respond(null); return; }

    var elegido = -1;
    var mejor = 0;
    for (var i = 0; i < data.items.length; i++) {
        if (i === excluir) continue;
        if (data.items[i].id !== id) continue;
        var n = data.items[i].ammo || 0;
        if (n > mejor) { mejor = n; elegido = i; }
    }
    if (elegido < 0) { e.respond(null); return; }
    e.respond({ indice: elegido, ammo: mejor });
});

// El nombre que ESTE modulo emite. Declarado en el archivo del dueno y no en
// EventNames.js, porque no es un contrato: es un aviso de una sola via, para el
// que quiera escucharlo sin tener que preguntar el inventario cada frame.
//
// Cuando se agregue un consumidor, la linea que hay que borrar es la del `on(...)`
// que se sume, no esta.
export var INVENTORY_CHANGED = "inventory:changed";