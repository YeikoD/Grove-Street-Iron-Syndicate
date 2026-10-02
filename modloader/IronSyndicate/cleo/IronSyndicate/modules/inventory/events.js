// GSIS - Inventory: events
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Los handlers del bus que el modulo de inventario ATIENDE. Tres, y los tres son
// de armas:
//
//   items:takeWeapon     sacar UN arma del inventario. Responde la fila, o null.
//   items:storeWeapon    devolverla, con la municion que tenia en la mano.
//   items:takeMagazine   sacar UN cargador. Responde la fila, o null.
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
import { SALUD_MAX } from "../../data/gsis_item_data.js";
import {
    ITEMS_TAKE_WEAPON, ITEMS_STORE_WEAPON, ITEMS_TAKE_MAGAZINE
} from "../../core/gsis_EventNames.js";
import { SAVE_KEY } from "./state.js";

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
        ammo: d.ammo || 0
    });
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

    return {
        id: fila.id,
        salud: fila.salud === undefined ? SALUD_MAX : fila.salud,
        ammo: fila.ammo || 0
    };
}

// El nombre que ESTE modulo emite. Declarado en el archivo del dueno y no en
// EventNames.js, porque no es un contrato: es un aviso de una sola via, para el
// que quiera escucharlo sin tener que preguntar el inventario cada frame.
//
// Cuando se agregue un consumidor, la linea que hay que borrar es la del `on(...)`
// que se sume, no esta.
export var INVENTORY_CHANGED = "inventory:changed";