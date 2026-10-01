// GSIS - Weapons: logic
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Las operaciones de armas: equipar, desequipar, montar un accesorio, sacarlo y
// recargar. Y las tres reglas que las ordenan:
//
//   la configuracion es la identidad     family + attachments. No hay weaponId,
//                                         ni magId, ni hasMag, ni variantWeaponType.
//   el weaponType se deriva             resolveWeaponType(). Siempre. Sin caida
//                                         silenciosa a un tipo por defecto.
//   la capacidad la dice el motor        Engine.clipCapacityOf(). El mod la LEE y
//                                         no escribe m_nAmmoClip nunca.
//
// El "como se le da el arma al ped" esta en internal.js, que existe para que este
// archivo y reconcile.js puedan compartirlo sin importarse entre si.
//
// ============================================================================
// LO QUE SE BORRO Y POR QUE
// ============================================================================
// La version anterior (modules/gsis_Ballistic.js, 1816 lineas) tenia DOS modelos
// de arma conviviendo. Lo que se fue:
//
//   weaponId como identidad
//       `_tipoEnPies`, `_typeBelongsTo` y el `tipo = wd.weaponId` de equipWeapon
//       eran TRES respuestas a "que weaponType tiene el ped en la mano". Y una
//       cuarta estaba reescrita a mano dentro de `resolveAttachmentsOf`.
//       Ahora hay una funcion: resolveWeaponType(family, attachments).
//
//   magId y hasMag
//       La capacidad del arma escrita en un segundo lugar, al lado de la lista de
//       accesorios que ya la dice. Con las dos, un tambor de 75 se recortaba a 30
//       en el frame siguiente del reconciliador, porque el segundo lugar se
//       llenaba con el valor por defecto de la familia.
//
//   m_nAmmoClip global
//       syncClipSizes + expandMagazine + _escribirClip + _aplicarCapacidad
//       escribian la CWeaponInfo de los cuatro tipos de skill, lo que significa
//       que la capacidad de un tipo le cambia a TODOS los que lo usen, NPCs
//       incluidos. Con eso, llevar el tambor le ponia 75 balas a todos los AK del
//       juego. Ahora lo escribe el .asi al registrar el tipo, una vez, y el mod
//       solo lo lee.
//
//   la anim de recarga
//       `_reloadTargets` + `_startReloadAnim` + `_watchdogReload` existian porque
//       el codigo creia que un cargador se ponia ENCIMA de un arma que ya estaba
//       ahi. No se ponia encima: cambiar de cargador es cambiar de weaponType, y
//       eso es dar y quitar. El watchdog existia porque el motor a veces no
//       cerraba la recarga y dejaba el arma muda; con el cambio de tipo no hay
//       estado que dejar colgado.
//
//   las dos fuentes de capacidad
//       `_engineClip` (preguntaba el skill al ped) y `_engineClipPlugin` (fijo en
//       STD) contestaban lo mismo por caminos distintos, y `_capacityByType`
//       decidia entre las dos con una cadena de `if` de la que nadie estaba
//       seguro. Ahora contesta una: Engine.clipCapacityOf().
// ============================================================================

import { query } from "../../core/gsis_EventBus.js";
import {
    ITEMS_TAKE_WEAPON, ITEMS_STORE_WEAPON,
    ITEMS_SWAP_MAGAZINE, ITEMS_EXTRACT_MAGAZINE,
    ITEMS_TAKE_ATTACHMENT, ITEMS_STORE_ATTACHMENT
} from "../../core/gsis_EventNames.js";
import { t } from "../../core/gsis_L10n.js";
import * as Engine from "../../core/gsis_Engine.js";
import {
    resolveWeaponType, isAttachmentCompatible, getAttachmentById,
    magazineIdsFor, getFamilyById, factoryMagazineOf,
    mountedMagazineOf, otherAttachmentsOf
} from "../../data/gsis_weapons.js";
import { ITEMS, clampSalud } from "../../data/gsis_item_data.js";
import {
    getEntry, setEntry, mountedMagazine, hasMagazine, familyOfItem
} from "./state.js";
import { _giveInternal } from "./internal.js";
import { weaponVariant } from "./events.js";

// ============================================================================
// CONFIGURAR
// ============================================================================
// Cambia la lista de accesorios de una instancia y devuelve el weaponType, o null
// si la combinacion no existe.
//
// NO muta la instancia. Devuelve la lista nueva y el tipo, y es el llamador quien
// la guarda: una funcion que muta su argumento y devuelve un codigo de error deja
// al llamador sin poder distinguir entre "no se pudo" y "quedo como estado".
export function configure(instancia, attachments) {
    if (!instancia || !instancia.family) return null;
    var copia = (attachments || []).slice();

    // Un accesorio repetido no es una configuracion. Sin este chequeo, montar
    // dos veces el mismo silenciador daba una clave distinta y el resolver
    // devolvia null por un motivo que el jugador no puede ver.
    var vistos = {};
    for (var i = 0; i < copia.length; i++) {
        if (vistos[copia[i]]) return null;
        vistos[copia[i]] = true;
    }

    // Se guarda ORDENADA, y no por prolijidad: la identidad de una
    // configuracion es un CONJUNTO de accesorios, y el registro es lo que
    // sobrevive a un save. Si la lista depende del orden en que el jugador monta
    // las cosas, dos saves del mismo arma se ven distintos y el reconciliador
    // tiene que adivinar que son la misma. La clave de la variante ordena igual,
    // pero la lista del registro tiene que ser canonica por si sola.
    copia.sort();

    var tipo = resolveWeaponType(instancia.family, copia);
    if (tipo === null) {
        log("[Weapons] WARN: no existe la configuracion " + instancia.family +
            " + [" + copia.join(", ") + "]. No se aplica nada.");
        return null;
    }
    return { attachments: copia, weaponType: tipo };
}

export function getAttachments(instancia) {
    return (instancia && instancia.attachments) ? instancia.attachments : [];
}

// ============================================================================
// EQUIPAR
// ============================================================================
// Del inventario al slot de GTA. Si el slot ya tiene un arma, esa se desequipa
// antes (auto-swap). Devuelve true si se equipo.
//
// `attachmentsPedidos` es lo que la pagina pide montar. Es OPCIONAL y esa
// opcionalidad tiene una razon: el comando de la UI manda `id` y, si quiere una
// configuracion distinta de la que ya trae la instancia, manda tambien la lista.
// Sin el, el arma se equipa con la configuracion que YA tiene guardada en el
// inventario, que es el camino de siempre.
//
// ---------------------------------------------------------------------------
// LO QUE ESTA FUNCION NO HACE: CREAR ACCESORIOS
// ---------------------------------------------------------------------------
// Montar un accesorio lo CONSUME del inventario. Un accesorio que aparece en el
// arma sin salir de ningun lado es un accesorio regalado, y el precedente esta
// escrito en ITEM_RENAMES: cuando `silenced_9mm` dejo de ser un arma y paso a ser
// un accesorio, la migracion NO lo "[[equipo]]" en la Colt, porque el item viejo
// valia 1.800 y el silenciador 1.200, y hacerlo asi era regalar 600. Dar un arma
// con un accesorio montado que no salio del inventario es exactamente el mismo
// error, y por eso el consumo va ANTES de dar el arma y se revierte entero si el
// motor la rechaza.
//
// Y `attachmentsPedidos` NO puede contener un weaponType disfrazado: son ids de
// accesorios, se canonicalizan, y la lista tiene que resolver a una variante
// real. Si no resuelve, no se aplica nada. Ver configure() arriba.
export function equipWeapon(itemId, attachmentsPedidos) {
    var family = familyOfItem(itemId);
    if (!family) return false;                       // chaleco, material, etc
    var char = Engine.playerChar();
    if (!char) return false;
    var fam = getFamilyById(family);
    var slot = fam.slot;
    if (getEntry(slot) && !unequipWeapon(slot)) return false;

    var taken = query(ITEMS_TAKE_WEAPON, { id: itemId });
    if (!taken) return false;

    // La configuracion con la que vuelve. Un arma que se desequipo con un
    // silenciador tiene que volver con el: el inventario guarda la lista, y
    // perderla deja al arma pelada con un cargador de 15 en la mano, que es un
    // estado que el inventario no puede describir.
    var attachments = (taken.attachments || []).slice();
    var salud = clampSalud(taken.salud);
    var ammo = Math.max(0, taken.ammo || 0);

    // --- lo que la pagina pidio, si pidio algo ---
    //
    // Solo se toma como pedido valido si resuelve a una variante. Un accesorio que no
    // existe, o una combinacion que no esta en la tabla, se descarta ANTES de
    // tocar el inventario: asi una pagina con un boton viejo no gasta un
    // cargador que el jugador quizas no quiere gastar.
    var aMontar = [];
    if (Array.isArray(attachmentsPedidos) && attachmentsPedidos.length) {
        var pedido = [];
        for (var pi = 0; pi < attachmentsPedidos.length; pi++) {
            var pedidoId = attachmentsPedidos[pi];
            if (pedidoId && pedido.indexOf(pedidoId) < 0) pedido.push(pedidoId);
        }
        // Un pedido que NO RESUELVE hace fallar la accion, y no se equipa "lo que
        // traia". Equipar otra cosa que la que se pidio es peor que no equipar
        // nada: el jugador cree que monto un silenciador y no lo monto, y no hay
        // nada en la pantalla que le diga que no. Un false deja que la pagina
        // avise; un true silencioso deja un arma que no es la que se pidio.
        if (!pedido.length || resolveWeaponType(family, pedido) === null) {
            log("[Weapons] la pagina pidio equipar " + family + " + [" +
                pedido.join(", ") + "], que no es ninguna variante. No se equipa nada.");
            return false;
        }
        aMontar = pedido;
    }

    // Los accesorios que hay que CONSUMIR: los que se piden y no estan ya en la
    // instancia. Los que ya estan montados no se vuelven a sacar del inventario:
    // seria cobrar dos veces por la misma pieza.
    var aConsumir = [];
    for (var mi = 0; mi < aMontar.length; mi++) {
        if (attachments.indexOf(aMontar[mi]) < 0) aConsumir.push(aMontar[mi]);
    }

    // --- se consumen ANTES de dar el arma, y se guardan para poder volver ---
    //
    // El orden importa: si se diera el arma primero y despues faltara un
    // accesorio, el arma quedaria equipada con una configuracion que el
    // inventario no respalda, que es el estado que el reconciliador no sabe
    // arreglar.
    var consumidos = [];
    for (var ci = 0; ci < aConsumir.length; ci++) {
        var acc = aConsumir[ci];
        var saga = query(ITEMS_TAKE_ATTACHMENT, { id: acc });
        if (!saga || !saga.item) {
            // No habia: se devuelve TODO lo que ya se habia sacado, y el arma
            // tambien, y no se aplica nada. El jugador no pierde nada y la
            // pagina recibe un false que puede mostrar.
            for (var dv = 0; dv < consumidos.length; dv++) {
                query(ITEMS_STORE_ATTACHMENT, { item: consumidos[dv], force: true });
            }
            query(ITEMS_STORE_WEAPON, {
                id: itemId, salud: salud, ammo: taken.ammo || 0,
                hasMag: mountedMagazineOf(family, attachments) !== null,
                attachments: taken.attachments || null, force: true
            });
            log("[Weapons] no se pudo montar " + acc + ": no hay ninguno en el " +
                "inventario. El arma vuelve al inventario como estaba.");
            return false;
        }
        // `saga.item` y NO `saga`: lo que se guarda para la vuelta es la FILA, y
        // guardar el sobre entero hace que la vuelta mande {item:{item:fila}} y
        // el manejador no encuentre el id. El sintoma es silencioso y feo: el
        // accesorio desaparece del inventario y no vuelve, y el rollback que
        // existe justamente para eso no devuelve nada.
        consumidos.push(saga.item);
    }

    var listaFinal = aMontar.length ? aMontar : attachments;

    // LAS BALAS DEL CARGADOR QUE SE MONTO.
    //
    // Un arma se entrega DESNUDA: sin cargador y con 0 balas. Si el jugador monta
    // un cargador LLENO y el arma se queda en 0, el arma queda inservible: la R
    // solo recarga desde el CINTURON, y el cargador ya no esta en el cinturon,
    // esta dentro del arma. Montar un cargador lleno tiene que poner sus balas
    // en el arma, y no hay ningun otro camino que lo haga.
    //
    // Se busca el cargador MONTADO entre lo que se consumio, y no "el ultimo
    // accesorio": un silenciador no tiene balas y un arma puede llevar un
    // cargador y un silenciador en cualquier orden de montaje.
    var ammoDelCargador = -1;
    for (var am = 0; am < consumidos.length; am++) {
        var filaCarg = consumidos[am];
        if (!filaCarg || !ITEMS[filaCarg.id]) continue;
        if (ITEMS[filaCarg.id].type !== "magazine") continue;
        var balas = filaCarg.ammo;
        if (typeof balas === "number" && balas > ammoDelCargador) ammoDelCargador = balas;
    }
    if (ammoDelCargador > 0) ammo = ammoDelCargador;

    var r = _giveInternal(char, family, listaFinal, ammo, "equipar");
    if (!r.ok) {
        // =====================================================================
        // DIAGNOSTICO. Temporal.
        //
        // Lo que hace es dejar de tirar el `motivo` que _giveInternal ya calculo.
        // Ese motivo es la UNICA forma de distinguir dos fallos que desde afuera
        // se ven iguales: el motor no acepto el tipo, o el motor lo acepto y
        // despues la verificacion dijo que no estaba.
        //
        // Ademas mide LAS DOS FORMAS de preguntar lo mismo, porque el sintoma que
        // se esta investigando es que no coinciden:
        //
        //   por native   -> HAS_CHAR_GOT_WEAPON, que es lo que usa hasWeapon()
        //   por memoria  -> el tipo en el slot, que es lo que ve el reconciliador
        //
        // Y mide el tipo PEDIDO, no `r.weaponType`. En el camino de fallo
        // _giveInternal devuelve { ok, motivo } y NADA mas, asi que r.weaponType es
        // undefined: la primera version de esta sonda preguntaba por el tipo 0
        // (desarmado) y reportaba "native=true, memoria=0", que no son datos, son
        // las dos sondas mirando el arma equivocada.
        // =====================================================================
        var _ped = Engine.pedPointer(char);
        var _addr = Engine.addressOfType(_ped, resolveWeaponType(family, listaFinal) || 0);
        var _porMemoria = _addr ? Engine.slotType(_addr) : 0;
        var _porNative = Engine.hasWeapon(char, _addr ? _porMemoria : 0);
        log("[Weapons] EQUIP FALLO (item=" + itemId + " slot=" + slot + ") | motivo: " +
            r.motivo + " | tipo pedido=" + (r.weaponType || resolveWeaponType(family, listaFinal) || "?") +
            " | por native (HAS_CHAR_GOT_WEAPON)=" + (_porNative ? "true" : "false") +
            " | por memoria (el slot)=" + _porMemoria +
            " | givePorNativo=" + (Engine.giveUsesNative() ? "si" : "no") +
            " | ammo pedido=" + ammo + " | fila en el inventario: " + taken.ammo);
        // =====================================================================
        // FIN DEL DIAGNOSTICO
        // =====================================================================

        // El motor no lo acepto: la instancia vuelve al inventario, no se pierde.
        // Y con ella los accesorios que se habian sacado, que es la parte que no
        // se puede dejar a medias: un silenciador que desaparece del inventario
        // por un fallo del motor es un item perdido por un error que el jugador
        // no puede ver.
        query(ITEMS_STORE_WEAPON, {
            id: itemId, salud: salud, ammo: taken.ammo || 0,
            hasMag: mountedMagazineOf(family, attachments) !== null,
            attachments: taken.attachments || null, force: true
        });
        for (var sv = 0; sv < consumidos.length; sv++) {
            query(ITEMS_STORE_ATTACHMENT, { item: consumidos[sv], force: true });
        }
        return false;
    }

    // El registro se escribe DESPUES de que el motor acepto. Al reves, un fallo
    // del motor dejaria el save diciendo que el arma esta equipada con el ped sin
    // arma, y el reconciliador no tendria con que compararlo.
    setEntry(slot, { id: itemId, family: family, attachments: r.attachments, salud: salud }, "equipar");
    showTextBox(t("EQP_OK"));
    return true;
}

// ============================================================================
// DESEQUIPAR
// ============================================================================
// Del slot al inventario, con las balas VIVAS leidas del ped.
//
// El tipo que se saca sale de la configuracion guardada, y no es el weaponId de
// la familia. Esa es toda la razon de que esto no se haya roto con las variantes:
// preguntar por el tipo de la familia da 0 de balas, no saca nada, y el arma
// aparece en los dos sitios a la vez con el cargador de 15 y sus 15 balas
// evaporadas.
export function unequipWeapon(slot) {
    var entry = getEntry(slot);
    if (!entry) return false;
    var char = Engine.playerChar();
    if (!char) return false;

    var tipo = resolveWeaponType(entry.family, entry.attachments);
    if (tipo === null) {
        // La configuracion guardada no existe. No es teorico: pasa si se saca
        // una fila del .dat. El arma no se pierde y no se toca; se avisa.
        log("[Weapons] ERROR: el slot " + slot + " tiene " + entry.family + " + [" +
            (entry.attachments || []).join(", ") + "] y esa configuracion no esta " +
            "declarada. El arma se queda en la mano y el inventario no cambia.");
        return false;
    }

    var cap = Engine.clipCapacityOf(tipo);
    var ammo = Engine.getAmmo(char, tipo);
    if (cap > 0 && ammo > cap) ammo = cap;

    Engine.removeWeapon(char, tipo);

    // Solo se guarda el item si el arma salio del ped, o habria una copia. Y la
    // verificacion es por el TIPO que se acaba de quitar, no por el de la familia:
    // si el slot tuviera otra representacion de la misma familia, comparar contra
    // la familia daria "salio" por construccion.
    if (Engine.hasWeapon(char, tipo)) return false;
    var addr = Engine.addressOfType(Engine.pedPointer(char), tipo);
    if (addr && Engine.slotType(addr) === tipo) return false;

    // El cargador que estaba MONTADO sale del arma y vuelve a ser un objeto.
    //
    // ANTES el arma se guardaba con el cargador en la lista de accesorios, y eso
    //mentationaba el cargador: no era un objeto que se pudiera sacar, cambiar o
    // poner en el cinturon, era parte de la fila del arma. Con la R trabajando sobre
    // cargadores del cinturon, las dos cosas no se podia llevar bien: el cargador
    // del cinturon se cambiaba por uno, y el que estaba puesto no existia como
    // objeto en ningun lado.
    //
    // Ahora el cargador sale con la municion que tenia, el arma se guarda SIN el, y
    // el modulo de inventario lo pone en el cinturon si hay sitio y tiene balas, o en
    // la mochila si no. Un cargador vacio va a la mochila y NO se consume.
    //
    // El fallo se maneja solo: si el inventario no puede guardar el arma, el modulo
    // devuelve el cargador a donde estaba y weapons re-equipa con el cargador puesto,
    // asi que el estado del ped queda como estaba.
    var magMontado = mountedMagazine(entry);
    var attachmentsSinMag = (entry.attachments || []).filter(function (a) { return a !== magMontado; });

    // Sin cargador montado, la lista es la misma y no hay nada que separar.
    var store;
    if (magMontado) {
        // La MUNICION es del cargador: el arma vuelve vacia. El total de un arma con
        // cargador es lo que hay en el cargador, y si el arma se guardara con las balas
        // y el cargador volviera con ellas, el mismo cargador estaria contado dos
        // veces.
        store = {
            id: entry.id,
            ammo: 0,
            salud: entry.salud,
            hasMag: false,
            attachments: attachmentsSinMag.slice(),
            magazine: { id: magMontado, ammo: ammo }
        };
    } else {
        store = {
            id: entry.id,
            ammo: ammo,
            salud: entry.salud,
            hasMag: hasMagazine(entry),
            attachments: (entry.attachments || []).slice()
        };
    }

    if (!query(ITEMS_STORE_WEAPON, store)) {
        // Sin espacio en el inventario: el arma sigue siendo del jugador.
        _giveInternal(char, entry.family, entry.attachments, ammo,
            "no entro en el inventario, se re-equipa");
        return false;
    }
    setEntry(slot, null, "desequipar");
    return true;
}

// ============================================================================
// MONTAR Y SACAR UN ACCESORIO
// ============================================================================
// Monta un accesorio sobre el arma EQUIPADA de ese slot. Devuelve
// { ok: true, weaponType } o { ok: false, motivo }.
//
// La razon de que sea un arma EQUIPADA y no cualquier arma del inventario: el
// weaponType cambia lo que el motor ejecuta, y el motor solo ejecuta lo que el ped
// tiene en la mano. Montar un silenciador a una Colt del baul no tendria ningun
// efecto observable hasta que se equipe, y para entonces el jugador ya se olvido
// de que lo monto.
//
// ----------------------------------------------------------------------------
// MONTAR CONSUME EL ACCESORIO, Y ESO NO ES OPCIONAL
// ----------------------------------------------------------------------------
// Esta funcion NO es "sumar un id a una lista": saca la pieza del inventario, la
// pone en el arma, y si el motor no acepta la configuracion nueva la devuelve.
//
// Sin el consumo, montar el silenciador seria GRATIS: la pieza queda en el
// inventario y ademas queda en el arma. Eso es duplicacion de objetos, la misma
// clase de bug que el que se cerro hace poco, y es peor que el anterior porque no
// se ve: el jugador ve un silenciador en la mochila y una Colt silenciada, y las
// dos cosas son "correctas" por separado.
//
// Y el consumo va ANTES de dar el arma, no despues. Al reves, si el motor
// rechazara la configuracion, el accesorio ya estaria montado en el arma que se
// acaba de dar y habria que volver a dar el arma anterior para deshacerlo.
//
// Lo mismo por el otro lado: `detachAccessory` devuelve la pieza al inventario. Un
// sistema donde se monta y no se puede sacar es un callejon sin salida con un item
// pagado, que es el problema que motivo todo esto.
//
// QUE PASA CON LA MUNICION AL SACAR
// ---------------------------------
// El accesorio vuelve como una fila nueva con 0 balas, y las balas se quedan en
// el arma. Es la regla menos mala de las dos posibles y conviene decirla: sacar el
// cargador de 30 de un AK deja el AK con 30 balas y el cargador en la mochila
// vacio. La alternativa —devolver el cargador con las balas que tenia— exigiria
// decidir de que numero se sacs, y ese numero no existe: el motor responde la
// municion por TIPO de arma, no por cargador, asi que "las balas del cargador" no
// es una pregunta que el motor pueda contestar.
//
// Para un cargador lleno esta la R, que es el camino de verdad para eso. Aqui el
// caso raro es solo el silenciador, que no tiene municion y para el cual la regla
// no dice nada.
//
// ----------------------------------------------------------------------------
// QUIEN LAS LLAMA
// ----------------------------------------------------------------------------
// Las llama el comando `inv:mount` / `inv:unmount` de la pagina (ui/commands.js).
// Antes no las llamaba nadie, y el comentario de abajo —que decia que sin ellas
// los tipos 60, 61, 62, 64, 65 y 66 eran inalcanzables— quedo a medias: 62, 64, 65
// y 66 se alcanzan desde la R, que cambia el cargador del cinturon. Los que
// necesitan este camino son 60 y 61, porque el silenciador no es un cargador y la R
// no lo toca.
export function attachAccessory(charId, slot, attachmentId) {
    var entry = getEntry(slot);
    if (!entry) return { ok: false, motivo: "no hay arma equipada en el slot " + slot };
    var char = charId || Engine.playerChar();
    if (!char) return { ok: false, motivo: "no hay ped" };

    var att = getAttachmentById(attachmentId);
    if (!att) return { ok: false, motivo: "el accesorio " + attachmentId + " no existe" };
    if (!isAttachmentCompatible(attachmentId, entry.family)) {
        return { ok: false, motivo: att.name + " no va en " + entry.family };
    }
    var actual = (entry.attachments || []).slice();
    if (actual.indexOf(attachmentId) !== -1) return { ok: false, motivo: "ya esta montado" };

    // Que la combinacion exista ANTES de gastar la pieza. Un accesorio que no
    // lleva a ninguna variante no se saca del inventario para descubrir eso.
    if (resolveWeaponType(entry.family, actual.concat([attachmentId])) === null) {
        return { ok: false, motivo: att.name + " con " + entry.family +
            " no es ninguna variante declarada" };
    }

    // Se SACA del inventario.
    var saga = query(ITEMS_TAKE_ATTACHMENT, { id: attachmentId });
    if (!saga || !saga.item) {
        return { ok: false, motivo: "no tenes ningun " + att.name + " en el inventario" };
    }

    var r = _aplicar(char, slot, entry, actual.concat([attachmentId]), "montar " + att.name);
    if (!r.ok) {
        // El motor no lo acepto: la pieza vuelve, intacta. Perder un accesorio
        // por un fallo del motor es la peor forma de perderlo, porque el jugador
        // no puede ver la causa.
        query(ITEMS_STORE_ATTACHMENT, { item: saga.item, force: true });
        return r;
    }
    return r;
}

export function detachAccessory(charId, slot, attachmentId) {
    var entry = getEntry(slot);
    if (!entry) return { ok: false, motivo: "no hay arma equipada en el slot " + slot };
    var char = charId || Engine.playerChar();
    if (!char) return { ok: false, motivo: "no hay ped" };

    var accId = attachmentId;

    // Sin id, se saca EL accesorio que no es cargador. Y el que decide cual es
    // este modulo, no la pagina.
    //
    // La razon: la pagina no consulta el catalogo —no tiene ITEMS ni WEAPON_DATA, y
    // su propia documentacion lo dice— asi que no puede distinguir un silenciador
    // de un cargador por el id. Y no tiene por que: la R ya cubre los cargadores,
    // y lo unico que queda para `inv:unmount` es lo otro. Adivinarlo del prefijo
    // "mag_" en la pagina seria meter en el frontend la convencion de nombres del
    // catalogo, que es exactamente la clase de acoplamiento que el corte del
    // inventory pretendia cerrar.
    if (!accId) {
        var otros = otherAttachmentsOf(entry.attachments || []);
        if (otros.length === 0) {
            return { ok: false, motivo: "no hay ningun accesorio montado en el slot " + slot };
        }
        if (otros.length > 1) {
            return { ok: false, motivo: "hay mas de un accesorio montado (" +
                otros.join(", ") + "): cual sacar" };
        }
        accId = otros[0];
    }

    var actual = (entry.attachments || []).slice();
    if (actual.indexOf(accId) === -1) {
        return { ok: false, motivo: "no tiene " + accId + " montado" };
    }
    var quedan = actual.filter(function (a) { return a !== accId; });

    var r = _aplicar(char, slot, entry, quedan, "sacar " + accId);
    if (!r.ok) return r;

    // La pieza vuelve al inventario. Con 0 balas: ver la nota de arriba sobre por
    // que el numero de balas del cargador no existe como pregunta.
    query(ITEMS_STORE_ATTACHMENT, {
        item: { id: accId, qty: 1, ammo: 0, salud: 100 },
        force: true
    });

    // `saco` es lo que se quito de verdad. Sin esto, un comando que llega sin id no
    // tiene forma de decir QUE salio del arma, y con dos accesorios la respuesta
    // "tipo 60" no dice si se saco el silenciador o el cargador.
    r.saco = accId;
    return r;
}

// El cuerpo comun de montar y sacar.
//
// Lo delicado es la MUNICION, y sale del mismo camino de siempre: cambiar de
// weaponType es un REMOVE + GIVE, y el GIVE arranca con el arma vacia. Asi que la
// municion se lee ANTES de cambiar y se escribe despues. Y el registro se escribe
// DESPUES de que el motor confirmo: al reves, un fallo dejaria el save diciendo
// que el silenciador esta montado y el arma sin silenciador.
//
// ----------------------------------------------------------------------------
// `cap` SE CONSERVA, Y NO ES COSMETICO
// ----------------------------------------------------------------------------
// _giveInternal devuelve `cap` (la capacidad que DICE el motor para el tipo nuevo)
// y este return la dejaba caer. Con `cap` en undefined, en tryReload:
//
//   var ammo = Math.min(resp.ammo || 0, r.cap > 0 ? r.cap : (resp.ammo || 0));
//
// la guarda `r.cap > 0` es falsa, asi que el `Math.min` recorta contra si mismo y
// NO recorta. La proteccion de "un cargador con mas balas que su capacidad no
// puede recargar el motor" estaba escrita y no podia dispararse.
//
// Y se notaba en el log: la recarga del tambor escribia
//   [Weapons] recarga: tipo 64 con 75/undefined balas
// Un "undefined" en un log es peor que un log sin ese dato, porque el que lo lee
// deduce que la capacidad no se consulto, cuando si se consulto.
function _aplicar(char, slot, entry, attachments, que) {
    var tipoViejo = resolveWeaponType(entry.family, entry.attachments);
    var ammo = tipoViejo === null ? 0 : Engine.getAmmo(char, tipoViejo);
    var r = _giveInternal(char, entry.family, attachments, ammo, que);
    if (!r.ok) return { ok: false, motivo: r.motivo };

    setEntry(slot, {
        id: entry.id, family: entry.family, attachments: r.attachments, salud: entry.salud
    }, que);
    weaponVariant(que, entry.family, r.attachments, r.weaponType, slot);
    return {
        ok: true,
        weaponType: r.weaponType,
        attachments: r.attachments,
        ammo: r.ammo,
        cap: r.cap
    };
}

// ============================================================================
// RECARGA
// ============================================================================
// La tecla R. Y el nombre "recarga" es lo unico que se le mantiene, porque las
// dos cosas que hace ya no tienen nada que ver entre si:
//
//   1. hay un cargador en el cinturon que le sirve a esta familia
//      -> se MONTA. Es un accesorio, asi que cambia de variante, y eso es dar el
//         arma de nuevo. Y despues setAmmo con las balas que tenia.
//
//   2. no hay recambio y hay cargador montado
//      -> se DESMONTA: vuelve a la variante base y el arma queda descargada.
//
// Las dos pasan por la animacion nativa de recarga, y las dos la disparan IGUAL:
// dos escrituras en el CWeapon. Ver _startReloadAnim.
//
// (El comentario de esta seccion decia antes que habia un tercer caso, "el
//  cargador ya montado se rellena". No existe, y el porque esta escrito mas
//  abajo, al final de tryReload. Se dejo la nota porque el comentario miente y
//  un comentario que miente es peor que un comentario que falta.)
//
// ---------------------------------------------------------------------------
// POR QUE LA ANIM VUELVE, Y POR QUE NO ES LO QUE HABIA
// ---------------------------------------------------------------------------
// Se habia eliminado `_reloadTargets` + `_startReloadAnim` + `_watchdogReload`
// porque el codigo creia que un cargador se ponia ENCIMA de un arma que ya estaba
// ahi. No se ponia encima: cambiar de cargador es cambiar de weaponType, y eso es
// REMOVE + GIVE. El watchdog existia porque el motor a veces no cerraba la
// recarga y dejaba el arma muda.
//
// El diagnostico era correcto y la conclusion estaba mal. Que cambiar de cargador
// sea un tipo NUEVO no impide la animacion: solo cambia sobre QUE CWeapon se
// escribe. El tipo viejo ya no esta en el ped, y el anim que tiene sentido es el
// del tipo nuevo.
//
// Asi que la anim se dispara DESPUES del give, no antes. Ese es el cambio
// completo respecto de la version anterior, y es el unico que hay que mirar si
// un dia esto se rompe otra vez.
//
// Y el watchdog vuelve, porque el problema que resolvia no era del modelo viejo:
// era del motor, y sigue existiendo. Ver _watchdogReload.
// ============================================================================
// LA ANIMACION NATIVA
// ============================================================================
// El motor ya sabe animar una recarga. No hace falta ni una animacion propia ni
// una task: se le escriben DOS campos del CWeapon y el resto lo hace el juego.
//
//   CWeapon::m_nTimeForNextShot = ahora + reloadTime
//   CWeapon::m_nState           = 2  (WEAPONSTATE_RELOADING)
//
// CTaskSimpleGunControl ve el estado 2 y lanza el anim RELOAD del animGroup del
// arma. Cuando vence el plazo, CWeapon::Update -> Reload() mueve las balas del
// total al clip. Ni el modulo ni el .asi participan en esto.
//
// El mecanismo y las direcciones estan verificados de dos formas independientes:
// el layout de CWeapon/CWeaponInfo contra WeaponLimits.h, y la funcion de reload
// time contra los bytes de gta_sa.exe en 0x743D70. Es la misma direccion que
// usa "Reload Mod" (L171), que es un mod de recarga ajeno y funciona.
//
// ---------------------------------------------------------------------------
// POR QUE NO SE PISA m_nState A CERO ANTES
// ---------------------------------------------------------------------------
// Un modulo de arma a cero deja al arma en OUT_OF_AMMO (3), y en ese estado
// CWeapon::Fire hace return false: el arma TIENE balas y no dispara. Por eso el
// codigo que da un arma escribe READY explicitamente. La anim de recarga escribe
// 2 arriba de lo que hubiera, y si eso era 3 lo arregla de paso.

// El reload pendiente, para el watchdog. Uno solo: el arma de la mano es una, y
// dos recargas simultaneas no existen.
var _reloadPending = null;

// Que este arma se pueda animar, y sobre que direccion. Null si no puede.
//
// Las guardas, y por que cada una:
//
//   slotAddress  del slot SELECCIONADO del ped. No del weaponType: despues de un
//     REMOVE + GIVE el tipo nuevo esta en un slot, y el del arma en la mano es el
//     que se anima. Un CWeapon equivocado aqui es un anim en un arma que no esta
//     en la mano, que se ve como que no pasa nada.
//
//   reloadSpec  null si el arma no tiene anim de recarga. Sin esta guarda se
//     escribe m_nState = 2 en un arma sin anim, el motor no lanza nada, no cierra
//     el estado, y el arma queda muda CON BALAS. Es el fallo que el watchdog de
//     abajo no puede arreglar por tiempo, porque el plazo se cumple y el motor
//     nunca estuvo recargando.
//
//   m_nState != 2  ya esta recargando. Pulsar R dos veces no encadena dos
//     recargas: la segunda se ignora.
function _reloadTargets(ped, slot) {
    if (!ped || !slot) return null;
    var addr = Engine.slotAddress(ped, slot);
    if (!addr) return null;
    if (Engine.slotState(addr) === Engine.WEAPONSTATE_RELOADING) return null;
    var type = Engine.slotType(addr);
    if (!type) return null;
    var spec = Engine.reloadSpec(type);
    if (!spec) return null;
    return { addr: addr, type: type, ms: spec.ms };
}

// Dispara la animacion nativa. `ammoEsperado` es el total que deberia quedar
// cuando termine; 0 en la descarga.
//
// Se llama DESPUES del give, nunca antes: el give escribe READY y el tipo viejo
// ya no esta en el ped.
function _startReloadAnim(targets, char, ammoEsperado) {
    if (!targets) return false;
    try {
        var now = Engine.timerNow();
        Engine.setSlotNextShotTime(targets.addr, now + targets.ms);
        Engine.setSlotState(targets.addr, Engine.WEAPONSTATE_RELOADING);
        _reloadPending = {
            ped: Engine.pedPointer(char),
            addr: targets.addr,
            type: targets.type,
            deadline: now + targets.ms,
            ammo: ammoEsperado
        };
        return true;
    } catch (e) {
        return false;
    }
}

// El watchdog. Cierre forzado de una recarga que el motor no cerro.
//
// POR QUE SIGUE HACIENDO FALTA: CWeapon::Update solo sale de RELOADING cuando el
// reloj pasa m_nTimeForNextShot, y el estado lo limpia Reload(). Si el anim nunca
// arranco (y por eso esta el reloadSpec, pero hay mas causas: el ped entra en un
// vehiculo, una cutscene, el arma se da a otro lado) el estado se queda en 2 o en
// 3 para siempre, y CWeapon::Fire hace return false. El arma tiene balas y no
// dispara, sin error y sin log.
//
// Asi que pasado el plazo mas un margen, si el estado sigue siendo 2 o 3, se
// replica el cierre del motor: total = el esperado, clip = min(capacidad, total),
// estado = READY, reloj = ahora.
//
// NO es un parche para una anim que no arranca. Es la red que evita que un arma
// quede muda, y por eso se queda aunque la anim funcione siempre.
export function _watchdogReload() {
    var p = _reloadPending;
    if (!p) return;
    try {
        var now = Engine.timerNow();
        if (now <= p.deadline + TIMERS.RELOAD_GRACE) return;   // margen del motor

        // Si CJ cambio de arma, la recarga que esperamos no es la de este slot.
        // El motor ya no la va a cerrar, pero tampoco es un fallo: se solapa.
        if (p.ped) {
            var char = new Player(0).getChar();
            if (char && Engine.pedPointer(char) !== p.ped) { _reloadPending = null; return; }
        }

        var state = Engine.slotState(p.addr);
        if (state !== Engine.WEAPONSTATE_RELOADING &&
            state !== Engine.WEAPONSTATE_OUT_OF_AMMO) {
            _reloadPending = null;   // el motor termino la recarga solo
            return;
        }

        var cap = Engine.clipCapacityOf(p.type);
        if (Engine.slotTotal(p.addr) !== p.ammo) Engine.setSlotTotal(p.addr, p.ammo);
        Engine.setSlotClip(p.addr, Math.min(cap > 0 ? cap : p.ammo, p.ammo));
        Engine.setSlotState(p.addr, Engine.WEAPONSTATE_READY);
        Engine.setSlotNextShotTime(p.addr, now);
        log("[Weapons] watchdog de recarga: el motor no cerro la recarga del tipo " +
            p.type + " (estado " + state + "). Cerrada a mano con " + p.ammo + " balas.");
        _reloadPending = null;
    } catch (e) {
        _reloadPending = null;
    }
}

export function tryReload() {
    var w = Engine.readCurrentWeapon();
    if (!w) return;
    var entry = getEntry(w.slot);
    if (!entry) return;   // el arma de la mano no es nuestra: no es un error

    var char = w.char;
    var montado = mountedMagazine(entry);
    var magIds = magazineIdsFor(entry.family);

    if (!magIds.length) {
        log("[Weapons] recarga: la familia " + entry.family + " no tiene cargadores " +
            "en el catalogo | tipo " + w.type);
        return;
    }

    // --- caso 1: hay un cargador en el cinturon que le sirve ---
    //
    // QUE CARGADORES SE OFRECEN. Es el filtro que hace que R sea un ciclo y no una
    // ratchet, y va ACA y no en el handler de inventario, porque "este cargador
    // cambia el arma" es una pregunta de variantes, y las variantes son de este
    // modulo.
    //
    // Un cargador con `needsVariant: false` NO se agrega a la lista de accesorios:
    // es el cargador de fabrica, y lo que define al arma es que el cargador
    // EXTENDIDO este montado o no. Asi que montarlo equivale a que no haya
    // cargador extendido.
    //
    // MEDIDO el 30/09, y era el bug que quedaba: el cinturon tiene mag_colt45 (8,
    // needsVariant false) y mag_colt45_15 (15, needsVariant true). Con el de 15
    // montado, R tomaba el de 8, armaba la lista [mag_colt45, suppressor], ESA
    // combinacion no tiene variante declarada, el give fallaba, y como el
    // cargador ya se habia gastado del cinturon y el return era incondicional, el
    // arma se quedaba en 15 y el cargador de 8 habia desaparecido. El jugador veia
    // "el de 8 se convierte en el de 15".
    //
    // Se ofrecen solo los cargadores que llevan a una variante DISTINTA de la
    // actual. Los demas no se piden, y si no queda ninguno el handler responde
    // null y R cae al caso de DESMONTA, que es el camino de vuelta.
    var otros = (entry.attachments || []).filter(function (a) { return !_esCargador(a); });
    var magIdsUtiles = [];
    for (var mi = 0; mi < magIds.length; mi++) {
        var cand = magIds[mi];
        var att = getAttachmentById(cand);
        var listaCand = otros.slice();
        // needsVariant false = cargador de fabrica = no hay cargador extendido.
        if (!att || att.needsVariant !== false) listaCand.push(cand);
        var tipoCand = resolveWeaponType(entry.family, listaCand);
        if (tipoCand !== null && tipoCand !== w.type) magIdsUtiles.push(magIds[mi]);
    }

    // QUE CARGADOR ESTA DENTRO DEL ARMA. Para la R no es lo mismo que
    // `montado`, porque `montado` lee `attachments` y el cargador de FABRICA no
    // esta ahi: la variante base se declara con la lista vacia.
    //
    // La distincion importa en el caso de DESMONTA, que saca el cargador del arma
    // al inventario. Ahi si se usa `montado`, porque un cargador de fabrica nunca
    // se desmonta a la fuerza: no es una pieza que el jugador haya montado, es lo
    // que el arma tiene.
    var magEnElArma = montado || factoryMagazineOf(entry.family);

    var resp = magIdsUtiles.length
        ? query(ITEMS_SWAP_MAGAZINE, {
              magIds: magIdsUtiles,
              ammo: w.ammo || 0,
              // `mounted` dice "hay algo que volver a la casilla de la que entra".
              // Con el cargador de fabrica de la familia, SIEMPRE lo hay: o hay un
              // cargador extendido montado, o hay el de fabrica, o el arma no tiene
              // cargador y no hay que devolver nada. Por eso `magEnElArma` y no
              // `montado`, y por eso la rama de "descarga" del handler no la
              // recorre nunca weapons/.
              mounted: magEnElArma !== null,
              mountedMagId: magEnElArma
          })
        : null;
    if (resp) {
        var nuevo = resp.magId;
        // El cargador viejo sale de la lista y entra el nuevo. Con dos cargadores
        // en la lista la clave de la variante seria distinta y el resolver no
        // encontraria fila. Los OTROS accesorios (un silenciador) sobreviven:
        // montar el tambor del AK no le quita el silenciador.
        var lista = otros.slice();
        var attNuevo = getAttachmentById(nuevo);
        if (!attNuevo || attNuevo.needsVariant !== false) lista.push(nuevo);
        var r = _aplicar(char, w.slot, entry, lista, "recarga: monta " + nuevo);
        if (r.ok) {
            // Las balas las trae el cargador del cinturon, recortadas a la
            // capacidad del tipo NUEVO. Con un tambor son 75 y no 30: usar la
            // capacidad anterior recortaria el cargador nuevo al cargador viejo.
            var ammo = Math.min(resp.ammo || 0, r.cap > 0 ? r.cap : (resp.ammo || 0));
            Engine.setAmmo(char, r.weaponType, ammo);
            var addr = Engine.addressOfType(Engine.pedPointer(char), r.weaponType);
            if (addr) Engine.setSlotTotal(addr, ammo);
            // La anim, DESPUES del give. El give pone el tipo nuevo en un slot y
            // escribe READY; la anim se escribe encima, sobre ese mismo slot.
            _animarRecarga(char, w.slot, r.weaponType, ammo);
            log("[Weapons] recarga: tipo " + r.weaponType + " con " + ammo +
                "/" + r.cap + " balas");
            return;
        }
        // El give fallo con un cargador YA GASTADO del cinturon. No se puede
        // devolver entero porque el handler del swap ya cambio el cinturon, asi
        // que se avisa fuerte y se sigue al caso de DESMONTA en vez de volver en
        // silencio: volver en silencio dejaba el arma como estaba y el cargador
        // perdido, que es lo que el jugador no puede diagnosticar.
        log("[Weapons] ERROR: se gasto el cargador " + nuevo + " del cinturon y el " +
            "motor no acepto la variante " + (r.motivo || "?") + ". El cinturon quedo " +
            "cambiado. Conviene revisarlo a mano.");
    }

    // --- caso 2: sin recambio, el montado sale ---
    if (montado && (w.ammo || 0) > 0) {
        var out = Math.min(w.ammo, Engine.clipCapacityOf(w.type));
        if (query(ITEMS_EXTRACT_MAGAZINE, {
            magId: montado, ammo: out
        })) {
            var sinMag = (entry.attachments || []).filter(function (a) { return !_esCargador(a); });
            var r2 = _aplicar(char, w.slot, entry, sinMag, "descarga");
            if (r2.ok) {
                // El cero va al TIPO NUEVO. Ponerlo en w.type, que es el que se
                // acaba de quitar del ped, deja al arma base con la municion que
                // _aplicar le acaba de dar: un AK con el tambor descargado a 0/75
                // que se dibuja lleno y conserva las 75 balas que ya no existen.
                Engine.setAmmo(char, r2.weaponType, 0);
                var addr2 = Engine.addressOfType(Engine.pedPointer(char), r2.weaponType);
                if (addr2) Engine.setSlotTotal(addr2, 0);
                // La MISMA anim que en el caso 1, y con 0 balas. Es lo que
                // pediste: sacar el cargador tambien se anima. El motor lanza el
                // anim de recarga, Reload() no tiene nada que mover porque el
                // total es 0, y el arma queda descargada cuando termina.
                _animarRecarga(char, w.slot, r2.weaponType, 0);
                showTextBox(t("MAG_OUT"));
            }
        }
        // Si no cabe: INV_FUL lo muestra Items y el arma no cambia.
        return;
    }

    // No hay tercer caso. El comentario de arriba de la seccion lo describe
    // ("el cargador ya montado se rellena") y NO EXISTE, y conviene que se note
    // porque el comentario miente.
    //
    // Se intento escribirlo y no puede ser con ITEMS_SWAP_MAGAZINE: ese handler
    // INTERCAMBIA. Saca un cargador del cinturon y devuelve al cinturon el que
    // estaba montado (events.js:145-165, con mountedMagId). Con un cargador
    // montado y otro del mismo tipo en el cinturon, el resultado es cambiar uno
    // por otro identico y no ganar una sola bala: la mouths del cargador que
    // entra es la que se capa, y la del que sale se devolvio al cinturon.
    //
    // Rellenar SIN cambiar de cargador necesita otro evento de inventario, que
    // consume ammo suelto. Y ammo suelto no existe: el mod entero no tiene balas
    // sueltas, todo esta en cargadores instanciados (ver "Lo que este sistema no
    // da" en AGREGAR_ARMAS.md). Por eso el caso 3 no es un forgot: es la misma
    // razon por la que la municion del cinturon son cargadores.
    //
    // O sea: hoy R es "cambiar el cargador" o "sacarlo". Faltaria un cuarto
    // camino para rellenar el mismo cargador con otro cargador entero, y ese si
    // se podria hacer con un evento nuevo. No esta pedido y no se invento.

    showTextBox(t("NO_MAG"));
    log("[Weapons] recarga sin resultado: tipo " + w.type + " | montado=" +
        (montado || "ninguno") + " ammo=" + (w.ammo || 0) + " | cinturon sin recambio util");
}

// La animacion de recarga, y solo la animacion.
//
// Que sea una funcion propia y no las dos escrituras en cada caso es porque los
// dos casos tienen la misma forma de llamarla y la misma razon de llamarla: el
// arma recien dada, en el slot, con un total recien escrito. Si cada uno escribiera
// m_nState a mano, un cambio en el mecanismo (o un olvido de poner el total) se
// lleva a un caso y no al otro, y eso no se ve en ningun test.
//
// Devuelve si se pudo animar. False NO es un error: es un arma sin anim de recarga
// (un spray, un lanzallamas) o un arma que ya esta recargando. En los dos casos
// el cambio de cargador ya esta hecho y es correcto.
function _animarRecarga(char, slot, weaponType, ammoEsperado) {
    var ped = Engine.pedPointer(char);
    var targets = _reloadTargets(ped, slot);
    // False NO se loguea. Un arma sin anim de recarga es una parte del catalogo,
    // no un fallo: un lanzallamas y un spray no tienen anim y no van a tenerla, y
    // una linea por cada R sobre uno de ellos seria ruido que esconde el resto.
    if (!targets) return false;
    return _startReloadAnim(targets, char, ammoEsperado);
}

// Si un accesorio es un cargador. Lo demas (un silenciador) sobrevive al cambio de
// cargador.
function _esCargador(attachmentId) {
    var a = getAttachmentById(attachmentId);
    return !!(a && a.type === "magazine");
}

// ============================================================================
// API DE LECTURA
// ============================================================================

// La municion VIVA del arma de ese slot, leida del ped. El registro no la
// guarda: lo que esta en la mano vive en la memoria del juego.
//
//   0    el arma no tiene cargador montado. No es un "no se": la lista de
//        accesorios responde la pregunta exacta.
//   null  no se pudo leer. La pagina lo dibuja como guion, y es la respuesta
//        honesta: un 0 seria mentira, diria que el cargador esta vacio cuando en
//        realidad no lo sabemos.
export function getEquippedAmmo(slot) {
    var entry = getEntry(slot);
    if (!entry) return null;
    if (!hasMagazine(entry)) return 0;
    var char = Engine.playerChar();
    if (!char) return null;
    var tipo = resolveWeaponType(entry.family, entry.attachments);
    if (tipo === null) return null;
    return Engine.getAmmo(char, tipo);
}

// El weaponType que el registro dice que deberia ejecutar. Para diagnostico y para
// la UI; la verdad la tiene el ped, y la compara reconcile.
export function expectedTypeOf(slot) {
    var entry = getEntry(slot);
    if (!entry) return null;
    return resolveWeaponType(entry.family, entry.attachments);
}
