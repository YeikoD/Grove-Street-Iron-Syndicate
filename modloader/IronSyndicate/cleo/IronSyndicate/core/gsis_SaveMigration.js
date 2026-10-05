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
// ESTA TABLA ESTA VACIA, Y POR QUE
// -------------------------------
// Antes tenia 14 renombres y los 14 apuntaban a ids de armas: colt45,
// mag_colt45, mag_colt45_15, los cargadores de cada familia, el silenciador
// y el par de alias del POC. Todos esos ids se fueron de ITEMS con el
// sistema de armas, asi que un renombre a ellos no arregla un save viejo: lo
// convierte en otro id que el catalogo tampoco conoce.
//
// Que la tabla este vacia y no baje a los ultimos es la misma decision que
// en ITEMS: un save viejo con 4 AK-47 encima ya no se puede volver coherente,
// porque el item que esas filas nombraban no existe en ninguna parte del
// juego. Renombrarlas a chatarra seria inventar que el jugador tiene chatarra.
//
// QUE PASA CON ESOS SAVES, Y POR QUE ESTO NO ES UN BUG
// ------------------------------------------------
// Las filas que quedan en items[] con un id desconocido NO se borran. Se las
// ignora donde no se las puede usar y se las muestra donde el jugador tiene que
// verlas: el snapshot del inventario las devuelve tal cual, con su id y su
// cantidad, y la pagina las dibuja con el id como nombre, porque
// getItemName() devuelve el id cuando el catalogo no lo conoce.
//
// O sea: el jugador ve el arma vieja en su mochila, con un nombre que no
// reconoce, y no la puede usar. Es la unica respuesta honesta, y es la misma
// que este modulo ya daba con cualquier item desconocido: un item viejo se
// deja como estaba y se ignora, no se borra en silencio. Ver la nota de
// cabecera de este archivo.
//
// SI MAÑANA VUELVE EL ARMAMENTO
// ------------------------------
// Esta tabla se restaura con los mismos 14 renombres, y el orden importa: el
// destino de cada uno tiene que existir en ITEMS el dia que corre la
// migracion, y el renombre es de un solo salto, sin encadenar.
//
// LOS RENOMBRES DEL 03/10, Y POR QUE NO HAY VERSION NUEVA
// ---------------------------------------------------------------------------
// Un solo salto de nombres, y todos en la misma direccion:
//
//   colt45_c15              ->  colt45
//   colt45_silenced         ->  colt45
//   colt45_c15_silenced     ->  colt45
//   mag_colt45_silenced     ->  mag_colt45
//   mag_colt45_c15_silenced ->  mag_colt45_c15
//
// Las tres primeras son la familia de armas: antes cada CONFIGURACION era su propio
// item y ahora hay uno solo. `migrateSave` renombra siempre y sin mirar la version,
// asi que estas tres no necesitan migrador por version.
//
// LO QUE SE PIERDE, Y POR QUE NO SE INTENTA SALVAR
// ---------------------------------------------------------------------------
// Las armas que estaban guardadas como `colt45_silenced` NO vuelve silenciadas:
// el silenciador paso a ser un item que se monta, y el flag no existia en la fila.
// Renombrarlas a `colt45` las deja como tres Colts peladas, que es el arma
// correcta para el catalogo de hoy.
//
// Se podria mirar el id viejo y setear el flag, y no se hace a proposito: seria
// una segunda regla de migracion para un dato que el jugador puede volver a poner
// con dos clics, y una regla que adivina el estado de un arma a partir de como se
// llamaba es la clase de conversion que despues nadie puede explicar.
//
// EL MAPA DE LOS CARGADORES PUESTOS
// ---------------------------------------------------------------------------
// `GameState.Weapons.enArma[slot]` es un STRING SUELTO, no un objeto con `id`, y
// `_migrarNodo` no baja a strings: su primera linea es
//
//   if (!nodo || typeof nodo !== "object" || ...) return 0;
//
// O sea que los cinco renombres de arriba funcionan en todas partes MENOS ahi. Un
// cargador viejo que quedara en ese mapa seria un id que el catalogo ya no tiene,
// que `getCargadorEnArma` trata como arma desnuda, y la pieza estaria en el limbo:
// ni en la mochila ni en una ranura ni en el arma.
//
// Por eso el renombre de ese mapa va en un pase propio, con nombre propio, para que
// el log diga que se hizo. Ver "EL MAPA DE LOS CARGADORES PUESTOS" abajo.
export var ITEM_RENAMES = {
    "colt45_c15": "colt45",
    "colt45_silenced": "colt45",
    "colt45_c15_silenced": "colt45",
    "mag_colt45_silenced": "mag_colt45",
    "mag_colt45_c15_silenced": "mag_colt45_c15"
};

// ============================================================================
// EL MAPA DE LOS CARGADORES PUESTOS
// ============================================================================
// `GameState.Weapons.enArma` es el unico mapa del save que `_migrarNodo` no puede
// ver por su forma, y por eso tiene un pase propio.
//
// QUE HACE, EN DOS PARTES QUE NO SON LA MISMA COSA
// ---------------------------------------------------------------------------
//   renombrar el id     `renameItemId`, el mismo de todos los items. Un save viejo
//                       puede tener `mag_colt45_silenced` puesto en el arma.
//   subir el string     los saves anteriores tienen `"mag_colt45"` —un string— y el
//                       formato de hoy tiene `{ id, ammo }`. Ver abajo.
//
// POR QUE EL RENOMBRE SIGUE SIENDO UN CASO ESPECIAL
// ---------------------------------------------------------------------------
// Porque `_migrarNodo` arranca con `if (typeof nodo.id === "string")`, y esa linea
// es la que decide que es un item: un objeto con `id` string. Un objeto `{ id, ammo }`
// SI lo ve. Un string suelto NO: no es un objeto, asi que el recorrido no baja.
//
// O sea que el renombre del mapa es necesario para el formato NUEVO y no lo era para
// el viejo. Se conserva igual, porque el recorrido en profundidad tiene que seguir
// bajando por mapas indexados por clave —`trunks` esta indexado por vehicleId— y
// sacar el caso ahora dejaria el mapa sin cubrir para la proxima vez que aparezca uno.
//
// Y EL `ammo` DEL FORMATO NUEVO NO LO TOCA ESTE PASE
// ---------------------------------------------------------------------------
// Porque `_migrarNodo` no lo bajaria: si `enArma[slot]` es un objeto con `id`, el
// recorrido entra, renombra el id, y sale SIN mirar los demas campos —que es lo
// correcto, porque `qty`, `ammo` y `salud` no contienen items. O sea que `ammo` ya
// esta a salvo de la migracion por construccion. Lo que hay que hacer con el es
// recortarlo a la capacidad, y eso es del modulo de armas, no de aca.
//
// QUE HACE CON LA MUNICION QUE LOS SAVES VIEJOS NO TIENEN
// ---------------------------------------------------------------------------
// Un string no tiene ammo. Se sube a `{ id, ammo: 0 }` y no a un numero inventado:
// un cargador lleno que el jugador nunca lleno seria peor que uno vacio que puede
// rellenar. El modulo de armas lo dice tambien en su init, en `_normalizarEnArma`.
export function _migrarCargadoresPuestos(parsed) {
    var w = parsed && parsed.Weapons;
    if (!w || !w.enArma || typeof w.enArma !== "object") return 0;
    var n = 0;
    for (var slot in w.enArma) {
        if (!Object.prototype.hasOwnProperty.call(w.enArma, slot)) continue;
        var antes = w.enArma[slot];

        if (typeof antes === "string") {
            w.enArma[slot] = { id: renameItemId(antes), ammo: 0 };
            n++;
            continue;
        }
        if (!antes || typeof antes !== "object") {
            delete w.enArma[slot];
            n++;
            continue;
        }

var despues = renameItemId(antes.id);
        if (despues !== antes.id) {
            antes.id = despues;
            n++;
        }
    }
    return n;
}


// ============================================================================
// UN SOLO NOMBRE POR PIEZA
// ============================================================================
// El cargador de 15 balas de la Colt tiene UN id: `mag_colt45_15`. El mismo en
// ITEMS, el mismo en WEAPON_ATTACHMENTS, el mismo en items[] y el mismo en
// equipped[slot].attachments. No hay traduccion entre namespaces y no hay tabla de
// alias.
//
// Hubo dos. `mag_colt45_extended` era el id de INVENTARIO y `mag_colt45_15` el
// ACCESORIO, con una capa de alias en data/gsis_weapons.js que los traducía en los
// dos sentidos, una fila extra en la vista legada por cada alias, y dos funciones
// (`canonicalAttachmentId`, `inventoryAttachmentId`) que el modulo de armas y el
// reconciliador tenian que acordarse de llamar. Todo eso era el bug esperando: si
// un camino se olvidaba de traducir, el cargador que el arma pedia no existia en el
// inventario y la recarga no tenia con que cambiar, sin error en ninguna parte.
//
// POR QUE ESTA TABLA SI ES EL LUGAR DE LA CONVERSION
// -------------------------------------------------
// Un save viejo guarda `mag_colt45_extended` en DOS lugares, y cada uno necesita
// una regla distinta:
//
//   item.id          items[], belt[], trunks[], equipped[].id  ->  ITEM_RENAMES,
//                    porque es el namespace de inventario y el destino es un id que
//                    esta en ITEMS.
//
//   attachments      equipped[slot].attachments                  ->  lo recorre
//                    modules/weapons/migrate.js, porque son ids de ACCESORIO y el
//                    modulo que los migra es el que sabe si la combinacion que
//                    forman existe.
//
// Ninguno de los dos es "renombrar el accesorio": los dos son leer un save escrito
// con la nomenclatura anterior. Por eso la conversion va aca y no en una tabla de
// alias permanente del catalogo.
//
// POR QUE NO SE ENCADENA
// ----------------------
// Un renombre se resuelve con UNA sola tabla: `mag_9mm_extended` se convierte en
// `mag_colt45_15` y ahi PARA, aunque `mag_colt45_15` no tenga entrada. Encadenar
// seria casi-correcto y estaria mal, porque los destinos de esta tabla tienen que
// existir en ITEMS y un encadenado puede terminar en un id que es valido en un
// namespace y no en el otro.
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
//   2  el de las fases. El registro de armas es { id, family, attachments, salud }.
//   3  el de hoy. NO hay registro de armas.
//
// NO es "cuantos modulos toco la ultima version". Es "que forma tiene un save
// legible", y sube cuando un modulo cambia la forma de lo que persiste.
//
// POR QUE EL BORRADO DEL SISTEMA DE ARMAS OBLIGA A SUBIRLA
// ---------------------------------------------------------
// Un modulo que deja de escribir su estado no es un modulo que no cambio: es uno
// que cambio la forma de lo que persiste, que es exactamente lo que esta version
// mide. `GameState.Ballistic` es un objeto con un `equipped` que ya no existe, y
// un save que lo trae tiene una forma que el codigo de hoy no puede leer.
//
// Sin subir el numero, un save de la version 2 se cargaria como si fuera de hoy:
// `migrateSave()` no tendria nada que hacer porque no hay migradores registrados,
// pasaria por los dos pasos de los 11 modulos, y dejaria el `Ballistic` viejo
// dentro de un GameState que se graba de vuelta. El save quedaria "correcto" y con
// 4 KB de datos que nadie puede usar.
//
// QUE HACE LA MIGRACION 2 -> 3
// ----------------------------
// NADA, y esa es la respuesta correcta.
//
// No hay nada que traducir: los ids de armas se fueron del catalogo y no tienen
// destino, y el registro `Ballistic` se borra entero en vez de migrarse. Por eso
// NO hay un `registerSaveMigrator(2, ...)` que lo haga, y por eso el lazo de
// migradores de mas abajo no va a correr nada en el paso 2 -> 3.
//
// La limpieza del `Ballistic` esta en SaveManager, en el borrado de claves de
// modulos que ya no existen. Ver ahi la lista de MODULOS_BORRADOS.
//
// Y por que 3 y no 2 otra vez, si el numero no cambia la forma: porque el numero
// ES la forma. Un save tiene una sola version, y subirla es lo que dice "esta
// partida se escribio con un mod que ya no existe".
//
// QUE HACE QUE SUBIRLO SEA OBLIGATORIO, Y NO OPCIONAL
// ----------------------------------------------------
// Un save viejo y uno nuevo tienen el MISMO `version` mientras no se suba. Sin
// el numero no hay forma de saber si lo que trae hay que traducirlo o si es un
// campo sobrante, y las dos lecturas dan un resultado distinto. Peor: sin
// version no hay forma de saber si la migracion YA corrio, asi que un save
// migrado se volveria a migrar en cada carga.
export var SAVE_FORMAT_VERSION = 3;

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
// `Ballistic.equipped` era { "0": {id,...}, "1": {id,...} }, y ahi un `9mm` se
// quedaba viejo sin que nada avisara.
//
// Se vio probando contra el save real: despues de migrar quedaban 32 items
// renombrados y uno sin renombrar, en `.Ballistic.equipped.2.id`.
//
// La asimetria es la trampa: un item dentro de un array se renombraba y el de al
// lado, en la misma partida, no. Dos items con el MISMO id, uno migrado y otro no,
// que es peor que no migrar ninguno: el arma aparece en el baul y desaparece
// del cinturon.
//
// HOY YA NO HAY QUE MIRAR EL SEGUNDO CASO, PERO EL RECORRIDO SE QUEDA.
//
// `Ballistic` era el registro de armas equipadas y no lo escribe ya nadie, asi que
// el contenedor por clave que motivaba esto desaparecio del save. El recorrido en
// profundidad no se quita por eso, y esa es la parte que conviene no entender mal:
//
//   el save es un ARBOL de datos arbitrarios, y este codigo no sabe que hay
//   adentro
//   el dia que un modulo nuevo persista un mapa por clave —y hace tres que lo
//   hacen, con `trunks` indexado por vehicleId— el mismo bug vuelve a aparecer si
//   el recorrido solo baja a los arrays
//
// `_migrarNodo` sigue bajando por las dos ramas porque el save es de otro y el
// recorrido no puede dar por hecho nada. Lo que se perdio fue el ejemplo, no la
// necesidad.

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
// LO QUE SE FUE CON EL SISTEMA DE ARMAS
// ============================================================================
// `_migrarAttachments()` y su tabla ACCESORIOS_RETIRADOS redeminaban los
// `attachments` de un arma: los ids de ACCESORIO que se habian quitado del
// catalogo, y que sin redencion dejaban armas permanentemente
// inequipables.
//
// Eran cinco cargadores neutros, y los cinco se fueron con la tabla de
// armas. El recorrido tambien se va: `attachments` solo existia como campo de
// `GameState.Ballistic.equipped[slot]`, y ese registro no lo escribe ya nadie.
//
// Que no quede un recorrido vacio por el arbol entero se nota en el costo: la
// migracion recoria el save dos veces, y hoy recorre una.
//
// Y `informe.accesoriosRetirados` desaparece del informe. No se deja en 0
// porque un campo que siempre vale 0 hace creer que la migracion corrio y no
// encontro nada, que es distinto de que el campo ya no exista.
// ============================================================================


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
        pasos: []
    };
    if (!parsed || typeof parsed !== "object") return informe;

    var v = versionDe(parsed.version);
    informe.versionAntes = v;

    informe.renombrados = _migrarNodo(parsed, 0);

    // EL MAPA DE LOS CARGADORES PUESTOS, y va acá y no en un migrador por version.
    //
    // Los renombres de arriba corren siempre, sin mirar la version, justamente para
    // no depender de un numero: un save de la version de hoy con un cargador viejo
    // tiene que salir igual. Este pase va en el mismo lugar por la misma razon —
    // `enArma` es un string suelto y `_migrarNodo` no lo ve, asi que si esperara a
    // un migrador por version no correria nunca en los saves que ya estan en la
    // ultima version, que son todos los que importan.
    //
    // Y va antes del lazo de migradores por la misma razon que el renombrado: el
    // migrador de un modulo tendria que leer los ids ya renombrados.
    var puestos = _migrarCargadoresPuestos(parsed);
    if (puestos > 0) {
        informe.pasos.push({
            nombre: "cargadores puestos",
            ok: true,
            detalle: { renombrados: puestos }
        });
    }
    informe.renombrados += puestos;

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
