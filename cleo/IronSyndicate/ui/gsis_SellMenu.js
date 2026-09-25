// ============================================================================
// GSIS SellMenu - Menu de trueque (punto de venta de armas)
// ============================================================================
// Lista solo armas del inventario con qty + oferta + Ofrecer.
// NPC (personaje activo de la esfera) evalua techo/presupuesto;
// UI orquesta removeItem + addScore.
// Feedback via characters:say con characterId activo (seller_local/Juan/…).
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import {
    isSellMenuVisible, closeSellMenu,
    getSellState, offerWeapon, getActiveCharacterId
} from "../modules/gsis_WeaponSeller.js";
import { getItems, removeItem } from "../modules/gsis_Items.js";
import { getItemName, getItemType } from "../data/gsis_item_data.js";
import { getSellPrice } from "../data/gsis_weapon_data.js";
import { t } from "../core/gsis_L10n.js";
import { emit, query } from "../core/gsis_EventBus.js";

function playNpcLine(key, params) {
    emit("characters:say", {
        characterId: getActiveCharacterId(),
        key: key,
        params: params || null,
        ms: 3000,
        replace: true
    });
}

// Título: nombre del personaje activo o fallback SEL_TTL
function sellMenuTitle() {
    var n = query("characters:name", { characterId: getActiveCharacterId() });
    if (n && n.name) return n.name;
    return t("SEL_TTL");
}

var _menuWidth = 620.0;
var _btnHeight = 26.0;
var _stepW = 30.0;
var _offerW = 80.0;
var _footerBtnH = 32.0;
var _qty = {};        // { itemId: qty }
var _offer = {};      // { itemId: precio unitario }
var _showBudget = false;

// deferred click
var _clickedOfferId = null;
var _clickedOfferQty = 0;
var _clickedOfferPrice = 0;

function sellListHeight(itemCount) {
    var h = 16 + itemCount * 36;
    if (h < 50) return 50;
    if (h > 340) return 340;
    return h;
}

function calcSellMenuHeight(itemCount) {
    return Math.max(320, 30 + 96 + sellListHeight(itemCount) + 70);
}

export function initSellMenu() {
    log("[GSIS] SellMenu inicializado - tecla F cerca del punto de venta");
}

function pushSellStyle() {
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

function popSellStyle() {
    ImGui.PopStyleVar(2);
    ImGui.PopStyleColor(12);
}

function pushOfferStyle() {
    ImGui.PushStyleColor(21, 35, 70, 35, 255);
    ImGui.PushStyleColor(22, 50, 95, 50, 255);
    ImGui.PushStyleColor(23, 28, 55, 28, 255);
}

function popOfferStyle() {
    ImGui.PopStyleColor(3);
}

function pushSellCloseStyle() {
    ImGui.PushStyleColor(21, 60, 25, 25, 255);
    ImGui.PushStyleColor(22, 85, 30, 30, 255);
    ImGui.PushStyleColor(23, 45, 18, 18, 255);
}

function popSellCloseStyle() {
    ImGui.PopStyleColor(3);
}

function getSellRowQty(itemId, maxQty) {
    if (!_qty[itemId]) _qty[itemId] = 1;
    if (_qty[itemId] > maxQty) _qty[itemId] = maxQty;
    if (_qty[itemId] < 1) _qty[itemId] = 1;
    return _qty[itemId];
}

function getRowOffer(itemId, sellPrice) {
    if (!_offer[itemId]) _offer[itemId] = sellPrice;
    if (_offer[itemId] < 1) _offer[itemId] = 1;
    return _offer[itemId];
}

// Armas del inventario con sellPrice > 0
function getSellableWeapons() {
    var items = getItems();
    var list = [];
    for (var i = 0; i < items.length; i++) {
        var id = items[i].id;
        if (getItemType(id) !== "weapon") continue;
        var sp = getSellPrice(id);
        if (!sp) continue;
        list.push({ id: id, qty: items[i].qty, sellPrice: sp });
    }
    return list;
}

function invQty(itemId) {
    var items = getItems();
    for (var i = 0; i < items.length; i++) {
        if (items[i].id === itemId) return items[i].qty;
    }
    return 0;
}

function renderWeaponList(list) {
    ImGui.BeginChild("sl_list", 0, sellListHeight(list.length), true);
    ImGui.Columns(5);

    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var maxQty = it.qty;

        // col0: nombre + stock
        ImGui.Text(getItemName(it.id) + " x" + maxQty);
        ImGui.NextColumn();

        // col1: valor de mercado
        ImGui.TextDisabled("$" + it.sellPrice);
        ImGui.NextColumn();

        // col2: selector qty
        var q = getSellRowQty(it.id, maxQty);
        if (ImGui.Button("<##sq_" + it.id, _stepW, _btnHeight)) {
            if (q > 1) _qty[it.id] = q - 1;
        }
        ImGui.SameLine();
        ImGui.Text("" + q);
        ImGui.SameLine();
        if (ImGui.Button(">##sq_" + it.id, _stepW, _btnHeight)) {
            if (q < maxQty) _qty[it.id] = q + 1;
        }
        ImGui.NextColumn();

        // col3: precio oferta (steps -10/+10)
        var off = getRowOffer(it.id, it.sellPrice);
        if (ImGui.Button("<##so_" + it.id, _stepW, _btnHeight)) {
            if (off > 10) _offer[it.id] = off - 10;
            else _offer[it.id] = 1;
        }
        ImGui.SameLine();
        ImGui.Text("$" + off);
        ImGui.SameLine();
        if (ImGui.Button(">##so_" + it.id, _stepW, _btnHeight)) {
            _offer[it.id] = off + 10;
        }
        ImGui.NextColumn();

        // col4: ofrecer
        pushOfferStyle();
        if (ImGui.Button(t("BTN_OFF") + "##sl_" + it.id, _offerW, _btnHeight)) {
            _clickedOfferId = it.id;
            _clickedOfferQty = getSellRowQty(it.id, maxQty);
            _clickedOfferPrice = getRowOffer(it.id, it.sellPrice);
        }
        popOfferStyle();
        ImGui.NextColumn();

        if (i < list.length - 1) {
            ImGui.Separator();
        }
    }

    ImGui.Columns(1);
    ImGui.EndChild();
}

// Ofrecer: pre-check qty -> offerWeapon -> removeItem + addScore
function doOffer(itemId, qty, unitPrice) {
    var have = invQty(itemId);
    if (have < qty) {
        playNpcLine("SEL_NOQ");
        return false;
    }

    var result = offerWeapon(itemId, qty, unitPrice);
    if (result.msgKey) playNpcLine(result.msgKey, result.msgParams);

    if (!result.ok) return false;

    // Quitar items + pagar (solo si el NPC acepto)
    if (!removeItem(itemId, qty)) {
        // fallo inesperado: no hay items — no hay nada que pagar
        playNpcLine("SEL_ERR");
        return false;
    }
    try {
        new Player(0).addScore(result.total);
    } catch (e) { }

    _showBudget = true;
    _qty[itemId] = 1;
    return true;
}

export function renderSellMenu() {
    _clickedOfferId = null;
    _clickedOfferQty = 0;
    _clickedOfferPrice = 0;

    ImGui.BeginFrame("GSIS_SELL");

    if (!isSellMenuVisible()) {
        ImGui.SetCursorVisible(false);
        ImGui.EndFrame();
        return;
    }

    ImGui.SetCursorVisible(true);

    var list = getSellableWeapons();
    var state = getSellState();

    pushSellStyle();
    ImGui.SetNextWindowSize(_menuWidth, calcSellMenuHeight(list.length), 1);
    ImGui.SetNextWindowPos(60.0, 80.0, 2);
    var open = ImGui.Begin(sellMenuTitle(), true, false, true, false, false);

    // Header: dinero + intereses (+ budget tras 1ª oferta)
    try {
        ImGui.Text(t("MONEY", { n: new Player(0).storeScore() }));
    } catch (e) {
        ImGui.Text(t("MONEY2"));
    }
    ImGui.SameLine();
    ImGui.TextDisabled("|  " + t("SEL_BUS", { list: state.interests.join(", ") }));
    if (_showBudget) {
        ImGui.SameLine();
        ImGui.TextDisabled("|  " + t("SEL_BUD", { n: state.budget }));
    }
    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    if (list.length === 0) {
        ImGui.TextDisabled(t("SEL_NON"));
    } else {
        renderWeaponList(list);
    }

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    pushSellCloseStyle();
    var clickedClose = ImGui.Button(t("BTN_CLS"), _menuWidth - 20, _footerBtnH);
    popSellCloseStyle();

    ImGui.End();
    popSellStyle();
    ImGui.EndFrame();

    // Acciones post-frame
    if (_clickedOfferId) {
        doOffer(_clickedOfferId, _clickedOfferQty, _clickedOfferPrice);
    }
    if (clickedClose || !open) {
        closeSellMenu();
    }
}

register({
    name: "SellMenu",
    init: initSellMenu,
    update: renderSellMenu
});
