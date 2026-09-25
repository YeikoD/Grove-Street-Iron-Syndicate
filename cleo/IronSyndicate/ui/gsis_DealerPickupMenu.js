// ============================================================================
// GSIS DealerPickupMenu - Menu de retiro de pedidos (Estilo KCD Master-Detail)
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { registerWindow } from "./gsis_UIManager.js";
import {
    SIZES, COND, COLORS,
    pushMenuStyle, popMenuStyle,
    uiButton, uiSelectableRow, uiStatRow, uiSectionHeader, textColored
} from "./gsis_UIStyle.js";
import {
    isPickupMenuVisible, closePickupMenu,
    getOrder, removeFromOrder
} from "../modules/gsis_DealerPickup.js";
import { addItem, getTotalWeight } from "../modules/gsis_Items.js";
import { getItemName, getItemWeight } from "../data/gsis_item_data.js";
import { MISC } from "../core/gsis_Config.js";
import { t } from "../core/gsis_L10n.js";

var _selectedItemId = null;
var _qty = 1;
var _clickedCollectId = null;
var _clickedCollectQty = 0;
var _clickedAll = false;
var _frameOpen = true;

function freeWeight() {
    return MISC.MAX_INVENTORY_WEIGHT - getTotalWeight();
}

function calcOrderWeight(order) {
    var total = 0;
    for (var i = 0; i < order.items.length; i++) {
        total += getItemWeight(order.items[i].id) * order.items[i].qty;
    }
    return total;
}

function orderQty(order, itemId) {
    for (var i = 0; i < order.items.length; i++) {
        if (order.items[i].id === itemId) return order.items[i].qty;
    }
    return 0;
}

function collectItem(itemId, qty) {
    var order = getOrder();
    if (!order) return false;
    if (qty < 1) return false;

    var maxInOrder = orderQty(order, itemId);
    if (maxInOrder <= 0 || qty > maxInOrder) {
        try { showTextBox(t("PKC_IVL")); } catch (e) { }
        return false;
    }

    var w = getItemWeight(itemId) * qty;
    var free = freeWeight();
    if (w > free) {
        try {
            showTextBox(t("INV_FR", {
                free: free.toFixed(1),
                need: w.toFixed(1)
            }));
        } catch (e) { }
        return false;
    }

    if (!addItem(itemId, qty)) {
        try { showTextBox(t("PKC_ERR", { name: getItemName(itemId) })); } catch (e) { }
        return false;
    }

    removeFromOrder(itemId, qty);
    _qty = 1;
    try { showTextBox(t("PKC_TAK", { qty: qty, name: getItemName(itemId) })); } catch (e) { }
    return true;
}

function collectAll() {
    var order = getOrder();
    if (!order) return false;

    var orderWeight = calcOrderWeight(order);
    var free = freeWeight();
    if (orderWeight > free) {
        try {
            showTextBox(t("PKC_NOC", {
                free: free.toFixed(1),
                order: orderWeight.toFixed(1)
            }));
        } catch (e) { }
        return false;
    }

    var items = [];
    for (var i = 0; i < order.items.length; i++) {
        items.push({ id: order.items[i].id, qty: order.items[i].qty });
    }

    for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (!collectItem(it.id, it.qty)) {
            return false;
        }
    }

    try { showTextBox(t("PKC_ALL")); } catch (e) { }
    return true;
}

function renderMasterList(order) {
    ImGui.BeginChild("pickup_master", SIZES.leftColW, 425.0, true);

    uiSectionHeader("OBJETOS EN EL PEDIDO");

    ImGui.Columns(3);
    ImGui.SetColumnWidth(0, 240.0);
    ImGui.SetColumnWidth(1, 100.0);
    ImGui.SetColumnWidth(2, 100.0);

    textColored("PRODUCTO", COLORS.textGold);
    ImGui.NextColumn();
    textColored("CANTIDAD DISP.", COLORS.textGold);
    ImGui.NextColumn();
    textColored("PESO TOTAL", COLORS.textGold);
    ImGui.NextColumn();
    ImGui.Separator();

    for (var i = 0; i < order.items.length; i++) {
        var it = order.items[i];
        var isSelected = _selectedItemId === it.id;
        var totalW = (getItemWeight(it.id) * it.qty).toFixed(1);

        if (uiSelectableRow(getItemName(it.id) + "##sel_" + it.id, isSelected, 24.0)) {
            _selectedItemId = it.id;
            _qty = 1;
        }

        ImGui.NextColumn();
        ImGui.Text("x" + it.qty);
        ImGui.NextColumn();
        ImGui.Text(totalW + " kg");
        ImGui.NextColumn();
    }

    ImGui.Columns(1);
    ImGui.EndChild();
}

function renderInspector(order, selectedItem) {
    ImGui.BeginChild("pickup_inspector", SIZES.rightColW, 425.0, true);

    uiSectionHeader("INSPECTOR DE RETIRO");

    if (!selectedItem) {
        ImGui.Spacing();
        ImGui.TextDisabled("Selecciona un objeto del pedido.");
    } else {
        var maxQty = selectedItem.qty;
        var unitW = getItemWeight(selectedItem.id);

        textColored(getItemName(selectedItem.id), COLORS.textGold);
        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        uiStatRow("Peso Unitario: ", unitW.toFixed(1) + " kg", COLORS.text);
        uiStatRow("Cantidad Disp.: ", "x" + maxQty, COLORS.textGold);

        ImGui.Spacing();
        textColored("CANTIDAD A RETIRAR:", COLORS.textMuted);
        if (ImGui.Button("<##dec_pk_qty", 24, SIZES.btnSm)) {
            if (_qty > 1) _qty--;
        }
        ImGui.SameLine();
        ImGui.Text("  " + _qty + "  ");
        ImGui.SameLine();
        if (ImGui.Button(">##inc_pk_qty", 24, SIZES.btnSm)) {
            if (_qty < maxQty) _qty++;
        }

        ImGui.Spacing();
        if (uiButton("RETIRAR OBJETO##pk", 0.0, SIZES.btnLg, COLORS.accent)) {
            _clickedCollectId = selectedItem.id;
            _clickedCollectQty = _qty;
        }
    }

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    var orderWeight = calcOrderWeight(order);
    var free = freeWeight();

    uiStatRow("Peso Pedido: ", orderWeight.toFixed(1) + " kg", COLORS.textGold);
    uiStatRow("Espacio Libre: ", free.toFixed(1) + " kg", free >= orderWeight ? COLORS.textGreen : COLORS.textDanger);

    ImGui.Spacing();
    if (uiButton("RECOGER TODO EL PEDIDO##all", 0.0, SIZES.btnLg, COLORS.accent)) {
        _clickedAll = true;
    }

    ImGui.EndChild();
}

function renderPickupWindow() {
    _clickedCollectId = null;
    _clickedCollectQty = 0;
    _clickedAll = false;
    _frameOpen = true;

    var order = getOrder();
    if (!order || order.items.length === 0) {
        closePickupMenu();
        return;
    }

    if (!_selectedItemId || !orderQty(order, _selectedItemId)) {
        _selectedItemId = order.items[0].id;
    }

    var selectedItem = null;
    for (var i = 0; i < order.items.length; i++) {
        if (order.items[i].id === _selectedItemId) {
            selectedItem = order.items[i];
            break;
        }
    }

    pushMenuStyle();
    ImGui.SetNextWindowSize(SIZES.pickupW, SIZES.mainH, 1);
    ImGui.SetNextWindowPos(180.0, 100.0, 2);
    var open = ImGui.Begin(t("PKC_TTL"), true, false, false, false, false);
    ImGui.SetWindowSize(SIZES.pickupW, SIZES.mainH, 0);

    var invW = getTotalWeight();
    var orderW = calcOrderWeight(order);

    uiStatRow("INVENTARIO CJ: ", invW.toFixed(1) + "/" + MISC.MAX_INVENTORY_WEIGHT + "kg", COLORS.textGreen);
    ImGui.SameLine(400.0);
    uiStatRow("PEDIDO COMPLETO: ", orderW.toFixed(1) + "kg", COLORS.textGold);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderMasterList(order);
    ImGui.SameLine();
    renderInspector(order, selectedItem);

    ImGui.End();
    popMenuStyle();

    _frameOpen = open;
}

function afterPickupFrame() {
    if (_clickedCollectId) {
        collectItem(_clickedCollectId, _clickedCollectQty);
    }
    if (_clickedAll) {
        collectAll();
    }
    if (!_frameOpen) {
        closePickupMenu();
    }
}

export function initDealerPickupMenu() {
    log("[GSIS] DealerPickupMenu inicializado con patrón Master-Detail KCD");
    registerWindow({
        id: "GSIS_PICKUP",
        visible: function () { return isPickupMenuVisible(); },
        render: renderPickupWindow,
        after: afterPickupFrame
    });
}

register({
    name: "DealerPickupMenu",
    init: initDealerPickupMenu
});
