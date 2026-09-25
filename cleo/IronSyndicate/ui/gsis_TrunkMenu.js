// ============================================================================
// GSIS TrunkMenu - Menu de baul (inventario <-> baul)
// ============================================================================
// Layout: header pesos, dos paneles scroll (inv | baul), qty por fila,
//         Guardar/Sacar con pre-check de peso, Cerrar.
// Ventana registrada en UIManager (render dentro de su frame; acciones
// diferidas en after(), post-EndFrame, patron DealerPickupMenu).
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
    pushBtn, popBtn,
    sectionTitle
} from "./gsis_UIStyle.js";
import { t } from "../core/gsis_L10n.js";
import { getVehicleName } from "../data/gsis_vehicle_data.js";
import { getItemName, getItemWeight, getItemType, getMagazineDisplayName } from "../data/gsis_item_data.js";
import { getClipSizeByItemId } from "../data/gsis_weapon_data.js";

var _qty = {}; // { side_id: qty } selector local por fila

var CATEGORIES = [
    { key: "weapon", labelKey: "CAT_WPN" },
    { key: "magazine", labelKey: "CAT_MAG" },
    { key: "material", labelKey: "CAT_MAT" }
];

// deferred click (fuera de Columns/End para no romper layout)
var _clickToTrunk = false;
var _clickId = null;
var _clickQty = 0;
var _clickVehicleId = -1;
var _closeRequested = false;
var _frameOpen = true;

function trunkListHeight(rowCount) {
    var h = 16 + rowCount * 34;
    if (h < 80) return 80;
    if (h > 340) return 340;
    return h;
}

function calcMenuHeight(invCount, trunkCount) {
    return Math.max(320, 110 + trunkListHeight(Math.max(invCount, trunkCount)) + 80);
}

function getTrunkRowQty(key, maxQty) {
    if (!_qty[key]) _qty[key] = 1;
    if (_qty[key] > maxQty) _qty[key] = maxQty;
    if (_qty[key] < 1) _qty[key] = 1;
    return _qty[key];
}

function resetQty() {
    _qty = {};
}

// Transferencia segura inv<->baul con pre-check de espacio:
// toTrunk=true: inv -> baul (chequea libre del baul; addToTrunk falla en silencio)
// toTrunk=false: baul -> inv (chequea libre del inventario; mensaje detallado)
function doTransfer(vehicleId, toTrunk, id, qty) {
    if (qty < 1) return false;
    var w = getItemWeight(id) * qty;
    var name = getItemName(id);

    if (toTrunk) {
        var trunkFree = getTrunkMaxCapacity(vehicleId) - getTrunkWeight(vehicleId);
        if (w > trunkFree) {
            showTextBox(t("TRK_FUL", {
                free: trunkFree.toFixed(1),
                need: w.toFixed(1)
            }));
            return false;
        }
        if (!addToTrunk(vehicleId, id, qty)) {
            showTextBox(t("TRK_NOG"));
            return false;
        }
        showTextBox(t("TRK_PUT", { qty: qty, name: name }));
        _qty["i_" + id] = 1;
        return true;
    }

    var invFree = MISC.MAX_INVENTORY_WEIGHT - getTotalWeight();
    if (w > invFree) {
        showTextBox(t("INV_FR", {
            free: invFree.toFixed(1),
            need: w.toFixed(1)
        }));
        return false;
    }
    if (!removeFromTrunk(vehicleId, id, qty)) {
        showTextBox(t("TRK_NON"));
        return false;
    }
    showTextBox(t("TRK_TAK", { qty: qty, name: name }));
    _qty["t_" + id] = 1;
    return true;
}

function countRows(items) {
    var n = 0;
    for (var c = 0; c < CATEGORIES.length; c++) {
        for (var i = 0; i < items.length; i++) {
            if (getItemType(items[i].id) === CATEGORIES[c].key) n++;
        }
    }
    return n;
}

// Lado del panel: child con borde + titulo DENTRO (mismo diseno en ambos lados)
// 4 cols (nombre | peso/u | qty | accion); separador entre filas de la categoria
function renderSide(listId, title, items, vehicleId, toTrunk, listH) {
    ImGui.BeginChild(listId, 0, listH, true);
    ImGui.Text(title);
    ImGui.Separator();
    ImGui.Spacing();

    var side = toTrunk ? "i" : "t";
    var shown = 0;

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

        sectionTitle(t(cat.labelKey));
        ImGui.Columns(4);

        for (var j = 0; j < catItems.length; j++) {
            var item = catItems[j];
            var maxQty = item.qty;
            var key = side + "_" + item.id;

            if (cat.key === "magazine") {
                var magCap = getClipSizeByItemId(item.id);
                var magAmmo = (item.ammo === undefined || item.ammo === null) ? (magCap || 0) : item.ammo;
                ImGui.Text(getMagazineDisplayName(item) + " (" + magAmmo + "/" + magCap + ")");
            } else {
                ImGui.Text(getItemName(item.id) + " x" + maxQty);
            }
            ImGui.NextColumn();

            ImGui.TextDisabled(getItemWeight(item.id).toFixed(1) + " kg/u");
            ImGui.NextColumn();

            var q = getTrunkRowQty(key, maxQty);
            if (ImGui.Button("<##" + key, SIZES.stepW, SIZES.btnMd)) {
                if (q > 1) _qty[key] = q - 1;
            }
            ImGui.SameLine();
            ImGui.Text("" + q);
            ImGui.SameLine();
            if (ImGui.Button(">##" + key, SIZES.stepW, SIZES.btnMd)) {
                if (q < maxQty) _qty[key] = q + 1;
            }
            ImGui.NextColumn();

            pushBtn(COLORS.accent);
            if (toTrunk) {
                if (ImGui.Button(t("BTN_PUT") + "##" + key, SIZES.actionW, SIZES.btnMd)) {
                    _clickToTrunk = true;
                    _clickId = item.id;
                    _clickQty = getTrunkRowQty(key, maxQty);
                    _clickVehicleId = vehicleId;
                }
            } else {
                if (ImGui.Button(t("BTN_TK") + "##" + key, SIZES.actionW, SIZES.btnMd)) {
                    _clickToTrunk = false;
                    _clickId = item.id;
                    _clickQty = getTrunkRowQty(key, maxQty);
                    _clickVehicleId = vehicleId;
                }
            }
            popBtn();
            ImGui.NextColumn();
            if (j < catItems.length - 1) {
                ImGui.Separator();
            }
        }
        ImGui.Columns(1);
        ImGui.Spacing();
    }

    ImGui.Columns(1);
    if (shown === 0) {
        ImGui.TextDisabled(toTrunk ? t("TRK_EMI") : t("TRK_EMB"));
    }
    ImGui.EndChild();
}

function renderTrunkWindow() {
    _clickId = null;
    _clickQty = 0;
    _clickVehicleId = -1;
    _closeRequested = false;
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
    var invFree = MISC.MAX_INVENTORY_WEIGHT - invWeight;
    var trunkFree = trunkMax - trunkWeight;
    var listH = trunkListHeight(Math.max(countRows(invItems), countRows(trunkItems)));

    pushMenuStyle();
    ImGui.SetNextWindowSize(SIZES.trunkW, calcMenuHeight(
        countRows(invItems), countRows(trunkItems)), COND.Always);
    ImGui.SetNextWindowPos(50.0, 100.0, COND.Once);
    var open = ImGui.Begin(t("TRK_TTL", {
        name: modelName,
        model: vehicle.model
    }), true, false, true, false, false);

    ImGui.Text(t("INV_L", {
        w: invWeight.toFixed(1),
        max: MISC.MAX_INVENTORY_WEIGHT
    }));
    ImGui.SameLine();
    ImGui.TextDisabled("|  " + t("FRE_L", { n: invFree.toFixed(1) }));
    ImGui.Spacing();
    ImGui.Text(t("TRK_L", {
        w: trunkWeight.toFixed(1),
        max: trunkMax
    }));
    ImGui.SameLine();
    ImGui.TextDisabled("|  " + t("FRE_L", { n: trunkFree.toFixed(1) }));
    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    ImGui.Columns(2);
    renderSide("tk_inv", t("INV_HDR"), invItems, vehicleId, true, listH);
    ImGui.NextColumn();
    renderSide("tk_baul", t("TRK_H"), trunkItems, vehicleId, false, listH);
    ImGui.Columns(1);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();
    ImGui.TextDisabled(t("TRK_HNT"));
    ImGui.Spacing();

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
