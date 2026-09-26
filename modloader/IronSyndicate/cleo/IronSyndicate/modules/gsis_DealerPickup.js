// GSIS - DealerPickup
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS DealerPickup - Punto de retiro de pedidos del dealer
// ============================================================================
// N esferas + blip SOLO existen mientras haya pedido en SaveManager "DealerOrders"
// Esferas: data/gsis_spot_data → pickup (independiente de actores)
// Tecla F abre menu retiro (ui/gsis_DealerPickupMenu.js)
// La UI orquesta addItem/clearOrder (modulos no importan entre si)
// Depende de: Config, ModuleRegistry, SaveManager, EventBus, SpotRuntime
// ============================================================================

import { MISC } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { on } from "../core/gsis_EventBus.js";
import { getSpots } from "../data/gsis_spot_data.js";
import {
    createSpotGate, updateSpotGate, createSpotSpheres,
    destroySpotSpheres, updateSpotFKey
} from "../core/gsis_SpotRuntime.js";

var _spheres = []; // 1 sphere handle por spot pickup
var _blips = [];   // 1 blip por spot pickup
var _showPickupMenu = false;
var _gate = createSpotGate(); // espera a exterior

// ============================================================================
// API para UI
// ============================================================================

export function isPickupMenuVisible() {
    return _showPickupMenu;
}

export function closePickupMenu() {
    _showPickupMenu = false;
}

// Pedido pendiente (items, total) o null
export function getOrder() {
    var order = getModuleData("DealerOrders");
    if (!order || !order.items || order.items.length === 0) return null;
    return order;
}

// Vacia el pedido y destruye esferas. Devuelve true si habia pedido.
export function clearOrder() {
    setModuleData("DealerOrders", { items: [], total: 0, purchasedAt: 0 });
    _destroySpheres();
    _showPickupMenu = false;
    return true;
}

// Quita qty de un item del pedido (retiro parcial).
// Si el pedido queda vacio → destruye esfera y cierra menu.
// Devuelve false si el item/qty no coincide (no toca nada).
export function removeFromOrder(itemId, qty) {
    qty = qty || 1;
    if (qty < 1 || !itemId) return false;

    var order = getModuleData("DealerOrders");
    if (!order || !order.items || order.items.length === 0) return false;

    var idx = -1;
    for (var i = 0; i < order.items.length; i++) {
        if (order.items[i].id === itemId) {
            idx = i;
            break;
        }
    }
    if (idx < 0) return false;
    if (order.items[idx].qty < qty) return false; // no hay tantos en el pedido

    order.items[idx].qty -= qty;
    if (order.items[idx].qty <= 0) {
        order.items.splice(idx, 1);
    }

    if (order.items.length === 0) {
        clearOrder();
        log("[DealerPickup] Pedido vacio tras retiro parcial");
        return true;
    }

    setModuleData("DealerOrders", order);
    return true;
}

// ============================================================================
// INTERNAS
// ============================================================================

function _createBlips() {
    var spots = getSpots("pickup");
    for (var i = 0; i < spots.length; i++) {
        try {
            _blips.push(Blip.AddSpriteForCoord(
                spots[i].x, spots[i].y, spots[i].z, MISC.PICKUP_DEALER_BLIP));
            log("[DealerPickup] Blip de retiro creado en " + spots[i].id);
        } catch (e) {
            log("[DealerPickup] Error blip: " + e.message);
        }
    }
}

function _destroyBlips() {
    for (var i = 0; i < _blips.length; i++) {
        try { _blips[i].remove(); } catch (e) { }
    }
    _blips = [];
}

function _destroySpheres() {
    _destroyBlips();
    destroySpotSpheres(_spheres);
}

function _syncSphere() {
    if (_gate.pending) return; // gate interior activo

    var order = getModuleData("DealerOrders");
    var pending = !!(order && order.items && order.items.length > 0);
    if (pending && _spheres.length === 0) {
        _spheres = createSpotSpheres("pickup");
        _createBlips();
        log("[DealerPickup] " + _spheres.length + " esferas de retiro creadas");
    } else if (!pending && _spheres.length > 0) {
        _destroySpheres();
        log("[DealerPickup] Esferas de retiro destruidas (pedido vacio)");
    }
}

// ============================================================================
// REGISTRO (auto al importarse)
// ============================================================================

function initDealerPickup() {
    // Checkout del dealer (otro modulo) notifica pedido nuevo
    on("dealer:orderReady", function () {
        _syncSphere();
    });
    log("[GSIS] DealerPickup: spots=" + getSpots("pickup").length +
        " (esperar exterior si hay pedido)");
}

function updateDealerPickupModule(now) {
    if (_gate.pending && updateSpotGate(_gate)) {
        log("[DealerPickup] Exterior — listo para esferas de retiro");
    }
    try {
        var c = new Player(0).getChar();
        if (!_gate.pending) _syncSphere();
        _showPickupMenu = updateSpotFKey(
            c, "pickup", _showPickupMenu, _spheres.length > 0);
    } catch (e) { }
}

register({
    name: "DealerPickup",
    init: initDealerPickup,
    update: updateDealerPickupModule
});
