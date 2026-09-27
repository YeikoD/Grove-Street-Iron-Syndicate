// GSIS - DealerPickup
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS DealerPickup - Punto de retiro de pedidos del dealer
// ============================================================================
// N esferas + blip SOLO existen mientras haya pedido en SaveManager "DealerOrders"
// Esferas: data/gsis_spot_data → pickup (independiente de actores)
// Tecla F abre menu retiro
// Las acciones de la pagina (recoger / recoger todo) viven mas abajo, en este
// archivo y no en la pagina: el peso libre lo sabe el juego, no el snapshot.
// Depende de: Config, ModuleRegistry, SaveManager, EventBus, SpotRuntime, Items,
//             item_data, L10n, Notice
// ============================================================================

import { MISC } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerMenuSource } from "../core/gsis_Input.js";
import { getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { on } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";
import { setNotice } from "../core/gsis_Notice.js";
import { getItemName, getItemWeight } from "../data/gsis_item_data.js";
import { getSpots } from "../data/gsis_spot_data.js";
import { addItem, getTotalWeight } from "./gsis_Items.js";
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
// Acciones de la pagina web (gsis_WebInterface las despacha)
// ============================================================================
//
// Estas dos son las que ejecuta el boton "Recoger" y el "Recoger todo". No son
// un alias de removeFromOrder: la de una unidad tiene que agregar al inventario
// y la de todo tiene que PROBAR QUE ENTRE ANTES de tocar el pedido.
//
// El orden importa y es la regla que se perdio con ui/gsis_DealerPickupMenu.js:
// "recoger todo" valida el peso total contra el espacio libre UNA vez y recien ahi
// saca algo del pedido. Al reves —ir sacando linea por linea hasta que no entra
// mas— el pedido queda mutilado y el jugador tiene que cobrar el resto en tres
// viajes, sin haber pedido nada raro.
//
// Por que el modulo y no la pagina: el peso libre y la capacidad son del juego.
// Si la pagina los pidiera por comando, un snapshot desactualizado daria un
// "no cabe" equivocado. Aca se lee el estado real.

// Recoger qty de una linea del pedido. Devuelve true si se accoloco todo.
export function collectItem(itemId, qty) {
    qty = Math.max(1, parseInt(qty, 10) || 1);

    var order = getOrder();
    if (!order) {
        setNotice(t("PKC_NOC", { free: _freeWeight(), order: 0 }));
        return false;
    }

    var line = null;
    for (var i = 0; i < order.items.length; i++) {
        if (order.items[i].id === itemId) {
            line = order.items[i];
            break;
        }
    }
    if (!line || line.qty < qty) {
        setNotice(t("PKC_IVL"));
        return false;
    }

    // El peso se mira del id del pedido, no de lo que hay en el inventario: el
    // itemTodavia no esta adentro.
    var need = getItemWeight(itemId) * qty;
    var free = _freeWeight();
    if (need > free) {
        setNotice(t("PKC_NOC", { free: _round(free), order: _round(need) }));
        return false;
    }

    // Primero entra el item, recien despues sale del pedido. Al reves, un fallo
    // de addItem deja la linea cobrada y el arma perdida, que es el peor de los
    // dos mundos.
    for (var u = 0; u < qty; u++) {
        if (!addItem(itemId, 1)) {
            setNotice(t("PKC_ERR", { name: getItemName(itemId) }));
            return false;
        }
    }
    if (!removeFromOrder(itemId, qty)) {
        setNotice(t("PKC_ERR", { name: getItemName(itemId) }));
        return false;
    }

    setNotice(t("PKC_TAK", { qty: qty, name: getItemName(itemId) }));
    return true;
}

// Recoger el pedido entero, o nada. El mensaje de "no cabe" lleva los dos
// numeros para que el jugador sepa cuanto le falta y por que.
export function collectAll() {
    var order = getOrder();
    if (!order) {
        setNotice(t("PKC_NOC", { free: _freeWeight(), order: 0 }));
        return false;
    }

    var need = 0;
    for (var i = 0; i < order.items.length; i++) {
        need += getItemWeight(order.items[i].id) * order.items[i].qty;
    }
    var free = _freeWeight();
    if (need > free) {
        setNotice(t("PKC_NOC", { free: _round(free), order: _round(need) }));
        return false;
    }

    // Linea por linea, con su propio removeFromOrder: el pedido se va vaciando
    // en el mismo orden en que se leyo, y un addItem que falle a la mitad deja el
    // pedido en el estado real de lo que si entro, no en uno inventado.
    for (var j = 0; j < order.items.length; j++) {
        var id = order.items[j].id;
        var qty = order.items[j].qty;
        for (var u = 0; u < qty; u++) {
            if (!addItem(id, 1)) {
                setNotice(t("PKC_ERR", { name: getItemName(id) }));
                return false;
            }
        }
        removeFromOrder(id, qty);
    }

    setNotice(t("PKC_ALL"));
    return true;
}

// Cuanto peso entra todavia en el inventario. El tope es el mismo que usa
// addItem, leido del Config y no escrito aca.
function _freeWeight() {
    return MISC.MAX_INVENTORY_WEIGHT - getTotalWeight();
}

function _round(kg) {
    return Math.round(kg * 10) / 10;
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
    registerMenuSource("pickup", function () { return _showPickupMenu; });
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
