// GSIS - gsis_Items
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// GSIS_ItemsModule - Sistema de items
import { registerModule, getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { KEYS, MISC } from "../core/gsis_Config.js";
import { keyJustPressed } from "../core/gsis_Input.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { on } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";
import { getVehicleTrunkCapacity } from "../data/gsis_vehicle_data.js";
import { ITEMS, getItemDef, getItemName, getItemWeight, getItemType, SALUD_MAX, clampSalud } from "../data/gsis_item_data.js";
import { getClipSizeByItemId, getWeaponByItemId } from "../data/gsis_weapon_data.js";

// Catalogo re-exportado (compat con UI)
export { ITEMS };

// true si el item es cargador (type magazine) — no se apila
function isMagazine(id) {
    var def = ITEMS[id];
    return !!(def && def.type === "magazine");
}

// true si el item es instancia (no apila): cargador o arma con weaponId.
// El arma instancia guarda su estado: { id, qty:1, hasMag, ammo }
//
// Exportada porque es una regla de conteo, no de guardado: el baul la necesita
// para saber si "3" son tres filas o tres unloaded de un apilado. Copiarla
// aca seria la mitad de una regla que decide si las cosas se multiplican.
export function isInstanced(id) {
    if (isMagazine(id)) return true;
    var def = ITEMS[id];
    if (!def || def.type !== "weapon") return false;
    var wd = getWeaponByItemId(id);
    return !!(wd && wd.weaponId !== null && wd.weaponId !== undefined);
}

// Instancia de cargador: qty=1, ammo=capacidad, salud=100 (no stack)
function makeMagazineInstance(id, ammo, salud) {
    var cap = getClipSizeByItemId(id);
    return {
        id: id,
        qty: 1,
        ammo: (ammo === undefined || ammo === null) ? (cap || 0) : ammo,
        salud: clampSalud(salud)
    };
}

// Instancia de arma: qty=1, cargador montado por defecto (hasMag=true, ammo=cap)
function makeWeaponInstance(id, hasMag, ammo, salud) {
    var cap = getClipSizeByItemId(id) || 0;
    var mounted = (hasMag === undefined || hasMag === null) ? true : !!hasMag;
    return {
        id: id,
        qty: 1,
        hasMag: mounted,
        ammo: (ammo === undefined || ammo === null) ? (mounted ? cap : 0) : ammo,
        salud: clampSalud(salud)
    };
}

// Instancia generica (cargador o arma) con opts { ammo, salud, hasMag }
function makeInstance(id, opts) {
    if (isMagazine(id)) {
        return makeMagazineInstance(id, opts ? opts.ammo : undefined, opts ? opts.salud : undefined);
    }
    return makeWeaponInstance(id, opts ? opts.hasMag : undefined, opts ? opts.ammo : undefined,
        opts ? opts.salud : undefined);
}

// Saves viejos: { id, qty > 1 } de un item instanciado → una entrada por unidad
// con estado por defecto (cargador montado lleno). Devuelve true si cambio algo.
function _splitStacks(list) {
    if (!list) return false;
    var out = [];
    var changed = false;
    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var qty = it.qty || 1;
        if (qty > 1 && isInstanced(it.id)) {
            changed = true;
            for (var q = 0; q < qty; q++) out.push(makeInstance(it.id, it));
        } else {
            out.push(it);
        }
    }
    if (!changed) return false;
    list.length = 0;
    for (var j = 0; j < out.length; j++) list.push(out[j]);
    return true;
}

// Migracion de salud, una fila por fila. Devuelve true si cambio algo.
//
// El campo viejo era `quality`: entero 1..N, mostrado como "Cal: N" pegado al
// nombre. Se unifica en `salud` (0..100, columna propia) y `quality` desaparece.
//
// La conversion es exacta: `quality` solo valia 1 — makeMagazineInstance hacia
// `quality || 1` y NADIE pasaba opts.quality, asi que nunca se escribio otro
// valor — y 1 era "como nuevo", que es SALUD_MAX. Asi que toda fila vieja vale
// SALUD_MAX y no se pierde estado que valiera la pena.
//
// Se aplica a items[], a TODOS los baules y tambien a belt[]: el cinturon es un
// contenedor de ItemManager mas y sus cargadores son filas como las otras. Antes
// la migracion no lo miraba, y un cinturon de un save viejo se quedaba sin
// salud — la pagina la dibujaba al 100% por el fallback, sin que nadie lo supiera.
function _migrateSalud(list) {
    if (!list) return false;
    var changed = false;
    for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it) continue;
        if (it.quality !== undefined) {
            delete it.quality;
            changed = true;
        }
        var s = clampSalud(it.salud);
        if (it.salud !== s) {
            it.salud = s;
            changed = true;
        }
    }
    return changed;
}

// Normaliza items[], trunks y belt al cargar partida.
//
// El orden importa. _splitStacks va PRIMERO porque crea filas nuevas con
// makeInstance, que ya escribe salud; si _migrateSalud corriera antes, todavia
// no existirian. Al reves es un gasto inutil, no un error: _migrateSalud es
// idempotente.
function _normalizeInstances(data) {
    if (!data) return false;
    var changed = false;
    if (_splitStacks(data.items)) changed = true;
    if (_migrateSalud(data.items)) changed = true;
    if (data.belt && _migrateSalud(data.belt)) changed = true;
    if (data.trunks) {
        for (var key in data.trunks) {
            if (Object.prototype.hasOwnProperty.call(data.trunks, key)) {
                if (_splitStacks(data.trunks[key])) changed = true;
                if (_migrateSalud(data.trunks[key])) changed = true;
            }
        }
    }
    return changed;
}

export function initItemManager() {
    // belt: cinturon de cargadores equipados (MISC.MAG_BELT_SLOTS casillas)
    registerModule("ItemManager", { items: [], trunks: {}, belt: [] });
    var data = getModuleData("ItemManager");
    if (data && _normalizeInstances(data)) setModuleData("ItemManager", data);
    log("[Items] ItemManager inicializado");
}

// Debug: tecla L agrega 9mm, chatarra y 1 cargador (probar inventario/baul)
export function updateItemManager() {
    if (keyJustPressed(KEYS.DEBUG_ITEM)) {  // Detecta tecla L
        var ok9 = addItem("9mm", 1);  // Agrega arma de prueba
        var okScrap = addItem("scrap_metal", 5);  // Agrega material de prueba
        var okMag = addItem("mag_9mm", 1);  // Agrega cargador de prueba
        if (ok9 || okScrap || okMag) {
            showTextBox(t("DBG_ITM"));  // Muestra mensaje de exito
        } else {
            showTextBox(t("INV_FUL"));  // Muestra error inventario lleno
        }
    }
}

register({
    name: "Items",
    init: initItemManager,
    update: updateItemManager
});

// Obtener todos los items del inventario
export function getItems() {
    var data = getModuleData("ItemManager");  // Obtiene datos del modulo
    if (!data) return [];  // Retorna array vacio si no hay datos
    if (!data.items) return [];  // Retorna array vacio si no hay items
    return data.items || [];  // Retorna lista de items
}

// Peso total del inventario (solo items[]: lo equipado sale de la lista,
// tanto armas como cargadores del cinturon, y por tanto no pesa)
export function getTotalWeight() {
    var items = getItems();  // Obtiene items del inventario
    var total = 0;
    for (var i = 0; i < items.length; i++) {
        var def = ITEMS[items[i].id];  // Obtiene definicion del item
        if (def) total += def.weight * items[i].qty;  // Suma peso * cantidad
    }
    return total;  // Retorna peso total
}

// Agregar item al inventario (verifica MISC.MAX_INVENTORY_WEIGHT)
// opts por instancia: { ammo, salud, hasMag } · opts.force = ignora peso
// (adopcion de armas del ped: ya iban encima del jugador)
export function addItem(id, qty, opts) {
    if (!ITEMS[id]) return false;  // Verifica que item exista en catalogo
    qty = qty || 1;  // Default cantidad 1
    var peso = ITEMS[id].weight * qty;  // Calcula peso total a agregar
    var currentWeight = getTotalWeight();  // Obtiene peso actual
    if ((!opts || !opts.force) && currentWeight + peso > MISC.MAX_INVENTORY_WEIGHT) {
        showTextBox(t("INV_FUL"));  // Muestra error inventario lleno
        return false;
    }
    var data = getModuleData("ItemManager");  // Obtiene datos del modulo
    if (!data) data = { items: [], trunks: {} };  // Crea estructura si no existe
    if (!data.items) data.items = [];  // Crea array items si no existe

    // Instancias (cargadores y armas): una entrada por unidad (sin stack)
    if (isInstanced(id)) {
        for (var m = 0; m < qty; m++) {
            data.items.push(makeInstance(id, opts));
        }
        setModuleData("ItemManager", data);  // Guarda cambios
        return true;
    }

    for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === id) {
            // Une al stack que ya esta: NO se toca su salud. El stack es una
            // fila con una salud, y agregar no esmbia la unidad que ya estaba
            // ahi. La regla de "gastar de un stack gastado" la aplica quien
            // consuma, no la alta.
            data.items[i].qty += qty;
            setModuleData("ItemManager", data);  // Guarda cambios
            return true;
        }
    }
    data.items.push({ id: id, qty: qty, salud: SALUD_MAX });  // Agrega nuevo item
    setModuleData("ItemManager", data);  // Guarda cambios
    return true;
}

// Quitar item del inventario
export function removeItem(id, qty) {
    qty = qty || 1;  // Default cantidad 1
    var data = getModuleData("ItemManager");  // Obtiene datos del modulo
    if (!data) data = { items: [] };  // Crea estructura si no existe
    if (!data.items) data.items = [];  // Crea array items si no existe

    // Instancias (cargadores/armas): quitar instancias sueltas
    if (isInstanced(id)) {
        var removed = 0;
        for (var m = 0; m < data.items.length && removed < qty; ) {
            if (data.items[m].id === id) {
                data.items.splice(m, 1);
                removed++;
            } else {
                m++;
            }
        }
        if (removed <= 0) return false;
        setModuleData("ItemManager", data);  // Guarda cambios
        return true;
    }

    for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === id) {
            data.items[i].qty -= qty;  // Resta cantidad
            if (data.items[i].qty <= 0) data.items.splice(i, 1);  // Elimina si cantidad <= 0
            setModuleData("ItemManager", data);  // Guarda cambios
            return true;
        }
    }
    return false;  // Retorna false si item no encontrado
}

// ============================================================================
// FUNCIONES DE BAUL
// ============================================================================

function _ensureTrunks(data) {
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];
    if (!data.trunks) data.trunks = {};
    return data;
}

// Obtener items del baul de un vehiculo
export function getTrunkItems(vehicleId) {
    var data = getModuleData("ItemManager");
    data = _ensureTrunks(data);
    return data.trunks[vehicleId] || [];
}

// Peso total del baul de un vehiculo
export function getTrunkWeight(vehicleId) {
    var items = getTrunkItems(vehicleId);
    var total = 0;
    for (var i = 0; i < items.length; i++) {
        var def = ITEMS[items[i].id];
        if (def) total += def.weight * items[i].qty;
    }
    return total;
}

// Capacidad maxima del baul
export function getTrunkMaxCapacity(vehicleId) {
    var vehicleData = getModuleData("VehicleModule");
    if (!vehicleData || !vehicleData.vehicles) return 150;
    for (var i = 0; i < vehicleData.vehicles.length; i++) {
        if (vehicleData.vehicles[i].id === vehicleId) {
            return getVehicleTrunkCapacity(vehicleData.vehicles[i].model);
        }
    }
    return 150;
}

// Mover item del inventario al baul
export function addToTrunk(vehicleId, id, qty) {
    qty = qty || 1;
    if (!ITEMS[id]) return false;

    var data = getModuleData("ItemManager");
    data = _ensureTrunks(data);

    // Verificar peso del baul
    var def = ITEMS[id];
    var currentWeight = 0;
    var trunkItems = data.trunks[vehicleId] || [];
    for (var i = 0; i < trunkItems.length; i++) {
        var itemDef = ITEMS[trunkItems[i].id];
        if (itemDef) currentWeight += itemDef.weight * trunkItems[i].qty;
    }
    var maxCap = getTrunkMaxCapacity(vehicleId);
    if (currentWeight + def.weight * qty > maxCap) {
        return false;
    }

    if (!data.trunks[vehicleId]) data.trunks[vehicleId] = [];
    var trunkArr = data.trunks[vehicleId];

    // Instancias (cargadores/armas): mover instancias con su estado intacto
    if (isInstanced(id)) {
        var moved = 0;
        for (var m = 0; m < data.items.length && moved < qty; ) {
            if (data.items[m].id === id) {
                trunkArr.push(data.items[m]);
                data.items.splice(m, 1);
                moved++;
            } else {
                m++;
            }
        }
        if (moved <= 0) return false;
        setModuleData("ItemManager", data);
        return true;
    }

    // Quitar del inventario. La salud sale de la fila que se saca (antes del
    // splice), por el mismo motivo que en removeFromTrunk: la unidad no llega
    // nueva al baul, llega con la salud que tenia.
    var found = false;
    var salud = SALUD_MAX;
    for (var j = 0; j < data.items.length; j++) {
        if (data.items[j].id === id) {
            salud = clampSalud(data.items[j].salud);
            data.items[j].qty -= qty;
            if (data.items[j].qty <= 0) data.items.splice(j, 1);
            found = true;
            break;
        }
    }
    if (!found) return false;

    // Agregar al baul
    for (var k = 0; k < trunkArr.length; k++) {
        if (trunkArr[k].id === id) {
            trunkArr[k].qty += qty;
            setModuleData("ItemManager", data);
            return true;
        }
    }
    trunkArr.push({ id: id, qty: qty, salud: salud });
    setModuleData("ItemManager", data);
    return true;
}

// Mover item del baul al inventario
export function removeFromTrunk(vehicleId, id, qty) {
    qty = qty || 1;
    if (!ITEMS[id]) return false;

    var data = getModuleData("ItemManager");
    data = _ensureTrunks(data);

    // Verificar peso del inventario
    var def = ITEMS[id];
    var currentWeight = getTotalWeight();
    if (currentWeight + def.weight * qty > MISC.MAX_INVENTORY_WEIGHT) {
        showTextBox(t("INV_FUL"));
        return false;
    }

    var trunkArr = data.trunks[vehicleId] || [];

    // Instancias (cargadores/armas): mover instancias con su estado intacto
    if (isInstanced(id)) {
        var moved = 0;
        for (var m = 0; m < trunkArr.length && moved < qty; ) {
            if (trunkArr[m].id === id) {
                data.items.push(trunkArr[m]);
                trunkArr.splice(m, 1);
                moved++;
            } else {
                m++;
            }
        }
        if (moved <= 0) return false;
        setModuleData("ItemManager", data);
        return true;
    }

    // Quitar del baul. La salud sale DE LA FILA QUE SE SACA, no de un default:
    // un stack de chatarra al 40% en el baul sigue al 40% cuando llega a la
    // mochila. Se lee ANTES del splice, que se lleva la fila.
    var found = false;
    var salud = SALUD_MAX;
    for (var i = 0; i < trunkArr.length; i++) {
        if (trunkArr[i].id === id) {
            salud = clampSalud(trunkArr[i].salud);
            trunkArr[i].qty -= qty;
            if (trunkArr[i].qty <= 0) trunkArr.splice(i, 1);
            found = true;
            break;
        }
    }
    if (!found) return false;

    // Agregar al inventario
    for (var j = 0; j < data.items.length; j++) {
        if (data.items[j].id === id) {
            data.items[j].qty += qty;
            setModuleData("ItemManager", data);
            return true;
        }
    }
    data.items.push({ id: id, qty: qty, salud: salud });
    setModuleData("ItemManager", data);
    return true;
}

// Transferencia generica inventario <-> baul (toTrunk=true: inv→baul)
export function transferItem(vehicleId, id, qty, toTrunk) {
    if (toTrunk) return addToTrunk(vehicleId, id, qty);
    return removeFromTrunk(vehicleId, id, qty);
}

// ============================================================================
// CINTURON - cargadores equipados (MISC.MAG_BELT_SLOTS casillas ficticias)
// ============================================================================

// Normaliza data.belt a al menos MAG_BELT_SLOTS casillas (null = libre)
function _ensureBelt(data) {
    if (!data.belt || typeof data.belt.length !== "number") data.belt = [];
    while (data.belt.length < MISC.MAG_BELT_SLOTS) data.belt.push(null);
    return data.belt;
}

// getBelt — casillas del cinturon: [instanciaCargador | null, ...]
export function getBelt() {
    var data = getModuleData("ItemManager");
    if (!data) return [];
    return _ensureBelt(_ensureTrunks(data));
}

// equipMagToBelt — mueve 1 cargador del inventario a la primera casilla libre.
// El cargador equipado deja de contar peso (sale de items[]).
export function equipMagToBelt(id) {
    if (!isMagazine(id)) return false;
    var data = _ensureTrunks(getModuleData("ItemManager"));
    var belt = _ensureBelt(data);
    var free = -1;
    for (var i = 0; i < belt.length; i++) {
        if (!belt[i]) { free = i; break; }
    }
    if (free < 0) { showTextBox(t("BELTFUL")); return false; }
    var best = -1;
    for (var m = 0; m < data.items.length; m++) {
        var it = data.items[m];
        if (it.id !== id) continue;
        if (best < 0 || (it.ammo || 0) > (data.items[best].ammo || 0)) best = m;
    }
    if (best < 0) return false; // sin cargador de ese tipo en el inventario
    belt[free] = data.items[best];
    data.items.splice(best, 1);
    setModuleData("ItemManager", data);
    return true;
}

// unequipBeltMag — devuelve la casilla al inventario (respeta el peso maximo)
export function unequipBeltMag(index) {
    var data = _ensureTrunks(getModuleData("ItemManager"));
    var belt = _ensureBelt(data);
    var mag = belt[index];
    if (!mag) return false;
    var def = ITEMS[mag.id];
    if (def && getTotalWeight() + def.weight * (mag.qty || 1) > MISC.MAX_INVENTORY_WEIGHT) {
        showTextBox(t("INV_FUL"));
        return false;
    }
    belt[index] = null;
    data.items.push(mag);
    setModuleData("ItemManager", data);
    return true;
}

// ============================================================================
// EVENTBUS - equipo y cargadores (Ballistic: equipar, swap y descarga)
// ============================================================================

// query("items:swapMagazine", { magId, ammo, mounted }) — atomico, fuente =
// CINTURON (solo cargadores equipados): sale de la casilla el cargador del
// arma con mas balas (si sus balas > 0) y, si "mounted" no es false, la
// casilla que acaba de vaciar se queda con el montado con "ammo" balas
// (0 si se vacio). "mounted: false" = arma sin cargador: la casilla queda
// libre (el cargador fresco se fue al arma). Inventario sin tocar.
// Responde { ammo } = balas del cargador a montar, o null si no hay recambio.
on("items:swapMagazine", function (e) {
    var magId = e.data.magId;
    if (!magId || !isMagazine(magId)) { e.respond(null); return; }
    var data = _ensureTrunks(getModuleData("ItemManager"));
    var belt = _ensureBelt(data);
    var best = -1;
    for (var i = 0; i < belt.length; i++) {
        var it = belt[i];
        if (!it || it.id !== magId || !it.ammo || it.ammo <= 0) continue;
        if (best < 0 || it.ammo > belt[best].ammo) best = i;
    }
    if (best < 0) { e.respond(null); return; }
    var freshAmmo = belt[best].ammo;
    belt[best] = (e.data.mounted !== false)
        ? makeMagazineInstance(magId, e.data.ammo)  // usado: ocupa la casilla
        : null;                                     // descarga: casilla libre
    setModuleData("ItemManager", data);
    e.respond({ ammo: freshAmmo });
});

// query("items:extractMagazine", { magId, ammo }) — descarga (R sin recambio):
// el cargador montado con "ammo" balas pasa al inventario (respetando el peso).
// Responde { ammo } si cabe, o null si no (INV_FUL: el arma no cambia).
on("items:extractMagazine", function (e) {
    var magId = e.data.magId;
    if (!magId || !isMagazine(magId)) { e.respond(null); return; }
    var out = e.data.ammo || 0;
    if (!addItem(magId, 1, { ammo: out })) { e.respond(null); return; }
    e.respond({ ammo: out });
});

// query("items:takeWeapon", { id }) — saca 1 instancia de arma del inventario
// y responde su estado { hasMag, ammo, salud }, o null si no hay (equipar).
//
// `salud` viaja en la respuesta porque el arma sale de items[] y se va a un
// slot de GTA, donde no hay items[]: si no cruzara aqui, se perderia al
// equipar. equipped[slot] la guarda.
on("items:takeWeapon", function (e) {
    var data = getModuleData("ItemManager");
    if (!data || !data.items) { e.respond(null); return; }
    var id = e.data.id;
    // Mejor instancia: la que lleva cargador montado y mas balas
    var best = -1;
    for (var i = 0; i < data.items.length; i++) {
        var it = data.items[i];
        if (it.id !== id) continue;
        if (best < 0) { best = i; continue; }
        var cur = data.items[best];
        var curMag = cur.hasMag !== false, itMag = it.hasMag !== false;
        if (itMag !== curMag) { if (itMag) best = i; continue; }
        if ((it.ammo || 0) > (cur.ammo || 0)) best = i;
    }
    if (best < 0) { e.respond(null); return; }
    var taken = data.items[best];
    var capT = getClipSizeByItemId(taken.id) || 0;
    var hasMagT = taken.hasMag !== false;
    var ammoT = (taken.ammo === undefined || taken.ammo === null)
        ? (hasMagT ? capT : 0)
        : taken.ammo;
    var saludT = clampSalud(taken.salud);
    if ((taken.qty || 1) > 1) taken.qty -= 1; // por si queda un stack heredado
    else data.items.splice(best, 1);
    setModuleData("ItemManager", data);
    e.respond({ hasMag: hasMagT, ammo: ammoT, salud: saludT });
});

// query("items:storeWeapon", { id, hasMag, ammo, salud, force }) — guarda 1
// instancia de arma con su estado (desequipar / adopcion del ped). "force"
// ignora el peso (adopcion). Responde { ok } o null si no cabe (INV_FUL).
on("items:storeWeapon", function (e) {
    var ok = addItem(e.data.id, 1, {
        hasMag: e.data.hasMag,
        ammo: e.data.ammo,
        salud: e.data.salud,
        force: e.data.force === true
    });
    e.respond(ok ? { ok: true } : null);
});

// Re-export helpers de catalogo
export { getItemDef, getItemName, getItemWeight, getItemType };
export { SALUD_MAX, clampSalud } from "../data/gsis_item_data.js";
export { getClipSizeByItemId } from "../data/gsis_weapon_data.js";
