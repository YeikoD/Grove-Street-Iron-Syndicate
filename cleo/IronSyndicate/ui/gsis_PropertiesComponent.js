// ============================================================================
// GSIS PropertiesComponent - Lista de Propiedades estilo KCD
// ============================================================================
// Presenta un panel de 2 columnas:
// - Izquierda (490px): Lista seleccionable con propiedades y documentos.
// - Derecha (280px): Detalles de la propiedad seleccionada y botón de compra.
// ============================================================================

import { getDirtyMoney } from "../core/gsis_SaveManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerComponent } from "./gsis_UIManager.js";
import { COLORS, SIZES, textColored, uiSectionHeader, uiStatRow, uiSelectableRow, uiButton } from "./gsis_UIStyle.js";
import { listProperties, buyProperty } from "../modules/gsis_PropertyModule.js";

var _selectedPropIndex = 0;

function renderPropertyList(props) {
    ImGui.BeginChild("prop_list_left", SIZES.leftColW, SIZES.listH - 45.0, true);
    try {
        ImGui.Columns(3);
        textColored("PROPIEDAD", COLORS.textGold);
        ImGui.NextColumn();
        textColored("COSTO", COLORS.textGold);
        ImGui.NextColumn();
        textColored("ESTADO", COLORS.textGold);
        ImGui.NextColumn();
        ImGui.Separator();

        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            var isSelected = _selectedPropIndex === i;

            if (uiSelectableRow(p.name + "##prop_row_" + i, isSelected, 24.0)) {
                _selectedPropIndex = i;
            }

            ImGui.NextColumn();
            ImGui.Text("$" + p.cost.toLocaleString());
            ImGui.NextColumn();
            textColored(p.owned ? "Comprado" : "Disponible", p.owned ? COLORS.textOk : COLORS.textGold);
            ImGui.NextColumn();
        }
        ImGui.Columns(1);
    } finally {
        ImGui.EndChild();
    }
}

function renderPropertyDetails(selectedProp) {
    ImGui.BeginChild("prop_details_right", SIZES.rightColW, SIZES.listH - 45.0, true);
    try {
        if (!selectedProp) {
            ImGui.Spacing();
            ImGui.TextDisabled("Selecciona una propiedad de la lista.");
            return;
        }

        var typeName = selectedProp.type === "almacen" ? "Almacén de Mercancía" : "Taller Mecánico";
        textColored(selectedProp.name, COLORS.textGold);
        ImGui.TextDisabled("Tipo: " + typeName);
        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        uiStatRow("Costo de compra: ", "$" + selectedProp.cost.toLocaleString(), COLORS.textGreen);
        uiStatRow("Ingreso diario: ", "$" + selectedProp.dailyWage, COLORS.textGold);
        uiStatRow("Estado: ", selectedProp.owned ? "ADQUIRIDA" : "DISPONIBLE", selectedProp.owned ? COLORS.textOk : COLORS.textWarn);

        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        if (selectedProp.owned) {
            textColored("[PROPIEDAD ADQUIRIDA]", COLORS.textOk);
        } else {
            if (uiButton("COMPRAR PROPIEDAD##buy_prop", SIZES.rightColW - 20.0, SIZES.btnLg, COLORS.accent)) {
                buyProperty(selectedProp.id);
            }
        }
    } finally {
        ImGui.EndChild();
    }
}

function renderPropertiesComponent() {
    var props = listProperties();

    uiStatRow("DINERO SUCIO: ", "$" + getDirtyMoney().toLocaleString(), COLORS.textGreen);
    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    if (!props || props.length === 0) {
        ImGui.TextDisabled("No hay propiedades configuradas en esta zona.");
        return;
    }

    if (_selectedPropIndex >= props.length) {
        _selectedPropIndex = 0;
    }

    var selectedProp = props[_selectedPropIndex];

    renderPropertyList(props);
    ImGui.SameLine();
    renderPropertyDetails(selectedProp);
}

export function initPropertiesComponent() {
    log("[GSIS] PropertiesComponent inicializado en formato de lista KCD");
    registerComponent("properties", renderPropertiesComponent);
}

register({
    name: "PropertiesComponent",
    init: initPropertiesComponent
});
