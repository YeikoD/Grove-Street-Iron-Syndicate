// GSIS - Item Data
// Copyright (C) 2026  YeikoD
// Licencia: GNU GPL v3 o posterior (texto completo en LICENSE).

// GSIS Item Data - Catalogo de items (pesos en kg/unidad)
// Fuente: docs/gsis_INVENTORY.md

export var ITEMS = {
    // Materias primas
    "scrap_metal":   { name: "Chatarra",        weight: 0.5, type: "material" },
    "gunpowder":     { name: "Polvora",         weight: 0.2, type: "material" },
    "spring":        { name: "Muelle",          weight: 0.1, type: "material" },
    "barrel_small":  { name: "Canon corto",     weight: 0.8, type: "material" },
    "scope":         { name: "Mira",            weight: 0.3, type: "material" },
    "armor_plate":   { name: "Placa blindada",  weight: 1.5, type: "material" },

    // Componentes
    "pistol_frame":  { name: "Chasis pistola",  weight: 0.6, type: "material" },
    "pistol_barrel": { name: "Canon pistola",   weight: 0.4, type: "material" },
    "rifle_receiver":{ name: "Culata rifle",    weight: 1.2, type: "material" },
    "rifle_barrel":  { name: "Canon rifle",     weight: 1.0, type: "material" },

    // Armas de fuego (nombres = HUD GTA SA ES; IDs estables p/ saves)
    "9mm":           { name: "9mm",             weight: 1.5, type: "weapon" },
    "pistol_assembled": { name: "9mm",          weight: 1.2, type: "weapon" },
    "silenced_9mm":  { name: "Pistola con silenciador", weight: 1.5, type: "weapon" },
    "desert_eagle":  { name: "Desert Eagle",    weight: 1.8, type: "weapon" },
    "shotgun":       { name: "Escopeta",        weight: 3.0, type: "weapon" },
    "sawed_off":     { name: "Escopeta recortada", weight: 1.0, type: "weapon" },
    "combat_shotgun":{ name: "SPAS 12",         weight: 3.5, type: "weapon" },
    "micro_uzi":     { name: "Micro Uzi",       weight: 1.5, type: "weapon" },
    "mp5":           { name: "MP5",             weight: 2.5, type: "weapon" },
    "tec9":          { name: "Tec9",            weight: 1.4, type: "weapon" },
    "ak47":          { name: "AK-47",           weight: 3.5, type: "weapon" },
    "m4_assembled":  { name: "M4",              weight: 3.5, type: "weapon" },
    "country_rifle": { name: "Rifle",           weight: 2.5, type: "weapon" },
    "sniper_rifle":  { name: "Rifle de francotirador", weight: 4.0, type: "weapon" },
    "rpg":           { name: "Lanzacohetes",    weight: 7.0, type: "weapon" },
    "heat_seeker":   { name: "Lanzacohetes con atraccion al calor", weight: 6.0, type: "weapon" },
    "flamethrower":  { name: "Lanzallamas",     weight: 5.0, type: "weapon" },
    "minigun":       { name: "Minigun",         weight: 10.0, type: "weapon" },
    "body_armor":    { name: "Chaleco antibalas", weight: 2.0, type: "weapon" },

    // Cargadores (type magazine; capacity = WEAPON_DATA.clipSize via getClipSizeByItemId)
    // Instancia en inventario/baul: { id, qty:1, ammo, quality } — no se apilan
    "mag_9mm":           { name: "Cargador 9mm",             weight: 0.2, type: "magazine" },
    "mag_silenced_9mm":  { name: "Cargador 9mm con silenciador", weight: 0.2, type: "magazine" },
    "mag_desert_eagle":  { name: "Cargador Desert Eagle",    weight: 0.2, type: "magazine" },
    "mag_shotgun":       { name: "Cartucho escopeta",        weight: 0.2, type: "magazine" },
    "mag_sawed_off":     { name: "Cartucho recortada",       weight: 0.2, type: "magazine" },
    "mag_combat_shotgun":{ name: "Cartucho SPAS 12",         weight: 0.2, type: "magazine" },
    "mag_micro_uzi":     { name: "Cargador Micro Uzi",       weight: 0.2, type: "magazine" },
    "mag_mp5":           { name: "Cargador MP5",             weight: 0.2, type: "magazine" },
    "mag_tec9":          { name: "Cargador Tec9",            weight: 0.2, type: "magazine" },
    "mag_ak47":          { name: "Cargador AK-47",           weight: 0.2, type: "magazine" },
    "mag_m4_assembled":  { name: "Cargador M4",              weight: 0.2, type: "magazine" },
    "mag_country_rifle": { name: "Cartucho rifle",           weight: 0.2, type: "magazine" },
    "mag_sniper_rifle":  { name: "Cartucho francotirador",   weight: 0.2, type: "magazine" },
    "mag_rpg":           { name: "Cohete RPG",               weight: 0.5, type: "magazine" },
    "mag_heat_seeker":   { name: "Cohete heat seeker",       weight: 0.5, type: "magazine" },
    "mag_flamethrower":  { name: "Deposito flamethrower",    weight: 0.5, type: "magazine" },
    "mag_minigun":       { name: "Municion minigun",         weight: 0.5, type: "magazine" }
};

export function getItemDef(id) {
    return ITEMS[id] || null;  // Retorna definicion del item o null
}

export function getItemName(id) {
    var def = ITEMS[id];
    return def ? def.name : id;  // Retorna nombre del item o el ID
}

export function getItemWeight(id) {
    var def = ITEMS[id];
    return def ? def.weight : 0;  // Retorna peso del item o 0
}

export function getItemType(id) {
    var def = ITEMS[id];
    return def ? def.type : "material";  // Retorna tipo del item o default
}

// Nombre visible de una instancia de cargador: "Cargador 9mm - Cal: 1"
// item: { id, quality? } o id suelto (quality default 1)
export function getMagazineDisplayName(item) {
    var id = typeof item === "string" ? item : item.id;
    var def = ITEMS[id];
    if (!def) return id;
    var q = (typeof item === "object" && item.quality) ? item.quality : 1;
    return def.name + " - Cal: " + q;
}
