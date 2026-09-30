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
import { t } from "../../core/gsis_L10n.js";
import * as Engine from "../../core/gsis_Engine.js";
import {
    resolveWeaponType, isAttachmentCompatible, getAttachmentById,
    canonicalAttachmentId, inventoryAttachmentId, magazineIdsFor, getFamilyById,
    mountedMagazineOf
} from "../../data/gsis_weapons.js";
import { clampSalud } from "../../data/gsis_item_data.js";
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
export function equipWeapon(itemId) {
    var family = familyOfItem(itemId);
    if (!family) return false;                       // chaleco, material, etc
    var char = Engine.playerChar();
    if (!char) return false;
    var fam = getFamilyById(family);
    var slot = fam.slot;
    if (getEntry(slot) && !unequipWeapon(slot)) return false;

    var taken = query("items:takeWeapon", { id: itemId });
    if (!taken) return false;

    // La configuracion con la que vuelve. Un arma que se desequipo con un
    // silenciador tiene que volver con el: el inventario guarda la lista, y
    // perderla deja al arma pelada con un cargador de 15 en la mano, que es un
    // estado que el inventario no puede describir.
    var attachments = (taken.attachments || []).map(canonicalAttachmentId);
    var salud = clampSalud(taken.salud);
    var ammo = Math.max(0, taken.ammo || 0);

    var r = _giveInternal(char, family, attachments, ammo, "equipar");
    if (!r.ok) {
        // El motor no lo acepto: la instancia vuelve al inventario, no se pierde.
        // `hasMag` va derivado de la lista, y es el vocabulario del INVENTARIO
        // (su default es true), no un segundo lugar donde vive la capacidad.
        query("items:storeWeapon", {
            id: itemId, salud: salud, ammo: taken.ammo || 0,
            hasMag: mountedMagazineOf(family, attachments) !== null,
            attachments: taken.attachments || null, force: true
        });
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

    // El arma vuelve CON su cargador montado, porque el cargador va en la lista.
    //
    // `hasMag` va derivado, y es el vocabulario del INVENTARIO, no del registro:
    // el modulo de inventario tiene su propia idea de "esta fila tiene cargador"
    // y su default es true, asi que omitirlo haria que un arma descargada
    // volviera con cargador montado. No es una segunda fuente de la capacidad:
    // sale de la misma lista de accesorios, y los dos leen de ahi.
    if (!query("items:storeWeapon", {
        id: entry.id, ammo: ammo, salud: entry.salud,
        hasMag: hasMagazine(entry),
        attachments: (entry.attachments || []).map(inventoryAttachmentId)
    })) {
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
// Estas dos funciones no tienen ningun llamador todavia. Lo tenian antes (las
// exportaba gsis_Ballistic.js) y tampoco lo tenian: la UI no tiene comando para
// montar un accesorio, y sin eso los tipos 60, 61, 62, 64, 65 y 66 no se pueden
// alcanzar desde el juego. El comando de la UI es de la fase siguiente; estas
// funciones quedan listas y son la unica forma de que la variante se cambie.
export function attachAccessory(charId, slot, attachmentId) {
    var entry = getEntry(slot);
    if (!entry) return { ok: false, motivo: "no hay arma equipada en el slot " + slot };
    var char = charId || Engine.playerChar();
    if (!char) return { ok: false, motivo: "no hay ped" };

    // El id puede venir del inventario (el nombre viejo) o de la tabla (el
    // canonico). Se resuelve a UNO solo antes de tocar nada.
    var canonico = canonicalAttachmentId(attachmentId);
    var att = getAttachmentById(canonico);
    if (!att) return { ok: false, motivo: "el accesorio " + attachmentId + " no existe" };
    if (!isAttachmentCompatible(canonico, entry.family)) {
        return { ok: false, motivo: att.name + " no va en " + entry.family };
    }
    var actual = (entry.attachments || []).slice();
    if (actual.indexOf(canonico) !== -1) return { ok: false, motivo: "ya esta montado" };

    return _aplicar(char, slot, entry, actual.concat([canonico]), "montar " + att.name);
}

export function detachAccessory(charId, slot, attachmentId) {
    var entry = getEntry(slot);
    if (!entry) return { ok: false, motivo: "no hay arma equipada en el slot " + slot };
    var char = charId || Engine.playerChar();
    if (!char) return { ok: false, motivo: "no hay ped" };

    var canonico = canonicalAttachmentId(attachmentId);
    var actual = (entry.attachments || []).slice();
    if (actual.indexOf(canonico) === -1) {
        return { ok: false, motivo: "no tiene " + canonico + " montado" };
    }
    var quedan = actual.filter(function (a) { return a !== canonico; });
    return _aplicar(char, slot, entry, quedan, "sacar " + canonico);
}

// El cuerpo comun de montar y sacar.
//
// Lo delicado es la MUNICION, y sale del mismo camino de siempre: cambiar de
// weaponType es un REMOVE + GIVE, y el GIVE arranca con el arma vacia. Asi que la
// municion se lee ANTES de cambiar y se escribe despues. Y el registro se escribe
// DESPUES de que el motor confirmo: al reves, un fallo dejaria el save diciendo
// que el silenciador esta montado y el arma sin silenciador.
function _aplicar(char, slot, entry, attachments, que) {
    var tipoViejo = resolveWeaponType(entry.family, entry.attachments);
    var ammo = tipoViejo === null ? 0 : Engine.getAmmo(char, tipoViejo);
    var r = _giveInternal(char, entry.family, attachments, ammo, que);
    if (!r.ok) return { ok: false, motivo: r.motivo };

    setEntry(slot, {
        id: entry.id, family: entry.family, attachments: r.attachments, salud: entry.salud
    }, que);
    weaponVariant(que, entry.family, r.attachments, r.weaponType, slot);
    return { ok: true, weaponType: r.weaponType, attachments: r.attachments, ammo: r.ammo };
}

// ============================================================================
// RECARGA
// ============================================================================
// La tecla R. Y el nombre "recarga" es lo unico que se le mantiene, porque las
// tres cosas que hace ya no tienen nada que ver entre si:
//
//   1. hay un cargador en el cinturon que le sirve a esta familia
//      -> se MONTA. Es un accesorio, asi que cambia de variante, y eso es dar el
//         arma de nuevo. Y despues setAmmo con las balas que tenia.
//
//   2. no hay recambio y hay cargador montado
//      -> se DESMONTA: vuelve a la variante base y el arma queda descargada.
//
//   3. el cargador ya montado se rellena
//      -> setAmmo y nada mas. NO cambia el tipo y NO toca la CWeaponInfo.
//
// El caso 3 es el que antes no existia y es el que mas se nota. Recargar el
// cargador que ya tenes montado no cambia el arma de tipo, asi que no hay nada
// que cambiar: antes pasaba por `_startReloadAnim`, que escribia m_nState = 2 y
// confiaba en que el motor cerrara la recarga despues, con un watchdog de un
// segundo para el caso de que no lo hiciera.
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
    var resp = query("items:swapMagazine", {
        magIds: magIds,
        ammo: w.ammo || 0,
        mounted: montado !== null,
        mountedMagId: montado ? inventoryAttachmentId(montado) : null
    });
    if (resp) {
        var nuevo = canonicalAttachmentId(resp.magId);
        // El cargador viejo sale de la lista y entra el nuevo. Con dos cargadores
        // en la lista la clave de la variante seria distinta y el resolver no
        // encontraria fila. Los OTROS accesorios (un silenciador) sobreviven:
        // montar el tambor del AK no le quita el silenciador.
        var lista = (entry.attachments || []).filter(function (a) { return !_esCargador(a); });
        lista.push(nuevo);
        var r = _aplicar(char, w.slot, entry, lista, "recarga: monta " + nuevo);
        if (r.ok) {
            // Las balas las trae el cargador del cinturon, recortadas a la
            // capacidad del tipo NUEVO. Con un tambor son 75 y no 30: usar la
            // capacidad anterior recortaria el cargador nuevo al cargador viejo.
            var ammo = Math.min(resp.ammo || 0, r.cap > 0 ? r.cap : (resp.ammo || 0));
            Engine.setAmmo(char, r.weaponType, ammo);
            var addr = Engine.addressOfType(Engine.pedPointer(char), r.weaponType);
            if (addr) Engine.setSlotTotal(addr, ammo);
            log("[Weapons] recarga: tipo " + r.weaponType + " con " + ammo +
                "/" + r.cap + " balas");
        }
        return;
    }

    // --- caso 2: sin recambio, el montado sale ---
    if (montado && (w.ammo || 0) > 0) {
        var out = Math.min(w.ammo, Engine.clipCapacityOf(w.type));
        if (query("items:extractMagazine", {
            magId: inventoryAttachmentId(montado), ammo: out
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
                showTextBox(t("MAG_OUT"));
            }
        }
        // Si no cabe: INV_FUL lo muestra Items y el arma no cambia.
        return;
    }

    showTextBox(t("NO_MAG"));
    log("[Weapons] recarga sin resultado: tipo " + w.type + " | montado=" +
        (montado || "ninguno") + " ammo=" + (w.ammo || 0) + " | cinturon sin recambio util");
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
