// GSIS - PropertyModule
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS PropertyModule - Compra y listado de propiedades (Fase 1)
// ============================================================================
// Depende de: SaveManager (dinero + persistencia), property_data, ModuleRegistry
// ============================================================================

import { registerModule, getModuleData, setModuleData, getCleanMoney, spendCleanMoney } from "../core/gsis_SaveManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { t } from "../core/gsis_L10n.js";
import { PROPERTY_DATA, getPropertyDef } from "../data/gsis_property_data.js";

export function initPropertyModule() {
    log("[GSIS] PropertyModule inicializado");
    registerModule("Properties", { owned: [] });
}

// Lista de todas las propiedades con flag owned
export function listProperties() {
    var data = getModuleData("Properties") || { owned: [] };
    var ownedIds = {};
    for (var i = 0; i < data.owned.length; i++) {
        ownedIds[data.owned[i].id] = data.owned[i];
    }
    var result = [];
    for (var j = 0; j < PROPERTY_DATA.length; j++) {
        var def = PROPERTY_DATA[j];
        result.push({
            id: def.id,
            name: def.name,
            type: def.type,
            cost: def.cost,
            dailyWage: def.dailyWage,
            capacity: def.capacity,
            x: def.x, y: def.y, z: def.z,
            owned: !!ownedIds[def.id],
            purchasedAt: ownedIds[def.id] ? ownedIds[def.id].purchasedAt : 0
        });
    }
    return result;
}

// Propiedad propia por id (datos completos) o null
export function getOwnProperty(propId) {
    var data = getModuleData("Properties");
    if (!data || !data.owned) return null;
    for (var i = 0; i < data.owned.length; i++) {
        if (data.owned[i].id === propId) {
            var def = getPropertyDef(propId);
            if (!def) return null;
            return {
                id: def.id,
                name: def.name,
                type: def.type,
                cost: def.cost,
                dailyWage: def.dailyWage,
                capacity: def.capacity,
                purchasedAt: data.owned[i].purchasedAt
            };
        }
    }
    return null;
}

export function isOwned(propId) {
    return getOwnProperty(propId) !== null;
}

// Comprar propiedad; devuelve true si OK
export function buyProperty(propId) {
    var def = getPropertyDef(propId);
    if (!def) {
        showTextBox(t("PROP_UN"));
        return false;
    }
    if (isOwned(propId)) {
        showTextBox(t("PROP_OW", { name: def.name }));
        return false;
    }
    if (getCleanMoney() < def.cost) {
        showTextBox(t("MON_LOW", { n: def.cost - getCleanMoney() }));
        return false;
    }
    if (!spendCleanMoney(def.cost)) return false;

    var data = getModuleData("Properties") || { owned: [] };
    if (!data.owned) data.owned = [];
    data.owned.push({ id: propId, purchasedAt: Date.now() });
    setModuleData("Properties", data);
    showTextBox(t("PROP_BY", { name: def.name, n: def.cost }));
    log("[PropertyModule] Comprada: " + propId);
    return true;
}

// Total de nomina diaria de propiedades propias
export function getDailyWageTotal() {
    var owned = listProperties();
    var total = 0;
    for (var i = 0; i < owned.length; i++) {
        if (owned[i].owned) total += owned[i].dailyWage;
    }
    return total;
}

register({
    name: "Properties",
    init: initPropertyModule
});
