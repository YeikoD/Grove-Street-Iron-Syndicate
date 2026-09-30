// GSIS - Weapons: events
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Los nombres de los eventos de armas y los helpers para emitirlos. Es la
// superficie que el resto del mod usa para hablar con las armas SIN importarlas.
//
// ============================================================================
// POR QUE EXISTE, Y POR QUE TODAVIA NADIE ESCUCHA
// ============================================================================
// La regla de la casa es que los modulos no se importan entre si: se comunican
// por el EventBus. Y el modulo de armas hoy tiene dos importadores directos, que
// son los dos que la fase anterior dejo:
//
//   gsis_WebInterface.js         equipWeapon, unequipWeapon
//   gsis_InventorySerialization.js  getEquipped, getEquippedAmmo
//
// Los dos son UI, y la UI se migra en su fase. Cuando lo haga, estos dos
// importadores pasan a ser `emit("weapon:equip", ...)` y este archivo pasa a ser
// el punto de entrada de verdad.
//
// Es una estructura preparada con el consumidor pendiente, y se dice en voz alta
// porque un archivo con un solo emisor y ningun suscriptor parece un error y en
// realidad es una mudanza a medio hacer. Si la fase siguiente no conecta el
// EventBus, esto es lo que hay que borrar.
//
// ============================================================================
// LOS NOMBRES
// ============================================================================
//   weapon:changed    el registro cambio. Lo emite CADA mutacion del registro,
//                     que es el punto donde "el save se desincronizo de la
//                     memoria cacheada de alguien" se vuelve posible. Un modulo
//                     que cachea el inventario tiene que soltar su cache con
//                     este evento, y sin el se entera por el camino largo: el
//                     proximo frame en que algo se ve mal.
//
//   weapon:variant    el weaponType que ejecuta un arma cambio. Lleva la familia,
//                     la lista de accesorios y el tipo. Distinto de
//                     `weapon:changed` porque el registro puede no cambiar: una
//                     normalizacion del reconciliador cambia el tipo del ped y el
//                     registro sigue igual.
//
// Que haya dos y no uno es por eso: uno dice "el estado guardado cambio" y el
// otro "lo que el motor esta ejecutando cambio". Son cosas distintas y una UI
// que dibuja filas necesita las dos.
// ============================================================================

import { emit } from "../../core/gsis_EventBus.js";

export var WEAPON_CHANGED = "weapon:changed";
export var WEAPON_VARIANT = "weapon:variant";

// El registro cambio. `motivo` dice por que, y sirve mas que el payload: un
// "equipar" y una "recarga" producen el mismo estado observable y son cosas
// distintas para quien este mirando.
export function weaponChanged(motivo, slot) {
    emit(WEAPON_CHANGED, { motivo: motivo, slot: slot === undefined ? null : slot });
}

// El weaponType del ped cambio. Lo emite reconcile cuando normaliza un slot, y
// logic cuando el jugador monta o saca un accesorio.
export function weaponVariant(que, family, attachments, weaponType, slot) {
    emit(WEAPON_VARIANT, {
        que: que,
        family: family,
        attachments: (attachments || []).slice(),
        weaponType: weaponType,
        slot: slot === undefined ? null : slot
    });
}
