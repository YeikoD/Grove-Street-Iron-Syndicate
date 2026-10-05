// GSIS - Inventory: state
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Los CONTENEDORES y como se leen: el inventario del jugador y los baules de los
// vehiculos. Y la normalizacion de filas al cargar una partida.
//
// Que sea "state" y no "logic" es una distincion que importa: aca no se DECIDE
// nada. No se chequea peso, no se avisa que el inventario esta lleno, no se
// cambia de contenedor. Eso es logic.js. Aca solo se pregunta "que hay".
//
// ============================================================================
// LO QUE SE FUE, Y LO QUE ESTA MAL DICHO DE ESO
// ============================================================================
// Este archivo tuvo tres cosas que hoy no tienen a quien preguntar:
//
//   capacityOfItem()   la capacidad de un cargador. Preguntaba por el bus a
//                      `weapons:capacityOfItem`.
//   isMagazine()       y las fabricas makeMagazineInstance() /
//   makeWeaponInstance()  makeInstance().
//
// Y este header decia que se fueron "con el sistema de armas" y que "sin armas no
// hay cargadores que llevar".
//
// CORREGIDO el 04/10/2026. El sistema de armas esta vivo —modules/weapons/— y las
// tres funciones se fueron por otra razon: el modulo de armas dejo de preguntar por
// el bus y se calculo la capacidad solo. `capacidadDeItem()` vive hoy en
// gsis_Weapons.js, y no como un evento sino como una funcion que pregunta al motor
// con `Engine.clipCapacityOf`, que es la unica fuente de verdad de la capacidad.
//
// La segunda parte del header era la de `ensureBelt()` / `getBelt()`: 3 casillas de
// cargadores equipados, que eran el cinturon. Se substituyeron por las dos ranuras de
// `GameState.Weapons.cargadores`, que viven en el save del modulo de armas y no
// aca. El cinturon no se perdio: se movio de contenedor.
//
// Que addItem() sea, hoy, una linea —apila, pesa, avisa si no cabe— sigue siendo
// cierto, pero por la razon que corresponde: una fila de arma o de cargador es
// instanciada y la hace `_filaDeInstancia`, no que no haya armas.
// ============================================================================

import { registerModule, getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { getVehicleTrunkCapacity } from "../../data/gsis_vehicle_data.js";
import { ITEMS, SALUD_MAX, clampSalud, isInstanced } from "../../data/gsis_item_data.js";

// La clave del modulo en el save. NO se renombra: es la que todos los saves del
// mundo tienen escrita, y un rename de save sin su migracion deja a todos con el
// inventario vacio. Ver SaveMigration.js.
export var SAVE_KEY = "ItemManager";

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

// Peso total del inventario (solo items[]: lo que esta en un baul no pesa aca,
// porque pesa en el baul)
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
// Este es interno pero se exporta para que logic.js pueda garantizar que un
// contenedor existe antes de escribir en el. Es el mismo criterio que "state no
// decide": la forma es trabajo de state, mutar el contenido es de logic.
export function ensureTrunks(data) {
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];
    if (!data.trunks) data.trunks = {};
    return data;
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

// ---------------------------------------------------------------------------
// MIGRACIONES DE CARGA
// ---------------------------------------------------------------------------
// Saves viejos: { id, qty > 1 } de un item instanciado -> una entrada por unidad.
// Devuelve true si cambio algo.
//
// Con el catalogo sin items instanciados esto no parte nada nunca: la primera
// linea mira `isInstanced(it.id)` y para chatarra da false. Se conserva porque es
// una MIGRACION de saves, y un save viejo puede traer una fila de `qty > 1` de un
// arma —de las que el catalogo ya no conoce— y esa fila tiene que quedar como una
// sola entrada y no como un stack que no se puede gastar bien.
function _splitStacks(list) {
    if (!list) return false;
    var out = [];
    var changed = false;
    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var qty = it.qty || 1;
        if (qty > 1 && isInstanced(it.id)) {
            changed = true;
            for (var q = 0; q < qty; q++) out.push({ id: it.id, qty: 1, salud: SALUD_MAX });
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
// La conversion es exacta: `quality` solo valia 1 — la fabrica de instancias hacia
// `quality || 1` y NADIE pasaba opts.quality, asi que nunca se escribio otro
// valor — y 1 era "como nuevo", que es SALUD_MAX. Asi que toda fila vieja vale
// SALUD_MAX y no se pierde estado que valiera la pena.
//
// Se aplica a items[] y a TODOS los baules.
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

// Normaliza items[] y trunks al cargar partida.
export function normalizeInstances(data) {
    if (!data) return false;
    var changed = false;
    if (_splitStacks(data.items)) changed = true;
    if (_migrateSalud(data.items)) changed = true;
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
//
// NO se declara `belt` en el contenedor nuevo. Los saves viejos lo tienen —3
// casillas de cargador de un sistema que ya no existe— y no se borra: es memoria
// del save que ningun modulo lee, y vaciarla seria una migracion de escritura
// para datos que no le importan a nadie. Ver SaveMigration.js.
export function initState() {
    registerModule(SAVE_KEY, { items: [], trunks: {} });
    var data = getModuleData(SAVE_KEY);
    if (data && normalizeInstances(data)) setModuleData(SAVE_KEY, data);
    log("[Inventory] ItemManager inicializado");
}