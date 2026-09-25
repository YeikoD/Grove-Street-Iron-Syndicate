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
import {
    getItems, getTotalWeight, ITEMS, getMagazineDisplayName, getClipSizeByItemId,
    getBelt, equipMagToBelt, unequipBeltMag
} from "../modules/gsis_Items.js";
import { getEquipped, equipWeapon, unequipWeapon } from "../modules/gsis_Ballistic.js";
import { getDirtyMoney } from "../core/gsis_SaveManager.js";

var _selectedCategory = "all";
var _selectedUid = null;

// Altura que ocupa la franja de equipo (armas + cinturon) dentro del tab
var _LOADOUT_H = 58.0;
var _LIST_H = SIZES.listH - 45.0 - _LOADOUT_H;

// true si el item se puede equipar (arma con weaponId o cargador)
function canEquip(item) {
    if (!item) return false;
    if (item.type === "magazine") return true;
    if (item.type !== "weapon") return false;
    var wd = getWeaponByItemId(item.raw.id);
    return !!(wd && wd.weaponId !== null && wd.weaponId !== undefined && wd.slot);
}

// Etiqueta corta para los chips de la franja de equipo (caben en una fila)
function shortLabel(text, max) {
    if (!text) return "";
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

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
            if (wd && wd.weaponId !== null && wd.weaponId !== undefined) {
                var capW = wd.clipSize || 0;
                // sin "ammo" guardado (save viejo) = cargador lleno por defecto
                var balW = (it.ammo === undefined || it.ammo === null) ? capW : (it.ammo || 0);
                info = "Daño: " + wd.damage + " | " +
                    (it.hasMag === false ? "sin cargador" : (balW + "/" + capW + " bal"));
            } else {
                info = wd ? "Daño: " + wd.damage : "Arma";
            }
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

// ============================================================================
// EQUIPO - armas en slot + cinturon de cargadores (clic = desequipar)
// ============================================================================

function renderLoadout() {
    var equipped = getEquipped();
    var belt = getBelt();

    textColored("EQUIPO:", COLORS.textGold);
    ImGui.SameLine();
    var anyWeapon = false;
    for (var slot in equipped) {
        if (!Object.prototype.hasOwnProperty.call(equipped, slot)) continue;
        var entry = equipped[slot];
        var def = ITEMS[entry.id] || { name: entry.id };
        var label = shortLabel(def.name, 16) + (entry.hasMag !== false ? "" : " (vacio)") + "  X##eqp_" + slot;
        if (uiButton(label, 0.0, SIZES.btnSm, COLORS.danger)) {
            unequipWeapon(Number(slot));
        }
        ImGui.SameLine();
        anyWeapon = true;
    }
    if (!anyWeapon) {
        ImGui.TextDisabled("(ninguna)");
    }

    ImGui.Spacing();

    textColored("CINTURON:", COLORS.textGold);
    ImGui.SameLine();
    for (var i = 0; i < belt.length; i++) {
        var mag = belt[i];
        var magLabel = mag
            ? shortLabel(getMagazineDisplayName(mag), 22) + " (" + (mag.ammo || 0) + ")"
            : "(vacio)";
        magLabel += "##belt_" + i;
        if (uiButton(magLabel, 0.0, SIZES.btnSm, mag ? COLORS.accent : COLORS.btn)) {
            if (mag) unequipBeltMag(i);
        }
        if (i < belt.length - 1) ImGui.SameLine();
    }
}

function renderItemList(items) {
    ImGui.BeginChild("inv_item_list", SIZES.leftColW, _LIST_H, true);

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
    ImGui.BeginChild("inv_item_details", SIZES.rightColW, _LIST_H, true);

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

    // Accion principal: equipar (arma → slot de GTA, cargador → cinturon)
    if (canEquip(selectedItem)) {
        if (uiButton("EQUIPAR##act_use", SIZES.rightColW - 20.0, SIZES.btnLg, COLORS.accent)) {
            if (selectedItem.type === "magazine") {
                equipMagToBelt(selectedItem.raw.id);
            } else {
                equipWeapon(selectedItem.raw.id);
            }
        }
    } else if (uiButton("USAR##act_use", SIZES.rightColW - 20.0, SIZES.btnLg, COLORS.accent)) {
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
    renderLoadout();

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
