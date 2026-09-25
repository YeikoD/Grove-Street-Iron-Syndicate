// ============================================================================
// GSIS SellMenu - Menu de trueque (punto de venta de armas, Diseño Full-Width)
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { registerWindow } from "./gsis_UIManager.js";
import {
    SIZES, COND, COLORS,
    pushMenuStyle, popMenuStyle,
    uiButton, uiStatRow, uiSectionHeader, textColored
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

function sellMenuTitle() {
    var n = query("characters:name", { characterId: getActiveCharacterId() });
    if (n && n.name) return n.name + " - COMERCIO DE ARMAS";
    return t("SEL_TTL");
}

var _qty = {};
var _offer = {};
var _showBudget = false;

var _clickedOfferId = null;
var _clickedOfferQty = 0;
var _clickedOfferPrice = 0;
var _frameOpen = true;

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
    ImGui.BeginChild("sl_list", 0, -85.0, true);

    uiSectionHeader("ARMAS DISPONIBLES EN TU INVENTARIO");

    if (list.length === 0) {
        ImGui.Spacing();
        ImGui.TextDisabled(t("SEL_NON"));
        ImGui.EndChild();
        return;
    }

    ImGui.Columns(4);
    ImGui.SetColumnWidth(0, 180.0);
    ImGui.SetColumnWidth(1, 100.0);
    ImGui.SetColumnWidth(2, 290.0);
    ImGui.SetColumnWidth(3, 140.0);

    textColored("ARMA", COLORS.textGold);
    ImGui.NextColumn();
    textColored("VALOR BASE", COLORS.textGold);
    ImGui.NextColumn();
    textColored("CANTIDAD Y OFERTA ($)", COLORS.textGold);
    ImGui.NextColumn();
    textColored("ACCIÓN", COLORS.textGold);
    ImGui.NextColumn();
    ImGui.Separator();

    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var maxQty = it.qty;

        ImGui.Text(getItemName(it.id));
        ImGui.NextColumn();

        ImGui.Text("$" + it.sellPrice);
        ImGui.NextColumn();

        var q = getSellRowQty(it.id, maxQty);
        if (ImGui.Button("<##sq_" + it.id, 16, SIZES.btnSm)) {
            if (q > 1) _qty[it.id] = q - 1;
        }
        ImGui.SameLine();
        ImGui.Text("" + q + "/" + maxQty);
        ImGui.SameLine();
        if (ImGui.Button(">##sq_" + it.id, 16, SIZES.btnSm)) {
            if (q < maxQty) _qty[it.id] = q + 1;
        }

        ImGui.SameLine(130.0);
        var off = getRowOffer(it.id, it.sellPrice);
        if (ImGui.Button("<##so_" + it.id, 16, SIZES.btnSm)) {
            if (off > 10) _offer[it.id] = off - 10;
            else _offer[it.id] = 1;
        }
        ImGui.SameLine();
        ImGui.Text("$" + off);
        ImGui.SameLine();
        if (ImGui.Button(">##so_" + it.id, 16, SIZES.btnSm)) {
            _offer[it.id] = off + 10;
        }
        ImGui.NextColumn();

        if (uiButton("OFERTAR ARMA##sl_" + it.id, 130.0, SIZES.btnSm, COLORS.accent)) {
            _clickedOfferId = it.id;
            _clickedOfferQty = getSellRowQty(it.id, maxQty);
            _clickedOfferPrice = getRowOffer(it.id, it.sellPrice);
        }
        ImGui.NextColumn();
    }

    ImGui.Columns(1);
    ImGui.EndChild();
}

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
    ImGui.SetNextWindowSize(SIZES.sellW, SIZES.mainH, 1);
    ImGui.SetNextWindowPos(180.0, 100.0, 2);
    var open = ImGui.Begin(sellMenuTitle(), true, false, false, false, false);
    ImGui.SetWindowSize(SIZES.sellW, SIZES.mainH, 0);

    var moneyStr = "$0";
    try { moneyStr = "$" + new Player(0).storeScore().toLocaleString(); } catch (e) { }

    uiStatRow("TU DINERO: ", moneyStr, COLORS.textGreen);
    ImGui.SameLine(280.0);
    uiStatRow("INTERÉS COMPRADOR: ", state.interests.join(", "), COLORS.textGold);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderWeaponList(list);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    textColored("NEGOCIACIÓN: ", COLORS.textGold);
    ImGui.SameLine();
    ImGui.TextDisabled("Los compradores pagan un extra considerable si el arma coincide con sus intereses.");

    if (_showBudget) {
        ImGui.SameLine();
        uiStatRow("| PRESUPUESTO COMPRADOR: ", "$" + state.budget, COLORS.textGreen);
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
