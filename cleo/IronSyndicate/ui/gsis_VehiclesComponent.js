// ============================================================================
// GSIS VehiclesComponent - Componente de vehículos para UIManager
// ============================================================================
// Renderiza la gestión de documentos de vehículos como componente de pestaña.
// ============================================================================

import { getModuleData } from "../core/gsis_SaveManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerComponent, getConfig } from "../core/gsis_UIManager.js";
import { t } from "../core/gsis_L10n.js";
import { getVehicleName } from "../data/gsis_vehicle_data.js";

// Componente de renderizado para la pestaña de vehículos
function renderVehiclesComponent() {
    var config = getConfig();
    ImGui.BeginChild("veh_body", 0, config.listHeight, true);

    var vehicleData = getModuleData("VehicleModule");
    var vehicles = vehicleData ? vehicleData.vehicles : [];

    if (vehicles.length === 0) {
        ImGui.TextDisabled(t("DOC_NRV"));
    } else {
        for (var i = 0; i < vehicles.length; i++) {
            var v = vehicles[i];
            var modelName = getVehicleName(v.model);

            ImGui.BeginChild("veh_card_" + i, 0, 85, true);

            ImGui.Text(t("V_MODL", { name: modelName }));
            ImGui.Separator();

            ImGui.TextDisabled(t("V_ID", { n: v.model }));
            ImGui.TextDisabled(t("V_COL", { a: v.color1, b: v.color2 }));
            ImGui.TextDisabled(t("V_HLTH", { n: Math.floor(v.health) }));

            if (v.engineOn) {
                ImGui.TextColored(t("V_ENG1"), 80, 180, 80, 255);
            } else {
                ImGui.TextColored(t("V_ENG0"), 180, 80, 80, 255);
            }
            if (v.locked) {
                ImGui.TextColored(t("V_LCK1"), 180, 150, 60, 255);
            } else {
                ImGui.TextColored(t("V_LCK0"), 80, 180, 80, 255);
            }

            if (v.x !== undefined && v.y !== undefined) {
                ImGui.TextDisabled(t("V_POS", {
                    x: v.x.toFixed(1),
                    y: v.y.toFixed(1)
                }));
            }

            ImGui.EndChild();
            ImGui.Spacing();
        }
    }

    ImGui.EndChild();
}

export function initVehiclesComponent() {
    log("[GSIS] VehiclesComponent inicializado");
    // Registrar este componente en el UIManager
    registerComponent("vehicles", renderVehiclesComponent);
}

// Ya no necesitamos update propio - el UIManager maneja el renderizado
export function renderVehiclesComponentUpdate() {
    // No-op: renderizado manejado por UIManager
}

register({
    name: "VehiclesComponent",
    init: initVehiclesComponent,
    update: renderVehiclesComponentUpdate
});
