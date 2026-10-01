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
//   cinturon: [mag_colt45_15(15)]        arma: colt45 con mag_colt45(8)
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
    // QUE CARGADOR ENTRA. Esta es la parte que estaba rota, y la razon de que
    // "volver a las 8 balas" fuera imposible.
    //
    // La regla anterior era "el que tiene MAS balas". Con eso, si el cinturon
    // tiene un cargador de 15, R elige el de 15 SIEMPRE, y el arma se queda en 15
    // para siempre. Es una ratchet de una sola direccion: MEDIDO el 30/09, cuatro
    // presses seguidos de R, las cuatro veces "monta mag_colt45_15", y el caso de
    // DESMONTA de tryReload inalcanzable porque el swap siempre respondia OK.
    //
    // El cinturon tiene DOS cargadores de colt45: mag_colt45 (8, de fabrica) y
    // mag_colt45_15 (15, extendido). Y solo UNO de los dos cambia el weaponType: el
    // extendido tiene needsVariant, el de fabrica es el cargador de ORIGEN del arma y
    // no mueve el tipo. Por eso el arma esta en 8 balas cuando el extendido NO esta
    // montado, y en 15 cuando esta. "El mas lleno" elige siempre el extendido cuando
    // existe, y nunca el camino de vuelta.
    //
    // (Hubo un tercero, mag_colt45_replica, con la misma capacidad que el de fabrica.
    //  No hacia nada y se quito del catalogo el 30/09. Ver ACCESORIOS_RETIRADOS en
    //  core/gsis_SaveMigration.js, que es donde se redimen los saves que lo tengan.)
    //
    // La regla nueva, en orden:
    //
    //   1. el cargador IGUAL al montado no cuenta. No es un cambio: el mismo
    //      accesorio resuelve al mismo weaponType y el arma no se mueve. Ademas,
    //      como en ese caso el GIVE no hace REMOVE, GIVE_WEAPON_TO_CHAR SUMA: con
    //      15 balas y un GIVE de 15 el total pasaba a 30. MEDIDO.
    //   2. si hay un cargador montado, se prefiere uno de OTRA capacidad. Es la
    //      unica distincion que cambia el weaponType, asi que es el unico
    //      intercambio que el jugador puede estar pidiendo.
    //   3. si no hay cargador montado, el mas lleno. Subir de 8 a 15 es lo que se
    //      quiere cuando no hay nada puesto.
    //   4. si no queda nada, se responde null y R cae al caso de DESMONTA.
    //
    // Con eso R es un ciclo de verdad: 8 -> 15 -> 8, y no una ida sin vuelta.
    var montadoCap = e.data.mountedMagId ? capacityOfItem(e.data.mountedMagId) : 0;
    var best = -1;
    var otro = -1;
    for (var i = 0; i < belt.length; i++) {
        var it = belt[i];
        if (!it || magIds.indexOf(it.id) === -1) continue;
        if (!it.ammo || it.ammo <= 0) continue;
        if (e.data.mountedMagId && it.id === e.data.mountedMagId) continue;
        if (best < 0 || it.ammo > belt[best].ammo) best = i;
        if (montadoCap && capacityOfItem(it.id) !== montadoCap) {
            if (otro < 0 || it.ammo > belt[otro].ammo) otro = i;
        }
    }
    best = (otro >= 0) ? otro : best;
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
        // El aviso es por el llamador que NO manda mountedMagId, no por el hecho de
        // que los ids sean distintos. Son dos cosas distintas: con el 15 montado y
        // el de 8 entrando los ids SIEMPRE son distintos, y eso es un intercambio
        // legitimo, no una aproximacion. MEDIDO el 30/09: el aviso salia en cada R
        // del ciclo y hacia creer que se estaba reconstruyendo el cargador.
        if (!e.data.mountedMagId) {
            log("[Inventory] WARN: el llamador no mando mountedMagId. El cargador que " +
                "vuelve al cinturon se reconstruye con el id del que entra (" + magId +
                "), y si no son el mismo se perdio el que estaba montado.");
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
        var saliente = makeMagazineInstance(backId, backAmmo);

        // *** POR QUE NO HAY CASO ESPECIAL PARA EL CARGADOR DE FABRICA ***
        //
        // Hubo una rama `esFabrica` aca que, cuando el cargador que entra era de
        // fabrica (needsVariant false), dejaba ese cargador en su casilla y mandaba
        // el montado a una casilla LIBRE. Hacia falta una casilla libre, y si no
        // habia se rechazaba el cambio. Ademas el `return` de esa rama no llamaba
        // `e.respond`, que fue la causa directa de que la R duplicara cargadores.
        //
        // La rama estaba justificada con "montar el de fabrica no deja ninguna pieza
        // puesta en el arma, asi que no se lo puede sacar del cinturon". La
        // invariante que lo desmiente es la del modulo entero: el cargador MONTADO no
        // esta ni en el cinturon ni en el inventario.
        //
        // Cuando el de fabrica entra, el arma vuelve a su configuracion base, y la
        // configuracion base de una familia ES "tengo el cargador de fabrica
        // puesto". O sea: el cargador de fabrica NO se queda en el cinturon, esta
        // DENTRO del arma. Por eso `belt[best] = saliente` es correcto en las dos
        // direcciones y no hay nada que exceptuar:
        //
        //   R, entra el extendido  belt[best] = el de fabrica (con las balas del arma)
        //   R, entra el de fabrica  belt[best] = el extendido  (con las balas del arma)
        //
        // En los dos casos: uno sale del cinturon y entra al arma, y el que estaba
        // en el arma sale a la casilla del que entro. Dos cargadores antes, dos
        // despues, y las balas se mueven con la pieza que las tenia.
        //
        // Lo que la rama especial rompia, ademas de la duplicacion: la duplicacion
        // de MUNICION. Dejaba el cargador de fabrica en el cinturon CON SUS 8 BALAS
        // y despues respondia `ammo: freshAmmo`, asi que el arma recibia 8 balas
        // que ya estaban en otro lado. Ocho balas que no tienen de donde salir.
        belt[best] = saliente;
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
    // Y ACa no hay namespace que traducir: un accesorio tiene un solo id, el mismo
    // que declara WEAPON_ATTACHMENTS y el mismo que esta en ITEMS. Lo que devuelve
    // este id es el que weapons/logic.js monta tal cual. Ver "UN SOLO NOMBRE POR
    // PIEZA" en data/gsis_weapons.js.
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
// Y `attachments` entra con el MISMO id que tiene en el catalogo: este modulo
// guarda lo que weapons/ le pasa, sin traducir.
on(ITEMS_STORE_WEAPON, function (e) {
    // EL CARGADOR QUE ESTABA MONTADO, PRIMERO. Ver el contrato en
    // core/gsis_EventNames.js.
    //
    // Va antes que el arma a proposito, y con compensacion, porque la operacion
    // tiene que ser ATOMICA: o entran las dos cosas o no entra ninguna. Si el arma
    // entra y el cargador no, se perdio un item, y un item perdido no se ve: el
    // cinturon tiene una cosa menos y el arma esta igual.
    //
    // Se hace ACU y no en weapons por dos razones de propiedad: el cinturon y el
    // inventario son de este modulo, y "este cargador estaba montado" es un dato de
    // weapons (sale de la lista de accesorios) mientras que "donde va un cargador
    // suelto" es un dato de aca.
    var puesto = null;   // donde quedo el cargador, para poder deshacerlo
    if (e.data.magazine) {
        var mag = e.data.magazine;
        if (!isMagazine(mag.id)) { e.respond(null); return; }
        var mAmmo = mag.ammo || 0;
        var mCap = capacityOfItem(mag.id) || 0;
        if (mCap && mAmmo > mCap) mAmmo = mCap;

        var d2 = _data();
        if (!d2 || !d2.items) { e.respond(null); return; }
        var belt2 = ensureBelt(d2);
        var libre2 = -1;
        for (var k2 = 0; k2 < belt2.length; k2++) { if (!belt2[k2]) { libre2 = k2; break; } }

        if (libre2 >= 0 && mAmmo > 0) {
            // 1. Cinturon, si hay casilla y el cargador tiene balas.
            //
            //    Un cargador VACIO no va al cinturon: no es municion, y ocupa una de
            //    las pocas casillas que un cargador lleno necesita. Va a la mochila.
            belt2[libre2] = makeMagazineInstance(mag.id, mAmmo);
            _save(d2);
            puesto = { donde: "cinturon", indice: libre2, id: mag.id };
        } else {
            // 2. Inventario. Y aqui NO se filtra por ammo: un cargador vacio tambien
            //    se guarda. Perder un cargador porque estaba vacio es la clase de bug
            //    mas dificil de ver que hay: el jugador pierde una pieza y no hay
            //    ningun aviso.
            if (!addItem(mag.id, 1, { ammo: mAmmo })) {
                log("[Inventory] el cargador " + mag.id + "(" + mAmmo + ") no entra: " +
                    (libre2 < 0 ? "cinturon lleno" : "cinturon sin sitio para uno con balas") +
                    " y la mochila sin lugar. No se guarda el arma.");
                e.respond(null);
                return;
            }
            puesto = { donde: "mochila", id: mag.id, ammo: mAmmo };
        }
    }

    var ok = addItem(e.data.id, 1, {
        hasMag: e.data.hasMag,
        ammo: e.data.ammo,
        salud: e.data.salud,
        force: e.data.force === true
    });
    if (!ok && puesto) {
        // El arma no entro y el cargador ya estaba puesto: se saca el cargador y no
        // se guarda nada. weapons re-equipa con el cargador puesto, asi que el
        // estado del ped queda como estaba.
        if (puesto.donde === "cinturon") {
            var d3 = _data();
            ensureBelt(d3)[puesto.indice] = null;
            _save(d3);
        } else {
            removeItem(puesto.id, 1);
        }
        log("[Inventory] el arma " + e.data.id + " no entro: se devuelve el cargador " +
            puesto.id + " y no se guarda nada.");
    }
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
    if (puesto) {
        log("[Inventory] el cargador " + puesto.id + " que estaba montado vuelve a " +
            (puesto.donde === "cinturon" ? ("el cinturon [" + puesto.indice + "]")
                                         : "la mochila"));
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
// `id` es el id del accesorio, y es el mismo en ITEMS, en WEAPON_ATTACHMENTS y en
// las tres capas de weapons/. Este modulo no traduce nada: lo guarda como llega.
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
