// ============================================================================
// GSIS InventoryMenu - Componente de inventario para UIManager
// ============================================================================
// Funciona como componente de renderizado dentro del sistema de pestañas.
// Renderiza el inventario del jugador con secciones de armas, cargadores,
// materiales y documentos.
// ============================================================================

import { getModuleData, getCleanMoney } from "../core/gsis_SaveManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerComponent, getConfig } from "../core/gsis_UIManager.js";
import { t } from "../core/gsis_L10n.js";
import { getVehicleName } from "../data/gsis_vehicle_data.js";
import { getWeaponByItemId } from "../data/gsis_weapon_data.js";
import { closeTrunk } from "../modules/gsis_Trunk.js";
import { getItems, getTotalWeight, ITEMS, getMagazineDisplayName, getClipSizeByItemId } from "../modules/gsis_Items.js";
import { listProperties, buyProperty } from "../modules/gsis_PropertyModule.js";
import { getDocuments } from "../modules/gsis_Documents.js";

var _btnHeight = 24.0;
var _rowPad = 1;

function pushCategoryStyle(r, g, b) {
    ImGui.PushStyleColor(21, r, g, b, 255);
    ImGui.PushStyleColor(22, r + 20, g + 20, b + 20, 255);
    ImGui.PushStyleColor(23, r - 15, g - 15, b - 15, 255);
}

function popCategoryStyle() {
    ImGui.PopStyleColor(3);
}

// ============================================================================
// Filas de la lista (items; y filas-resumen de la seccion DOCUMENTOS)
// row: { uid, name, qty, weight, info?, panel? }
// panel -> la fila muestra boton ABRIR (ventana de esa etiqueta)
// ============================================================================

function collectByType(type) {
    var items = getItems();
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var def = ITEMS[items[i].id];
        if (def && def.type === type) out.push({ item: items[i], def: def });
    }
    return out;
}

function buildWeaponRows() {
    var src = collectByType("weapon");
    var rows = [];
    for (var i = 0; i < src.length; i++) {
        var it = src[i];
        var wd = getWeaponByItemId(it.item.id);
        rows.push({
            uid: "w_" + it.item.id,
            name: it.def.name,
            qty: "x" + it.item.qty,
            weight: (it.def.weight * it.item.qty).toFixed(1) + " kg",
            info: wd ? t("WPN_DMG", { n: wd.damage }) : "-"
        });
    }
    return rows;
}

function buildMagazineRows() {
    var src = collectByType("magazine");
    var rows = [];
    for (var i = 0; i < src.length; i++) {
        var it = src[i];
        var cap = getClipSizeByItemId(it.item.id);
        var ammo = (it.item.ammo === undefined || it.item.ammo === null) ? (cap || 0) : it.item.ammo;
        rows.push({
            uid: "m_" + i,
            name: getMagazineDisplayName(it.item),
            qty: "x" + it.item.qty,
            weight: (it.def.weight * it.item.qty).toFixed(1) + " kg",
            info: t("MAG_AMM", { a: ammo, b: cap || 0 })
        });
    }
    return rows;
}

function buildMaterialRows() {
    var src = collectByType("material");
    var rows = [];
    for (var i = 0; i < src.length; i++) {
        var it = src[i];
        rows.push({
            uid: "t_" + it.item.id,
            name: it.def.name,
            qty: "x" + it.item.qty,
            weight: (it.def.weight * it.item.qty).toFixed(1) + " kg",
            info: "-"
        });
    }
    return rows;
}

// Seccion DOCUMENTOS: filas-resumen con la cantidad de cada cosa
// (una fila por tipo, no por elemento) -> ahora solo informativo
function buildManageRows() {
    var vehicleData = getModuleData("VehicleModule");
    var vehicles = vehicleData ? vehicleData.vehicles : [];
    return [
        {
            uid: "m_prp",
            name: t("PRP_HDR"),
            qty: "" + listProperties().length,
            weight: "-",
            info: "-"
        },
        {
            uid: "m_veh",
            name: t("VEH_HDR"),
            qty: "" + vehicles.length,
            weight: "-",
            info: "-"
        }
    ];
}

// Seccion: encabezado -- TITULO -- + filas en 4 columnas con separador
// (mismo patron que DealerMenu.renderWeaponList). Retorna filas dibujadas.
function renderSection(titleKey, rows) {
    if (rows.length === 0) return 0;

    ImGui.TextDisabled("-- " + t(titleKey) + " --");
    ImGui.Columns(4);

    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];

        ImGui.Text(r.name);
        ImGui.NextColumn();

        ImGui.Text(r.qty);
        ImGui.NextColumn();

        ImGui.Text(r.weight);
        ImGui.NextColumn();

        ImGui.TextDisabled(r.info || "-");
        ImGui.NextColumn();

        if (i < rows.length - 1) {
            ImGui.Separator();
        }
    }

    ImGui.Columns(1);
    ImGui.Spacing();
    return rows.length;
}

function renderList() {
    var config = getConfig();
    ImGui.BeginChild("inv_list", 0, config.listHeight, true);

    var total = 0;
    total += renderSection("ARM_HDR", buildWeaponRows());
    total += renderSection("CAT_MAG", buildMagazineRows());
    total += renderSection("MAT_HDR", buildMaterialRows());
    total += renderSection("DOC_HDR", buildManageRows());

    if (total === 0) {
        ImGui.TextDisabled(t("INV_EMP"));
    }

    ImGui.EndChild();
}

// Componente de renderizado para la pestaña de inventario
function renderInventoryComponent() {
    ImGui.TextDisabled(t("INV_WGT", { n: getTotalWeight().toFixed(1) }));
    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderList();
}

export function initInventoryMenu() {
    log("[GSIS] InventoryMenu inicializado como componente de UIManager");
    // Registrar este componente en el UIManager
    registerComponent("inventory", renderInventoryComponent);
}

// Ya no necesitamos update propio - el UIManager maneja el renderizado
export function renderInventoryMenu() {
    // No-op: renderizado manejado por UIManager
}

register({
    name: "InventoryMenu",
    init: initInventoryMenu,
    update: renderInventoryMenu
});
