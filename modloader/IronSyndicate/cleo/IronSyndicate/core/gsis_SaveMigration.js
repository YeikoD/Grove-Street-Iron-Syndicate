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
// ESTA TABLA ES DEL NAMESPACE DE `itemId`, Y SOLO DE ESE.
//
// Un itemId es una clave del catalogo de ITEMS (data/gsis_item_data.js) y de los
// items del inventario. El RENOMBRE tiene que aterrizar en un id que exista en
// ITEMS, o el item desaparece del inventario del jugador al cargar: el item deja
// de ser conocido y el mod lo ignora. Ver "POR QUE NO SE ENCADENA" abajo.
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
    //
    // El destino es `mag_colt45_extended` y NO `mag_colt45_15`, aunque el
    // cargador de 15 balas se llame asi en el catalogo de variantes. Ver
    // "LOS DOS NAMESPACES DE LOS ACCESORIOS".
    "mag_9mm_replica":  "mag_colt45",
    "mag_9mm_extended": "mag_colt45_extended",

    // Los cargadores QUE NO HACIAN NADA, que se quitaron del catalogo el 30/09.
    // Eran un segundo cargador con la MISMA capacidad que el arma de base, asi que
    // montarlos no cambiaba el weaponType y no había nada que ganar. Ver
    // ACCESORIOS_RETIRADOS.
    //
    // Cada uno va a su equivalente que sobrevive, y no se borran: un save con el id
    // viejo tiene el item, y un item con un id que el catalogo no reconoce es un
    // item que el jugador tiene y no puede usar.
    "mag_colt45_replica":  "mag_colt45",
    "mag_mp5_replica":     "mag_mp5",
    "mag_ak47_polymer":    "mag_ak47",
    "mag_ak47_bulgarian":  "mag_ak47",
    "mag_m4_polymer":      "mag_m4_assembled",

    // El alias de crafteo. `pistol_assembled` es el MISMO weaponId 22 que la
    // 9mm con precio 0, y por eso se va con ella: un alias sin canonico no
    // resuelve. Ver WEAPON_ALIASES en gsis_weapons.js.
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
// LOS DOS NAMESPACES DE LOS ACCESORIOS, Y POR QUE ESO PROHIBE UN RENOMBRE
// ============================================================================
// El mismo cargador de 15 balas tiene DOS nombres, y en ningun lado es el mismo:
//
//   mag_colt45_15        CANONICO. El que usa WEAPON_VARIANTS, el que compara
//                        resolveWeaponType, el que se guarda en
//                        Ballistic.equipped[slot].attachments.
//                        Declarado en ATTACHMENTS (data/gsis_weapons.js).
//
//   mag_colt45_extended  DE INVENTARIO. El que esta en ITEMS
//                        (data/gsis_item_data.js), el que viaja en items[] y el
//                        que el jugador ve. Convertido con
//                        inventoryAttachmentId().
//
// Los dos son ids VALIDOS y NECESARIOS en su namespace. Por eso
// `mag_colt45_extended -> mag_colt45_15` NO va en ITEM_RENAMES:
//
//   * ITEM_RENAMES renombra `item.id`, que es el namespace de inventario.
//   * `mag_colt45_extended` es HOY un itemId valido. Renombrarlo a
//     `mag_colt45_15` produce un itemId que NO esta en ITEMS, y el cargador le
//     desaparece al jugador del inventario en cada carga.
//
// La conversion que si hace falta —el save viejo escribio
// `mag_colt45_extended` dentro de `attachments`, donde el nombre bueno es
// `mag_colt45_15`— la hace la migracion de weapons (modules/weapons/migrate.js)
// con canonicalAttachmentId(), que SI conoce los dos namespaces. Ahi el destino
// es un id canonico y por lo tanto es correcto.
//
// POR QUE NO SE ENCADENA
// ----------------------
// Un renombre se resuelve con UNA sola tabla: `mag_9mm_extended` se convierte en
// `mag_colt45_extended` y ahi PARA, aunque `mag_colt45_extended` tenga a su vez
// entrada. Encadenar seria casi-correcto y estaria mal, por lo de arriba: la
// segunda tabla es de otro namespace y su destino no es un itemId.
//
// La regla que sale de ahi, y que hay que leer antes de tocar esta tabla: TODO
// destino tiene que existir en ITEMS. Si un dia hace falta renombrar un
// accesorio, el rename va en la migracion del modulo que lo usa, no aca.

// ============================================================================
// LA VERSION DEL FORMATO
// ============================================================================
// SAVE_FORMAT_VERSION es la version del ESQUEMA del save entero, y la que se
// graba en GameState.version.
//
//   1  el esquema de antes de las fases 1-3. Los 12 modulos mas el registro de
//      armas con 7 campos por slot, incluido `weaponType`.
//   2  el de hoy. El registro de armas es { id, family, attachments, salud }.
//
// NO es "cuantos modulos toco la ultima version". Es "que forma tiene un save
// legible", y sube cuando un modulo cambia la forma de lo que persiste. Por eso
// subirlo a 2 sin tocar los otros 12 modulos es correcto: sus datos no cambiaron
// de forma, y la migracion de la version 1 a la 2 solo recorre Ballistic.
//
// QUE HACE QUE SUBIRLO SEA OBLIGATORIO, Y NO OPCIONAL
// ----------------------------------------------------
// Un save viejo y uno nuevo tienen el MISMO `version: 1` mientras no se suba. Sin
// el numero no hay forma de saber si `equipped[2].magId` hay que traducirlo o si
// es un campo sobrante, y las dos lecturas dan un resultado distinto. Peor: sin
// version no hay forma de saber si la migracion YA corrio, asi que un save
// migrado se volveria a migrar en cada carga.
export var SAVE_FORMAT_VERSION = 2;

// La version de un save, como numero comparable.
//
// Los saves viejos tienen `"1.0"`, que es un string y ademas "1.0" no es un
// entero. Un save sin version es de antes de que existiera el campo, o sea
// version 1: se asume la mas baja que se pueda migrar, porque la migracion es
// idempotente y correrla de mas no cambia nada, mientras que NO correrla deja
// campos viejos sin traducir.
export function versionDe(v) {
    if (typeof v === "number" && isFinite(v)) return Math.floor(v);
    if (typeof v === "string") {
        var n = parseInt(v, 10);           // "1.0" -> 1, "2" -> 2
        if (!isNaN(n)) return n;
    }
    return 1;
}

// ============================================================================
// MIGRADORES DE MODULOS
// ============================================================================
// Un migrador es `function (save) -> informe` y se registra para la version que
// CORRIGE, no para la que produce.
//
//   registerSaveMigrator(1, "weapons-v2", fn)
//
//   1 -> 2. El save entro en 1 y hay que dejarlo en 2.
//
// Por que el modulo se registra a si mismo y no lo llama SaveManager: SaveManager
// no tiene que saber que existe un modulo de armas. Con un registro, agregar la
// migracion de otro modulo es escribir un archivo nuevo, y no tocar el nucleo.
//
// Y por que se registra al IMPORTAR el modulo, y no en su init(): SaveManager
// corre `loadGame` desde initSaveManager(), que el entry llama DESPUES de todos
// los imports. Un import se evalua antes que la primera linea de codigo del
// entry, asi que un migrador registrado al importarse ya esta registrado cuando
// loadGame busca migradores. En init() llegaria tarde: el save viejo se cargaria
// sin migrar una vez, y esa partida quedaria con el registro en la forma vieja.
var _migradores = [];

export function registerSaveMigrator(version, nombre, fn) {
    if (typeof fn !== "function") return false;
    _migradores.push({ version: version, nombre: nombre, fn: fn });
    return true;
}

// Solo para diagnostico y para los tests: que migradores hay registrados y para que
// version.
export function registeredMigrators() {
    return _migradores.map(function (m) { return { version: m.version, nombre: m.nombre }; });
}

// ============================================================================
// QUE SE MIGRA Y QUE NO
// ============================================================================
// Se migran los `id` de item, en todas partes donde un item puede aparecer:
// inventario, baul, cinturon, equipado, ordenes del dealer, crafteo.
//
// SE MIGRA el weaponType guardado del registro de armas, y el motivo es el
// cambio de faz de este refactor: el registro ya no guarda un weaponType, guarda
// la LISTA de accesorios de la que se deriva. Asi que un `variantWeaponType: 60`
// de un save viejo hay que traducirlo a `attachments: ["suppressor"]`. No es una
// renumeracion: el 60 sigue siendo el 60, lo que cambio es que el save ya no lo
// guarda.
//
// El weaponType NO se vuelve a guardar. Y esa distincion es el punto entero: el
// weaponType es la REPRESENTACION, y las representaciones se renumeran soltas.
// Un save con type 60 (que era colt45+30) ahora es colt45+15, y el weaponType 60
// sigue siendo colt45+15. El numero se preserva por construccion.
//
// Tampoco se migra ningun otro campo numerico: si un save tiene un cargador de 30
// balas y ahora la variante base es de 8, el save se queda con 30 hasta que se
// recargue. Cambiar la municion guardada en una partida a medias es peor que
// dejarla.
//
// ---------------------------------------------------------------------------
// POR QUE LA MIGRACION DE UN MODULO NO ESTA ACA
// ---------------------------------------------------------------------------
// Este archivo sabe renombrar `id`s. No sabe que es una familia, un accesorio o
// una variante, y no deberia aprenderlo: en cuanto un modulo persiste una forma
// propia, la migracion de esa forma va en el modulo. La de las armas esta en
// modules/weapons/migrate.js y se registra sola. Ver "MIGRADORES DE MODULOS".

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

// ============================================================================
// ACCESORIOS_RETIRADOS
// ============================================================================
// Los ids de ACCESORIO (namespace de INVENTARIO) que se quitaron del catalogo.
//
// Por que hace falta y por que NO es lo mismo que ITEM_RENAMES:
//
//   ITEM_RENAMES  camina el save y renombra todo lo que tiene un `id` de ITEM. Un
//                 cargador suelto en la mochila es eso, y el jugador recibe el
//                 cargador que lo reemplaza.
//
//   ESTA TABLA    los `attachments` de un arma, que son STRINGS en un array.
//                 `_migrarNodo` no los toca: solo baja a nodos con `id` propio, y
//                 un string no lo tiene.
//
// Y sin esto, sacar un cargador del catalogo deja armas PERMANENTEMENTE
// inequipables: el save dice `attachments: ["mag_ak47_polymer"]`, `resolveWeaponType`
// no encuentra esa combinacion porque la fila no existe, y el arma queda en la
// mochila sin poder usarse.
//
// ---------------------------------------------------------------------------
// POR QUE SE QUITAN Y NO SE REEMPLAZAN
// ---------------------------------------------------------------------------
// Los cinco retirados eran cargadores NEUTRROS: la misma capacidad que el arma de
// base, asi que montarlos no cambiaba el weaponType. Su equivalente que sobrevive
// tambien es neutro (mag_colt45, mag_mp5, mag_ak47, mag_m4_assembled).
//
// Y un accesorio NEUTRO dentro de `attachments` ROMPE la resolucion en cuanto hay
// otro que si necesita tipo propio. `resolveWeaponType` tiene tres salidas: la fila
// exacta, la base si la lista esta vacia, y la base solo si TODOS son neutros. Una
// lista con un neutro y uno que no lo es no cae en ninguna: devuelve null.
//
// MEDIDO el 30/09: un M4 con [mag_m4_polymer, mag_m4_lancer] redimido a
// [mag_m4_assembled, mag_m4_lancer] deja de resolver, y el Lancer se pierde con el
// arma. Redimido a [mag_m4_lancer] resuelve a 65 y no se pierde nada.
//
// O sea: como el retirado era neutro y su reemplazo tambien, la redencion
// CORRECTA es quitarlo. El arma vuelve a la base, que es exactamente lo que ese
// cargador hacia.
export var ACCESORIOS_RETIRADOS = {
    "mag_colt45_replica": true,
    "mag_mp5_replica": true,
    "mag_ak47_polymer": true,
    "mag_ak47_bulgarian": true,
    "mag_m4_polymer": true
};

// Reescribe los `attachments` de un save. Se recorre el arbol entero porque un arma
// puede estar en items[], en un baul, en el cinturon o en el registro de equipado, y
// el lugar donde aparece es el que menos se nota.
function _migrarAttachments(nodo, profundidad) {
    if (!nodo || typeof nodo !== "object" || profundidad > PROFUNDIDAD_MAX) return 0;
    var n = 0;
    if (Array.isArray(nodo.attachments)) {
        var out = [];
        for (var i = 0; i < nodo.attachments.length; i++) {
            var a = nodo.attachments[i];
            if (typeof a === "string" && ACCESORIOS_RETIRADOS[a]) { n++; continue; }
            out.push(a);
        }
        nodo.attachments = out;
    }
    if (Array.isArray(nodo)) {
        for (var k = 0; k < nodo.length; k++) {
            if (nodo[k] && typeof nodo[k] === "object") n += _migrarAttachments(nodo[k], profundidad + 1);
        }
        return n;
    }
    for (var key in nodo) {
        if (!Object.prototype.hasOwnProperty.call(nodo, key)) continue;
        var v = nodo[key];
        if (v && typeof v === "object") n += _migrarAttachments(v, profundidad + 1);
    }
    return n;
}

// ============================================================================
// PUNTO DE ENTRADA
// ============================================================================
// Se llama desde loadGame con el save ya parseado. Muta `parsed` en el sitio y
// devuelve un INFORME, no un numero.
//
// Por que un informe y no el numero de renombres que devolvia antes: el llamador
// lo muestra en el log, y con la version de las fases 1-3 un `0` no significaba
// nada util. Con un informe se puede decir "llego en 1, se corrigio a 2, y el
// registro de armas de 3 slots migro 2 y degrado 1", que es la unica forma de
// distinguir "no tenia nada viejo" de "no se esta corriendo".
//
// El ORDEN importa y son tres pasos:
//
//   1. leer la version
//   2. los renombres de itemId, SIEMPRE
//   3. los migradores de modulo, de la version que tiene a la que esta
//
// El 2 antes del 3 porque un `id` de la forma vieja ("9mm") tiene que ser
// "colt45" ANTES de que la migracion de armas lo lea para buscarle la familia. Al
// reves, la migracion de armas no reconoceria el item y lo tiraria, y el renombre
// correcto llegaria tarde.
//
// Y el 2 siempre, sin mirar la version, porque renombrar un id que ya esta
// renombrado no hace nada: la tabla es una funcion de un solo salto y un destino
// que no es clave no se renombra. Correrlo siempre deja el codigo sin una
// pregunta de version que responder.
export function migrateSave(parsed) {
    var informe = {
        versionAntes: SAVE_FORMAT_VERSION,
        versionDespues: SAVE_FORMAT_VERSION,
        renombrados: 0,
        accesoriosRetirados: 0,
        pasos: []
    };
    if (!parsed || typeof parsed !== "object") return informe;

    var v = versionDe(parsed.version);
    informe.versionAntes = v;

    informe.renombrados = _migrarNodo(parsed, 0);
    // Y los accesorios retirados, que son strings en un array y `_migrarNodo` no
    // alcanza. Ver ACCESORIOS_RETIRADOS.
    informe.accesoriosRetirados = _migrarAttachments(parsed, 0);

    // De `v` hasta la actual. Un save mas nuevo que el codigo (v >
    // SAVE_FORMAT_VERSION) no se toca: es un save de una version posterior, y
    // bajarlo seria inventar informacion. Se deja como esta y se avisa, porque
    // que aparezca es senal de que el jugador instalo un mod viejo encima de un
    // save nuevo.
    if (v > SAVE_FORMAT_VERSION) {
        // El informe dice que la version NO cambio. Sin esto queda en
        // SAVE_FORMAT_VERSION y el log diria que un save de version 99 quedo en 2,
        // que es mentira: el save sigue en 99 y se cargo sin tocar.
        informe.versionDespues = v;
        informe.pasos.push({
            nombre: "futuro",
            ok: false,
            detalle: "el save es version " + v + " y este mod entiende hasta la " +
                SAVE_FORMAT_VERSION + ". Se carga sin tocar."
        });
        return informe;
    }

    for (var n = v; n < SAVE_FORMAT_VERSION; n++) {
        for (var i = 0; i < _migradores.length; i++) {
            var m = _migradores[i];
            if (m.version !== n) continue;
            var r = null;
            try {
                r = m.fn(parsed);
            } catch (e) {
                // Un migrador que tira no puede impedir que se cargue el save. Se
                // anota el fallo y se sigue con el siguiente: cargar con un
                // registro sin migrar es mejor que no cargar nada, porque el
                // reconciliador sabe arreglar un registro viejo por su cuenta.
                informe.pasos.push({
                    nombre: m.nombre,
                    ok: false,
                    detalle: "lanzo: " + (e && e.message ? e.message : e)
                });
                continue;
            }
            informe.pasos.push({
                nombre: m.nombre,
                ok: true,
                detalle: r && typeof r === "object" ? r : null
            });
        }
    }

    // Se graba la version solo si se llego. Un save que entro en 1 y tiene el
    // paso 1->2 sin registro migradores (porque el modulo no se importo) se queda
    // en 1, y la proxima carga lo intenta de nuevo en vez de darlo por bueno.
    if (v <= SAVE_FORMAT_VERSION) parsed.version = SAVE_FORMAT_VERSION;
    informe.versionDespues = versionDe(parsed.version);
    return informe;
}
