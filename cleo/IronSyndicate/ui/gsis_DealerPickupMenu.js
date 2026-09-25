// ============================================================================
// GSIS DealerPickupMenu - Menu de retiro de pedidos del dealer
// ============================================================================
// Retiro item a item (qty del jugador) o RECOGER TODO.
// Seguridad: pre-check peso (MISC.MAX_INVENTORY_WEIGHT) antes de addItem; solo quita del pedido
// despues de addItem exitoso (sin items gratis ni pedido huerfano).
// Ventana registrada en UIManager (acciones en after(), post-EndFrame).
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { registerWindow } from "./gsis_UIManager.js";
import {
    SIZES, COND, COLORS,
    pushMenuStyle, popMenuStyle,
    pushBtn, popBtn
} from "./gsis_UIStyle.js";
import {
    isPickupMenuVisible, closePickupMenu,
    getOrder, removeFromOrder
} from "../modules/gsis_DealerPickup.js";
import { addItem, getTotalWeight } from "../modules/gsis_Items.js";
import { getItemName, getItemWeight } from "../data/gsis_item_data.js";
import { MISC } from "../core/gsis_Config.js";
import { t } from "../core/gsis_L10n.js";

var _qty = {}; // { itemId: qty } selector local por fila

// deferred click (fuera de Columns para no romper layout)
var _clickedCollectId = null;
var _clickedCollectQty = 0;
var _clickedAll = false;
var _closeRequested = false;
var _frameOpen = true;

function pickupListHeight(itemCount) {
    var h = 16 + itemCount * 34;
    if (h < 50) return 50;
    if (h > 320) return 320;
    return h;
}

function calcPickupMenuHeight(itemCount) {
    return Math.max(300, 30 + 78 + pickupListHeight(itemCount) + 78);
}

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

// Retiro seguro de qty de un item:
// 1) qty valido dentro del pedido
// 2) pre-check peso (MISC.MAX_INVENTORY_WEIGHT)
// 3) addItem
// 4) recien ahi removeFromOrder
function collectItem(itemId, qty) {
    var order = getOrder();
    if (!order) return false;
    if (qty < 1) return false;

    var maxInOrder = orderQty(order, itemId);
    if (maxInOrder <= 0 || qty > maxInOrder) {
        showTextBox(t("PKC_IVL"));
        return false;
    }

    var w = getItemWeight(itemId) * qty;
    var free = freeWeight();
    if (w > free) {
        showTextBox(t("INV_FR", {
            free: free.toFixed(1),
            need: w.toFixed(1)
        }));
        return false;
    }

    log("[DealerPickupMenu] Intentando agregar: " + itemId + " x" + qty);
    if (!addItem(itemId, qty)) {
        log("[DealerPickupMenu] ERROR: addItem fallo para " + itemId);
        showTextBox(t("PKC_ERR", { name: getItemName(itemId) }));
        return false;
    }

    log("[DealerPickupMenu] addItem exitoso, removiendo del pedido: " + itemId);
    removeFromOrder(itemId, qty);
    _qty[itemId] = 1;
    showTextBox(t("PKC_TAK", { qty: qty, name: getItemName(itemId) }));
    return true;
}

// RECOGER TODO: pre-check total, luego item por item (addItem + removeFromOrder)
function collectAll() {
    var order = getOrder();
    if (!order) return false;

    var orderWeight = calcOrderWeight(order);
    var free = freeWeight();
    if (orderWeight > free) {
        showTextBox(t("PKC_NOC", {
            free: free.toFixed(1),
            order: orderWeight.toFixed(1)
        }));
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
    showTextBox(t("PKC_ALL"));
    return true;
}

function renderOrderList(order) {
    ImGui.BeginChild("pk_list", 0, pickupListHeight(order.items.length), true);
    ImGui.Columns(4);

    for (var i = 0; i < order.items.length; i++) {
        var it = order.items[i];
        var maxQty = it.qty;
        var unitW = getItemWeight(it.id);

        ImGui.Text(getItemName(it.id) + " x" + maxQty);
        ImGui.NextColumn();

        ImGui.TextDisabled(unitW.toFixed(1) + " kg/u");
        ImGui.NextColumn();

        var q = getPickupRowQty(it.id, maxQty);
        if (ImGui.Button("<##pk_" + it.id, SIZES.stepW, SIZES.btnMd)) {
            if (q > 1) _qty[it.id] = q - 1;
        }
        ImGui.SameLine();
        ImGui.Text("" + q);
        ImGui.SameLine();
        if (ImGui.Button(">##pk_" + it.id, SIZES.stepW, SIZES.btnMd)) {
            if (q < maxQty) _qty[it.id] = q + 1;
        }
        ImGui.NextColumn();

        pushBtn(COLORS.accent);
        if (ImGui.Button(t("BTN_PCK") + "##" + it.id, SIZES.collectW, SIZES.btnMd)) {
            _clickedCollectId = it.id;
            _clickedCollectQty = getPickupRowQty(it.id, maxQty);
        }
        popBtn();
        ImGui.NextColumn();

        if (i < order.items.length - 1) {
            ImGui.Separator();
        }
    }

    ImGui.Columns(1);
    ImGui.EndChild();
}

function renderPickupWindow() {
    _clickedCollectId = null;
    _clickedCollectQty = 0;
    _clickedAll = false;
    _closeRequested = false;
    _frameOpen = true;

    var order = getOrder();
    if (!order) {
        closePickupMenu();
        return;
    }

    pushMenuStyle();
    ImGui.SetNextWindowSize(SIZES.pickupW, calcPickupMenuHeight(order.items.length), COND.Always);
    ImGui.SetNextWindowPos(60.0, 80.0, COND.Once);
    var open = ImGui.Begin(t("PKC_TTL"), true, false, true, false, false);

    var orderWeight = calcOrderWeight(order);
    var invW = getTotalWeight();
    ImGui.Text(t("INV_L", {
        w: invW.toFixed(1),
        max: MISC.MAX_INVENTORY_WEIGHT
    }));
    ImGui.SameLine();
    ImGui.TextDisabled("|  " + t("FRE_L", { n: freeWeight().toFixed(1) }));
    ImGui.Spacing();
    ImGui.Text(t("PKC_ORD", {
        n: order.total,
        w: orderWeight.toFixed(1)
    }));
    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderOrderList(order);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    pushBtn(COLORS.accent);
    _clickedAll = ImGui.Button(t("BTN_ALL"), SIZES.pickupW - 20, SIZES.btnLg);
    popBtn();

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
