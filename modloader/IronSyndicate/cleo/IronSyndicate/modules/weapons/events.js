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
// QUE RESPONDE ESTE ARCHIVO
// ============================================================================
// Los nombres de los eventos de armas, los helpers para emitirlos, y LA
// PREGUNTA que el modulo de inventario le hace: la capacidad de un item.
//
// Esa pregunta es la que cierra el ultimo import directo que quedaba entre los
// dos modulos. Antes inventory/state.js importaba getClipSizeByItemId de
// data/gsis_weapon_data.js, y eso era el modulo de inventario leyendo la tabla
// de armas por la puerta de atrás: dos caminos a la misma verdad, y cambiar la
// tabla podia cambiar un cargador y no el otro.
//
// Ahora inventory PREGUNTA y weapons RESPONDE, y ninguno importa al otro.
//
// ============================================================================
// POR QUE EXISTE, Y QUE CONSUMIDOR LE FALTA
// ============================================================================
// La regla de la casa es que los modulos no se importan entre si: se comunican
// por el EventBus.
//
// weapon:changed y weapon:variant se EMITEN y todavia no los escucha nadie: la UI
// los recibira cuando la pagina dibuje el arma equipada, y ese consumidor es la
// parte que todavia no esta. weapons:capacityOfItem, en cambio, YA tiene
// consumidor: inventory/state.js.
//
// Un archivo con un emisor y ningun suscriptor parece un error y a veces es una
// mudanza a medio hacer. Por eso el nombre del consumidor esta escrito aca, al
// lado del evento, y no solo en el archivo del otro modulo: para que el que lea
    // este sepa si lo que falta es algo o si se esta escapando.
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

import { emit, on } from "../../core/gsis_EventBus.js";
import { WEAPONS_CAPACITY } from "../../core/gsis_EventNames.js";
import { getClipSizeByItemId } from "../../data/gsis_weapons.js";

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

// ---------------------------------------------------------------------------
// LA PREGUNTA QUE RESPONDE ESTE MODULO
// ---------------------------------------------------------------------------
// query("weapons:capacityOfItem", { itemId }) -> la capacidad DECLARADA de ese
// item, o 0 si no es un item con capacidad.
//
// Que sea la DECLARADA y no la de runtime tiene una razon: el modulo de inventario
// fabrica filas, y una fila nueva nace con la capacidad que el catalogo dice. La
// de runtime la lee Engine.clipCapacityOf(weaponType) desde weapons/logic.js, que
// es donde ya se sabe que weaponType hay.
//
// Y por que vive en events.js y no en un "catalog.js": es UNA pregunta de este
// modulo al bus, y events.js es la superficie de este modulo hacia afuera. Un
// archivo nuevo con una sola funcion seria estructura para lucirse.
//
// OJO con lo que se responde: la capacidad de un CARGADOR, que es la de su
// variante, y la de un ARMA pelada, que es la de su variante base. No se
// responde por weaponType: el weaponType es la representacion y este modulo
// no lo expone por el bus. Quien lo necesite lo deriva antes con
// resolveWeaponType().
on(WEAPONS_CAPACITY, function (e) {
    var id = e.data && e.data.itemId;
    e.respond(id ? (getClipSizeByItemId(id) || 0) : 0);
});
