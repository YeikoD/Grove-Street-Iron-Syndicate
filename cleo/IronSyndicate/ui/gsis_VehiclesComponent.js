// ============================================================================
// GSIS VehiclesComponent - Lista de Vehículos con Datos Completos
// ============================================================================
// Muestra cada vehículo registrado en tarjetas con todos sus campos visibles:
// Modelo, ID, Colores, Salud, Estado de Motor, Candado y Coordenadas GPS.
// ============================================================================

import { getModuleData } from "../core/gsis_SaveManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerComponent } from "./gsis_UIManager.js";
import { COLORS, SIZES, textColored, uiSectionHeader, uiStatRow, uiButton } from "./gsis_UIStyle.js";
import { getVehicleName } from "../data/gsis_vehicle_data.js";

function renderVehiclesComponent() {
    var vehicleData = getModuleData("VehicleModule");
    var vehicles = vehicleData ? vehicleData.vehicles : [];

    uiSectionHeader("REGISTRO DE VEHÍCULOS DE LA BANDA");

    if (!vehicles || vehicles.length === 0) {
        ImGui.TextDisabled("No tienes ningún vehículo registrado en tu garaje.");
        return;
    }

    ImGui.BeginChild("veh_list_full", SIZES.mainW - 30.0, SIZES.listH - 40.0, true);
    try {
        for (var i = 0; i < vehicles.length; i++) {
            var v = vehicles[i];
            var modelName = getVehicleName(v.model);

            ImGui.BeginChild("veh_card_" + i, SIZES.mainW - 55.0, 105.0, true);
            try {
                // Fila 1: Título del Modelo e ID
                textColored(modelName + " (ID Modelo: " + v.model + ")", COLORS.textGold);
                ImGui.SameLine(520.0);
                if (uiButton("UBICAR EN MAPA##map_" + i, 160.0, 22.0, COLORS.accent)) {
                    log("[VehiclesComponent] Ubicar vehículo ID: " + v.model);
                }

                ImGui.Separator();

                // Fila 2: Salud y Colores
                uiStatRow("Salud del motor: ", Math.floor(v.health || 0) + " / 1000", (v.health > 500) ? COLORS.textOk : COLORS.textErr);
                ImGui.SameLine(320.0);
                uiStatRow("Colores: ", (v.color1 || 0) + " / " + (v.color2 || 0), COLORS.textMuted);

                // Fila 3: Motor y Candado
                uiStatRow("Motor: ", v.engineOn ? "ENCENDIDO" : "APAGADO", v.engineOn ? COLORS.textOk : COLORS.textErr);
                ImGui.SameLine(320.0);
                uiStatRow("Candado: ", v.locked ? "BLOQUEADO" : "DESBLOQUEADO", v.locked ? COLORS.textWarn : COLORS.textOk);

                // Fila 4: Coordenadas GPS
                if (v.x !== undefined && v.y !== undefined) {
                    uiStatRow("Coordenadas GPS: ", "X: " + v.x.toFixed(1) + " | Y: " + v.y.toFixed(1), COLORS.textMuted);
                }
            } finally {
                ImGui.EndChild();
            }
            ImGui.Spacing();
        }
    } finally {
        ImGui.EndChild();
    }
}

export function initVehiclesComponent() {
    log("[GSIS] VehiclesComponent inicializado con vista completa de lista");
    registerComponent("vehicles", renderVehiclesComponent);
}

register({
    name: "VehiclesComponent",
    init: initVehiclesComponent
});
