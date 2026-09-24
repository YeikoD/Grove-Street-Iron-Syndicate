// ============================================================================
// GSIS Spawner - Pickup de registro, handles, spawn/load, batch posiciones
// ============================================================================
// Depende de: SaveManager, Config, ModuleRegistry, EventBus
// Responde query("spawner:*") y emite vehicle:destroyed / trunk:restore / blips
// ============================================================================

import { setModuleData, getModuleData, registerModule } from "../core/gsis_SaveManager.js";
import { KEYS, DIST, TIMERS, MISC } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { on, emit } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";

var _pickup = null;  // Handle del pickup de registro
var _wasNearPickup = false;  // Estado de proximidad al pickup

var _vehicleHandles = [];  // Array de handles de vehiculos registrados
var _spawning = false;  // Flag de spawn en proceso
var _spawnData = null;  // Datos del vehiculo en spawn
var _lastPosUpdate = 0;  // Timestamp de ultimo update de posiciones
var _pendingLoadSpawn = false;  // Flag de spawn pendiente al cargar
var _nextId = 1;  // Siguiente ID disponible

function _markDirty() {
    emit("save:dirty", {});  // Emite evento de guardado sucio
}

export function isSpawning() {
    return _spawning;  // Retorna estado de spawn activo
}

function _blipAdd(entry, x, y, z) {
    emit("vehicle:blip:add", { entry: entry, x: x, y: y, z: z });  // Emite evento para agregar blip
}

function _blipRemove(entry) {
    emit("vehicle:blip:remove", { entry: entry });  // Emite evento para remover blip
}

// ============================================================================
// API (queries desde Trunk/EngineLock via EventBus)
// ============================================================================

export function initSpawner() {
    registerModule("VehicleModule", { vehicles: [] });
    _pickup = Pickup.Create(MISC.PICKUP_MODEL, 0, MISC.PICKUP_X, MISC.PICKUP_Y, MISC.PICKUP_Z);
    log("[Spawner] Pickup creado");

    on("spawner:find", function (e) {
        e.respond(findHandleByHandle(e.data.car));
    });
    on("spawner:closest", function (e) {
        e.respond(getClosestHandle(e.data.char));
    });
    on("spawner:isSpawning", function (e) {
        e.respond(_spawning);
    });

    var data = getModuleData("VehicleModule");
    if (data && data.vehicles && data.vehicles.length > 0) {
        var changed = false;
        for (var i = 0; i < data.vehicles.length; i++) {
            if (data.vehicles[i].id === undefined) {
                data.vehicles[i].id = _nextId++;
                changed = true;
            }
            if (data.vehicles[i].locked === undefined) {
                data.vehicles[i].locked = false;
                changed = true;
            }
            if (data.vehicles[i].engineOn === undefined) {
                data.vehicles[i].engineOn = true;
                changed = true;
            }
            if (data.vehicles[i].trunkOpen === undefined) {
                data.vehicles[i].trunkOpen = false;
                changed = true;
            }
            if (data.vehicles[i].id >= _nextId) _nextId = data.vehicles[i].id + 1;
        }
        if (changed) setModuleData("VehicleModule", data);
        _pendingLoadSpawn = true;
        log("[Spawner] Vehiculos guardados: " + data.vehicles.length);
    }
}

// Pickup + tecla O + spawn async + load spawn + batch 500ms
export function updateSpawner(c, now) {
    // --- Proximidad al pickup ---
    var isNearPickup = false;
    if (c.isInAnyCar()) {
        isNearPickup = c.locateAnyMeans3D(
            MISC.PICKUP_X, MISC.PICKUP_Y, MISC.PICKUP_Z,
            DIST.PICKUP_RADIUS, DIST.PICKUP_RADIUS, DIST.PICKUP_RADIUS,
            false);
    }

    if (isNearPickup && !_wasNearPickup) {
        showTextBox(t("PKPNEAR"));
    }
    if (!isNearPickup && _wasNearPickup) {
        showTextBox(t("PKP_FAR"));
    }
    _wasNearPickup = isNearPickup;

    // --- O: Registrar vehiculo ---
    if (Pad.IsKeyJustPressed(KEYS.REGISTER)) {
        if (c.isInAnyCar() && isNearPickup) {
            var car = c.getCarIsUsing();

            var existing = findHandleByHandle(car);
            if (existing) {
                showTextBox(t("VHC_DUP", { id: existing.id }));
            } else {
                var id = _nextId++;
                var vehData = _getVehicleData(car);
                vehData.id = id;
                vehData.locked = false;
                vehData.engineOn = true;
                vehData.trunkOpen = false;
                var data = getModuleData("VehicleModule") || { vehicles: [] };
                data.vehicles.push(vehData);
                setModuleData("VehicleModule", data);
                _vehicleHandles.push({ id: id, handle: car, blip: null, engineOn: true });
                showTextBox(t("VHC_REG", { id: data.vehicles.length }));
                _markDirty();
            }
        }
    }

    // --- Completar spawn async ---
    if (_spawning && _spawnData) {
        if (native("HAS_MODEL_LOADED", _spawnData.model)) {
            var groundZ = _getGroundZ(_spawnData.x, _spawnData.y);
            var newCar = Car.Create(_spawnData.model, _spawnData.x, _spawnData.y, groundZ);
            if (newCar) {
                try { newCar.setHeading(_spawnData.angle); } catch (e) { }
                newCar.setHealth(_spawnData.health);
                newCar.changeColor(_spawnData.color1, _spawnData.color2);

                var existingEntry = findHandleById(_spawnData.id);
                if (existingEntry) {
                    _blipRemove(existingEntry);
                    _vehicleHandles = _vehicleHandles.filter(function(e) { return e.id !== _spawnData.id; });
                }

                var engineOn = _spawnData.engineOn !== false;
                var newEntry = { id: _spawnData.id, handle: newCar, blip: null, engineOn: engineOn };
                _vehicleHandles.push(newEntry);

                if (_spawnData.locked) {
                    try { native("LOCK_CAR_DOORS", newCar, 2); } catch (e) { }
                }

                if (!engineOn) {
                    newCar.setEngineOn(false);
                    _blipAdd(newEntry, _spawnData.x, _spawnData.y, _spawnData.z);
                }

                if (_spawnData.trunkOpen) {
                    emit("trunk:restore", { vehicleId: _spawnData.id, car: newCar });
                }

                log("[Spawner] Spawn id=" + _spawnData.id + " engineOn=" + engineOn);
            }
            _spawning = false;
            _spawnData = null;
        }
    }

    // --- Spawn pendiente al cargar partida (esperar a exterior) ---
    if (_pendingLoadSpawn && !_spawning) {
        var areaId = c.getAreaVisible();
        if (areaId !== 0) {
            // CJ esta en interior, esperar a salir
        } else {
            var data = getModuleData("VehicleModule");
            var vehicles = data ? data.vehicles : [];
            var allSpawned = true;
            if (vehicles.length > 0) {
                for (var i = 0; i < vehicles.length; i++) {
                    var v = vehicles[i];
                    if (!findHandleById(v.id)) {
                        _beginSpawn(v.id, v.model, v.x, v.y, v.z, v.heading || 0, v.health, v.color1, v.color2, v.locked, v.engineOn, v.trunkOpen);
                        allSpawned = false;
                        break;
                    }
                }
            }
            if (allSpawned) _pendingLoadSpawn = false;
        }
    }

    // --- Batch cada 500ms: exist check + actualizar posiciones (1 get + 1 set) ---
    if (now - _lastPosUpdate > TIMERS.POS_UPDATE) {
        _lastPosUpdate = now;
        var deadIds = [];
        var posUpdated = false;
        var data = getModuleData("VehicleModule");
        var vehicles = data ? data.vehicles : [];

        for (var i = _vehicleHandles.length - 1; i >= 0; i--) {
            var entry = _vehicleHandles[i];
            var exists = false;
            try { exists = native("DOES_VEHICLE_EXIST", entry.handle); } catch (e) { }

            if (!exists) {
                deadIds.push(entry.id);
                _blipRemove(entry);
                _vehicleHandles.splice(i, 1);
                continue;
            }

            var alive = false;
            try { alive = !native("IS_CAR_DEAD", entry.handle); } catch (e) { }
            var inWater = false;
            try { inWater = native("IS_CAR_IN_WATER", entry.handle); } catch (e) { }

            if (!alive || inWater) {
                try { native("LOCK_CAR_DOORS", entry.handle, 1); } catch (e) { }
                _blipRemove(entry);
                deadIds.push(entry.id);
                _vehicleHandles.splice(i, 1);
                continue;
            }

            for (var j = 0; j < vehicles.length; j++) {
                if (vehicles[j].id === entry.id) {
                    var pos = entry.handle.getCoordinates();
                    vehicles[j].x = pos.x;
                    vehicles[j].y = pos.y;
                    vehicles[j].z = pos.z;
                    vehicles[j].heading = entry.handle.getHeading();
                    vehicles[j].health = entry.handle.getHealth();
                    var colors = entry.handle.getColors();
                    vehicles[j].color1 = colors.color1;
                    vehicles[j].color2 = colors.color2;
                    // trunkOpen lo mantiene Trunk en SaveManager (no se pisa aqui)
                    posUpdated = true;
                    break;
                }
            }
        }

        if (deadIds.length > 0) {
            for (var d = 0; d < deadIds.length; d++) {
                for (var k = vehicles.length - 1; k >= 0; k--) {
                    if (vehicles[k].id === deadIds[d]) {
                        vehicles.splice(k, 1);
                        break;
                    }
                }
                emit("vehicle:destroyed", { id: deadIds[d] });
            }
        }

        if (posUpdated || deadIds.length > 0) {
            setModuleData("VehicleModule", data);
        }

        if (deadIds.length > 0) {
            _markDirty();
            showTextBox(t("VHC_DST"));
        }
    }
}

// ============================================================================
// Finds (respondidos via query "spawner:find" / "spawner:closest")
// ============================================================================

export function findHandleById(id) {
    for (var i = 0; i < _vehicleHandles.length; i++) {
        if (_vehicleHandles[i].id === id) return _vehicleHandles[i];
    }
    return null;
}

export function findHandleByHandle(car) {
    for (var i = 0; i < _vehicleHandles.length; i++) {
        if (_vehicleHandles[i].handle === car) return _vehicleHandles[i];
    }
    // Fallback: comparacion por puntero nativo
    try {
        var ptr = native("GET_CAR_POINTER", car);
        for (var j = 0; j < _vehicleHandles.length; j++) {
            var hPtr = native("GET_CAR_POINTER", _vehicleHandles[j].handle);
            if (ptr === hPtr) return _vehicleHandles[j];
        }
    } catch (e) { }
    return null;
}

export function getClosestHandle(char) {
    var best = null;
    var bestDist = DIST.DOOR_LOCK;
    var pos = char.getCoordinates();
    for (var i = 0; i < _vehicleHandles.length; i++) {
        var entry = _vehicleHandles[i];
        var vPos;
        try { vPos = entry.handle.getCoordinates(); } catch (e) { continue; }
        var dx = pos.x - vPos.x;
        var dy = pos.y - vPos.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
            bestDist = dist;
            best = entry;
        }
    }
    return best;
}

// ============================================================================
// INTERNAS
// ============================================================================

function _beginSpawn(id, model, x, y, z, angle, health, color1, color2, locked, engineOn, trunkOpen) {
    _spawnData = { id: id, model: model, x: x, y: y, z: z, angle: angle, health: health, color1: color1, color2: color2, locked: locked, engineOn: engineOn, trunkOpen: trunkOpen };
    native("REQUEST_MODEL", model);
    _spawning = true;
    showTextBox(t("VHC_LD", { model: model }));
}

function _getGroundZ(x, y) {
    try {
        var result = native("GET_GROUND_Z_FOR_3D_COORD", x, y, 1000.0);
        return (typeof result === "number" && result !== 0) ? result : 13.0;
    } catch (e) { return 13.0; }
}

function _getVehicleData(car) {
    var model = car.getModel();
    var pos = car.getCoordinates();
    var health = car.getHealth();
    var colors = car.getColors();
    var heading = car.getHeading();
    return {
        model: model,
        x: pos.x, y: pos.y, z: pos.z,
        heading: heading,
        health: health,
        color1: colors.color1,
        color2: colors.color2,
        trunkOpen: false
    };
}

// ============================================================================
// REGISTRO (auto al importarse)
// ============================================================================

function updateSpawnerModule(now) {
    try {
        var p = new Player(0);
        var c = p.getChar();
        updateSpawner(c, now);
    } catch (e) { }
}

register({
    name: "Spawner",
    init: initSpawner,
    update: updateSpawnerModule
});
