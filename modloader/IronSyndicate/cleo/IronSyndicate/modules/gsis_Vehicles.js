// GSIS - Vehicles
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Vehicles - Save throttle + F5 (orquestador ligero)
// ============================================================================
// Spawner / EngineLock / Trunk se auto-registran; aqui solo:
//   - escucha save:dirty → throttle de guardado
//   - tecla F5 → sync baules + saveGame
// ============================================================================

import { saveGame, getActiveSlot } from "../core/gsis_SaveManager.js";
import { KEYS, TIMERS } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { on, emit } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";

var _saveDirty = false;  // Flag de guardado pendiente
var _lastSaveTime = 0;  // Timestamp de ultimo guardado

function _markDirty() {
    _saveDirty = true;  // Marca que hay cambios pendientes
}

export function initVehicleModule() {
    log("--- Modulo Vehicles cargado correctamente ---");
    on("save:dirty", function () {
        _markDirty();  // Escucha evento de cambios
    });
}

export function updateVehicleModule(now) {
    // Save con throttle: guarda max 1 vez cada 2s si hay cambios pendientes
    if (_saveDirty && now - _lastSaveTime > TIMERS.SAVE_THROTTLE) {
        _saveDirty = false;  // Limpia flag de cambios
        _lastSaveTime = now;  // Actualiza timestamp
        saveGame(getActiveSlot());  // Guarda partida
    }

    // --- F5: Guardar ---
    if (Pad.IsKeyJustPressed(KEYS.SAVE)) {
        emit("vehicle:syncForSave", {});  // Sincroniza estados
        var slot = getActiveSlot();  // Obtiene slot activo
        var success = saveGame(slot);  // Guarda partida
        showTextBox(success ? t("SAVE_OK", { slot: slot }) : t("SAVE_ER"));  // Muestra resultado
    }
}

register({
    name: "Vehicles",
    init: initVehicleModule,
    update: updateVehicleModule
});
