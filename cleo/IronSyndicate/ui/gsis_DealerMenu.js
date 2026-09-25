// ============================================================================
// GSIS DealerMenu - Menu carrito del dealer mayorista
// ============================================================================
// Layout: header (dinero + total), catalogo con qty por fila + Agregar,
//         resumen carrito, botones RESETEAR/COMPRAR, Cerrar
// Compra orquestada desde UI: checkout() en WeaponDealer module
// Personaje activo de la esfera: título + precios (ch.dealer markup/prices)
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { t } from "../core/gsis_L10n.js";
import { query } from "../core/gsis_EventBus.js";
import {
    isDealerMenuVisible, closeDealerMenu,
    getCart, getCartTotal, addToCart, resetCart, checkout, getCJMoney,
    getDealerPrice, getActiveCharacterId
} from "../modules/gsis_WeaponDealer.js";
import { WEAPON_DATA } from "../data/gsis_weapon_data.js";
import { getItemName } from "../data/gsis_item_data.js";

var _menuWidth = 560.0;
var _menuHeight = 640.0;
var _btnHeight = 24.0;
var _qty = {}; // { itemId: qty } selector local por fila (no es el carrito)

export function initDealerMenu() {
    log("[GSIS] DealerMenu inicializado - tecla F cerca de la esfera");
}

// Título: nombre del personaje activo o fallback DLR_TTL
function dealerMenuTitle() {
    var n = query("characters:name", { characterId: getActiveCharacterId() });
    if (n && n.name) return n.name;
    return t("DLR_TTL");
}

function pushDealerStyle() {
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

function popDealerStyle() {
    ImGui.PopStyleVar(2);
    ImGui.PopStyleColor(12);
}

function pushBuyStyle() {
    ImGui.PushStyleColor(21, 35, 70, 35, 255);
    ImGui.PushStyleColor(22, 50, 95, 50, 255);
    ImGui.PushStyleColor(23, 28, 55, 28, 255);
}

function popBuyStyle() {
    ImGui.PopStyleColor(3);
}

function pushResetStyle() {
    ImGui.PushStyleColor(21, 60, 55, 25, 255);
    ImGui.PushStyleColor(22, 85, 75, 30, 255);
    ImGui.PushStyleColor(23, 45, 40, 18, 255);
}

function popResetStyle() {
    ImGui.PopStyleColor(3);
}

function pushCheckoutStyle() {
    ImGui.PushStyleColor(21, 35, 70, 35, 255);
    ImGui.PushStyleColor(22, 50, 95, 50, 255);
    ImGui.PushStyleColor(23, 28, 55, 28, 255);
}

function popCheckoutStyle() {
    ImGui.PopStyleColor(3);
}

function pushCloseStyle() {
    ImGui.PushStyleColor(21, 60, 25, 25, 255);
    ImGui.PushStyleColor(22, 85, 30, 30, 255);
    ImGui.PushStyleColor(23, 45, 18, 18, 255);
}

function popCloseStyle() {
    ImGui.PopStyleColor(3);
}

function getQty(itemId) {
    if (!_qty[itemId]) _qty[itemId] = 1;
    return _qty[itemId];
}

function renderWeaponList() {
    var list = [];
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        if (WEAPON_DATA[i].itemId === "pistol_assembled") continue; // duplicado de 9mm (craft)
        if (!getDealerPrice(WEAPON_DATA[i].itemId)) continue;
        list.push(WEAPON_DATA[i]);
    }

    // 4 columnas: nombre | precio | qty | agregar
    ImGui.Columns(4);

    for (var j = 0; j < list.length; j++) {
        var w = list[j];
        ImGui.Text(w.name);
        ImGui.NextColumn();

        ImGui.Text("$" + getDealerPrice(w.itemId));
        ImGui.NextColumn();

        var q = getQty(w.itemId);
        if (ImGui.Button("<##" + w.itemId, 22, _btnHeight)) {
            if (q > 1) _qty[w.itemId] = q - 1;
        }
        ImGui.SameLine();
        ImGui.Text("" + q);
        ImGui.SameLine();
        if (ImGui.Button(">##" + w.itemId, 22, _btnHeight)) {
            if (q < 10) _qty[w.itemId] = q + 1;
        }
        ImGui.NextColumn();

        pushBuyStyle();
        if (ImGui.Button(t("BTN_ADD") + "##" + w.itemId, 80, _btnHeight)) {
            addToCart(w.itemId, getQty(w.itemId));
            _qty[w.itemId] = 1;
        }
        popBuyStyle();
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

export function renderDealerMenu() {
    ImGui.BeginFrame("GSIS_DEALER");

    if (!isDealerMenuVisible()) {
        ImGui.EndFrame();
        return;
    }

    pushDealerStyle();
    ImGui.SetNextWindowSize(_menuWidth, _menuHeight, 2);
    ImGui.SetNextWindowPos(50.0, 60.0, 2);
    var open = ImGui.Begin(dealerMenuTitle(), true, false, false, false, false);

    // Header: dinero de CJ + total carrito
    ImGui.Text(t("MONEY", { n: getCJMoney() }));
    ImGui.SameLine();
    ImGui.TextDisabled("|  " + t("DLR_TOT", { n: getCartTotal() }));
    ImGui.Spacing();

    // Acciones bajo el total
    var half = (_menuWidth - 30) / 2;
    pushResetStyle();
    var clickedReset = ImGui.Button(t("BTN_RST"), half, 32);
    popResetStyle();
    ImGui.SameLine();
    pushCheckoutStyle();
    var clickedCheckout = ImGui.Button(t("BTN_BUY"), half, 32);
    popCheckoutStyle();

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    // Catalogo con qty + Agregar
    renderWeaponList();

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    // Resumen carrito
    renderCartSummary();
    ImGui.Spacing();

    pushCloseStyle();
    var clickedClose = ImGui.Button(t("BTN_CLS"), _menuWidth - 20, 30);
    popCloseStyle();

    ImGui.End();
    popDealerStyle();
    ImGui.EndFrame();

    if (clickedReset) {
        resetCart();
    }
    if (clickedCheckout) {
        if (checkout()) {
            closeDealerMenu();
        }
    }
    if (clickedClose || !open) {
        closeDealerMenu();
    }
}

register({
    name: "DealerMenu",
    init: initDealerMenu,
    update: renderDealerMenu
});
