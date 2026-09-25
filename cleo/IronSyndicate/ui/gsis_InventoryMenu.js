// ============================================================================
// GSIS InventoryMenu - Inventario en Lista estilo Kingdom Come: Deliverance
// ============================================================================
// Utiliza Wrappers de alto nivel para un código ultra limpio, conciso y fácil
// de mantener sin llamadas verbosas a ImGui.
// ============================================================================

import { registerComponent } from "./gsis_UIManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { COLORS, SIZES, textColored, uiButton, uiTabButton, uiSelectableRow, uiStatRow } from "./gsis_UIStyle.js";
import { getWeaponByItemId } from "../data/gsis_weapon_data.js";
import { getItems, getTotalWeight, ITEMS, getMagazineDisplayName, getClipSizeByItemId } from "../modules/gsis_Items.js";
import { getDirtyMoney } from "../core/gsis_SaveManager.js";

var _selectedCategory = "all";
var _selectedUid = null;

function filterItems() {
    var rawItems = getItems();
    var list = [];

    for (var i = 0; i < rawItems.length; i++) {
        var it = rawItems[i];
        var def = ITEMS[it.id] || { name: "Objeto", type: "misc", weight: 0.1 };

        if (_selectedCategory !== "all" && def.type !== _selectedCategory) {
            continue;
        }

        var info = "-";
        if (def.type === "weapon") {
            var wd = getWeaponByItemId(it.id);
            info = wd ? "Daño: " + wd.damage : "Arma";
        } else if (def.type === "magazine") {
            var cap = getClipSizeByItemId(it.id);
            var ammo = (it.ammo === undefined || it.ammo === null) ? (cap || 0) : it.ammo;
            info = ammo + "/" + (cap || 0) + " bal";
        }

        list.push({
            uid: "itm_" + it.id + "_" + i,
            name: def.type === "magazine" ? getMagazineDisplayName(it) : def.name,
            qty: it.qty,
            unitWeight: def.weight,
            weightTotal: (def.weight * it.qty).toFixed(1),
            type: def.type,
            info: info,
            raw: it
        });
    }

    return list;
}

function renderCategoryFilters() {
    var categories = [
        { id: "all", label: "TODOS" },
        { id: "weapon", label: "ARMAS" },
        { id: "magazine", label: "MUNICION" },
        { id: "material", label: "MATERIALES" }
    ];

    for (var i = 0; i < categories.length; i++) {
        var cat = categories[i];
        if (uiTabButton(cat.label + "##cat_" + cat.id, _selectedCategory === cat.id, 110.0, SIZES.btnSm)) {
            _selectedCategory = cat.id;
        }
        if (i < categories.length - 1) ImGui.SameLine();
    }

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();
}

function renderItemList(items) {
    ImGui.BeginChild("inv_item_list", SIZES.leftColW, SIZES.listH - 45.0, true);

    ImGui.Columns(3);
    textColored("NOMBRE", COLORS.textGold);
    ImGui.NextColumn();
    textColored("CANT", COLORS.textGold);
    ImGui.NextColumn();
    textColored("PESO", COLORS.textGold);
    ImGui.NextColumn();
    ImGui.Separator();

    if (items.length === 0) {
        ImGui.Columns(1);
        ImGui.Spacing();
        ImGui.TextDisabled("No hay objetos en esta categoría.");
    } else {
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var isSelected = _selectedUid === item.uid;

            if (uiSelectableRow(item.name + "##sel_" + item.uid, isSelected, 22.0)) {
                _selectedUid = item.uid;
            }

            ImGui.NextColumn();
            ImGui.Text("x" + item.qty);
            ImGui.NextColumn();
            ImGui.Text(item.weightTotal + " kg");
            ImGui.NextColumn();
        }
        ImGui.Columns(1);
    }

    ImGui.EndChild();
}

function renderItemDetails(selectedItem) {
    ImGui.BeginChild("inv_item_details", SIZES.rightColW, SIZES.listH - 45.0, true);

    if (!selectedItem) {
        ImGui.Spacing();
        ImGui.TextDisabled("Selecciona un objeto de la lista.");
        ImGui.EndChild();
        return;
    }

    textColored(selectedItem.name, COLORS.textGold);
    ImGui.TextDisabled("Categoría: " + selectedItem.type.toUpperCase());
    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    uiStatRow("Cantidad: ", "x" + selectedItem.qty, COLORS.text);
    uiStatRow("Peso Unitario: ", selectedItem.unitWeight + " kg", COLORS.text);
    uiStatRow("Peso Total: ", selectedItem.weightTotal + " kg", COLORS.textGold);
    uiStatRow("Información: ", selectedItem.info, COLORS.textGreen);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    // Botones de acción envueltos en 1 sola línea cada uno
    if (uiButton("USAR / EQUIPAR##act_use", SIZES.rightColW - 20.0, SIZES.btnLg, COLORS.accent)) {
        log("[InventoryMenu] Acción Usar: " + selectedItem.name);
    }

    ImGui.Spacing();

    if (uiButton("TIRAR / SOLTAR##act_drop", SIZES.rightColW - 20.0, SIZES.btnMd, COLORS.danger)) {
        log("[InventoryMenu] Acción Soltar: " + selectedItem.name);
    }

    ImGui.EndChild();
}

function renderInventoryComponent() {
    // Encabezado usando Wrappers de Estadísticas
    uiStatRow("DINERO SUCIO: ", "$" + getDirtyMoney().toLocaleString(), COLORS.textGreen);
    ImGui.SameLine(360.0);
    uiStatRow("CAPACIDAD DE CARGA: ", getTotalWeight().toFixed(1) + " kg", COLORS.textGold);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderCategoryFilters();

    var items = filterItems();
    if (items.length > 0 && !_selectedUid) {
        _selectedUid = items[0].uid;
    }

    var selectedItem = null;
    for (var k = 0; k < items.length; k++) {
        if (items[k].uid === _selectedUid) {
            selectedItem = items[k];
            break;
        }
    }

    renderItemList(items);
    ImGui.SameLine();
    renderItemDetails(selectedItem);
}

export function initInventoryMenu() {
    log("[GSIS] InventoryMenu inicializado con Wrappers de Alto Nivel");
    registerComponent("inventory", renderInventoryComponent);
}

register({
    name: "InventoryMenu",
    init: initInventoryMenu
});
