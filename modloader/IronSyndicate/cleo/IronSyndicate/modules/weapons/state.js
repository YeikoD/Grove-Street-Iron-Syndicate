// GSIS - Weapons: state
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Lo unico que el modulo de armas PERSISTE: que arma esta equipada en cada slot.
//
//   GameState.Weapons.equipped[slot] = { id, salud }
//
// Y son DOS campos, no mas, y los dos por una razon:
//
//   id      el itemId. El weaponType NO se guarda: es la representacion que
//           ejecuta el motor y se deriva de la tabla. Un save que guarda el numero
//           queda con un arma distinta en cuanto la tabla cambie.
//
//   salud   0..100. El arma equipada NO esta en items[] mientras esta en la mano:
//           sale del inventario al equiparse. Es el unico sitio donde su desgaste
//           puede vivir sin perderse al desequiparla.
//
// LO QUE NO ESTA ACA, Y POR QUE
// ---------------------------------------------------------------------------
// LA MUNICION NO SE GUARDA. Vive en la memoria del ped, se lee de ahi y se copia
// al inventario en el momento del desequipar. Copiarla al save seria una segunda
// fuente, y la regla de la casa es que un dato tiene UN lugar: el juego es el
// dueno de la municion de un arma que el juego tiene.
//
// La fila equipada del inventario tampoco se guarda: se arma en el snapshot, con
// lo que hay aca mas lo que se lee del ped. Ver equipadasSnap().
//
// NO HAY VERSION DE SAVE PARA ESTO
// ---------------------------------------------------------------------------
// SAVE_FORMAT_VERSION es para cambios de ESQUEMA. Esto es un modulo nuevo con un
// default, y un modulo con default no necesita migracion: registerModule() crea
// `equipped` vacio en los saves que no lo tienen, y los saves viejos no tienen
// filas de armas que haya que interpretar.
//
// El save viejo del sistema borrado tenia `GameState.Ballistic`, y esa limpieza
// ya la hizo la migracion a v3. Ver core/gsis_SaveMigration.js.
// ============================================================================

import { registerModule, getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { ARMAS } from "../../data/gsis_weapons.js";
import { clampSalud } from "../../data/gsis_item_data.js";

// La clave del modulo en el save. Es un nombre NUEVO, no un rename del viejo: el
// viejo era "Ballistic", que ya no existe y que la migracion a v3 descarta.
export var SAVE_KEY = "Weapons";

// Lo que hay en equipped: { id, salud }. Null si el slot no tiene nada.
export function getEntry(slot) {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.equipped) return null;
    return data.equipped[slot] || null;
}

// Las filas equipadas, para el snapshot. Un array, no el mapa: la UI y el
// reconciliador quieren la lista, y el mapa es la forma del save.
export function getEntries() {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.equipped) return [];
    var out = [];
    for (var slot in data.equipped) {
        if (Object.prototype.hasOwnProperty.call(data.equipped, slot)) {
            var e = data.equipped[slot];
            if (e && e.id && ARMAS[e.id]) {
                out.push({ slot: parseInt(slot, 10), id: e.id, salud: clampSalud(e.salud) });
            }
        }
    }
    out.sort(function (a, b) { return a.slot - b.slot; });
    return out;
}

// Escribir el registro de un slot. `entry` null lo borra.
export function setEntry(slot, entry) {
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { equipped: {} };
    if (!data.equipped) data.equipped = {};

    if (!entry) {
        delete data.equipped[slot];
    } else {
        data.equipped[slot] = { id: entry.id, salud: clampSalud(entry.salud) };
    }
    setModuleData(SAVE_KEY, data);
}

// El init del modulo. Sin export, porque la llama el register() de gsis_Weapons.js:
// registrar por el modulo y no por nombre es lo que hace que este archivo no
// dependa de ModuleRegistry.
export function initState() {
    registerModule(SAVE_KEY, { equipped: {} });
    log("[Weapons] Registro de equipadas inicializado");
}