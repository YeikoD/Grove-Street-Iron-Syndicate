// ============================================================================
// GSIS DealerPickupMenu - Menu de retiro de pedidos del dealer
// ============================================================================
// Retiro item a item (qty del jugador) o RECOGER TODO.
// Seguridad: pre-check peso (MISC.MAX_INVENTORY_WEIGHT) antes de addItem; solo quita del pedido
// despues de addItem exitoso (sin items gratis ni pedido huerfano).
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import {
    isPickupMenuVisible, closePickupMenu,
    getOrder, removeFromOrder
} from "../modules/gsis_DealerPickup.js";
import { addItem, getTotalWeight } from "../modules/gsis_Items.js";
import { getItemName, getItemWeight } from "../data/gsis_item_data.js";
import { MISC } from "../core/gsis_Config.js";
import { t } from "../core/gsis_L10n.js";

var _menuWidth = 560.0;
var _btnHeight = 28.0;
var _stepW = 30.0;
var _collectW = 118.0;
var _footerBtnH = 32.0;
var _qty = {}; // { itemId: qty } selector local por fila

function pickupListHeight(itemCount) {
    var h = 16 + itemCount * 34;
    if (h < 50) return 50;
    if (h > 320) return 320;
    return h;
}

function calcPickupMenuHeight(itemCount) {
    // title + header + lista + footer + padding
    return Math.max(300, 30 + 78 + pickupListHeight(itemCount) + 78);
}

export function initDealerPickupMenu() {
    log("[GSIS] DealerPickupMenu inicializado - tecla F cerca de la esfera de retiro");
}

function pushPickupStyle() {
    ImGui.PushStyleColor(2, 15, 15, 20, 230);
    ImGui.PushStyleColor(3, 12, 12, 16, 200);
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

function popPickupStyle() {
    ImGui.PopStyleVar(2);
    ImGui.PopStyleColor(12);
}

function pushCollectStyle() {
    ImGui.PushStyleColor(21, 35, 70, 35, 255);
    ImGui.PushStyleColor(22, 50, 95, 50, 255);
    ImGui.PushStyleColor(23, 28, 55, 28, 255);
}

function popCollectStyle() {
    ImGui.PopStyleColor(3);
}

function pushPickupCloseStyle() {
    ImGui.PushStyleColor(21, 60, 25, 25, 255);
    ImGui.PushStyleColor(22, 85, 30, 30, 255);
    ImGui.PushStyleColor(23, 45, 18, 18, 255);
}

function popPickupCloseStyle() {
    ImGui.PopStyleColor(3);
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

    // Copia de items — removeFromOrder puede vaciar el pedido en el ultimo
    var items = [];
    for (var i = 0; i < order.items.length; i++) {
        items.push({ id: order.items[i].id, qty: order.items[i].qty });
    }

    for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (!collectItem(it.id, it.qty)) {
            // Parcial: lo ya recogido queda en inventario; el resto sigue en el pedido
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

        // col0: nombre + x qty pendiente
        ImGui.Text(getItemName(it.id) + " x" + maxQty);
        ImGui.NextColumn();

        // col1: peso unitario
        ImGui.TextDisabled(unitW.toFixed(1) + " kg/u");
        ImGui.NextColumn();

        // col2: selector qty
        var q = getPickupRowQty(it.id, maxQty);
        if (ImGui.Button("<##pk_" + it.id, _stepW, _btnHeight)) {
            if (q > 1) _qty[it.id] = q - 1;
        }
        ImGui.SameLine();
        ImGui.Text("" + q);
        ImGui.SameLine();
        if (ImGui.Button(">##pk_" + it.id, _stepW, _btnHeight)) {
            if (q < maxQty) _qty[it.id] = q + 1;
        }
        ImGui.NextColumn();

        // col3: recoger esa qty (llena casi toda la columna)
        pushCollectStyle();
        if (ImGui.Button(t("BTN_PCK") + "##" + it.id, _collectW, _btnHeight)) {
            // accion diferida post-End (ver clickedCollectId)
            _clickedCollectId = it.id;
            _clickedCollectQty = getPickupRowQty(it.id, maxQty);
        }
        popCollectStyle();
        ImGui.NextColumn();

        if (i < order.items.length - 1) {
            ImGui.Separator();
        }
    }

    ImGui.Columns(1);
    ImGui.EndChild();
}

// deferred click (fuera de Columns para no romper layout)
var _clickedCollectId = null;
var _clickedCollectQty = 0;

export function renderDealerPickupMenu() {
    _clickedCollectId = null;
    _clickedCollectQty = 0;

    ImGui.BeginFrame("GSIS_PICKUP");

    if (!isPickupMenuVisible()) {
        ImGui.SetCursorVisible(false);
        ImGui.EndFrame();
        return;
    }

    ImGui.SetCursorVisible(true);

    var order = getOrder();
    if (!order) {
        closePickupMenu();
        ImGui.SetCursorVisible(false);
        ImGui.EndFrame();
        return;
    }

    pushPickupStyle();
    ImGui.SetNextWindowSize(_menuWidth, calcPickupMenuHeight(order.items.length), 1);
    ImGui.SetNextWindowPos(60.0, 80.0, 2);
    var open = ImGui.Begin(t("PKC_TTL"), true, false, true, false, false);

    // Header: inventario + libre + peso pedido
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

    // Filas: nombre | peso/u | < qty > | Recoger (en child scroll)
    renderOrderList(order);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    // Footer: RECOGER TODO + Cerrar al 50%
    var half = (_menuWidth - 30) / 2;
    pushCollectStyle();
    var clickedAll = ImGui.Button(t("BTN_ALL"), half, _footerBtnH);
    popCollectStyle();
    ImGui.SameLine();
    pushPickupCloseStyle();
    var clickedClose = ImGui.Button(t("BTN_CLS"), half, _footerBtnH);
    popPickupCloseStyle();

    ImGui.End();
    popPickupStyle();
    ImGui.EndFrame();

    // Acciones post-frame (pedido puede haber cambiado)
    if (_clickedCollectId) {
        collectItem(_clickedCollectId, _clickedCollectQty);
    }
    if (clickedAll) {
        collectAll();
    }
    if (clickedClose || !open) {
        closePickupMenu();
    }
}

register({
    name: "DealerPickupMenu",
    init: initDealerPickupMenu,
    update: renderDealerPickupMenu
});
