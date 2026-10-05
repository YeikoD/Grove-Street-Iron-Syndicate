// GSIS - Weapons: state
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Lo unico que el modulo de armas PERSISTE, y son TRES registros:
//
//   GameState.Weapons.equipped[slot] = { id, salud, silenciador }  que arma esta
//   GameState.Weapons.cargadores     = [ { id, ammo } ]   los cargadores equipados
//   GameState.Weapons.enArma[slot]   = "mag_colt45"       QUE CARGADOR ESTA PUESTO
//
// Y los campos, y por que estan:
//
//   id      el itemId de la FAMILIA. El weaponType NO se guarda: es la
//           representacion que ejecuta el motor y sale de los accesorios con
//           tipoDe(). Un save que guarda el numero queda con un arma distinta en
//           cuanto la tabla cambie, que es lo que paso cuando el .dat paso de 347
//           a 15066.
//
//   salud   0..100. El arma equipada NO esta en items[] mientras esta en la mano:
//           sale del inventario al equiparse. Es el unico sitio donde su desgaste
//           puede vivir sin perderse al desequiparla.
//
//   silenciador  si el silenciador esta MONTADO. Vive en la fila y no en un
//           registro por slot, y esa es la parte que no es obvia: el arma se va
//           del inventario a la mano y vuelve, y un mapa por slot no puede seguir
//           al arma en el viaje. La fila del inventario lleva el mismo campo, y
//           por eso las dos copias viajan juntas.
//
//   ammo    solo en los cargadores, y por el mismo motivo: un cargador equipado
//           tampoco esta en items[], asi que su municion tiene que vivir aca. Sin
//           esto, equipar un cargador seria guardarlo vacio.
//
// EL SILENCIADOR ES LO UNICO QUE SE ESCRIBE Y SE LEE DE DOS LUGARES
// ---------------------------------------------------------------------------
// equipped[slot].silenciador y el `silenciador` de la fila en items[]. No hay una
// tercera copia, y por eso no hay regla de prioridad: son el mismo dato en dos
// momentos de la vida del arma. Cuando el arma se equipa, el de items[] se copia
// al registro; cuando se desequipa, el del registro se copia a la fila.
//
// Un flag ausente es `false`, que es lo correcto para un save viejo: un arma que
// no tiene el campo nunca estuvo silenciada.
//
// POR QUE CARGADORES ES UNA LISTA Y EQUIPPED UN MAPA
// ---------------------------------------------------------------------------
// El arma se equipa en el SLOT DEL MOTOR, que va del 1 al 12 y es el mismo que
// guarda el juego: el mapa es la forma de un slot. Un cargador no va a ningun slot
// del motor: va a una ranura propia, y hay un maximo (WEAPONS.CARGADORES_EQUIPADOS).
// El orden de la lista es el de las ranuras, asi que ranura 1 es el indice 0.
//
// LA MUNICION DEL ARMA NO SE GUARDA
// ---------------------------------------------------------------------------
// La del arma en la mano vive en la memoria del ped y se copia al inventario al
// desequiparla. Copiarla al save seria una segunda fuente, y la regla de la casa es
// que un dato tiene UN lugar: el juego es el dueno de la municion de un arma que el
// juego tiene. La del cargador equipado SI se guarda, y no por contradiccion: el
// cargador no es del juego, es del mod.
//
// EL CARGADOR PUESTO: SOLO EL ID
// ---------------------------------------------------------------------------
// enArma[slot] es el MISMO cargador que uno de los cargadores, pero metido en el arma,
// y por eso no guarda `ammo`: sus balas son el clip, que es del juego. Lo que si hace
// falta es la IDENTIDAD, porque sin ella el cargador del arma no existe para el
// modulo: al recargar, el clip viejo se ponia en cero y el cargador se perdia para
// siempre. Solo el id alcanza para devolverlo con lo que le quedo.
//
// Y el clipSize de ese id es lo que ELIGE LA VARIANTE: es el "clip" que recibe
// tipoDe(familia, clip, silenciador). O sea que el cargador puesto es la mitad de
// la configuracion del arma, y la otra mitad es el flag silenciador de la entry.
//
// QUE ESTE ES UN STRING Y NO UN OBJETO, Y POR QUE LA MIGRACION LO TIENE QUE
// TRATAR POR SEPARADO
// ---------------------------------------------------------------------------
// `_migrarNodo` en core/gsis_SaveMigration.js renombra todo objeto que tenga un
// `id` string, y baja por arrays y por mapas. Este valor es un string SUELTO, y a
// un string suelto el recorrido no baja: `typeof nodo === "object"` es falso. Un
// cargador viejo que quedara aqui seria un id que el catalogo no tiene, que
// getCargadorEnArma() trata como desnudo, y la pieza estaria en el limbo: ni en la
// mochila ni en una ranura ni en el arma.
//
// Por eso la migracion tiene un pase explicito para este mapa. Ver
// "EL MAPA DE LOS CARGADORES PUESTOS" en gsis_SaveMigration.js.
//
// LA FILA EQUIPADA DEL INVENTARIO TAMPOCO SE GUARDA: se arma en el snapshot, con lo
// que hay aca mas lo que se lee del ped. Ver equipadasSnap().
//
// NO HAY VERSION DE SAVE PARA ESTO
// ---------------------------------------------------------------------------
// SAVE_FORMAT_VERSION es para cambios de ESQUEMA. Esto es un modulo nuevo con un
// default, y un modulo con default no necesita migracion: registerModule() crea
// `equipped` y `cargadores` vacios en los saves que no los tienen, y los saves viejos
// no tienen ni armas ni cargadores que haya que interpretar.
//
// El save viejo del sistema borrado tenia `GameState.Ballistic`, y esa limpieza
// ya la hizo la migracion a v3. Ver core/gsis_SaveMigration.js.
// ============================================================================

import { registerModule, getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { FAMILIAS, defDeCargador } from "../../data/gsis_weapons.js";
import { clampSalud } from "../../data/gsis_item_data.js";
import { WEAPONS } from "../../core/gsis_Config.js";

// La clave del modulo en el save. Es un nombre NUEVO, no un rename del viejo: el
// viejo era "Ballistic", que ya no existe y que la migracion a v3 descarta.
export var SAVE_KEY = "Weapons";

// Cuantos cargadores hay. El maximo vive en Config; la cantidad real depende de lo
// que haya en la lista y de lo que el catalogo todavia reconozca (ver getCargadores).
export function maxCargadores() {
    return WEAPONS.CARGADORES_EQUIPADOS;
}

// Lo que hay en equipped: { id, salud, silenciador }. Null si el slot no tiene nada.
export function getEntry(slot) {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.equipped) return null;
    return data.equipped[slot] || null;
}

// Las filas equipadas, para el snapshot. Un array, no el mapa: la UI y el
// reconciliador quieren la lista, y el mapa es la forma del save.
export function getEntries() {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.equipped) return [];
    var out = [];
    for (var slot in data.equipped) {
        if (Object.prototype.hasOwnProperty.call(data.equipped, slot)) {
            var e = data.equipped[slot];
            if (e && e.id && FAMILIAS[e.id]) {
                out.push({
                    slot: parseInt(slot, 10),
                    id: e.id,
                    salud: clampSalud(e.salud),
                    silenciador: !!e.silenciador
                });
            }
        }
    }
    out.sort(function (a, b) { return a.slot - b.slot; });
    return out;
}

// Escribir el registro de un slot. `entry` null lo borra.
//
// El `silenciador` se escribe SIEMPRE, y no solo cuando es true: asi la fila del
// save dice lo que el arma es y no hay que suponer que la ausencia es false. Es
// un booleano de un byte en un save que ya tiene el arma entera.
export function setEntry(slot, entry) {
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { equipped: {}, cargadores: [] };
    if (!data.equipped) data.equipped = {};

    if (!entry) {
        delete data.equipped[slot];
    } else {
        data.equipped[slot] = {
            id: entry.id,
            salud: clampSalud(entry.salud),
            silenciador: !!entry.silenciador
        };
    }
    setModuleData(SAVE_KEY, data);
}

// El silenciador montado en un slot. False si no hay arma, o si el arma no lo
// tiene. Es la lectura que usa tipoDe() para elegir la variante.
export function silenciadorEnArma(slot) {
    var e = getEntry(slot);
    return !!(e && e.silenciador);
}

// ---------------------------------------------------------------------------
// LOS CARGADORES EQUIPADOS
// ---------------------------------------------------------------------------

// Los cargadores equipados, densos y en orden de ranura, para la UI y la recarga.
//
// La lista que hay en el save puede tener huecos si algo la dejo mal (un save
// editado, un modulo que se cayo a mitad de un setModuleData). Por eso el bucle
// compacta: lo que sale de aca tiene siempre los indices seguidos desde el 0, y el
// indice ES la ranura que ve el jugador.
//
// Un cargador cuyo id el catalogo ya no tiene se descarta en el camino, por la misma
// razon que un arma: dejarlo bloquea una ranura para siempre.
export function getCargadores() {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.cargadores) return [];
    var out = [];
    for (var i = 0; i < data.cargadores.length && i < maxCargadores(); i++) {
        var c = data.cargadores[i];
        if (c && c.id && defDeCargador(c.id)) {
            out.push({ indice: out.length, id: c.id, ammo: c.ammo || 0 });
        }
    }
    return out;
}

// La primera ranura libre, o -1 si estan las dos ocupadas.
export function ranuraLibre() {
    return getCargadores().length >= maxCargadores() ? -1 : getCargadores().length;
}

// Poner un cargador en una ranura. `entry` null saca el de esa ranura.
//
// La escritura pasa por la lista DENSE y sin huecos: se arma con la lista que
// devuelve getCargadores() —que ya filtro lo que el catalogo no reconoce— y se
// cambia una posicion. Al save van solo las ranuras REALES, nunca un placeholder.
//
// POR QUE EL INDICE SE VALIDA ANTES DE TOCAR NADA
// ---------------------------------------------------------------------------
// Antes, `splice(indice, 1)` con un indice fuera de rango no hacia nada y la
// funcion seguia como si hubiera hecho: escribia la lista y devolvia `true`. Un
// `false` de setCargador es lo que hace que un llamador no crea que guardo una
// pieza, asi que un `true` en un no-op es peor que un `false`: es una mentira que
// el llamador no tiene forma de detectar.
export function setCargador(indice, entry) {
    if (typeof indice !== "number" || indice < 0 || indice >= maxCargadores()) {
        return false;
    }

    var lista = getCargadores();

    if (!entry) {
        // Sacar el ultimo corre los de abajo. Sacar uno que no esta no es un no-op
        // tolerable: es una peticion que no se puede satisfacer, y avisarla por log
        // es lo que la hace visible.
        if (indice >= lista.length) {
            log("[Weapons] setCargador: la ranura " + (indice + 1) +
                " no tiene cargador. No se toca nada.");
            return false;
        }
        lista.splice(indice, 1);
    } else {
        if (indice >= lista.length) {
            // Ranura nueva: se llena el hueco con los que ya hay. `getCargadores()`
            // es denso, asi que llegar hasta `indice` es agregar los que faltan.
            while (lista.length < indice) {
                lista.push({ indice: lista.length, id: null, ammo: 0 });
            }
        }
        lista[indice] = {
            indice: indice,
            id: entry.id,
            ammo: _ammoEnRango(entry.id, entry.ammo)
        };
    }

    var data = getModuleData(SAVE_KEY) || { equipped: {} };
    if (!data.equipped) data.equipped = {};
    // Se guarda la lista SIN los huecos que se rellenaron para llegar a `indice`:
    // `getCargadores()` los filtra y si estan en el save ocupan ranura de mas.
    data.cargadores = lista.filter(function (c) { return !!(c && c.id); });
    setModuleData(SAVE_KEY, data);
    return true;
}

// La municion de un cargador, acotada a lo que le entra.
//
// Y POR QUE HACE FALTA, SI `clipSize` NO CAMBIA
// ---------------------------------------------------------------------------
// Porque el save es de una version anterior. Un cargador puede haberse guardado con
// `clipSize` balas de una epoca en la que el catalogo declaraba mas, y `setCargador`
// no lo mira: copia el numero.
//
// Y el recorte no es cosmético: `llenarDesdeCaja` calcula `falta = cap - ammo`, asi
// que un cargador sobrecargado da `falta` negativo, el boton dice "ya esta lleno", y
// no hay ninguna accion que lo baje a su capacidad. El cargador queda sobrecargado
// para siempre y el jugador no tiene como arreglarlo.
//
// Un numero negativo tambien se acotaba a 0: un `ammo` negativo en el save hace que
// el HUD muestre menos que cero y que la recarga calcule un `n` negativo.
function _ammoEnRango(magId, ammo) {
    var def = defDeCargador(magId);
    if (!def) return 0;
    var n = ammo || 0;
    if (n < 0) n = 0;
    var cap = def.clipSize || 0;
    if (cap > 0 && n > cap) n = cap;
    return n;
}

// ---------------------------------------------------------------------------
// EL CARGADOR QUE ESTA PUESTO EN CADA ARMA
// ---------------------------------------------------------------------------
// Un arma tiene un cargador o no lo tiene, y eso no se deduce de nada: el motor no
// distingue "sin cargador" de "descargado", para el los dos son cero balas. Por eso
// vive aca, con el slot como clave, porque el arma vive en el slot del motor.
//
// SON DOS COSAS, NO UNA
// ---------------------------------------------------------------------------
// Antes era un string suelto —el id del cargador— y sus balas no se guardaban, con
// el argumento de que "sus balas son el clip, que es del juego".
//
// EL ARGUMENTO ERA CORRECTO Y LA CONSECUENCIA NO. El clip del arma en la mano vive
// en `m_aWeapons[]` del save del JUEGO, y el guardado del mod lo dispara una tecla
// que es del mod: F5 escribe `saves\slot_N.ini` y no toca el save de GTA. O sea que
// el unico guardado que el modulo controla no tocaba el archivo del que dependia su
// estado, y el resultado era medible:
//
//   el modulo guardo:  slot 2 = colt45, enArma[2] = "mag_colt45_c15"
//   el juego guardo:   m_aWeapons[2] = EMPTY
//   al cargar:         el modulo sabe que hay un C15 puesto, da la variante 62, y
//                      se lo entrega con 0 balas. Las quince se perdieron.
//
// O sea: el cargador persistia y las balas no, que es la peor forma de perder una
// cosa — el estado dice que la tenes, y no la tenes.
//
// ASI QUE AHORA ES `{ id, ammo }`
// ---------------------------------------------------------------------------
// El modulo es el dueno de la municion del cargador puesto, y lo duena de punta a
// punta: la escribe en el save desde el ped (`snapshotCargadoresPuestos`) y la
// restaura desde el save al ped (`reconciliar`). El juego sigue teniendo el clip
// mientras se juega —el HUD lo necesita y el disparo lo lee—, pero el archivo del
// que se reconstruye la partida es el que el modulo controla.
//
// Y no es una segunda copia con dos duenos: es la misma regla de las otras tres
// formas de la municion. La caja y el cargador de la mochila viven en `items[]`, el
// cargador equipado en `cargadores[].ammo`, y el puesto aca. Cada una en el
// contenedor de su dueno. Ver "LA NORMALIZACION DE CARGA" para el recorte de
// capacidad, que aplica a las dos ultimas igual que a esta.
//
// LOS DOS FORMATOS SE LEEN
// ---------------------------------------------------------------------------
// Un save anterior tiene el string. `getCargadorEnArmaEntero` lo acepta y lo
// devuelve como `{ id, ammo: 0 }`, que es la lectura honesta de un cargador cuyo
// ammunition nunca se guardo: hay cargador, no hay balas. `initState` sube el string
// a objeto, asi que la conversion queda hecha una vez y no en cada lectura.
//
// `setCargadorEnArma(slot, null)` deja el arma desnuda.

// El cargador puesto como objeto, o null si el slot no tiene.
// Acepta las dos formas: un objeto { id, ammo } y el string de los saves viejos.
export function getCargadorEnArmaEntero(slot) {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.enArma) return null;
    var v = data.enArma[slot];
    if (!v) return null;

    var id = null, ammo = 0;
    if (typeof v === "string") {
        id = v;                       // save viejo: no habia ammo, y no hay de donde sacarlo
    } else if (typeof v === "object") {
        id = v.id;
        ammo = v.ammo || 0;
    }

    // Un id que el catalogo ya no tiene se trata como desnudo: el arma no puede
    // devolver un cargador que no existe, y dejarlo puesto bloquearia la recarga.
    if (!id || !defDeCargador(id)) return null;
    return { id: id, ammo: _ammoEnRango(id, ammo) };
}

// El id del cargador puesto, o null. Es la forma que usa todo el mundo.
export function getCargadorEnArma(slot) {
    var e = getCargadorEnArmaEntero(slot);
    return e ? e.id : null;
}

// Poner un cargador en el arma. `ammo` es cuantas balas tiene AL PONERLO.
export function setCargadorEnArma(slot, id, ammo) {
    var data = getModuleData(SAVE_KEY) || { equipped: {}, cargadores: [], enArma: {} };
    if (!data.enArma) data.enArma = {};
    if (id && defDeCargador(id)) {
        data.enArma[slot] = { id: id, ammo: _ammoEnRango(id, ammo) };
    } else {
        delete data.enArma[slot];
    }
    setModuleData(SAVE_KEY, data);
    return id || null;
}

// ---------------------------------------------------------------------------
// LA NORMALIZACION DE CARGA
// ---------------------------------------------------------------------------
// Un cargador con mas balas de las que le entran es un estado que el save puede
// traer y que no se arregla con la UI: `llenarDesdeCaja` calcula `falta = cap - ammo`,
// un `falta` negativo da "ya esta lleno", y no hay ninguna accion que baje el
// cargador a su capacidad. Se queda sobrecargado para siempre.
//
// CUANDO SE ARREGLA, Y POR QUE EN EL INIT Y NO EN CADA ESCRITURA
// ---------------------------------------------------------------------------
// En el init. Es el unico momento en que el numero puede venir de una epoca con otro
// catalogo, y es donde ya se normalizan otras cosas del save —ver
// `normalizeInstances` en inventory/state.js, que hace lo mismo con `salud` y con
// los stacks—. Normalizar en cada escritura taparia el sintoma y dejaria el save con
// el numero viejo, que es la clase de bug que este modulo no quiere.
//
// Y solo se ESCRIBE si algo cambio. Un save sano no se reescribe al arrancar, y eso
// importa porque `setModuleData` marca el guardado sucio: normalizar siempre
// provocaria un guardado en cada carga, en el slot activo, al entrar al juego.
function _normalizarCargadores() {
    var data = getModuleData(SAVE_KEY);
    if (!data || !Array.isArray(data.cargadores)) return 0;

    var cambiados = 0;
    var lista = [];
    for (var i = 0; i < data.cargadores.length && i < maxCargadores(); i++) {
        var c = data.cargadores[i];
        if (!c || !c.id || !defDeCargador(c.id)) continue;   // lo que no existe no ocupa ranura
        var acotado = _ammoEnRango(c.id, c.ammo);
        if (acotado !== (c.ammo || 0)) {
            log("[Weapons] carga: el cargador " + c.id + " tenia " + (c.ammo || 0) +
                " balas y su capacidad es " + acotado + ". Se recorta.");
            cambiados++;
        }
        lista.push({ indice: lista.length, id: c.id, ammo: acotado });
    }

    if (lista.length !== data.cargadores.length) cambiados++;
    if (!cambiados) return 0;

    data.cargadores = lista;
    setModuleData(SAVE_KEY, data);
    return cambiados;
}

// EL MAPA DE LOS CARGADORES PUESTOS, Y POR QUE TAMBIEN SE NORMALIZA
// ---------------------------------------------------------------------------
// `_migrarCargadoresPuestos` en SaveMigration.js renombra los ids viejos de este
// mapa, y tiene su propio pase porque `_migrarNodo` no baja a strings sueltos. Ese
// renombre ocurre una vez, en la migracion.
//
// Lo que se hace aca es la otra mitad de lo mismo y no se puede hacer alla: subir el
// string a `{ id, ammo }`. Es una conversion de FORMA, y la migracion es de
// SIGNIFICADO —traducir un id viejo a uno que existe—, asi que no le corresponde.
//
// Y no se puede hacer en la lectura, porque la lectura es de solo lectura: si
// `getCargadorEnArmaEntero` recibiera un string y escribiera el objeto, la primera
// lectura despues de cargar estaria backing el save viejo con un objeto nuevo que no
// llega a `GameState` hasta el proximo `setModuleData`. O sea: el save se arreglaria
// por accidente, un guardado que no debia existir, y no en el lugar donde se decide
// que un save es un save.
//
// SE NORMALIZA JUNTO CON LOS CARGADORES por la misma razon: las dos cosas son
// "un contenedor que el catalogo puede haber cambiado bajo los pies", y normalizar
// una vez al arrancar deja la lectura libre de casos raros.
function _normalizarEnArma() {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.enArma) return 0;
    var cambiados = 0;
    for (var slot in data.enArma) {
        if (!Object.prototype.hasOwnProperty.call(data.enArma, slot)) continue;
        var v = data.enArma[slot];
        if (!v) { delete data.enArma[slot]; cambiados++; continue; }

        if (typeof v === "string") {
            // Un cargador viejo: hay cargador, no hay balas registradas. Se sube
            // con 0 y no se inventa un numero — un cargador lleno que el jugador
            // nunca lleno seria peoral que uno vacio que puede rellenar.
            data.enArma[slot] = { id: v, ammo: 0 };
            cambiados++;
            log("[Weapons] carga: el cargador puesto del slot " + slot + " (" + v +
                ") venia sin municion registrada. Arranca en 0.");
        } else if (typeof v === "object") {
            var acotado = _ammoEnRango(v.id, v.ammo);
            if (acotado !== (v.ammo || 0)) {
                log("[Weapons] carga: el cargador puesto del slot " + slot + " (" +
                    v.id + ") tenia " + (v.ammo || 0) + " balas y su capacidad es " +
                    acotado + ". Se recorta.");
                cambiados++;
            }
            data.enArma[slot] = { id: v.id, ammo: acotado };
        } else {
            delete data.enArma[slot];
            cambiados++;
        }
    }
    return cambiados;
}

// ---------------------------------------------------------------------------
// EL INIT DEL MODULO
// ---------------------------------------------------------------------------
// Sin export, porque la llama el register() de gsis_Weapons.js: registrar por el
// modulo y no por nombre es lo que hace que este archivo no dependa de
// ModuleRegistry.
export function initState() {
    registerModule(SAVE_KEY, { equipped: {}, cargadores: [], enArma: {} });
    var corregidos = _normalizarCargadores() + _normalizarEnArma();
    log("[Weapons] Registro de equipadas inicializado | cargadores: max " +
        maxCargadores() +
        (corregidos ? " | normalizados al cargar: " + corregidos : ""));
}