// ============================================================================
// GSIS DealerPickupMenu - Menu de retiro de pedidos del dealer (Diseño Full-Width)
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { registerWindow } from "./gsis_UIManager.js";
import {
    SIZES, COND, COLORS,
    pushMenuStyle, popMenuStyle,
    uiButton, uiStatRow, uiSectionHeader, textColored
} from "./gsis_UIStyle.js";
import {
    isPickupMenuVisible, closePickupMenu,
    getOrder, removeFromOrder
} from "../modules/gsis_DealerPickup.js";
import { addItem, getTotalWeight } from "../modules/gsis_Items.js";
import { getItemName, getItemWeight } from "../data/gsis_item_data.js";
import { MISC } from "../core/gsis_Config.js";
import { t } from "../core/gsis_L10n.js";

var _qty = {};
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

function getPickupRowQty(itemId, maxQty) {
    if (!_qty[itemId]) _qty[itemId] = 1;
    if (_qty[itemId] > maxQty) _qty[itemId] = maxQty;
    if (_qty[itemId] < 1) _qty[itemId] = 1;
    return _qty[itemId];
}

function collectItem(itemId, qty) {
    var order = getOrder();
    if (!order) return false;
    if (qty < 1) return false;

    var maxInOrder = orderQty(order, itemId);
    if (maxInOrder <= 0 || qty > maxInOrder) {
        try { showTextBox(t("PKC_IVL")); } catch(e){}
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
        } catch(e){}
        return false;
    }

    if (!addItem(itemId, qty)) {
        try { showTextBox(t("PKC_ERR", { name: getItemName(itemId) })); } catch(e){}
        return false;
    }

    removeFromOrder(itemId, qty);
    _qty[itemId] = 1;
    try { showTextBox(t("PKC_TAK", { qty: qty, name: getItemName(itemId) })); } catch(e){}
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
        } catch(e){}
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

    _qty = {};
    try { showTextBox(t("PKC_ALL")); } catch(e){}
    return true;
}

function renderOrderList(order) {
    ImGui.BeginChild("pk_list", 0, -80.0, true);

    uiSectionHeader("OBJETOS DISPONIBLES EN EL PEDIDO");

    ImGui.Columns(4);
    textColored("PRODUCTO", COLORS.textGold);
    ImGui.NextColumn();
    textColored("PESO UNITARIO", COLORS.textGold);
    ImGui.NextColumn();
    textColored("CANTIDAD", COLORS.textGold);
    ImGui.NextColumn();
    textColored("ACCIÓN", COLORS.textGold);
    ImGui.NextColumn();
    ImGui.Separator();

    for (var i = 0; i < order.items.length; i++) {
        var it = order.items[i];
        var maxQty = it.qty;
        var unitW = getItemWeight(it.id);

        ImGui.Text(getItemName(it.id));
        ImGui.NextColumn();

        ImGui.Text(unitW.toFixed(1) + " kg");
        ImGui.NextColumn();

        var q = getPickupRowQty(it.id, maxQty);
        if (ImGui.Button("<##pk_" + it.id, 20, SIZES.btnSm)) {
            if (q > 1) _qty[it.id] = q - 1;
        }
        ImGui.SameLine();
        ImGui.Text("" + q + " / " + maxQty);
        ImGui.SameLine();
        if (ImGui.Button(">##pk_" + it.id, 20, SIZES.btnSm)) {
            if (q < maxQty) _qty[it.id] = q + 1;
        }
        ImGui.NextColumn();

        if (uiButton("RETIRAR OBJETO##pk_" + it.id, 130.0, SIZES.btnSm, COLORS.accent)) {
            _clickedCollectId = it.id;
            _clickedCollectQty = getPickupRowQty(it.id, maxQty);
        }
        ImGui.NextColumn();
    }

    ImGui.Columns(1);
    ImGui.EndChild();
}

function renderPickupWindow() {
    _clickedCollectId = null;
    _clickedCollectQty = 0;
    _clickedAll = false;
    _frameOpen = true;

    var order = getOrder();
    if (!order) {
        closePickupMenu();
        return;
    }

    pushMenuStyle();
    ImGui.SetNextWindowSize(SIZES.pickupW, SIZES.mainH, 1);
    ImGui.SetNextWindowPos(180.0, 100.0, 2);
    var open = ImGui.Begin(t("PKC_TTL"), true, false, false, false, false);
    ImGui.SetWindowSize(SIZES.pickupW, SIZES.mainH, 0);

    var invW = getTotalWeight();
    var orderW = calcOrderWeight(order);
    var freeW = freeWeight();

    uiStatRow("INVENTARIO CJ: ", invW.toFixed(1) + "/" + MISC.MAX_INVENTORY_WEIGHT + "kg", COLORS.textGreen);
    ImGui.SameLine(280.0);
    uiStatRow("PESO PEDIDO: ", orderW.toFixed(1) + "kg", COLORS.textGold);
    ImGui.SameLine(480.0);
    uiStatRow("ESPACIO LIBRE: ", freeW.toFixed(1) + "kg", freeW >= orderW ? COLORS.textGreen : COLORS.textDanger);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderOrderList(order);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    if (uiButton("RECOGER TODO EL PEDIDO##all", 280.0, SIZES.btnLg, COLORS.accent)) {
        _clickedAll = true;
    }

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
    log("[GSIS] DealerPickupMenu inicializado - tecla F cerca de la esfera de retiro");
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
