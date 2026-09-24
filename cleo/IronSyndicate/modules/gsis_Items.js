// GSIS_ItemsModule - Sistema de items
import { registerModule, getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { KEYS, MISC } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { on } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";
import { getVehicleTrunkCapacity } from "../data/gsis_vehicle_data.js";
import { ITEMS, getItemDef, getItemName, getItemWeight, getItemType } from "../data/gsis_item_data.js";
import { getClipSizeByItemId } from "../data/gsis_weapon_data.js";

// Catalogo re-exportado (compat con UI)
export { ITEMS };

// true si el item es cargador (type magazine) — no se apila
function isMagazine(id) {
    var def = ITEMS[id];
    return !!(def && def.type === "magazine");
}

// Instancia de cargador: qty=1, ammo=capacidad, quality=1 (no stack)
function makeMagazineInstance(id, ammo, quality) {
    var cap = getClipSizeByItemId(id);
    return {
        id: id,
        qty: 1,
        ammo: (ammo === undefined || ammo === null) ? (cap || 0) : ammo,
        quality: quality || 1
    };
}

export function initItemManager() {
    registerModule("ItemManager", { items: [], trunks: {} });  // Registra modulo con datos default
    log("[Items] ItemManager inicializado");
}

// Debug: tecla L agrega 9mm, chatarra y 1 cargador (probar inventario/baul)
export function updateItemManager() {
    if (Pad.IsKeyJustPressed(KEYS.DEBUG_ITEM)) {  // Detecta tecla L
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

// Peso total del inventario
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
// opts solo para magazines: { ammo, quality } — default ammo=capacidad, quality=1
export function addItem(id, qty, opts) {
    if (!ITEMS[id]) return false;  // Verifica que item exista en catalogo
    qty = qty || 1;  // Default cantidad 1
    var peso = ITEMS[id].weight * qty;  // Calcula peso total a agregar
    var currentWeight = getTotalWeight();  // Obtiene peso actual
    if (currentWeight + peso > MISC.MAX_INVENTORY_WEIGHT) {  // Verifica capacidad
        showTextBox(t("INV_FUL"));  // Muestra error inventario lleno
        return false;
    }
    var data = getModuleData("ItemManager");  // Obtiene datos del modulo
    if (!data) data = { items: [], trunks: {} };  // Crea estructura si no existe
    if (!data.items) data.items = [];  // Crea array items si no existe

    // Cargadores: instancia por unidad (no se apilan; ammo/quality por mag)
    if (isMagazine(id)) {
        for (var m = 0; m < qty; m++) {
            data.items.push(makeMagazineInstance(
                id,
                opts ? opts.ammo : undefined,
                opts ? opts.quality : undefined
            ));
        }
        setModuleData("ItemManager", data);  // Guarda cambios
        return true;
    }

    for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === id) {
            data.items[i].qty += qty;  // Actualiza cantidad si item ya existe
            setModuleData("ItemManager", data);  // Guarda cambios
            return true;
        }
    }
    data.items.push({ id: id, qty: qty });  // Agrega nuevo item
    setModuleData("ItemManager", data);  // Guarda cambios
    return true;
}

// Quitar item del inventario
export function removeItem(id, qty) {
    qty = qty || 1;  // Default cantidad 1
    var data = getModuleData("ItemManager");  // Obtiene datos del modulo
    if (!data) data = { items: [] };  // Crea estructura si no existe
    if (!data.items) data.items = [];  // Crea array items si no existe

    // Cargadores: quitar instancias sueltas
    if (isMagazine(id)) {
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

    // Cargadores: mover instancias con su ammo/quality intactos
    if (isMagazine(id)) {
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

    // Quitar del inventario
    var found = false;
    for (var j = 0; j < data.items.length; j++) {
        if (data.items[j].id === id) {
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
    trunkArr.push({ id: id, qty: qty });
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

    // Cargadores: mover instancias con su ammo/quality intactos
    if (isMagazine(id)) {
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

    // Quitar del baul
    var found = false;
    for (var i = 0; i < trunkArr.length; i++) {
        if (trunkArr[i].id === id) {
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
    data.items.push({ id: id, qty: qty });
    setModuleData("ItemManager", data);
    return true;
}

// Transferencia generica inventario <-> baul (toTrunk=true: inv→baul)
export function transferItem(vehicleId, id, qty, toTrunk) {
    if (toTrunk) return addToTrunk(vehicleId, id, qty);
    return removeFromTrunk(vehicleId, id, qty);
}

// ============================================================================
// EVENTBUS - cargadores de la recarga (swap / descarga, desde Ballistic)
// ============================================================================

// query("items:swapMagazine", { magId, ammo, mounted }) — atomico:
// sale del inventario el cargador de mas balas del arma (si sus balas > 0) y,
// si "mounted" no es false, vuelve el que estaba montado con "ammo" balas
// (0 si se vacio). "mounted: false" = arma sin cargador: solo entra uno.
// Responde { ammo } = balas del cargador a montar, o null si no hay recambio
// (en ese caso el inventario no cambia).
on("items:swapMagazine", function (e) {
    var magId = e.data.magId;
    if (!magId || !isMagazine(magId)) { e.respond(null); return; }
    var data = getModuleData("ItemManager");
    if (!data || !data.items) { e.respond(null); return; }
    var best = -1;
    for (var i = 0; i < data.items.length; i++) {
        var it = data.items[i];
        if (it.id !== magId || !it.ammo || it.ammo <= 0) continue;
        if (best < 0 || it.ammo > data.items[best].ammo) best = i;
    }
    if (best < 0) { e.respond(null); return; }
    var freshAmmo = data.items[best].ammo;
    data.items.splice(best, 1);  // cargador fresco: sale del inventario
    if (e.data.mounted !== false) {
        data.items.push(makeMagazineInstance(magId, e.data.ammo));  // usado: vuelve con sus balas
    }
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

// Re-export helpers de catalogo
export { getItemDef, getItemName, getItemWeight, getItemType };
export { getMagazineDisplayName } from "../data/gsis_item_data.js";
export { getClipSizeByItemId } from "../data/gsis_weapon_data.js";
