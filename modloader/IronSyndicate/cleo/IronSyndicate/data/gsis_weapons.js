// GSIS - Weapons data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Que es un arma del mod y a que tipo del motor corresponde. DOS tablas y las
// funciones que las caminan, y nada mas:
//
//   ARMAS        itemId -> { nombre, family, weaponType, slot, precio, peso,
//                           damage, categoria }
//   CARGADORES   itemId -> { nombre, armas[], clipSize, precio, peso }
//
// UN ITEM POR CONFIGURACION, Y POR QUE NO HAY UN RESOLVER
// ---------------------------------------------------------------------------
// El `weaponType` es lo que el motor ejecuta; el `itemId` es lo que el jugador
// tiene en el inventario. Son dos cosas y por eso viven en dos campos.
//
// Cada CONFIGURACION es su propio item, y su `weaponType` esta DECLARADO aqui
// de forma directa: `colt45_silenced` es el 60, `colt45_c15_silenced` es el 61.
// No hay `family + attachments -> tipo`: no existe `resolveWeaponType()` y no
// hay ninguna resolucion en runtime. El campo `family` esta para agrupar y
// mostrar, no para derivar nada.
//
// Que el tipo se derive en vez de declararse fue el diseño viejo, y se fue con
// el sistema de accesorios entero. Volver a esa forma sin querer es facil --un
// `switch` por nombre de item parece innocent-- y produce un fallo concreto:
// un item sin entrada en ARMAS nunca llama a `Engine.giveWeapon()`, el arma no
// aparece, y el .dat puede estar impecable. Ver "QUE PASA SI FALTA UNA DE LAS
// DOS MITADES".
//
// ============================================================================
// LAS CUATRO FILAS DEL .dat, Y POR QUE ESTAN DUPLICADAS
// ============================================================================
// Las 4 son la fila de gsis_weapons.dat que lee el .asi, una por tipo:
//
//   60 23   347 2  8 -1     colt45_silenced        (colt45_c15_silenced)
//   61 23   347 2 15 -1     colt45_c15_silenced
//   62 22 15065 2 15 -1     colt45_c15
//   63 22   346 2  8 -1     colt45
//
// Son DOS copias de un numero en dos lugares, y la duplicacion de datos de
// configuracion es exactamente la clase de bug que produjo el cargador de 15
// que terminaba en 8: dos copias, una regla de prioridad, y el valor equivocado
// visible en el arma.
//
// Se acepta por una razon concreta: el .dat lo lee el .asi en su DllMain, antes
// de que exista un solo script de CLEO, y el mod no abre archivos. No hay forma
// de que el mod lea esa fila sin duplicarla o sin agregar un archivo de config
// que las dos mitades lean.
//
// QUE SE HACE CONTRA ESO
// ---------------------------------------------------------------------------
//   node .IronSyndicate\tools\check-dat.mjs
//
// Cruza las dos mitades y sale distinto de cero si un tipo no esta en las dos,
// si hay dos items con el mismo weaponType, si un cargador no le sirve a ningun
// arma, o si el clipSize no coincide con el clip de la fila.
//
// LO QUE EL CHECK NO DICE, Y ES LA MITAD DEL PROBLEMA
// ---------------------------------------------------------------------------
// El check dice que la configuracion es coherente. No dice que el ARMA SE VEA,
// y esa diferencia es un bug entero: un .dat impecable cuyo `modelId` no esta
// cargado da un arma INVISIBLE, con el cargador, la animacion y el sonido
// correctos. MEDIDO el 03/10 con el 60 y el 61, modelo 347 de vanilla.
//
// Que se vea se verifica en el log, no aca. Ver "COMO SE COMPRUEBA QUE UNA
// FILA NUEVA SIRVE" en el header de gsis_weapons.dat.
//
// QUE PASA SI FALTA UNA DE LAS DOS MITADES
// ---------------------------------------------------------------------------
//   item sin fila   el .asi no registra el tipo. El give no da nada.
//   fila sin item   el .asi registra el tipo y nadie lo pide nunca: se registra
//                   al pedirlo y ocupa un slot del rango 60..79 para siempre.
//                   El sintoma es un arma que no aparece en la mochila.
//
// Las dos mitades tienen que crecer JUNTAS. Agregar un arma es: una fila en el
// .dat, una entrada en ARMAS, una entrada en CARGADORES con el clipSize de la
// fila, y las dos entradas en ITEMS de gsis_item_data.js.
//
// ============================================================================
// LA CAPACIDAD NO ESTA ACA, Y ESA ES LA DIFERENCIA
// ============================================================================
// El cargador de 8 balas NO es lo que le cabe al arma: eso lo dice el motor, con
// Engine.clipCapacityOf(63), que pega en el hook de GET_WEAPONINFO y recibe la
// fila que escribio el .asi. Lo que dice `clipSize` en CARGADORES es cuantas balas
// APORTA un cargador de los que hay, que es un dato del item y no del arma.
//
// La diferencia importa porque las dos cosas no tienen por que ser iguales: un
// cargador de 5 para un arma de 8 es un item valido y el motor es el que dice que
// el arma entra de a 8.
// ============================================================================

// El arma del mod. `weaponType` es el numero que el .asi registro; `slot` es el
// WEAPONSLOT, el mismo para todas las variantes de la familia.
export var ARMAS = {
    "colt45": {
        nombre: "Colt .45",
        family: "colt45",
        weaponType: 63,      // .dat: 63 22 346 2  8 -1
        slot: 2,
        precio: 550,
        peso: 1.5,
        damage: 25,
        categoria: "Pistolas"
    },
    "colt45_c15": {
        nombre: "Colt .45 C15",
        family: "colt45",
        weaponType: 62,      // .dat: 62 22 347 2 15 -1
        slot: 2,
        precio: 600,
        peso: 1.5,
        damage: 40,
        categoria: "Pistolas"
    },
    "colt45_silenced": {
        nombre: "Colt .45 Silenced",
        family: "colt45",
        weaponType: 60,      // .dat: 60 23 347 2  8 -1
        slot: 2,
        precio: 700,
        peso: 1.6,
        damage: 40,          // hereda del padre 23 (silenciada vanilla)
        categoria: "Pistolas"
    },
    "colt45_c15_silenced": {
        nombre: "Colt .45 Silenced C15",
        family: "colt45",
        weaponType: 61,      // .dat: 61 23 347 2 15 -1
        slot: 2,
        precio: 750,
        peso: 1.6,
        damage: 40,          // hereda del padre 23 (silenciada vanilla)
        categoria: "Pistolas"
    }
};

// Los cargadores. `clipSize` es lo que mete UN cargador de los que hay, y
// `armas` es la LISTA de armas a las que le sirve.
//
// POR QUE UNA LISTA Y NO UN `arma` SOLO
// ----------------------------------------------------------------------------
// Un cargador no es de un arma: es de una CAPACIDAD, y el silenciador no cambia
// la capacidad. El cargador de 8 le sirve a la colt45 pelada y a la silenciada;
// el de 15 le sirve a la C15 y a la C15 silenciada. Con un `arma` solo habia que
// elegir entre dos males:
//
//   un cargador por arma   cuatro cargadores para dos capacidades, y el jugador
//                         tenia que saber cual de los dos de 8 era el suyo
//   un cargador compartido y ningun arma declarada   un cargador que no le
//                         sirve a nadie
//
// La lista es la unica de las dos que no inventa una pieza que no existe. Y el
// orden de la lista no es decorative: el primero es el que muestra la UI como
// arma principal del cargador (ver slotDe).
//
// Y "cada cargador en su arma" no necesita una regla aparte: la recarga pide el
// cargador con cargadorDe(armaEnLaMano), o sea que un cargador que no esta en la
// lista de esa arma no se toca nunca. Esta en su ranura esperando a su propia
// arma. Ver "LA 4" en modules/weapons/gsis_Weapons.js.
export var CARGADORES = {
    "mag_colt45": {
        nombre: "Cargador Colt .45",
        armas: ["colt45", "colt45_silenced"],
        clipSize: 8,
        precio: 220,
        peso: 0.2
    },
    "mag_colt45_c15": {
        nombre: "Cargador Colt .45 C15",
        armas: ["colt45_c15", "colt45_c15_silenced"],
        clipSize: 15,
        precio: 250,
        peso: 0.25
    }
};

// Si un cargador le sirve a un arma. La regla, en una linea, y sin que ningun
// llamador tenga que recorrer la lista.
export function cargadorSirveA(magId, armaId) {
    var def = CARGADORES[magId];
    if (!def || !armaId) return false;
    return def.armas.indexOf(armaId) !== -1;
}

// La definicion del arma de un itemId, o null si el item no es un arma del mod.
export function defDeArma(itemId) {
    var def = ARMAS[itemId];
    return def || null;
}

// La definicion de un cargador, o null si el item no es un cargador.
export function defDeCargador(itemId) {
    var def = CARGADORES[itemId];
    return def || null;
}

// El cargador que le sirve a un arma. Con un cargador por arma es un indice
// directo; con la lista de `armas` es "el primero que le sirva", y el llamador
// tiene que decidir cual monta.
export function cargadorDe(armaId) {
    for (var id in CARGADORES) {
        if (Object.prototype.hasOwnProperty.call(CARGADORES, id) &&
            CARGADORES[id].armas.indexOf(armaId) !== -1) {
            return id;
        }
    }
    return null;
}

// La capacidad que DECLARA el catalogo para un item, o 0 si no declara ninguna.
//
// Y es 0 para un ARMA a proposito: la capacidad de un arma la dice el motor, con
// Engine.clipCapacityOf, y copiarla aca seria la segunda copia que produjo el
// cargador de 15 que terminaba en 8. Lo que se declara aca es lo que es del ITEM: un
// cargador de 5 para un arma de 8 trae 5 balas, y eso es un dato del cargador.
//
// La usa la fila de la UI (ammoCell en ui/views/itemRow.js) para pintar "N/cap" en
// los cargadores. En un arma devuelve 0 y la fila muestra solo "N": la capacidad
// exacta del arma esta en el HUD del juego y en el log del give, y en la mochila
// lo que importa es cuantas balas quedan.
export function capacidadDeclarada(itemId) {
    var cargador = CARGADORES[itemId];
    return cargador ? (cargador.clipSize || 0) : 0;
}

// El arma del mod a la que corresponde un weaponType, o null.
//
// El camino inverso de `defDeArma`: el modulo lo necesita cuando lo que tiene es el
// arma EN LA MANO —que es un tipo del motor, no un id de inventario— y necesita
// saber de que item es. Con un arma por tipo es un recorrido; el dia que un tipo
// represente varias configuraciones, esto devuelve la primera y el que pregunte
// tiene que mirar si la respuesta le sirve.
export function armaDeTipo(tipo) {
    for (var id in ARMAS) {
        if (Object.prototype.hasOwnProperty.call(ARMAS, id) && ARMAS[id].weaponType === tipo) {
            return { itemId: id, def: ARMAS[id] };
        }
    }
    return null;
}

// Cuantas balas lleva un item NUEVO.
//
// Y la respuesta son dos reglas, no una:
//
//   un cargador   las suyas, las de CARGADORES. Es lo unico de un cargador que no
//                 lo decide el motor: el motor dice cuanto le entra al ARMA, y
//                 esto dice cuanto trae la PIEZA.
//   un arma       ninguna. El arma se entrega desnuda: sin cargador hasta que el
//                 jugador recargue con uno.
//
// Lo usa el alta de filas instanciadas (addItem en inventory/logic.js), que antes
// no tenia nada que escribir porque no habia item instanciado en el catalogo.
export function municionDeFabrica(itemId) {
    var cargador = CARGADORES[itemId];
    if (cargador) return cargador.clipSize || 0;
    return 0;
}

// El slot del motor de un item. Si el item es un arma, el suyo; si es un
// cargador, el del arma a la que le sirve. La UI lo usa para el `ranura` de la
// fila equipada.
//
// Con la lista de `armas` hay mas de una respuesta posible, y todas las de un
// cargador son el mismo numero: un cargador le sirve a armas de la MISMA ranura
// por definicion, asi que se toma la primera y no hay nada que decidir.
export function slotDe(itemId) {
    var arma = defDeArma(itemId);
    if (arma) return arma.slot;
    var cargador = defDeCargador(itemId);
    if (cargador && cargador.armas.length) {
        var deArma = defDeArma(cargador.armas[0]);
        return deArma ? deArma.slot : 0;
    }
    return 0;
}