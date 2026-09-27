// GSIS - WeaponDealer
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS WeaponDealer - Dealer mayorista de armas (carrito + checkout)
// ============================================================================
// Punto de venta: N esferas (data/gsis_spot_data → dealer) + tecla F abre menu carrito
// Carrito POR characterId (spot.characterId → CHARACTERS): cada dealer tiene
// su carrito y sus precios (ch.dealer: markup / prices — opcional).
// Pedido: SaveManager "DealerOrders" (persiste guardado) hasta recoger
// Dinero: nativo de CJ (Player.storeScore / addScore), NO cleanMoney del save
// Depende de: Config, ModuleRegistry, SaveManager, EventBus, weapon_data,
//             character_data, SpotRuntime
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { registerMenuSource } from "../core/gsis_Input.js";
import { registerModule, getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { emit } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";
import { getWeaponPrice } from "../data/gsis_weapon_data.js";
import { getCharacter } from "../data/gsis_character_data.js";
import {
    createSpotGate, updateSpotGate, createSpotSpheres, updateSpotFKeySpot
} from "../core/gsis_SpotRuntime.js";

var DEFAULT_CHAR = "dealer_local";

var _spheres = []; // 1 sphere handle por spot dealer
var _showDealerMenu = false;
var _carts = {}; // { characterId: { itemId: qty } } — memoria, no persiste
var _activeCharId = null; // personaje de la esfera que abrió el menú
var _gate = createSpotGate(); // espera a exterior

// ============================================================================
// API para UI
// ============================================================================

export function isDealerMenuVisible() {
    return _showDealerMenu;
}

export function closeDealerMenu() {
    _showDealerMenu = false;
}

// characterId activo (esfera que abrió el menú) o default
export function getActiveCharacterId() {
    return _activeCharId || DEFAULT_CHAR;
}

function _cartRef(charId) {
    var id = charId || getActiveCharacterId();
    if (!_carts[id]) _carts[id] = {};
    return _carts[id];
}

// Precio para el personaje activo (o el de characterId si se pasa)
// ch.dealer.items → 0 si el itemId no esta a la venta (catalogo acotado)
// ch.dealer.prices[itemId] → fijo | ch.dealer.markup → base * markup | base
export function getDealerPrice(itemId, characterId) {
    var base = getWeaponPrice(itemId);
    if (!base) return 0;
    var cid = (characterId !== undefined && characterId !== null)
        ? characterId : getActiveCharacterId();
    var ch = getCharacter(cid);
    if (!ch || !ch.dealer) return base;
    var d = ch.dealer;
    if (d.items && d.items.indexOf(itemId) === -1) return 0;
    if (d.prices && d.prices.hasOwnProperty(itemId)) return d.prices[itemId];
    if (typeof d.markup === "number" && d.markup > 0) {
        return Math.round(base * d.markup);
    }
    return base;
}

// Copia del carrito del personaje activo
export function getCart() {
    var cart = _cartRef();
    var copy = {};
    for (var k in cart) {
        if (cart.hasOwnProperty(k)) copy[k] = cart[k];
    }
    return copy;
}

// Total a pagar del carrito activo (precios del personaje activo)
export function getCartTotal() {
    var cart = _cartRef();
    var total = 0;
    for (var k in cart) {
        if (cart.hasOwnProperty(k)) total += getDealerPrice(k) * cart[k];
    }
    return total;
}

// Suma qty al carrito activo (qty default 1)
export function addToCart(itemId, qty) {
    if (!getDealerPrice(itemId)) return false;
    qty = qty || 1;
    if (qty < 1) return false;
    var cart = _cartRef();
    cart[itemId] = (cart[itemId] || 0) + qty;
    return true;
}

// Limpia carrito del personaje activo
export function resetCart() {
    var id = getActiveCharacterId();
    _carts[id] = {};
}

// Dinero actual de CJ (HUD nativo GTA SA)
export function getCJMoney() {
    try {
        return new Player(0).storeScore();
    } catch (e) {
        return 0;
    }
}

// Checkout: valida dinero de CJ, cobra, guarda/mergea pedido, limpia carrito activo
export function checkout() {
    var total = getCartTotal();
    if (total <= 0) {
        showTextBox(t("CRT_EMP"));
        return false;
    }

    var p = new Player(0);
    var money = p.storeScore();
    if (money < total) {
        showTextBox(t("MON_LOW", { n: total - money }));
        return false;
    }
    p.addScore(-total); // 0109: negativo resta dinero de CJ

    var order = getModuleData("DealerOrders") || { items: [], total: 0, purchasedAt: 0 };
    if (!order.items) order.items = [];
    var cart = _cartRef();
    for (var k in cart) {
        if (!cart.hasOwnProperty(k)) continue;
        var qty = cart[k];
        var merged = false;
        for (var i = 0; i < order.items.length; i++) {
            if (order.items[i].id === k) {
                order.items[i].qty += qty;
                merged = true;
                break;
            }
        }
        if (!merged) order.items.push({ id: k, qty: qty });
    }
    order.total = (order.total || 0) + total;
    order.purchasedAt = Date.now();
    setModuleData("DealerOrders", order);

    var activeId = getActiveCharacterId();
    _carts[activeId] = {};
    emit("dealer:orderReady", {});
    showTextBox(t("ORD_OK", { n: total }));
    log("[WeaponDealer] Checkout OK (" + activeId + "): $" + total +
        " (CJ money: " + p.storeScore() + ")");
    return true;
}

// ============================================================================
// REGISTRO (auto al importarse)
// ============================================================================

function initWeaponDealer() {
    registerModule("DealerOrders", { items: [], total: 0, purchasedAt: 0 });
    log("[GSIS] WeaponDealer: esferas pendientes (esperar exterior)");
    registerMenuSource("dealer", function () { return _showDealerMenu; });
}

function updateWeaponDealerModule(now) {
    if (_gate.pending && updateSpotGate(_gate)) {
        _spheres = createSpotSpheres("dealer");
        log("[WeaponDealer] " + _spheres.length + " esferas de venta");
    }
    try {
        var c = new Player(0).getChar();
        var r = updateSpotFKeySpot(c, "dealer", _showDealerMenu, _spheres.length > 0);
        if (r.visible && !_showDealerMenu) {
            // Abre: fijar personaje de la esfera (carrito/precios propios)
            _activeCharId = (r.spot && r.spot.characterId) || DEFAULT_CHAR;
        }
        _showDealerMenu = r.visible;
        if (!_showDealerMenu) _activeCharId = null;
    } catch (e) { }
}

register({
    name: "WeaponDealer",
    init: initWeaponDealer,
    update: updateWeaponDealerModule
});
