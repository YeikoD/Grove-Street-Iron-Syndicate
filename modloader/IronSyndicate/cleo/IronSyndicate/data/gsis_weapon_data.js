// GSIS - Weapon Data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// Import del UNICO lado de este archivo. La dependencia va en una sola
// direccion: weapon_variants no importa nada de aca, asi que el grafo es aciclico
// y los dos archivos siguen siendo datos puros, sin log ni natives.
import { getVariantProfile } from "./gsis_weapon_variants.js";

// GSIS Weapon Data - Armas de fuego de GTA SA (stats y IDs reales del juego)
// Fuentes: SA-MP/open.mp (weaponId, modelId, clip), gtabase.com (damage/fireRate/range/accuracy),
//          gta.fandom.com/es (nombres HUD ES), gtabase (realWorldName)
// isLong: arma larga (escopeta completa, fusil, pesada) → habilita Bag si hay >=1 en inventario
// magId: cargador (ITEMS type magazine) que consume esa arma al recargar
//
// ============================================================================
// price — COMO ESTA CALIBRADO (leer antes de tocar un numero)
// ============================================================================
// El precio es de dos cosas a la vez, y conviene no confundirlas:
//
//   1. Base de catálogo: la que paga el jugador en el dealer (getDealerPrice =
//      price × markup del personaje) cuando el dealer no tiene precio fijo.
//   2. Base de revalorización: el "Valor" de la fila del inventario y el punto
//      de partida del trueque (getSellPrice = price × 0.6, redondeado a 10).
//
// NO es la "Venta" de la calle del doc de economía (gsis_ECONOMY.md §2), que es
// otro canal: ahí se venden productos de crafteo por muy arriba del costo de sus
// materiales (5x a 29x sobre materiales de $50-$200). Ese canal no lee estos
// numeros, asi que este precio se puede mover sin tocar los margenes del crafteo.
//
// Que la cifra se parezca al mundo real significa el ORDEN y la MAGNITUD
// RELATIVA, no el dolar 1:1. Tomar los dolares reales al pie de la letra daria
// una 9mm silenciada a $1.900 y un chaleco a $450, o sea el chaleco mas barato
// del juego y la pistola mas cara que un AK-47: el precio de un arma con
// silenciador incluye el impuesto NFA y el papeleo, y en un mundo sin eso el
// orden se da vuelta. Asi que la tabla real se usa como PESO y se la lleva a la
// banda que la economia ya soporta (~$450 el arma mas barata, $15.000 la mas
// cara), con la 9mm a $550 como ancla.
//
// Referencia real (USD, EE.UU.) → price:
//
//   id                 real                         price   nota
//   9mm                500 - 650                    550      ancla
//   silenced_9mm       1.600 - 2.200                1.800    +NFA tax y papeleo
//   desert_eagle       1.800 - 2.200                1.950
//   tec9                 500 - 800                    600    descontinuada, mas cara por antiguedad
//   micro_uzi         1.500 - 2.500                  1.900    version civil semiautomatica
//   mp5                 700 - 1.000                    800    sin dato del usuario: Propuesto
//   shotgun             400 - 550                    450    Remington 870: el arma mas barata
//   sawed_off           300 - 500 + 200 tax            500    sin dato: Propuesto
//   combat_shotgun    2.500 - 4.000                  3.100    SPAS-12, rara y descontinuada
//   country_rifle       700 - 1.100                    850    Marlin 336
//   ak47                800 - 1.200                    950    AKM/WASR-10 semiautomatico
//   m4_assembled        800 - 1.500                  1.100    AR-15 civil
//   sniper_rifle     1.800 - 3.500                  2.500    Rem 700 / M24 segun el visor
//   body_armor          300 - 600                    1.200    DESVIACION, ver abajo
//   rpg                 sin dato                    6.500    Propuesto
//   flamethrower        sin dato                    7.500    Propuesto
//   heat_seeker         sin dato                   11.000    Propuesto
//   minigun             sin dato                   15.000    Propuesto
//   pistol_assembled     —                               0    duplicado del 9mm, no vende
//
// DESVIACION CONOCIDA — body_armor a 1.200 y no 450. El soft armor IIIA de
// verdad sale 300-600, asi que por relacion puro tocaria ~450 y el chaleco
// seria el item mas barato del juego. El item no es soft armor: pesa 2 kg y su
// receta lleva armor_plate, o sea portaplacas, y un portaplacas con placas
// esta en 800-1.600. Se sigue la referencia del objeto, no la de la categoria.
//
// LOS CUATRO PESADOS (rpg, flamethrower, heat_seeker, minigun) no tienen
// mercado civil, asi que su precio real no existe como ancla. Se ordenan por
// costo militar: el RPG-7 es el mas barato de los cuatro (lanzador ~$1.200 y
// un cohete PG-7 ~$1.000, o sea ~$2.200 el sistema) y el M134 el mas caro
// ($150.000-$200.000 con alimentacion). Quedan arriba de todo lo civilian, que
// es lo que quiere el juego: son el final del juego.
//
// pistol_assembled queda en 0 a proposito: es el mismo weaponId que 9mm, y si
// tuviera precio el jugador podria comprar y revender la misma pistola dos
// veces. getDealerPrice devuelve 0 para price 0, asi que no aparece en el
// catalogo; y getSellPrice tambien, asi que el trueque la ignora.
// ============================================================================

export const WEAPON_DATA = [
    // ========================================================================
    // FAMILIA colt45  — el item de inventario
    // ========================================================================
    // Esta fila es la IDENTIDAD. weaponId 22 es solo la variante BASE (sin
    // accesorios): el .dat no esta atado al item, y por eso el mismo "colt45"
    // aparece en el collar con el tipo 22, 60, 23 o 61 segun que tenga montado.
    //
    // clipSize 8: la Colt .45 de vanilla (weapon.dat, fila 22) lleva 8 balas en
    // el cargador, no 17. Lo de 17 venia de que esta fila se copio de la Glock.
    //
    // Las otras configuraciones NO son filas aca: son WEAPON_VARIANTS en
    // gsis_weapon_variants.js, que es donde vive la tabla familia+accesorios ->
    // weaponType. Ver getWeaponProfileByWeaponId, que es el helper que Ballistic
    // usa para preguntar por cualquier tipo, sea de familia o no.
    {
        itemId: "colt45",
        magIds: ["mag_colt45", "mag_colt45_replica", "mag_colt45_extended"],
        magId: "mag_colt45",
        family: "colt45",
        name: "Colt .45",
        weaponId: 22,
        modelId: 346,
        slot: 2,
        clipSize: 8,
        damage: 25,
        fireRate: 20,
        range: 30,
        reloadTime: null,
        accuracy: 25,
        ammoType: ".45 ACP",
        category: "Pistolas",
        realWorldName: "Colt M1911A1",
        weight: 1.5,
        isLong: false,
        price: 550
    },
    // Pistolas
    // La pistola con silenciador YA NO ESTA ACA. Era un segundo item de
    // inventario, con su precio y su fila, cuando en la realidad es la misma
    // Colt .45 con un silenciador montado. Ahora es la variante weaponType 23 de
    // la familia colt45, y el silenciador se compra suelto como accesorio.
    //
    // El weaponType 23 no desaparece: sigue siendo el que ejecuta el arma con
    // silenciador, y sigue teniendo su anim, su sonido y su modelo (347) de
    // vanilla. Lo que se fue es la fila de inventario.
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
        price: 1950
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
        price: 450
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
        price: 500
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
        price: 3100
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
        price: 1900
    },
    {
        itemId: "mp5",
        magIds: ["mag_mp5", "mag_mp5_replica"],
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
        price: 800
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
        // VARIANTES: el AK es un arma con tres cargadores de 30 y uno de 75. No
        // son cuatro armas: es el mismo AK con distintos cargadores, y lo que
        // cambia al montarlos es la capacidad que el motor usa para el TIPO DE
        // ARMA. Por eso magId sigue siendo el de por defecto (el acero, que es el
        // que venia) y la lista nueva es la que consulta la recarga.
        magIds: ["mag_ak47", "mag_ak47_polymer", "mag_ak47_bulgarian", "mag_ak47_drum"],
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
        price: 950
    },
    {
        itemId: "m4_assembled",
        magIds: ["mag_m4_assembled", "mag_m4_polymer", "mag_m4_lancer", "mag_m4_drum"],
        magId: "mag_m4_assembled",
        name: "M4",
        weaponId: 31,
        modelId: 356,
        slot: 5,
        // 30, no 50. El STANAG real son 30, y con 50 la progresion de cargadores
        // era incoherente: el "extendido" de 40 seria PEOR que el estandar de 50
        // y el D-60 solo sumaria 10. Con 30 el polimero queda igual, y el Lancer
        // (40) y el D-60 (60) suben de verdad.
        clipSize: 30,
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
        price: 1100
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
        price: 850
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
        price: 2500
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
        price: 6500
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
        price: 11000
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
        price: 7500
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
        price: 1200
    },

    // ==========================================================================
    // CARGADORES (type magazine en ITEMS)
    // ==========================================================================
    // Viven en WEAPON_DATA y no en ITEMS porque el PRECIO tiene que ser legible
    // por el dealer (getDealerPrice) y por la columna Valor (getSellPrice /
    // getMagValue), y los dos leen de aca. Si el precio estuviera en ITEMS habria
    // que duplicar la regla de "de donde sale el precio de las cosas" en dos
    // lugares, que es exactamente la duplicacion que la casa prohibe.
    //
    // LAS TRES NULIDADES SON LO IMPORTANTE — es lo que mantiene estos cargadores
    // fuera de todas las rutas de arma:
    //
    //   weaponId: null  → getMagIdByWeaponId y _itemIdByWeaponId no los matchean
    //                    contra un numero; syncClipSizes los saltea
    //   slot: null      → _weaponDefByItemId los rechaza, o sea no son equipables
    //   magId: null     → un cargador no es "un arma con cargador": el vinculo va al
    //                    reves, y es el ARMA la que declara su magId. Ponerlo aca
    //                    seria una segunda fuente de la misma relacion.
    //   sin clipSize    → (ver abajo)
    //
    // SIN `clipSize` a proposito. La capacidad de un cargador base ES el clipSize
    // de su familia: getClipSizeByItemId("mag_colt45") hace strip del prefijo
    // "mag_" y lee el de "colt45". Copiarlo aca crearia un segundo valor que puede
    // divergir sin que nada avise.
    //
    // OJO con los nombres: el catalogo de ITEMS llama "Cartucho ..." a los de
    // escopeta, rifle y francotirador, no "Cargador". No es un descuido, es que en
    // el mod son TUBOS (clipSize 1 en el rifle y el francotirador, y la escopeta
    // recarga cartucho a cartucho). El precio lo ancla la pieza real equivalente:
    // un tubo de extension, no una caja desmontable.
    {
        itemId: "mag_colt45",
        magId: null,
        name: "Cargador Colt .45",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "Colt 1911 magazine 8 rds",
        isLong: false,
        price: 220
    },
    {
        itemId: "suppressor",
        magId: null,
        name: "Silenciador",
        weaponId: null,
        slot: null,
        category: "Accesorios",
        realWorldName: "Colt M1911A1 con silenciador",
        isLong: false,
        price: 1200
    },
    // ========================================================================
    // VARIANTES DE CARGADOR
    // ========================================================================
    // Un arma con varias variantes de cargador NO es un arma con variantes: es
    // el MISMO arma con distintos cargadores, y lo unico que cambia al montarlos
    // es la capacidad que el motor usa para ese tipo de arma. El arma vive en
    // una sola fila de la tabla; el cargador se cambia en el cinturon.
    //
    // Por eso los de abajo declaran su `capacity` y NO la derivan por el
    // prefijo "mag_": la convencia era "mag_" + <itemId del arma>, y estos no
    // siguen ese nombre (mag_ak47_drum apunta a mag_ak47_drum, que no es un
    // arma). Declararla es tambien lo que hace explicito lo que se esta
    // comprando: un tambor de 75 SIEMPRE tiene 75, y no "las que le queden al
    // arma".
    {
        itemId: "mag_colt45_replica",
        magId: null,
        name: "Cargador Colt .45 replica",
        weaponId: null,
        slot: null,
        capacity: 8,
        category: "Cargadores",
        realWorldName: "Colt .45 magazine replica 8 rds",
        isLong: false,
        price: 18
    },
    {
        itemId: "mag_colt45_extended",
        magId: null,
        name: "Cargador Colt .45 extendido",
        weaponId: null,
        slot: null,
        capacity: 15,
        category: "Cargadores",
        realWorldName: "Colt .45 extended magazine 15 rds",
        isLong: false,
        price: 45
    },
    {
        itemId: "mag_mp5_replica",
        magId: null,
        name: "Cargador MP5 replica",
        weaponId: null,
        slot: null,
        capacity: 30,
        category: "Cargadores",
        realWorldName: "Cargador 9x19 30 rds replicado",
        isLong: false,
        price: 38
    },
    {
        itemId: "mag_ak47_polymer",
        magId: null,
        name: "Cargador AK polimero",
        weaponId: null,
        slot: null,
        capacity: 30,
        category: "Cargadores",
        realWorldName: "AK polymer 5.45x39 30 rds",
        isLong: false,
        price: 16
    },
    {
        itemId: "mag_ak47_bulgarian",
        magId: null,
        name: "Cargador AK bulgaro",
        weaponId: null,
        slot: null,
        capacity: 30,
        category: "Cargadores",
        realWorldName: "AK Bulgarian 5.45x39 30 rds",
        isLong: false,
        price: 48
    },
    {
        itemId: "mag_ak47_drum",
        magId: null,
        name: "Cargador AK tambor",
        weaponId: null,
        slot: null,
        capacity: 75,
        category: "Cargadores",
        realWorldName: "Drum 5.45x39 75 rds",
        isLong: false,
        price: 140
    },
    {
        itemId: "mag_m4_polymer",
        magId: null,
        name: "Cargador M4 polimero",
        weaponId: null,
        slot: null,
        capacity: 30,
        category: "Cargadores",
        realWorldName: "STANAG polymer 5.56x45 30 rds",
        isLong: false,
        price: 16
    },
    {
        itemId: "mag_m4_lancer",
        magId: null,
        name: "Cargador M4 Lancer",
        weaponId: null,
        slot: null,
        capacity: 40,
        category: "Cargadores",
        realWorldName: "Lancer 5.56x45 40 rds",
        isLong: false,
        price: 25
    },
    {
        itemId: "mag_m4_drum",
        magId: null,
        name: "Cargador M4 D-60",
        weaponId: null,
        slot: null,
        capacity: 60,
        category: "Cargadores",
        realWorldName: "Magpul D-60 5.56x45 60 rds",
        isLong: false,
        price: 135
    },
    {
        itemId: "mag_desert_eagle",
        magId: null,
        name: "Cargador Desert Eagle",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "IWI .50 AE 7/8 acero",
        isLong: false,
        price: 480
    },
    {
        itemId: "mag_shotgun",
        magId: null,
        name: "Tubo extension Remington",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "Tubo de deposito Remington 870",
        isLong: false,
        price: 330
    },
    {
        itemId: "mag_sawed_off",
        magId: null,
        name: "Tubo recortada",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "Doble cañón recortado, 2 tiros",
        isLong: false,
        price: 180
    },
    {
        itemId: "mag_combat_shotgun",
        magId: null,
        name: "Tubo completo SPAS 12",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "Franchi SPAS-12 tubo 8 cartuchos",
        isLong: false,
        price: 620
    },
    {
        itemId: "mag_micro_uzi",
        magId: null,
        name: "Cargador Micro Uzi",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "IMI Micro Uzi 20/32 9mm acero",
        isLong: false,
        price: 260
    },
    {
        itemId: "mag_tec9",
        magId: null,
        name: "Cargador Tec9",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "Intratec DC-9 20/30 acero",
        isLong: false,
        price: 280
    },
    {
        itemId: "mag_mp5",
        magId: null,
        name: "Cargador MP5",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "H&K MP5 30 original",
        isLong: false,
        price: 540
    },
    {
        itemId: "mag_ak47",
        magId: null,
        name: "Cargador AK-47",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "AKM 30 balas acero surplus",
        isLong: false,
        price: 300
    },
    {
        itemId: "mag_m4_assembled",
        magId: null,
        name: "Cargador M4",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "STANAG 30 USGI",
        isLong: false,
        price: 320
    },
    {
        itemId: "mag_country_rifle",
        magId: null,
        name: "Tubo Marlin 336",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "Marlin 336, 5-6 en el tubo",
        isLong: false,
        price: 400
    },
    {
        itemId: "mag_sniper_rifle",
        magId: null,
        name: "Cargador AICS",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "AICS desmontable 5-10",
        isLong: false,
        price: 450
    },
    {
        itemId: "mag_rpg",
        magId: null,
        name: "Cohete RPG",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "PG-7 V2, 1 cohete",
        isLong: true,
        price: 900
    },
    {
        itemId: "mag_heat_seeker",
        magId: null,
        name: "Misil heat seeker",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "SA-7 Grail, 1 misil guiado",
        isLong: true,
        price: 1200
    },
    {
        itemId: "mag_flamethrower",
        magId: null,
        name: "Deposito flamethrower",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "Deposito de napalm M2",
        isLong: true,
        price: 700
    },
    {
        itemId: "mag_minigun",
        magId: null,
        name: "Caja de municion minigun",
        weaponId: null,
        slot: null,
        category: "Cargadores",
        realWorldName: "Caja alimentadora M134",
        isLong: true,
        price: 900
    }
];

// ============================================================================
// REGISTRO — indice y resolucion de un weaponId a una entrada
// ============================================================================
// La tabla se recorria a mano en varios lugares del mod (recarga, streaming,
// reconciliacion) y cada recorrida llevaba su propio `.find` con "primer match
// gana". Eso hacia que un weaponId duplicado se resolviera por el orden del
// array sin que nadie lo hubiera decidido: hoy `9mm` y `pistol_assembled`
// comparten el 22, y el canonico es `9mm` solo porque esta primero.
//
// Los indices son la fuente unica. El canonico de un weaponId es SIEMPRE la
// primera entrada con ese weaponId — que es lo que ya resolvian las cuatro
// busquedas — pero escrito en un lugar en vez de repetido en cuatro. Los
// duplicados quedan anotados en WEAPON_ALIASES en vez de ser un accidente:
// `pistol_assembled` es el mismo arma que `9mm` con precio 0 (ver el bloque de
// arriba), asi que es un alias, no un error.
//
// Un weaponId fuera de la tabla —un tipo que registro un .ASI, por ejemplo— NO
// es un dato basura: es un arma del motor que el mod todavia no conoce. Por eso
// esto devuelve null y no inventa nada. Ver gsis_WEAPONS.md.
function _buildRegistry() {
    var byItem = {};
    var byWeapon = {};
    var aliases = {};
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        var w = WEAPON_DATA[i];
        if (w.itemId !== null && w.itemId !== undefined && !byItem[w.itemId]) byItem[w.itemId] = w;
        if (w.weaponId === null || w.weaponId === undefined) continue;
        if (!byWeapon[w.weaponId]) byWeapon[w.weaponId] = w;
        else aliases[w.itemId] = byWeapon[w.weaponId].itemId; // duplicado: alias del canonico
    }
    return { byItem: byItem, byWeapon: byWeapon, aliases: aliases };
}

var _REGISTRY = _buildRegistry();

// itemId que comparte weaponId con otra entrada -> itemId de su canonico.
// Hoy: { pistol_assembled: "9mm" }. Se exporta para poder consultarlo desde la
// UI y los checks sin volver a recorrer la tabla.
export var WEAPON_ALIASES = _REGISTRY.aliases;

// ============================================================================
// CAPACIDAD - quien la tiene, y de donde sale
// ============================================================================
// Techo de weaponId nativo. CWeaponInfo::aWeaponInfo tiene lugar cerrado para 70
// entradas (IDs 0-69); weapon.dat tiene mas lineas, pero de la 70 en adelante son
// definiciones de modelo, no armas equipables. Un weaponId mayor lo registro un
// plugin. Vive ACÁ y no en Ballistic para que la tabla y el modulo que la consume
// no tengan dos copias del mismo numero que puedan desincronizarse.
export var WEAPON_ID_NATIVE_MAX = 69;

// De quien es la capacidad de un arma:
//
//   "catalog"  el mod. Su clipSize es la verdad y syncClipSizes escribe la
//              CWeaponInfo del motor para que coincidan. Es el caso de las 18
//              armas del catalogo.
//   "engine"   el motor. La CWeaponInfo la dio de alta un plugin y su
//              m_nAmmoClip es la verdad. El mod la LEE y no la escribe: pisar
//              la capacidad seria dejarle al arma la del base, que es
//              exactamente lo que el .ASI vino a evitar.
//
// El default es "catalog": una entrada nueva es del mod hasta que diga otra cosa.
export var CLIP_SOURCE_CATALOG = "catalog";
export var CLIP_SOURCE_ENGINE = "engine";

// De donde sale el modelo 3D del arma:
//
//   "native"   un modelId del juego (346-373). Es el default: las 18 armas del
//              catalogo usan modelos vanilla.
//   "special"  un modelId del rango reservado a armas custom
//              (SPECIAL_MODELS.WEAPON_RANGE). Lo registro un plugin en
//              CModelInfo::ms_modelInfoPtrs, asi que YA esta en la memoria del
//              juego y no es algo que el mod pueda pedir con REQUEST_MODEL.
//
// La diferencia importa por un caso que no se ve solo: si el modelo no esta,
// el arma se da igual pero sale INVISIBLE en la mano. Con "special" el mod
// verifica que exista y avisa, en vez deassume que el plugin hizo su parte.
export var MODEL_SOURCE_NATIVE = "native";
export var MODEL_SOURCE_SPECIAL = "special";

// Helper: arma por itemId del catalogo ITEMS
export function getWeaponByItemId(itemId) {
    if (!itemId) return null;
    return _REGISTRY.byItem[itemId] || null;
}

// Helper: entrada de catalogo por weaponId del juego (22 -> la entrada "9mm").
// Es el canonico de ese weaponId. null si el mod no conoce el weaponId.
// ============================================================================
// PUENTE CON LAS VARIANTES
// ============================================================================
// Todo lo de arriba resuelve por "un item de inventario = un weaponId". Eso era
// cierto mientras cada configuracion era un item, y deja de serlo con las
// variantes: la colt45 tiene cuatro weaponTypes (22, 60, 23, 61) y UN item.
//
// Sin este puente, los ~30 lugares del mod que llaman a getModelIdByWeaponId o
// getClipSizeByWeaponId con el tipo que tiene el ped en la mano devolverian null
// para tres de los cuatro casos de la colt45, y el arma aparecia sin modelo o sin
// capacidad.
//
// El puente devuelve la MISMA forma de objeto que devuelve WEAPON_DATA, con los
// campos que dependen del tipo sobreescritos por los de la variante. Asi el
// resto del mod no necesita saber que existen las variantes: sigue leyendo un
// objeto con itemId, modelId, clipSize y magIds.
//
// Por que NO se meten las variantes adentro de _buildRegistry: el registro se
// construye con "el primero con ese weaponId gana", y las variantes no son
// entradas propias de WEAPON_DATA — son filas de otra tabla. Meterlas ahi
// obligaria a duplicar precio y categoria de la familia en cada variante, que es
// justamente el dato que tiene que ser UNO por arma.
function _aplicarVariante(w, weaponId) {
    if (!w) return null;
    var v = getVariantProfile(weaponId);
    if (!v) return w;

    // El itemId es el de la FAMILIA, no el de la variante: en el collar hay una
    // sola colt45, mounts o no. Es el punto entero del refactor.
    var r = {};
    for (var k in w) {
        if (Object.prototype.hasOwnProperty.call(w, k)) r[k] = w[k];
    }
    if (v.modelId !== null && v.modelId !== undefined) r.modelId = v.modelId;
    if (v.clipSize !== null && v.clipSize !== undefined) r.clipSize = v.clipSize;
    if (v.itemId) r.itemId = v.itemId;
    r.family = v.family;
    r.variantAttachments = v.attachments;
    r.variantWeaponType = v.weaponType;
    return r;
}

// El helper que Ballistic y el resto del mod usan para "de que arma se trata".
//
// La diferencia con getWeaponByWeaponId es lo unico: este devuelve un objeto
// YA RESUELTO para el tipo concreto. Los que no son de ninguna familia devuelven
// la fila de WEAPON_DATA tal cual, sin cambios, que es lo que pasaba antes.
export function getWeaponByWeaponId(weaponId) {
    if (weaponId === null || weaponId === undefined) return null;
    var base = _REGISTRY.byWeapon[weaponId];
    if (base) return _aplicarVariante(base, weaponId);
    // Un tipo de variante puede no estar en WEAPON_DATA (el 60 y el 61 no lo
    // estan: son configuraciones, no items). Se busca por la familia.
    var v = getVariantProfile(weaponId);
    if (v) {
        var fam = _REGISTRY.byItem[v.itemId];
        if (fam) return _aplicarVariante(fam, weaponId);
    }
    return null;
}

// Helper: cargador (itemId mag_*) del arma equipada, por weaponId del juego.
// Usado por Ballistic en la recarga (22 → "mag_9mm"). null si el arma no tiene cargador.
export function getMagIdByWeaponId(weaponId) {
    var weapon = getWeaponByWeaponId(weaponId);
    return (weapon && weapon.magId) || null;
}

// Helper: TODOS los cargadores que acepta un arma, en orden de preferencia.
//
// Antes un arma tenía UN cargador (`magId`) y la recarga exigía exactamente ese.
// Con variantes de capacidad eso ya no alcanza: el AK de 30 y el tambor de 75 son
// el MISMO arma con dos cargadores distintos, y el jugador elige. Entonces el
// arma declara la lista y el cinturon resuelve cuál se monta.
//
// Cuando `magIds` no está, cae al `magId` de siempre: las 20 armas que no tienen
// variantes no cambian de comportamiento, y una entrada nueva no necesita
// acordarse de declarar una lista de un solo elemento.
export function getMagIdsByWeaponId(weaponId) {
    var w = getWeaponByWeaponId(weaponId);
    if (!w) return [];
    if (w.magIds && w.magIds.length) return w.magIds;
    return w.magId ? [w.magId] : [];
}

// Helper: modelo 3D del arma por weaponId del juego (22 → 346).
// Lo usa Ballistic antes de GIVE_WEAPON_TO_CHAR: 01B2 pide el modelo con
// REQUEST_MODEL o el arma puede no verse en la mano del ped (y segun el doc de
// la opcodes, crashear). null si el weaponId no es del catalogo.
export function getModelIdByWeaponId(weaponId) {
    var weapon = getWeaponByWeaponId(weaponId);
    if (!weapon || weapon.modelId === null || weapon.modelId === undefined) return null;
    return weapon.modelId;
}

// Capacidad declarada por la propia entrada (variantes y accesorios).
// null si la entrada no la trae.
function _ownCapacity(w) {
    if (!w) return null;
    if (w.capacity !== null && w.capacity !== undefined) return w.capacity;
    return null;
}

// De quien es la capacidad de un item (ver CLIP_SOURCE_*). Default "catalog".
export function getClipSource(itemId) {
    var w = getWeaponByItemId(itemId);
    if (!w) return CLIP_SOURCE_CATALOG;
    return w.clipSource || CLIP_SOURCE_CATALOG;
}

// De donde sale el modelo de un item (ver MODEL_SOURCE_*). Default "native".
export function getModelSource(itemId) {
    var w = getWeaponByItemId(itemId);
    if (!w) return MODEL_SOURCE_NATIVE;
    return w.modelSource || MODEL_SOURCE_NATIVE;
}

// Igual, pero por weaponId. Son DOS helpers y no uno con un parametro que
// acepte las dos cosas a propósito: una funcion que resuelve "por id o por
// weaponId" tiene el bug de devolver el default en silencio cuando le pasan la
// que no es, y ese bug es invisible (el default es "native", o sea el
// comportamiento de siempre). Ballistic trabaja con weaponId.
export function getModelSourceByWeaponId(weaponId) {
    var w = getWeaponByWeaponId(weaponId);
    if (!w) return MODEL_SOURCE_NATIVE;
    return w.modelSource || MODEL_SOURCE_NATIVE;
}

// Capacidad de un item: de un cargador (mag_*) o de un arma.
//
// Tres caminos, en orden, y el primero que exista gana:
//
//   1. la que declara la entrada misma (`capacity`). Esto es lo que hace que una
//      variante sea posible: un tambor de 75 NO es el clipSize del AK de 30, es
//      del cargador. La regla de casa de abajo no aplica para estas entradas.
//
//   2. la del arma que alimenta, por el strip del prefijo "mag_". Es la regla de
//      casa y sigue mandando para los cargadores base: para un cargador de 30
//      balas la capacidad de verdad es la del arma, y derivarla evita tener el
//      mismo numero en dos lugares que pueden divergir sin que nada avise.
//
//   3. el clipSize de la entrada, cuando el item ES el arma.
export function getClipSizeByItemId(itemId) {
    if (!itemId) return null;
    var own = _ownCapacity(getWeaponByItemId(itemId));
    if (own !== null) return own;
    if (itemId.indexOf("mag_") === 0) {
        var gun = getWeaponByItemId(itemId.slice(4));
        if (gun && gun.clipSize !== null && gun.clipSize !== undefined) return gun.clipSize;
    }
    var w = getWeaponByItemId(itemId);
    if (!w || w.clipSize === null || w.clipSize === undefined) return null;
    return w.clipSize;
}

// Capacidad del arma con ese weaponId, directo del catalogo. Es lo mismo que
// dar la vuelta por su magId y quitarle el prefijo "mag_", pero sin el rodeo:
// para un arma base da lo mismo, y para una variante da la suya y no la del arma
// base de la que salio.
export function getClipSizeByWeaponId(weaponId) {
    var w = getWeaponByWeaponId(weaponId);
    if (!w) return null;
    var own = _ownCapacity(w);
    if (own !== null) return own;
    if (w.clipSize === null || w.clipSize === undefined) return null;
    return w.clipSize;
}

// ============================================================================
// CARGADORES - valor de mercado con la municion adentro
// ============================================================================
// PRECIO_BALA es el valor de UNA bala. Es la unica pieza que hace que un
// cargador lleno valga mas que uno vacio, y la unica que hay que calibrar para
// que el conjunto tenga sentido.
//
// $2 y no mas por una razon que solo se ve con los datos de ESTE mod: el
// clipSize de un cargador es el del arma, y dos de ellos traen 500 "balas"
// (flamethrower y minigun). A $5, un cargador de minigun valdria 900 + 2.500 =
// $3.400, un 23% del minigun entero, y el lanzallamas casi lo mismo. A $2:
//
//   mag_9mm        220 +  17x2 =  254   (46% de la 9mm,     el mas caro en ratio)
//   mag_mp5        540 +  30x2 =  600   (55% del MP5)
//   mag_minigun    900 + 500x2 = 1.900  (13% del minigun)
//   mag_flameth.   700 + 500x2 = 1.700  (28% del lanzallamas)
//
// El tope real es 57% (Tec-9 y MP5) y el mas bajo 11% (heat seeker). Que la
// municion sea siempre la MINORIA del valor del par (cargador+arma) es lo que
// mantiene esta economia: el cargador es la primera compra util del juego —el
// arma llega sin cargador— pero nunca es el objeto mas caro.
export var PRECIO_BALA = 2;

// Valor de mercado de un CARGADOR: precio del cargador + una bala por cada
// bala que le queda.
//
// Recibe la INSTANCIA ({ id, ammo }), no el id, porque el ammo es estado de la
// fila y no del catalogo: un cargador a medias vale menos que uno lleno, y eso
// no se puede derivar de un id. Por eso NO reemplaza a getSellPrice, que es el
// "valor de trueque" (price x 0.6, sin municion) y sirve para armas.
//
// Para lo que no es cargador devuelve getSellPrice, asi que un solo call site
// alcanza para pintar la columna Valor entera.
export function getMagValue(instancia) {
    if (!instancia) return 0;
    var id = (typeof instancia === "string") ? instancia : instancia.id;
    if (ITEMS_MAG(id)) {
        var w = getWeaponByItemId(id);
        if (!w || !w.price) return 0;
        var ammo = (typeof instancia === "string") ? 0 : (instancia.ammo || 0);
        return w.price + (ammo > 0 ? ammo * PRECIO_BALA : 0);
    }
    return getSellPrice(id);
}

// Un id es cargador si su entrada en WEAPON_DATA tiene category "Cargadores".
// Preguntar por la CATEGORIA y no por el prefijo "mag_" a proposito: el prefijo
// es una convencion de nombres, y el catalogo ya rompio esa convencion (el
// francotirador se llama "Cartucho" en ITEMS). La categoria es el dato.
function ITEMS_MAG(id) {
    var w = getWeaponByItemId(id);
    return !!(w && w.category === "Cargadores");
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
