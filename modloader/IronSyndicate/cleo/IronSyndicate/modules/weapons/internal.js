// GSIS - Weapons: internal
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El unico camino por el que un arma llega al ped, y la conmutacion de como se
// reemplaza. Esta aparte por una razon concreta: lo usan los dos que operan
// armas (logic, que el jugador manda, y reconcile, que el motor manda) y si
// estuviera en logic.js uno de los dos tendria que importar al otro.
//
// Que se llame internal no quiere decir privado: es privado de modulo, o sea que
// nadie fuera de modules/weapons/ lo deberia importar. Se exporta porque los tres
// archivos de adentro lo necesitan.
//
// ============================================================================
// family + attachments -> weaponType -> giveWeapon
// ============================================================================
// Aca esta la regla entera del sistema de armas, y son cuatro lineas:
//
//   1. resolveWeaponType dice que weaponType ejecuta esa configuracion
//   2. Engine.clipCapacityOf dice cuantas balas entran en ese weaponType
//   3. Engine.giveWeapon lo da
//   4. el registro se escribe AFUERA, despues de que el motor acepto
//
// El paso 2 es una LECTURA. El mod no escribe m_nAmmoClip en ningun momento: la
// capacidad de un tipo la escribio el .asi al registrarlo en gsis_weapons.dat, y
// lo unico que este codigo hace es no pasarle al motor mas balas de las que
// entran. Antes habia dos fuentes de capacidad (el catalogo y el motor) y el
// reconciliador recortaba un tambor de 75 a 30 en el frame siguiente; ahora hay
// una y es la del motor.
// ============================================================================

import * as Engine from "../../core/gsis_Engine.js";
import { resolveWeaponType, getFamilyItemId } from "../../data/gsis_weapons.js";
import { ensureModelForType } from "./models.js";

// ============================================================================
// LA CONMUTACION DEL REEMPLAZO EN EL SLOT
// ============================================================================
// Cuando el weaponType de un arma cambia, hay que REMOVE del tipo viejo y GIVE del
// nuevo. No es una decision de este codigo: el motor tiene un CWeapon por slot
// (CPed::m_aWeapons[13]) y su tipo es parte de la identidad de esa entrada. No hay
// "cambiar el tipo" en GTA.
//
// Lo que NO esta verificado es si el GIVE alcanza solo o si el motor ACUMULA y
// deja dos armas en el mismo slot.
//
//   true   REMOVE y despues GIVE. Es lo que hacia el codigo anterior y lo unico
//          verificado en log.
//   false  solo GIVE. Es menos trabajo y es lo que corresponde si el motor
//          reemplaza, pero si en realidad acumula quedan dos armas en el mismo
//          slot y el reconciliador las ve las dos en el mismo frame.
//
// COMO PROBAR EL false
//   1. Equipar la Colt pelada (63), con 8 balas.
//   2. Montar el cargador de 15: tiene que salir el 62.
//   3. Mirar el slot 2 del ped: un arma o dos.
//        un arma   -> poner false, sacar el REMOVE de este archivo, y anotar
//                     aca que el motor reemplaza solo.
//        dos armas -> dejar true, y anotar aca que el motor acumula y que por
//                     eso el REMOVE no es opcional.
//
//   El paso 3 se lee del log: este codigo avisa el tipo que da y el que hay en la
//   mano. Si no coinciden, nunca se avisa el segundo, y eso es exactamente lo
//   que hay que mirar.
// ============================================================================
export var REMOVE_ANTES_DE_GIVE = true;

// El weaponType que el ped tiene en la mano ahora, o null si no tiene ninguno.
// Se usa para el REMOVE del tipo viejo. No es el de la familia: es el de la
// configuracion anterior, y confundirlos es lo que dejaba armas en los dos
// sitios.
export function tipoEnPies() {
    var w = Engine.readCurrentWeapon();
    if (!w || !w.type) return null;
    return w.type;
}

// Dar al ped la configuracion que forman la familia y los accesorios.
//
// Devuelve { ok, weaponType, attachments, ammo, cap } o { ok: false, motivo }.
//
// `que` es una etiqueta para el log, no un comportamiento: "equipar", "montar el
// silenciador", "normalizar el slot 2". El log es la unica forma de saber que paso
// cuando algo se normaliza solo, y un reconciliador que normaliza en silencio
// es indistinguible de uno que no hace nada.
export function _giveInternal(char, family, attachments, ammo, que) {
    // La lista se ORDENA aqui, una sola vez, y todo lo de abajo usa esta.
    //
    // Es el punto de paso de todas las armas del mod, y por eso la canonizacion
    // va aca y no en cada llamador: la identidad de una configuracion es un
    // CONJUNTO de accesorios, y si la lista depende del orden en que el jugador
    // los monto, el mismo arma se guarda de dos formas distintas. resolveWeaponType
    // ordena igual al comparar (por eso el resolver no se rompe), pero lo que se
    // PERSISTE tiene que salir de aca ya ordenado.
    var lista = (attachments || []).slice();
    lista.sort();

    // SIEMPRE se resuelve. No hay caida a la variante base: un accesorio mal
    // declarado tiene que ser un fallo visible, no un arma que cambia de tipo sin
    // que nadie se entere.
    var tipo = resolveWeaponType(family, lista);
    if (tipo === null) {
        log("[Weapons] WARN: " + que + ": no existe la configuracion " + family +
            " + [" + lista.join(", ") + "]. No se da ninguna arma.");
        return { ok: false, motivo: "la configuracion " + family + " + [" +
            lista.join(", ") + "] no esta declarada" };
    }

    // La capacidad la DICE el motor. Se lee y no se escribe.
    var cap = Engine.clipCapacityOf(tipo);
    var total = Math.max(0, ammo | 0);
    if (cap > 0 && total > cap) total = cap;

    // El modelo antes del give: el doc de 01B2 pide el modelo cargado o el arma
    // puede no verse en la mano del ped, y segun el doc de las opcodes crashear.
    ensureModelForType(tipo);

    var viejo = tipoEnPies();
    // El REMOVE va SIEMPRE, y no solo cuando el tipo cambia.
    //
    // MEDIDO el 30/09: cuando el tipo es el MISMO, `GIVE_WEAPON_TO_CHAR` NO
    // reemplaza, SUMA. Con un arma de 15 balas y un GIVE de 15, el total pasaba a
    // 30. No se perdia nada porque el codigo de abajo reescribia el total, pero
    // mientras tanto el arma tenia el doble de municion.
    //
    // Y no es solo un numero feo: `GIVE_WEAPON_TO_CHAR` con el mismo tipo tampoco
    // refresca el modelo ni el estado, asi que un give del mismo tipo es un give
    // a medias. Quitar y dar es lo unico que es "dar este arma con esta
    // configuracion" sin letra chica, y ya es lo que se hacia en cada cambio de
    // tipo, que es el caso comum.
    if (REMOVE_ANTES_DE_GIVE && viejo !== null) {
        Engine.removeWeapon(char, viejo);
    }
    if (!Engine.giveWeapon(char, tipo, total)) {
        return { ok: false, motivo: "el motor no acepto el tipo " + tipo };
    }
    if (!Engine.hasWeapon(char, tipo)) {
        return { ok: false, motivo: "el tipo " + tipo + " no quedo en el ped" };
    }
    Engine.setCurrentWeapon(char, tipo);

    // El clip y el estado en memoria, para que el arma pueda disparar sin que el
    // motor la recargue primero. El estado en READY importa: si el motor lo
    // deja en OUT_OF_AMMO, CWeapon::Fire hace return false y el arma no dispara
    // aunque tenga balas.
    var addr = Engine.addressOfType(Engine.pedPointer(char), tipo);
    if (addr) {
        Engine.setSlotClip(addr, Math.min(cap > 0 ? cap : total, total));
        Engine.setSlotTotal(addr, total);
        Engine.setSlotState(addr, Engine.WEAPONSTATE_READY);
    }

    log("[Weapons] " + que + ": " + getFamilyItemId(family) + " -> tipo " + tipo +
        (viejo !== null && viejo !== tipo ? " (era " + viejo + ")" : "") +
        " | " + total + "/" + cap + " balas" +
        (lista.length ? " | [" + lista.join(", ") + "]" : ""));

    return {
        ok: true,
        weaponType: tipo,
        attachments: lista,
        ammo: total,
        cap: cap
    };
}
