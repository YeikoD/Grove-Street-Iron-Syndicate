// GSIS - Migracion de saves
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// POR QUE ESTE ARCHIVO EXISTE
// ============================================================================
// Un itemId es una clave primaria y va en los saves. Renombrar un item es
// cambiar su clave, y un save que tiene la clave vieja se queda con un item
// que el catalogo ya no conoce: el arma desaparece del inventario y el jugador
// pierdela.
//
// La alternativa —borrar los saves viejos— no es una opcion: son la partida
// del jugador, con su baul, sus armas y su economia.
//
// Entonces: renombrar un item SIEMPRE se escribe aca primero. El save viejo se
// migra al leer, y la escritura siguiente ya usa el nombre nuevo.
//
// ============================================================================
// COMO SE USA
// ============================================================================
// No se importa desde aca a ningun lado. Se corre DENTRO de loadGame, despues de
// parsear el JSON y antes de que ningun modulo lo lea. Si se corriera despues,
// el modulo de inventario ya habria desconocido los items viejos y los habria
// descartado antes de que la migracion pudiera tocarlos.
//
// Un item viejo que NO tiene entrada aqui se deja como estaba. Inventario
// desconocido se ignora en vez de borrarse: es la diferencia entre "perdi un
// item desconocido" y "perdi las armas" cuando la migracion tiene un typo.

// ============================================================================
// TABLA DE RENOMBRES
// ============================================================================
//   viejo    ->  nuevo
//
// La razon del renombre, para que no se repita: `9mm` era el nombre de la
// MUNICION, no del ARMAMENTO. La pistola de tipo 22 dispara calibre .45 y su
// cargador de vanilla son 8 balas, no 17. Un item de inventario que dice "9mm" y
// es una pistola de .45 con cargador de 8 miente en tres lugares a la vez. El
// nombre nuevo dice lo que es.
//
// Este renombre NO cambia el comportamiento de juego: 17 -> 8 balas es un cambio
// de la variante base, y se hace aparte y a proposito.
export var ITEM_RENAMES = {
    "9mm":     "colt45",
    "mag_9mm": "mag_colt45",

    // El silenciador dejo de ser un arma. `silenced_9mm` era una SEGUNDA pistola
    // —con su propio item, su precio y su fila en el dealer— cuando en la
    // realidad es la misma Colt .45 con un silenciador encima. Pasa a ser el
    // accesorio, y su cargador tambien.
    //
    // OJO con esto: un save con `silenced_9mm` no se vuelve "una colt45 con
    // silenciador montado". Se vuelve una colt45, y el jugador tiene que
    // comprar y montar el silenciador aparte. Es una perdida real y es
    // deliberada: el item viejo VALIA 1.800 y el silenciador 1.200, asi que
    // dar el arma gratis seria regalar 600. El precio se ajusta abajo.
    "silenced_9mm":     "colt45",
    "mag_silenced_9mm": "mag_colt45",

    // Los cargadores de capacidad variante tambien cambian de nombre, porque su
    // prefijo "mag_9mm" ya no corresponde a ninguna familia. La convencion
    // "mag_" + <familia> es la que hay que mantener, y mag_9mm_extended colgado
    // de un item que ya no existe es exactamente el caso que la rompio antes.
    "mag_9mm_replica":  "mag_colt45_replica",
    "mag_9mm_extended": "mag_colt45_extended",

    // El alias de crafteo. `pistol_assembled` es el MISMO weaponId 22 que la
    // 9mm con precio 0, y por eso se va con ella: un alias sin canonico no
    // resuelve. Ver WEAPON_ALIASES en gsis_weapon_data.js.
    "pistol_assembled": "colt45",

    // El item del POC. Cuando el .asi dejo de ser un experimento y las
    // variantes y el modelo propio, `gsis_pistol` dejo de ser una
    // pistola mas: era la misma Colt .45 con cargador de 30, que ahora es la
    // variante con cargador de 15. Los saves con el item viejo lo migran a
    // colt45 CON cargador, que es lo que el jugador cree que tiene.
    "gsis_pistol":          "colt45",
    "mag_gsis_pistol":      "mag_colt45_extended"
};

// ============================================================================
// QUE SE MIGRA Y QUE NO
// ============================================================================
// Se migran los `id` de item, en todas partes donde un item puede aparecer:
// inventario, baul, cinturon, equipado, ordenes del dealer, crafteo.
//
// NO se migra `weaponType`. Y esa distincion es el punto entero del refactor:
// el weaponType es la REPRESENTACION, y las representaciones se renumeran
// soltas. Un save con type 60 (que era colt45+30) ahora es colt45+15, y el
// weaponType 60 sigue siendo colt45+15. El numero se preserva por construccion.
//
// Tampoco se migra ningun otro campo numerico: si un save tiene un cargador de 30
// balas y ahora la variante base es de 8, el save se queda con 30 hasta que se
// recargue. Cambiar la municion guardada en una partida a medias es peor que
// dejarla.

// ============================================================================
// APLICACION
// ============================================================================
// Id → id nuevo, o el mismo si no hay renombre. Null si el id no es un string
// util, para que un item con id numerico (que no deberia existir) no se rompa.
export function renameItemId(id) {
    if (typeof id !== "string" || !id) return id;
    var nuevo = ITEM_RENAMES[id];
    return nuevo || id;
}

// Un objeto de item es { id, qty, ammo, hasMag, ... }. Se renombra solo el id y
// se devuelve el MISMO objeto: mutarlo en el sitio es lo que hace que el resto
// del save (contenedores anidados) se actualice sin que este codigo tenga que
// saber que contenedor es.
//
// La mutacion en el sitio y no un clon es deliberada. Un clon obligaria a
// devolver el objeto nuevo Y a que el llamador lo reasigne, y hay ItemsManager
// con inventory, trunks, trunkOpen y equipped: cuatro caminos, y el quinto
// que seComp forgot es el que rompe.
export function migrateItem(item) {
    if (!item || typeof item !== "object") return item;
    var nuevo = renameItemId(item.id);
    if (nuevo !== item.id) item.id = nuevo;
    return item;
}

// Un array de items. Devuelve cuantos renombro, que es lo que el log reporta:
// si un save se migra y el contador dice 0, o no tenia items viejos o la
// migracion no se esta corriendo, y esas dos cosas hay que poder distinguir.
export function migrateItemList(lista) {
    var n = 0;
    if (!Array.isArray(lista)) return 0;
    for (var i = 0; i < lista.length; i++) {
        var antes = lista[i] && lista[i].id;
        migrateItem(lista[i]);
        if (antes && antes !== lista[i].id) n++;
    }
    return n;
}

// ============================================================================
// RECORRIDO DE UN SAVE
// ============================================================================
// Aplica la migracion a TODO el save. No sabe que hay dentro: recorre el objeto
// entero y renombra cualquier `{ id: string }` que encuentre. Esa es la
// diferencia entre una migracion que se olvido de un contenedor y una que no.
//
// Costo: el save es de unos pocos KB, se recorre una vez por carga, y el
// algoritmo es lineal. No justifica un catalogo de rutas.
//
// ---------------------------------------------------------------------------
// POR QUE HAY QUE MIRAR EN LOS DOS TIPOS DE NODO
// ---------------------------------------------------------------------------
// La version anterior solo buscaba `id` al recorrer ARRAYS. Eso dejaba sin
// renombrar los items de los contenedores que son mapas por clave, no listas:
// `Ballistic.equipped` es { "0": {id,...}, "1": {id,...} }, y ahi un `9mm` se
// quedaba viejo sin que nada avisara.
//
// Se vio probando contra el save real: despues de migrar quedaban 32 items
// renombrados y uno sin renombrar, en `.Ballistic.equipped.2.id`.
//
// La asimetria es la trampa: un item dentro de un array se renombraba y el de al
// lado, en la misma partida, no. Dos items con el MISMO id, uno migrado y otro no,
// que es peor que no migrar ninguno: el arma aparece en el baul y desaparece
// del cinturon.

var PROFUNDIDAD_MAX = 8;

function _migrarNodo(nodo, profundidad) {
    if (!nodo || typeof nodo !== "object" || profundidad > PROFUNDIDAD_MAX) return 0;

    var n = 0;

    // Un item: un objeto que tiene "id" propio. Se renombra y NO se recorre mas
    // adentro: sus campos (qty, ammo, hasMag) no contienen items, y bajarlo
    // gastaria profundidad al pedo.
    if (typeof nodo.id === "string") {
        var antes = nodo.id;
        migrateItem(nodo);
        return antes === nodo.id ? 0 : 1;
    }

    if (Array.isArray(nodo)) {
        for (var i = 0; i < nodo.length; i++) {
            if (nodo[i] && typeof nodo[i] === "object") n += _migrarNodo(nodo[i], profundidad + 1);
        }
        return n;
    }

    for (var key in nodo) {
        if (!Object.prototype.hasOwnProperty.call(nodo, key)) continue;
        var v = nodo[key];
        if (v && typeof v === "object") n += _migrarNodo(v, profundidad + 1);
    }
    return n;
}

// Punto de entrada. Se llama desde loadGame con el save ya parseado.
export function migrateSave(parsed) {
    if (!parsed || typeof parsed !== "object") return 0;
    return _migrarNodo(parsed, 0);
}
