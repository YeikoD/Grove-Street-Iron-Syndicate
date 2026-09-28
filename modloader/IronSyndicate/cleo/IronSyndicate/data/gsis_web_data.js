// GSIS - Web Data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Web Data - datos estaticos que la pagina web no puede deducir
//
// Solo lo que la pagina no tiene y no puede calcular: la pagina no importa
// data/ ni modules/, no tiene el juego y no conoce el catalogo.
//
// NO va aca el peso, los nombres ni los tipos de los items: eso sale de
// Config.MISC y de gsis_item_data.js, y lo snapshotya gsis_InventorySerialization.js. Si
// algo aparece dos veces, la pagina deja de ser la fuente y el catalogo
// empieza a divergir en silencio (es lo que pasaba con el mapa de iconos que
// vivia en app.js).
// ============================================================================

// Iconos de item → PNG en modloader\IronSyndicate\image\.
//
// Son 45 ids en tres bloques: 18 de armas, 17 de cargadores y 10 de materiales.
// Cada id tiene su linea igual: cuando un item tenga arte propio lo unico que se
// cambia es el valor de esa linea, no el mapa.
//
// El bloque de cargadores sigue el orden de WEAPON_DATA y el id del cargador es
// mag_<id del arma> (WEAPON_DATA.magId), asi que el PNG que le corresponda a un
// arma se cambia aca y en ningun otro lado. El arte viene por categoria de
// WEAPON_DATA: pistolas (mag_9mm.png), subfusiles (mag_SMG.png) y el resto
// (mag_fusil.png, el curvo). Cuando una categoria tenga arte propio, se agrega
// el PNG y se cambia el valor de las lineas de esa categoria.
//
// body_armor no tiene icono. satchelCharge.png existe en image\ pero no
// corresponde a ningun item del catalogo: son los dos huecos conocidos del set.
// Cuando WEAPON_DATA crezca un campo "icon", este mapa se borra y pasa a leerse
// de alla.
export var WEB_ICONS = {
    "9mm": "9mm.png",
    // La variante se ve igual que la 9mm normal: el .asi todavia no registra
    // modelos propios, asi que el icono es el mismo. Cuando exista el .dff de la
    // Glock extendida, aca va su propio PNG.
    "9mm_ext": "9mm.png",
    "pistol_assembled": "9mm.png",
    "silenced_9mm": "silenced9mm.png",
    "desert_eagle": "desertEagle.png",
    "shotgun": "shotgun.png",
    "sawed_off": "sawnoffShotgun.png",
    "combat_shotgun": "combatShotgun.png",
    "micro_uzi": "microSMG-Uzi.png",
    "mp5": "mp5.png",
    "tec9": "tec9.png",
    "ak47": "ak47.png",
    "m4_assembled": "m4.png",
    "country_rifle": "countryRifle.png",
    "sniper_rifle": "sniperRifle.png",
    "rpg": "rpg.png",
    "heat_seeker": "hsRocket.png",
    "flamethrower": "flame-Thrower.png",
    "minigun": "minigun.png",

    // Cargadores (ITEMS type magazine), en el mismo orden que WEAPON_DATA. Un
    // cargador por linea: el PNG propio de un arma se cambia aca y en ningun
    // otro lado. El PNG sale de la categoria del arma en WEAPON_DATA: los tres
    // primeros son pistolas, los tres siguientes subfusiles.
    "mag_9mm": "mag_9mm.png",
    "mag_9mm_ext": "mag_9mm.png",
    "mag_silenced_9mm": "mag_9mm.png",
    "mag_desert_eagle": "mag_9mm.png",
    "mag_shotgun": "mag_fusil.png",
    "mag_sawed_off": "mag_fusil.png",
    "mag_combat_shotgun": "mag_fusil.png",
    "mag_micro_uzi": "mag_SMG.png",
    "mag_mp5": "mag_SMG.png",
    "mag_tec9": "mag_SMG.png",
    "mag_ak47": "mag_fusil.png",
    "mag_m4_assembled": "mag_fusil.png",
    "mag_country_rifle": "mag_fusil.png",
    "mag_sniper_rifle": "mag_fusil.png",
    "mag_rpg": "mag_fusil.png",
    "mag_heat_seeker": "mag_fusil.png",
    "mag_flamethrower": "mag_fusil.png",
    "mag_minigun": "mag_fusil.png",

    // Materiales (ITEMS type material): materias primas y componentes, la
    // chatarra (scrap_metal) entre las primeras. Solo muelle y mira tienen
    // icono propio de armas (weapons_report.png).
    "scrap_metal": "material.png",
    "gunpowder": "material.png",
    "spring": "weapons_report.png",
    "barrel_small": "material.png",
    "scope": "weapons_report.png",
    "armor_plate": "material.png",
    "pistol_frame": "material.png",
    "pistol_barrel": "material.png",
    "rifle_receiver": "material.png",
    "rifle_barrel": "material.png"
};

// Orden de las bandas de grupo de la tabla. Es el mismo orden que usaba el menu
// de baul de la etapa anterior: primero las armas, despues los cargadores, despues
// los materiales.
//
// Es el unico lugar donde el orden se decide. Los TIPOS salen de
// gsis_item_data.js (ITEMS[id].type); esta lista solo los ordena y les pone
// nombre. snapCatalog() la cruza contra el catalogo y avisa si aparece un tipo
// que no este aca, para que el desajuste se vea en el log y no en pantalla.
export var WEB_CAT_ORDER = ["weapon", "magazine", "material"];

// Nombre visible de cada banda. Mismo criterio: la clave tiene que existir en
// ITEMS, el nombre es de la pagina.
export var WEB_CAT_LABELS = {
    weapon: "Armas",
    magazine: "Cargadores",
    material: "Materiales"
};
