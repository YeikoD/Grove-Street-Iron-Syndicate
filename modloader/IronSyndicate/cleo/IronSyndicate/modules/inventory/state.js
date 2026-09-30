// GSIS - Inventory: state
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Los CONTENEDORES y como se leen: el inventario del jugador, los baules de los
// vehiculos y el cinturon de cargadores. Y las fabricas de instancias, que son
// la forma en que un item entra al mundo.
//
// Que sea "state" y no "logic" es una distincion que importa: aca no se DECIDE
// nada. No se chequea peso, no se avisa que el inventario esta lleno, no se
// cambia de contenedor. Eso es logic.js. Aca solo se pregunta "que hay" y se
// construyen filas.
//
// La regla de por que el corte esta aca y no en otro lado: todo lo que se
// necesita para CONSTRUIR una fila (la capacidad, la salud, el default de ammo)
// vive en state, y logic la usa. Al reves, logic/state se importarian entre si
// para siempre, y un ciclo de imports es un undefined en runtime en el modulo
// que se importa primero.
//
// ============================================================================
// LA CAPACIDAD DE UN CARGADOR, Y POR QUE SE PREGUNTA
// ============================================================================
// `capacityOfItem()` NO importa la tabla de armas. Pregunta por el bus.
//
// La capacidad de un cargador es una propiedad de la COMBINACION de arma y
// cargador, y la unica tabla que lo sabe es la de variantes
// (data/gsis_weapons.js). Importarla desde aca era el ultimo import directo que
// quedaba entre este modulo y el de armas, y significaba dos caminos a la misma
// verdad: uno por la tabla y otro por el bus. Con dos caminos, cambiar la tabla
// puede cambiar un cargador y no el otro, y el sintoma es un cargador que nace
// con las balas de otro.
//
// Asi que: el modulo de armas REGISTRA `weapons:capacityOfItem` y se pregunta.
//
// Cuando no contesta, la respuesta es 0, y hay que saber que significa. 0 no es
// "el cargador no tiene capacidad": es "no se pudo preguntar". Un cargador nuevo
// nace vacio, que se ve (el jugador lo carga) y no rompe el inventario. Un
// numero inventado, en cambio, no se ve hasta que el motor no puede recargar y
// el arma se traba. Se avisa UNA vez, en el log, con el item que no pudo
// preguntar.
// ============================================================================

import { registerModule, getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { MISC } from "../../core/gsis_Config.js";
import { query } from "../../core/gsis_EventBus.js";
import { WEAPONS_CAPACITY } from "../../core/gsis_EventNames.js";
import { getVehicleTrunkCapacity } from "../../data/gsis_vehicle_data.js";
import { ITEMS, SALUD_MAX, clampSalud, isInstanced } from "../../data/gsis_item_data.js";

// La clave del modulo en el save. NO se renombra: es la que todos los saves del
// mundo tienen escrita, y un rename de save sin su migracion deja a todos con el
// inventario vacio. Ver SaveMigration.js.
export var SAVE_KEY = "ItemManager";

// ---------------------------------------------------------------------------
// LA PREGUNTA
// ---------------------------------------------------------------------------
// Un aviso por item, no por llamada: la de no-contestar es una falla de
// arranque, y si aparece 3000 veces en el log lo que se lee es ruido en vez de
// la causa.
var _sinCapacidad = {};

export function capacityOfItem(itemId) {
    var cap = query(WEAPONS_CAPACITY, { itemId: itemId });
    if (typeof cap === "number" && cap > 0) return cap;
    if (!_sinCapacidad[itemId]) {
        _sinCapacidad[itemId] = true;
        log("[Inventory] WARN: el modulo de armas no respondio la capacidad de \"" +
            itemId + "\". Se usa 0, asi que el item nace vacio. El modulo de armas " +
            "se importa antes que este en cleo/../gsis_index.js; si no esta, el fallo " +
            "esta ahi y no en la capacidad.");
    }
    return 0;
}

// ---------------------------------------------------------------------------
// PREDICADOS DEL CATALOGO
// ---------------------------------------------------------------------------
// true si el item es cargador (type magazine) — no se apila
export function isMagazine(id) {
    var def = ITEMS[id];
    return !!(def && def.type === "magazine");
}

// ---------------------------------------------------------------------------
// FABRICAS DE INSTANCIAS
// ---------------------------------------------------------------------------
// Instancia de cargador: qty=1, ammo=capacidad, salud=100 (no stack)
export function makeMagazineInstance(id, ammo, salud) {
    var cap = capacityOfItem(id);
    return {
        id: id,
        qty: 1,
        ammo: (ammo === undefined || ammo === null) ? (cap || 0) : ammo,
        salud: clampSalud(salud)
    };
}

// Instancia de arma: qty=1, cargador montado por defecto (hasMag=true, ammo=cap)
export function makeWeaponInstance(id, hasMag, ammo, salud) {
    var cap = capacityOfItem(id) || 0;
    var mounted = (hasMag === undefined || hasMag === null) ? true : !!hasMag;
    return {
        id: id,
        qty: 1,
        hasMag: mounted,
        ammo: (ammo === undefined || ammo === null) ? (mounted ? cap : 0) : ammo,
        salud: clampSalud(salud)
    };
}

// Instancia generica (cargador o arma) con opts { ammo, salud, hasMag }
export function makeInstance(id, opts) {
    if (isMagazine(id)) {
        return makeMagazineInstance(id, opts ? opts.ammo : undefined, opts ? opts.salud : undefined);
    }
    return makeWeaponInstance(id, opts ? opts.hasMag : undefined, opts ? opts.ammo : undefined,
        opts ? opts.salud : undefined);
}

// ---------------------------------------------------------------------------
// LECTURAS
// ---------------------------------------------------------------------------
// Obtener todos los items del inventario
export function getItems() {
    var data = getModuleData(SAVE_KEY);
    if (!data) return [];
    if (!data.items) return [];
    return data.items || [];
}

// Peso total del inventario (solo items[]: lo equipado sale de la lista,
// tanto armas como cargadores del cinturon, y por tanto no pesa)
export function getTotalWeight() {
    var items = getItems();
    var total = 0;
    for (var i = 0; i < items.length; i++) {
        var def = ITEMS[items[i].id];
        if (def) total += def.weight * items[i].qty;
    }
    return total;
}

// ---------------------------------------------------------------------------
// NORMALIZACION DE LOS CONTENEDORES
// ---------------------------------------------------------------------------
//。这些 dos son internos pero se exportan para que logic.js pueda garantizar
// que un contenedor existe antes de escribir en el. Es el mismo criterio que
// "state no decide":确保 la forma es trabajo de state, mutar el contenido es de
// logic.
export function ensureTrunks(data) {
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];
    if (!data.trunks) data.trunks = {};
    return data;
}

// Normaliza data.belt a al menos MAG_BELT_SLOTS casillas (null = libre)
export function ensureBelt(data) {
    if (!data.belt || typeof data.belt.length !== "number") data.belt = [];
    while (data.belt.length < MISC.MAG_BELT_SLOTS) data.belt.push(null);
    return data.belt;
}

// Obtener items del baul de un vehiculo
export function getTrunkItems(vehicleId) {
    var data = getModuleData(SAVE_KEY);
    data = ensureTrunks(data);
    return data.trunks[vehicleId] || [];
}

// Peso total del baul de un vehiculo
export function getTrunkWeight(vehicleId) {
    var items = getTrunkItems(vehicleId);
    var total = 0;
    for (var i = 0; i < items.length; i++) {
        var def = ITEMS[items[i].id];
        if (def) total += def.weight * items[i].qty;
    }
    return total;
}

// Capacidad maxima del baul
export function getTrunkMaxCapacity(vehicleId) {
    var vehicleData = getModuleData("VehicleModule");
    if (!vehicleData || !vehicleData.vehicles) return 150;
    for (var i = 0; i < vehicleData.vehicles.length; i++) {
        if (vehicleData.vehicles[i].id === vehicleId) {
            return getVehicleTrunkCapacity(vehicleData.vehicles[i].model);
        }
    }
    return 150;
}

// getBelt — casillas del cinturon: [instanciaCargador | null, ...]
export function getBelt() {
    var data = getModuleData(SAVE_KEY);
    if (!data) return [];
    return ensureBelt(ensureTrunks(data));
}

// ---------------------------------------------------------------------------
// MIGRACIONES DE CARGA
// ---------------------------------------------------------------------------
// Saves viejos: { id, qty > 1 } de un item instanciado → una entrada por unidad
// con estado por defecto (cargador montado lleno). Devuelve true si cambio algo.
function _splitStacks(list) {
    if (!list) return false;
    var out = [];
    var changed = false;
    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var qty = it.qty || 1;
        if (qty > 1 && isInstanced(it.id)) {
            changed = true;
            for (var q = 0; q < qty; q++) out.push(makeInstance(it.id, it));
        } else {
            out.push(it);
        }
    }
    if (!changed) return false;
    list.length = 0;
    for (var j = 0; j < out.length; j++) list.push(out[j]);
    return true;
}

// Migracion de salud, una fila por fila. Devuelve true si cambio algo.
//
// El campo viejo era `quality`: entero 1..N, mostrado como "Cal: N" pegado al
// nombre. Se unifica en `salud` (0..100, columna propia) y `quality` desaparece.
//
// La conversion es exacta: `quality` solo valia 1 — makeMagazineInstance hacia
// `quality || 1` y NADIE pasaba opts.quality, asi que nunca se escribio otro
// valor — y 1 era "como nuevo", que es SALUD_MAX. Asi que toda fila vieja vale
// SALUD_MAX y no se pierde estado que valiera la pena.
//
// Se aplica a items[], a TODOS los baules y tambien a belt[]: el cinturon es un
// contenedor de ItemManager mas y sus cargadores son filas como las otras. Antes
// la migracion no lo miraba, y un cinturon de un save viejo se quedaba sin
// salud — la pagina la dibujaba al 100% por el fallback, sin que nadie lo supiera.
function _migrateSalud(list) {
    if (!list) return false;
    var changed = false;
    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it) continue;
        if (it.quality !== undefined) {
            delete it.quality;
            changed = true;
        }
        var s = clampSalud(it.salud);
        if (it.salud !== s) {
            it.salud = s;
            changed = true;
        }
    }
    return changed;
}

// Normaliza items[], trunks y belt al cargar partida.
//
// El orden importa. _splitStacks va PRIMERO porque crea filas nuevas con
// makeInstance, que ya escribe salud; si _migrateSalud corriera antes, todavia
// no existirian. Al reves es un gasto inutil, no un error: _migrateSalud es
// idempotente.
export function normalizeInstances(data) {
    if (!data) return false;
    var changed = false;
    if (_splitStacks(data.items)) changed = true;
    if (_migrateSalud(data.items)) changed = true;
    if (data.belt && _migrateSalud(data.belt)) changed = true;
    if (data.trunks) {
        for (var key in data.trunks) {
            if (Object.prototype.hasOwnProperty.call(data.trunks, key)) {
                if (_splitStacks(data.trunks[key])) changed = true;
                if (_migrateSalud(data.trunks[key])) changed = true;
            }
        }
    }
    return changed;
}

// ---------------------------------------------------------------------------
// INIT DEL ESTADO
// ---------------------------------------------------------------------------
// Sin export de la funcion: la llama el register() de index.js, y registrar por
// el modulo y no por nombre es lo que hace que este archivo no dependa de
// ModuleRegistry.
export function initState() {
    // belt: cinturon de cargadores equipados (MISC.MAG_BELT_SLOTS casillas)
    registerModule(SAVE_KEY, { items: [], trunks: {}, belt: [] });
    var data = getModuleData(SAVE_KEY);
    if (data && normalizeInstances(data)) setModuleData(SAVE_KEY, data);
    log("[Inventory] ItemManager inicializado");
}
