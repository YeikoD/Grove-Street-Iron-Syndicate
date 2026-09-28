// GSIS - DealerPickup
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS DealerPickup - Punto de retiro de pedidos del dealer
// ============================================================================
// Esferas: data/gsis_spot_data → pickup (independiente de actores). Existen solo
//   mientras haya pedido en SaveManager "DealerOrders" Y la esfera no este apagada
//   por la cooldown de un cierre reciente
// Blip: existe solo mientras haya pedido (no depende de la cooldown, ver _syncBlips)
// ESPACIO abre y cierra el menu del retiro, parado dentro de la esfera
// Las acciones de la pagina (recoger / recoger todo) viven mas abajo, en este
// archivo y no en la pagina: el peso libre lo sabe el juego, no el snapshot.
// Depende de: Config, ModuleRegistry, SaveManager, SpotRuntime, Items,
//             item_data, L10n, Notice
// ============================================================================

import { MISC } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerMenuSource } from "../core/gsis_Input.js";
import { getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { t } from "../core/gsis_L10n.js";
import { setNotice } from "../core/gsis_Notice.js";
import { getItemName, getItemWeight } from "../data/gsis_item_data.js";
import { getSpots } from "../data/gsis_spot_data.js";
import { addItem, getTotalWeight, entregaOpts } from "./gsis_Items.js";
import {
    createSpotGate, updateSpotSpheres, closeSpotFlow, spotCanOpen,
    spotHas, beginSpotCooldown
} from "../core/gsis_SpotRuntime.js";

var _blips = [];   // 1 blip por spot pickup
var _showPickupMenu = false;
// Lo que este modulo publico en su ultimo update. Ver el update: es lo que hace
// visible el cierre cuando lo hizo otro (la tecla, el Escape, la pagina).
var _sawOpen = false;
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

// Abrir el menu, si se puede. La llave la pide el bridge (modules/gsis_WebInterface.js)
// cuando el jugador aprieta ESPACIO.
//
// El retiro no necesita pedirle nada al pedido: spotCanOpen ya mira la esfera, y la
// esfera del retiro no existe sin pedido (updateSpotSpheres con want = hay pedido).
// O sea que un pedido vacio no abre ni con la tecla: no hay nada que recoger.
export function openPickupMenu() {
    if (_showPickupMenu) return false;
    var c = null;
    try { c = new Player(0).getChar(); } catch (e) { return false; }
    if (!spotCanOpen("pickup", c)) return false;
    _showPickupMenu = true;
    return true;
}

// Pedido pendiente (items, total) o null
export function getOrder() {
    var order = getModuleData("DealerOrders");
    if (!order || !order.items || order.items.length === 0) return null;
    return order;
}

// Vacia el pedido. El resto (esferas, blips, menu) lo resuelve el update de abajo
// en el proximo frame: el pedido vacio es la causa, y el update es el unico que
// mira la causa. Tocar las esferas desde aca seria tener dos caminos para la misma
// decision, y ahi es donde se desincronizan.
export function clearOrder() {
    setModuleData("DealerOrders", { items: [], total: 0, purchasedAt: 0 });
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
    //
    // entregaOpts: el arma comprada llega SIN cargador (hasMag:false, 0 balas).
    // No es una cortesia del dealer, es la regla del mod —misma funcion que usa
    // el preview del pedido, para que el panel y la entrega digan lo mismo.
    var opts = entregaOpts(itemId);
    for (var u = 0; u < qty; u++) {
        if (!addItem(itemId, 1, opts)) {
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
    // entregaOpts por linea, igual que collectItem: cada id decide su estado.
    for (var j = 0; j < order.items.length; j++) {
        var id = order.items[j].id;
        var qty = order.items[j].qty;
        var optsLinea = entregaOpts(id);
        for (var u = 0; u < qty; u++) {
            if (!addItem(id, 1, optsLinea)) {
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

// Los blips siguen al PEDIDO y no a la esfera.
//
// Es la unica diferencia con los otros tres modulos, y es a proposito: el blip es
// la flecha del radar que dice "hay algo para recoger", y sigue siendo verdad
// mientras haya pedido. Si el blip dependiera de la esfera, cada vez que el
// jugador cerrara el menu del retiro la flecha desapareceria del mapa un rato
// (TIMERS.SPHERE_COOLDOWN), sin que el pedido haya cambiado. La esfera es la
// puerta del menu; el blip es un aviso, y un aviso no se apaga porque el jugador
// ya estuvo ahi.
//
// O sea: pending && sin blips → crear, sin pedido && con blips → destruir. Nunca
// al reves, y nunca por cooldown.
function _syncBlips(pending) {
    if (pending && _blips.length === 0) {
        _createBlips();
    } else if (!pending && _blips.length > 0) {
        _destroyBlips();
    }
}

// ============================================================================
// REGISTRO (auto al importarse)
// ============================================================================

function initDealerPickup() {
    log("[GSIS] DealerPickup: spots=" + getSpots("pickup").length +
        " (menu con esfera: ESPACIO abre y cierra)");
    registerMenuSource("pickup", function () { return _showPickupMenu; });
}

function updateDealerPickupModule(now) {
    // El pedido manda: sin pedido no hay punto de retiro. Va antes que la esfera y
    // que el menu, y es lo que les pasa a los dos.
    var pending = !!getOrder();
    _syncBlips(pending);
    updateSpotSpheres("pickup", _gate, pending);

    try {
        var c = new Player(0).getChar();
        _showPickupMenu = closeSpotFlow(c, "pickup", _showPickupMenu, spotHas("pickup"));
        // El menu se cerro → la esfera se apaga un rato.
        //
        // Dos condiciones, y las dos importan:
        //
        //   - La transicion se mide contra lo que publico este modulo en su ultimo
        //     update (_sawOpen), no contra el flag. El cierre puede venir de afuera
        //     —ESPACIO, ESC, "ui:close"—, y en ese caso el flag ya esta en false
        //     cuando este update corre. Con el flag, cerrar con la tecla no
        //     apagaria la esfera.
        //   - Solo si el pedido sigue. Si se vacio, la esfera ya se apago por no
        //     hacer falta y volver a pedir la cooldown dejaria el punto de retiro
        //     sin esfera hasta que se venciera, con el pedido ya pagado.
        if (_sawOpen && !_showPickupMenu && pending) {
            beginSpotCooldown("pickup");
        }
        _sawOpen = _showPickupMenu;
    } catch (e) { }
}

register({
    name: "DealerPickup",
    init: initDealerPickup,
    update: updateDealerPickupModule
});
