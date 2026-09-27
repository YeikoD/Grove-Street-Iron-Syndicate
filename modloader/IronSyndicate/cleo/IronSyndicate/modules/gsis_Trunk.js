// GSIS - Trunk
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Trunk - Sistema de baules (abrir/cerrar, spheres, menu)
// ============================================================================
// Depende de: SaveManager, Config, ModuleRegistry, EventBus, Items, L10n, Notice
// Usa query("spawner:*") para handles (sin importar Spawner)
// ============================================================================

import { getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { KEYS, DIST, TIMERS, MISC } from "../core/gsis_Config.js";
import { keyJustPressed, registerMenuSource } from "../core/gsis_Input.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { on, query } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";
import { setNotice } from "../core/gsis_Notice.js";
import { ITEMS, getItemName } from "../data/gsis_item_data.js";
import {
    addToTrunk,
    removeFromTrunk,
    getTrunkItems,
    getTrunkWeight,
    getTrunkMaxCapacity,
    getItems,
    getTotalWeight,
    isInstanced
} from "./gsis_Items.js";

// Estado de baules abiertos
var _openTrunks = {}; // { vehicleId: { handle, pickup, lastUpdate, sphereX/Y/Z } }
var _openTrunkCount = 0;

// Estado del menu de baul
var _trunkOpen = false;
var _trunkCar = null;
var _showTrunkMenu = false;
var _trunkVehicleId = -1;
var _pendingTrunkStateSync = -1;

// ============================================================================
// API para Vehicles
// ============================================================================

// Tecla 3: alternar baul del vehiculo dado
export function toggleTrunk(entry) {
    try {
        if (!entry) {
            showTextBox(t("VHC_NON"));
            return;
        }

        var car = entry.handle;
        var vehicleId = entry.id;
        var isCurrentlyOpen = _openTrunks[vehicleId] !== undefined;

        if (!isCurrentlyOpen) {
            car.openDoor(1);
            _openTrunks[vehicleId] = {
                handle: car,
                pickup: null,
                lastUpdate: 0
            };
            _openTrunkCount++;
            _createTrunkPickupForVehicle(vehicleId, car);
            _updateTrunkStateInDataById(vehicleId, true);
        } else {
            car.fixDoor(1);
            _destroyTrunkPickupForVehicle(vehicleId);
            delete _openTrunks[vehicleId];
            _openTrunkCount--;
            _updateTrunkStateInDataById(vehicleId, false);
        }
    } catch (e) { }
}

// Restaurar baul abierto al spawnear vehiculo
export function restoreTrunk(vehicleId, car) {
    try {
        car.openDoor(1);
        _openTrunks[vehicleId] = {
            handle: car,
            pickup: null,
            lastUpdate: 0
        };
        _openTrunkCount++;
        _createTrunkPickupForVehicle(vehicleId, car);
        log("[Trunk] Baul restaurado para vehiculo id=" + vehicleId);
    } catch (e) { }
}

// Limpiar baul si el vehiculo murio/desaparecio
export function onVehicleDead(vehicleId) {
    if (!_openTrunks[vehicleId]) return;
    _destroyTrunkPickupForVehicle(vehicleId);
    delete _openTrunks[vehicleId];
    _openTrunkCount--;
    _updateTrunkStateInDataById(vehicleId, false);
}

// Leer si el baul de un vehiculo esta abierto (para batch de posiciones)
export function isTrunkOpenFor(vehicleId) {
    return _openTrunks[vehicleId] !== undefined;
}

// Persistir estado de todos los baules abiertos (F5)
export function syncStatesForSave() {
    if (_openTrunkCount <= 0) return;
    var vehicleIds = Object.keys(_openTrunks);
    for (var i = 0; i < vehicleIds.length; i++) {
        _updateTrunkStateInDataById(parseInt(vehicleIds[i]), true);
    }
}

// Tecla 3: alternar baul del vehiculo dado (entry via query a Spawner)
function handleTrunkKey(c) {
    if (!keyJustPressed(KEYS.TRUNK)) return;
    try {
        var entry = c.isInAnyCar()
            ? query("spawner:find", { car: c.getCarIsUsing() })
            : query("spawner:closest", { char: c });
        toggleTrunk(entry);
    } catch (e) { }
}

// Update por frame: tecla 3, pending sync, spheres, proximidad, menu, tecla B
export function updateTrunk(c, now, spawning) {
    handleTrunkKey(c);

    // Sincronizar estado pendiente (diferido tras closeTrunk)
    if (_pendingTrunkStateSync !== -1) {
        _updateTrunkStateInDataById(_pendingTrunkStateSync, false);
        _pendingTrunkStateSync = -1;
    }

    if (spawning) return;

    // --- Spheres: seguir al auto + destruir si auto destruido ---
    if (_openTrunkCount > 0) {
        var vehicleIds = Object.keys(_openTrunks);
        for (var i = vehicleIds.length - 1; i >= 0; i--) {
            var vid = parseInt(vehicleIds[i]);
            var trunkData = _openTrunks[vid];
            if (!trunkData) continue;

            var carExists = false;
            try { carExists = native("DOES_VEHICLE_EXIST", trunkData.handle); } catch (e) { }

            if (!carExists) {
                try { trunkData.handle.fixDoor(1); } catch (e) { }
                _destroyTrunkPickupForVehicle(vid);
                delete _openTrunks[vid];
                _openTrunkCount--;
                _updateTrunkStateInDataById(vid, false);
                log("[Trunk] Baul cerrado automaticamente (vehiculo destruido) id=" + vid);
            } else {
                var now2 = Date.now();
                if (now2 - trunkData.lastUpdate > TIMERS.TRUNK_SPHERE) {
                    trunkData.lastUpdate = now2;
                    _updateTrunkPickupForVehicle(vid, trunkData.handle);
                }
            }
        }
    }

    // --- Auto-abrir menu al tocar la sphere ---
    if (!c.isInAnyCar() && !_showTrunkMenu && _openTrunkCount > 0) {
        var pPos = c.getCoordinates();
        var ids = Object.keys(_openTrunks);
        for (var j = 0; j < ids.length; j++) {
            var id = parseInt(ids[j]);
            var td = _openTrunks[id];
            if (!td) continue;
            var exists = false;
            try { exists = native("DOES_VEHICLE_EXIST", td.handle); } catch (e) { }
            if (!exists) continue;
            var trunkPos = _getTrunkPos(td.handle);
            var dx = pPos.x - trunkPos.x;
            var dy = pPos.y - trunkPos.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < DIST.SPHERE) {
                _trunkCar = td.handle;
                _trunkVehicleId = id;
                _trunkOpen = true;
                _showTrunkMenu = true;
                break;
            }
        }
    }

    // --- Auto-cerrar menu al salirse de la sphere ---
    if (_showTrunkMenu && _trunkCar) {
        var pPos2 = c.getCoordinates();
        var tPos = _getTrunkPos(_trunkCar);
        var dx2 = pPos2.x - tPos.x;
        var dy2 = pPos2.y - tPos.y;
        var dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (dist2 > DIST.MENU_CLOSE || c.isInAnyCar()) {
            closeTrunkMenu();
        }
    }

    // --- B: toggle menu del baul mas cercano ---
    // La segunda mitad del toggle (volver a cerrarlo) es inalcanzable:
    // keyJustPressed devuelve false mientras haya un menu abierto, y este menu
    // es una registerMenuSource mas. Se cierra con la 3, alejandose 1.5 m, o
    // con Escape desde la pagina (que va por "ui:close" y llega a closeFlow()).
    if (keyJustPressed(KEYS.TRUNK_MENU)) {
        if (!c.isInAnyCar() && _openTrunkCount > 0) {
            var closestTrunkId = null;
            var closestDist = DIST.TRUNK_ACCESS;
            var pPos3 = c.getCoordinates();

            var rIds = Object.keys(_openTrunks);
            for (var k = 0; k < rIds.length; k++) {
                var rVid = parseInt(rIds[k]);
                var rTd = _openTrunks[rVid];
                if (!rTd) continue;

                var rExists = false;
                try { rExists = native("DOES_VEHICLE_EXIST", rTd.handle); } catch (e) { }
                if (!rExists) continue;

                var rPos = _getTrunkPos(rTd.handle);
                var rDx = pPos3.x - rPos.x;
                var rDy = pPos3.y - rPos.y;
                var rDist = Math.sqrt(rDx * rDx + rDy * rDy);

                if (rDist < closestDist) {
                    closestDist = rDist;
                    closestTrunkId = rVid;
                }
            }

            if (closestTrunkId !== null) {
                _trunkCar = _openTrunks[closestTrunkId].handle;
                _trunkVehicleId = closestTrunkId;
                _trunkOpen = true;
                _showTrunkMenu = !_showTrunkMenu;
            }
        }
    }
}

// ============================================================================
// API para UI (TrunkMenu / InventoryMenu)
// ============================================================================

export function isTrunkOpen() {
    return _openTrunkCount > 0;
}

export function getTrunkVehicleId() {
    if (!_trunkOpen || !_trunkCar) return -1;
    return _trunkVehicleId;
}

export function isTrunkMenuVisible() {
    return _showTrunkMenu;
}

export function closeTrunkMenu() {
    _showTrunkMenu = false;
    _trunkCar = null;
    _trunkOpen = false;
    _trunkVehicleId = -1;
}

export function closeTrunk() {
    if (_trunkVehicleId === -1) return false;

    var vid = _trunkVehicleId;
    var trunkData = _openTrunks[vid];
    if (!trunkData) {
        closeTrunkMenu();
        return false;
    }

    var carExists = false;
    try { carExists = native("DOES_VEHICLE_EXIST", trunkData.handle); } catch (e) { }

    if (carExists) {
        try { trunkData.handle.fixDoor(1); } catch (e) { }
    }

    _destroyTrunkPickupForVehicle(vid);
    delete _openTrunks[vid];
    _openTrunkCount--;
    _pendingTrunkStateSync = vid;
    closeTrunkMenu();
    return true;
}

// ============================================================================
// API para la pagina web (gsis_FlowSerialization + gsis_WebInterface)
// ============================================================================
//
// Estas dos son las que ejecutan el "Guardar" y el "Sacar" del panel. No son un
// alias de addToTrunk: traen el chequeo de peso explicito y el aviso, que es lo
// que vivia en el ui/gsis_TrunkMenu.js que se borro. addToTrunk ya devuelve
// false cuando no entra, pero sin el dato de cuanto falta no se puede escribir
// un mensaje util ("necesitas 5 kg") y sin mensaje el jugador cree que el panel
// esta roto.
//
// Devuelven true/false para que el bridge sepa si redibujar.

// Inventario -> baul. id y qty vienen de la fila elegida y su stepper.
export function putInTrunk(id, qty) {
    var vid = getTrunkVehicleId();
    if (vid === -1) {
        setNotice(t("TRK_NOG"));
        return false;
    }
    qty = Math.max(1, parseInt(qty, 10) || 1);

    var def = ITEMS[id];
    if (!def) {
        setNotice(t("TRK_NOG"));
        return false;
    }
    // El pre-cheque va aca y no adentro de addToTrunk para poder decir cuanto
    // falta. La funcion igual vuelve a calcular el peso y a rechazar: si el
    // chequeo y la mutacion se separan, el segundo es el que manda.
    var need = def.weight * qty;
    var free = getTrunkMaxCapacity(vid) - getTrunkWeight(vid);
    if (need > free) {
        setNotice(t("TRK_FUL", { free: Math.round(free * 10) / 10, need: Math.round(need * 10) / 10 }));
        return false;
    }
    // No hay enough en el inventario tampoco: sin este mensaje, un item que el
    // baul acepta y el inventario no, se come el TRK_NOG generico.
    if (!_hasInInventory(id, qty)) {
        setNotice(t("TRK_NOG"));
        return false;
    }

    if (!addToTrunk(vid, id, qty)) {
        setNotice(t("TRK_NOG"));
        return false;
    }
    setNotice(t("TRK_PUT", { qty: qty, name: getItemName(id) }));
    return true;
}

// Baul -> inventario. El chequeo es el del inventario, no el del baul: es el que
// puede rechazar y por eso el mensaje es INV_FR.
export function takeFromTrunk(id, qty) {
    var vid = getTrunkVehicleId();
    if (vid === -1) {
        setNotice(t("TRK_NON"));
        return false;
    }
    qty = Math.max(1, parseInt(qty, 10) || 1);

    var def = ITEMS[id];
    if (!def) {
        setNotice(t("TRK_NON"));
        return false;
    }
    if (_trunkQty(vid, id) < qty) {
        setNotice(t("TRK_NON"));
        return false;
    }
    var need = def.weight * qty;
    var free = MISC.MAX_INVENTORY_WEIGHT - getTotalWeight();
    if (need > free) {
        setNotice(t("INV_FR", { free: Math.round(free * 10) / 10, need: Math.round(need * 10) / 10 }));
        return false;
    }

    if (!removeFromTrunk(vid, id, qty)) {
        setNotice(t("TRK_NON"));
        return false;
    }
    setNotice(t("TRK_TAK", { qty: qty, name: getItemName(id) }));
    return true;
}

// Cuantas unidades de un id hay en un lado. Suma qty salvo para los instanciados
// (cargadores y armas), que son una fila por unidad y valen 1 cada una.
function _trunkQty(vehicleId, id) {
    var items = getTrunkItems(vehicleId);
    var n = 0;
    for (var i = 0; i < items.length; i++) {
        if (items[i].id !== id) continue;
        n += isInstanced(id) ? 1 : (items[i].qty || 1);
    }
    return n;
}

function _hasInInventory(id, qty) {
    var items = getItems();
    var n = 0;
    for (var i = 0; i < items.length; i++) {
        if (items[i].id !== id) continue;
        n += isInstanced(id) ? 1 : (items[i].qty || 1);
        if (n >= qty) return true;
    }
    return false;
}

// ============================================================================
// INTERNAS
// ============================================================================

function _getTrunkPos(car) {
    return car.getOffsetInWorldCoords(0, -3.6, 0.5);
}

function _createTrunkPickupForVehicle(vehicleId, car) {
    _destroyTrunkPickupForVehicle(vehicleId);
    try {
        var pos = _getTrunkPos(car);
        var sphere = Sphere.Create(pos.x, pos.y, pos.z, DIST.SPHERE);
        if (_openTrunks[vehicleId]) {
            _openTrunks[vehicleId].pickup = sphere;
            _openTrunks[vehicleId].sphereX = pos.x;
            _openTrunks[vehicleId].sphereY = pos.y;
            _openTrunks[vehicleId].sphereZ = pos.z;
        }
    } catch (e) { }
}

function _updateTrunkPickupForVehicle(vehicleId, car) {
    var trunkData = _openTrunks[vehicleId];
    if (!trunkData) return;
    try {
        var pos = _getTrunkPos(car);
        var dx = pos.x - (trunkData.sphereX || 0);
        var dy = pos.y - (trunkData.sphereY || 0);
        var dz = pos.z - (trunkData.sphereZ || 0);
        var distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 0.25) return;

        _destroyTrunkPickupForVehicle(vehicleId);
        var sphere = Sphere.Create(pos.x, pos.y, pos.z, DIST.SPHERE);
        if (_openTrunks[vehicleId]) {
            _openTrunks[vehicleId].pickup = sphere;
            _openTrunks[vehicleId].sphereX = pos.x;
            _openTrunks[vehicleId].sphereY = pos.y;
            _openTrunks[vehicleId].sphereZ = pos.z;
        }
    } catch (e) { }
}

function _destroyTrunkPickupForVehicle(vehicleId) {
    if (_openTrunks[vehicleId] && _openTrunks[vehicleId].pickup !== null) {
        try { native("REMOVE_SPHERE", _openTrunks[vehicleId].pickup); } catch (e) { }
        _openTrunks[vehicleId].pickup = null;
    }
}

function _updateTrunkStateInDataById(vehicleId, trunkOpen) {
    try {
        var data = getModuleData("VehicleModule");
        if (!data || !data.vehicles) return;

        for (var i = 0; i < data.vehicles.length; i++) {
            if (data.vehicles[i].id === vehicleId) {
                data.vehicles[i].trunkOpen = trunkOpen;
                setModuleData("VehicleModule", data);
                break;
            }
        }
    } catch (e) { }
}

// ============================================================================
// REGISTRO (auto al importarse)
// ============================================================================

function initTrunk() {
    log("[GSIS] Trunk inicializado");
    // El menu del baul es un menu: mientras este abierto, el teclado es de la UI
    // y ningun hotkey del mod tiene que disparar. Antes no se registraba y el
    // interruptor de teclado solo miraba el menu principal, asi que la R del
    // menu del baul competia con la R de recargar.
    registerMenuSource("trunk", isTrunkMenuVisible);
    on("vehicle:destroyed", function (e) {
        onVehicleDead(e.id);
    });
    on("trunk:restore", function (e) {
        restoreTrunk(e.vehicleId, e.car);
    });
    on("vehicle:syncForSave", function () {
        syncStatesForSave();
    });
}

function updateTrunkModule(now) {
    try {
        var p = new Player(0);
        var c = p.getChar();
        var spawning = !!query("spawner:isSpawning", {});
        updateTrunk(c, now, spawning);
    } catch (e) { }
}

register({
    name: "Trunk",
    init: initTrunk,
    update: updateTrunkModule
});
