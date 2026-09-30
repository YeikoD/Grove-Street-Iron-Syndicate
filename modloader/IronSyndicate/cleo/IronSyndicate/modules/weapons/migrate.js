// GSIS - Weapons: migrate
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Traducir el registro de armas de la forma vieja a la de hoy. Es el UNICO lugar
// del mod que sabe como era un `equipped[slot]` antes de las fases 1-3, y por
// eso esta aca y no en core/gsis_SaveMigration.js: ese archivo sabe renombrar
// itemIds, y no tiene que saber que es una familia.
//
// ANTES (version de save 1)        AHORA (version de save 2)
//   {                              {
//     id,                            id,
//     hasMag,          ->        family,        NUEVO
//     salud,                        attachments,
//     magId,           ->        salud
//     attachments,      ->        weaponType: NO SE GUARDA
//     variantWeaponType  ->        magId:        NO SE GUARDA
//   }                              hasMag:       NO SE GUARDA
//                                  }
// ============================================================================
// LA REGLA UNICA, Y POR QUE DICHO ASI
// ============================================================================
// NO se inventa ningun accesorio. Un accesorio entra al registro solo si el save
// lo respalda de una de estas dos formas:
//
//   1. `attachments` es un ARRAY. Esta escrito, y lo escrito se respeta. Inclusion
//     .array vacio significa "sin accesorios" y es una respuesta, no una falta.
//
//   2. `attachments` no esta (null / undefined / ausente) y hay
//      `variantWeaponType` o `weaponType`. El numero guardado es la evidencia, y
//      la tabla de variantes sabe que accessor lleva ese numero. Esto NO es
//      inventar: es la lectura que hacia el propio codigo viejo (resolveAttachmentsOf
//      en el Ballistic anterior), y ahora es la unica que queda.
//
// Lo que NO se hace, y es la parte que hay que cuidar:
//
//   * No se reconstruye la lista a partir de `magId`. Ver "POR QUE magId NO
//     REARMA EL CARGADOR".
//   * No se mira que accessor tiene la familia en el catalogo para "completar" la
//     configuracion. Eso daria silenciadores y cargadores que el jugador nunca
//     tuvo.
//   * No se infiere nada del slot, del indice ni de la posicion.
//
// ============================================================================
// POR QUE magId NO REARMA EL CARGADOR
// ============================================================================
// `magId` estaba en el save y podria usarse, asi que la exclusion es deliberada y
// vale la pena explicar.
//
// magId era el cargador QUE SE MONTO, y la tabla de cargadores cambio de
// capacidades con el .asi: el cargador de 30 paso a ser la variante base de 8, y
// aparecieron el de 15 y el tambor de 75. Un `magId` guardado puede apuntar a un
// cargador que ya no existe, y si se usara para armar la lista, `resolveWeaponType`
// no encontraria fila y habria que degradar a la base: es decir, el propio magId
// seria la causa de perder la configuracion.
//
// Peor: `magId` y `attachments` se podian contradecir, y cuando se contradician
// la version viejaganaba el weaponType (que es lo que el motor estaba ejecutando)
// y el magId se ignoraba. Reconstruir desde magId seria cambiar la respuesta
// del codigo viejo.
//
// Asi que magId se DILATA. Es la segunda copia de la capacidad, la que producia el
// bug del tambor de 75 recortado a 30, y la que este formato deja de guardar. Se
// avisa en el log cuando hay magId y cuando NO coincide con el cargador que la
// variante dice, porque esa discrepancia es informacion real sobre la partida.
//
// ============================================================================
// QUE PASA SI NO SE PUEDE RESOLVER
// ============================================================================
// Se degrada a la BASE de forma explicita: `attachments: []`, que es la variante
// base de la familia, y un log por slot que dice que habia, que se dejo y por que.
//
// Y NO se borra la entrada del slot. Degradar a la base deja el arma equipada y
// reconocible; borrar la entrada la saca del registro, y entonces el reconciliador
// la adoptaria al inventario como si fuera un arma desconocida. Perder la
// configuracion de un arma es malo. Perder el arma del registro es peor.
//
// La unica entrada que se borra es la que no se puede NI DEGRADAR: la que tiene un
// `id` que no es de ninguna familia. Ahi no hay base a la que ir, y el
// reconciliador la adoptara al inventario, que es lo que ya hacia antes de esta
// migracion.
// ============================================================================

// `log` es global de CLEO y no se importa: lo usan asi reconcile.js, state.js y
// todos los demas. Importarlo de L10n daria undefined.
import { registerSaveMigrator, renameItemId } from "../../core/gsis_SaveMigration.js";
import {
    getFamilyByItemId, getVariantByWeaponType, resolveWeaponType,
    canonicalAttachmentId
} from "../../data/gsis_weapons.js";
import { clampSalud } from "../../data/gsis_item_data.js";

// La clave del registro. Es la MISMA que en state.js y por la misma razon: rename de
// save es otra fase, y renombrarla haria que todos los saves empezaran con el
// inventario de armas vacio. Si algun dia se renombra, el rename va con su entrada
// de migracion.
var SAVE_KEY = "Ballistic";

// Los 4 campos del formato nuevo, y solo estos.
//
// El objeto se arma con un literal de cuatro claves, no se muta el viejo. Es la
// diferencia entre "migrar un registro" y "dejar de migrar un registro a medias":
// mutar y borrar tres campos funciona HOY y al proximo refactor, que agrega un
// campo mas, vuelve a dejar un campo viejo persistido sin que nadie se entere.
function _entradaV2(id, family, attachments, salud) {
    return { id: id, family: family, attachments: attachments, salud: salud };
}

// El nombre canonico de un accesorio guardado.
//
// Son dos tablas y en ese orden, y el orden no es decorativo:
//
//   renameItemId()          el save viejo puede traer un itemId de la epoca
//                           `9mm` ("mag_9mm_extended") dentro de la lista.
//   canonicalAttachmentId() el save viejo puede traer el nombre DE INVENTARIO
//                           ("mag_colt45_extended"), y en `attachments` el
//                           nombre bueno es el canonico ("mag_colt45_15").
//
// Al reves, con el mismo resultado, el destino de un rename de itemId seria un
// id que no existe en ITEMS y el cargador desapareceria del inventario. Ver
// "LOS DOS NAMESPACES DE LOS ACCESORIOS" en core/gsis_SaveMigration.js.
function _canonico(acc) {
    if (typeof acc !== "string" || !acc) return null;
    return canonicalAttachmentId(renameItemId(acc));
}

// La lista de accesorios de una entrada vieja, respaldada por el save.
//
// Devuelve { attachments, origen, perdidos }. `origen` dice DE DONDE salio la
// lista, y va al log: es la diferencia entre "el save decia silenciador" y "no
// decia nada y no se invento".
function _attachmentsDesdeSave(e, family) {
    var accs = e.attachments;
    var perdidos = [];

    // 1. La lista esta escrita. Se respeta, incluso vacia.
    if (Array.isArray(accs)) {
        var out = [];
        for (var i = 0; i < accs.length; i++) {
            var c = _canonico(accs[i]);
            if (c === null) { perdidos.push(String(accs[i])); continue; }
            if (out.indexOf(c) < 0) out.push(c);
        }
        return { attachments: out, origen: "attachments", perdidos: perdidos };
    }

    // 2. No hay lista. El weaponType guardado es la evidencia.
    //
    // `variantWeaponType` primero porque era el campo que escribia el codigo de
    // equipar; `weaponType` despues porque hay saves mas viejos que usaban ese
    // nombre. Si estan los dos y NO coinciden, gana variantWeaponType: era el
    // que estaba sincronizado con el ultimo `setModuleData`.
    var tipo = e.variantWeaponType;
    if (tipo === null || tipo === undefined) tipo = e.weaponType;
    if (typeof tipo !== "number" || !isFinite(tipo)) return null;

    var v = getVariantByWeaponType(tipo);
    // La familia tiene que COINCIDIR. Sin esta comprobacion, una entrada con una
    // colt45 y un tipo de otra familia (un save con los numeros corridos) traeria
    // los accesorios ajenos y montaria, por ejemplo, un cargador de AK en una
    // pistola. Es la comprobacion que hacia el codigo viejo.
    if (!v || v.family !== family) return null;

    var out2 = [];
    for (var j = 0; j < (v.attachments || []).length; j++) out2.push(v.attachments[j]);
    return { attachments: out2, origen: "weaponType " + tipo, perdidos: perdidos };
}

// Traduce UNA entrada vieja. Devuelve la entrada nueva, o null si no hay base a la
// que degradar (id que no es de ninguna familia), en cuyo caso el slot se borra.
function _migrarEntrada(e, slot, st) {
    if (!e || typeof e !== "object") { st.descartadas++; return null; }

    var id = e.id;
    if (typeof id !== "string" || !id) { st.descartadas++; return null; }

    var fam = getFamilyByItemId(id);
    if (!fam) {
        // Sin familia no hay variante base, y una variante base es lo unico a lo
        // que se puede degradar. No se adivina la familia del id.
        st.sinFamilia++;
        log("[Weapons] save v1->v2: el slot " + slot + " tiene el item \"" + id +
            "\", que no es de ninguna familia. Se quita la entrada del registro; " +
            "el arma queda en el ped y el reconciliador la adopta al inventario.");
        return null;
    }
    var family = fam.family;

    // --- los accesorios, y de donde salieron ---
    var r = _attachmentsDesdeSave(e, family);
    var attachments = [];
    var origen = "sin evidencia";
    if (r) {
        attachments = r.attachments;
        origen = r.origen;
    } else if (e.attachments !== null && e.attachments !== undefined) {
        // Hay algo en `attachments` pero no es un array, o hay un weaponType que no
        // resuelve. No se inventa: base.
        st.sinResolucion++;
    } else {
        st.sinResolucion++;
    }

    // --- magId: se dilata, y se avisa si contradecía a la variante ---
    //
    // Se compara el magId guardado contra el cargador que dice la lista de
    // accesorios, y se cuenta la discrepancia. No se USA para armar la lista: ver
    // "POR QUE magId NO REARMA EL CARGADOR".
    if (e.magId) {
        st.magIdDilatados++;
        var esperado = _cargadorDe(attachments);
        if (esperado && _canonico(e.magId) !== esperado) st.magIdDistintos++;
    }

    // --- la validacion que manda: que la configuracion exista de verdad ---
    //
    // No se guarda una configuracion que `resolveWeaponType` no resuelve. Sin
    // esto el registro puede quedar con una lista que el resto del modulo no sabe
    // convertir en un weaponType, y el sintoma es un arma que no se puede equipar.
    // Con esto, o resuelve, o degrada a la base con el log de abajo.
    var resuelto = resolveWeaponType(family, attachments);
    if (resuelto === null) {
        st.degradados++;
        log("[Weapons] save v1->v2: el slot " + slot + " (" + family +
            (attachments.length ? " + " + attachments.join(", ") : " (sin accesorios)") +
            ") no resuelve a ninguna variante. Se degrada a la variante base" +
            (attachments.length ? " y se pierden: " + attachments.join(", ") + "." : ".") +
            " El save traia " + (r ? "attachments" : "ningun dato de accesorios") +
            (e.variantWeaponType || e.weaponType ? " y weaponType " +
                (e.variantWeaponType || e.weaponType) : "") + ".");
        attachments = [];
        resuelto = resolveWeaponType(family, attachments);
        if (resuelto === null) {
            // La base de una familia que esta en el catalogo SIEMPRE resuelve. Si
            // no, el catalogo esta roto y avisarlo aca es la unica vez que se ve.
            st.baseRota++;
            log("[Weapons] ERROR: la variante base de " + family +
                " no resuelve. Revisar WEAPON_VARIANTS y gsis_weapons.dat.");
            return null;
        }
    }

    // --- la salud, que se preserva ---
    // clampSalud la acota a 0..100 y aplica SALUD_MAX cuando no hay valor, que es
    // lo que hacia el default del inventario. Un save sin `salud` no se pierde: se
    // deja en 100, que es el estado de un arma sin dano.
    var salud = clampSalud(e.salud);

    st.migrados++;
    st.tipos[resuelto] = (st.tipos[resuelto] || 0) + 1;
    return _entradaV2(id, family, attachments, salud);
}

// El cargador montado de una lista canonica, o null. No usa mountedMagazineOf de
// weapons.js a proposito: esa es la version de runtime y aqui lo unico que hace
// falta es comparar contra el magId guardado, y una copia de dos lineas no
// importa mas que una dependencia cruzada.
function _cargadorDe(attachments) {
    var out = null;
    for (var i = 0; i < (attachments || []).length; i++) {
        var a = attachments[i];
        if (typeof a === "string" && a.indexOf("mag_") === 0) out = a;
    }
    return out;
}

// ---------------------------------------------------------------------------
// EL MIGRADOR
// ---------------------------------------------------------------------------
// Un save viejo (version 1) con un registro de armas de 7 campos por slot.
export function migrateWeaponsToV2(save) {
    var st = {
       slots: 0, migrados: 0, degradados: 0, descartadas: 0, sinFamilia: 0,
        sinResolucion: 0, magIdDilatados: 0, magIdDistintos: 0, baseRota: 0,
        tipos: {}
    };

    var b = save ? save[SAVE_KEY] : null;
    if (!b || typeof b !== "object" || !b.equipped || typeof b.equipped !== "object") {
        return st;   // un save sin armas: nada que hacer, y no es un error
    }

    for (var slot in b.equipped) {
        if (!Object.prototype.hasOwnProperty.call(b.equipped, slot)) continue;
        st.slots++;
        var nuevo = _migrarEntrada(b.equipped[slot], slot, st);
        if (nuevo === null) delete b.equipped[slot];
        else b.equipped[slot] = nuevo;
    }

    // Un solo resumen. Los `_migrarEntrada` ya avisaron de los casos raros uno por
    // uno; esto es la cuenta de que paso con la partida entera, que es lo que se
    // lee cuando algo va mal y hay que saber si fue UN slot o todos.
    if (st.slots) {
        log("[Weapons] save v1->v2: " + st.slots + " slot(s) | migrados " + st.migrados +
            " | degradados a la base " + st.degradados +
            " | sin familia (entrada quitada) " + st.sinFamilia +
            " | magId dilatados " + st.magIdDilatados +
            (st.magIdDistintos ? " (discrepantes con la variante: " + st.magIdDistintos + ")" : "") + ".");
    }
    return st;
}

// El registro se registra al IMPORTAR este archivo, no en el init() del modulo.
// Razon en core/gsis_SaveMigration.js, seccion "MIGRADORES DE MODULOS": los
// imports del entry se evaluan antes de initSaveManager(), que es quien corre
// loadGame. En init() este registro llegaria tarde y la primera carga de un save
// viejo se haria sin migrar.
registerSaveMigrator(1, "weapons-v2", migrateWeaponsToV2);
