// ============================================================================
// GSIS TrunkMenu - Menu de baul (inventario <-> baul)
// ============================================================================
// Layout: header pesos, dos paneles scroll (inv | baul), qty por fila,
//         Guardar/Sacar con pre-check de peso, Cerrar.
// Transferencias diferidas post-End (patron DealerPickupMenu).
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
import { t } from "../core/gsis_L10n.js";
import { getVehicleName } from "../data/gsis_vehicle_data.js";
import { getItemName, getItemWeight, getItemType, getMagazineDisplayName } from "../data/gsis_item_data.js";
import { getClipSizeByItemId } from "../data/gsis_weapon_data.js";

var _menuWidth = 900.0;
var _btnHeight = 28.0;
var _stepW = 30.0;
var _actionW = 96.0;
var _footerBtnH = 32.0;
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

function trunkListHeight(rowCount) {
    var h = 16 + rowCount * 34;
    if (h < 80) return 80;
    if (h > 340) return 340;
    return h;
}

function calcMenuHeight(invCount, trunkCount) {
    // header + dos columnas titulo + lista + footer + padding
    return Math.max(320, 110 + trunkListHeight(Math.max(invCount, trunkCount)) + 80);
}

export function initTrunkMenu() {
    log("[GSIS] TrunkMenu inicializado");
}

function pushTrunkStyle() {
    ImGui.PushStyleColor(2, 15, 15, 20, 230);    // WindowBg
    ImGui.PushStyleColor(3, 8, 8, 12, 255);      // ChildBg (mas oscuro que la ventana)
    ImGui.PushStyleColor(5, 55, 65, 85, 255);    // Border (marco de los paneles)
    ImGui.PushStyleColor(10, 20, 20, 28, 255);
    ImGui.PushStyleColor(11, 25, 25, 35, 255);
    ImGui.PushStyleColor(21, 30, 55, 80, 255);
    ImGui.PushStyleColor(22, 40, 75, 110, 255);
    ImGui.PushStyleColor(23, 20, 45, 65, 255);
    ImGui.PushStyleColor(0, 200, 200, 200, 255);
    ImGui.PushStyleColor(1, 100, 100, 110, 255);
    ImGui.PushStyleColor(27, 50, 60, 75, 255);
    ImGui.PushStyleColor(33, 25, 40, 60, 255);
    ImGui.PushStyleColor(34, 40, 65, 95, 255);
    ImGui.PushStyleVar(12, 6);
    ImGui.PushStyleVar(3, 4);
}

function popTrunkStyle() {
    ImGui.PopStyleVar(2);
    ImGui.PopStyleColor(13);
}

function pushTakeStyle() {
    ImGui.PushStyleColor(21, 35, 70, 35, 255);
    ImGui.PushStyleColor(22, 50, 95, 50, 255);
    ImGui.PushStyleColor(23, 28, 55, 28, 255);
}

function popTakeStyle() {
    ImGui.PopStyleColor(3);
}

function pushTrunkCloseStyle() {
    ImGui.PushStyleColor(21, 60, 25, 25, 255);
    ImGui.PushStyleColor(22, 85, 30, 30, 255);
    ImGui.PushStyleColor(23, 45, 18, 18, 255);
}

function popTrunkCloseStyle() {
    ImGui.PopStyleColor(3);
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

        ImGui.TextDisabled("-- " + t(cat.labelKey) + " --");
        ImGui.Columns(4);

        for (var j = 0; j < catItems.length; j++) {
            var item = catItems[j];
            var maxQty = item.qty;
            var key = side + "_" + item.id;

            // Cargadores: nombre con calidad + balas (instancia, qty=1)
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
            if (ImGui.Button("<##" + key, _stepW, _btnHeight)) {
                if (q > 1) _qty[key] = q - 1;
            }
            ImGui.SameLine();
            ImGui.Text("" + q);
            ImGui.SameLine();
            if (ImGui.Button(">##" + key, _stepW, _btnHeight)) {
                if (q < maxQty) _qty[key] = q + 1;
            }
            ImGui.NextColumn();

            pushTakeStyle();
            if (toTrunk) {
                if (ImGui.Button(t("BTN_PUT") + "##" + key, _actionW, _btnHeight)) {
                    _clickToTrunk = true;
                    _clickId = item.id;
                    _clickQty = getTrunkRowQty(key, maxQty);
                    _clickVehicleId = vehicleId;
                }
            } else {
                if (ImGui.Button(t("BTN_TK") + "##" + key, _actionW, _btnHeight)) {
                    _clickToTrunk = false;
                    _clickId = item.id;
                    _clickQty = getTrunkRowQty(key, maxQty);
                    _clickVehicleId = vehicleId;
                }
            }
            popTakeStyle();
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

export function renderTrunkMenu() {
    _clickId = null;
    _clickQty = 0;
    _clickVehicleId = -1;

    ImGui.BeginFrame("GSIS_TRUNK");

    if (!isTrunkMenuVisible() || !isTrunkOpen() || getTrunkVehicleId() === -1) {
        ImGui.SetCursorVisible(false);
        ImGui.EndFrame();
        if (!isTrunkMenuVisible()) return;
        resetQty();
        closeTrunkMenu();
        return;
    }

    ImGui.SetCursorVisible(true);

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
        ImGui.SetCursorVisible(false);
        ImGui.EndFrame();
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

    pushTrunkStyle();
    ImGui.SetNextWindowSize(_menuWidth, calcMenuHeight(
        countRows(invItems), countRows(trunkItems)), 1);
    ImGui.SetNextWindowPos(50.0, 100.0, 2);
    var open = ImGui.Begin(t("TRK_TTL", {
        name: modelName,
        model: vehicle.model
    }), true, false, true, false, false);

    // Header: pesos de ambos contenedores
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

    // Paneles identicos (titulo + contenido dentro del child con borde)
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

    pushTrunkCloseStyle();
    var clickedClose = ImGui.Button(t("BTN_CTB"), _menuWidth - 20, _footerBtnH);
    popTrunkCloseStyle();

    ImGui.End();
    popTrunkStyle();
    ImGui.EndFrame();

    // Acciones post-frame (listas pueden haber cambiado)
    if (_clickId !== null && _clickVehicleId !== -1) {
        doTransfer(_clickVehicleId, _clickToTrunk, _clickId, _clickQty);
    }
    if (clickedClose || !open) {
        resetQty();
        closeTrunk();
    }
}

register({
    name: "TrunkMenu",
    init: initTrunkMenu,
    update: renderTrunkMenu
});
