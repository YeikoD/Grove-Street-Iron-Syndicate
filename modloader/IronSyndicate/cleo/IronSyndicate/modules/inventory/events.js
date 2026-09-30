// GSIS - Inventory: events
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// La otra mitad del contrato con el resto del mod. Aca NADA se importa de otro
// modulo: este archivo traduce peticiones del bus a llamadas de state/logic, y
// nada mas.
//
// Que este archivo exista es lo que hace que el modulo de armas NO importe al de
// inventario. Las dos mitades se hablan por nombres de evento, y cada una sabe
// solo lo suyo:
//
//   weapons  --query-->  inventory   items:takeWeapon / storeWeapon /
//                                  swapMagazine / extractMagazine
//   weapons  <--query--  inventory   weapons:capacityOfItem
//
// Y esa ultima es la que corta el otro import directo: el modulo de armas se
// registra como proveedor de capacidad, y el de inventario PREGUNTA. Ninguno
// importa al otro, y los dos pueden estar en cualquier orden de import.
//
// ============================================================================
// POR QUE LOS NOMBRES SE IMPORTAN Y NO SE ESCRIBEN
// ============================================================================
// Un nombre de evento es un string, y un string mal escrito es un handler que
// no se ejecuta nunca, sin error y sin aviso: el que manda espera una respuesta
// y recibe undefined. Con imports, un nombre mal escrito es un error de
// importacion que se ve al cargar.
//
// Por eso el nombre se DECLARA en un archivo y el otro lo importa de ahi. El bus
// no puede verificar que las dos mitades coincidan, asi que la coincidencia se
// vuelve algo que se importa en vez de algo que se escribe dos veces. Y por eso
// weapons/logic.js importa de ACU, y no al reves: acu esta el que responde.
// ============================================================================

import { on, emit } from "../../core/gsis_EventBus.js";
import {
    ITEMS_SWAP_MAGAZINE, ITEMS_EXTRACT_MAGAZINE,
    ITEMS_TAKE_WEAPON, ITEMS_STORE_WEAPON,
    ITEMS_TAKE_ATTACHMENT, ITEMS_STORE_ATTACHMENT
} from "../../core/gsis_EventNames.js";
import { getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { MISC } from "../../core/gsis_Config.js";
import { ITEMS, clampSalud, isInstanced } from "../../data/gsis_item_data.js";
import {
    SAVE_KEY, isMagazine, capacityOfItem, makeMagazineInstance, ensureTrunks, ensureBelt
} from "./state.js";
import { addItem } from "./logic.js";

// ---------------------------------------------------------------------------
// LOS NOMBRES QUE ESTE MODULO ATIENDE
// ---------------------------------------------------------------------------
// Los cuatro estan declarados en core/gsis_EventNames.js, no aca. La razon esta
// en el header de ese archivo: son nombres con DOS firmas, o sea contratos, y un
// contrato no puede vivir en el archivo de una de las partes. Ver tambien la
// razon por la que se reexportan aca, que es la que le conviene al que los
// consume desde weapons.
//
// Se reexportan para que weapons/logic.js y weapons/reconcile.js los importen de
// un solo lugar del lado que los ATIENDE. Si no, cada `query("items:takeWeapon")`
// en weapons es un string escrito a mano, que es el bug que este archivo existe
// para que no exista mas.
export {
    ITEMS_SWAP_MAGAZINE, ITEMS_EXTRACT_MAGAZINE,
    ITEMS_TAKE_WEAPON, ITEMS_STORE_WEAPON,
    ITEMS_TAKE_ATTACHMENT, ITEMS_STORE_ATTACHMENT
};

// Y el que ESTE modulo emite. weapons/ no lo escucha todavia —la accion de un
// click llega por el comando de la pagina, no por aca— pero se declara para que
// el que lo necesite no tenga que inventar el nombre. Cuando se agregue un
// consumidor, la linea que hay que borrar es la del `on(...)` que se sume, no
// esta.
export var INVENTORY_CHANGED = "inventory:changed";

// Los handlers trabajan sobre el contenedor YA normalizado, pero uno puede correr
// antes del init si alguien pregunta por el bus durante la carga de otro modulo.
// Estos dos son ensureTrunks/ensureBelt de state.js: los MISMOS, importados, y
// no una copia. Dos copias de "cuantas casillas tiene el cinturon" divergen
// calladas, que es la falla que la casa ya marca para itemRow.
function _data() {
    return ensureTrunks(getModuleData(SAVE_KEY));
}

function _save(data) {
    setModuleData(SAVE_KEY, data);
}

// ---------------------------------------------------------------------------
// LOS HANDLERS
// ---------------------------------------------------------------------------

// query("items:swapMagazine", { magIds, ammo, mounted, mountedMagId }) — atomico,
// fuente = CINTURON (solo cargadores equipados): sale de la casilla el cargador
// COMPATIBLE con el arma que mas balas tiene (si sus balas > 0) y, si "mounted"
// no es false, la casilla que acaba de vaciar se queda con el MONTADO, con "ammo"
// balas (0 si se vacio). "mounted: false" = arma sin cargador: la casilla queda
// libre (el cargador fresco se fue al arma). Inventario sin tocar.
//
// `mountedMagId` es el id del cargador que estaba en el arma. NO es opcional.
//
// Es lo que se devuelve al cinturon, y el que falta hace que el cargador montado
// se reconstruya con el id del que ENTRA. El sintoma es invisible la primera vez
// y sobre todo la segunda:
//
//   cinturon: [mag_colt45_extended(15)]   arma: colt45 con mag_colt45(8)
//   R -> entra el de 15, y al cinturon vuelve UN cargador... de 15, con 8 balas.
//
// El de 8 desaparece y el de 15 queda con la capacidad del de 8. Al cambiar de
// nuevo no hay con que volver, y el jugador ve "el cargador de 15 se perdio".
// Que se pierda AL CAMBIAR y no al volver es lo que lo hace confuso: el bug no
// esta en la ida, esta en lo que se guarda en la vuelta.
//
// Recibe una LISTA de magIds y no un id porque un arma puede aceptar varios
// cargadores: el AK de 30 y el tambor de 75 son el mismo arma con dos cargadores
// distintos. Para las armas de un solo cargador la lista tiene un elemento y el
// comportamiento es el de siempre.
//
// Responde { ammo, magId } — el magId matters: es el que le dice a weapons que
// cargador entro y por lo tanto QUE CAPACIDAD aplicar. Antes contestaba solo
// { ammo } y el mod se quedaba con la capacidad del arma, que con variantes
// significa siempre la del cargador equivocado.
on(ITEMS_SWAP_MAGAZINE, function (e) {
    var magIds = e.data.magIds;
    // Un id suelto todavia se acepta: hay llamadas viejas y no cuesta nada
    // envolverlo en una lista de un elemento.
    if (!magIds && e.data.magId) magIds = [e.data.magId];
    if (!magIds || !magIds.length) { e.respond(null); return; }
    magIds = magIds.filter(function (id) { return isMagazine(id); });
    if (!magIds.length) { e.respond(null); return; }
    var data = _data();
    var belt = ensureBelt(data);
    var best = -1;
    for (var i = 0; i < belt.length; i++) {
        var it = belt[i];
        if (!it || magIds.indexOf(it.id) === -1) continue;
        if (!it.ammo || it.ammo <= 0) continue;
        if (best < 0 || it.ammo > belt[best].ammo) best = i;
    }
    if (best < 0) { e.respond(null); return; }
    var magId = belt[best].id;
    var freshAmmo = belt[best].ammo;
    if (e.data.mounted !== false) {
        // Lo que vuelve al cinturon es el MONTADO. Si el llamador no dijo cual
        // era, se usa el de entrada: es una aproximacion que sale bien solo
        // cuando el arma no tiene variantes de cargador, y cuando las tiene
        // cambia un cargador por otro de otra capacidad. Se avisa porque perder un
        // item en silencio es el peor resultado posible aca.
        var backId = e.data.mountedMagId || magId;
        if (backId !== magId) {
            log("[Inventory] WARN: el cargador montado (" + backId +
                ") vuelve al cinturon. Si el llamador no manda mountedMagId, " +
                "se reconstruye con el id del que entra (" + magId + ").");
        }
        // El cargador vuelve con las balas que tenia, recortadas a SU capacidad.
        // Sin el recorte puede nacer sobrecargado, y un cargador con mas balas
        // que su capacidad no lo puede recargar el motor despues.
        //
        // Y la capacidad se PREGUNTA al modulo de armas, no se lee de su tabla.
        // Ver capacityOfItem() en state.js.
        var backAmmo = e.data.ammo || 0;
        var backCap = capacityOfItem(backId);
        if (backCap && backAmmo > backCap) backAmmo = backCap;
        belt[best] = makeMagazineInstance(backId, backAmmo);
    } else {
        belt[best] = null;  // descarga: casilla libre
    }
    _save(data);
    e.respond({ ammo: freshAmmo, magId: magId });
    emit(INVENTORY_CHANGED, { motivo: "swapMagazine", id: magId });
});

// query("items:extractMagazine", { magId, ammo }) — descarga (R sin recambio):
// el cargador montado con "ammo" balas pasa al inventario (respetando el peso).
// Responde { ammo } si cabe, o null si no (INV_FUL: el arma no cambia).
on(ITEMS_EXTRACT_MAGAZINE, function (e) {
    var magId = e.data.magId;
    if (!magId || !isMagazine(magId)) { e.respond(null); return; }
    var out = e.data.ammo || 0;
    if (!addItem(magId, 1, { ammo: out })) { e.respond(null); return; }
    e.respond({ ammo: out });
    emit(INVENTORY_CHANGED, { motivo: "extractMagazine", id: magId });
});

// query("items:takeWeapon", { id }) — saca 1 instancia de arma del inventario
// y responde su estado { hasMag, ammo, salud }, o null si no hay (equipar).
//
// `salud` viaja en la respuesta porque el arma sale de items[] y se va a un
// slot de GTA, donde no hay items[]: si no cruzara aqui, se perderia al
// equipar. equipped[slot] la guarda.
on(ITEMS_TAKE_WEAPON, function (e) {
    var data = _data();
    if (!data || !data.items) { e.respond(null); return; }
    var id = e.data.id;
    // Mejor instancia: la que lleva cargador montado y mas balas
    var best = -1;
    for (var i = 0; i < data.items.length; i++) {
        var it = data.items[i];
        if (it.id !== id) continue;
        if (best < 0) { best = i; continue; }
        var cur = data.items[best];
        var curMag = cur.hasMag !== false, itMag = it.hasMag !== false;
        if (itMag !== curMag) { if (itMag) best = i; continue; }
        if ((it.ammo || 0) > (cur.ammo || 0)) best = i;
    }
    if (best < 0) { e.respond(null); return; }
    var taken = data.items[best];
    var capT = capacityOfItem(taken.id) || 0;
    var hasMagT = taken.hasMag !== false;
    var ammoT = (taken.ammo === undefined || taken.ammo === null)
        ? (hasMagT ? capT : 0)
        : taken.ammo;
    var saludT = clampSalud(taken.salud);
    if ((taken.qty || 1) > 1) taken.qty -= 1; // por si queda un stack heredado
    else data.items.splice(best, 1);
    _save(data);
    // Y ACa se ve el namespace: esto devuelve el id DE INVENTARIO
    // ("mag_colt45_extended"), no el canonico ("mag_colt45_15"). weapons/logic.js
    // lo convierte con inventoryAttachmentId() al recibirlo. Ver "LOS DOS
    // NAMESPACES DE LOS ACCESORIOS" en data/gsis_weapons.js.
    e.respond({
        hasMag: hasMagT,
        ammo: ammoT,
        salud: saludT,
        // La configuracion del arma viaja con la instancia. Sin esto, equipar de
        // vuelta un arma que se desequipo con silenciador lo deja pelado.
        attachments: taken.attachments || null
    });
    emit(INVENTORY_CHANGED, { motivo: "takeWeapon", id: id });
});

// query("items:storeWeapon", { id, hasMag, ammo, salud, attachments, force }) —
// guarda 1 instancia de arma con su estado (desequipar / adopcion del ped).
// "force" ignora el peso (adopcion). Responde { ok } o null si no cabe (INV_FUL).
//
// `attachments` viaja porque la CONFIGURACION del arma es parte de la instancia,
// no del slot de GTA. Sin eso, desequipar una Colt .45 con silenciador la
// guardaba como una Colt .45 pelada: el silenciador no estaba ni en el slot ni en
// el inventario, y no habria forma de recuperarlo salvo comprarlo de nuevo.
//
// Y `attachments` entra en el namespace de INVENTARIO: weapons/ lo convierte con
// inventoryAttachmentId() antes de mandar. Este modulo no sabe de canonicos.
on(ITEMS_STORE_WEAPON, function (e) {
    var ok = addItem(e.data.id, 1, {
        hasMag: e.data.hasMag,
        ammo: e.data.ammo,
        salud: e.data.salud,
        force: e.data.force === true
    });
    if (ok && e.data.attachments) {
        // addItem devuelve el id, no la instancia recien creada, asi que el
        // attachments se pega a la fila por id y no hay que devolverla. Es lo
        // unico que se escribe aca: el resto del estado lo arma addItem.
        var data = _data();
        if (data && data.items) {
            for (var i = data.items.length - 1; i >= 0; i--) {
                if (data.items[i].id === e.data.id) {
                    data.items[i].attachments = e.data.attachments.slice();
                    break;
                }
            }
            _save(data);
        }
    }
    e.respond(ok ? { ok: true } : null);
    if (ok) emit(INVENTORY_CHANGED, { motivo: "storeWeapon", id: e.data.id });
});

// ---------------------------------------------------------------------------
// LOS ACCESORIOS, QUE SON OTRO CASO
// ---------------------------------------------------------------------------
// Un cargador o un silenciador se puede montar en un arma, y eso es SACARLO del
// inventario y ponerlo en el arma. Al reves de una arma, que se guarda y ya esta.
// La ida y la vuelta estan separadas en dos handlers, y no como un parametro
// `devolver`, por una razon que se ve en el firma: la fila que viaja tiene el
// ammo del cargador, y `items:takeAttachment` la devuelve entera para que
// `items:storeAttachment` la pueda devolver igual. Un solo handler con un flag
// "devolver" tendria que reconstruir la fila cuando devuelve, y con eso perderia
// las balas.
//
// Y el `force` de la vuelta: un accesorio que se devuelve tiene que entrar SI O SI,
// aunque el inventario este lleno. El espacio se lecoco cuando el jugador lo
// guardo, y no puede ser que un fallo del motor le baje el cargador.

// query("items:takeAttachment", { id }) -> { item } | null
//
// `id` es el itemId DE INVENTARIO del accesorio ("mag_colt45_extended"), no el
// canonico ("mag_colt45_15"): el namespace de este modulo es el de inventario, y
// weapons/logic.js convierte con inventoryAttachmentId() antes de preguntar.
//
// Para un cargador con varias copias en el inventario se lleva la que mas balas
// tiene. Montar el cargador de 30 lleno sobre uno de 5 vacio cambia lo que el
// jugador recibe, y el motivo para tener mas de uno en la mochila es
// precisamente querer el mejor.
on(ITEMS_TAKE_ATTACHMENT, function (e) {
    var id = e.data && e.data.id;
    if (!id || !ITEMS[id]) { e.respond(null); return; }
    var data = _data();
    if (!data || !data.items) { e.respond(null); return; }
    var best = -1;
    for (var i = 0; i < data.items.length; i++) {
        var it = data.items[i];
        if (it.id !== id) continue;
        if (best < 0) { best = i; continue; }
        // Los no instanciados (chatarra y cosas asi) se comparan por qty, y los
        // instanciados por ammo. Un accesorio SIEMPRE es instanciado, asi que la
        // segunda rama es la de siempre; la primera esta porque comparar un
        // `ammo` de undefined con otro de undefined da 0 === 0 y podia elegir la
        // fila equivocada en un catalogo que crece.
        if (isInstanced(id)) {
            if ((it.ammo || 0) > (data.items[best].ammo || 0)) best = i;
        } else if ((it.qty || 1) > (data.items[best].qty || 1)) {
            best = i;
        }
    }
    if (best < 0) { e.respond(null); return; }
    var fila = data.items[best];
    if ((fila.qty || 1) > 1) fila.qty -= 1;   // por si queda un stack heredado
    else data.items.splice(best, 1);
    _save(data);
    e.respond({ item: fila });
    emit(INVENTORY_CHANGED, { motivo: "takeAttachment", id: id });
});

// query("items:storeAttachment", { item, force }) -> { ok }
//
// Recibe la fila COMPLETA y la mete como estaba. No llama a addItem: addItem
// fabrica una fila nueva con los defaults, y para un cargador devuelto eso
// significa perder las balas que tenia. Este handler mete lo que le dieron.
on(ITEMS_STORE_ATTACHMENT, function (e) {
    var fila = e.data && e.data.item;
    if (!fila || typeof fila !== "object" || !fila.id || !ITEMS[fila.id]) {
        e.respond(null);
        return;
    }
    var data = _data();
    if (!data.items) data.items = [];
    // El peso se chequea igual, salvo que venga `force`: un accesorio devuelto
    // entra siempre. Perderlo por un inventario lleno seria peor que dejar pasar
    // una fila mas, y el jugador puede tirar algo.
    if (e.data.force !== true) {
        var def = ITEMS[fila.id];
        var peso = def.weight * (fila.qty || 1);
        if (_pesoDe(data.items) + peso > MISC.MAX_INVENTORY_WEIGHT) {
            e.respond(null);
            return;
        }
    }
    data.items.push(fila);
    _save(data);
    e.respond({ ok: true });
    emit(INVENTORY_CHANGED, { motivo: "storeAttachment", id: fila.id });
});

function _pesoDe(items) {
    var total = 0;
    for (var i = 0; i < items.length; i++) {
        var def = ITEMS[items[i].id];
        if (def) total += def.weight * (items[i].qty || 1);
    }
    return total;
}
