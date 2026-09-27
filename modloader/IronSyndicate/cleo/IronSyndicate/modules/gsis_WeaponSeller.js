// GSIS - WeaponSeller
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS WeaponSeller - Punto de venta (trueque con NPC)
// ============================================================================
// N esferas (data/gsis_spot_data → seller) + tecla F abre menu trueque
// Estado POR characterId (spot.characterId → CHARACTERS): cada NPC tiene
// intereses/budget/techo propios (ch.seller en character_data, opcional).
// Techo = sellPrice + rand del rango del personaje (o default 50-450 / 0-150)
// Regenera solo al cumplir interes (budget bajo o N ventas del interes)
// La oferta la orquesta doOffer() mas abajo, en este archivo: offerWeapon()
// sola evalua, y el que saca el item, paga y hace hablar al NPC es el modulo.
// Depende de: ModuleRegistry, Input, weapon_data, character_data, SpotRuntime,
//             Items, L10n, Notice
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { registerMenuSource } from "../core/gsis_Input.js";
import { t } from "../core/gsis_L10n.js";
import { setNotice } from "../core/gsis_Notice.js";
import { emit } from "../core/gsis_EventBus.js";
import { getSellPrice, WEAPON_DATA } from "../data/gsis_weapon_data.js";
import { getCharacter } from "../data/gsis_character_data.js";
import { getItems, removeItem, isInstanced } from "./gsis_Items.js";
import {
    createSpotGate, updateSpotGate, createSpotSpheres, updateSpotFKeySpot
} from "../core/gsis_SpotRuntime.js";

var DEFAULT_CHAR = "seller_local";

var _spheres = []; // 1 sphere handle por spot seller
var _showSellMenu = false;
var _gate = createSpotGate(); // espera a exterior
var _activeCharId = null;     // personaje de la esfera que abrió el menú

// Estado POR characterId (memoria, no SaveManager)
var _states = {}; // { characterId: { interests, budget, ... } }

function _defaultState() {
    return {
        generated: false,
        interests: [],
        budget: 0,
        salesCompleted: 0,
        salesTarget: 0,
        fulfilled: false,
        minSellInterest: 0,
        techoInterest: [50, 450],
        techoBase: [0, 150],
        // Si el comprador ya escucho UNA oferta. El presupuesto se esconde hasta
        // que pasa: ver getSellState().
        offered: false
    };
}

function _state(charId) {
    var id = charId || DEFAULT_CHAR;
    if (!_states[id]) _states[id] = _defaultState();
    return _states[id];
}

function _activeState() {
    return _state(_activeCharId);
}

// ============================================================================
// API para UI
// ============================================================================

export function isSellMenuVisible() {
    return _showSellMenu;
}

export function closeSellMenu() {
    _showSellMenu = false;
}

// characterId activo (esfera que abrió el menú) o default
export function getActiveCharacterId() {
    return _activeCharId || DEFAULT_CHAR;
}

// El estado que ve la pagina. El presupuesto viene null hasta que el jugador
// hizo su primera oferta: no es un detalle de la pagina, es la regla del juego
// (el NPC no muestra la plata antes de que le digas cuanto queres), asi que el
// gate va aca y no en la pagina. Si el gate fuera de la pagina, el dato viaja en
// el snapshot y cualquiera que lea el log del bridge lo ve igual.
export function getSellState() {
    var st = _activeState();
    return {
        interests: st.interests.slice(),
        budget: st.offered ? st.budget : null,
        offered: st.offered,
        fulfilled: st.fulfilled
    };
}

// Evaluacion de oferta sobre el NPC activo.
// Devuelve { ok, total, interest, msgKey, msgParams } — UI orquesta removeItem/addScore
// y muestra msgKey via characters:say (subtitulos 00BB con nombre).
export function offerWeapon(itemId, qty, unitPrice) {
    qty = qty || 1;
    if (qty < 1 || !itemId || unitPrice < 0) {
        return { ok: false, total: 0, interest: false, msgKey: "SEL_IVL", msgParams: null };
    }

    var sellPrice = getSellPrice(itemId);
    if (!sellPrice) {
        return { ok: false, total: 0, interest: false, msgKey: "SEL_NOB", msgParams: null };
    }

    var st = _activeState();

    // Categoria del arma (primer match en WEAPON_DATA)
    var cat = "";
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        if (WEAPON_DATA[i].itemId === itemId) {
            cat = WEAPON_DATA[i].category;
            break;
        }
    }
    var isInterest = st.interests.indexOf(cat) !== -1;

    // Techo aleatorio por oferta (rango del personaje)
    var techo;
    if (isInterest) {
        techo = sellPrice + st.techoInterest[0] +
            Math.floor(Math.random() * (st.techoInterest[1] - st.techoInterest[0] + 1));
    } else {
        techo = sellPrice + st.techoBase[0] +
            Math.floor(Math.random() * (st.techoBase[1] - st.techoBase[0] + 1));
    }

    // Rechazo automatico: oferta > techo
    if (unitPrice > techo) {
        return {
            ok: false, total: 0, interest: isInterest,
            msgKey: "SEL_R1", msgParams: null
        };
    }

    var total = unitPrice * qty;

    // Presupuesto
    if (total > st.budget) {
        return {
            ok: false, total: 0, interest: isInterest,
            msgKey: "SEL_R2", msgParams: null
        };
    }

    // Zona de negociacion
    if (unitPrice <= techo * 0.85) {
        // acepta seguro
    } else {
        // 50% entre 85% y 100% del techo
        if (Math.random() >= 0.5) {
            return {
                ok: false, total: 0, interest: isInterest,
                msgKey: "SEL_R3", msgParams: null
            };
        }
        // acepta con flavor de "un poco caro"
        st.budget -= total;
        if (isInterest) {
            st.salesCompleted++;
            _checkFulfilled(st);
        }
        return {
            ok: true, total: total, interest: isInterest,
            msgKey: "SEL_A2", msgParams: { n: total }
        };
    }

    // Acepta seguro
    st.budget -= total;
    if (isInterest) {
        st.salesCompleted++;
        _checkFulfilled(st);
    }
    return {
        ok: true, total: total, interest: isInterest,
        msgKey: "SEL_A1", msgParams: { n: total }
    };
}

// La oferta del jugador. Es la orquestacion que vivia en el ui/gsis_SellMenu.js:
// offerWeapon() solo EVALUA (y descuenta del presupuesto del NPC si acepta), asi
// que el que mete el item en la mochila, le paga al jugador y le hace hablar al
// NPC es este.
//
// El orden es el que importa: primero que el jugador tenga la cantidad, despues
// la evaluacion, y solo si acepto se saca el item y se paga. Al reves, un NPC que
// acepta un item que el jugador no tiene deja plata regalada.
export function doOffer(itemId, qty, unitPrice) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    unitPrice = Math.max(0, Math.round(Number(unitPrice) || 0));

    var owned = _ownedQty(itemId);
    if (owned < qty) {
        setNotice(t("SEL_NOQ"));
        return false;
    }

    // La oferta escuchada abre el presupuesto. Va antes de evaluar para que
    //idgetre el rechazo por caro: el jugador ya sabe cuanto tiene el NPC.
    _activeState().offered = true;

    var res = offerWeapon(itemId, qty, unitPrice);
    _say(res.msgKey, res.msgParams);
    setNotice(t(res.msgKey, res.msgParams));

    if (!res.ok) return false;

    // removeItem es el que valida el peso: si no entra despues de haber aceptado
    // el NPC, el aviso es el del modulo y el item no sale de la mochila.
    if (!removeItem(itemId, qty)) {
        setNotice(t("SEL_ERR"));
        return false;
    }
    try {
        new Player(0).addScore(res.total);
    } catch (e) {
        log("[WeaponSeller] no se pudo pagar: " + e.message);
        return false;
    }
    return true;
}

// El NPC habla con su tema de dialogo (00BB con nombre), que es distinto del
// texto de la pagina. Los dos caminos usan la misma key.
function _say(key, params) {
    try {
        emit("characters:say", {
            characterId: getActiveCharacterId(),
            key: key,
            params: params || null,
            ms: 3000,
            replace: true
        });
    } catch (e) { }
}

// Cuantas unidades tiene el jugador de ese id. Los instanciados (todas las armas
// con weaponId) valen 1 por fila; el resto se apila y suma qty.
function _ownedQty(itemId) {
    var items = getItems();
    var n = 0;
    for (var i = 0; i < items.length; i++) {
        if (items[i].id !== itemId) continue;
        n += isInstanced(itemId) ? 1 : (items[i].qty || 1);
    }
    return n;
}

// ============================================================================
// INTERNAS
// ============================================================================

function _allCategories() {
    var seen = {};
    var cats = [];
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        var w = WEAPON_DATA[i];
        if (!w.price || !w.category) continue;
        if (!seen[w.category]) {
            seen[w.category] = true;
            cats.push(w.category);
        }
    }
    return cats;
}

function _weaponsInCategory(cat) {
    var list = [];
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        var w = WEAPON_DATA[i];
        if (w.category === cat && w.price) list.push(w);
    }
    return list;
}

function _randRange(range, fallbackMin, fallbackMax) {
    if (range && range.length === 2) return [range[0], range[1]];
    return [fallbackMin, fallbackMax];
}

function _generateState(charId) {
    var st = _state(charId);
    var ch = getCharacter(charId);
    var cfg = (ch && ch.seller) ? ch.seller : null;

    st.techoInterest = _randRange(cfg && cfg.techoInterest, 50, 450);
    st.techoBase = _randRange(cfg && cfg.techoBase, 0, 150);

    var cats = _allCategories();
    if (cats.length === 0) {
        st.interests = [];
        st.budget = 0;
        st.salesCompleted = 0;
        st.salesTarget = 0;
        st.minSellInterest = 0;
        st.fulfilled = false;
        st.generated = true;
        return;
    }

    // Intereses: fijos del personaje o 1-2 aleatorios
    st.interests = [];
    if (cfg && cfg.interests && cfg.interests.length) {
        for (var f = 0; f < cfg.interests.length; f++) {
            st.interests.push(cfg.interests[f]);
        }
    } else {
        var count = 1 + Math.floor(Math.random() * 2); // 1 o 2
        var pool = cats.slice();
        for (var i = 0; i < count && pool.length > 0; i++) {
            var idx = Math.floor(Math.random() * pool.length);
            st.interests.push(pool[idx]);
            pool.splice(idx, 1);
        }
    }

    // Presupuesto: budgetMin/Max del personaje, o formula de 2-3 armas + 10-30%
    if (cfg && typeof cfg.budgetMin === "number") {
        var bmin = cfg.budgetMin;
        var bmax = (typeof cfg.budgetMax === "number") ? cfg.budgetMax : bmin;
        if (bmax < bmin) bmax = bmin;
        st.budget = bmin + Math.floor(Math.random() * (bmax - bmin + 1));
        st.budget = Math.round(st.budget / 50) * 50;
        if (st.budget < 50) st.budget = 50;
    } else {
        var interestWeapons = [];
        for (var j = 0; j < st.interests.length; j++) {
            var ws = _weaponsInCategory(st.interests[j]);
            for (var k = 0; k < ws.length; k++) interestWeapons.push(ws[k]);
        }
        var base = 0;
        var picks = Math.min(2 + Math.floor(Math.random() * 2), interestWeapons.length);
        var used = {};
        for (var n = 0; n < picks; n++) {
            var widx = Math.floor(Math.random() * interestWeapons.length);
            if (used[widx]) continue;
            used[widx] = true;
            base += getSellPrice(interestWeapons[widx].itemId);
        }
        if (base <= 0 && interestWeapons.length > 0) {
            base = getSellPrice(interestWeapons[0].itemId);
        }
        var mult = 1.1 + Math.random() * 0.2; // +10%..30%
        st.budget = Math.round((base * mult) / 50) * 50;
        if (st.budget < 50) st.budget = 50;
    }

    st.salesCompleted = 0;
    st.salesTarget = 2 + Math.floor(Math.random() * 3); // 2-4
    st.fulfilled = false;

    // sellPrice minimo entre armas de interes (para check de budget)
    var interestWeapons2 = [];
    for (var j2 = 0; j2 < st.interests.length; j2++) {
        var ws2 = _weaponsInCategory(st.interests[j2]);
        for (var k2 = 0; k2 < ws2.length; k2++) interestWeapons2.push(ws2[k2]);
    }
    st.minSellInterest = 0;
    for (var m = 0; m < interestWeapons2.length; m++) {
        var sp = getSellPrice(interestWeapons2[m].itemId);
        if (sp > 0 && (st.minSellInterest === 0 || sp < st.minSellInterest)) {
            st.minSellInterest = sp;
        }
    }
    if (st.minSellInterest === 0) st.minSellInterest = 50;

    st.generated = true;
    log("[WeaponSeller] NPC " + charId + " generado: intereses=" + st.interests.join("/") +
        " budget=$" + st.budget + " target=" + st.salesTarget);
}

function _checkFulfilled(st) {
    if (st.fulfilled) return;
    if (st.salesCompleted >= st.salesTarget || st.budget < st.minSellInterest) {
        st.fulfilled = true;
        log("[WeaponSeller] Interes cumplido (" + getActiveCharacterId() +
            " ventas=" + st.salesCompleted + "/ budget=$" + st.budget +
            ") — regenera al abrir");
    }
}

// ============================================================================
// REGISTRO (auto al importarse)
// ============================================================================

function initWeaponSeller() {
    log("[GSIS] WeaponSeller: esferas pendientes (esperar exterior)");
    registerMenuSource("seller", function () { return _showSellMenu; });
}

function updateWeaponSellerModule(now) {
    if (_gate.pending && updateSpotGate(_gate)) {
        _spheres = createSpotSpheres("seller");
        log("[WeaponSeller] " + _spheres.length + " esferas de trueque");
    }
    try {
        var c = new Player(0).getChar();
        var r = updateSpotFKeySpot(c, "seller", _showSellMenu, _spheres.length > 0);
        if (r.visible && !_showSellMenu) {
            // Abre: fijar personaje de la esfera + generar estado si hace falta
            _activeCharId = (r.spot && r.spot.characterId) || DEFAULT_CHAR;
            var st = _state(_activeCharId);
            if (!st.generated || st.fulfilled) _generateState(_activeCharId);
        }
        _showSellMenu = r.visible;
        if (!_showSellMenu) _activeCharId = null;
    } catch (e) { }
}

register({
    name: "WeaponSeller",
    init: initWeaponSeller,
    update: updateWeaponSellerModule
});
