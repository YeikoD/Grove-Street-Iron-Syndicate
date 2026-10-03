// GSIS - Weapons: state
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Lo unico que el modulo de armas PERSISTE, y son TRES registros:
//
//   GameState.Weapons.equipped[slot] = { id, salud }      que arma esta en cada slot
//   GameState.Weapons.cargadores     = [ { id, ammo } ]   los cargadores equipados
//   GameState.Weapons.enArma[slot]   = "mag_colt45"       QUE CARGADOR ESTA PUESTO
//
// Y los campos, y por que estan:
//
//   id      el itemId. El weaponType NO se guarda: es la representacion que
//           ejecuta el motor y se deriva de la tabla. Un save que guarda el numero
//           queda con un arma distinta en cuanto la tabla cambie.
//
//   salud   0..100. El arma equipada NO esta en items[] mientras esta en la mano:
//           sale del inventario al equiparse. Es el unico sitio donde su desgaste
//           puede vivir sin perderse al desequiparla.
//
//   ammo    solo en los cargadores, y por el mismo motivo: un cargador equipado
//           tampoco esta en items[], asi que su municion tiene que vivir aca. Sin
//           esto, equipar un cargador seria guardarlo vacio.
//
// POR QUE CARGADORES ES UNA LISTA Y EQUIPPED UN MAPA
// ---------------------------------------------------------------------------
// El arma se equipa en el SLOT DEL MOTOR, que va del 1 al 12 y es el mismo que
// guarda el juego: el mapa es la forma de un slot. Un cargador no va a ningun slot
// del motor: va a una ranura propia, y hay un maximo (WEAPONS.CARGADORES_EQUIPADOS).
// El orden de la lista es el de las ranuras, asi que ranura 1 es el indice 0.
//
// LA MUNICION DEL ARMA NO SE GUARDA
// ---------------------------------------------------------------------------
// La del arma en la mano vive en la memoria del ped y se copia al inventario al
// desequiparla. Copiarla al save seria una segunda fuente, y la regla de la casa es
// que un dato tiene UN lugar: el juego es el dueno de la municion de un arma que el
// juego tiene. La del cargador equipado SI se guarda, y no por contradiccion: el
// cargador no es del juego, es del mod.
//
// EL CARGADOR PUESTO: SOLO EL ID
// ---------------------------------------------------------------------------
// enArma[slot] es el MISMO cargador que uno de los cargadores, pero metido en el arma,
// y por eso no guarda `ammo`: sus balas son el clip, que es del juego. Lo que si hace
// falta es la IDENTIDAD, porque sin ella el cargador del arma no existe para el
// modulo: al recargar, el clip viejo se ponia en cero y el cargador se perdia para
// siempre. Solo el id alcanza para devolverlo con lo que le quedo.
//
// LA FILA EQUIPADA DEL INVENTARIO TAMPOCO SE GUARDA: se arma en el snapshot, con lo
// que hay aca mas lo que se lee del ped. Ver equipadasSnap().
//
// NO HAY VERSION DE SAVE PARA ESTO
// ---------------------------------------------------------------------------
// SAVE_FORMAT_VERSION es para cambios de ESQUEMA. Esto es un modulo nuevo con un
// default, y un modulo con default no necesita migracion: registerModule() crea
// `equipped` y `cargadores` vacios en los saves que no los tienen, y los saves viejos
// no tienen ni armas ni cargadores que haya que interpretar.
//
// El save viejo del sistema borrado tenia `GameState.Ballistic`, y esa limpieza
// ya la hizo la migracion a v3. Ver core/gsis_SaveMigration.js.
// ============================================================================

import { registerModule, getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { ARMAS, defDeCargador } from "../../data/gsis_weapons.js";
import { clampSalud } from "../../data/gsis_item_data.js";
import { WEAPONS } from "../../core/gsis_Config.js";

// La clave del modulo en el save. Es un nombre NUEVO, no un rename del viejo: el
// viejo era "Ballistic", que ya no existe y que la migracion a v3 descarta.
export var SAVE_KEY = "Weapons";

// Cuantos cargadores hay. El maximo vive en Config; la cantidad real depende de lo
// que haya en la lista y de lo que el catalogo todavia reconozca (ver getCargadores).
export function maxCargadores() {
    return WEAPONS.CARGADORES_EQUIPADOS;
}

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
    if (!data) data = { equipped: {}, cargadores: [] };
    if (!data.equipped) data.equipped = {};

    if (!entry) {
        delete data.equipped[slot];
    } else {
        data.equipped[slot] = { id: entry.id, salud: clampSalud(entry.salud) };
    }
    setModuleData(SAVE_KEY, data);
}

// ---------------------------------------------------------------------------
// LOS CARGADORES EQUIPADOS
// ---------------------------------------------------------------------------

// Los cargadores equipados, densos y en orden de ranura, para la UI y la recarga.
//
// La lista que hay en el save puede tener huecos si algo la dejo mal (un save
// editado, un modulo que se cayo a mitad de un setModuleData). Por eso el bucle
// compacta: lo que sale de aca tiene siempre los indices seguidos desde el 0, y el
// indice ES la ranura que ve el jugador.
//
// Un cargador cuyo id el catalogo ya no tiene se descarta en el camino, por la misma
// razon que un arma: dejarlo bloquea una ranura para siempre.
export function getCargadores() {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.cargadores) return [];
    var out = [];
    for (var i = 0; i < data.cargadores.length && i < maxCargadores(); i++) {
        var c = data.cargadores[i];
        if (c && c.id && defDeCargador(c.id)) {
            out.push({ indice: out.length, id: c.id, ammo: c.ammo || 0 });
        }
    }
    return out;
}

// La primera ranura libre, o -1 si estan las dos ocupadas.
export function ranuraLibre() {
    return getCargadores().length >= maxCargadores() ? -1 : getCargadores().length;
}

// Poner un cargador en una ranura. `entry` null saca el de esa ranura.
//
// La escritura pasa por la lista Densa: se arma con la lista que devuelve
// getCargadores() y se cambia una posicion, asi que en el save nunca queda un
// hueco en el medio. Sacar el del medio (ranura 0 de 2) deja el 1 corrida a la 0.
export function setCargador(indice, entry) {
    var lista = getCargadores();
    while (lista.length < indice && lista.length < maxCargadores()) {
        lista.push({ indice: lista.length, id: null, ammo: 0 });
    }

    if (!entry) {
        lista.splice(indice, 1);
    } else {
        if (indice < 0 || indice >= maxCargadores()) return false;
        lista[indice] = { indice: indice, id: entry.id, ammo: entry.ammo || 0 };
    }

    var data = getModuleData(SAVE_KEY) || { equipped: {} };
    if (!data.equipped) data.equipped = {};
    data.cargadores = lista;
    setModuleData(SAVE_KEY, data);
    return true;
}

// ---------------------------------------------------------------------------
// EL CARGADOR QUE ESTA PUESTO EN CADA ARMA
// ---------------------------------------------------------------------------
// Un arma tiene un cargador o no lo tiene, y eso no se deduce de nada: el motor no
// distingue "sin cargador" de "descargado", para el los dos son cero balas. Por eso
// vive aca, con el slot como clave, porque el arma vive en el slot del motor.
//
// `setCargadorEnArma(slot, null)` deja el arma desnuda.
export function getCargadorEnArma(slot) {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.enArma) return null;
    var id = data.enArma[slot];
    // Un id que el catalogo ya no tiene se trata como desnudo: el arma no puede
    // devolver un cargador que no existe, y dejarlo puesto bloquearia la recarga.
    if (!id || !defDeCargador(id)) return null;
    return id;
}

export function setCargadorEnArma(slot, id) {
    var data = getModuleData(SAVE_KEY) || { equipped: {}, cargadores: [], enArma: {} };
    if (!data.enArma) data.enArma = {};
    if (id && defDeCargador(id)) data.enArma[slot] = id;
    else delete data.enArma[slot];
    setModuleData(SAVE_KEY, data);
    return id || null;
}

// El init del modulo. Sin export, porque la llama el register() de gsis_Weapons.js:
// registrar por el modulo y no por nombre es lo que hace que este archivo no
// dependa de ModuleRegistry.
export function initState() {
    registerModule(SAVE_KEY, { equipped: {}, cargadores: [], enArma: {} });
    log("[Weapons] Registro de equipadas inicializado | cargadores: max " +
        maxCargadores());
}