// GSIS - Inventory: events
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Los handlers del bus que el modulo de inventario ATIENDE. Todos son de armas:
// sacar, devolver, y tocar la municion de un cargador.
//
//   items:takeWeapon     sacar UN arma del inventario. Responde la fila, o null.
//   items:storeWeapon    devolverla. El arma vuelve DESNUDA: su municion es la del
//                        cargador que tiene puesto, y ese se va por otro lado.
//   items:takeMagazine   sacar UN cargador. Responde la fila, o null.
//   items:storeMagazine  devolver UN cargador, con las balas que le quedaron.
//   items:takeAccessory  sacar UN accesorio suelto. Responde la fila, o null.
//   items:storeAccessory devolverlo, con el chequeo de peso.
//   items:magAmmo        leer la municion de un cargador de la mochila, por indice.
//   items:setMagAmmo     escribirla, sin sacarlo de la mochila.
//   items:takeAmmo       DESCONTAR N balas de las que le sirven a una familia. No
//                        saca filas: descuenta stacks, y borra los que llegan a cero.
//   items:storeAmmo      dar N balas. Pasa por addItem, asi que respeta el tope de
//                        fila y el peso.
//
// `items:magSource` estaba aqui y se borro con el rellenado entre cargadores. Ver
// su lugar, mas abajo, y el bloque de la MUNICION SUELTA.
//
// Que vuelvan es la razon de ser del archivo: un `events.js` que no atiende nada
// es un archivo vacio con un import, y este fue el lugar donde el modulo de armas
// declaro el contrato con el.
//
// ============================================================================
// LAS CUATRO REGLAS DE ESTOS HANDLERS
// ============================================================================
// 1. NADA PARCIAL. Si no hay el item, se responde `null` y no se toca nada. Un
//    "quedaste sin 1 de 2" es peor que un "no hay": el jugador no sabe si perdio
//    algo. Es la misma REGLA 1 de logic.js, y se repite por el mismo motivo.
//
// 2. SE DEVUELVE LA FILA, NO UNA COPIA. El que pide la fila la tiene, y por eso el
//    que la devolvio tiene que GUARDARLA con el estado que le fue agregado —si
//    no, la municion que cargo se pierde—.
//
// 3. EL GASTO ES DEL QUE PIDE. Quien pide el item decide si lo usa: si el motor
//    lo rechaza, avisa con `items:storeWeapon` y la pieza vuelve intacta. Si el
//    inventario gastara la pieza y esperara que se la devuelvan, un fallo del
//    otro lado seria una pieza perdida.
// ============================================================================

import { on } from "../../core/gsis_EventBus.js";
import { getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { ITEMS, SALUD_MAX, isInstanced } from "../../data/gsis_item_data.js";
import { capacidadDeclarada, balaSirveA } from "../../data/gsis_weapons.js";
import { MISC } from "../../core/gsis_Config.js";
import {
    ITEMS_TAKE_WEAPON, ITEMS_STORE_WEAPON, ITEMS_TAKE_MAGAZINE, ITEMS_STORE_MAGAZINE,
    ITEMS_TAKE_ACCESSORY, ITEMS_STORE_ACCESSORY,
    ITEMS_MAG_AMMO, ITEMS_SET_MAG_AMMO,
    ITEMS_TAKE_AMMO, ITEMS_STORE_AMMO
} from "../../core/gsis_EventNames.js";
import { SAVE_KEY, getTotalWeight } from "./state.js";
// `addItem`, y no un push: es lo que hace que dar balas respete `maxStack` y el
// peso. No hay ciclo —logic.js no importa este archivo—.
import { addItem } from "./logic.js";

// Los handlers se registran al IMPORTAR este archivo, no en init().
//
// Razon en el init del modulo: initSaveManager() corre loadGame() antes que
// initAll(), y si un modulo preguntara el inventario durante la carga de un save,
// el handler tiene que existir YA.

// Un arma se saca por el id, este con el que venga. Un arma desnuda es una fila
// valida: no se filtra por municion.
on(ITEMS_TAKE_WEAPON, function (e) {
    e.respond(_sacarUno(e.data ? e.data.id : null, false));
});

// Un cargador se saca solo si TIENE balas, y se saca el que las tenga: si hay dos
// cargadores y uno esta vacio, sacar el vacio primero obliga a una segunda llamada
// para el bueno, y la segunda puede no tener.
//
// Que el cargador salga del inventario con su municion es lo que hace que dos
// cargadores del mismo id no sean la misma cosa.
on(ITEMS_TAKE_MAGAZINE, function (e) {
    e.respond(_sacarUno(e.data ? e.data.id : null, true));
});

// Devolver un arma al inventario. Es el camino de vuelta de dos lugares: el
// desequipar, y el modulo de armas revirtiendo un give que el motor no acepto.
//
// `ammo` viaja en la fila. No se tira: es lo que hace que desequipar a mitad de
// un cargador devuelva un arma con balas y no una desnuda.
//
// `silenciador` tambien viaja, y es el que hace que esto no sea un bug. El
// silenciador esta MONTADO en el arma y por eso no es un item de la mochila: su unico
// hogar es la fila. Si este handler no lo copiara, `desequipar` devolveria el arma
// sin el silenciador y `equipar` la devolveria pelada, y el jugador perderia la
// pieza —el silenciador volveria a la mochila por el camino de `quitarSilenciador` y
// el arma pelada se llevaria el juego entero—. Un item que viaja con otro es un dato
// mas de la fila, no una tabla aparte.
on(ITEMS_STORE_WEAPON, function (e) {
    var d = e.data;
    if (!d || !d.id) {
        e.respond(null);
        return;
    }
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];
    data.items.push({
        id: d.id,
        qty: 1,
        salud: d.salud === undefined ? SALUD_MAX : d.salud,
        ammo: d.ammo || 0,
        silenciador: !!d.silenciador
    });
    setModuleData(SAVE_KEY, data);
    e.respond(true);
});

// Devolver un cargador al inventario. Lo emite el modulo de armas cuando el jugador
// saca uno de la ranura de equipados.
//
// La fila NO lleva `salud`, y esa es la diferencia con el handler de arriba: un
// cargador no tiene desgaste. `ammo` si viaja, y con lo que le queda: un cargador de
// 15 usado en un arma de 8 vuelve con 7, no con 15.
on(ITEMS_STORE_MAGAZINE, function (e) {
    var d = e.data;
    if (!d || !d.id) {
        e.respond(null);
        return;
    }
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];
    data.items.push({
        id: d.id,
        qty: 1,
        ammo: d.ammo || 0
    });
    setModuleData(SAVE_KEY, data);
    e.respond(true);
});

// Sacar una fila por id, sin filtro de municion. Es el camino de las piezas que no
// son armas ni cargadores: el silenciador.
on(ITEMS_TAKE_ACCESSORY, function (e) {
    e.respond(_sacarUno(e.data ? e.data.id : null, false));
});

// Devolver un accesorio a la mochila.
//
// EL PESO SE CHEQUEA ACA y el handler devuelve false si no entra, en vez de
// agregar la fila y avisar despues. La razon es el ORDEN de las escrituras del
// modulo de armas: para desmontar un silenciador hace falta saber que vuelve a la
// mochila ANTES de cambiar el flag del arma y el tipo del motor. Con un handler que
// siempre agrega, el modulo no tendria forma de saber si la pieza se perdio, y un
// silenciador que desaparece del mundo no se puede recuperar.
on(ITEMS_STORE_ACCESSORY, function (e) {
    var d = e.data;
    if (!d || !d.id || !ITEMS[d.id]) {
        e.respond(false);
        return;
    }
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];

    var peso = ITEMS[d.id].weight;
    if (getTotalWeight() + peso > MISC.MAX_INVENTORY_WEIGHT) {
        e.respond(false);
        return;
    }

    data.items.push({ id: d.id, qty: 1, salud: SALUD_MAX, ammo: 0 });
    setModuleData(SAVE_KEY, data);
    e.respond(true);
});

// Saca UNA fila del id pedido y la devuelve. null si no hay.
//
// Se elige la fila CON balas cuando el que pide las quiere, y no la primera que
// aparezca: es la misma razon del handler de arriba.
function _sacarUno(id, conBalas) {
    if (!id) return null;
    // ESTE CAMINO SACA UNIDADES, Y UNA BALA NO ES UNA UNIDAD.
    //
    // `_sacarUno` no filtra por tipo: filtra por id, y el id lo elige quien llama.
    // Eso estaba bien mientras todo lo que pasaba por aca era instanciado. Con la
    // bala —que tiene la banda "magazine" y `instanced: false`— un
    // `items:takeMagazine` con su id se llevaria una fila de 37 balas y la
    // devolveria como un "cargador" con municion 0.
    //
    // El filtro va ACA y no en los tres handlers porque los tres tienen el mismo
    // error y la respuesta correcta es la misma: esto saca filas de una unidad con
    // estado, y un stack no es una unidad con estado. La bala tiene su propio
    // camino, `items:takeAmmo`, que descuenta y no saca.
    if (!isInstanced(id)) {
        log("[Items] _sacarUno: " + id + " es apilable y no es una unidad. " +
            "Las balas se gastan con items:takeAmmo, no se sacan con take*. Es un error de llamado.");
        return null;
    }
    var data = getModuleData(SAVE_KEY);
    if (!data) data = { items: [], trunks: {} };
    if (!data.items) data.items = [];

    var elegido = -1;
    for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id !== id) continue;
        if (conBalas && (data.items[i].ammo || 0) <= 0) continue;
        elegido = i;
        break;
    }
    // Si pedia balas y no hay ninguna fila con balas, NO se saca una vacia: la
    // respuesta es null y el modulo de armas le avisa al jugador que no tiene
    // cargador. Un cargador de cero balas montado en un arma vacia es un
    // "no tenes cargador" que el jugador no entiende.
    if (elegido < 0) return null;

    var fila = data.items[elegido];
    data.items.splice(elegido, 1);
    setModuleData(SAVE_KEY, data);

    // `silenciador` se copia siempre, y no solo cuando es true. Es lo que hace que
    // el arma vuelva a la mochila CON el silenciador montado: el modulo lo lee de
    // aca en `equipar` y lo escribe en el registro del slot. Un arma que perdiera el
    // flag en este viaje ya no lo recuperaria nunca, porque el silenciador ya no
    // esta en ningun otro lado del modulo.
    return {
        id: fila.id,
        salud: fila.salud === undefined ? SALUD_MAX : fila.salud,
        ammo: fila.ammo || 0,
        silenciador: !!fila.silenciador
    };
}

// ---------------------------------------------------------------------------
// LA MUNICION DE UN CARGADOR, POR INDICE
// ---------------------------------------------------------------------------
// Los tres handlers de la accion de RELLENAR. Ver la seccion de EventNames.js.
//
// La regla que los atraviesa: NADA se saca ni se agrega. Rellenar solo ESCRIBE la
// municion de dos filas que ya estan ahi. Si algo se moviera, los indices correrian
// y el segundo escribiria en la fila equivocada — que es la forma sutil de que un
// cargador aparezca con las balas de otro.

// Leer la fila de un indice. { id, ammo } o null si el indice no es un cargador.
//
// El `indice` se valida contra la lista viva, no contra un cache: por eso el
// handler lee el modulo otra vez y no confía en lo que le pasaron.
on(ITEMS_MAG_AMMO, function (e) {
    var d = e.data || {};
    var indice = d.indice;
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.items) { e.respond(null); return; }
    if (typeof indice !== "number" || indice < 0 || indice >= data.items.length) {
        e.respond(null);
        return;
    }
    var fila = data.items[indice];
    if (!fila || fila.ammo === undefined) { e.respond(null); return; }
    e.respond({ id: fila.id, ammo: fila.ammo || 0 });
});

// Escribir la municion de una fila, sin sacarla. true si se escribio.
//
// El `ammo` se recorta a la capacidad declarada del item: es el mismo techo que
// usa la tabla y no uno nuevo, para que "lleno" signifique lo mismo aca que en la
// fila que ve el jugador.
on(ITEMS_SET_MAG_AMMO, function (e) {
    var d = e.data || {};
    var indice = d.indice;
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.items) { e.respond(false); return; }
    if (typeof indice !== "number" || indice < 0 || indice >= data.items.length) {
        e.respond(false);
        return;
    }
    var fila = data.items[indice];
    if (!fila) { e.respond(false); return; }

    var cap = capacidadDeclarada(fila.id);
    var n = Math.max(0, Math.min(cap > 0 ? cap : d.ammo || 0, d.ammo || 0));
    fila.ammo = n;
    setModuleData(SAVE_KEY, data);
    e.respond(true);
});

// La fila de la mochila con MAS BALAS de un id. { indice, ammo } o null.
//
// ESTE HANDLER SE BORRO, Y ESTA ES LA RAZON.
//
// Existia para el rellenado entre cargadores: el destino era un cargador y la
// fuente "otro cargador del mismo id con mas balas". Devolver el indice sin sacarlo
// era lo que hacia posible la transferencia.
//
// Con las cajas la fuente es la bala, y a la bala no se la "busca y se saca": se le
// DESCUENTA una cantidad. Un `items:magSource` de balas tendria que devolver un
// indice para que el modulo lo desarmara a mano con `items:setMagAmmo`, o sea
// exactamente las tres escrituras sin transaccion que este handler ya era. La bala
// entra por `items:takeAmmo`, que hace el gasto entero adentro.
//
// ---------------------------------------------------------------------------
// LA MUNICION SUELTA
// ---------------------------------------------------------------------------
// El gasto de balas, en un solo handler y en una sola escritura.
//
// POR QUE UN SOLO HANDLER Y NO TRES
//
// El rellenado viejo hacia: leer la fuente, escribir el destino, escribir la
// fuente. Tres escrituras y ningun punto donde el modulo pudiera volver atras. Si
// el juego se cerraba entre la segunda y la tercera, el jugador habia perdido
// balas —la fuente nunca se desconto— o se habia ganado balas, si el crash caia
// entre la primera y la segunda y la fuente se habia leido pero no gastado.
//
// Aqui no hay ventana: se lee el stock, se calcula y se escribe una vez. Si el
// juego se cierra antes del `setModuleData`, no se desconto nada; si se cierra
// despues, se desconto bien. No hay estado intermedio que pueda quedar a medias.
//
// De la mas llena primero, no de la primera que aparezca
//
// Con tres filas de 12, 50 y 3, llenar un cargador de 8 contra las tres deja
// 42, 50 y 3; contra la de 12 primero deja 4, 50 y 3 y todavia no necesita abrir
// la siguiente fila. La eleccion es invisible para el jugador en el caso normal y
// evita partir una fila casi vacia cuando hay una llena.
//
// NADA SE SACA DEL INVENTARIO. Un stack se descuenta, no se mueve: la fila se
// BORRA recien cuando llega a cero, y ese es el unico caso en que desaparece una.
on(ITEMS_TAKE_AMMO, function (e) {
    var d = e.data || {};
    var n = Math.floor(Number(d.n));
    if (!isFinite(n) || n <= 0) { e.respond({ taken: 0 }); return; }

    var familias = d.familias || [];
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.items) { e.respond({ taken: 0 }); return; }

    // Cuales filas de municion le sirven a alguna de las familias pedidas.
    var sirven = [];
    for (var i = 0; i < data.items.length; i++) {
        var fila = data.items[i];
        if (!fila || !fila.id) continue;
        var sirve = false;
        for (var f = 0; f < familias.length; f++) {
            if (balaSirveA(fila.id, familias[f])) { sirve = true; break; }
        }
        if (sirve) sirven.push(i);
    }

    // De la mas llena: el mismo criterio del handler que se borro, y por el mismo
    // motivo —llenar contra la mas llena es lo que evita partir una fila a medio
    // camino.
    sirven.sort(function (a, b) { return (data.items[b].qty || 0) - (data.items[a].qty || 0); });

    var faltan = n;
    var tocadas = [];
    for (var s = 0; s < sirven.length && faltan > 0; s++) {
        var idx = sirven[s];
        var q = data.items[idx].qty || 0;
        if (q <= 0) continue;
        var toma = Math.min(q, faltan);
        data.items[idx].qty = q - toma;
        faltan -= toma;
        tocadas.push(idx);
    }

    var tomadas = n - faltan;

    // Las filas que quedaron en cero SE BORRAN, y SOLO las que este handler toco.
    //
    // Un stack de 0 es una fila que el jugador ve en la mochila y no puede usar: no
    // tiene cantidad, no tiene que pesar y ocupa lugar. Y dejarla seria peor que
    // el bug de que se colgara: `balasDeFamilia` contaria esa fila como municion
    // que existe y el boton de Rellenar se activaria sin balas que gastar.
    //
    // Pero solo las que toco ESTE handler. Un `qty` de cero en cualquier otra fila
    // del inventario es de otro modulo y es problema de ese modulo: un barrido
    // general de ceros seria un borrado de datos ajenos dentro de un gasto de balas.
    //
    // Y de ATRAS hacia adelante. Recorriendo al reves, el indice de una fila que
    // todavia no se borro no cambio: borrar la de arriba correria la de abajo, y al
    // reves no. Por eso `tocadas` guarda indices del estado de ANTES del borrado.
    for (var b = tocadas.length - 1; b >= 0; b--) {
        if (data.items[tocadas[b]].qty === 0) data.items.splice(tocadas[b], 1);
    }

    if (tomadas > 0) setModuleData(SAVE_KEY, data);
    e.respond({ taken: tomadas, tocadas: tocadas.length });
});

// Dar balas. Es el camino del debug y de un pickup futuro.
//
// PASA POR addItem, y no por un push como el de `items:storeMagazine`, por dos
// razones que son las dos cosas que un push no hace: respeta `maxStack` —dar 120
// balas son tres filas de 50, 50 y 20, no una de 120— y pesa el total antes de
// escribir. Un push desnudo que se Saltara las dos es el mismo bug que hacia el
// magazineStore sin chequear peso, y esta vez lo esquivamos por existir.
on(ITEMS_STORE_AMMO, function (e) {
    var d = e.data || {};
    var n = Math.floor(Number(d.n));
    if (!d.id || !isFinite(n) || n <= 0) { e.respond(false); return; }
    e.respond(addItem(d.id, n));
});

// El nombre que ESTE modulo emite. Declarado en el archivo del dueno y no en
// EventNames.js, porque no es un contrato: es un aviso de una sola via, para el
// que quiera escucharlo sin tener que preguntar el inventario cada frame.
//
// Cuando se agregue un consumidor, la linea que hay que borrar es la del `on(...)`
// que se sume, no esta.
export var INVENTORY_CHANGED = "inventory:changed";