// ============================================================================
// GSIS DealerMenu - Menu carrito del dealer mayorista
// ============================================================================
// Layout: header (dinero + total), catalogo con qty por fila + Agregar,
//         resumen carrito, botones RESETEAR/COMPRAR, Cerrar
// Compra orquestada desde UI: checkout() en WeaponDealer module
// Personaje activo de la esfera: título + precios (ch.dealer markup/prices)
// Ventana registrada en UIManager (acciones en after(), post-EndFrame).
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { registerWindow } from "./gsis_UIManager.js";
import {
    SIZES, COND, COLORS,
    pushMenuStyle, popMenuStyle,
    pushBtn, popBtn
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

var _qty = {}; // { itemId: qty } selector local por fila (no es el carrito)

// deferred post-frame
var _clickedReset = false;
var _clickedCheckout = false;
var _closeRequested = false;
var _frameOpen = true;

function dealerMenuTitle() {
    var n = query("characters:name", { characterId: getActiveCharacterId() });
    if (n && n.name) return n.name;
    return t("DLR_TTL");
}

function getQty(itemId) {
    if (!_qty[itemId]) _qty[itemId] = 1;
    return _qty[itemId];
}

function renderWeaponList() {
    var list = [];
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        if (WEAPON_DATA[i].itemId === "pistol_assembled") continue;
        if (!getDealerPrice(WEAPON_DATA[i].itemId)) continue;
        list.push(WEAPON_DATA[i]);
    }

    ImGui.Columns(4);

    for (var j = 0; j < list.length; j++) {
        var w = list[j];
        ImGui.Text(w.name);
        ImGui.NextColumn();

        ImGui.Text("$" + getDealerPrice(w.itemId));
        ImGui.NextColumn();

        var q = getQty(w.itemId);
        if (ImGui.Button("<##" + w.itemId, 22, SIZES.btnSm)) {
            if (q > 1) _qty[w.itemId] = q - 1;
        }
        ImGui.SameLine();
        ImGui.Text("" + q);
        ImGui.SameLine();
        if (ImGui.Button(">##" + w.itemId, 22, SIZES.btnSm)) {
            if (q < 10) _qty[w.itemId] = q + 1;
        }
        ImGui.NextColumn();

        pushBtn(COLORS.accent);
        if (ImGui.Button(t("BTN_ADD") + "##" + w.itemId, 80, SIZES.btnSm)) {
            addToCart(w.itemId, getQty(w.itemId));
            _qty[w.itemId] = 1;
        }
        popBtn();
        ImGui.NextColumn();

        if (j < list.length - 1) {
            ImGui.Separator();
        }
    }

    ImGui.Columns(1);
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

    var line = "";
    for (var i = 0; i < keys.length; i++) {
        if (i > 0) line += ", ";
        line += getItemName(keys[i]) + " x" + cart[keys[i]];
    }
    ImGui.TextWrapped(line);
}

function renderDealerWindow() {
    _clickedReset = false;
    _clickedCheckout = false;
    _closeRequested = false;
    _frameOpen = true;

    pushMenuStyle();
    ImGui.SetNextWindowSize(SIZES.dealerW, SIZES.mainH, COND.Once);
    ImGui.SetNextWindowPos(50.0, 60.0, COND.Once);
    var open = ImGui.Begin(dealerMenuTitle(), true, false, false, false, false);

    ImGui.Text(t("MONEY", { n: getCJMoney() }));
    ImGui.SameLine();
    ImGui.TextDisabled("|  " + t("DLR_TOT", { n: getCartTotal() }));
    ImGui.Spacing();

    var half = (SIZES.dealerW - 30) / 2;
    pushBtn(COLORS.warning);
    _clickedReset = ImGui.Button(t("BTN_RST"), half, SIZES.btnLg);
    popBtn();
    ImGui.SameLine();
    pushBtn(COLORS.accent);
    _clickedCheckout = ImGui.Button(t("BTN_BUY"), half, SIZES.btnLg);
    popBtn();

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderWeaponList();

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderCartSummary();
    ImGui.Spacing();

    pushBtn(COLORS.danger);
    _closeRequested = ImGui.Button(t("BTN_CLS"), SIZES.dealerW - 20, SIZES.btnLg);
    popBtn();

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
    if (_closeRequested || !_frameOpen) {
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
