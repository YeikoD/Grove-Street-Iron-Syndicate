// GSIS - Weapons
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Que armas existen, que piezas se les pueden montar, y que weaponType ejecuta
// cada configuracion. Es la UNICA fuente de esas tres cosas: el precio que paga
// el armero, el icono que muestra la UI, la capacidad que valida el .asi y la
// fila que el jugador ve en el collar salen TODOS de aca.
//
// Antes eran dos archivos con dos modelos distintos de la misma idea, y esa
// duplicacion era la que producia los bugs:
//
//   gsis_weapon_variants.js   familia + accesorios -> weaponType  (el nuevo)
//   gsis_weapon_data.js       cada fila es un weaponId              (el viejo)
//
// Los dos estaban vivos al mismo tiempo. 15 de las 16 armas NO tenian familia, asi
// que nunca pasaban por el resolver, y `wd.weaponId` seguia siendo la identidad
// por un lado mientras `family + attachments` lo era por el otro. De ahi salian
// las cuatro respuestas distintas a "que tipo tiene el ped en la mano". Ver
// modules/weapons/ tras la fase 3.
//
// ============================================================================
// EL MODELO, EN UNA FRASE
// ============================================================================
//   FAMILIA     la identidad. Un item de inventario. "colt45".
//   ACCESORIO   una pieza compatible. Va suelto en el inventario.
//   VARIANTE    la combinacion resuelta a un weaponType que el motor ejecuta.
//
// Y el estado de un arma es la familia mas la lista de accesorios montados.
// Montar o sacar un accesorio NO crea ni destruye el item: recalcula el tipo.
//
// ============================================================================
// LA REGLA QUE ORDENA EL RESTO
// ============================================================================
//   accesorios -> determinan la variante -> la variante determina el weaponType
//   -> el weaponType determina las propiedades tecnicas que ve el motor.
//
// La ultima flecha NO es de este archivo. La cumple el .asi: gsisWeaponLimiter
// clona la CWeaponInfo del padre y escribe el cargador, el modelo y el damage de
// cada variante que declara en gsis_weapons.dat. El mod no escribe nunca
// m_nAmmoClip; lee la capacidad con core/gsis_Engine.js clipCapacityOf().
//
// Por eso `clipSize` y `modelId` en las tablas de abajo son DECLARATIVOS: son
// el numero que deberia estar en el .dat, y estan para que se pueda comparar
// contra el. Si divergen, el validador lo dice antes de que un jugador lo note.
//
// ============================================================================
// QUE NO SABE ESTE ARCHIVO
// ============================================================================
// No importa nada. Sin imports, sin log, sin natives, sin GameState. Se puede
// leer entero y entender entero sin saber nada del resto del mod, que es
// justamente lo que se le pedia a la capa de datos.
// ============================================================================

// ============================================================================
// EL RANGO DE TIPOS
// ============================================================================
// MEDIDO contra la sonda en vivo (docs/gsis_WEAPONS_tabla_medida.txt):
//
//   0..46   armas de vanilla, el motor las consulta de verdad
//   47..59  pseudo-tipos internos del juego (48 ARMOUR, 49 RAMMEDBYCAR,
//           51 EXPLOSION, 53 DROWNING, 54 FALL, 58 FLARE, 59 TANK_GRENADE...)
//   60..79  libre, y es DONDE VIVEN los tipos de este archivo
//
// 60..79 esta libre SOLO porque fastman92 limit adjuster esta apagado
// (fastman92limitAdjuster.asi.off). Con FLA prendido, 60 y 61 pasan a ser
// JETPACK_TYPE y BINOCULARS_TYPE, y 70..79 caen fuera de
// NumberOfWeaponTypes = 70. Es una precondicion del mod entero.
//
// Y 22..32 es el rango de padres porque GetSkillStatIndex (0x743CD0) devuelve
// -1 para todo lo que este fuera: un padre sin skills no sube de nivel nunca.
// ----------------------------------------------------------------------------
export var PLUGIN_TYPE_MIN = 60;
export var PLUGIN_TYPE_MAX = 79;
export var VANILLA_PARENT_MIN = 22;
export var VANILLA_PARENT_MAX = 32;

// El ultimo arma real de vanilla. Todo weaponType por encima es de un plugin.
// El 69 es el ultimo id que reserva FLA, no el ultimo arma: por eso la regla
// ">69" sola no alcanza y el rango 60..79 se comprueba aparte.
export var WEAPON_ID_NATIVE_MAX = 69;

// Techo del weaponId de GTA. Un .asi puede dar de alta hasta aca, y el rango
// util es mucho mas chico: es el array g_tipos del limiter.
export var WEAPON_ID_MAX = 255;

// ============================================================================
// FAMILIAS - la identidad
// ============================================================================
// Un family es un family. NO es un item: es la clase de cosa a la que se le
// enganchan accesorios. Y NO tiene weaponType: el tipo se deriva, y por eso
// ningun modulo lo persiste.
//
//   family        id estable. Va en los saves. NO cambiar nunca.
//   itemId        el item de inventario que la representa. Una familia, un item.
//   baseVariant   el weaponType de la familia pelada. SIEMPRE de plugin, porque
//                 el tipo de vanilla no sirve: trae la capacidad del juego, que
//                 no es la de este mod (el 22 trae 17 y la Colt de GSIS es de 8).
//   slot          WEAPONSLOT. El MISMO para todas las variantes de la familia:
//                 el motor tiene un CWeapon por slot y un accesorio no mueve el
//                 arma de slot, cambia como se ejecuta.
//   baseClip      capacidad de la variante base. DECLARATIVO, vease arriba.
//   damage, fireRate, range, accuracy, ammoType
//                 lo que el dealer y la UI muestran. NO son entradas de runtime:
//                 el motor tiene su propio damage en la CWeaponInfo y el mod no
//                 lo escribe. Si someday el mod alterara el dano de verdad, eso
//                 seria otra capa, y seria de las dos mitades del .asi.
//   price         lo que sale del armero. Ver WeaponDealer.
//   weight, isLong, category, realWorldName
//                 inventario y UI.
// ----------------------------------------------------------------------------
//
// FAMILIA colt45: la unica con varias configuraciones, y la unica con tipo
// propio para la base. El 22 de vanilla queda 100% vanilla: es la pistola de
// siempre, y el 23 tambien, que es la silenciada y se usa de PADRE para el 60 y
// el 61. Registrar cualquiera de los dos en el .dat haria que HookGetWeaponInfo
// devolviera filas de GSIS para un arma que el motor consulta de verdad.
export var WEAPON_FAMILIES = [
    {
        family: "colt45", itemId: "colt45", name: "Colt .45",
        baseVariant: 63, slot: 2, baseClip: 8,
        damage: 25, fireRate: 20, range: 30, accuracy: 25, ammoType: ".45 ACP",
        category: "Pistolas", realWorldName: "Colt M1911A1",
        weight: 1.5, isLong: false, price: 550
    },
    {
        family: "desert_eagle", itemId: "desert_eagle", name: "Desert Eagle",
        baseVariant: 24, slot: 2, baseClip: 7,
        damage: 70, fireRate: 10, range: 30, accuracy: 10, ammoType: ".357 Magnum",
        category: "Pistolas", realWorldName: "IMI Desert Eagle",
        weight: 1.8, isLong: false, price: 1950
    },
    {
        family: "shotgun", itemId: "shotgun", name: "Escopeta",
        baseVariant: 25, slot: 3, baseClip: 1,
        damage: 130, fireRate: 10, range: 40, accuracy: 40, ammoType: "calibre 12",
        category: "Escopetas", realWorldName: "Ithaca 37",
        weight: 3, isLong: true, price: 450
    },
    {
        family: "sawed_off", itemId: "sawed_off", name: "Escopeta recortada",
        baseVariant: 26, slot: 3, baseClip: 2,
        damage: 130, fireRate: 60, range: 30, accuracy: 10, ammoType: "calibre 12",
        category: "Escopetas", realWorldName: "Colt Model 1883 Hammerless Shotgun",
        weight: 1, isLong: false, price: 500
    },
    {
        family: "combat_shotgun", itemId: "combat_shotgun", name: "SPAS 12",
        baseVariant: 27, slot: 3, baseClip: 7,
        damage: 120, fireRate: 30, range: 40, accuracy: 20, ammoType: "calibre 12",
        category: "Escopetas", realWorldName: "Franchi SPAS-12",
        weight: 3.5, isLong: true, price: 3100
    },
    {
        family: "micro_uzi", itemId: "micro_uzi", name: "Micro Uzi",
        baseVariant: 28, slot: 4, baseClip: 30,
        damage: 20, fireRate: 65, range: 30, accuracy: 15, ammoType: "9mm Parabellum",
        category: "Subfusiles", realWorldName: "Micro Uzi",
        weight: 1.5, isLong: false, price: 1900
    },
    {
        family: "mp5", itemId: "mp5", name: "MP5",
        baseVariant: 29, slot: 4, baseClip: 30,
        damage: 25, fireRate: 50, range: 40, accuracy: 15, ammoType: "9mm Parabellum",
        category: "Subfusiles", realWorldName: "MP5A3",
        weight: 2.5, isLong: false, price: 800
    },
    {
        family: "tec9", itemId: "tec9", name: "Tec9",
        baseVariant: 32, slot: 4, baseClip: 30,
        damage: 20, fireRate: 60, range: 30, accuracy: 15, ammoType: "9mm Parabellum",
        category: "Subfusiles", realWorldName: "TEC-9",
        weight: 1.4, isLong: false, price: 600
    },
    {
        family: "ak47", itemId: "ak47", name: "AK-47",
        baseVariant: 30, slot: 5, baseClip: 30,
        damage: 30, fireRate: 60, range: 70, accuracy: 6, ammoType: "7.62├Ч39mm",
        category: "Fusiles de asalto", realWorldName: "Norinco Type 56",
        weight: 3.5, isLong: true, price: 950
    },
    {
        family: "m4", itemId: "m4_assembled", name: "M4",
        baseVariant: 31, slot: 5, baseClip: 30,
        damage: 30, fireRate: 60, range: 90, accuracy: 20, ammoType: "5.56├Ч45mm NATO",
        category: "Fusiles de asalto", realWorldName: "Colt Model 733",
        weight: 3.5, isLong: true, price: 1100
    },
    {
        family: "country_rifle", itemId: "country_rifle", name: "Rifle",
        baseVariant: 33, slot: 6, baseClip: 1,
        damage: 75, fireRate: 20, range: 100, accuracy: 100, ammoType: ".30-30 Winchester",
        category: "Rifles", realWorldName: "Marlin Model 336",
        weight: 2.5, isLong: true, price: 850
    },
    {
        family: "sniper_rifle", itemId: "sniper_rifle", name: "Rifle de francotirador",
        baseVariant: 34, slot: 6, baseClip: 1,
        damage: 125, fireRate: 20, range: 100, accuracy: 100, ammoType: "7.62├Ч51mm",
        category: "Rifles", realWorldName: "Remington Model 700",
        weight: 4, isLong: true, price: 2500
    },
    {
        family: "rpg", itemId: "rpg", name: "Lanzacohetes",
        baseVariant: 35, slot: 7, baseClip: 1,
        damage: 75, fireRate: null, range: 55, accuracy: null, ammoType: "Cohete PG-7",
        category: "Artilleria pesada", realWorldName: "RPG-7",
        weight: 7, isLong: true, price: 6500
    },
    {
        family: "heat_seeker", itemId: "heat_seeker", name: "Lanzacohetes con atraccion al calor",
        baseVariant: 36, slot: 7, baseClip: 1,
        damage: 75, fireRate: null, range: 55, accuracy: null, ammoType: "Misil guiado",
        category: "Artilleria pesada", realWorldName: "SA-7 Grail",
        weight: 6, isLong: true, price: 11000
    },
    {
        family: "flamethrower", itemId: "flamethrower", name: "Lanzallamas",
        baseVariant: 37, slot: 7, baseClip: 500,
        damage: 25, fireRate: null, range: 5, accuracy: null, ammoType: "Napalm",
        category: "Artilleria pesada", realWorldName: "Lanzallamas M2",
        weight: 5, isLong: true, price: 7500
    },
    {
        family: "minigun", itemId: "minigun", name: "Minigun",
        baseVariant: 38, slot: 7, baseClip: 500,
        damage: 140, fireRate: 100, range: 75, accuracy: 100, ammoType: "7.62├Ч51mm NATO",
        category: "Artilleria pesada", realWorldName: "M134 Minigun",
        weight: 10, isLong: true, price: 15000
    }
];

// ============================================================================
// ACCESORIOS - piezas compatibles
// ============================================================================
// Un accesorio NO es un arma. No tiene modelo 3D propio, no se equipa solo, y no
// tiene weaponType: se monta sobre una familia que lo acepte, y ESO es lo que
// cambia el tipo.
//
//   id                 id del item de inventario. Va en los saves.
//   type               "magazine" | "weapon_attachment". Son el mismo sistema:
//                      la unica diferencia es que el cargador aporta capacidad.
//   compatibleFamilies familias que lo aceptan
//   clipSize           capacidad que aporta. OBLIGATORIO en un cargador, sin
//                      excepcion. Para el silenciador es null, y "null" quiere
//                      decir "no cambia la capacidad", no "que no se sabe".
//   needsVariant       SI al montarlo el motor tiene que ejecutar algo DISTINTO.
//                      false = el motor ejecuta exactamente lo mismo con el
//                      accesorio que sin el, y entonces no hace falta un
//                      weaponType propio: resuelve a la variante base.
//                      true  = hace falta fila en el .dat, o la combinacion no
//                      existe.
//
// price, weight      economia e inventario.
//
// `needsVariant` NO se deduce de `clipSize` en el momento de resolver: se
// DECLARA. La diferencia es que un cargador con la misma capacidad que la
// familia no necesita tipo (montar el mag_ak47 sobre un AK-47 de 30 deja un
// AK-47 de 30), mientras que un silenciador siempre necesita, porque cambia el
// modelo y el sonido aunque no cambie una sola bala. Y esa ultima diferencia no
// sale de ningun numero: sale de que el silenciador exista.
// ----------------------------------------------------------------------------
//
// POR QUE UN CARGADOR CON LA MISMA CAPACIDAD QUE LA FAMILIA NO GENERA TIPO NUEVO
// El motor ejecuta lo mismo si el cargador tiene las mismas balas que el arma.
// Montar el mag_ak47 (30) sobre un AK-47 (30) no cambia una sola propiedad que
// el motor vea, asi que no necesita un weaponType propio: el accesorio queda
// montado en el registro y el arma sigue siendo la misma. Solo los cargadores
// que CAMBIAN la capacidad necesitan fila en el .dat, y son cuatro en todo el
// catalogo (ver pendingPluginTypes).
export var WEAPON_ATTACHMENTS = [
    // --- silenciadores ---
    {
        id: "suppressor", type: "weapon_attachment", name: "Silenciador",
        realWorldName: "Colt M1911A1 con silenciador",
        compatibleFamilies: ["colt45"],
        clipSize: null, needsVariant: true, weight: 0.3, price: 1200
    },
    // --- cargadores de la Colt .45: el unico caso con 15 balas ---
    {
        id: "mag_colt45", type: "magazine", name: "Cargador Colt .45",
        realWorldName: "Colt 1911 magazine 8 rds",
        compatibleFamilies: ["colt45"],
        clipSize: 8, needsVariant: false, weight: 0.2, price: 220
    },
    {
        id: "mag_colt45_replica", type: "magazine", name: "Cargador Colt .45 replica",
        realWorldName: "Colt .45 magazine replica 8 rds",
        compatibleFamilies: ["colt45"],
        clipSize: 8, needsVariant: false, weight: null, price: 18
    },
    {
        // RENAME PENDIENTE: el item de inventario se llama `mag_colt45_extended`
        // en item_data, weapon_data, web_data, Items y SaveMigration. Aca se
        // llama `mag_colt45_15` porque es el nombre del diseno final. El cambio
        // completo, con su entrada en ITEM_RENAMES, es de la fase de saves; hasta
        // entonces el accesorio declarado NO coincide con el item del inventario,
        // y por eso el validador lo reporta.
        id: "mag_colt45_15", type: "magazine", name: "Cargador Colt .45 extendido",
        realWorldName: "Colt .45 extended magazine 15 rds",
        compatibleFamilies: ["colt45"],
        clipSize: 15, needsVariant: true, weight: 0.2, price: 45
    },
    // --- cargadores de una sola capacidad: los mismos que la base ---
    {
        id: "mag_desert_eagle", type: "magazine", name: "Cargador Desert Eagle",
        realWorldName: "IWI .50 AE 7/8 acero",
        compatibleFamilies: ["desert_eagle"],
        clipSize: 7, needsVariant: false, weight: null, price: 480
    },
    {
        id: "mag_shotgun", type: "magazine", name: "Tubo extension Remington",
        realWorldName: "Tubo de deposito Remington 870",
        compatibleFamilies: ["shotgun"],
        clipSize: 1, needsVariant: false, weight: null, price: 330
    },
    {
        id: "mag_sawed_off", type: "magazine", name: "Tubo recortada",
        realWorldName: "Doble ca├▒├│n recortado, 2 tiros",
        compatibleFamilies: ["sawed_off"],
        clipSize: 2, needsVariant: false, weight: null, price: 180
    },
    {
        id: "mag_combat_shotgun", type: "magazine", name: "Tubo completo SPAS 12",
        realWorldName: "Franchi SPAS-12 tubo 8 cartuchos",
        compatibleFamilies: ["combat_shotgun"],
        clipSize: 7, needsVariant: false, weight: null, price: 620
    },
    {
        id: "mag_micro_uzi", type: "magazine", name: "Cargador Micro Uzi",
        realWorldName: "IMI Micro Uzi 20/32 9mm acero",
        compatibleFamilies: ["micro_uzi"],
        clipSize: 30, needsVariant: false, weight: null, price: 260
    },
    {
        id: "mag_tec9", type: "magazine", name: "Cargador Tec9",
        realWorldName: "Intratec DC-9 20/30 acero",
        compatibleFamilies: ["tec9"],
        clipSize: 30, needsVariant: false, weight: null, price: 280
    },
    {
        id: "mag_country_rifle", type: "magazine", name: "Tubo Marlin 336",
        realWorldName: "Marlin 336, 5-6 en el tubo",
        compatibleFamilies: ["country_rifle"],
        clipSize: 1, needsVariant: false, weight: null, price: 400
    },
    {
        id: "mag_sniper_rifle", type: "magazine", name: "Cargador AICS",
        realWorldName: "AICS desmontable 5-10",
        compatibleFamilies: ["sniper_rifle"],
        clipSize: 1, needsVariant: false, weight: null, price: 450
    },
    {
        id: "mag_rpg", type: "magazine", name: "Cohete RPG",
        realWorldName: "PG-7 V2, 1 cohete",
        compatibleFamilies: ["rpg"],
        clipSize: 1, needsVariant: false, weight: null, price: 900
    },
    {
        id: "mag_heat_seeker", type: "magazine", name: "Misil heat seeker",
        realWorldName: "SA-7 Grail, 1 misil guiado",
        compatibleFamilies: ["heat_seeker"],
        clipSize: 1, needsVariant: false, weight: null, price: 1200
    },
    {
        id: "mag_flamethrower", type: "magazine", name: "Deposito flamethrower",
        realWorldName: "Deposito de napalm M2",
        compatibleFamilies: ["flamethrower"],
        clipSize: 500, needsVariant: false, weight: null, price: 700
    },
    {
        id: "mag_minigun", type: "magazine", name: "Caja de municion minigun",
        realWorldName: "Caja alimentadora M134",
        compatibleFamilies: ["minigun"],
        clipSize: 500, needsVariant: false, weight: null, price: 900
    },
    // --- MP5: dos cargadores, los dos de 30 ---
    {
        id: "mag_mp5", type: "magazine", name: "Cargador MP5",
        realWorldName: "H&K MP5 30 original",
        compatibleFamilies: ["mp5"],
        clipSize: 30, needsVariant: false, weight: null, price: 540
    },
    {
        id: "mag_mp5_replica", type: "magazine", name: "Cargador MP5 replica",
        realWorldName: "Cargador 9x19 30 rds replicado",
        compatibleFamilies: ["mp5"],
        clipSize: 30, needsVariant: false, weight: null, price: 38
    },
    // --- AK-47: cuatro, y el tambor cambia la capacidad ---
    {
        id: "mag_ak47", type: "magazine", name: "Cargador AK-47",
        realWorldName: "AKM 30 balas acero surplus",
        compatibleFamilies: ["ak47"],
        clipSize: 30, needsVariant: false, weight: null, price: 300
    },
    {
        id: "mag_ak47_polymer", type: "magazine", name: "Cargador AK polimero",
        realWorldName: "AK polymer 5.45x39 30 rds",
        compatibleFamilies: ["ak47"],
        clipSize: 30, needsVariant: false, weight: null, price: 16
    },
    {
        id: "mag_ak47_bulgarian", type: "magazine", name: "Cargador AK bulgaro",
        realWorldName: "AK Bulgarian 5.45x39 30 rds",
        compatibleFamilies: ["ak47"],
        clipSize: 30, needsVariant: false, weight: null, price: 48
    },
    {
        id: "mag_ak47_drum", type: "magazine", name: "Cargador AK tambor",
        realWorldName: "Drum 5.45x39 75 rds",
        compatibleFamilies: ["ak47"],
        clipSize: 75, needsVariant: true, weight: null, price: 140
    },
    // --- M4: cuatro, y dos cambian la capacidad ---
    {
        id: "mag_m4_assembled", type: "magazine", name: "Cargador M4",
        realWorldName: "STANAG 30 USGI",
        compatibleFamilies: ["m4"],
        clipSize: 30, needsVariant: false, weight: null, price: 320
    },
    {
        id: "mag_m4_polymer", type: "magazine", name: "Cargador M4 polimero",
        realWorldName: "STANAG polymer 5.56x45 30 rds",
        compatibleFamilies: ["m4"],
        clipSize: 30, needsVariant: false, weight: null, price: 16
    },
    {
        id: "mag_m4_lancer", type: "magazine", name: "Cargador M4 Lancer",
        realWorldName: "Lancer 5.56x45 40 rds",
        compatibleFamilies: ["m4"],
        clipSize: 40, needsVariant: true, weight: null, price: 25
    },
    {
        id: "mag_m4_drum", type: "magazine", name: "Cargador M4 D-60",
        realWorldName: "Magpul D-60 5.56x45 60 rds",
        compatibleFamilies: ["m4"],
        clipSize: 60, needsVariant: true, weight: null, price: 135
    }
];

// ============================================================================
// VARIANTES - la combinacion resuelta
// ============================================================================
// La tabla completa. `variantKey` la calcula el resolver; esta escrita a mano
// porque son pocas y porque escribirla a mano es lo que hace visible una
// combinacion que nadie declaro.
//
//   weaponType  lo que el motor ejecuta.
//   family      familia a la que pertenece
//   attachments ids de accesorios, ORDENADOS por id. El orden es parte de la
//               identidad: normaliza antes de comparar, asi que dos variantes
//               con los mismos accesorios en distinto orden son la MISMA.
//   parent      SOLO para variantes de plugin: el tipo VANILLA del que clona el
//               .asi. null en las de vanilla.
//   clipSize    capacidad de ESTA variante. DECLARATIVO, vease arriba.
//
// ----------------------------------------------------------------------------
// LAS 4 VARIANTES DE LA COLT .45: LAS CUATRO SON DE PLUGIN
//
//   tipo  parent  modelo  capacidad  configuracion
//    63      22     346        8     pelada
//    62      22     346       15     cargador 15
//    60      23     347        8     silenciador
//    61      23     347       15     silenciador + cargador 15
//
// POR QUE LAS CUATRO Y ANTES DOS
//   El 22 de vanilla trae 17 balas, y el mod no escribe m_nAmmoClip, asi que la
//   Colt de GSIS necesita su propio tipo para tener 8. Y el 23 es la pistola
//   silenciada de VANILLA, un tipo vivo: registrarlo haria que
//   HookGetWeaponInfo(23) devolviera filas de GSIS para la silenciada de todo el
//   juego. El silenciado de GSIS es el 60, que CLONA del 23 y asi hereda su
//   modelo 347, su animacion 18 y su sonido sin pisarlo.
//
//   O sea: el 22 y el 23 quedan 100% vanilla. El 60 y el 61 los usan de PADRE.
//   Esa diferencia entre clonar y reemplazar es toda la linea entre un
//   silenciador que funciona y uno que no cambia nada.
//
// LOS PADRES TIENEN QUE SER DE VANILLA Y DIRECTOS
//   Resolver() en limiter.cpp sube hasta el ANCESTRO MAS ALTO, no al padre
//   inmediato. Un padre en cadena se pierde: si el 61 declarara padre 60,
//   Resolver(61) daria 22 y el clon saldria de la Colt base, sin modelo 347 ni
//   animacion 18 ni sonido de silenciada.
// ----------------------------------------------------------------------------
//
// LAS OTRAS 16 FAMILIAS: SU TIPO DE VANILLA, SIN FILA EN EL .dat
// La diferencia con la Colt es que el 22 de vanilla trae 17 balas y el mod ya no
// puede bajarlo, mientras que para el resto el tipo de vanilla sirve. Asi que
// estas 16 familias usan el weaponType que GTA ya tiene, con parent null: el
// motor los ejecuta sin que el .asi los conozca.
//
//   family            tipo vanilla   capacidad real (del juego, no de aca)
//   desert_eagle            24             7
//   shotgun                 25             1
//   sawed_off               26             2
//   combat_shotgun          27             7
//   micro_uzi               28            50
//   mp5                     29            30
//   tec9                    32            50
//   ak47                    30            30
//   m4                      31            30
//   country_rifle           33             1
//   sniper_rifle            34             1
//   rpg                     35             1
//   heat_seeker             36             1
//   flamethrower            37           500
//   minigun                 38           500
//
// OJO con micro_uzi y tec9: la tabla de abajo declara 30 y el juego tiene 50.
// Esa diferencia ya no la arregla nadie, porque el mod dejo de escribir
// m_nAmmoClip. La capacidad real la lee Engine.clipCapacityOf(). Ver la seccion
// "LO QUE NO ES LA FUENTE DE LA CAPACIDAD".
//
// LA RESTRICCION REAL DEL SISTEMA, EN NUMEROS
//   El rango 60..79 tiene 20 slots, y un slot por configuracion que el motor
//   tenga que ejecutar distinto. Gasta uno:
//     - la base de una familia, SI su capacidad de vanilla no es la que quiere
//       el mod (la Colt: el 22 es de 17 y la de GSIS es de 8)
//     - un cargador que cambia la capacidad respecto de su familia
//     - un accesorio que cambia el modelo o el sonido (el silenciador)
//
//   Con la Colt al 8 salen 4. Si ademas se quisiera el tambor del AK (75 contra
//   30), el Lancer (40) y el tambor del M4 (60), serian 7 de 20. Si en cambio se
//   le diera tipo propio a la base de las 16 familias, serian 20 de 20 y no
//   quedaria casi nada. Por eso las 16 bases son de vanilla: es la decision que
//   mas slots deja libres sin cambiar lo que el jugador ve.
export var WEAPON_VARIANTS = [
    // --- colt45: la unica familia con 4 configuraciones ---
    { weaponType: 63, family: "colt45", attachments: [], parent: 22, clipSize: 8, modelId: 346 },
    { weaponType: 62, family: "colt45", attachments: ["mag_colt45_15"], parent: 22, clipSize: 15, modelId: 15065 },
    { weaponType: 60, family: "colt45", attachments: ["suppressor"], parent: 23, clipSize: 8, modelId: 347 },
    { weaponType: 61, family: "colt45", attachments: ["mag_colt45_15", "suppressor"], parent: 22, clipSize: 15, modelId: 15066, damage: 40 },
    // --- el resto: su tipo de vanilla, que el motor ya ejecuta ---
    { weaponType: 24, family: "desert_eagle", attachments: [], parent: null, clipSize: 7, modelId: 348 },
    { weaponType: 25, family: "shotgun", attachments: [], parent: null, clipSize: 1, modelId: 349 },
    { weaponType: 26, family: "sawed_off", attachments: [], parent: null, clipSize: 2, modelId: 350 },
    { weaponType: 27, family: "combat_shotgun", attachments: [], parent: null, clipSize: 7, modelId: 351 },
    { weaponType: 28, family: "micro_uzi", attachments: [], parent: null, clipSize: 30, modelId: 352 },
    { weaponType: 29, family: "mp5", attachments: [], parent: null, clipSize: 30, modelId: 353 },
    { weaponType: 32, family: "tec9", attachments: [], parent: null, clipSize: 30, modelId: 372 },
    { weaponType: 30, family: "ak47", attachments: [], parent: null, clipSize: 30, modelId: 355 },
    { weaponType: 31, family: "m4", attachments: [], parent: null, clipSize: 30, modelId: 356 },
    { weaponType: 33, family: "country_rifle", attachments: [], parent: null, clipSize: 1, modelId: 357 },
    { weaponType: 34, family: "sniper_rifle", attachments: [], parent: null, clipSize: 1, modelId: 358 },
    { weaponType: 35, family: "rpg", attachments: [], parent: null, clipSize: 1, modelId: 359 },
    { weaponType: 36, family: "heat_seeker", attachments: [], parent: null, clipSize: 1, modelId: 360 },
    { weaponType: 37, family: "flamethrower", attachments: [], parent: null, clipSize: 500, modelId: 361 },
    { weaponType: 38, family: "minigun", attachments: [], parent: null, clipSize: 500, modelId: 362 },
    // --- los tres cargadores que cambian la capacidad de su familia ---
    // Los tres son "clonar del mismo arma y cambiar solo el cargador", asi que el
    // padre es el tipo de vanilla de la propia familia y no el 22. Un padre
    // equivocado aca no da un error visible: da un arma que dispara y suena bien
    // con el cargador equivocado.
    { weaponType: 64, family: "ak47", attachments: ["mag_ak47_drum"], parent: 30, clipSize: 75, modelId: 355 },
    { weaponType: 65, family: "m4", attachments: ["mag_m4_lancer"], parent: 31, clipSize: 40, modelId: 356 },
    { weaponType: 66, family: "m4", attachments: ["mag_m4_drum"], parent: 31, clipSize: 60, modelId: 356 }
];

// ============================================================================
// LO QUE NO ES LA FUENTE DE LA CAPACIDAD
// ============================================================================
// En `clipSize` de arriba hay numeros que el motor no va a respetar, y conviene
// saber cuales y por que.
//
//   la capacidad de un tipo de PLUGIN   la escribio el .asi, desde la fila del
//                                       .dat. Aca esta el mismo numero, y el
//                                       validador lo compara contra el archivo.
//   la capacidad de un tipo de VANILLA  es la del juego, y puede no ser la que
//                                       dice la tabla.
//
// El caso concreto es micro_uzi y tec9: aca declaran 30 y el juego tiene 50. La
// tabla dice 30 porque antes el mod la escrebia en la CWeaponInfo global al
// arrancar, y eso la hacia cierta. Desde que el mod no escribe m_nAmmoClip, la
// que vale es la del motor.
//
// Que el validador NO lo compruebe es correcto: para un tipo de vanilla no hay
// fila en el .dat contra la que comparar, y la unica fuente de verdad seria
// GET_WEAPONINFO_TOTAL_CLIP, que es un native y este archivo es datos puros.
// Este es el punto donde la capa de datos termina y empieza el engine.
//
// O sea: aca `clipSize` sirve para la UI, el dealer y la economia. Para limitar
// municion se lee el motor. Confundir las dos cosas es el bug que motivo esta
// reescritura.

// ============================================================================
// VARIANTES DE PLUGIN QUE FALTAN
// ============================================================================
// Un cargador que cambia la capacidad necesita un weaponType propio, porque el
// motor tiene que ejecutar algo distinto. Uno con la misma capacidad que la
// familia no: monta y el arma sigue siendo la misma.
//
// ESTA LISTA NO ES UN ERROR, es la lista de trabajo de lo que habria que
// agregar al .dat para que esas configuraciones existan en el juego. Se calcula,
// no se escribe a mano, para que no pueda desactualizarse: si mañana se declara
// una variante, desaparece de aca solo.
//
// Con el rango 60..79 y 20 slots, y 4 tipos ya usados por la Colt, hay 16
// libres. Toda la lista entra de sobra.
export function pendingPluginTypes() {
    var out = [];
    for (var f = 0; f < WEAPON_FAMILIES.length; f++) {
        var fam = WEAPON_FAMILIES[f];
        var base = _baseVariantOf(fam.family);
        if (!base) continue;
        for (var a = 0; a < WEAPON_ATTACHMENTS.length; a++) {
            var att = WEAPON_ATTACHMENTS[a];
            if (att.compatibleFamilies.indexOf(fam.family) === -1) continue;
            if (!att.needsVariant) continue;
            if (getVariantByKey(fam.family, [att.id])) continue;   // ya declarada
            out.push({
                family: fam.family,
                attachments: [att.id],
                baseVariant: fam.baseVariant,
                clipSize: att.clipSize,
                // El padre sale de la propia base de la familia, y no de un tipo
                // fijo. Si la base es de vanilla, el padre ES la base: clonar del
                // mismo arma y cambiar solo el cargador es lo que hace que herede
                // la animacion, el sonido y la mira correctos. Si la base ya es de
                // plugin, el padre es el de la base, porque Resolver() sube al
                // ancestro mas alto y llegaria igual.
                suggestedParent: isPluginVariant(base) ? base.parent : base.weaponType,
                suggestedModel: base.modelId
            });
        }
    }
    return out;
}

// La variante base (sin accesorios) de una familia, o null.
function _baseVariantOf(family) {
    return getVariantByKey(family, []);
}

// ============================================================================
// INDICE
// ============================================================================
// Se construye una vez, al cargar el modulo. Un indice por clave de variante, uno
// por weaponType, y uno por familia. Se consultan los tres, y el que falta es lo
// que hace que un accessor devuelva null en vez de inventar.
//
// Los duplicados NO se descartan en silencio: se anotan en `problems` y los
// reporta validateWeapons(). Descartarlos sin avisar es lo que hace que un
// accesorio mal declarado parezca no hacer nada.
function _buildIndex() {
    var byKey = {};
    var byType = {};
    var byFamily = {};
    var problems = [];
    for (var i = 0; i < WEAPON_VARIANTS.length; i++) {
        var v = WEAPON_VARIANTS[i];
        var key = variantKey(v.family, v.attachments);
        if (byKey[key]) {
            problems.push("la configuracion " + key + " la declaran " +
                byKey[key].weaponType + " y " + v.weaponType + "; gana " + byKey[key].weaponType);
            continue;
        }
        if (byType[v.weaponType]) {
            problems.push("el weaponType " + v.weaponType + " lo declaran mas de una variante; gana la primera");
            continue;
        }
        byKey[key] = v;
        byType[v.weaponType] = v;
        if (!byFamily[v.family]) byFamily[v.family] = [];
        byFamily[v.family].push(v);
    }
    return { byKey: byKey, byType: byType, byFamily: byFamily, problems: problems };
}

var _IDX = _buildIndex();

// ============================================================================
// HELPERS
// ============================================================================

// La identidad de una configuracion es "familia + conjunto de accesorios". Y un
// CONJUNTO no tiene orden: montar primero el silenciador y despues el cargador da
// el mismo arma que montar primero el cargador.
//
// Asi que la clave ORDENA los ids antes de juntarlos. Sin esta linea,
// `["suppressor", "mag_colt45_15"]` y `["mag_colt45_15", "suppressor"]` son dos
// claves distintas, la segunda no existe en la tabla, y el resolver devuelve
// null: el jugador monta un accesorio y el arma deja de funcionar segun en que
// orden los monto. Es el bug mas caro de esta parte del sistema y el mas dificil
// de ver, porque el sintoma depende del orden de los clics.
//
// Se ordena en la clave y no solo en la tabla por eso: la tabla se puede escribir
// ordenada a mano, pero la lista que guarda el registro la arma el codigo que
// monta, y esa no tiene por que venir ordenada.
export function variantKey(family, attachments) {
    var a = _norm(attachments);
    a.sort();
    return family + "|" + a.join(",");
}

function _norm(attachments) {
    if (!attachments) return [];
    if (typeof attachments === "string") return [attachments];
    return attachments.slice();
}

export function getFamilyById(family) {
    for (var i = 0; i < WEAPON_FAMILIES.length; i++) {
        if (WEAPON_FAMILIES[i].family === family) return WEAPON_FAMILIES[i];
    }
    return null;
}

// El item de inventario de una familia. Un item, no una variante: por eso el
// collar de la pistola no se multiplica al montar el silenciador.
export function getFamilyItemId(family) {
    var f = getFamilyById(family);
    return f ? f.itemId : null;
}

export function getFamilyByItemId(itemId) {
    for (var i = 0; i < WEAPON_FAMILIES.length; i++) {
        if (WEAPON_FAMILIES[i].itemId === itemId) return WEAPON_FAMILIES[i];
    }
    return null;
}

// ============================================================================
// COMPATIBILIDAD CON LOS NOMBRES VIEJOS
// ============================================================================
// Un accesorio se llama aca `mag_colt45_15`, que es el nombre del diseno final.
// El item de inventario todavia se llama `mag_colt45_extended` en cinco archivos
// (item_data, weapon_data, web_data, Items y SaveMigration) y se va a renombrar
// en la fase de saves, con su entrada en ITEM_RENAMES.
//
// Mientras tanto los dos nombres tienen que resolver a la misma pieza, o el
// cargador deja de existir: `mag_colt45_extended` es lo que el jugador tiene en el
// inventario y lo que el arma guarda montado, y si eso no resuelve, la
// configuracion no se puede montar y no hay error en ninguna parte.
//
// La clave es el nombre viejo, el valor el canonico. La resuelve getAttachmentById
// en los dos sentidos, asi que el resto del codigo no tiene que saber que esto
// existe. validateWeapons() avisa que el alias sigue vivo, para que no se olvide
// sacarlo en la fase que corresponde.
export var ATTACHMENT_ALIASES = {
    "mag_colt45_extended": "mag_colt45_15"
};

// El id canonico de un id, sea viejo o canonico.
export function canonicalAttachmentId(id) {
    if (!id) return id;
    return ATTACHMENT_ALIASES[id] || id;
}

export function getAttachmentById(id) {
    var canonico = canonicalAttachmentId(id);
    for (var i = 0; i < WEAPON_ATTACHMENTS.length; i++) {
        if (WEAPON_ATTACHMENTS[i].id === canonico) return WEAPON_ATTACHMENTS[i];
    }
    return null;
}

// Los ids viejos que todavia resuelve el catalogo. Para el informe de la fase.
export function liveAttachmentAliases() {
    var out = [];
    for (var viejo in ATTACHMENT_ALIASES) {
        if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_ALIASES, viejo)) continue;
        if (!getAttachmentById(viejo)) { out.push(viejo + " (el canonico " + ATTACHMENT_ALIASES[viejo] + " no existe)"); continue; }
        out.push(viejo + " -> " + ATTACHMENT_ALIASES[viejo]);
    }
    return out;
}

// El nombre que el INVENTARIO usa para un accesorio. Al reves de
// canonicalAttachmentId: el registro guarda el canonico y el inventario tiene el
// viejo, asi que la frontera entre los dos necesita las dos direcciones.
//
// La usa el cinturon: items:swapMagazine compara contra los ids que HAY en el
// inventario, no contra los de la tabla de variantes.
export function inventoryAttachmentId(canonico) {
    for (var viejo in ATTACHMENT_ALIASES) {
        if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_ALIASES, viejo)) continue;
        if (ATTACHMENT_ALIASES[viejo] === canonico) return viejo;
    }
    return canonico;
}

// ============================================================================
// QUE TIPOS PUEDEN ADOPTARSE AL INVENTARIO
// ============================================================================
// El reconciliador encuentra armas en el ped que no estan en el registro: una
// pistola de una mision, un arma de un cheat, un arma de un save viejo. Esas se
// adopts al inventario con su estado.
//
// La regla es UNA: el tipo tiene que ser una de las variantes declaradas. Ni mas
// ni menos, y la razon de que no haya mas es que el 22 y el 23 no se adoptan.
//
// Los DOS MOTIVOS, y los dos importan:
//
//   El 23 es la silenciada de VANILLA, un tipo que el motor consulta de verdad.
//   Adoptarlo como "colt45 con silenciador" seria mentir: la Colt de GSIS con
//   silenciador es el 60, que es un tipo distinto con otro sonido.
//
//   El 22 es la Colt de VANILLA, y la de GSIS es el 63 con 8 balas. Un 22 en la
//   mano son 17 balas y un cargador que el mod no controla. Si se adoptara, el
//   inventario tendría un arma cuya capacidad no es la que el registro dice.
//
// Que un 22 o un 23 queden en la mano sin que GSIS los toque es el estado
// correcto: son armas del juego, no armas de GSIS. El reconciliador los deja
// como deja una mandibula o una granada, y avisa una vez para que se vea que la
// decision fue tomada y no se olvidó.
export function familyForType(weaponType) {
    var v = getVariantByWeaponType(weaponType);
    return v ? v.family : null;
}

// Los 22 y 23, nombrados. Que esten aca y no metidos en una regla escondida es
// lo que hace que la decision sea revisable.
export var TIPOS_VANILLA_NO_ADOPTABLES = { 22: true, 23: true };

// Los cargadores que acepta una familia, en los ids que USA EL INVENTARIO.
// Es la lista que se le pasa a items:swapMagazine.
export function magazineIdsFor(family) {
    var out = [];
    for (var i = 0; i < WEAPON_ATTACHMENTS.length; i++) {
        var a = WEAPON_ATTACHMENTS[i];
        if (a.type !== "magazine") continue;
        if (a.compatibleFamilies.indexOf(family) === -1) continue;
        out.push(inventoryAttachmentId(a.id));
    }
    return out;
}

// El cargador MONTAADO de una instancia, o null. Los accesorios ya van en
// orden y sin repetir, asi que hay a lo sumo uno de tipo cargador.
export function mountedMagazineOf(family, attachments) {
    var accs = _norm(attachments);
    for (var i = 0; i < accs.length; i++) {
        var a = getAttachmentById(accs[i]);
        if (a && a.type === "magazine") return a.id;
    }
    return null;
}

// Un accesorio cualquiera (un silenciador) compatible con esta familia.
export function otherAttachmentsOf(attachments) {
    var accs = _norm(attachments);
    var out = [];
    for (var i = 0; i < accs.length; i++) {
        var a = getAttachmentById(accs[i]);
        if (a && a.type !== "magazine") out.push(accs[i]);
    }
    return out;
}

export function getVariantByKey(family, attachments) {
    return _IDX.byKey[variantKey(family, attachments)] || null;
}

export function getVariantByWeaponType(weaponType) {
    if (weaponType === null || weaponType === undefined) return null;
    return _IDX.byType[weaponType] || null;
}

export function getVariantsOfFamily(family) {
    return _IDX.byFamily[family] || [];
}

// Que item de inventario representa un weaponType. Sale por la VARIANTE, nunca
// por un weaponId guardado en la familia: la familia no tiene weaponType.
export function getItemIdByWeaponType(weaponType) {
    var v = getVariantByWeaponType(weaponType);
    return v ? getFamilyItemId(v.family) : null;
}

// Un accesorio se puede montar en esta familia. Es la unica regla de
// compatibilidad y se consulta por el nombre del accesorio, no por el tipo.
export function isAttachmentCompatible(attachmentId, family) {
    var a = getAttachmentById(attachmentId);
    if (!a || !a.compatibleFamilies) return false;
    return a.compatibleFamilies.indexOf(family) !== -1;
}

// Una variante es de plugin si su .asi la registro: hay fila en
// gsis_weapons.dat para ese tipo, que es lo que declara `parent`.
//
// ES la distincion que decide si el mod puede escribirle. Un tipo de vanilla
// tiene su CWeaponInfo en la tabla global del juego; uno de plugin la tiene en
// la memoria del .asi. Ese caso se resuelve en la fase 3, donde el mod deja de
// escribir la capacidad de cualquier tipo.
export function isPluginVariant(variant) {
    return !!(variant && variant.parent !== null && variant.parent !== undefined);
}

export function getPluginWeaponTypes() {
    var out = [];
    for (var i = 0; i < WEAPON_VARIANTS.length; i++) {
        if (isPluginVariant(WEAPON_VARIANTS[i])) out.push(WEAPON_VARIANTS[i].weaponType);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
}

// ============================================================================
// EL RESOLVER
// ============================================================================
// family + lista de accesorios -> weaponType, o null si nadie declaro esa
// combinacion.
//
// Devolver null en vez de un tipo inventado es lo que mantiene honesta la tabla:
// si se cayera a la variante base, un accesorio mal declarado seria
// INDISTINGUIBLE de un accesorio que no hace nada, y ese es justo el bug que mas
// cuesta ver. Con null, quien llama lo avisa con el contexto que tiene
// (familia + accesorios + donde se pidio) y el fallo queda en el log.
export function resolveWeaponType(family, attachments) {
    var norm = _norm(attachments);

    // Un accesorio repetido no es una configuracion. Montar dos veces el mismo
    // silenciador daria una clave distinta y el resolver devolveria null por un
    // motivo que el jugador no puede ver.
    var vistos = {};
    for (var i = 0; i < norm.length; i++) {
        if (vistos[norm[i]]) return null;
        vistos[norm[i]] = true;
    }

    // Todo accesorio tiene que ser compatible con la familia. Si uno no lo es,
    // la combinacion no existe ni por error.
    for (var j = 0; j < norm.length; j++) {
        if (!isAttachmentCompatible(norm[j], family)) return null;
    }

    var v = getVariantByKey(family, norm);
    if (v) return v.weaponType;

    // Sin accesorios: cae a la variante base declarada de la familia.
    if (norm.length === 0) {
        var f = getFamilyById(family);
        if (f && f.baseVariant) return f.baseVariant;
    }

    // Accesorios que NO cambian lo que el motor ejecuta: resuelven a la base.
    //
    // Montar el mag_ak47 (30 balas) sobre un AK-47 (30 balas) deja un AK-47 de
    // 30 balas, o sea exactamente el mismo arma. El registro guarda el accesorio
    // montado, que es lo que el jugador ve y lo que hay que devolver al
    // inventario, y el motor ejecuta el mismo tipo de siempre. Por eso el
    // cargador no gasta un slot del rango 60..79.
    //
    // Y NO es un "cae a la base" silencioso como el de arriba: aca se comprueba
    // que NINGUN accesorio de la lista necesite tipo propio. Si uno solo lo
    // necesita, la combinacion no esta declarada y se devuelve null, que es la
    // respuesta honesta: "nadie declaro esto".
    if (norm.length > 0 && _todosNeutros(family, norm)) {
        var fam = getFamilyById(family);
        if (fam && fam.baseVariant) return fam.baseVariant;
    }
    return null;
}

// Ninguno de estos accesorios hace que el motor ejecute algo distinto. Si
// alguno no esta declarado, no se puede saber: se responde que no.
function _todosNeutros(family, attachments) {
    for (var i = 0; i < attachments.length; i++) {
        var a = getAttachmentById(attachments[i]);
        if (!a) return false;
        if (a.needsVariant) return false;
    }
    return true;
}

// ============================================================================
// EL PERFIL DE UNA VARIANTE
// ============================================================================
// Todo lo que hace falta saber de un weaponType, en un objeto. La capacidad sale
// del cargador si lleva uno, si no de la variante, si no de la familia. El orden
// importa: una variante con cargador de 15 tiene que dar 15 aunque la familia
// declare otra cosa.
//
// Y `clipSize` aca es el numero DECLARADO. El que vale en runtime lo lee
// core/gsis_Engine.js con GET_WEAPONINFO_TOTAL_CLIP, porque la fila de un tipo de
// plugin la escribio el .asi y su layout no es el del juego.
export function getVariantProfile(weaponType) {
    var v = getVariantByWeaponType(weaponType);
    if (!v) return null;
    var f = getFamilyById(v.family);
    var accs = v.attachments || [];

    var clip = null;
    for (var i = 0; i < accs.length; i++) {
        var a = getAttachmentById(accs[i]);
        if (a && a.clipSize !== null && a.clipSize !== undefined) { clip = a.clipSize; break; }
    }
    if (clip === null && v.clipSize !== null && v.clipSize !== undefined) clip = v.clipSize;
    if (clip === null && f) clip = f.baseClip;

    return {
        weaponType: v.weaponType,
        family: v.family,
        itemId: f ? f.itemId : null,
        attachments: accs,
        parent: v.parent,
        modelId: v.modelId,
        slot: f ? f.slot : null,
        clipSize: clip,
        ammoType: f ? f.ammoType : null,
        isPlugin: isPluginVariant(v)
    };
}

// ============================================================================
// EL CONTRATO CON EL .asi
// ============================================================================
// Las dos mitades del sistema son este archivo y gsis_weapons.dat, y el .dat lo
// lee SOLO el .asi, en su DllMain, antes de que exista un solo script de CLEO.
// El mod no abre archivos, asi que desde adentro del juego el cruce es
// imposible.
//
// Por eso esta seccion existe: produce las filas que el .dat DEBERIA tener, en
// el mismo formato que su parser, y las compara contra el archivo real cuando
// algo con acceso a disco (tools/check-dat.mjs, o una persona) las pasa. Es una
// verificacion manual y se dice. Lo que la volveria automatica es que el .asi
// exporte su tabla y el mod la pregunte al arrancar, que es un cambio del .asi
// y no de aca.

var SKILL_STD = 1;   // la fila que representa al arma sin estar en una punta de la escala

// Las filas que gsis_weapons.dat deberia tener, en el formato del parser del
// .asi: <tipo> <padre> <modelId> <slot> <cargador> <damage>.
// damage va -1 = hereda del padre, que es lo que quiere el .asi para no pisar el
// dano con un 0.
export function expectedDatRows() {
    var out = [];
    for (var i = 0; i < WEAPON_VARIANTS.length; i++) {
        var v = WEAPON_VARIANTS[i];
        if (!isPluginVariant(v)) continue;
        var f = getFamilyById(v.family);
        var prof = getVariantProfile(v.weaponType);
        // El damage se LEE de la variante, no se supone -1.
        //
        // MEDIDO: el 30/09 el .dat traia "61 22 15066 2 15 40" y el catalogo
        // declaraba damage: 40 en la variante. Con este codigo hardcodeado a -1,
        // el cross-check NUNCA miraba el campo, asi que un .dat con el damage
        // desincronizado pasaba igual. Una guarda que no guarda es el mismo
        // defecto que la vtable validada en la ranura equivocada: parece que
        // verifica y no verifica nada.
        //
        // -1 significa "hereda del padre", y eso es lo que hay que escribir
        // explicitamente en la variante si se quiere ese comportamiento.
        var dmg = (typeof v.damage === "number") ? v.damage : -1;
        out.push({
            weaponType: v.weaponType,
            parent: v.parent,
            modelId: v.modelId,
            slot: f ? f.slot : null,
            clip: prof ? prof.clipSize : null,
            damage: dmg,
            family: v.family,
            attachments: (v.attachments || []).slice(),
            text: v.weaponType + " " + v.parent + " " + v.modelId + " " +
                  (f ? f.slot : "?") + " " + (prof ? prof.clipSize : "?") + " " + dmg
        });
    }
    out.sort(function (a, b) { return a.weaponType - b.weaponType; });
    return out;
}

// Compara las filas del .dat real contra las que este archivo declara.
// `filas` es lo que devuelve el parser: {tipo, padre, modelId, slot, cargador,
// damage}. Devuelve una lista de problemas; vacia = las dos mitades coinciden.
export function crossCheckDat(filas) {
    var problemas = [];
    var esperados = expectedDatRows();
    var porTipo = {};
    for (var i = 0; i < esperados.length; i++) porTipo[esperados[i].weaponType] = esperados[i];
    var vistos = {};

    for (var f = 0; f < filas.length; f++) {
        var fila = filas[f];
        vistos[fila.tipo] = true;
        var exp = porTipo[fila.tipo];
        if (!exp) {
            problemas.push("el .dat declara el tipo " + fila.tipo + ", que weapons.js no tiene. " +
                "O el .dat tiene una variante de mas, o weapons.js esta desactualizado.");
            continue;
        }
        if (fila.padre !== exp.parent) {
            problemas.push("el tipo " + fila.tipo + ": el .dat dice padre " + fila.padre +
                " y weapons.js dice " + exp.parent + ". Con padre distinto el .asi clona de otra " +
                "CWeaponInfo y el arma suena o se ve como otra cosa.");
        }
        if (fila.modelId !== exp.modelId) {
            problemas.push("el tipo " + fila.tipo + ": el .dat dice modelId " + fila.modelId +
                " y weapons.js dice " + exp.modelId + ". El .asi sobreescribe m_modelId con el del " +
                ".dat, asi que el de weapons.js es el que no se usa.");
        }
        if (fila.cargador !== exp.clip) {
            problemas.push("el tipo " + fila.tipo + ": el .dat dice cargador " + fila.cargador +
                " y weapons.js dice " + exp.clip + ". El .asi escribe ese numero en m_nAmmoClip de las " +
                "4 filas y el mod NO lo pisa nunca, asi que la capacidad REAL va a ser " +
                fila.cargador + ".");
        }
        if (fila.slot !== exp.slot) {
            problemas.push("el tipo " + fila.tipo + ": el .dat dice slot " + fila.slot +
                " y weapons.js dice " + exp.slot);
        }
        // El damage. Faltaba esta comparacion y por eso el campo no se verificaba
        // en absoluto: expectedDatRows traia -1 fijo y nadie lo contrastaba con la
        // fila real. MEDIDO el 30/09.
        //
        // Importa mas de lo que parece, porque -1 significa "hereda del padre":
        // si el padre cambia y el damage se queda en -1, el arma cambia de dano
        // sola. Le paso con el 61 al moverlo del padre 23 al 22: paso de heredar
        // 40 a heredar 25, y el .dat seguia diciendo -1.
        if (fila.damage !== exp.damage) {
            problemas.push("el tipo " + fila.tipo + ": el .dat dice damage " + fila.damage +
                " y weapons.js dice " + exp.damage + ". El .asi solo lo escribe si es >= 0, " +
                "asi que -1 = hereda del padre. Si el padre cambio y el damage sigue en -1, " +
                "el arma cambio de dano sola.");
        }
    }

    for (var t in porTipo) {
        if (!vistos[t]) {
            problemas.push("el tipo " + t + " (" + porTipo[t].family + " + " +
                porTipo[t].attachments.join("+") + ") NO esta en gsis_weapons.dat. " +
                "El .asi no lo conoce, asi que esa configuracion no existe en el juego: " +
                "darla va a fallar sin error.");
        }
    }
    return problemas;
}

// ============================================================================
// VALIDACION
// ============================================================================
// Devuelve la lista de problemas. NO loguea: este archivo es un modulo de datos
// puro, sin imports, sin natives y sin logging. Quien reporta es el modulo de
// armas en su init.
//
// Cada regla esta con su modo de fallo, que es lo que justifica que este.
//
// FAMILIAS
//   1. Una familia sin itemId, o dos familias con el mismo: el collar no los
//      distingue.
//   2. Una familia cuya baseVariant no tiene fila, o cuya fila sin accesorios
//      declara otro tipo: el arma pelada se da con un tipo que el .asi no
//      conoce, y eso es un arma que no dispara y no tiene mira.
//   3. El slot de la familia tiene que ser el mismo en todas sus variantes. El
//      motor tiene UN CWeapon por slot; si dos variantes de la misma familia
//      compartieran slot, una pisaria a la otra al darla.
//
// VARIANTES
//   4. WeaponType repetido: dos configuraciones contendrian el mismo tipo y el
//      motor ejecutaria la misma para las dos.
//   5. Configuracion duplicada (misma familia + mismos accesorios): la segunda
//      fila no se usa nunca y el accesorio parece no hacer nada.
//   6. Accesorio no declarado: la combinacion es inalcanzable, se puede
//      presentar en la UI y no lleva a ningun lado.
//   7. Accesorio incompatible con su familia: error de diseno del accesorio.
//   8. Accesorios sin ordenar: dos filas con el mismo conjunto en distinto orden
//      se ven distintas y la segunda nunca se resuelve.
//   9. Accesorio repetido en una variante: no es una configuracion.
//
// RANGO Y PADRES
//  10. Variante de plugin fuera de 60..79, o variante de vanilla dentro: el
//      rango es lo unico que el .asi puede dar de alta.
//  11. Padre fuera de 22..32: GetSkillStatIndex devuelve -1 y el arma no sube de
//      skill nunca.
//  12. Padre que es un tipo de plugin: Resolver() sube al ancestro mas alto y el
//      clon sale del ancestro final, perdiendo modelo, animacion y sonido.
//  13. Padre igual al weaponType: el clon seria de si mismo.
//  14. 22 y 23 como variante: son vanilla y VIVOS. Se usan de parent, no de
//      variante. Registrarlos haria que el .asi sirviera filas propias para un
//      arma que el motor consulta de verdad.
//
// DECLARATIVO
//  15. Un cargador sin clipSize: no se sabe que capacidad aporta, y la capacidad
//      es la unica razon por la que un cargador cambia de variante.
//  16. La capacidad de una variante de plugin tiene que ser la de su cargador, o
//      la de la familia si no lleva ninguno: son el mismo numero escrito en dos
//      lugares y por eso se comparan.
//
// LO QUE NO SE PUEDE COMPROBAR ACA
//  17. Que el .asi haya dado de alta lo que este archivo declara. Eso es
//      crossCheckDat(), y necesita leer el archivo: solo corre desde Node.
export function validateWeapons() {
    var problemas = _IDX.problems.slice();
    var itemsVistos = {};
    var tiposVistos = {};

    for (var f = 0; f < WEAPON_FAMILIES.length; f++) {
        var fam = WEAPON_FAMILIES[f];
        if (!fam.itemId) {
            problemas.push("la familia " + fam.family + " no declara itemId");
        } else if (itemsVistos[fam.itemId]) {
            problemas.push("el itemId " + fam.itemId + " lo usan las familias " +
                itemsVistos[fam.itemId] + " y " + fam.family);
        } else {
            itemsVistos[fam.itemId] = fam.family;
        }

        var base = getVariantByKey(fam.family, []);
        if (!base) {
            problemas.push("la familia " + fam.family + " no declara su variante base " +
                "(ninguna fila con attachments vacios). Armarla da " + fam.baseVariant +
                ", que puede no existir en el .dat");
        } else if (base.weaponType !== fam.baseVariant) {
            problemas.push("la familia " + fam.family + " dice baseVariant " + fam.baseVariant +
                " pero su fila sin accesorios es la " + base.weaponType);
        }
        if (fam.baseClip === null || fam.baseClip === undefined) {
            problemas.push("la familia " + fam.family + " no declara baseClip");
        }
    }

    for (var i = 0; i < WEAPON_VARIANTS.length; i++) {
        var v = WEAPON_VARIANTS[i];
        var accs = v.attachments || [];
        var famV = getFamilyById(v.family);
        var plugin = isPluginVariant(v);

        if (v.weaponType < 0 || v.weaponType > WEAPON_ID_MAX) {
            problemas.push("la variante " + v.weaponType + " tiene un weaponType fuera de 0.." +
                WEAPON_ID_MAX);
        }
        if (v.weaponType === 22 || v.weaponType === 23) {
            problemas.push("la variante " + v.weaponType + " usa un tipo VANILLA como variante. " +
                "22 y 23 se usan de PADRE (el 23 para clonar la silenciada) y no como variante: " +
                "registrarlos seria pisar un arma que el motor consulta de verdad");
        }

        // el rango, en las dos direcciones
        if (plugin && !_enRangoPlugin(v.weaponType)) {
            problemas.push("la variante " + v.weaponType + " declara parent " + v.parent +
                " pero el tipo no esta en " + PLUGIN_TYPE_MIN + ".." + PLUGIN_TYPE_MAX +
                ". Sin esa franja el .asi no lo puede dar de alta");
        }
        if (!plugin && _enRangoPlugin(v.weaponType)) {
            problemas.push("la variante " + v.weaponType + " esta en el rango de plugin " +
                PLUGIN_TYPE_MIN + ".." + PLUGIN_TYPE_MAX + " pero no declara parent, asi que no " +
                "clona de ningun tipo");
        }

        // el padre
        if (plugin) {
            if (v.parent < VANILLA_PARENT_MIN || v.parent > VANILLA_PARENT_MAX) {
                problemas.push("la variante " + v.weaponType + " tiene parent " + v.parent +
                    ", y tiene que ser un tipo vanilla de " + VANILLA_PARENT_MIN + ".." +
                    VANILLA_PARENT_MAX + ": fuera de ahi GetSkillStatIndex devuelve -1 y el arma " +
                    "no sube de skill");
            } else if (_enRangoPlugin(v.parent)) {
                problemas.push("la variante " + v.weaponType + " tiene parent " + v.parent +
                    ", que es un tipo de plugin. El padre tiene que ser de vanilla: Resolver() sube " +
                    "hasta el ancestro MAS ALTO, asi que con un padre en cadena el clon sale del " +
                    "ancestro final y se pierde todo lo que el padre intermedio heredaba");
            } else if (v.parent === v.weaponType) {
                problemas.push("la variante " + v.weaponType + " declara su propio tipo como parent");
            }
        }

        if (!famV) {
            problemas.push("la variante " + v.weaponType + " dice ser de la familia " + v.family +
                ", que no existe");
        }

        // el slot, que tiene que ser el de la familia
        var perfil = getVariantProfile(v.weaponType);
        if (famV && perfil && perfil.slot !== famV.slot) {
            problemas.push("la variante " + v.weaponType + " no puede tener otro slot que su familia: " +
                "el motor tiene un CWeapon por slot y dos variantes de la misma familia en slots " +
                "distintos se pisan al darse");
        }

        // los accesorios
        for (var a = 0; a < accs.length; a++) {
            var att = getAttachmentById(accs[a]);
            if (!att) {
                problemas.push("la variante " + v.weaponType + " usa el accesorio " + accs[a] +
                    ", que no esta en WEAPON_ATTACHMENTS");
            } else if (att.compatibleFamilies &&
                       att.compatibleFamilies.indexOf(v.family) === -1) {
                problemas.push("la variante " + v.weaponType + " monta " + accs[a] + " en " +
                    v.family + ", pero el accesorio no lo declara compatible");
            }
            if (accs.indexOf(accs[a]) !== a) {
                problemas.push("la variante " + v.weaponType + " repite el accesorio " + accs[a] +
                    ", y eso no es una configuracion");
            }
        }
        var norm = accs.slice().sort();
        if (norm.join(",") !== accs.join(",")) {
            problemas.push("la variante " + v.weaponType + " tiene los accesorios sin ordenar. " +
                "La clave los ordena antes de comparar, asi que dos filas con el mismo conjunto " +
                "en distinto orden se ven distintas y la segunda nunca se resuelve");
        }

        // la capacidad, que esta en dos lugares y por eso se comparan
        if (perfil && plugin) {
            var delCargador = null;
            for (var b = 0; b < accs.length; b++) {
                var at = getAttachmentById(accs[b]);
                if (at && at.clipSize !== null && at.clipSize !== undefined) { delCargador = at.clipSize; break; }
            }
            var esperada = (delCargador !== null) ? delCargador
                         : (famV ? famV.baseClip : null);
            if (esperada !== null && perfil.clipSize !== esperada) {
                problemas.push("la variante " + v.weaponType + " dice clipSize " + perfil.clipSize +
                    " y la configuracion da " + esperada + " (el cargador, o la base de la familia). " +
                    "Son el mismo numero en dos lugares, y el que manda es el `cargador` del .dat");
            }
        }
    }

    // los cargadores: la capacidad es obligatoria y la necesidad de tipo es
    // obligatoria, porque es lo que decide si una combinacion existe.
    for (var m = 0; m < WEAPON_ATTACHMENTS.length; m++) {
        var acc = WEAPON_ATTACHMENTS[m];
        if (acc.type === "magazine" && (acc.clipSize === null || acc.clipSize === undefined)) {
            problemas.push("el cargador " + acc.id + " no declara clipSize. Es un cargador sin " +
                "capacidad, y la capacidad es la unica razon por la que un cargador cambia de variante");
        }
        if (acc.needsVariant === null || acc.needsVariant === undefined) {
            problemas.push("el accesorio " + acc.id + " no declara needsVariant. Sin ese campo no se " +
                "sabe si al montarlo el motor tiene que ejecutar otra cosa, y el resolver no puede " +
                "decidir si la combinacion existe");
        }
        if (!acc.compatibleFamilies || !acc.compatibleFamilies.length) {
            problemas.push("el accesorio " + acc.id + " no declara compatibleFamilies, asi que no " +
                "se puede montar en ninguna familia");
        }
        // needsVariant true sin fila en el .dat = una combinacion que el jugador
        // puede comprar y que no existe en el juego. Esa es la que hay que
        // declarar; la otra (needsVariant false) resuelve a la base y esta bien.
        if (acc.needsVariant) {
            for (var c = 0; c < (acc.compatibleFamilies || []).length; c++) {
                var famId = acc.compatibleFamilies[c];
                if (!getFamilyById(famId)) {
                    problemas.push("el accesorio " + acc.id + " dice ser compatible con " + famId +
                        ", que no es ninguna familia");
                    continue;
                }
                if (getVariantByKey(famId, [acc.id])) continue;
                problemas.push("el accesorio " + acc.id + " necesita tipo propio (needsVariant) para " +
                    famId + ", pero no hay ninguna variante declarada con ese accesorio. Hay que " +
                    "agregar la fila a WEAPON_VARIANTS y al .dat, o poner needsVariant false si el " +
                    "motor ejecuta lo mismo con el que sin el. Ver pendingPluginTypes()");
            }
        }
        // Y al reves: un accesorio que resuelve a la base y aun asi tiene fila
        // declarada es una fila del .dat que no sirve para nada.
        if (!acc.needsVariant) {
            for (var d = 0; d < (acc.compatibleFamilies || []).length; d++) {
                var famId2 = acc.compatibleFamilies[d];
                if (getVariantByKey(famId2, [acc.id])) {
                    problemas.push("el accesorio " + acc.id + " tiene needsVariant false para " +
                        famId2 + ", o sea que no cambia lo que el motor ejecuta, pero hay una " +
                        "variante declarada con el. Esa fila gasta un slot del rango al pedo");
                }
            }
        }
    }

    return problemas;
}

// El nombre viejo. Ballistic todavia lo importa por este nombre; la fase 3 lo
// repunta a validateWeapons(). Es la misma funcion, no una version corta: el
// validador no estaba partido, estaba mal nombrado, porque "variantes" era el
// nombre de la tabla y no del sistema.
export var validateVariants = validateWeapons;

function _enRangoPlugin(tipo) {
    return tipo >= PLUGIN_TYPE_MIN && tipo <= PLUGIN_TYPE_MAX;
}

// Los accesorios que existen, son compatibles con una familia, y esa
// combinacion NO tiene variante declarada. Se separan en dos, porque la
// diferencia importa:
//
//   no necesita   el accesorio no cambia lo que el motor ejecuta (misma
//                 capacidad que la familia). Resuelve a la variante base, asi
//                 que se puede montar sin gastar un slot del rango.
//   SI necesita   el accesorio cambia la capacidad o el modelo y no hay fila
//                 en el .dat. Esa combinacion NO EXISTE en el juego: hay que
//                 declararla o hay que sacar el accesorio del catalogo.
//
// No es un error por si mismo. Es la lista de lo que falta agregar al .dat.
export function attachmentsWithoutVariant() {
    var out = [];
    for (var m = 0; m < WEAPON_ATTACHMENTS.length; m++) {
        var att = WEAPON_ATTACHMENTS[m];
        for (var f = 0; f < att.compatibleFamilies.length; f++) {
            var famId = att.compatibleFamilies[f];
            if (getVariantByKey(famId, [att.id])) continue;
            var base = _baseVariantOf(famId);
            if (!base) continue;
            out.push({
                attachment: att.id,
                family: famId,
                necesitaTipo: !!att.needsVariant,
                sePuedeMontar: !att.needsVariant,
                baseVariant: base.weaponType
            });
        }
    }
    return out;
}

// ============================================================================
// LO QUE NO ES UN ARMA
// ============================================================================
// El chaleco no es un arma, asi que no es una familia ni un accesorio. Esta aca
// solo porque hasta ahora vivia en la tabla de armas y hay codigo que lo busca
// con getWeaponByItemId. Cuando se migre el inventario a data/items.js, esta tabla
// se va con el. No tiene variantes ni weaponType: no se equipa en un slot de arma.
var WEAPON_ARMOR = [
    {
        itemId: "body_armor", name: "Chaleco antibalas",
        category: "Armadura", realWorldName: "Chaleco balistico",
        modelId: 373, weight: 2, price: 1200
    }
];

// ============================================================================
// VISTA LEGADA - WEAPON_DATA
// ============================================================================
// Dos mapas que la vista de abajo necesita ANTES de construirse. Van primero a
// proposito: `_WEAPON_DATA` se arma con una IIFE que corre en este punto del
// archivo, y leer una variable declarada despues daria undefined sin avisar.
//
// Un objeto con la forma que el mod venia usando, DERIVADO de las tres tablas de
// arriba. No es una fuente de verdad: no se edita, no se consulta para saber que
// existe un arma, y en la fase 3 desaparece cuando Ballistic deje de pedir
// "un item = un weaponId".
//
// Existe por estos ocho importadores, que siguen apuntando al path viejo:
// gsis_item_data, gsis_Bag, gsis_Ballistic, gsis_FlowSerialization,
// gsis_ItemRow, gsis_Items, gsis_WeaponDealer, gsis_WeaponSeller.
//
// ============================================================================
// LO QUE ESTA TABLA YA NO DICE, Y HAY QUE SEGUIR DICIENDO HASTA LA FASE 3
// ============================================================================
// Dos cosas que el modelo nuevo hacia bien en desaparecer y que el shim
// conserva, porque la fase 3 todavia no migra el codigo que las usaba.
//
// Cada una dice que era, por que se todavia, y quien la saca. Si una de las dos
// sobrevive a la migracion de la UI y el inventario, es que esa migracion se hizo
// a medias.

// --- 1. isLong en cuatro cargadores ---------------------------------------
// En WEAPON_DATA, estas cuatro filas de cargador tenian isLong: true. Un
// cargador no es un arma larga, asi que es un error del dato viejo. No es
// inerte: gsis_Bag lo lee con hasLongWeapon sobre el inventario, y con esto el
// bolso se habilitaba por llevar un cohete RPG.
//
// Se conserva para no cambiar comportamiento, y se dice que es un error. Lo saca
// la migracion de la UI y el inventario, que es la que decide si el bolso se
// habilita por un arma larga o por otra cosa. Ver la seccion de weapons.js que
// explica por que `isLong` es una propiedad del arma y no de la pieza.
export var LEGACY_IS_LONG = {
    mag_rpg: true, mag_heat_seeker: true, mag_flamethrower: true, mag_minigun: true
};

// --- 2. los nombres viejos de los accesorios, resuelto por el alias ---------
// Ver ATTACHMENT_ALIASES, mas arriba. Lo saca la migracion de saves, junto con
// ITEM_RENAMES.
//
// Y YA NO ESTA EL PUENTE DE LOS weaponType. `LEGACY_WEAPON_TYPES` (22 -> colt45)
// existia para que getWeaponByWeaponId(22) siguiera contestando la Colt, y sin el
// el reconciliador viejo la tomaba por basura vanilla y la borraba del
// inventario. Con los seis accesores por weaponId borrados y el reconciliador
// nuevo normalizando el 22 al 63 por otra via, el puente no tiene a quien
// responderle.
//
//   itemId, name, category, realWorldName, weight, isLong, price
//   weaponId, modelId, slot, clipSize       <- de la VARIANTE BASE de la familia
//   damage, fireRate, range, accuracy, ammoType
//   magId, magIds                          <- de los ACCESORIOS compatibles
//   family                                 <- el nombre de la familia
//   capacity, clipSource, modelSource      <- de un accesorio
// ----------------------------------------------------------------------------
//
// POR QUE weaponId SIGUE SIENDO EL DE LA VARIANTE BASE
// El nombre del campo no cambio, pero lo que significa cambio: antes era "el
// weaponId de este item", y ahora es "el weaponType de la familia pelada". Para
// 15 de las 16 familias coincide con el de antes. Para la colt45 es 63 y no 22,
// y esa es una diferencia de comportamiento DEL SHIM, no del modelo: el
// weaponType real de un arma montada lo decide resolveWeaponType con la lista de
// accesorios, y esa es la ruta que la fase 3 pone en todas partes.
//
// O sea: mientras Ballistic siga leyendo weaponId para decidir que tipo tiene el
// ped, seguira leyendo el de la base. La correccion es de la fase 3, y por eso
// weapon_data.js:103 (weaponId 22) todavia esta ahi y por eso el shim no lo toca.
function _legacyFamilyRow(fam, weaponIdOverride) {
    var base = _baseVariantOf(fam.family);
    var r = {
        itemId: fam.itemId,
        family: fam.family,
        name: fam.name,
        slot: fam.slot,
        damage: fam.damage,
        fireRate: fam.fireRate,
        range: fam.range,
        reloadTime: null,
        accuracy: fam.accuracy,
        ammoType: fam.ammoType,
        category: fam.category,
        realWorldName: fam.realWorldName,
        weight: fam.weight,
        isLong: fam.isLong,
        price: fam.price,
        weaponId: (weaponIdOverride !== undefined && weaponIdOverride !== null)
            ? weaponIdOverride
            : (base ? base.weaponType : null),
        modelId: base ? base.modelId : null,
        clipSize: fam.baseClip
    };
    // Los cargadores del arma, en el orden de la tabla de accesorios, con el
    // nombre VIEJO cuando el accesorio tiene alias.
    //
    // Y con nombre viejo a proposito: `magIds` es lo que Ballistic usa para
    // elegir que cargador montar y para rellenar el `magId` del registro, y el
    // inventario todavia guarda `mag_colt45_extended`. Si esta lista devolviera
    // el nombre nuevo, el cargador que devuelve el arma no existiria en el
    // inventario y la recarga no tendria con que cambiar. Ver ATTACHMENT_ALIASES.
    var mags = [];
    for (var i = 0; i < WEAPON_ATTACHMENTS.length; i++) {
        var a = WEAPON_ATTACHMENTS[i];
        if (a.type === "magazine" && a.compatibleFamilies.indexOf(fam.family) !== -1) {
            mags.push(_idVivoDe(a.id));
        }
    }
    r.magIds = mags;
    r.magId = mags.length ? mags[0] : null;
    return r;
}

// El nombre que el INVENTARIO usa para un accesorio: el viejo si tiene alias,
// el canonico si no.
function _idVivoDe(canonico) {
    for (var viejo in ATTACHMENT_ALIASES) {
        if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_ALIASES, viejo)) continue;
        if (ATTACHMENT_ALIASES[viejo] === canonico) return viejo;
    }
    return canonico;
}

function _legacyAttachmentRow(att) {
    var id = _idVivoDe(att.id);
    return {
        itemId: id,
        name: att.name,
        category: att.type === "magazine" ? "Cargadores" : "Accesorios",
        realWorldName: att.realWorldName,
        weight: att.weight,
        price: att.price,
        weaponId: null,
        slot: null,
        modelId: null,
        clipSize: null,
        // `capacity` y no `clipSize`: el cargador tiene SU capacidad, no la del
        // arma. Es la diferencia que hace que un tambor de 75 no se recorte.
        capacity: att.clipSize,
        // isLong NO se pone: es una propiedad del arma, no de la pieza. Las
        // cuatro filas que lo tenian en el dato viejo estan en LEGACY_IS_LONG.
        isLong: LEGACY_IS_LONG[id] === true ? true : undefined,
        family: null
    };
}

var _WEAPON_DATA = (function () {
    var out = [];
    for (var f = 0; f < WEAPON_FAMILIES.length; f++) out.push(_legacyFamilyRow(WEAPON_FAMILIES[f]));
    for (var a = 0; a < WEAPON_ATTACHMENTS.length; a++) out.push(_legacyAttachmentRow(WEAPON_ATTACHMENTS[a]));
    for (var r = 0; r < WEAPON_ARMOR.length; r++) {
        var arm = WEAPON_ARMOR[r];
        out.push({
            itemId: arm.itemId, name: arm.name, category: arm.category,
            realWorldName: arm.realWorldName, weight: arm.weight, price: arm.price,
            weaponId: null, slot: null, modelId: arm.modelId, clipSize: null,
            family: null
        });
    }
    // Una fila mas por cada id viejo, para que el inventario que todavia usa el
    // nombre viejo lo encuentre. Misma pieza, dos nombres, y Phase 4 saca la vieja.
    for (var alias in ATTACHMENT_ALIASES) {
        if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_ALIASES, alias)) continue;
        var att = getAttachmentById(alias);
        if (!att) continue;
        var fila = _legacyAttachmentRow(att);
        fila.itemId = alias;
        fila.legacyAliasOf = att.id;
        out.push(fila);
    }
    return out;
})();

export var WEAPON_DATA = _WEAPON_DATA;

function _buildRegistry() {
    var byItem = {};
    var aliases = {};
    for (var i = 0; i < _WEAPON_DATA.length; i++) {
        var w = _WEAPON_DATA[i];
        if (w.itemId !== null && w.itemId !== undefined && !byItem[w.itemId]) byItem[w.itemId] = w;
    }
    // No hay indice `byWeapon`. Nadie pregunta "que fila tiene ESTE weaponId": la
    // identidad de un arma es la familia mas sus accesorios, y el weaponType se
    // DERIVA con resolveWeaponType(). Un indice por numero seria el segundo
    // modelo por la puerta de atrás, y ademas no tendria nada que guardar: solo
    // las 16 filas de arma base tienen weaponId, y ninguna lo comparte.
    //
    // `aliases` queda porque WEAPON_ALIASES es parte del shim, pero hoy esta
    // vacio: solo se llenaba cuando dos filas compartian weaponId, y ya no hay
    // dos. Los renombres de items los resuelve SaveMigration con su propio
    // ITEM_RENAMES.
    return { byItem: byItem, aliases: aliases };
}

var _REG = _buildRegistry();

// itemId que comparte weaponId con otra entrada -> itemId de su canonico.
export var WEAPON_ALIASES = _REG.aliases;

export function getWeaponByItemId(itemId) {
    if (!itemId) return null;
    return _REG.byItem[itemId] || null;
}

// De quien es la capacidad de un arma. Ver CLIP_SOURCE_*.
export var CLIP_SOURCE_CATALOG = "catalog";
export var CLIP_SOURCE_ENGINE = "engine";
export var MODEL_SOURCE_NATIVE = "native";
export var MODEL_SOURCE_SPECIAL = "special";

// ---------------------------------------------------------------------------
// SE QUITAN LOS SEIS ACCESORES POR weaponId
// ---------------------------------------------------------------------------
// getWeaponByWeaponId, getClipSizeByWeaponId, getMagIdByWeaponId,
// getMagIdsByWeaponId, getModelIdByWeaponId y getModelSourceByWeaponId.
//
// Eran el vehiculo del segundo modelo. `getWeaponByWeaponId(22)` contestaba la
// fila de la Colt, y con ese numero el modulo de armas decidia que weaponType
// tiene el ped en la mano. Eso es la identidad por weaponId, que es justo lo que
// esta fuente ya no tiene: la identidad es la familia y el weaponType se deriva
// de la lista de accesorios.
//
// Que no quede ningun consumidor esta verificado: los ocho modulos que importan
// de aca usan getWeaponByItemId, getClipSizeByItemId, getSellPrice,
// getWeaponPrice, getMagValue, isLongWeapon o hasLongWeapon. Ninguno pregunta por
// un weaponId.
//
// Y con ellos se fue `LEGACY_WEAPON_TYPES` (ver mas arriba), que existia
// UNICAMENTE para que getWeaponByWeaponId(22) siguiera contestando la Colt y el
// reconciliador no la borrara del inventario. El reconciliador nuevo normaliza el
// 22 al 63 por otra via, y no necesita el puente.
// ---------------------------------------------------------------------------

export function getClipSource(itemId) {
    var w = getWeaponByItemId(itemId);
    if (!w) return CLIP_SOURCE_CATALOG;
    return w.clipSource || CLIP_SOURCE_CATALOG;
}

export function getModelSource(itemId) {
    var w = getWeaponByItemId(itemId);
    if (!w) return MODEL_SOURCE_NATIVE;
    return w.modelSource || MODEL_SOURCE_NATIVE;
}

// Capacidad de un item: de un cargador (mag_*) o de un arma.
//
//   1. la que declara la entrada misma (`capacity`). Un cargador tiene SU
//      capacidad, y por eso un tambor de 75 no es el clipSize del AK de 30.
//   2. la del arma que alimenta, por el strip del prefijo "mag_". Derivar evita
//      el mismo numero en dos lugares que pueden divergir sin que nada avise.
//   3. el clipSize de la entrada, cuando el item ES el arma.
//
// OJO: esto es la capacidad DECLARADA, para la UI y el dealer. La que manda en
// runtime la lee Engine.clipCapacityOf() del weaponType, porque la escribio el
// .asi. Y hay una diferencia que se va a notar: el micro_uzi declara 30 y el juego
// tiene 50. Ver "LO QUE NO ES LA FUENTE DE LA CAPACIDAD".
export function getClipSizeByItemId(itemId) {
    if (!itemId) return null;
    var w = getWeaponByItemId(itemId);
    if (w && w.capacity !== null && w.capacity !== undefined) return w.capacity;
    if (itemId.indexOf("mag_") === 0) {
        var gun = getWeaponByItemId(itemId.slice(4));
        if (gun && gun.clipSize !== null && gun.clipSize !== undefined) return gun.clipSize;
    }
    if (!w || w.clipSize === null || w.clipSize === undefined) return null;
    return w.clipSize;
}

// Un id es cargador si su entrada tiene category "Cargadores". Preguntar por la
// CATEGORIA y no por el prefijo "mag_": el prefijo es una convencion de nombres.
function _esCargador(id) {
    var w = getWeaponByItemId(id);
    return !!(w && w.category === "Cargadores");
}

// El valor de UNA bala. Es lo unico que hace que un cargador lleno valga mas que
// uno vacio.
//
// $2 y no mas por una razon que solo se ve con los datos de ESTE mod: un
// cargador de minigun tiene 500 "balas", y a $5 valdria $3.400, un 23% del
// minigun entero. A $2 vale $1.900, un 13%. Que la municion sea siempre la
// MINORIA del valor del par (cargador + arma) es lo que mantiene esta economia.
export var PRECIO_BALA = 2;

// Valor de mercado de un CARGADOR: su precio + una bala por cada bala que le
// queda. Recibe la INSTANCIA ({id, ammo}), no el id, porque el ammo es estado.
export function getMagValue(instancia) {
    if (!instancia) return 0;
    var id = (typeof instancia === "string") ? instancia : instancia.id;
    if (_esCargador(id)) {
        var w = getWeaponByItemId(id);
        if (!w || !w.price) return 0;
        var ammo = (typeof instancia === "string") ? 0 : (instancia.ammo || 0);
        return w.price + (ammo > 0 ? ammo * PRECIO_BALA : 0);
    }
    return getSellPrice(id);
}

export function getWeaponPrice(itemId) {
    var weapon = getWeaponByItemId(itemId);
    return weapon ? (weapon.price || 0) : 0;
}

// Valor de mercado para trueque: price * 0.6 redondeado a multiplos de 10.
export function getSellPrice(itemId) {
    var weapon = getWeaponByItemId(itemId);
    if (!weapon || !weapon.price) return 0;
    return Math.round((weapon.price * 0.6) / 10) * 10;
}

export function isLongWeapon(itemId) {
    var weapon = getWeaponByItemId(itemId);
    return !!(weapon && weapon.isLong);
}

export function hasLongWeapon(items) {
    if (!items || !items.length) return false;
    for (var i = 0; i < items.length; i++) {
        if (isLongWeapon(items[i].id)) return true;
    }
    return false;
}

// ============================================================================
// REPORTES, QUE NO SON FALLOS
// ============================================================================
// Lo que sigue esta bien que este como este, y son las tres listas de trabajo de
// las fases que siguen. No van en validateWeapons(), que devuelve fallos: un
// alias vivo es lo correcto hasta que se renombre el item, y una variante de
// plugin pendiente es una decision que todavia no se tomo.
//
// Que se calculen y no se escriban a mano es lo que los hace confiables: si
// manana se declara una variante, mag_ak47_drum desaparece de la lista solo.
export function pluginSlotUsage() {
    var usados = getPluginWeaponTypes();
    var total = PLUGIN_TYPE_MAX - PLUGIN_TYPE_MIN + 1;
    return { usados: usados.length, total: total, libres: total - usados.length, tipos: usados };
}

export function pendingDataWork() {
    return {
        aliases: liveAttachmentAliases(),
        tiposDePluginFaltantes: pendingPluginTypes(),
        accesoriosNoMontables: attachmentsWithoutVariant().filter(function (x) { return !x.sePuedeMontar; })
    };
}
