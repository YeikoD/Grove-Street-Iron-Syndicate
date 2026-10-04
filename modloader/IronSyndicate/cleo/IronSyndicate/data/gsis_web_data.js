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
    "colt45": "colt45.png",
    // Un accesorio que se compra suelto y se ve suelto. El PNG es el de la
    // pistola silenciada, que es lo que un silenciador produce.
    "suppressor": "silenced9mm.png",
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
    //
    // LA CLAVE ES EL ID Y HACE FALTA QUE SEA EL DE HOY
    // -----------------------------------------------------------------------
    // Aca estaba `mag_colt45_15`, que es el nombre que tuvo el cargador de 15
    // balas antes de que se llamara `mag_colt45_c15`. Una linea con un id que no
    // esta en ITEMS no da error: la pagina pide el icono, no lo encuentra, y
    // `iconCell` pinta un slot VACIO. Es el fallo mas barato de ver y el mas
    // dificil de causalizar, porque no hay ni un error en ningun log.
    //
    // LOS DOS CARGADORES COMPARTEN EL MISMO PNG, Y NO ES UNA CONFUSION
    // -----------------------------------------------------------------------
    // Los dos son cargadores de pistola de 9mm y el juego tiene un solo sprite de
    // eso. Lo que los distingue son el NOMBRE ("Cargador Colt 45" y "Cargador Colt
    // 45 Extended") y la columna de municion, que el modulo pinta como "8/8" y
    // "15/15" desde `clipSize`. Ese es el par de datos que ya diferencia dos
    // cargadores del mismo tipo en la mochila —el vacio y el lleno—, asi que no es
    // un caso nuevo: es el caso que ya estaba resuelto.
    //
    // Habia un PNG propio para el Extended, derivado del mismo sprite coloreado en
    // ambar, y se fue: con el nombre y el "15/15" al lado, el color repetia lo que
    // el texto ya dice y un cargador distinto para el mismo municion es una pieza
    // que el juego no tiene.
    "mag_colt45": "mag_9mm.png",
    "mag_colt45_c15": "mag_9mm.png",
    // La bala tiene arte PROPIO y no comparte con los cargadores: bullet45.png
    // es una bala, y mag_9mm.png es un cargador. Es la unica de las dos mitades de
    // la banda "Municion" que se ve distinta de la otra, y es lo que hace falta
    // para que el jugador distinga de un vistazo "esta fila se llena" de "esta fila
    // se consume".
    "bala_45": "bullet45.png",
    "mag_ak47_drum": "mag_fusil.png",
    "mag_m4_lancer": "mag_fusil.png",
    "mag_m4_drum": "mag_fusil.png",
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
//
// "weapon_attachment" va despues de los cargadores y antes de los materiales: es
// una pieza que se monta sobre un arma, asi que junto a las armas tiene mas
// sentido que al final, y antes de los materiales porque no lo es.
export var WEB_CAT_ORDER = ["weapon", "magazine", "weapon_attachment", "material"];

// Nombre visible de cada banda. Mismo criterio: la clave tiene que existir en
// ITEMS, el nombre es de la pagina.
export var WEB_CAT_LABELS = {
    weapon: "Armas",
    // La banda de los cargadores se llama MUNICION porque ahora tiene las dos
    // mitades: las piezas con sus balas y la bala suelta que las llena. El nombre
    // viejo mentia en la direccion contraria —decia "cargadores" y habia balas— y
    // el nuevo es el que describe lo que el jugador ve en la banda.
    //
    // SIN ACENTO, y no por descuido. Las otras tres bandas son "Armas", "Accesorios"
    // y "Materiales", y ninguna lo necesita: el acento aqui seria el unico acento
    // de una lista de cinco palabras que de otro modo es toda ASCII, y el titulo de
    // una banda no es el lugar donde se prueba la ortografia. Si alguna vez se
    // escribe "Munición", el cambio es este string y nada mas.
    magazine: "Municion",
    weapon_attachment: "Accesorios",
    material: "Materiales"
};
