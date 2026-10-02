// GSIS - Weapons: ammo
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// EL INVARIANTE DE MUNICION DE UN ARMA GSIS. Y es todo lo que hay aca:
//
//     clip  = min(clip, capacidad)     el cargador nunca excede su capacidad
//     total = clip                     no hay reserva
//
// El total del motor INCLUYE el clip, asi que la reserva es la diferencia entre
// los dos numeros y no hay ningun campo que la guarde.
//
// QUE PASA EN UN GUARD POR FRAME
// ---------------------------------------------------------------------------
// La municion la escriben cinco cosas y solo una es del mod: su give, el give de
// GTA, los pickups de municion, el save del juego y las misiones. Arreglarlo en el
// give arregla una y deja las cuatro otras abiertas. El guard no necesita saber de
// donde vino la bala, solo que hay. Y no cuesta nada cuando no hay nada que
// corregir, que es lo que pasa en el caso normal.
//
// LAS TRES SALVEDADES, y por que estan
// ---------------------------------------------------------------------------
//   RECARGANDO      el motor reparte el total en el clip durante la recarga, y hay
//                   un tramo en el que los dos numeros dicen cosas distintas a
//                   proposito. Es el unico lugar donde este guard escribiria sobre
//                   un estado a medio camino.
//   SIN CAPACIDAD   si no se pudo preguntar la capacidad del tipo, el arma no se
//                   toca. Sin capacidad no se sabe hasta donde llega el cargador.
//   SIN PED         si GET_PED_POINTER no respondio no hay estructura donde mirar.
//
// NI LOG NI ESTADO, A PROPOSITO
// ---------------------------------------------------------------------------
// Esto corre 60 veces por segundo. Un log aca necesita throttle, contador y un
// "_ya_avise" por tipo para no tapar el resto del log, y ese mecanismo seria mas
// codigo que el guard. La visibilidad la dan los otros dos lugares, que corren una
// vez: la linea de arranque del modulo y el log del give. Que el contador del HUD
// no suba es la prueba de que el invariante esta.
//
// Cuando exista el sistema de cargadores, este archivo se reemplaza entero por la
// escritura de estado del cargador: es una funcion sin estado y sin cache.
// ============================================================================

import * as Engine from "../../core/gsis_Engine.js";
import { WEAPONS } from "../../core/gsis_Config.js";

// El tipo es del plugin, o sea nuestro. La respuesta de "este slot tiene un arma
// GSIS" que el guard necesita, y no un numero suelto en el medio del recorrido.
function esTipoGsis(tipo) {
    return tipo >= WEAPONS.PLUGIN_TYPE_MIN && tipo <= WEAPONS.PLUGIN_TYPE_MAX;
}

// Aplica el invariante a todos los slots armados del ped. Devuelve cuantos
// corrigio.
//
// Recorre los slots del ped y no el arma de la mano: un arma GSIS puede estar en
// un slot que no esta seleccionado, y su reserva tambien es reserva. Empieza en
// el slot 1 porque el 0 es melee y nunca es un tipo del plugin.
export function normalizarSinReserva(char) {
    var ped = Engine.pedPointer(char);
    if (!ped) return 0;

    var corregidas = 0;
    for (var slot = 1; slot < Engine.WEAPON_SLOT_COUNT; slot++) {
        var addr = Engine.slotAddress(ped, slot);
        if (!addr) continue;

        var tipo = Engine.slotType(addr);
        if (!esTipoGsis(tipo)) continue;

        if (Engine.slotState(addr) === Engine.WEAPONSTATE_RELOADING) continue;

        var capacidad = Engine.clipCapacityOf(tipo);
        if (capacidad <= 0) continue;

        var clip = Engine.slotClip(addr);
        var clipFinal = Math.min(clip, capacidad);
        var total = Engine.slotTotal(addr);

        if (clipFinal !== clip) Engine.setSlotClip(addr, clipFinal);
        if (total !== clipFinal) Engine.setSlotTotal(addr, clipFinal);

        if (clipFinal !== clip || total !== clipFinal) corregidas++;
    }
    return corregidas;
}