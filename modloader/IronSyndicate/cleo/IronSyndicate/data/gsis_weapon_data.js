// GSIS - Weapon Data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// GSIS Weapon Data - Armas de fuego de GTA SA (stats y IDs reales del juego)
// Fuentes: SA-MP/open.mp (weaponId, modelId, clip), gtabase.com (damage/fireRate/range/accuracy),
//          gta.fandom.com/es (nombres HUD ES), gtabase (realWorldName)
// isLong: arma larga (escopeta completa, fusil, pesada) → habilita Bag si hay >=1 en inventario
// magId: cargador (ITEMS type magazine) que consume esa arma al recargar

export const WEAPON_DATA = [
    // Pistolas
    {
        itemId: "9mm",
        magId: "mag_9mm",
        name: "9mm",
        weaponId: 22,
        modelId: 346,
        slot: 2,
        clipSize: 17,
        damage: 25,
        fireRate: 20,
        range: 30,
        reloadTime: null,
        accuracy: 25,
        ammoType: "9mm Parabellum",
        category: "Pistolas",
        realWorldName: "Colt M1911A1",
        weight: 1.5,
        isLong: false,
        price: 400
    },
    {
        itemId: "pistol_assembled",
        magId: "mag_9mm",
        name: "9mm",
        weaponId: 22,
        modelId: 346,
        slot: 2,
        clipSize: 17,
        damage: 25,
        fireRate: 20,
        range: 30,
        reloadTime: null,
        accuracy: 25,
        ammoType: "9mm Parabellum",
        category: "Pistolas",
        realWorldName: "Colt M1911A1",
        weight: 1.2,
        isLong: false,
        price: 0
    },
    {
        itemId: "silenced_9mm",
        magId: "mag_silenced_9mm",
        name: "Pistola con silenciador",
        weaponId: 23,
        modelId: 347,
        slot: 2,
        clipSize: 17,
        damage: 40,
        fireRate: 25,
        range: 30,
        reloadTime: null,
        accuracy: 16,
        ammoType: "9mm Parabellum",
        category: "Pistolas",
        realWorldName: "Colt M1911A1 con silenciador",
        weight: 1.5,
        isLong: false,
        price: 600
    },
    {
        itemId: "desert_eagle",
        magId: "mag_desert_eagle",
        name: "Desert Eagle",
        weaponId: 24,
        modelId: 348,
        slot: 2,
        clipSize: 7,
        damage: 70,
        fireRate: 10,
        range: 30,
        reloadTime: null,
        accuracy: 10,
        ammoType: ".357 Magnum",
        category: "Pistolas",
        realWorldName: "IMI Desert Eagle",
        weight: 1.8,
        isLong: false,
        price: 900
    },

    // Escopetas
    {
        itemId: "shotgun",
        magId: "mag_shotgun",
        name: "Escopeta",
        weaponId: 25,
        modelId: 349,
        slot: 3,
        clipSize: 1,
        damage: 130,
        fireRate: 10,
        range: 40,
        reloadTime: null,
        accuracy: 40,
        ammoType: "calibre 12",
        category: "Escopetas",
        realWorldName: "Ithaca 37",
        weight: 3.0,
        isLong: true,
        price: 1000
    },
    {
        itemId: "sawed_off",
        magId: "mag_sawed_off",
        name: "Escopeta recortada",
        weaponId: 26,
        modelId: 350,
        slot: 3,
        clipSize: 2,
        damage: 130,
        fireRate: 60,
        range: 30,
        reloadTime: null,
        accuracy: 10,
        ammoType: "calibre 12",
        category: "Escopetas",
        realWorldName: "Colt Model 1883 Hammerless Shotgun",
        weight: 1.0,
        isLong: false,
        price: 800
    },
    {
        itemId: "combat_shotgun",
        magId: "mag_combat_shotgun",
        name: "SPAS 12",
        weaponId: 27,
        modelId: 351,
        slot: 3,
        clipSize: 7,
        damage: 120,
        fireRate: 30,
        range: 40,
        reloadTime: null,
        accuracy: 20,
        ammoType: "calibre 12",
        category: "Escopetas",
        realWorldName: "Franchi SPAS-12",
        weight: 3.5,
        isLong: true,
        price: 1500
    },

    // Subfusiles
    {
        itemId: "micro_uzi",
        magId: "mag_micro_uzi",
        name: "Micro Uzi",
        weaponId: 28,
        modelId: 352,
        slot: 4,
        clipSize: 30,
        damage: 20,
        fireRate: 65,
        range: 30,
        reloadTime: null,
        accuracy: 15,
        ammoType: "9mm Parabellum",
        category: "Subfusiles",
        realWorldName: "Micro Uzi",
        weight: 1.5,
        isLong: false,
        price: 700
    },
    {
        itemId: "mp5",
        magId: "mag_mp5",
        name: "MP5",
        weaponId: 29,
        modelId: 353,
        slot: 4,
        clipSize: 30,
        damage: 25,
        fireRate: 50,
        range: 40,
        reloadTime: null,
        accuracy: 15,
        ammoType: "9mm Parabellum",
        category: "Subfusiles",
        realWorldName: "MP5A3",
        weight: 2.5,
        isLong: false,
        price: 1200
    },
    {
        itemId: "tec9",
        magId: "mag_tec9",
        name: "Tec9",
        weaponId: 32,
        modelId: 372,
        slot: 4,
        clipSize: 30,
        damage: 20,
        fireRate: 60,
        range: 30,
        reloadTime: null,
        accuracy: 15,
        ammoType: "9mm Parabellum",
        category: "Subfusiles",
        realWorldName: "TEC-9",
        weight: 1.4,
        isLong: false,
        price: 600
    },

    // Fusiles de asalto
    {
        itemId: "ak47",
        magId: "mag_ak47",
        name: "AK-47",
        weaponId: 30,
        modelId: 355,
        slot: 5,
        clipSize: 30,
        damage: 30,
        fireRate: 60,
        range: 70,
        reloadTime: null,
        accuracy: 6,
        ammoType: "7.62×39mm",
        category: "Fusiles de asalto",
        realWorldName: "Norinco Type 56",
        weight: 3.5,
        isLong: true,
        price: 2500
    },
    {
        itemId: "m4_assembled",
        magId: "mag_m4_assembled",
        name: "M4",
        weaponId: 31,
        modelId: 356,
        slot: 5,
        clipSize: 50,
        damage: 30,
        fireRate: 60,
        range: 90,
        reloadTime: null,
        accuracy: 20,
        ammoType: "5.56×45mm NATO",
        category: "Fusiles de asalto",
        realWorldName: "Colt Model 733",
        weight: 3.5,
        isLong: true,
        price: 3000
    },

    // Rifles
    {
        itemId: "country_rifle",
        magId: "mag_country_rifle",
        name: "Rifle",
        weaponId: 33,
        modelId: 357,
        slot: 6,
        clipSize: 1,
        damage: 75,
        fireRate: 20,
        range: 100,
        reloadTime: null,
        accuracy: 100,
        ammoType: ".30-30 Winchester",
        category: "Rifles",
        realWorldName: "Marlin Model 336",
        weight: 2.5,
        isLong: true,
        price: 2000
    },
    {
        itemId: "sniper_rifle",
        magId: "mag_sniper_rifle",
        name: "Rifle de francotirador",
        weaponId: 34,
        modelId: 358,
        slot: 6,
        clipSize: 1,
        damage: 125,
        fireRate: 20,
        range: 100,
        reloadTime: null,
        accuracy: 100,
        ammoType: "7.62×51mm",
        category: "Rifles",
        realWorldName: "Remington Model 700",
        weight: 4.0,
        isLong: true,
        price: 4500
    },

    // Artilleria pesada
    {
        itemId: "rpg",
        magId: "mag_rpg",
        name: "Lanzacohetes",
        weaponId: 35,
        modelId: 359,
        slot: 7,
        clipSize: 1,
        damage: 75,
        fireRate: null,
        range: 55,
        reloadTime: null,
        accuracy: null,
        ammoType: "Cohete PG-7",
        category: "Artilleria pesada",
        realWorldName: "RPG-7",
        weight: 7.0,
        isLong: true,
        price: 8000
    },
    {
        itemId: "heat_seeker",
        magId: "mag_heat_seeker",
        name: "Lanzacohetes con atraccion al calor",
        weaponId: 36,
        modelId: 360,
        slot: 7,
        clipSize: 1,
        damage: 75,
        fireRate: null,
        range: 55,
        reloadTime: null,
        accuracy: null,
        ammoType: "Misil guiado",
        category: "Artilleria pesada",
        realWorldName: "SA-7 Grail",
        weight: 6.0,
        isLong: true,
        price: 10000
    },
    {
        itemId: "flamethrower",
        magId: "mag_flamethrower",
        name: "Lanzallamas",
        weaponId: 37,
        modelId: 361,
        slot: 7,
        clipSize: 500,
        damage: 25,
        fireRate: null,
        range: 5,
        reloadTime: null,
        accuracy: null,
        ammoType: "Napalm",
        category: "Artilleria pesada",
        realWorldName: "Lanzallamas M2",
        weight: 5.0,
        isLong: true,
        price: 6000
    },
    {
        itemId: "minigun",
        magId: "mag_minigun",
        name: "Minigun",
        weaponId: 38,
        modelId: 362,
        slot: 7,
        clipSize: 500,
        damage: 140,
        fireRate: 100,
        range: 75,
        reloadTime: null,
        accuracy: 100,
        ammoType: "7.62×51mm NATO",
        category: "Artilleria pesada",
        realWorldName: "M134 Minigun",
        weight: 10.0,
        isLong: true,
        price: 15000
    },

    // Armadura (type weapon en ITEMS, sin weaponId)
    {
        itemId: "body_armor",
        magId: null,
        name: "Chaleco antibalas",
        weaponId: null,
        modelId: 373,
        slot: null,
        clipSize: null,
        damage: null,
        fireRate: null,
        range: null,
        reloadTime: null,
        accuracy: null,
        ammoType: null,
        category: "Armadura",
        realWorldName: "Chaleco balistico",
        weight: 2.0,
        isLong: false,
        price: 2000
    }
];

// Helper: arma por itemId del catalogo ITEMS
export function getWeaponByItemId(itemId) {
    var weapon = WEAPON_DATA.find(function(w) { return w.itemId === itemId; });
    return weapon || null;
}

// Helper: cargador (itemId mag_*) del arma equipada, por weaponId del juego.
// Usado por Ballistic en la recarga (22 → "mag_9mm"). null si el arma no tiene cargador.
export function getMagIdByWeaponId(weaponId) {
    if (weaponId === null || weaponId === undefined) return null;
    var weapon = WEAPON_DATA.find(function(w) { return w.weaponId === weaponId; });
    return (weapon && weapon.magId) || null;
}

// Helper: capacidad de cargador (clipSize vanilla Std) por itemId de item o mag_*
// "mag_9mm" → strip "mag_" → "9mm" → clipSize. null si no hay arma/clip.
export function getClipSizeByItemId(itemId) {
    if (!itemId) return null;
    var base = itemId;
    if (itemId.indexOf("mag_") === 0) base = itemId.slice(4);
    var weapon = getWeaponByItemId(base);
    if (!weapon || weapon.clipSize === null || weapon.clipSize === undefined) return null;
    return weapon.clipSize;
}

// Helper: precio de venta mayorista (0 si no existe)
export function getWeaponPrice(itemId) {
    var weapon = getWeaponByItemId(itemId);
    return weapon ? (weapon.price || 0) : 0;
}

// Helper: valor de mercado para trueque (0 si no existe)
// sellPrice = price * 0.6 redondeado a multiplos de 10
export function getSellPrice(itemId) {
    var weapon = getWeaponByItemId(itemId);
    if (!weapon || !weapon.price) return 0;
    return Math.round((weapon.price * 0.6) / 10) * 10;
}

// Helper: true si el itemId es arma larga (para habilitar Bag)
export function isLongWeapon(itemId) {
    var weapon = getWeaponByItemId(itemId);
    return !!(weapon && weapon.isLong);
}

// Helper: true si el inventario ([{id, qty}]) tiene al menos 1 arma larga
export function hasLongWeapon(items) {
    if (!items || !items.length) return false;
    for (var i = 0; i < items.length; i++) {
        if (isLongWeapon(items[i].id)) return true;
    }
    return false;
}
