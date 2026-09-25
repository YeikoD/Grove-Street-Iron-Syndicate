// ============================================================================
// GSIS DealerMenu - Menu del Dealer (Estilo KCD Master-Detail)
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { registerWindow } from "./gsis_UIManager.js";
import {
    SIZES, COND, COLORS,
    pushMenuStyle, popMenuStyle,
    uiButton, uiSelectableRow, uiStatRow, uiSectionHeader, textColored
} from "./gsis_UIStyle.js";
import { t } from "../core/gsis_L10n.js";
import { query } from "../core/gsis_EventBus.js";
import {
    isDealerMenuVisible, closeDealerMenu,
    getCart, getCartTotal, addToCart, resetCart, checkout, getCJMoney,
    getDealerPrice, getActiveCharacterId
} from "../modules/gsis_WeaponDealer.js";
import { WEAPON_DATA, getWeaponByItemId } from "../data/gsis_weapon_data.js";
import { getItemName } from "../data/gsis_item_data.js";

var _selectedItemId = null;
var _qty = 1;
var _clickedReset = false;
var _clickedCheckout = false;
var _frameOpen = true;

function dealerMenuTitle() {
    var n = query("characters:name", { characterId: getActiveCharacterId() });
    if (n && n.name) return n.name + " - CATÁLOGO DE ARMAS";
    return t("DLR_TTL");
}

function getCatalogList() {
    var list = [];
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        var w = WEAPON_DATA[i];
        if (w.itemId === "pistol_assembled") continue;
        var p = getDealerPrice(w.itemId);
        if (!p) continue;
        list.push({
            itemId: w.itemId,
            name: w.name,
            price: p,
            damage: w.damage || "-",
            category: w.slot ? "Arma de Slot " + w.slot : "Arma de Fuego"
        });
    }
    return list;
}

function renderMasterList(catalog) {
    ImGui.BeginChild("dealer_catalog_master", SIZES.leftColW, 425.0, true);

    uiSectionHeader("CATÁLOGO DISPONIBLE");

    ImGui.Columns(3);
    ImGui.SetColumnWidth(0, 240.0);
    ImGui.SetColumnWidth(1, 70.0);
    ImGui.SetColumnWidth(2, 130.0);

    textColored("PRODUCTO", COLORS.textGold);
    ImGui.NextColumn();
    textColored("DAÑO", COLORS.textGold);
    ImGui.NextColumn();
    textColored("PRECIO UNITARIO", COLORS.textGold);
    ImGui.NextColumn();
    ImGui.Separator();

    for (var i = 0; i < catalog.length; i++) {
        var item = catalog[i];
        var isSelected = _selectedItemId === item.itemId;

        if (uiSelectableRow(item.name + "##sel_" + item.itemId, isSelected, 24.0)) {
            _selectedItemId = item.itemId;
            _qty = 1;
        }

        ImGui.NextColumn();
        ImGui.Text("" + item.damage);
        ImGui.NextColumn();
        textColored("$" + item.price, COLORS.textGreen);
        ImGui.NextColumn();
    }

    ImGui.Columns(1);
    ImGui.EndChild();
}

function renderInspector(selectedWeapon) {
    ImGui.BeginChild("dealer_inspector_detail", SIZES.rightColW, 425.0, true);

    uiSectionHeader("INSPECTOR Y CARRITO");

    if (!selectedWeapon) {
        ImGui.Spacing();
        ImGui.TextDisabled("Selecciona un arma del catálogo.");
    } else {
        textColored(selectedWeapon.name, COLORS.textGold);
        ImGui.TextDisabled(selectedWeapon.category);
        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        uiStatRow("Precio Unitario: ", "$" + selectedWeapon.price, COLORS.textGreen);
        uiStatRow("Daño Base: ", selectedWeapon.damage, COLORS.text);

        ImGui.Spacing();
        textColored("CANTIDAD A PEDIR:", COLORS.textMuted);
        if (ImGui.Button("<##dec_qty", 24, SIZES.btnSm)) {
            if (_qty > 1) _qty--;
        }
        ImGui.SameLine();
        ImGui.Text("  " + _qty + "  ");
        ImGui.SameLine();
        if (ImGui.Button(">##inc_qty", 24, SIZES.btnSm)) {
            if (_qty < 10) _qty++;
        }

        ImGui.Spacing();
        if (uiButton("+ AÑADIR AL CARRITO##add", 0.0, SIZES.btnLg, COLORS.accent)) {
            addToCart(selectedWeapon.itemId, _qty);
            _qty = 1;
        }
    }

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    // Carrito de compras actual
    textColored("CARRITO ACTUAL:", COLORS.textGold);
    var cart = getCart();
    var keys = [];
    for (var k in cart) {
        if (cart.hasOwnProperty(k)) keys.push(k);
    }

    ImGui.BeginChild("dealer_cart_items", 0.0, 75.0, true);
    if (keys.length === 0) {
        ImGui.TextDisabled(t("CRT_UI"));
    } else {
        for (var j = 0; j < keys.length; j++) {
            var cKey = keys[j];
            ImGui.Text("• " + getItemName(cKey) + " x" + cart[cKey]);
        }
    }
    ImGui.EndChild();

    ImGui.Spacing();

    if (uiButton("COMPRAR PEDIDO ($" + getCartTotal().toLocaleString() + ")##buy", 0.0, SIZES.btnLg, COLORS.accent)) {
        _clickedCheckout = true;
    }
    ImGui.Spacing();
    if (uiButton("VACIAR CARRITO##rst", 0.0, SIZES.btnMd, COLORS.danger)) {
        _clickedReset = true;
    }

    ImGui.EndChild();
}

function renderDealerWindow() {
    _clickedReset = false;
    _clickedCheckout = false;
    _frameOpen = true;

    var catalog = getCatalogList();
    if (catalog.length > 0 && !_selectedItemId) {
        _selectedItemId = catalog[0].itemId;
    }

    var selectedWeapon = null;
    for (var i = 0; i < catalog.length; i++) {
        if (catalog[i].itemId === _selectedItemId) {
            selectedWeapon = catalog[i];
            break;
        }
    }

    pushMenuStyle();
    ImGui.SetNextWindowSize(SIZES.dealerW, SIZES.mainH, 1);
    ImGui.SetNextWindowPos(180.0, 100.0, 2);
    var open = ImGui.Begin(dealerMenuTitle(), true, false, false, false, false);
    ImGui.SetWindowSize(SIZES.dealerW, SIZES.mainH, 0);

    uiStatRow("DINERO CJ: ", "$" + getCJMoney().toLocaleString(), COLORS.textGreen);
    ImGui.SameLine(400.0);
    uiStatRow("TOTAL CARRITO: ", "$" + getCartTotal().toLocaleString(), COLORS.textGold);

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    renderMasterList(catalog);
    ImGui.SameLine();
    renderInspector(selectedWeapon);

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
    log("[GSIS] DealerMenu inicializado con patrón Master-Detail KCD");
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
