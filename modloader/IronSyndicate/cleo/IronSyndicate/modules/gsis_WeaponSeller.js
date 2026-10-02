// GSIS - WeaponSeller
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS WeaponSeller - Punto de venta (trueque con NPC)
// ============================================================================
// N esferas (data/gsis_spot_data → seller) + ESPACIO abre el menu del trueque
//   parado dentro de la esfera; al cerrarlo la esfera se apaga un rato
// Estado POR characterId (spot.characterId → CHARACTERS): cada NPC tiene
// intereses/budget/techo propios (ch.seller en character_data, opcional).
// Techo = sellPrice + rand del rango del personaje (o default 50-450 / 0-150)
// Regenera solo al cumplir interes (budget bajo o N ventas del interes)
// La oferta la orquesta doOffer() mas abajo, en este archivo: offerWeapon()
// sola evalua, y el que saca el item, paga y hace hablar al NPC es el modulo.
// Depende de: ModuleRegistry, Input, character_data, SpotRuntime, Items, L10n,
//             Notice
//
// ============================================================================
// ESTE MODULO QUEDA SIN CATALOGO, Y SE SABE POR QUE
// ============================================================================
// El vendedor era el consumidor mas atado a la tabla de armas, y por tres vias
// distintas:
//
//   getSellPrice(itemId)   el precio base del trueque, en 6 lugares
//   WEAPON_DATA            las categorias, de donde salen los intereses del NPC
//   type "weapon" en ITEMS el filtro de que es vendible
//
// Las tres se fueron con el sistema de armas entero. Lo que quedo:
//
//   la esfera aparece y la cooldown funciona      sigue
//   ESPACIO abre y cierra el menu                sigue
//   el NPC genera intereses y presupuesto        sigue, vacio
//   el jugador mueve una oferta por fila         sigue, sin filas
//   QUE HAY PARA VENDER                          nada
//
// O sea: el modulo sigue siendo la maquina del trueque y no tiene mercaderia. Las
// dos funciones de abajo son las que contestaban, y contestan 0 y lista vacia.
//
// QUE HACE FALTA PARA QUE VUELVA A COMPRAR
// ----------------------------------------
// Un precio por item. Hoy el unico lugar donde puede declararse es
// `ch.seller.sellPrices[itemId]` en data/gsis_character_data.js: es un numero
// absoluto por NPC, asi que alcanza para tener un vendedor funcionando sin tocar
// este archivo. Ver getSellPrice() y _allCategories().
import { register } from "../core/gsis_ModuleRegistry.js";
import { registerMenuSource } from "../core/gsis_Input.js";
import { t, money } from "../core/gsis_L10n.js";
import { setNotice } from "../core/gsis_Notice.js";
import { emit } from "../core/gsis_EventBus.js";
import { getCharacter } from "../data/gsis_character_data.js";
import { getItems, removeItem, isInstanced } from "./inventory/index.js";
import {
    createSpotGate, updateSpotSpheres, closeSpotFlow, spotCanOpen,
    spotHas, beginSpotCooldown
} from "../core/gsis_SpotRuntime.js";

// ============================================================================
// LO QUE REEMPLAZA A LA TABLA DE ARMAS
// ============================================================================
// getSellPrice era `getSellPrice(id) = precioDeTabla * 0.6`, y devolvia 0 para lo
// que no estaba. El 0 no es un caso raro: es lo que hace que offerWeapon()
// rechace con SEL_NOB y lo que hacia que la pagina no dibujara la fila. Es el
// mismo contrato, con la fuente cambiada.
//
// Y 0 es lo que la hace segura de usar en las seis llamadas: `getSellPrice(k)`
// que suma un presupuesto, `getSellPrice(x)` que multiplica un techo y
// `if (!getSellPrice(id))` que rechaza, se comportan con 0 igual que antes con un
// item fuera de catalogo.

// El precio base del trueque de un item para el NPC activo, o 0 si no lo compra.
export function getSellPrice(itemId) {
    var ch = getCharacter(_activeCharId || DEFAULT_CHAR);
    if (!ch || !ch.seller || !ch.seller.sellPrices) return 0;
    var p = ch.seller.sellPrices[itemId];
    if (typeof p !== "number" || p <= 0) return 0;
    // El precio de trueque es multiplo de 10: el techo del NPC se sortea en
    // decenas y una base con centavos produce techos que no lo son.
    return Math.round(p / 10) * 10;
}

var DEFAULT_CHAR = "seller_local";

var _showSellMenu = false;
// Lo que este modulo publico en su ultimo update. Ver _trasCerrar: es lo que
// hace visible el cierre cuando lo hizo otro (la tecla, el Escape, la pagina).
var _sawOpen = false;
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
        offered: false,
        // La oferta que el jugador esta pidiendo por CADA arma, en el mismo
        // espiritu que el carrito de la armeria: el estado lo tiene el mod y la
        // pagina solo lo lee y lo mueve. {} vacio = oferta de base. Se vacia
        // junto con el resto cuando se regenera el NPC (_generateState).
        ofertas: {}
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

// Abrir el menu, si se puede. La llave la pide el bridge (modules/ui/index.js)
// cuando el jugador aprieta ESPACIO, y el "si se puede" se responde aca.
//
// Acá además se genera el estado del NPC si hace falta. Va en la apertura y no en
// el update porque el menu ya puede estar abierto cuando el update corre: si el
// estado se generara ahi, el primer snapshot mostraria el presupuesto y los
// intereses de un NPC que todavia no fue generado.
export function openSellMenu() {
    if (_showSellMenu) return false;
    var c = null;
    try { c = new Player(0).getChar(); } catch (e) { return false; }
    var spot = spotCanOpen("seller", c);
    if (!spot) return false;
    _activeCharId = spot.characterId || DEFAULT_CHAR;
    var st = _state(_activeCharId);
    if (!st.generated || st.fulfilled) _generateState(_activeCharId);
    _showSellMenu = true;
    return true;
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

// La oferta actual de un arma: lo que la pagina pinta en la columna OFERTA y lo
// que arma seller:offer cuando el jugador confirma. Sin nada guardado devuelve
// la base del trueque (getSellPrice), que es donde arranca la negociacion.
//
// Por que vive en el mod y no en la pagina: es estado del NPC, igual que el
// carrito de la armeria. Vivir aca hace que el snapshot sea la unica verdad —
// la pagina la pinta y listo— y que mover la oferta quede registrado aunque el
// jugador cambie de fila, se vaya del menu o el snapshot tarde.
export function getOffer(itemId) {
    var st = _activeState();
    var guardada = st.ofertas[itemId];
    if (guardada) return guardada;
    return getSellPrice(itemId);
}

// Mueve la oferta de un arma y la deja guardada. `delta` es +10/-10 (o +100/
// -100, la pagina decide el paso) y el resultado se vuelve a redondear a la
// decena: el precio de trueque es multiplo de 10 (getSellPrice) y sin esto una
// rafaga de teclas podria dejar la columna en una cifra que no es de este
// mercado.
//
// Los dos topes son parte del contrato, no ahorros:
//   piso 10    una oferta de 0 no es negociar, es regalar (offerWeapon rechaza
//              unitPrice <= 0, pero sin esto la columna llegaria a $0 y el
//              jugador mandaria un precio invalido).
//   techo base*3  sanitario, y elegido para NO filtrar el presupuesto: el techo
//              real del NPC es base + rand y el presupuesto sigue oculto hasta
//              la primera oferta, asi que frenar la oferta ahi daria el dato
//              del NPC a mirar la barra.
export function moveOffer(itemId, delta) {
    var base = getSellPrice(itemId);
    if (!base) return 0;
    // El delta puede venir malformado de la pagina (y con un NaN el `if` de
    // abajo no frenaria nada: NaN < 10 es false, NaN > base*3 tambien, y la
    // columna pasaria a $NaN).
    delta = Math.round(Number(delta) || 0);
    if (!delta) return getOffer(itemId);
    var st = _activeState();
    var actual = st.ofertas[itemId] || base;
    var nuevo = Math.round((actual + delta) / 10) * 10;
    if (nuevo < 10) nuevo = 10;
    if (nuevo > base * 3) nuevo = base * 3;
    st.ofertas[itemId] = nuevo;
    return nuevo;
}

// Evaluacion de oferta sobre el NPC activo.
// Devuelve { ok, total, interest, msgKey, msgParams } — la orquestacion (doOffer)
// saca el item, aplica el commit y paga.
//
// `commit` (por defecto true) decide si se MUEVE el estado del NPC. En false es
// una simulacion: decide lo mismo, tira el mismo dado, y no toca ni presupuesto
// ni salesCompleted ni fulfilled. Es lo que permite que doOffer mire primero si
// el NPC compra y solo despues cobre — antes el descuento pasaba antes de saber
// si el item salia de la mochila, y sin rollback: si removeItem fallaba, el NPC
// ya habia pagado y el jugador se llevaba el arma gratis.
// El precio que el jugador puede pedir y que el NPC acepta SIN jugar al azar:
// el 85% del techo, redondeado a la decena (todos los precios de este mercado
// son multiplos de 10, ver getSellPrice). Es la mitad del contrato de los dos
// rechazos de offerWeapon: sin este numero el jugador recibe un "no" que no
// puede responder, y con el el camino normal del trueque converge en dos
// intentos — ofrecer el techo mismo sigue siendo posible, y sigue siendo una
// moneda al aire, pero ya no es lo unico que se puede hacer.
//
// piso 10 y no 0: una oferta de 0 la rechaza el filtro de arriba (SEL_IVL), asi
// que decirle "hasta $0" seria mandarlo a un error.
function _precioSeguro(techo) {
    var n = Math.floor((techo * 0.85) / 10) * 10;
    return n < 10 ? 10 : n;
}

function offerWeapon(itemId, qty, unitPrice, commit) {
    if (commit === undefined || commit === null) commit = true;
    qty = qty || 1;
    // `<= 0` y no `< 0`: doOffer clampa a Math.max(0, ...), asi que un 0 pasaba
    // el filtro, daba `techo * 0.85 >= 0` (acepta seguro), `budget -= 0` y el
    // jugador entregaba el arma por nada. Aceptar un precio 0 es regalar.
    if (qty < 1 || !itemId || unitPrice <= 0) {
        return { ok: false, total: 0, interest: false, msgKey: "SEL_IVL", msgParams: null };
    }

    var sellPrice = getSellPrice(itemId);
    if (!sellPrice) {
        return { ok: false, total: 0, interest: false, msgKey: "SEL_NOB", msgParams: null };
    }

    var st = _activeState();

    // Categoria del item. Antes salia de WEAPON_DATA (primer match por itemId) y
    // servia para decidir si el item era un INTERES del NPC, que cambia el rango
    // del techo. Sin tabla de armas no hay categorias, asi que `cat` queda vacio
    // y `st.interests` —que sale de _allCategories()— tambien esta vacio: la
    // comparacion de abajo da false siempre y toda oferta usa el rango base.
    //
    // Es el mismo resultado que un item fuera de las categorias del NPC, que es un
    // caso que ya tenia su propio techo. No es un atajo: sin catalogo no hay
    // categoria que mirar.
    var cat = "";
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

    // Rechazo automatico: oferta > techo. El mensaje lleva el precio SEGURO, no
    // el techo: es el unico numero que el jugador puede ofrecer y recibir
    // respuesta "si" (unitPrice <= techo * 0.85, mas abajo). Decirle "hasta
    // $950" cuando ofrecer $950 es una moneda al aire lo estaria mandando al
    // mismo rechazo de siempre, y mover la oferta a ciegas no es negociar.
    if (unitPrice > techo) {
        return {
            ok: false, total: 0, interest: isInterest,
            msgKey: "SEL_R1", msgParams: { n: money(_precioSeguro(techo)) }
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
            // Mismo numero que SEL_R1: si estiro demasiado, lo que le falta es
            // saber hasta donde NO. La diferencia entre los dos rechazos la pone
            // el color del codigo (~y~ en vez de ~r~), no el numero.
            return {
                ok: false, total: 0, interest: isInterest,
                msgKey: "SEL_R3", msgParams: { n: money(_precioSeguro(techo)) }
            };
        }
        // acepta con flavor de "un poco caro"
        if (commit) _commitOffer(st, total, isInterest);
        return {
            ok: true, total: total, interest: isInterest,
            msgKey: "SEL_A2", msgParams: { n: money(total) }
        };
    }

    // Acepta seguro
    if (commit) _commitOffer(st, total, isInterest);
    return {
        ok: true, total: total, interest: isInterest,
        msgKey: "SEL_A1", msgParams: { n: money(total) }
    };
}

// El unico lugar que mueve el estado del NPC por una venta. Vive aparte de
// offerWeapon para que la evaluacion y el commit sean dos pasos: doOffer
// simula (commit=false), saca el item del jugador, y recien ahi llama esto.
//
// Concentrarlo aca tambien cierra el otro agujero que tenia el codigo en dos
// ramas: si mañana aparece una tercera forma de aceptar, no puede olvidarse de
// descontar el presupuesto.
function _commitOffer(st, total, isInterest) {
    st.budget -= total;
    if (isInterest) {
        st.salesCompleted++;
        _checkFulfilled(st);
    }
}

// La oferta del jugador. Es la orquestacion que vivia en el ui/gsis_SellMenu.js:
// offerWeapon() EVALUA, y este mete el item en la mochila, mueve el estado del
// NPC, le paga al jugador y le hace hablar.
//
// EL ORDEN ES TODO, y va asi a proposito:
//   1. el jugador tiene la cantidad
//   2. SIMULACION de la oferta (commit=false): el NPC no paga todavia
//   3. el item sale de la mochila
//   4. el commit: se descuenta el presupuesto del NPC
//   5. se paga al jugador
//
// Antes el descuento pasaba en el paso 2 y el item se sacaba en el 3, sin
// rollback: si removeItem fallaba (o si addScore tiraba) el NPC ya habia pagado
// y el jugador conservaba el arma. Ahora la simulacion no toca nada, y entre el
// paso 3 y el 4 no hay nada que pueda fallar.
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

    var res = offerWeapon(itemId, qty, unitPrice, false);
    _say(res.msgKey, res.msgParams);
    setNotice(t(res.msgKey, res.msgParams));

    if (!res.ok) return false;

    // El item sale PRIMERO. Si esto falla, el NPC no pago nada todavia.
    if (!removeItem(itemId, qty)) {
        setNotice(t("SEL_ERR"));
        return false;
    }
    // Ahora si: el NPC acepta y se descuenta. A partir de aca el item ya no es
    // del jugador, asi que el commit tiene que ocurrir pase lo que pase.
    _commitOffer(_activeState(), res.total, res.interest);
    try {
        new Player(0).addScore(res.total);
    } catch (e) {
        // El presupuesto ya se desconto y el item ya salio: revertir el NPC seria
        // peor que dejar el pago pendiente, porque el item ya no se puede
        // devolver. Se avisa igual para que el jugador sepa que no cobró.
        log("[WeaponSeller] no se pudo pagar: " + e.message);
        setNotice(t("SEL_ERR"));
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

// ============================================================================
// EL CATALOGO QUE NO ESTA
// ============================================================================
// Estas tres funciones caminaban `WEAPON_DATA`, la tabla de armas, para saber que
// vendible hay y en que categorias. La tabla se borro, asi que no hay nada que
// recorrer: `_allCategories()` devuelve la lista vacia y el NPC no genera
// intereses.
//
// Y el filtro de "solo armas" ya no hace falta. Antes era `getItemType(id) ===
// "weapon"` sobre las filas de la tabla, y su razon estaba escrita: la tabla
// contenia tambien los CARGADORES —que tienen precio, y por lo tanto eran
// comprables—, y sin el filtro un NPC podia pedirte municion. Hoy ITEMS no tiene
// ninguna fila `type: "weapon"` ni ninguna `type: "magazine"`, asi que la pregunta
// "es un arma?" tiene una sola respuesta y es que no hay armas.
//
// La rama de `cats.length === 0` en _generateState() ya existia y ya sabia que
// un NPC sin categorias tiene que dejar presupuesto e intereses en cero. No hizo
// falta escribir un caso nuevo: el que habia es exactamente este.

// Las categorias entre las que el NPC puede tener interés. Vacia: no hay
// catalogo de armas al que preguntarle.
function _allCategories() {
    return [];
}

// Los items de una categoria. Vacio, por lo mismo que arriba. Se conserva porque
// _generateState() la usa para el presupuesto por formula, y borrarla seria
// reescribir esa rama para un caso que ya no puede pasar.
function _weaponsInCategory(cat) {
    return [];
}

function _randRange(range, fallbackMin, fallbackMax) {
    if (range && range.length === 2) return [range[0], range[1]];
    return [fallbackMin, fallbackMax];
}

function _generateState(charId) {
    var st = _state(charId);
    // El NPC nuevo es un NPC nuevo: las ofertas que le venia pidiendo al anterior
    // no le dicen nada a este. Se limpia aca y no en closeSellMenu porque la
    // regeneracion puede pasar con el menu cerrado (openSellMenu con fulfilled).
    st.ofertas = {};
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
    log("[GSIS] WeaponSeller: menu con esfera (ESPACIO abre y cierra)");
    registerMenuSource("seller", function () { return _showSellMenu; });
}

// El update solo CIERRA: la apertura la pide el bridge con la tecla
// (openSellMenu), porque el dueno de la tecla es el. Ver gsis_SpotRuntime.js.
function updateWeaponSellerModule(now) {
    updateSpotSpheres("seller", _gate, true);
    try {
        var c = new Player(0).getChar();
        _showSellMenu = closeSpotFlow(c, "seller", _showSellMenu, spotHas("seller"));
        if (!_showSellMenu) _activeCharId = null;
        _trasCerrar();
    } catch (e) { }
}

// El menu se cerro → la esfera se apaga (TIMERS.SPHERE_COOLDOWN).
//
// La transicion se mide contra lo que publico este modulo en su ultimo update, y
// no contra el flag: el cierre puede venir de afuera —ESPACIO, ESC o el
// "ui:close" de la pagina, que corren DESPUES que el update de los modulos— y en
// ese caso el flag ya esta en false cuando este update corre. Con el flag, cerrar
// con la tecla no apagaria la esfera.
//
// Y va con la TRANSICION, no con el estado: pedirla en cada frame sin menu la
// pediria al abrirlo y no se podria volver a abrir nunca.
function _trasCerrar() {
    if (_sawOpen && !_showSellMenu) {
        beginSpotCooldown("seller");
    }
    _sawOpen = _showSellMenu;
}

register({
    name: "WeaponSeller",
    init: initWeaponSeller,
    update: updateWeaponSellerModule
});
