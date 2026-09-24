// ============================================================================
// GSIS PropertiesComponent - Componente de propiedades para UIManager
// ============================================================================
// Renderiza la gestión de propiedades y documentos como componente de pestaña.
// ============================================================================

import { getCleanMoney } from "../core/gsis_SaveManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerComponent, getConfig } from "../core/gsis_UIManager.js";
import { t } from "../core/gsis_L10n.js";
import { listProperties, buyProperty } from "../modules/gsis_PropertyModule.js";
import { getDocuments } from "../modules/gsis_Documents.js";

function pushPropBuyStyle() {
    ImGui.PushStyleColor(21, 35, 70, 35, 255);
    ImGui.PushStyleColor(22, 50, 95, 50, 255);
    ImGui.PushStyleColor(23, 28, 55, 28, 255);
}

function popPropBuyStyle() {
    ImGui.PopStyleColor(3);
}

// Componente de renderizado para la pestaña de propiedades
function renderPropertiesComponent() {
    var config = getConfig();
    ImGui.BeginChild("prp_body", 0, config.listHeight, true);

    ImGui.Text(t("MONEY", { n: getCleanMoney() }));
    ImGui.Spacing();

    var props = listProperties();
    for (var i = 0; i < props.length; i++) {
        var p = props[i];
        ImGui.BeginChild("prop_" + p.id, 0, 70, true);
        var typeKey = p.type === "almacen" ? "TY_ALM" : "TY_TALL";
        ImGui.Text(p.name + " (" + t(typeKey) + ")");
        ImGui.TextDisabled(t("PRP_CST", { n: p.cost, w: p.dailyWage }));

        if (p.owned) {
            ImGui.TextColored(t("PRP_OWN"), 80, 200, 80, 255);
        } else {
            ImGui.SameLine();
            pushPropBuyStyle();
            if (ImGui.Button(t("BTN_BUY") + "##" + p.id, 100, 24)) {
                buyProperty(p.id);
            }
            popPropBuyStyle();
        }
        ImGui.EndChild();
        ImGui.Spacing();
    }

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    var documents = getDocuments();
    ImGui.Text(t("DOC_CNT", { n: documents.length }));
    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    if (documents.length === 0) {
        ImGui.TextDisabled(t("DOC_NON"));
    } else {
        for (var j = 0; j < documents.length; j++) {
            var doc = documents[j];
            ImGui.Text((j + 1) + ". " + doc.type);
        }
    }

    ImGui.EndChild();
}

export function initPropertiesComponent() {
    log("[GSIS] PropertiesComponent inicializado");
    // Registrar este componente en el UIManager
    registerComponent("properties", renderPropertiesComponent);
}

// Ya no necesitamos update propio - el UIManager maneja el renderizado
export function renderPropertiesComponentUpdate() {
    // No-op: renderizado manejado por UIManager
}

register({
    name: "PropertiesComponent",
    init: initPropertiesComponent,
    update: renderPropertiesComponentUpdate
});
