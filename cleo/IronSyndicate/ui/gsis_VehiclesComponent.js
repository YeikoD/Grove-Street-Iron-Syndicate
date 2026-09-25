// ============================================================================
// GSIS VehiclesComponent - Lista de Vehículos (Estilo KCD 2 Columnas)
// ============================================================================

import { getModuleData } from "../core/gsis_SaveManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerComponent } from "./gsis_UIManager.js";
import { COLORS, SIZES, textColored, uiSectionHeader, uiStatRow, uiSelectableRow, uiButton } from "./gsis_UIStyle.js";
import { getVehicleName } from "../data/gsis_vehicle_data.js";

var _selectedVehIndex = 0;

function renderVehicleList(vehicles) {
    ImGui.BeginChild("veh_list_left", SIZES.leftColW, SIZES.listH - 45.0, true);
    try {
        uiSectionHeader("FLOTA DE VEHÍCULOS");

        ImGui.Columns(3);
        textColored("MODELO", COLORS.textGold);
        ImGui.NextColumn();
        textColored("SALUD", COLORS.textGold);
        ImGui.NextColumn();
        textColored("ESTADO", COLORS.textGold);
        ImGui.NextColumn();
        ImGui.Separator();

        for (var i = 0; i < vehicles.length; i++) {
            var v = vehicles[i];
            var isSelected = _selectedVehIndex === i;
            var modelName = getVehicleName(v.model);
            var health = Math.floor(v.health || 0);

            if (uiSelectableRow(modelName + "##veh_row_" + i, isSelected, 24.0)) {
                _selectedVehIndex = i;
            }

            ImGui.NextColumn();
            ImGui.Text(health + " HP");
            ImGui.NextColumn();
            textColored(v.locked ? "Bloqueado" : "Abierto", v.locked ? COLORS.textWarn : COLORS.textOk);
            ImGui.NextColumn();
        }
        ImGui.Columns(1);
    } finally {
        ImGui.EndChild();
    }
}

function renderVehicleDetails(v) {
    ImGui.BeginChild("veh_details_right", SIZES.rightColW, SIZES.listH - 45.0, true);
    try {
        if (!v) {
            ImGui.Spacing();
            ImGui.TextDisabled("Selecciona un vehículo de la lista.");
            return;
        }

        var modelName = getVehicleName(v.model);
        textColored(modelName, COLORS.textGold);
        ImGui.TextDisabled("ID de Modelo: " + v.model);
        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        uiStatRow("Salud del motor: ", Math.floor(v.health || 0) + " / 1000 HP", (v.health > 500) ? COLORS.textOk : COLORS.textErr);
        uiStatRow("Encendido: ", v.engineOn ? "ENCENDIDO" : "APAGADO", v.engineOn ? COLORS.textOk : COLORS.textErr);
        uiStatRow("Cerradura: ", v.locked ? "BLOQUEADO" : "LIBRE", v.locked ? COLORS.textWarn : COLORS.textOk);
        uiStatRow("Colores: ", (v.color1 || 0) + " / " + (v.color2 || 0), COLORS.text);

        if (v.x !== undefined && v.y !== undefined) {
            uiStatRow("Coordenadas GPS: ", "X: " + v.x.toFixed(1) + " | Y: " + v.y.toFixed(1), COLORS.textMuted);
        }

        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        if (uiButton("UBICAR EN MAPA (GPS)##map_veh", SIZES.rightColW - 20.0, SIZES.btnLg, COLORS.accent)) {
            log("[VehiclesComponent] Ubicar vehículo ID: " + v.model);
        }
    } finally {
        ImGui.EndChild();
    }
}

function renderVehiclesComponent() {
    var vehicleData = getModuleData("VehicleModule");
    var vehicles = vehicleData ? vehicleData.vehicles : [];

    if (!vehicles || vehicles.length === 0) {
        ImGui.TextDisabled("No tienes ningún vehículo registrado en tu garaje.");
        return;
    }

    if (_selectedVehIndex >= vehicles.length) {
        _selectedVehIndex = 0;
    }

    var selectedVeh = vehicles[_selectedVehIndex];

    renderVehicleList(vehicles);
    ImGui.SameLine();
    renderVehicleDetails(selectedVeh);
}

export function initVehiclesComponent() {
    log("[GSIS] VehiclesComponent inicializado con formato KCD 2 columnas");
    registerComponent("vehicles", renderVehiclesComponent);
}

register({
    name: "VehiclesComponent",
    init: initVehiclesComponent
});
