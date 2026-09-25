// ============================================================================
// GSIS DealerMenu - Menu carrito del dealer mayorista (Diseño Full-Width)
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { registerWindow } from "./gsis_UIManager.js";
import {
    SIZES, COND, COLORS,
    pushMenuStyle, popMenuStyle,
    uiButton, uiStatRow, uiSectionHeader, textColored
} from "./gsis_UIStyle.js";
import { t } from "../core/gsis_L10n.js";
import { query } from "../core/gsis_EventBus.js";
import {
    isDealerMenuVisible, closeDealerMenu,
    getCart, getCartTotal, addToCart, resetCart, checkout, getCJMoney,
    getDealerPrice, getActiveCharacterId
} from "../modules/gsis_WeaponDealer.js";
import { WEAPON_DATA } from "../data/gsis_weapon_data.js";
import { getItemName } from "../data/gsis_item_data.js";

var _qty = {};
var _clickedReset = false;
var _clickedCheckout = false;
var _frameOpen = true;

function dealerMenuTitle() {
    var n = query("characters:name", { characterId: getActiveCharacterId() });
    if (n && n.name) return n.name + " - CATÁLOGO DE ARMAS";
    return t("DLR_TTL");
}

function getQty(itemId) {
    if (!_qty[itemId]) _qty[itemId] = 1;
    return _qty[itemId];
}

function renderCatalogList() {
    ImGui.BeginChild("dealer_catalog", 0, -95.0, true);

    uiSectionHeader("CATÁLOGO DE ARMAS DISPONIBLES");

    var list = [];
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        if (WEAPON_DATA[i].itemId === "pistol_assembled") continue;
        if (!getDealerPrice(WEAPON_DATA[i].itemId)) continue;
        list.push(WEAPON_DATA[i]);
    }

    ImGui.Columns(4);
    textColored("PRODUCTO", COLORS.textGold);
    ImGui.NextColumn();
    textColored("PRECIO", COLORS.textGold);
    ImGui.NextColumn();
    textColored("CANTIDAD", COLORS.textGold);
    ImGui.NextColumn();
    textColored("ACCIÓN", COLORS.textGold);
    ImGui.NextColumn();
    ImGui.Separator();

    for (var j = 0; j < list.length; j++) {
        var w = list[j];
        ImGui.Text(w.name);
        ImGui.NextColumn();

        ImGui.Text("$" + getDealerPrice(w.itemId));
        ImGui.NextColumn();

        var q = getQty(w.itemId);
        if (ImGui.Button("<##" + w.itemId, 20, SIZES.btnSm)) {
            if (q > 1) _qty[w.itemId] = q - 1;
        }
        ImGui.SameLine();
        ImGui.Text("" + q);
        ImGui.SameLine();
        if (ImGui.Button(">##" + w.itemId, 20, SIZES.btnSm)) {
            if (q < 10) _qty[w.itemId] = q + 1;
        }
        ImGui.NextColumn();

        if (uiButton("+ AÑADIR AL CARRITO##" + w.itemId, 150.0, SIZES.btnSm, COLORS.accent)) {
            addToCart(w.itemId, getQty(w.itemId));
            _qty[w.itemId] = 1;
        }
        ImGui.NextColumn();
    }

    ImGui.Columns(1);
    ImGui.EndChild();
}

function renderCartSummary() {
    var cart = getCart();
    var keys = [];
    for (var k in cart) {
        if (cart.hasOwnProperty(k)) keys.push(k);
    }

    if (keys.length === 0) {
        ImGui.TextDisabled(t("CRT_UI"));
        return;
    }

    var line = "CARRITO: ";
    for (var i = 0; i < keys.length; i++) {
        if (i > 0) line += ", ";
        line += getItemName(keys[i]) + " x" + cart[keys[i]];
    }
    textColored(line, COLORS.text);
}

function renderDealerWindow() {
    _clickedReset = false;
    _clickedCheckout = false;
    _frameOpen = true;

    pushMenuStyle();
    ImGui.SetNextWindowSize(SIZES.dealerW, SIZES.mainH, 1);
    ImGui.SetNextWindowPos(180.0, 100.0, 2);
    var open = ImGui.Begin(dealerMenuTitle(), true, false, false, false, false);
    ImGui.SetWindowSize(SIZES.dealerW, SIZES.mainH, 0);

    uiStatRow("DINERO CJ: ", "$" + getCJMoney().toLocaleString(), COLORS.textGreen);
    ImGui.SameLine(320.0);
    uiStatRow("TOTAL COMPRA: ", "$" + getCartTotal().toLocaleString(), COLORS.textGold);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderCatalogList();

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderCartSummary();

    ImGui.Spacing();

    if (uiButton("COMPRAR PEDIDO ($" + getCartTotal().toLocaleString() + ")##buy", 240.0, SIZES.btnLg, COLORS.accent)) {
        _clickedCheckout = true;
    }
    ImGui.SameLine();
    if (uiButton("VACIAR CARRITO##rst", 140.0, SIZES.btnLg, COLORS.danger)) {
        _clickedReset = true;
    }

    ImGui.End();
    popMenuStyle();

    _frameOpen = open;
}

function afterDealerFrame() {
    if (_clickedReset) {
        resetCart();
    }
    if (_clickedCheckout) {
        if (checkout()) {
            closeDealerMenu();
        }
    }
    if (!_frameOpen) {
        closeDealerMenu();
    }
}

export function initDealerMenu() {
    log("[GSIS] DealerMenu inicializado - tecla F cerca de la esfera");
    registerWindow({
        id: "GSIS_DEALER",
        visible: function () { return isDealerMenuVisible(); },
        render: renderDealerWindow,
        after: afterDealerFrame
    });
}

register({
    name: "DealerMenu",
    init: initDealerMenu
});
