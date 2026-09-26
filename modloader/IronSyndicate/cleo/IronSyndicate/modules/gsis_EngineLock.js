// GSIS - EngineLock
// Copyright (C) 2026  YeikoD
// Licencia: GNU GPL v3 o posterior (texto completo en LICENSE).

// ============================================================================
// GSIS EngineLock - Motor (tecla 1), lock (tecla 2), blips, sync
// ============================================================================
// Depende de: SaveManager, Config, ModuleRegistry, EventBus
// Usa query("spawner:*") para handles (sin importar Spawner)
// ============================================================================

import { setModuleData, getModuleData } from "../core/gsis_SaveManager.js";
import { KEYS, TIMERS } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { on, emit, query } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";

var _lastEngineSync = 0;

function _markDirty() {
    emit("save:dirty", {});
}

// Tecla 1: motor on/off + blip (entry = registro o null)
export function handleEngineToggle(car, entry) {
    if (entry) {
        entry.engineOn = !entry.engineOn;
        car.setEngineOn(entry.engineOn);
        showTextBox(entry.engineOn ? t("ENG_ON") : t("ENG_OFF"));

        if (!entry.engineOn) {
            updateVehiclePositionById(entry.id, car);
            var pos = car.getCoordinates();
            createBlip(entry, pos.x, pos.y, pos.z);
            updateEngineState(entry.id, false);
        } else {
            removeBlip(entry);
            updateEngineState(entry.id, true);
        }
        _markDirty();
    } else {
        var currentState = false;
        try { currentState = native("IS_CAR_ENGINE_ON", car); } catch (e) { currentState = true; }
        car.setEngineOn(!currentState);
        showTextBox(!currentState ? t("ENG_ON") : t("ENG_OFF"));
    }
}

// Sync throttle 250ms: detectar encendido/apagado externo del motor
export function syncEngine(now, entry) {
    if (now - _lastEngineSync <= TIMERS.ENGINE_SYNC) return;
    _lastEngineSync = now;
    if (!entry) return;

    var car = entry.handle;
    var realEngineOn = false;
    try { realEngineOn = native("IS_CAR_ENGINE_ON", car); } catch (e) { realEngineOn = true; }

    if (realEngineOn && !entry.engineOn) {
        entry.engineOn = true;
        removeBlip(entry);
        updateEngineState(entry.id, true);
    } else if (!realEngineOn && entry.engineOn) {
        entry.engineOn = false;
        var pos = car.getCoordinates();
        createBlip(entry, pos.x, pos.y, pos.z);
        updateEngineState(entry.id, false);
    }
}

// Tecla 2: lock/unlock del vehículo más cercano
export function handleLockToggle(closest) {
    if (!closest) {
        showTextBox(t("VHC_NON"));
        return;
    }

    var data = getModuleData("VehicleModule");
    var vehicles = data ? data.vehicles : [];
    for (var i = 0; i < vehicles.length; i++) {
        if (vehicles[i].id === closest.id) {
            vehicles[i].locked = !vehicles[i].locked;
            setModuleData("VehicleModule", data);
            try { native("LOCK_CAR_DOORS", closest.handle, vehicles[i].locked ? 2 : 1); } catch (e) { }
            showTextBox(vehicles[i].locked ? t("LCK_CLS") : t("LCK_OPN"));
            _markDirty();
            break;
        }
    }
}

// Blips (tambien via eventos: Spawner emite, aqui respondemos)
export function createBlip(entry, x, y, z) {
    removeBlip(entry);
    try {
        entry.blip = Blip.AddSpriteForCoord(x, y, z, 55);
        log("[EngineLock] Blip creado id=" + entry.id);
    } catch (e) {
        log("[EngineLock] Error blip: " + e.message);
    }
}

export function removeBlip(entry) {
    if (entry.blip) {
        try { entry.blip.remove(); } catch (e) { }
        entry.blip = null;
    }
}

// ============================================================================
// INTERNAS
// ============================================================================

function updateEngineState(id, engineOn) {
    try {
        var data = getModuleData("VehicleModule");
        if (!data || !data.vehicles) return;
        for (var i = 0; i < data.vehicles.length; i++) {
            if (data.vehicles[i].id === id) {
                data.vehicles[i].engineOn = engineOn;
                setModuleData("VehicleModule", data);
                break;
            }
        }
    } catch (e) { }
}

function updateVehiclePositionById(id, handle) {
    try {
        var data = getModuleData("VehicleModule");
        if (!data || !data.vehicles) return;
        for (var i = 0; i < data.vehicles.length; i++) {
            if (data.vehicles[i].id === id) {
                var pos = handle.getCoordinates();
                var heading = handle.getHeading();
                var health = handle.getHealth();
                var colors = handle.getColors();
                data.vehicles[i].x = pos.x;
                data.vehicles[i].y = pos.y;
                data.vehicles[i].z = pos.z;
                data.vehicles[i].heading = heading;
                data.vehicles[i].health = health;
                data.vehicles[i].color1 = colors.color1;
                data.vehicles[i].color2 = colors.color2;
                // trunkOpen: lo mantiene Trunk en SaveManager (no se pisa aqui)
                setModuleData("VehicleModule", data);
                break;
            }
        }
    } catch (e) { }
}

// ============================================================================
// REGISTRO (auto al importarse)
// ============================================================================

function initEngineLock() {
    log("[GSIS] EngineLock inicializado");
    on("vehicle:blip:add", function (e) {
        createBlip(e.entry, e.x, e.y, e.z);
    });
    on("vehicle:blip:remove", function (e) {
        removeBlip(e.entry);
    });
}

function updateEngineLock(now) {
    try {
        var p = new Player(0);
        var c = p.getChar();

        // --- 1: Motor on/off + blip ---
        if (Pad.IsKeyJustPressed(KEYS.ENGINE)) {
            if (c.isInAnyCar()) {
                var car = c.getCarIsUsing();
                handleEngineToggle(car, query("spawner:find", { car: car }));
            }
        }

        // --- Sincronizar estado del motor (throttle 250ms) ---
        syncEngine(now, c.isInAnyCar()
            ? query("spawner:find", { car: c.getCarIsUsing() })
            : null);

        // --- 2: Lock/unlock puertas (mas cercano) ---
        if (Pad.IsKeyJustPressed(KEYS.LOCK)) {
            handleLockToggle(query("spawner:closest", { char: c }));
        }
    } catch (e) { }
}

register({
    name: "EngineLock",
    init: initEngineLock,
    update: updateEngineLock
});
