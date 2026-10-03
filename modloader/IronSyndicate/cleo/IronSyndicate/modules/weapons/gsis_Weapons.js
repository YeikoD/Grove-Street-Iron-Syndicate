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
    ITEMS_TAKE_WEAPON, ITEMS_STORE_WEAPON, ITEMS_TAKE_MAGAZINE
} from "../../core/gsis_EventNames.js";
import {
    defDeArma, defDeCargador, cargadorDe, armaDeTipo, CARGADORES
} from "../../data/gsis_weapons.js";
import * as Engine from "../../core/gsis_Engine.js";
import { normalizarSinReserva } from "./ammo.js";
import { initState, getEntry, getEntries, setEntry } from "./state.js";

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
// DESEQUIPAR
// ---------------------------------------------------------------------------
// Sacar el arma de la mano y devolverla al inventario CON SUS BALAS.
//
// La municion viaja en la fila: se lee del ped antes de sacar el arma, porque
// despues el slot ya no la tiene. Un desequipar con 3 balas devuelve un arma con 3,
// y ese es el unico lugar del sistema donde se copia la municion del juego.
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
    var ammo = _municionEnLaMano(char);

    Engine.removeWeapon(char, def.weaponType);
    query(ITEMS_STORE_WEAPON, { id: entry.id, salud: entry.salud, ammo: ammo });
    setEntry(slot, null);

    log("[Weapons] desequipar: slot " + slot + " | " + entry.id +
        " vuelve al inventario con " + ammo + " balas");
    return true;
}

// ---------------------------------------------------------------------------
// RECARGAR
// ---------------------------------------------------------------------------
// Meter un cargador del inventario en el arma de la mano, con animacion.
//
// El orden de las comprobaciones es el que hace que un fallo no gaste nada:
//
//   1. el arma de la mano es del mod      si no, no es nuestra recarga
//   2. no esta recargando ya              una recarga, no dos
//   3. el clip no esta lleno             recargar lleno es una recarga que no
//                                        hace nada y gasta un cargador
//   4. el motor tiene anim para este arma  se PREGUNTA ANTES de sacar el cargador:
//                                        si el arma no recarga, el cargador se
//                                        queda en el inventario
//   5. hay un cargador con balas en el inventario
//
// Y la 5 es la unica que puede fallar por una decision del jugador: sin cargador no
// se toca nada y se le avisa.
export function recargar() {
    var char = Engine.playerChar();
    if (!char) return false;
    var ped = Engine.pedPointer(char);
    if (!ped) return false;

    var slot = Engine.selectedSlot(ped);
    if (!slot) return false;
    var addr = Engine.slotAddress(ped, slot);
    var tipo = Engine.slotType(addr);

    var delMod = armaDeTipo(tipo);
    if (!delMod) return false;

    if (Engine.slotState(addr) === Engine.WEAPONSTATE_RELOADING) return false;

    var cap = Engine.clipCapacityOf(tipo);
    if (cap <= 0) {
        log("[Weapons] recargar: el tipo " + tipo + " no tiene capacidad declarada");
        return false;
    }
    if (Engine.slotClip(addr) >= cap) return false;

    // La 4: el arma tiene anim de recarga. Antes de gastar el cargador, porque un
    // arma sin anim no recarga nunca y el cargador se quedaria en la fila.
    var spec = Engine.reloadSpec(tipo);
    if (!spec) {
        log("[Weapons] recargar: el tipo " + tipo + " no tiene anim de recarga");
        return false;
    }

    var magId = cargadorDe(delMod.itemId);
    if (!magId) {
        log("[Weapons] recargar: " + delMod.itemId + " no tiene cargador en el catalogo");
        return false;
    }

    var fila = query(ITEMS_TAKE_MAGAZINE, { id: magId });
    if (!fila) {
        showTextBox(t("WPN_NOMAG"));
        return false;
    }

    // Las balas del cargador, recortadas a lo que le entra. Un cargador de 5 en un
    // arma de 8 monta 5; uno de 15 en un arma de 8 monta 8 y las 7 sobrantes se
    // pierden. Ver el header.
    var n = Math.min(cap, fila.ammo || 0);

    _empezarRecarga(addr, tipo, n, spec.ms);

    // El sonido NO se pide aca. Lo pide el .asi: el motor tiene
    // CAEWeaponAudioEntity::WeaponReload con la tabla de sonidos por tipo de arma, y
    // el .asi es el unico de los dos lados que sabe resolver el padre, que es lo que
    // el motor exige para elegir el sfx. El modulo solo pone RECARGANDO y el .asi ve
    // el estado y llama al motor.
    log("[Weapons] recargar: " + magId + " -> tipo " + tipo + " | " + n + "/" + cap +
        " | quedan " + (fila.ammo - n) + " en el cargador perdido");
    return true;
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
            cap: Engine.clipCapacityOf(def.weaponType)
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

    var def = defDeArma(DEBUG_ITEM_ARMA);
    var magId = def ? cargadorDe(DEBUG_ITEM_ARMA) : null;
    if (!def || !magId) {
        log("[Weapons] prueba: el catalogo no tiene " + DEBUG_ITEM_ARMA + " con cargador");
        return;
    }

    // Un cargador nuevo, con las balas que trae de fabrica.
    query(ITEMS_STORE_WEAPON, { id: magId, salud: 100, ammo: CARGADORES[magId].clipSize });
    query(ITEMS_STORE_WEAPON, { id: DEBUG_ITEM_ARMA, salud: 100, ammo: 0 });
    equipar(DEBUG_ITEM_ARMA);

    log("[Weapons] prueba: " + DEBUG_ITEM_ARMA + " (tipo " + def.weaponType +
        ") y " + magId + " en el inventario. Desnuda: apretá la R.");
}

var DEBUG_ITEM_ARMA = "colt45";