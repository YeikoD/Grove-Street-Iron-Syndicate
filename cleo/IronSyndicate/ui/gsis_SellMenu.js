// ============================================================================
// GSIS SellMenu - Menu de trueque (punto de venta de armas)
// ============================================================================
// Lista solo armas del inventario con qty + oferta + Ofrecer.
// NPC (personaje activo de la esfera) evalua techo/presupuesto;
// UI orquesta removeItem + addScore.
// Feedback via characters:say con characterId activo (seller_local/Juan/…).
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

var _qty = {};        // { itemId: qty }
var _offer = {};      // { itemId: precio unitario }
var _showBudget = false;

// deferred click
var _clickedOfferId = null;
var _clickedOfferQty = 0;
var _clickedOfferPrice = 0;
var _frameOpen = true;

function sellListHeight(itemCount) {
    var h = 16 + itemCount * 36;
    if (h < 50) return 50;
    if (h > 340) return 340;
    return h;
}

function calcSellMenuHeight(itemCount) {
    return Math.max(260, 30 + 60 + sellListHeight(itemCount) + 25);
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

        ImGui.Text(getItemName(it.id) + " x" + maxQty);
        ImGui.NextColumn();

        ImGui.TextDisabled("$" + it.sellPrice);
        ImGui.NextColumn();

        var q = getSellRowQty(it.id, maxQty);
        if (ImGui.Button("<##sq_" + it.id, SIZES.stepW, SIZES.btnSm)) {
            if (q > 1) _qty[it.id] = q - 1;
        }
        ImGui.SameLine();
        ImGui.Text("" + q);
        ImGui.SameLine();
        if (ImGui.Button(">##sq_" + it.id, SIZES.stepW, SIZES.btnSm)) {
            if (q < maxQty) _qty[it.id] = q + 1;
        }
        ImGui.NextColumn();

        var off = getRowOffer(it.id, it.sellPrice);
        if (ImGui.Button("<##so_" + it.id, SIZES.stepW, SIZES.btnSm)) {
            if (off > 10) _offer[it.id] = off - 10;
            else _offer[it.id] = 1;
        }
        ImGui.SameLine();
        ImGui.Text("$" + off);
        ImGui.SameLine();
        if (ImGui.Button(">##so_" + it.id, SIZES.stepW, SIZES.btnSm)) {
            _offer[it.id] = off + 10;
        }
        ImGui.NextColumn();

        pushBtn(COLORS.accent);
        if (ImGui.Button(t("BTN_OFF") + "##sl_" + it.id, SIZES.actionW, SIZES.btnSm)) {
            _clickedOfferId = it.id;
            _clickedOfferQty = getSellRowQty(it.id, maxQty);
            _clickedOfferPrice = getRowOffer(it.id, it.sellPrice);
        }
        popBtn();
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

    if (!removeItem(itemId, qty)) {
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

function renderSellWindow() {
    _clickedOfferId = null;
    _clickedOfferQty = 0;
    _clickedOfferPrice = 0;
    _frameOpen = true;

    var list = getSellableWeapons();
    var state = getSellState();

    pushMenuStyle();
    ImGui.SetNextWindowSize(SIZES.sellW, calcSellMenuHeight(list.length), COND.Always);
    ImGui.SetNextWindowPos(60.0, 80.0, COND.Once);
    var open = ImGui.Begin(sellMenuTitle(), true, false, true, false, false);

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

    ImGui.End();
    popMenuStyle();

    _frameOpen = open;
}

function afterSellFrame() {
    if (_clickedOfferId) {
        doOffer(_clickedOfferId, _clickedOfferQty, _clickedOfferPrice);
    }
    if (!_frameOpen) {
        closeSellMenu();
    }
}

export function initSellMenu() {
    log("[GSIS] SellMenu inicializado - tecla F cerca del punto de venta");
    registerWindow({
        id: "GSIS_SELL",
        visible: function () { return isSellMenuVisible(); },
        render: renderSellWindow,
        after: afterSellFrame
    });
}

register({
    name: "SellMenu",
    init: initSellMenu
});
