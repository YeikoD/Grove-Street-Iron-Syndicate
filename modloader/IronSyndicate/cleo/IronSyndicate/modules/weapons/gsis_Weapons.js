// GSIS - Weapons: gsis_Weapons
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// La puerta del modulo de armas: lo registra, y las TRES operaciones que el
// jugador puede hacer con un arma.
//
//   equipar(itemId)   sacar el arma del inventario y ponerla en la mano
//   desequipar(slot)  sacarla de la mano y devolverla al inventario
//   recargar()        meterle un cargador del inventario, con animacion
//
// Y una cuarta que no es una operacion sino una lectura para la UI:
// `getEquipadas()`, que devuelve el registro de equipadas para el snapshot.
//
// ============================================================================
// EL CICLO COMPLETO
// ============================================================================
//   inventario: colt45 desnuda, mag_colt45 con 8 balas
//        |  equipar
//        v
//   la 63 en el ped, con clip 0 | registro: equipped[2] = { id, salud }
//        |  R
//        v
//   el cargador sale del inventario, sus 8 balas pasan al arma, y la fila desaparece
//        |  desequipar
//        v
//   la 63 sale del ped y vuelve al inventario CON SUS BALAS
//
// La pieza se saca del inventario ANTES de gastarla y se devuelve si el motor la
// rechaza, y el registro se escribe DESPUES de que el motor acepto el arma. Ese
// orden es el que hace que un fallo no duplique ni pierda: sin registro, el
// reconciliador encuentra el arma en el ped sin fila y la adopta.
//
// ============================================================================
// LOS TRES ARCHIVOS DEL MODULO
// ============================================================================
//   ammo.js           EL INVARIANTE. Un recorrido por frame que aplica
//                     clip = min(clip, capacidad) y total = clip. Sin estado.
//   state.js          Lo que se persiste: que arma esta equipada en cada slot.
//   gsis_Weapons.js   esto. Las operaciones y el camino al motor.
//
// ============================================================================
// LA RECARGA: DE DONDE SALE LA SECUENCIA
// ============================================================================
// La animacion es la del .cs de "Reload Mod" (Junior_Djjr), que es el mod del que
// sale el reloj de la recarga: escribir `m_nTimeForNextShot` con "ahora + el plazo
// que dice la ficha", pasar el estado a RECARGANDO, y esperar. Los offsets y la
// funcion del plazo estan en core/gsis_Engine.js, con su procedencia.
//
// LO QUE ES DISTINTO, Y ES TODO EL MOTIVO DEL MOD
// ---------------------------------------------------------------------------
// "Reload Mod" recarga moviendo la RESERVA del total al clip. Este mod no tiene
// reserva —el invariante de ammo.js lo prohibe—, asi que la recarga es NUESTRA: se
// saca un cargador del inventario y se escriben sus balas en el clip.
//
// Y el motor no puede hacerlo por su cuenta: con `total == clip` su recarga no
// tiene nada que mover. Esa es la razon de que el modulo sea dueno de la recarga y
// no solo de las balas.
//
// LA FILA DEL CARGADOR SE CONSUME ENTERA
// ---------------------------------------------------------------------------
// Las balas del cargador pasan al arma y la fila desaparece del inventario. Un
// cargador con 3 balas monta 3. La parte que no entra en el arma NO vuelve al
// cargador: con una capacidad de 8 y un cargador de 15, las 7 de mas se pierden. Es
// una decision de este paso y esta escrita en ammo.js tambien, donde el pickup es
// el otro caso de municion que se descarta.
// ============================================================================

import { register } from "../../core/gsis_ModuleRegistry.js";
import { KEYS, WEAPONS, AUDIO } from "../../core/gsis_Config.js";
import { keyJustPressed } from "../../core/gsis_Input.js";
import { t } from "../../core/gsis_L10n.js";
import { query } from "../../core/gsis_EventBus.js";
import {
    ITEMS_TAKE_WEAPON, ITEMS_STORE_WEAPON, ITEMS_TAKE_MAGAZINE, ITEMS_STORE_MAGAZINE,
    ITEMS_MAG_AMMO, ITEMS_SET_MAG_AMMO, ITEMS_MAG_SOURCE
} from "../../core/gsis_EventNames.js";
import {
    defDeArma, defDeCargador, cargadorDe, armaDeTipo, CARGADORES
} from "../../data/gsis_weapons.js";
import * as Engine from "../../core/gsis_Engine.js";
import { normalizarSinReserva } from "./ammo.js";
import {
    initState, getEntry, getEntries, setEntry,
    getCargadores, setCargador, ranuraLibre, maxCargadores,
    getCargadorEnArma, setCargadorEnArma
} from "./state.js";

var NOMBRE_MODULO = "Weapons";

// Importar el modulo lo REGISTRA. Un modulo que se importa sin registrarse es un
// modulo invisible: no sale en el log de arranque, su update no corre nunca, y el
// sintoma no es un error sino una pantalla que no cambia.
register({
    name: NOMBRE_MODULO,
    init: initWeapons,
    update: updateWeapons
});

// ---------------------------------------------------------------------------
// EL CICLO DE VIDA
// ---------------------------------------------------------------------------
function initWeapons() {
    initState();
    _pendiente = null;

    var char = Engine.playerChar();
    var corregidas = char ? normalizarSinReserva(char) : 0;

    // Lo que quedo registrado de la partida anterior y el motor no tiene. Pasa
    // cuando el save del juego no nos guardo un arma que el mod si.
    var huerfanos = _entradasHuerfanas(char);

    log("[Weapons] Sin reserva. Tipos " + WEAPONS.PLUGIN_TYPE_MIN + ".." +
        WEAPONS.PLUGIN_TYPE_MAX + " | normalizadas al arrancar: " + corregidas +
        " | equipadas registradas: " + getEntries().length +
        (huerfanos ? " | sin arma en el ped: " + huerfanos : ""));
}

function updateWeapons() {
    var char = Engine.playerChar();
    if (!char) return;

    if (keyJustPressed(KEYS.DEBUG_WEAPON)) _darArmaDePrueba();
    if (keyJustPressed(KEYS.RELOAD)) recargar();

    _watchdogRecarga();

    // El guard va SIEMPRE y va al final: la recarga escribe el par clip/total, y
    // el guard tiene que ver el estado ya terminado.
    normalizarSinReserva(char);
}

// La recarga en curso. No es estado de juego: es el Armed del motor. Se pone al
// empezar la recarga y lo consume el watchdog del update.
//
// Un unico pendiente y no una lista: un ped tiene UN arma en la mano y una sola
// recarga a la vez.
var _pendiente = null;

// ---------------------------------------------------------------------------
// EL CAMINO AL MOTOR
// ---------------------------------------------------------------------------
// El UNICO camino por el que un arma llega al ped. Vive aca y no en ammo.js porque
// ammo.js no depende de nada: es una funcion que lee y compara.
//
// EL REMOVE VA SIEMPRE, y no solo cuando el tipo cambia: GIVE_WEAPON_TO_CHAR del
// MISMO tipo no reemplaza, SUMA. Con un arma de 8 y un give de 8 el total pasaba a
// 16. Quitar y dar es lo unico que es "dar este arma con este estado".
//
// Y la verificacion es por MEMORIA, no con HAS_CHAR_GOT_WEAPON: en el runtime donde
// se desarrollo el native miente y la memoria no, y un give puede dar el arma y
// tirar despues (el tipo lo metio el .asi, que la capa JS no conoce).
function _darArma(char, tipo, balas) {
    var ped = Engine.pedPointer(char);
    if (!ped) return false;

    if (Engine.addressOfType(ped, tipo)) Engine.removeWeapon(char, tipo);

    if (!Engine.giveWeapon(char, tipo, balas)) return false;
    Engine.setCurrentWeapon(char, tipo);

    var addr = Engine.addressOfType(ped, tipo);
    if (!addr) return false;

    Engine.setSlotClip(addr, balas);
    Engine.setSlotTotal(addr, balas);
    // El estado en READY importa: si el motor lo deja en OUT_OF_AMMO, CWeapon::Fire
    // hace return false y el arma tiene balas y no dispara.
    Engine.setSlotState(addr, Engine.WEAPONSTATE_READY);
    return true;
}

// Las balas que tiene un arma EN LA MANO, leidas del ped. 0 si no hay arma.
function _municionEnLaMano(char) {
    var ped = Engine.pedPointer(char);
    if (!ped) return 0;
    var addr = Engine.slotAddress(ped, Engine.selectedSlot(ped));
    if (!addr) return 0;
    return Engine.slotClip(addr);
}

// ---------------------------------------------------------------------------
// LOS CARGADORES
// ---------------------------------------------------------------------------
// Hay TRES lugares donde puede estar un cargador, y son los tres del juego: el
// INVENTARIO (la mochila), las dos RANURAS de equipados, y PUESTO EN EL ARMA. Los
// tres se mueven con la misma regla y ninguno se pierde:
//
//   equiparCargador  mochila -> primera ranura libre (con las dos llenas no entra)
//   guardarCargador  ranura  -> mochila, con las balas que le quedaron
//   recargar (la R)   ranura  -> arma, y lo que estaba en el arma sale por
//                               soltarCargador (abajo)
//   desequipar       arma    -> mochila, DESNUDA, y el cargador sale con ella
//   rellenar         cargador -> cargador, le pasa las balas de otro
//
// QUE PASA CON EL CARGADOR QUE SALE DEL ARMA
// ---------------------------------------------------------------------------
// Es la regla de la casa: un cargador que sale del arma va a una ranura si hay lugar
// Y TIENE BALAS, y si no a la mochila. Vive en un solo lugar (soltarCargador) porque
// son tres los caminos que lo hacen —el cambio, la descarga y el desequipar— y si
// cada uno decidiera por su cuenta, uno de ellos tarde o temprano lo perderia.
//
// Y un cargador VACIO NUNCA OCUPA RANURA: en una ranura no sirve para nada, porque
// recargar exige ammo > 0, y dejaria trabado el cambio al jugador. Por eso la
// mochila no es el segundo destino, sino el unico para el vacio.
//
// QUE PASA CON LAS BALAS QUE SOBRAN
// ---------------------------------------------------------------------------
// Un cargador de 15 en un arma de 8 deja 8 y las 7 sobrantes SE PIERDEN: la
// capacidad la dice el motor para ese arma y el cargador no sabe nada. El cargador
// VUELVE con lo que le quedo (15 - 8 = 7), no con lo que tenia antes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DONDE VA UN CARGADOR QUE SALE DEL ARMA
// ---------------------------------------------------------------------------
// El unico lugar del modulo que decide esto, y lo usan los tres caminos que sacan
// un cargador del arma: el cambio de la recarga, la descarga y el desequipar.
//
// A una ranura si hay lugar Y el cargador tiene balas. A la mochila si no hay lugar,
// o si el cargador esta vacio: un cargador de 0 en una ranura no se puede usar para
// recargar (la recarga exige ammo > 0) y ocuparia una de las dos ranuras que el
// jugador tiene para las que si sirven.
//
// Devuelve donde fue, para el log y para los avisos.
export function soltarCargador(itemId, ammo) {
    var balas = ammo || 0;

    // Con balas y con lugar: ranura.
    var ranura = balas > 0 ? ranuraLibre() : -1;
    if (ranura >= 0) {
        setCargador(ranura, { id: itemId, ammo: balas });
        log("[Weapons] soltarCargador: " + itemId + " (" + balas + ") -> ranura " + (ranura + 1));
        return "ranura " + (ranura + 1);
    }

    // Sin balas, o sin ranura: mochila.
    query(ITEMS_STORE_MAGAZINE, { id: itemId, ammo: balas });
    log("[Weapons] soltarCargador: " + itemId + " (" + balas + ") -> el inventario" +
        (balas > 0 ? " | no habia ranura libre" : " | vacio, y vacio no ocupa ranura"));
    return "el inventario";
}

// Sacar un cargador del inventario y ponerlo en una ranura.
export function equiparCargador(itemId) {
    var def = defDeCargador(itemId);
    if (!def) {
        log("[Weapons] equiparCargador: " + itemId + " no es un cargador del mod");
        return false;
    }

    // Primero la ranura, despues el inventario. Al reves se saca una pieza del
    // inventario para que no haya donde guardarla, y se devuelve a entrar.
    var ranura = ranuraLibre();
    if (ranura < 0) {
        showTextBox(t("WPN_CARGADORES_LLENOS"));
        log("[Weapons] equiparCargador: las " + maxCargadores() + " ranuras estan llenas");
        return false;
    }

    var fila = query(ITEMS_TAKE_MAGAZINE, { id: itemId });
    if (!fila) {
        log("[Weapons] equiparCargador: no hay " + itemId + " con balas en el inventario");
        return false;
    }

    setCargador(ranura, { id: itemId, ammo: fila.ammo || 0 });

    log("[Weapons] equiparCargador: " + itemId + " -> ranura " + (ranura + 1) +
        " | " + (fila.ammo || 0) + " balas");
    return true;
}

// Sacar un cargador de la ranura y devolverlo al inventario con lo que le queda.
export function guardarCargador(indice) {
    var lista = getCargadores();
    if (indice < 0 || indice >= lista.length) {
        log("[Weapons] guardarCargador: no hay cargador en la ranura " + indice);
        return false;
    }
    var c = lista[indice];

    query(ITEMS_STORE_MAGAZINE, { id: c.id, ammo: c.ammo || 0 });
    setCargador(indice, null);

    log("[Weapons] guardarCargador: " + c.id + " <- ranura " + (indice + 1) +
        " | vuelve al inventario con " + (c.ammo || 0) + " balas");
    return true;
}

// ---------------------------------------------------------------------------
// EQUIPAR
// ---------------------------------------------------------------------------
// Sacar el arma del inventario y ponerla en la mano. La fila sale del inventario
// ANTES del give y vuelve intacta si el motor no la acepta.
export function equipar(itemId) {
    var def = defDeArma(itemId);
    if (!def) {
        log("[Weapons] equipar: " + itemId + " no es un arma del mod");
        return false;
    }
    var char = Engine.playerChar();
    if (!char) return false;

    // El slot ya tiene un arma? primero sale esa. Sin esto, equipar encima
    // dejaria dos armas en el mundo y una fila en el inventario.
    if (getEntry(def.slot)) {
        if (!desequipar(def.slot)) {
            log("[Weapons] equipar: no se pudo sacar el arma anterior del slot " + def.slot);
            return false;
        }
    }

    var fila = query(ITEMS_TAKE_WEAPON, { id: itemId });
    if (!fila) {
        log("[Weapons] equipar: no hay " + itemId + " en el inventario");
        return false;
    }

    // DESNUDA. El arma se entrega sin cargador y con cero balas: las balas entran
    // por la R, con un cargador del inventario. Ver el header del ciclo.
    if (!_darArma(char, def.weaponType, 0)) {
        query(ITEMS_STORE_WEAPON, fila);
        log("[Weapons] equipar: el motor no acepto el tipo " + def.weaponType +
            ". El .asi lo registro? La pieza vuelve al inventario.");
        return false;
    }

    setEntry(def.slot, { id: itemId, salud: fila.salud });
    log("[Weapons] equipar: " + itemId + " -> tipo " + def.weaponType +
        " | slot " + def.slot + " | desnuda, 0/" + Engine.clipCapacityOf(def.weaponType));
    return true;
}

// ---------------------------------------------------------------------------
// RELLENAR
// ---------------------------------------------------------------------------
// Pasarle las balas de un cargador a otro del mismo tipo. Es la accion que le da
// sentido a un cargador vacio: sin ella, disparar las 8 balas dejaba una pieza en la
// mochila que no servia para nada.
//
// El destino es el cargador que el jugador eligio —el de la fila que toco— y la
// fuente la elige el modulo: la de la mochila con MAS balas, o si no hay ninguna, la
// ranura mas llena. Se mira la mochila primero para no vaciar una ranura de un click
// cuando hay un cargador en la mochila que puede cubrirlo.
//
// Y NUNCA se mueve una fila: las dos se escriben donde estan. Sacar una fila corre
// los indices de las de abajo, y la segunda escritura caeria en el cargador
// equivocado —que es la forma sutil de que un cargador aparezca con las balas de
// otro—.
export function rellenarCargador(equipado, indice) {
    // ---- EL DESTINO
    var destId = null;
    var destAmmo = 0;
    if (equipado) {
        var enRanura = getCargadores()[indice];
        if (!enRanura) {
            log("[Weapons] rellenarCargador: la ranura " + (indice + 1) + " esta vacia");
            return false;
        }
        destId = enRanura.id;
        destAmmo = enRanura.ammo || 0;
    } else {
        var fila = query(ITEMS_MAG_AMMO, { indice: indice });
        if (!fila) {
            log("[Weapons] rellenarCargador: en la mochila no hay un cargador en el indice " + indice);
            return false;
        }
        destId = fila.id;
        destAmmo = fila.ammo || 0;
    }

    var cap = capacidadDeItem(destId);
    var falta = cap - destAmmo;
    if (falta <= 0) {
        showTextBox(t("WPN_LLENO"));
        log("[Weapons] rellenarCargador: " + destId + " ya esta lleno (" + destAmmo + "/" + cap + ")");
        return false;
    }

    // ---- LA FUENTE
    //
    // `excluir` es el indice del destino solo si esta en la mochila: en las ranuras
    // no hace falta porque el destino no esta en items[].
    var fuente = null;
    var enMochila = query(ITEMS_MAG_SOURCE, {
        id: destId,
        excluir: equipado ? -1 : indice
    });
    if (enMochila) {
        fuente = { donde: "mochila", indice: enMochila.indice, ammo: enMochila.ammo || 0 };
    } else {
        var equipadas = getCargadores();
        for (var i = 0; i < equipadas.length; i++) {
            if (equipado && i === indice) continue;
            if (equipadas[i].id !== destId) continue;
            if (!fuente || equipadas[i].ammo > fuente.ammo) {
                fuente = { donde: "ranura " + (i + 1), indice: i, ammo: equipadas[i].ammo || 0 };
            }
        }
    }
    if (!fuente || fuente.ammo <= 0) {
        showTextBox(t("WPN_MAG_SIN_FUENTE"));
        log("[Weapons] rellenarCargador: no hay otro " + destId + " con balas para rellenar");
        return false;
    }

    // ---- MOVER
    //
    // Lo que entra es lo que falta en el destino o lo que tiene la fuente, lo que
    // se acabe primero. Un cargador de 15 llenando uno de 8 pone 8 y deja 7.
    var movidas = Math.min(falta, fuente.ammo);

    // El destino primero. Es el orden que importa: el indice del destino se leyo
    // antes de escribir nada, y hasta aca no se movio ninguna fila.
    if (equipado) {
        setCargador(indice, { id: destId, ammo: destAmmo + movidas });
    } else {
        query(ITEMS_SET_MAG_AMMO, { indice: indice, ammo: destAmmo + movidas });
    }

    // Y la fuente se queda con lo que sobro. Si era una ranura y no le queda nada,
    // sale por soltarCargador: una ranura no guarda un cargador vacio.
    var resto = fuente.ammo - movidas;
    var detalleFuente;
    if (fuente.donde === "mochila") {
        query(ITEMS_SET_MAG_AMMO, { indice: fuente.indice, ammo: resto });
        detalleFuente = "la mochila (" + fuente.ammo + " -> " + resto + ")";
    } else if (resto > 0) {
        setCargador(fuente.indice, { id: destId, ammo: resto });
        detalleFuente = "la " + fuente.donde + " (" + fuente.ammo + " -> " + resto + ")";
    } else {
        setCargador(fuente.indice, null);
        detalleFuente = "la " + fuente.donde + ", que se vacio -> " + soltarCargador(destId, 0);
    }

    log("[Weapons] rellenarCargador: " + destId + " " + destAmmo + "/" + cap +
        " -> " + (destAmmo + movidas) + "/" + cap +
        " | " + movidas + " balas desde " + detalleFuente);
    return true;
}

// ---------------------------------------------------------------------------
// LO QUE HAY PUESTO EN UN ARMA
// ---------------------------------------------------------------------------
// `cargador` sale del registro del modulo y las balas salen del MOTOR, en el mismo
// `getEquipadas`: leerlas por separado seria dos respuestas al motor para un dato que
// ya se leyo. La fila de la UI necesita los dos —cuantas balas quedan y de donde
// salieron— y este es el lugar que tiene los dos.

// ---------------------------------------------------------------------------
// DESEQUIPAR
// ---------------------------------------------------------------------------
// Sacar el arma de la mano. Vuelve DESNUDA, y su cargador sale con ella.
//
// Antes el arma volvia CON SUS BALAS y se copiaba la municion al inventario. Ya no:
// las balas de un arma son las del cargador que tiene puesto, asi que el arma
// desnuda vuelve con cero y el cargador se va con lo que le queda. Si vuelve un arma
// con balas y sin cargador, la proxima recarga no tendria nada que sacar de ella.
export function desequipar(slot) {
    var entry = getEntry(slot);
    if (!entry) {
        log("[Weapons] desequipar: no hay arma registrada en el slot " + slot);
        return false;
    }
    var def = defDeArma(entry.id);
    if (!def) {
        // El registro nombra un item que el catalogo ya no tiene: se descarta,
        // porque dejarlo bloquea el slot para siempre.
        setEntry(slot, null);
        log("[Weapons] desequipar: el registro del slot " + slot + " (" + entry.id +
            ") no es un arma del catalogo. Se descarta.");
        return true;
    }

    var char = Engine.playerChar();
    if (!char) return false;

    // Las dos cosas se leen DEL PED ANTES de sacar el arma, porque despues el slot ya
    // no las tiene: que cargador tiene puesto, y cuantas balas le quedan.
    var magId = getCargadorEnArma(slot);
    var ammo = _municionEnLaMano(char);

    Engine.removeWeapon(char, def.weaponType);
    query(ITEMS_STORE_WEAPON, { id: entry.id, salud: entry.salud, ammo: 0 });
    setEntry(slot, null);
    setCargadorEnArma(slot, null);

    var detalle = "vuelve al inventario desnuda";
    if (magId) {
        detalle += " | su cargador (" + magId + ", " + ammo + ") -> " +
            soltarCargador(magId, ammo);
    } else {
        detalle += " | sin cargador puesto";
    }

    log("[Weapons] desequipar: slot " + slot + " | " + entry.id + " | " + detalle);
    return true;
}

// ---------------------------------------------------------------------------
// RECARGAR
// ---------------------------------------------------------------------------
// Meter en el arma un cargador que este EQUIPADO, con animacion.
//
// ---------------------------------------------------------------------------
// La R tiene DOS caminos, y cual de los dos es lo decide el jugador:
//
//   CAMBIO     hay un cargador EQUIPADO con balas para este arma. El que tiene
//              PUESTO sale por soltarCargador, con las balas que le quedaban, y el
//              equipado entra. Con animacion y con el sonido del .asi.
//   DESCARGA   no hay ninguno equipado, pero hay uno puesto: ese sale por
//              soltarCargador y el arma queda DESNUDA. Con la MISMA animacion del
//              cambio y el mismo sonido, porque es la misma animacion del motor sin
//              las balas.
//
// Que no haya un tercer camino —"no pasa nada"— es lo que hace que la R sirva para
// cambiar de cargador con el arma llena, que es el uso mas comun de la tecla.
//
// La animacion se pregunta una sola vez y antes de tocar nada, porque los dos
// caminos la necesitan: un arma sin anim de recarga no puede cambiar ni descargar,
// y en ese caso no se mueve ningun cargador.
//
// El orden de las comprobaciones es el que hace que un fallo no gaste nada:
//
//   1. el arma de la mano es del mod      si no, no es nuestra recarga
//   2. no esta recargando ya              una recarga, no dos
//   3. el motor tiene capacidad declarada
//   4. ese arma tiene cargador en el catalogo
//   5. (solo en el CAMBIO) el motor tiene anim para este arma, y se PREGUNTA ANTES
//      de gastar el cargador: si el arma no recarga, el cargador se queda equipado
//      y el que tiene puesto no se toca
//
// Antes habia una comprobacion mas: "el clip no esta lleno". Se saco a proposito:
// era la que hacia que la R no hiciera nada con el arma llena, y cambiar de cargador
// es exactamente lo que se le pide a la tecla en ese caso.
// ---------------------------------------------------------------------------
export function recargar() {
    var char = Engine.playerChar();
    if (!char) return false;
    var ped = Engine.pedPointer(char);
    if (!ped) return false;

    var slot = Engine.selectedSlot(ped);
    if (!slot) return false;
    var addr = Engine.slotAddress(ped, slot);
    if (!addr) return false;
    var tipo = Engine.slotType(addr);

    var delMod = armaDeTipo(tipo);
    if (!delMod) return false;

    if (Engine.slotState(addr) === Engine.WEAPONSTATE_RELOADING) return false;

    var cap = Engine.clipCapacityOf(tipo);
    if (cap <= 0) {
        log("[Weapons] recargar: el tipo " + tipo + " no tiene capacidad declarada");
        return false;
    }
    // NO HAY GUARDA DE CLIP LLENO. Antes habia una aqui y se borro: con el arma
    // llena la R tiene que hacer una de las dos cosas de abajo, y si no hay cargador
    // equipado eso es la descarga, no "no pasa nada".

    // Que cargador tiene PUESTO este arma, y cuantas balas le quedan.
    //
    // Las balas son el clip, que es del juego: se leen, no se copian a ningun lado.
    // El id sale del registro del modulo porque el motor no distingue "sin cargador"
    // de "descargado": para el los dos son cero balas, y sin el id no hay manera de
    // saber que este arma tiene un cargador.
    var puestoId = getCargadorEnArma(slot);
    var enClip = Engine.slotClip(addr);

    // La 4: hay un cargador que le corresponde a este arma. Un cargador de otro arma
    // no se toca: esta en su ranura esperando a su propia arma.
    var magId = cargadorDe(delMod.itemId);
    if (!magId) {
        log("[Weapons] recargar: " + delMod.itemId + " no tiene cargador en el catalogo");
        return false;
    }

    // La 5: la animacion se pregunta ANTES de mover un cargador, y va ACA y no
    // adentro de un camino porque los DOS la necesitan. Cambiar y descargar son la
    // misma animacion del motor; lo que cambia son las balas que mete, que en la
    // descarga son cero.
    //
    // Un arma sin anim no recarga nunca, y si movemos los cargadores primero no hay
    // manera de volver atras: mejor no hacer nada y que el cargador siga donde esta.
    var spec = Engine.reloadSpec(tipo);
    if (!spec) {
        log("[Weapons] recargar: el tipo " + tipo + " no tiene anim de recarga");
        return false;
    }

    var equipados = getCargadores();
    var elegido = -1;
    for (var i = 0; i < equipados.length; i++) {
        if (equipados[i].id === magId &&equipados[i].ammo > 0) {
            elegido = i;
            break;
        }
    }
    // ---- EL CAMBIO
    //
    // Hay cargador equipado con balas: entra este, y el que estaba puesto sale.
    if (elegido >= 0) {
        // Las balas del cargador, recortadas a lo que le entra. Un cargador de 5 en
        // un arma de 8 monta 5; uno de 15 en un arma de 8 monta 8 y las 7 sobrantes
        // se pierden. Ver el header.
        var mag = equipados[elegido];
        var n = Math.min(cap, mag.ammo);

        // EL QUE ESTABA PUESTO SALE PRIMERO, o se pierde. Antes no salia nunca: el
        // clip viejo se ponia en cero y el cargador no existed en ningun lado del
        // modulo, asi que se perdia en cada recarga.
        var salio = "no habia ninguno puesto";
        if (puestoId) salio = "el " + puestoId + " (" + enClip + ") -> " +
            soltarCargador(puestoId, enClip);

        setCargador(elegido, null);
        setCargadorEnArma(slot, mag.id);
        _empezarRecarga(addr, tipo, n, spec.ms);

        // El sonido NO se pide aca. Lo pide el .asi: el motor tiene
        // CAEWeaponAudioEntity::WeaponReload con la tabla de sonidos por tipo de arma, y
        // el .asi es el unico de los dos lados que sabe resolver el padre, que es lo que
        // el motor exige para elegir el sfx. El modulo solo pone RECARGANDO y el .asi ve
        // el estado y llama al motor.
        log("[Weapons] recargar: CAMBIO | " + mag.id + " de la ranura " + (elegido + 1) +
            " -> tipo " + tipo + " | " + n + "/" + cap +
            " | " + salio +
            ((mag.ammo - n) > 0 ? " | " + (mag.ammo - n) + " balas sobrantes se pierden" : ""));
        return true;
    }

    // ---- LA DESCARGA
    //
    // No hay cargador equipado, pero hay uno puesto: ese sale y el arma queda
    // desnuda.
    //
    // CON LA MISMA ANIMACION que el cambio, y por eso con las mismas tres
    // escrituras: es la misma animacion del motor, solo que sin balas que meter. Se
    // llama _empezarRecarga con CERO, y el watchdog escribe cero en el clip cuando
    // vence el plazo: el arma queda 0/0 en READY exactamente igual que antes, pero
    // despues de sacar el cargador en vez de tele transportarlo.
    //
    // Y el sonido tambien va, porque lo pide el .asi con el estado, y el estado es el
    // mismo. Es lo que hace el juego cuando el jugador saca el cargador a mano, y
    // ademas es el aviso de que la R hizo algo.
    if (puestoId) {
        var donde = soltarCargador(puestoId, enClip);
        setCargadorEnArma(slot, null);
        _empezarRecarga(addr, tipo, 0, spec.ms);

        log("[Weapons] recargar: DESCARGA | " + puestoId + " (" + enClip +
            " balas) -> " + donde + " | el arma queda desnuda, con la anim del cambio");
        return true;
    }

    // ---- NO HAY CARGADOR NI EQUIPADO NI PUESTO
    //
    // No hay nada que gastar y nada que sacar: avisar y no tocar nada.
    showTextBox(t(equipados.length ? "WPN_NOMAG" : "WPN_NOMAG_EQUIPADO"));
    log("[Weapons] recargar: no hay " + magId + " equipado (" +
        equipados.length + " cargadores equipados) y este arma no tiene ninguno puesto");
    return false;
}

// LA RECARGA
// ---------------------------------------------------------------------------
// Tres escrituras y un pendiente:
//
//   m_nTimeForNextShot = ahora + GetWeaponReloadTime(del animgroup)
//   m_nState           = RECARGANDO
//   clip = total = 0
//
// Que es lo mismo que escribe el mod "Reload Mod" (fuente en
// cleo\Reload Mod Fixed.txt), que a su vez es lo mismo que hace el motor en
// CWeapon::Fire, 0x73FA20: dispara, y si el cargador quedo vacio y hay reserva,
// pone RECARGANDO y el plazo del animgroup.
//
// LO QUE SE PROBO Y SE DESCARTO
// ---------------------------------------------------------------------------
// La variante de "dejar que el motor la termine" —m_nAmmoTotal = las balas y no
// tocar el clip, esperando que el motor cierre con clip += total— se probo el
// 02/10/2026 y NO funciona: la animacion arranca (esa parte si la hace el motor) pero
// el arma no termina de recargar. Por eso el modulo mueve las balas el.
//
// Y el sonido, que era el motivo original de esa variante, tampoco sale de ahi. El
// motor no tiene una operacion "recargar" a la que llamar: la recarga ES parte del
// disparo (0x73FA20). El sonido de recarga del juego vive en un despachador por
// tipo (CAEWeaponAudioEntity::WeaponReload, tabla en 0x503838) al que no se llega
// desde un arma de tipo 60..79 con una recarga escrita a mano. Por eso el sonido lo
// pone el mod con sus dos archivos, en audio.js.
//
// LO QUE NO HACEMOS
// ---------------------------------------------------------------------------
// No escribimos m_nAmmoInClip con las balas antes de tiempo: el arma se veria llena
// durante la animacion. El watchdog las escribe cuando el plazo vence, que es lo que
// hace el arma gastandose y despues apareciendo.
//
// El guard de municion no molesta: saltea el arma mientras el estado sea
// RECARGANDO (ammo.js), y cuando el watchdog escribe el par ya viene bien.
function _empezarRecarga(addr, tipo, n, ms) {
    var hasta = Engine.timerNow() + ms;
    Engine.setSlotNextShotTime(addr, hasta);
    Engine.setSlotClip(addr, 0);
    Engine.setSlotTotal(addr, 0);
    Engine.setSlotState(addr, Engine.WEAPONSTATE_RELOADING);
    _pendiente = { addr: addr, tipo: tipo, balas: n, hasta: hasta };
}

// El watchdog. Corre por frame mientras hay una recarga pendiente, y escribe las
// balas cuando el plazo vencie.
//
// POR QUE NO ESPERAMOS A QUE EL MOTOR TERMINE
// ---------------------------------------------------------------------------
// Porque no las pone. El motor cierra la recarga y moves el total al clip, y el
// total esta en cero: "esperar a que el motor termine" es esperar a que el arma
// quede vacia. El plazo es lo unico que el motor si cumple, asi que el plazo es lo
// que se mira.
//
// Y si el estado dejo de ser RECARGANDO antes de tiempo —el motor corto la
// animacion— el pendiente se descarta en vez de escribir: escribir sobre un arma
// que el jugador ya volvio a usar es peor que dejar el cargador consumido.
function _watchdogRecarga() {
    var p = _pendiente;
    if (!p) return;

    var state = Engine.slotState(p.addr);
    if (state !== Engine.WEAPONSTATE_RELOADING && Engine.timerNow() < p.hasta) {
        _pendiente = null;
        return;
    }
    if (Engine.timerNow() < p.hasta) return;

    Engine.setSlotClip(p.addr, p.balas);
    Engine.setSlotTotal(p.addr, p.balas);
    Engine.setSlotState(p.addr, Engine.WEAPONSTATE_READY);
    _pendiente = null;
}

// ---------------------------------------------------------------------------
// LO QUE LA UI PREGUNTA
// ---------------------------------------------------------------------------
// Las equipadas, con la municion leida del ped en vivo.
//
// "En vivo" y no del registro porque la municion no esta en el registro: la tiene
// el juego. La fila de la UI tiene que decir cuantas balas quedan ahora, no
// cuantas quedaban cuando se unequipo.
export function getEquipadas() {
    var char = Engine.playerChar();
    var ped = char ? Engine.pedPointer(char) : 0;
    var out = [];

    var entries = getEntries();
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var def = defDeArma(e.id);
        if (!def) continue;

        var addr = ped ? Engine.addressOfType(ped, def.weaponType) : 0;
        out.push({
            id: e.id,
            slot: e.slot,
            salud: e.salud,
            ammo: addr ? Engine.slotClip(addr) : 0,
            cap: Engine.clipCapacityOf(def.weaponType),
            cargador: getCargadorEnArma(e.slot)
        });
    }
    return out;
}

// Los cargadores equipados, con las balas que tienen guardadas.
//
// `ammo` sale del REGISTRO y no del juego: un cargador equipado no esta en el
// inventario, asi que el modulo es el dueno de su municion. Es al reves del arma,
// que si esta en el ped.
export function getCargadoresEquipados() {
    var lista = getCargadores();
    var out = [];
    for (var i = 0; i < lista.length; i++) {
        out.push({
            id: lista[i].id,
            indice: lista[i].indice,
            ammo: lista[i].ammo || 0,
            cap: capacidadDeItem(lista[i].id)
        });
    }
    return out;
}

// La capacidad que le ve el motor a un item del mod. La UI la usa para pintar
// "N/cap" en la fila del arma equipada, que es el unico lugar donde el denominador
// es el del motor y no el declarado.
export function capacidadDeItem(itemId) {
    var def = defDeArma(itemId);
    if (def) return Engine.clipCapacityOf(def.weaponType);
    var mag = defDeCargador(itemId);
    return mag ? mag.clipSize : 0;
}

// Las entradas del registro cuyo arma el ped NO tiene. El numero, no la lista: lo
// usa el init para avisar, y no hay nada que hacer con el salvo avisar.
function _entradasHuerfanas(char) {
    if (!char) return 0;
    var ped = Engine.pedPointer(char);
    if (!ped) return 0;
    var n = 0;
    var entries = getEntries();
    for (var i = 0; i < entries.length; i++) {
        var def = defDeArma(entries[i].id);
        if (!def || !Engine.addressOfType(ped, def.weaponType)) n++;
    }
    return n;
}

// ---------------------------------------------------------------------------
// ANDAMIAJE DE PRUEBA, Y SE SACA CUANDO LA PRUEBA CIERRE
// ---------------------------------------------------------------------------
// El .asi da de alta los tipos 60..66 en su DllMain y el dealer todavia no los
// vende, asi que sin esto no hay forma de tener un arma GSIS en la mano.
//
// La tecla de debug mete la Colt .45 y un cargador de 8 en el inventario, y los
// deja puestos: el arma desnuda y el cargador todavia en la mochila, para que la
// prueba pase por la R.
//
// Las filas entran por `items:storeWeapon`, que es el camino de vuelta del
// inventario. Es un nombre que no corresponde a un cargador, y esta es la razon por
// que es provisorio: el camino de verdad para "un item nuevo" es el alta del
// modulo de inventario, y ese todavia no tiene un "alta con estado". Cuando lo
// tenga, esto se borra.
function _darArmaDePrueba() {
    var char = Engine.playerChar();
    if (!char) return;

    var armas = [DEBUG_ITEM_ARMA, DEBUG_ITEM_ARMA2, DEBUG_ITEM_ARMA3, DEBUG_ITEM_ARMA4];
    for (var i = 0; i < armas.length; i++) {
        var id = armas[i];
        var def = defDeArma(id);
        var magId = def ? cargadorDe(id) : null;
        if (!def || !magId) {
            log("[Weapons] prueba: el catalogo no tiene " + id + " con cargador");
            continue;
        }

        // Un cargador nuevo, con las balas que trae de fabrica.
        query(ITEMS_STORE_WEAPON, { id: magId, salud: 100, ammo: CARGADORES[magId].clipSize });
        query(ITEMS_STORE_WEAPON, { id: id, salud: 100, ammo: 0 });
        if (i === 0) equipar(id);

        log("[Weapons] prueba: " + id + " (tipo " + def.weaponType +
            ") y " + magId + " en el inventario.");
    }
    log("[Weapons] prueba: apretá la R para recargar.");
}

var DEBUG_ITEM_ARMA = "colt45";
var DEBUG_ITEM_ARMA2 = "colt45_c15";
var DEBUG_ITEM_ARMA3 = "colt45_silenced";
var DEBUG_ITEM_ARMA4 = "colt45_c15_silenced";