// GSIS - Weapons: reconcile
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Que el ped y el registro digan lo mismo. Corre una vez por frame.
//
// Son dos sistemas distintos que guardan el mismo arma: el registro del mod (en
// el INI) y `CPed::m_aWeapons[13]` (en el save del juego). Nada los mantiene
// sincronizados salvo esto. Sin esto, cargar una partida deja armas en los dos
// sitios y el jugador las ve duplicadas.
//
// ============================================================================
// LA REGLA, Y SON TRES
// ============================================================================
// Se recorre un slot y se compara el tipo que tiene el ped contra el tipo que
// dice el registro. De ahi salen tres casos y solo tres:
//
//   1. el slot esta VACIO
//      y el registro tiene algo -> se borra la entrada. El arma se fue (wasted,
//      mision, script) y el registro no se entera solo.
//
//   2. el ped tiene un arma que NO esta en el registro
//      y el tipo es de una familia declarada -> se ADOPTA: pasa al inventario
//      con su estado. Es el camino de una pistola de una mision, de un arma de
//      un cheat, o de un arma de un save viejo.
//
//   3. el registro tiene algo
//      y el tipo que tiene el ped NO es el que dice la configuracion
//      -> se NORMALIZA: se da el arma correcta y el registro no cambia.
//
// ----------------------------------------------------------------------------
// EL CASO 3 ES EL QUE RESUELVE EL 22 Y EL 23
// ----------------------------------------------------------------------------
// Con el modelo viejo, un 22 en la mano de una Colt registrada se reconocia
// como "no registrada" y la rama de abajo lo adoptaba como si fuera un arma
// nueva, mientras la entrada vieja de la Colt seguia ahi. Resultado: dos filas
// en el inventario y el arma en los dos sitios.
//
// Ahora no hay caso especial. La pregunta es una:
//
//   el registro dice colt45 + [suppressor] = 60, y el ped tiene un 23?
//   -> el tipo que tiene el ped no es el que dice el registro, y el que dice el
//      registro es el 60. Se da el 60.
//
// Y con una Colt pelada registrada, el 22 se convierte en el 63. Es la misma
// regla, sin la palabra "Colt" en ningun lado: lo que decide es la
// configuracion guardada, y la configuracion guardada es la unica fuente.
//
// El caso inverso tambien sale solo: un 60 en la mano de una Colt pelada
// registrada se normaliza al 63, y uno con el silenciador se queda en el 60.
// ----------------------------------------------------------------------------
//
// LO QUE NO SE ADOPTA, Y POR QUE ESTA DICHO
// ----------------------------------------------------------------------------
// El 22 y el 23 NO se adoptan. Son tipos de vanilla que el motor consulta de
// verdad, y la Colt de GSIS es el 63 y la Colt silenciada de GSIS es el 60: ni
// el numero ni la capacidad ni el modelo son los mismos.
//
// Asi que un 22 o un 23 en la mano sin entrada en el registro se dejan como
// estan, igual que una mandibula o una granada, y se avisa UNA vez por tipo para
// que se vea que la decision existe. Ver familyForType() en data/weapons.js.
// ============================================================================

import { query } from "../../core/gsis_EventBus.js";
import { ITEMS_STORE_WEAPON } from "../../core/gsis_EventNames.js";
import * as Engine from "../../core/gsis_Engine.js";
import {
    resolveWeaponType, getVariantByWeaponType, familyForType,
    TIPOS_VANILLA_NO_ADOPTABLES, getFamilyItemId,
    mountedMagazineOf
} from "../../data/gsis_weapons.js";
import { SALUD_MAX } from "../../data/gsis_item_data.js";
import { getEquipped, setEquipped, familyOfItem } from "./state.js";
import { weaponVariant } from "./events.js";
import { _giveInternal } from "./internal.js";

var _slotsVistos = {};      // tipos de vanilla que se dejaron donde estaban
var _normalizados = {};     // normalizaciones ya avisadas, para no repetir

export function reconcile() {
    var char = Engine.playerChar();
    if (!char) return;
    if (Engine.isCharDead(char)) return;
    if (!Engine.isPlayerControlOn()) return;
    var ped = Engine.pedPointer(char);
    if (!ped) return;

    var equipped = getEquipped();
    var changed = false;

    for (var i = 1; i < Engine.WEAPON_SLOT_COUNT; i++) {
        var addr = Engine.slotAddress(ped, i);
        var enPies = Engine.slotType(addr);
        var entry = equipped[i];

        // --- caso 1: el slot esta vacio ---
        if (!enPies) {
            if (entry) { delete equipped[i]; changed = true; }
            continue;
        }

        // --- caso 3: hay registro, y el tipo tiene que ser el que dice ---
        if (entry) {
            var esperado = resolveWeaponType(entry.family, entry.attachments);
            if (esperado === null) {
                // La configuracion guardada no existe: se saco una fila del .dat o
                // del catalogo. El arma no se pierde, y la entrada tampoco se
                // borra sola: seria perder el silenciador del jugador sin avisar.
                // Se avisa y se deja el arma en la mano.
                if (!_normalizados["!" + i]) {
                    _normalizados["!" + i] = true;
                    log("[Weapons] ERROR: el slot " + i + " tiene " + entry.family +
                        " + [" + (entry.attachments || []).join(", ") +
                        "], que no esta declarada. Se deja el arma como esta. " +
                        "Revisar WEAPON_VARIANTS y gsis_weapons.dat.");
                }
                continue;
            }
            if (enPies !== esperado) {
                // Normalizar cambia el PED, no el registro: el registro ya decia
                // `entry` y ahora el ped coincide con el. Por eso NO se toca
                // `changed` aca. `_normalizar` emite `weapon:variant`, que es el
                // evento de "el weaponType que ejecuta cambio", y el registro
                // intacto no dispara `weapon:changed`.
                _normalizar(char, i, entry, esperado, enPies, addr);
            }
            continue;
        }

        // --- caso 2: arma en el ped sin registro ---
        _adoptar(char, i, enPies, addr);
    }

    if (changed) setEquipped(equipped);
}

// ----------------------------------------------------------------------------
// NORMALIZAR
// ----------------------------------------------------------------------------
// El ped tiene una representacion y el registro dice otra. Se da la correcta,
// conservando las balas.
//
// Que el ped pueda tener una representacion distinta de la del registro es lo
// NORMAL, no una excepcion: pasa cuando el jugador recoge un arma de una
// mision, cuando carga un save viejo que guardaba el weaponType, y cuando el
// catalogo cambia un numero de tipo.
//
// Conservar las balas importa y es lo unico delicado. El tipo viejo puede tener
// otra capacidad: si un save viejo tiene una Colt pelada (17 balas del 22) y el
// registro dice colt45 sin accesorios, el 63 tiene 8. Se leen las balas del tipo
// que hay en la mano, se pasan por la capacidad del tipo nuevo, y se da ese.
function _normalizar(char, slot, entry, esperado, enPies, addr) {
    var ammo = Engine.getAmmo(char, enPies) || 0;
    var capNuevo = Engine.clipCapacityOf(esperado);
    var perdido = capNuevo > 0 ? Math.max(0, ammo - capNuevo) : 0;

    var r = _giveInternal(char, entry.family, entry.attachments, ammo,
        "normalizar slot " + slot);
    if (!r.ok) return false;

    // El registro no cambio, pero el weaponType que el ped EJECUTA si. Por eso
    // sale `weapon:variant` y no `weapon:changed`: el primero describe lo que el
    // motor va a hacer, el segundo describe lo que se guardo. Quien mira la UI
    // para recargar un icono necesita el primero, no el segundo.
    weaponVariant("normalizar", entry.family, r.attachments, r.weaponType, slot);

    // Un solo aviso por (tipo viejo, tipo nuevo). El reconciliador corre por
    // frame: sin esto el log se llena con la misma linea 1800 veces por minuto.
    var clave = enPies + ">" + esperado;
    if (!_normalizados[clave]) {
        _normalizados[clave] = true;
        log("[Weapons] normalizado: el slot " + slot + " tenia el tipo " + enPies +
            " y la configuracion guardada (" + entry.family +
            (entry.attachments.length ? " + " + entry.attachments.join(", ") : "") +
            ") es el " + esperado + " | " + r.ammo + "/" + capNuevo + " balas" +
            (perdido ? " | " + perdido + " balas de mas que no entran en la capacidad nueva" : ""));
    }
    return true;
}

// ----------------------------------------------------------------------------
// ADOPTAR
// ----------------------------------------------------------------------------
// Un arma en el ped que el registro no conoce. Pasa al inventario con su estado.
//
// El orden importa y no es negociable: quitar del ped, VERIFICAR que salio, y
// solo entonces guardar el item. Al reves, si el REMOVE falla, queda una copia
// en el inventario con el arma todavia en la mano.
function _adoptar(char, slot, enPies, addr) {
    if (TIPOS_VANILLA_NO_ADOPTABLES[enPies]) {
        if (!_slotsVistos[enPies]) {
            _slotsVistos[enPies] = true;
            log("[Weapons] el slot " + slot + " tiene el tipo " + enPies +
                " y NO se adopta: es un tipo de vanilla y la version de GSIS de " +
                (enPies === 23 ? "la silenciada" : "la Colt") + " es " +
                (enPies === 23 ? "el 60" : "el 63") + ". Se deja como esta.");
        }
        return;
    }
    var family = familyForType(enPies);
    if (!family) return;   // melee, granadas, camara, paracaidas: no son nuestras

    var itemId = getFamilyItemId(family);
    if (!itemId) return;

    var cap = Engine.clipCapacityOf(enPies);
    var total = Engine.slotTotal(addr);
    if (cap > 0 && total > cap) total = cap;

    // LA CONFIGURACION DEL ARMA QUE ESTABA EN EL PED. Sin esto, adoptar el 60
    // (la Colt con silenciador) guardaba un "colt45" pelado, y al volver a
    // equipar se le olvidaba el silenciador sin avisar: el tipo 60 es lo UNICO que
    // dibuja el modelo 347, asi que ademas de perder la pieza se perdia el
    // cambio de aspecto.
    //
    // La variante es la que sabe que accesorio lleva el tipo, y el registro guarda los
    // mismos ids que el inventario y que la tabla: hay una sola forma de escribir
    // un accesorio y por eso la lista se copia tal cual.
    var v = getVariantByWeaponType(enPies);
    var attachments = [];
    if (v) {
        for (var i = 0; i < v.attachments.length; i++) {
            attachments.push(v.attachments[i]);
        }
    }
    // El cargador es un accesorio montado, no una propiedad del item. Se deduce
    // de si quedan balas, que es lo unico que el motor nos da de aqui.
    var tieneCargador = mountedMagazineOf(family, attachments) !== null && total > 0;

    Engine.removeWeapon(char, enPies);

    // Verificacion por memoria y por native. Las dos, y con el TIPO que se acaba
    // de quitar: comparar contra el de la familia daria "salio" por construccion
    // cuando el slot tiene otra representacion de la misma familia.
    if (Engine.hasWeapon(char, enPies)) return;
    if (Engine.addressOfType(Engine.pedPointer(char), enPies) !== 0) return;

    if (!query(ITEMS_STORE_WEAPON, {
        id: itemId,
        attachments: attachments,
        ammo: total,
        salud: SALUD_MAX,
        hasMag: tieneCargador,
        force: true
    })) {
        // Sin sitio: el arma sigue siendo del jugador y vuelve al ped. Con sus
        // accesorios, que es lo que tenia: devolverla pelada seria perder la
        // pieza por un problema de espacio, que es la peor forma de perderla.
        _giveInternal(char, family, v ? v.attachments : [], total,
            "no entro en el inventario, vuelve al ped");
        return;
    }
    log("[Weapons] adoptado: el slot " + slot + " tenia el tipo " + enPies +
        " (" + family + (attachments.length ? " + " + attachments.join(", ") : "") +
        ") y no estaba en el registro -> inventario, " + total + "/" + cap + " balas");
}

// Los avisos se limpian al recargar la partida. Sin esto, cargar y volver a
// cargar no vuelve a avisar de una normalizacion que el jugador ya conoce.
export function resetAvisos() {
    _slotsVistos = {};
    _normalizados = {};
}
