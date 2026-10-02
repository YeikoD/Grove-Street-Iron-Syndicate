// GSIS - Weapons data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Que es un arma del mod y a que tipo del motor corresponde. DOS tablas y dos
// funciones, y nada mas:
//
//   ARMAS        itemId -> { nombre, weaponType, slot, precio }
//   CARGADORES   itemId -> { arma, clipSize, precio }
//
// El `weaponType` es lo que el motor ejecuta; el `itemId` es lo que el jugador
// tiene en el inventario. Son dos cosas y por eso viven en dos campos: el arma
// del inventario es SIEMPRE la misma, y el tipo es la representacion que ejecuta
// el .asi. El tipo se deriva de la configuracion, nunca se guarda y nunca viaja
// por la UI.
//
// ============================================================================
// EL 63 ESTA TAMBIEN EN gsis_weapons.dat
// ============================================================================
// Es la fila `63 22 346 2 8 -1` del archivo que lee el .asi. Son DOS copias de un
// numero en dos lugares, y la duplicacion de datos de configuracion es
// exactamente la clase de bug que produjo el cargador de 15 que terminaba en 8:
// dos copias, una regla de prioridad, y el valor equivocado visible en el arma.
//
// Se acepta por una razon concreta: el .dat lo lee el .asi en su DllMain, antes
// de que exista un solo script de CLEO, y el mod no abre archivos. No hay forma
// de que el mod lea esa fila sin duplicarla o sin agregar un archivo de config
// que las dos mitades lean.
//
// QUE SE HACE CONTRA ESO
// ---------------------------------------------------------------------------
// .IronSyndicate/tools/check-dat.mjs cruza las dos mitades fila por fila y sale
// distinto de cero si el tipo no coincide. Es la red, y mientras no exista el
// check la red es el comentario de arriba.
//
// LA CAPACIDAD NO ESTA ACA, Y ESA ES LA DIFERENCIA
// ---------------------------------------------------------------------------
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
        // Para la UI y para la ficha. No son entradas de runtime: el motor tiene su
        // propio damage en la CWeaponInfo y el mod no lo escribe.
        damage: 25,
        categoria: "Pistolas"
    }
};

// Los cargadores. `clipSize` es lo que mete UN cargador de los que hay, y
// `arma` es a que arma le sirve: un cargador que no le sirve a un arma es una
// combinacion que no existe y la accion se rechaza ANTES de gastar la pieza.
export var CARGADORES = {
    "mag_colt45": {
        nombre: "Cargador Colt .45",
        arma: "colt45",
        clipSize: 8,         // el .asi le escribio 8 a la CWeaponInfo del 63
        precio: 220,
        peso: 0.2
    }
};

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
// directo; el dia que haya mas de uno pasa a ser "el primero que le sirva", y el
// llamador tiene que decidir cual monta.
export function cargadorDe(armaId) {
    for (var id in CARGADORES) {
        if (Object.prototype.hasOwnProperty.call(CARGADORES, id) &&
            CARGADORES[id].arma === armaId) {
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
export function slotDe(itemId) {
    var arma = defDeArma(itemId);
    if (arma) return arma.slot;
    var cargador = defDeCargador(itemId);
    if (cargador) {
        var deArma = defDeArma(cargador.arma);
        return deArma ? deArma.slot : 0;
    }
    return 0;
}