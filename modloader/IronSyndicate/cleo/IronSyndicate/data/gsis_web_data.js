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

// Iconos de item → PNG, en modloader\IronSyndicate\UI\assets\.
//
// EL VALOR ES UNA RUTA DENTRO DE `assets/`, NO UN NOMBRE DE ARCHIVO
// ---------------------------------------------------------------------------
// Antes el valor era el nombre pelado ("colt45.png") y la pagina prependia una
// base. El 04/10/2026 los PNG se repartieron en tres carpetas y el nombre pelado
// dejo de alcanzar:
//
//   imagenes/            los 50x50 del catalogo: cargadores, bala, reporte
//   imagenes/weapons/    los 256x256 de cada arma
//   iconos/categorias/   los botones de filtro
//
// Que el valor lleve la ruta es lo que hace que las tres convivan sin un `../`
// por item, y que agregar una cuarta carpeta sea agregar un prefijo y no cambiar
// la base de la pagina. Ver ICON_DIR en UI/app.js, que es el otro extremo del
// mismo acuerdo.
//
// LOS ESPACIOS EN LOS NOMBRES, A PROPOSITO
// ---------------------------------------------------------------------------
// "Silenced Pistol.png" y "Desert Eagle.png" tienen espacio, y `img.src` lo
// resuelve solo. No normalizar los nombres: el archivo se llama asi, y renombrar
// el arte para que el path se vea lindo es romper una convencion del set por una
// cuestion de tipo.
//
// LOS 256x256 CONVIVEN CON LOS 50x50
// ---------------------------------------------------------------------------
// La caja la fija `--table-icon-w` en el CSS con `object-fit: contain`, asi que el
// arte de 256 baja a la misma caja que el de 50 sin descuadrar la fila.
//
// QUE NO EXISTE
// ---------------------------------------------------------------------------
// `material.png` no esta. El unico arte de materiales del set es
// `iconos/categorias/materiales.png`, que es el boton de filtro, y es lo que usan
// los items de tipo `material`. Si aparece un `material.png` de verdad, es una linea.
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
// body_armor no tiene icono. satchelCharge.png estaba en la carpeta image\ vieja y no
// sobrevive al reparto del 04/10: no hay equivalente en assets\imagenes\weapons\, asi
// que el hueco del set es ahora de a uno y no de dos. Cuando WEAPON_DATA crezca un
// campo "icon", este mapa se borra y pasa a leerse de alla.
export var WEB_ICONS = {
    "colt45": "imagenes/weapons/Pistol.png",
    // Un accesorio que se compra suelto y se ve suelto. El PNG es el de la
    // pistola silenciada, que es lo que un silenciador produce.
    "suppressor": "imagenes/weapons/Silenced Pistol.png",
    "desert_eagle": "imagenes/weapons/Desert Eagle.png",
    "shotgun": "imagenes/weapons/shotgun.png",
    "sawed_off": "imagenes/weapons/Sawnoff Shotgun.png",
    "combat_shotgun": "imagenes/weapons/Combat Shotgun.png",
    "micro_uzi": "imagenes/weapons/Micro SMG.png",
    "mp5": "imagenes/weapons/SMG.png",
    "tec9": "imagenes/weapons/tec9.png",
    "ak47": "imagenes/weapons/ak47.png",
    "m4_assembled": "imagenes/weapons/m4.png",
    "country_rifle": "imagenes/weapons/Riffle.png",
    "sniper_rifle": "imagenes/weapons/Sniper Riffle.png",
    "rpg": "imagenes/weapons/Rocket.png",
    "heat_seeker": "imagenes/weapons/Heatseeker.png",
    "flamethrower": "imagenes/weapons/Flame Thrower.png",
    "minigun": "imagenes/weapons/minigun.png",

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
    "mag_colt45": "imagenes/mag_9mm.png",
    "mag_colt45_c15": "imagenes/mag_9mm.png",
    // La bala tiene arte PROPIO y no comparte con los cargadores: bullet45.png
    // es una bala, y mag_9mm.png es un cargador. Es la unica de las dos mitades de
    // la banda "Municion" que se ve distinta de la otra, y es lo que hace falta
    // para que el jugador distinga de un vistazo "esta fila se llena" de "esta fila
    // se consume".
    "bala_45": "imagenes/bullet45.png",
    "mag_ak47_drum": "imagenes/mag_fusil.png",
    "mag_m4_lancer": "imagenes/mag_fusil.png",
    "mag_m4_drum": "imagenes/mag_fusil.png",
    "mag_desert_eagle": "imagenes/mag_9mm.png",
    "mag_shotgun": "imagenes/mag_fusil.png",
    "mag_sawed_off": "imagenes/mag_fusil.png",
    "mag_combat_shotgun": "imagenes/mag_fusil.png",
    "mag_micro_uzi": "imagenes/mag_SMG.png",
    "mag_mp5": "imagenes/mag_SMG.png",
    "mag_tec9": "imagenes/mag_SMG.png",
    "mag_ak47": "imagenes/mag_fusil.png",
    "mag_m4_assembled": "imagenes/mag_fusil.png",
    "mag_country_rifle": "imagenes/mag_fusil.png",
    "mag_sniper_rifle": "imagenes/mag_fusil.png",
    "mag_rpg": "imagenes/mag_fusil.png",
    "mag_heat_seeker": "imagenes/mag_fusil.png",
    "mag_flamethrower": "imagenes/mag_fusil.png",
    "mag_minigun": "imagenes/mag_fusil.png",

    // Materiales (ITEMS type material): materias primas y componentes, la
    // chatarra (scrap_metal) entre las primeras. Solo muelle y mira tienen
    // icono propio de armas (weapons_report.png).
    "scrap_metal": "iconos/categorias/materiales.png",
    "gunpowder": "iconos/categorias/materiales.png",
    "spring": "imagenes/weapons_report.png",
    "barrel_small": "iconos/categorias/materiales.png",
    "scope": "imagenes/weapons_report.png",
    "armor_plate": "iconos/categorias/materiales.png",
    "pistol_frame": "iconos/categorias/materiales.png",
    "pistol_barrel": "iconos/categorias/materiales.png",
    "rifle_receiver": "iconos/categorias/materiales.png",
    "rifle_barrel": "iconos/categorias/materiales.png"
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
