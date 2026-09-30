// GSIS - Weapons: state
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Donde vive la configuracion de las armas equipadas. Y nada mas: no pregunta al
// motor, no resuelve variantes, no decide nada.
//
// ============================================================================
// LA FORMA DEL REGISTRO
// ============================================================================
//   GameState.Ballistic.equipped[slotGta] = {
//       id          itemId de inventario. "colt45"
//       family      "colt45"
//       attachments []                       los ids, ordenados
//       salud       0..100
//   }
//
// CUATRO CAMPOS, Y LA LISTA ES TODO. Lo que se guarda es la CONFIGURACION, nunca
// el weaponType, y esa es la diferencia con la version anterior:
//
//   antes   { id, hasMag, salud, magId, attachments, variantWeaponType, weaponType }
//   ahora   { id, family, attachments, salud }
//
// Se fueron `weaponType`, `variantWeaponType`, `magId` y `hasMag`. Los tres
// primeros eran el numero que la tabla de variantes puede cambiar manana, y un
// save que guarde el numero queda con un arma distinta al cambiar la tabla. Y
// `magId` y `hasMag` eran la capacidad del arma escrita en un segundo lugar, que
// es la duplicacion que produjo el bug del tambor de 75 que se.recortaba a 30.
//
// QUE HAY QUE SOBRAR
// ----------------------------------------------------------------------------
// `salud` esta aca y no en items[] porque el arma equipada no esta en items[]: el
// collar solo tiene lo que esta suelto. Y por el mismo motivo NO esta `ammo`: esa
// vive en la memoria del juego, se lee del ped, y no tiene sentido copiarla.
//
// LA LLAVE DEL SAVE ES "Ballistic", NO "Weapons"
// ----------------------------------------------------------------------------
// GameState.Ballistic es la clave con la que el estado se guardo desde el
// principio. Renombrarla haria que todos los saves del mundo empezaran con el
// inventario de armas vacio, y la migracion de saves es de otra fase. Cuando se
// haga, el rename va con su entrada de migracion, aca y no en una constante
// suelta por ahi.
// ============================================================================

import { getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { getFamilyByItemId, mountedMagazineOf, isAttachmentCompatible } from "../../data/gsis_weapons.js";
import { weaponChanged } from "./events.js";

export var SAVE_KEY = "Ballistic";

// El registro, o {}. Es una COPIA (SaveManager clona en getModuleData), asi que
// hay que devolverla por valor y nunca mutarla sin llamar a setEquipped.
export function getEquipped() {
    var data = getModuleData(SAVE_KEY);
    return (data && data.equipped) ? data.equipped : {};
}

export function getEntry(slot) {
    return getEquipped()[slot] || null;
}

// Escribe el registro entero. Todo el modulo pasa por aca, y no hay otra via:
// una mutacion que no pase por esta se pierde en el frame siguiente.
export function setEquipped(equipped) {
    setModuleData(SAVE_KEY, { equipped: equipped || {} });
}

// Alta o baja de UN slot. Se lee, se toca, se escribe: tres pasos y no uno, y es
// a proposito, porque el objeto que devuelve getEquipped es una copia.
//
// Es tambien el UNICO punto del modulo donde el registro cambia, y por eso el
// evento sale de aca y no de cada llamador: un `emit` en cinco funciones es cinco
// lugares donde se puede olvidar uno.
export function setEntry(slot, entry, motivo) {
    var equipped = getEquipped();
    if (entry) equipped[slot] = entry;
    else delete equipped[slot];
    setEquipped(equipped);
    weaponChanged(motivo || (entry ? "set" : "clear"), slot);
}

export function clearSlot(slot) {
    setEntry(slot, null);
}

// ---------------------------------------------------------------------------
// LECTURAS DERIVADAS
// ---------------------------------------------------------------------------
// Ninguna guarda nada. Son preguntas que se hacen sobre la lista de accesorios,
// y por eso no pueden quedar desactualizadas: no hay estado que sincronizar.

// El cargador montado de este registro, o null. Se deduce de `attachments`, y
// antes se guardaba en `magId`. La diferencia es que `magId` era un segundo lugar
// donde vivia la capacidad, y este sale de la unica lista.
export function mountedMagazine(entry) {
    if (!entry || !entry.family) return null;
    return mountedMagazineOf(entry.family, entry.attachments);
}

// Si este registro tiene algun cargador montado. Lo que antes era `hasMag`, y lo
// que la UI lee para pintar "sin cargador". Sale de la lista.
export function hasMagazine(entry) {
    return mountedMagazine(entry) !== null;
}

// El accesorio montado que NO es cargador. Un silenciador, por ahora.
export function mountedOther(entry) {
    if (!entry || !entry.family) return [];
    var out = [];
    var accs = entry.attachments || [];
    for (var i = 0; i < accs.length; i++) {
        if (isAttachmentCompatible(accs[i], entry.family)) {
            if (mountedMagazineOf(entry.family, [accs[i]]) === null) out.push(accs[i]);
        }
    }
    return out;
}

// El registro con la forma que espera la UI.
//
// Lo unico que se agrega es `hasMag`, DERIVADO, y esta en el objeto que sale de
// aca y no en el que se guarda. La diferencia importa: la UI necesita distinguir
// un arma descargada de un arma sin cargador, y esa pregunta tiene respuesta
// exacta con la lista de accesorios; guardarla seria volver a tener dos fuentes.
export function getEquippedForUI() {
    var equipped = getEquipped();
    var out = {};
    for (var slot in equipped) {
        if (!Object.prototype.hasOwnProperty.call(equipped, slot)) continue;
        var e = equipped[slot];
        if (!e) continue;
        out[slot] = {
            id: e.id,
            family: e.family,
            attachments: (e.attachments || []).slice(),
            salud: e.salud,
            hasMag: hasMagazine(e)   // derivado, no persistido
        };
    }
    return out;
}

// La familia de un itemId, o null si no es un arma. La unica forma de pasar de
// "el jugador tiene esto" a "esto es una familia con variantes".
export function familyOfItem(itemId) {
    var fam = getFamilyByItemId(itemId);
    return fam ? fam.family : null;
}

// Una instancia nueva para un item recien comprado: la familia, sin accesorios.
// null si el item no es de ninguna familia, y null significa "arma de una sola
// representacion" en el codigo de mas abajo.
export function newInstance(itemId) {
    var family = familyOfItem(itemId);
    if (!family) return null;
    return { id: itemId, family: family, attachments: [] };
}
