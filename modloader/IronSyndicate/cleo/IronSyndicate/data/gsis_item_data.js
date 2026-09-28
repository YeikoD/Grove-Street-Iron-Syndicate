// GSIS - Item Data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

import { getWeaponByItemId } from "./gsis_weapon_data.js";

// GSIS Item Data - Catalogo de items (pesos en kg/unidad)
// Fuente: docs/gsis_INVENTORY.md
//
// EL CATALOGO NO LLEVA SALUD. La salud es estado de una INSTANCIA, no de un
// tipo: todas las unidades nacen a SALUD_MAX y cada una se desgasta por su
// cuenta. Ponerla aca (ITEMS[id].salud) la volveria un default por tipo, que
// es otra cosa — dos chatarras con distinta salud son el mismo
// ITEMS["scrap_metal"] — y ese default no podria expresar una instancia
// gastada mientras el resto del stack esta nueva.
//
// SALUD_MAX vive aca y no en Config porque no es un ajuste del juego: es la
// escala del dato. Config es para lo que se tunea (MISC.MAX_INVENTORY_WEIGHT,
// MISC.MAG_BELT_SLOTS). El clamp tambien va aca, junto a la escala que
// define: los dos son la misma regla y basta una fuente.
export var SALUD_MAX = 100;

export function clampSalud(v) {
    if (v === undefined || v === null) return SALUD_MAX;
    var n = Math.round(Number(v));
    if (!isFinite(n)) return SALUD_MAX;  // no es numero: queda nueva, no se inventa
    if (n < 0) return 0;
    if (n > SALUD_MAX) return SALUD_MAX;
    return n;
}

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

    // Cargadores (type magazine; capacidad = WEAPON_DATA.clipSize via getClipSizeByItemId)
    // Instancia { id, qty:1, ammo, salud } — no se apilan
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

// isInstanced — true si el item NO se apila: cada unidad es una fila con su
// propio estado. Un cargador (type magazine) siempre, y un arma solo si tiene
// weaponId, o sea una de las de catalogo equipables.
//
// Vive en la capa de datos, no en gsis_Items.js, porque NO es una regla de
// guardado: es una pregunta del catalogo —"¿esta entrada se cuenta de a uno?"—
// y la responden tanto el modulo (que guarda una fila por unidad) como la fila
// de la tabla (que tiene que decir "instanciado" y no "1 unidad" para un arma,
// y al reves para una sola chatarra). gsis_Items.js la re-exporta para los que
// ya la importaban de ahi; los dos caminos son el mismo codigo.
//
// El que la consulta tiene que ser el mismo en todas partes porque de eso
// depende que las cosas se multipliquen o no: el baul la usa para saber si "3"
// son tres filas o tres unidades de un apilado, y el modulo para saber si una
// fila con qty > 1 hay que partirla.
export function isInstanced(id) {
    var def = ITEMS[id];
    if (!def) return false;  // id fuera de catalogo: no hay nada que contar
    if (def.type === "magazine") return true;
    if (def.type !== "weapon") return false;  // material: se apila
    var wd = getWeaponByItemId(id);
    return !!(wd && wd.weaponId !== null && wd.weaponId !== undefined);
}

// No hay getMagazineDisplayName. Antes el nombre del cargador llevaba el estado
// pegado ("Cargador 9mm - Cal: 1"): la salud vive en su propia columna
// (celdaSalud, UI/app.js) y en el tooltip de la fila (tipFor, gsis_ItemRow.js).
// Un nombre con estado dentro se desincroniza del dato —el mismo cargador se
// llama distinto segun cuando se lea— y la fila y su tooltip tienen que decir
// lo mismo. El nombre es el nombre: getItemName.
