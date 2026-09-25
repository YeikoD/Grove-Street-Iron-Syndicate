// ============================================================================
// GSIS TrunkMenu - Menu de baul (inventario <-> baul, Diseño Stacked Full-Width)
// ============================================================================

import { isTrunkOpen, getTrunkVehicleId, isTrunkMenuVisible, closeTrunkMenu, closeTrunk } from "../modules/gsis_Trunk.js";
import {
    getItems, getTotalWeight,
    getTrunkItems, getTrunkWeight, getTrunkMaxCapacity,
    addToTrunk, removeFromTrunk
} from "../modules/gsis_Items.js";
import { getModuleData } from "../core/gsis_SaveManager.js";
import { MISC } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerWindow } from "./gsis_UIManager.js";
import {
    SIZES, COND, COLORS,
    pushMenuStyle, popMenuStyle,
    uiButton, uiStatRow, uiSectionHeader, textColored
} from "./gsis_UIStyle.js";
import { t } from "../core/gsis_L10n.js";
import { getVehicleName } from "../data/gsis_vehicle_data.js";
import { getItemName, getItemWeight, getItemType, getMagazineDisplayName } from "../data/gsis_item_data.js";
import { getClipSizeByItemId } from "../data/gsis_weapon_data.js";

var _qty = {};

var CATEGORIES = [
    { key: "weapon", labelKey: "CAT_WPN" },
    { key: "magazine", labelKey: "CAT_MAG" },
    { key: "material", labelKey: "CAT_MAT" }
];

var _clickToTrunk = false;
var _clickId = null;
var _clickQty = 0;
var _clickVehicleId = -1;
var _frameOpen = true;

function getTrunkRowQty(key, maxQty) {
    if (!_qty[key]) _qty[key] = 1;
    if (_qty[key] > maxQty) _qty[key] = maxQty;
    if (_qty[key] < 1) _qty[key] = 1;
    return _qty[key];
}

function resetQty() {
    _qty = {};
}

function doTransfer(vehicleId, toTrunk, id, qty) {
    if (qty < 1) return false;
    var w = getItemWeight(id) * qty;
    var name = getItemName(id);

    if (toTrunk) {
        var trunkFree = getTrunkMaxCapacity(vehicleId) - getTrunkWeight(vehicleId);
        if (w > trunkFree) {
            try {
                showTextBox(t("TRK_FUL", {
                    free: trunkFree.toFixed(1),
                    need: w.toFixed(1)
                }));
            } catch (e) { }
            return false;
        }
        if (!addToTrunk(vehicleId, id, qty)) {
            try { showTextBox(t("TRK_NOG")); } catch (e) { }
            return false;
        }
        try { showTextBox(t("TRK_PUT", { qty: qty, name: name })); } catch (e) { }
        _qty["i_" + id] = 1;
        return true;
    }

    var invFree = MISC.MAX_INVENTORY_WEIGHT - getTotalWeight();
    if (w > invFree) {
        try {
            showTextBox(t("INV_FR", {
                free: invFree.toFixed(1),
                need: w.toFixed(1)
            }));
        } catch (e) { }
        return false;
    }
    if (!removeFromTrunk(vehicleId, id, qty)) {
        try { showTextBox(t("TRK_NON")); } catch (e) { }
        return false;
    }
    try { showTextBox(t("TRK_TAK", { qty: qty, name: name })); } catch (e) { }
    _qty["t_" + id] = 1;
    return true;
}

function renderSide(listId, title, items, vehicleId, toTrunk, height) {
    ImGui.BeginChild(listId, 0, height, true);

    uiSectionHeader(title);

    var side = toTrunk ? "i" : "t";
    var shown = 0;

    ImGui.Columns(4);
    ImGui.SetColumnWidth(0, 240.0);
    ImGui.SetColumnWidth(1, 110.0);
    ImGui.SetColumnWidth(2, 130.0);
    ImGui.SetColumnWidth(3, 170.0);

    textColored("OBJETO", COLORS.textGold);
    ImGui.NextColumn();
    textColored("PESO", COLORS.textGold);
    ImGui.NextColumn();
    textColored("CANTIDAD", COLORS.textGold);
    ImGui.NextColumn();
    textColored("ACCIÓN", COLORS.textGold);
    ImGui.NextColumn();
    ImGui.Separator();

    for (var c = 0; c < CATEGORIES.length; c++) {
        var cat = CATEGORIES[c];
        var catItems = [];
        for (var i = 0; i < items.length; i++) {
            if (getItemType(items[i].id) === cat.key) {
                catItems.push(items[i]);
            }
        }
        if (catItems.length === 0) continue;
        shown += catItems.length;

        for (var j = 0; j < catItems.length; j++) {
            var item = catItems[j];
            var maxQty = item.qty;
            var key = side + "_" + item.id;
            var w = getItemWeight(item.id).toFixed(1);

            if (cat.key === "magazine") {
                var magCap = getClipSizeByItemId(item.id);
                var magAmmo = (item.ammo === undefined || item.ammo === null) ? (magCap || 0) : item.ammo;
                ImGui.Text(getMagazineDisplayName(item) + " (" + magAmmo + "/" + magCap + ")");
            } else {
                ImGui.Text(getItemName(item.id));
            }
            ImGui.NextColumn();

            ImGui.Text(w + " kg (x" + maxQty + ")");
            ImGui.NextColumn();

            var q = getTrunkRowQty(key, maxQty);
            if (ImGui.Button("<##" + key, 18, SIZES.btnSm)) {
                if (q > 1) _qty[key] = q - 1;
            }
            ImGui.SameLine();
            ImGui.Text("" + q + " / " + maxQty);
            ImGui.SameLine();
            if (ImGui.Button(">##" + key, 18, SIZES.btnSm)) {
                if (q < maxQty) _qty[key] = q + 1;
            }
            ImGui.NextColumn();

            var btnText = toTrunk ? "GUARDAR EN BAÚL" : "SACAR A INVENTARIO";
            if (uiButton(btnText + "##" + key, 0.0, SIZES.btnSm, COLORS.accent)) {
                _clickToTrunk = toTrunk;
                _clickId = item.id;
                _clickQty = getTrunkRowQty(key, maxQty);
                _clickVehicleId = vehicleId;
            }
            ImGui.NextColumn();
        }
    }

    ImGui.Columns(1);
    if (shown === 0) {
        ImGui.Spacing();
        ImGui.TextDisabled(toTrunk ? t("TRK_EMI") : t("TRK_EMB"));
    }
    ImGui.EndChild();
}

function renderTrunkWindow() {
    _clickId = null;
    _clickQty = 0;
    _clickVehicleId = -1;
    _frameOpen = true;

    if (!isTrunkOpen() || getTrunkVehicleId() === -1) {
        resetQty();
        closeTrunkMenu();
        return;
    }

    var vehicleId = getTrunkVehicleId();
    var vehicleData = getModuleData("VehicleModule");
    var vehicles = vehicleData ? vehicleData.vehicles : [];
    var vehicle = null;
    for (var i = 0; i < vehicles.length; i++) {
        if (vehicles[i].id === vehicleId) {
            vehicle = vehicles[i];
            break;
        }
    }
    if (!vehicle) {
        resetQty();
        closeTrunkMenu();
        return;
    }

    var modelName = getVehicleName(vehicle.model);
    var invItems = getItems();
    var trunkItems = getTrunkItems(vehicleId);
    var trunkWeight = getTrunkWeight(vehicleId);
    var trunkMax = getTrunkMaxCapacity(vehicleId);
    var invWeight = getTotalWeight();

    pushMenuStyle();
    ImGui.SetNextWindowSize(SIZES.trunkW, SIZES.mainH, 1);
    ImGui.SetNextWindowPos(180.0, 100.0, 2);
    var open = ImGui.Begin(t("TRK_TTL", {
        name: modelName,
        model: vehicle.model
    }), true, false, false, false, false);
    ImGui.SetWindowSize(SIZES.trunkW, SIZES.mainH, 0);

    uiStatRow("INVENTARIO CJ: ", invWeight.toFixed(1) + "/" + MISC.MAX_INVENTORY_WEIGHT + "kg", COLORS.textGreen);
    ImGui.SameLine(280.0);
    uiStatRow("BAÚL (" + modelName + "): ", trunkWeight.toFixed(1) + "/" + trunkMax + "kg", COLORS.textGold);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderSide("tk_inv", "INVENTARIO CJ (GUARDAR EN BAÚL)", invItems, vehicleId, true, 205.0);
    ImGui.Spacing();
    renderSide("tk_baul", "CONTENIDO DEL BAÚL (SACAR A INVENTARIO)", trunkItems, vehicleId, false, 205.0);

    ImGui.End();
    popMenuStyle();

    _frameOpen = open;
}

function afterTrunkFrame() {
    if (_clickId !== null && _clickVehicleId !== -1) {
        doTransfer(_clickVehicleId, _clickToTrunk, _clickId, _clickQty);
    }
    if (!_frameOpen) {
        resetQty();
        closeTrunk();
    }
}

function initTrunkMenu() {
    log("[GSIS] TrunkMenu inicializado");
    registerWindow({
        id: "GSIS_TRUNK",
        visible: function () { return isTrunkMenuVisible(); },
        render: renderTrunkWindow,
        after: afterTrunkFrame
    });
}

register({
    name: "TrunkMenu",
    init: initTrunkMenu
});
