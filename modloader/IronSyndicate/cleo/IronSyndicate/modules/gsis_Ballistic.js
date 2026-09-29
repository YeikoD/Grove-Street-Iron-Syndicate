// GSIS - Ballistic
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Ballistic - Equipo (armas en slot) + recarga por cinturon de cargadores
// ============================================================================
// EQUIPO — para que un arma este en un slot de GTA tiene que estar equipada
// desde el inventario (InventoryMenu → equipWeapon). Registro persistido:
// GameState.Ballistic.equipped[slot] = { id, hasMag, salud }.
//
// `salud` esta en el registro porque el arma equipada no esta en items[]: es el
// unico sitio donde puede vivir su salud sin que se pierda al desequipar. No es
// lo mismo que el `ammo`, que tampoco esta y se lee del ped, y por el mismo
// motivo: lo equipado vive en la memoria del juego y lo que el mod guarda es el
// resto de su estado. La salud todavia no se desgasta (no hay regla que la baje),
// asi que hoy es de ida y vuelta sin cambios; el campo queda porque el registro
// es lo que sobrevive a guardar/cargar.
//   - equipWeapon(itemId): items:takeWeapon (sale del inventario) →
//     _giveWeapon (REQUEST_MODEL + LOAD_ALL_MODELS_NOW + GIVE_WEAPON_TO_CHAR,
//     el orden que pide el doc de 01B2) con el estado de la instancia
//     (hasMag/ammo) + clip en memoria. Si el slot ya tiene otra arma → se
//     desequipa sola (auto-swap).
//   - unequipWeapon(slot): REMOVE_WEAPON_FROM_CHAR con la municion viva del
//     ped → items:storeWeapon (vuelve al inventario con su estado).
//   - _reconcileLoadout() cada frame: arma de catalogo en el ped SIN registro
//     (mision, cheat, save viejo) → se adopta al inventario; entrada sin arma
//     en el ped → se limpia; coincidencia → municion normalizada (nunca mas de
//     un cargador). Solo corre con control de jugador (las armas de cutscene
//     se adoptan al terminar). Melee/granadas/camara: fuera del catalogo.
// R (KEYS.RELOAD) → tryReload():
//   1. arma equipada → su cargador (getMagIdByWeaponId); melee/granadas salen
//   2. query("items:swapMagazine", { magId, ammo, mounted }): sale del
//      CINTURON (MISC.MAG_BELT_SLOTS casillas, solo cargadores equipados) el
//      de mas balas y la casilla queda con el montado (0 si se vacio); con
//      "mounted: false" la casilla queda libre (arma descargada)
//   3. sin recambio → query("items:extractMagazine"): el cargador montado pasa
//      al inventario, el arma queda sin cargador (0/0, MAG_OUT) y corre la
//      misma anim de recarga. Si el arma ya esta sin cargador o no cabe en el
//      inventario → NO_MAG / INV_FUL
//   4. SET_CHAR_AMMO(total = cargador nuevo) + anim nativa de recarga
//      Watchdog: si el engine no sale de RELOADING (state 2) al vencer el
//      deadline + TIMERS.RELOAD_GRACE, lo forzamos (clip = min(cap, total),
//      state = READY) — si no, CWeapon::Fire devuelve false y el arma queda
//      muda (estado RELOADING eterno por empujon del deadline en Update).
// Invariante: m_TotalAmmo (nativo) = balas del cargador montado, asi que el
// cargador montado NO esta en el inventario ni en el cinturon; su estado viaja
// en el save del juego mientras el arma esta equipada. hasMag del registro
// distingue "cargador vacio montado" (0 balas) de "sin cargador".
// Peso: lo equipado (arma en slot o cargador en cinturon) sale de items[] y
// por tanto no pesa.
// Test: al cambiar de slot → showTextBox (sin rellenar munición).
// Init: syncClipSizes() → CWeaponInfo.m_nAmmoClip = WEAPON_DATA.clipSize.
// Nativos CLEO+: GET_CURRENT_CHAR_WEAPONINFO (0E83), GET_WEAPONINFO (0E84),
// GET_WEAPONINFO_SLOT (0E8A), GET_WEAPONINFO_TOTAL_CLIP (0E88),
// GET_CURRENT_CHAR_WEAPON (0470), GET_AMMO_IN_CHAR_WEAPON (041A),
// SET_CHAR_AMMO (017B), GET_PED_POINTER (0A96), IS_CHAR_DEAD (0118),
// IS_PLAYER_CONTROL_ON (09E7), GET_WEAPONINFO_FLAGS (0E86),
// GIVE_WEAPON_TO_CHAR (01B2), REMOVE_WEAPON_FROM_CHAR (0555),
// HAS_CHAR_GOT_WEAPON (0491), SET_CURRENT_CHAR_WEAPON (01B9),
// REQUEST_MODEL (00A7), LOAD_ALL_MODELS_NOW (0952).
// Memory.WriteU16 → CWeaponInfo+0x20 (m_nAmmoClip).
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { query } from "../core/gsis_EventBus.js";
import { registerModule, getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { KEYS, TIMERS, SPECIAL_MODELS, PLUGIN_WEAPON_RANGE } from "../core/gsis_Config.js";
import { keyJustPressed } from "../core/gsis_Input.js";
import { t } from "../core/gsis_L10n.js";
    import { WEAPON_DATA, WEAPON_ID_NATIVE_MAX, CLIP_SOURCE_ENGINE, MODEL_SOURCE_SPECIAL, getModelIdByWeaponId, getModelSourceByWeaponId, getMagIdByWeaponId, getMagIdsByWeaponId, getClipSizeByItemId, getClipSizeByWeaponId, getWeaponByItemId, getWeaponByWeaponId } from "../data/gsis_weapon_data.js";
import { SALUD_MAX, clampSalud } from "../data/gsis_item_data.js";
// El sistema de familias. Aca esta la costura entre "el item que tiene el
// jugador" (colt45, uno solo) y "el weaponType que ejecuta el motor" (22, 60, 23
// o 61 segun la configuracion). Ver la seccion CONFIGURACION DE ARMA.
import { resolveWeaponType, getVariantProfile, getVariantByWeaponType,
         isAttachmentCompatible, getAttachmentById, getPluginWeaponTypes,
         validateVariants, WEAPON_VARIANTS } from "../data/gsis_weapon_variants.js";

var _CLIP_OFF = 0x20; // m_nAmmoClip en CWeaponInfo (uint16)
// m_modelId en CWeaponInfo (int32). 0x0C sale de la cabecera de FLA
// (WeaponLimits.h:365), no de un SDK.
var _MODEL_OFF = 0x0C;
var _WEAPONS_OFF = 0x5A0; // CPed::m_aWeapons (CWeapon[13])
var _SLOT_OFF = 0x718; // CPed::m_nSelectedWepSlot (uint8)
var _SLOT_COUNT = 13; // slots de arma en CPed::m_aWeapons
var _WEAPON_SIZE = 28; // sizeof(CWeapon)
var _W_STATE = 0x4; // CWeapon::m_nState (2 = RELOADING)
var _W_CLIP = 0x8; // CWeapon::m_nAmmoInClip
var _W_AMMO = 0xC; // CWeapon::m_nAmmoTotal
var _W_TIME = 0x10; // CWeapon::m_nTimeForNextShot
var _TIMER_ADDR = 0xB7CB84; // CTimer::m_snTimeInMilliseconds
var _RELOAD_TIME_FN = 0x743D70; // CWeaponInfo::GetWeaponReloadTime (thiscall, uint32)
var _STATE_RELOADING = 2;
var _STATE_OUT_OF_AMMO = 3; // Fire() tambien la bloquea (mod de arma a cero)
var _NO_ANIM = [37, 38]; // en catalogo pero sin anim de recarga (lanzallamas, minigun)
var _lastSlot = null;
var _reloadPending = null; // { ped, weapon, deadline, cap } recarga nossa en curso
// Tipos de plugin ya vistos por el reconciliador, para avisar una vez y no cada
// frame. El reconciliador corre por frame, asi que sin esto el log se llena.
var _foreignVistos = {};

// Techo de weaponId nativo. El numero vive en el dato (WEAPON_ID_NATIVE_MAX) y
// se importa de ahi, no se re-declara: dos copias del mismo techo en dos
// archivos es la forma de que un dia una diga 69 y la otra 70.
//
// Cualquier weaponId mayor es un tipo que registro un plugin (un .ASI que
// agranda CWeaponInfo::aWeaponInfo y da de alta sus variantes). El mod no lo
// conoce todavia, y eso NO es un arma invalida: es un arma real, agarrada, con su
// propio slot y su propia capacidad. Por eso el reconciliador las separa de la
// basura vanilla (melee, granadas, camara, paracaidas) en vez de borrarlas, y
// syncClipSizes no escribe en ellas. Ver gsis_WEAPONS.md §2.5, §3.1 y §3.3.
//
// El "> WEAPON_ID_NATIVE_MAX" solo, no alcanzaba. El 69 es el ultimo que reserva
// FLA, no el ultimo arma de vanilla: gsisWeaponLimiter.asi da de alta el 60, que
// cae en la franja que FLA deja libre (60..69) pero por DEBAJO del corte. Con la
// regla sola, _isCustomWeaponId(60) daba false y el reconciliador borraba el arma
// del save como si fuera basura vanilla, sin error ni log.
//
// Por eso PLUGIN_WEAPON_RANGE se SUMA a la regla y no la reemplaza: lo que era
// "> 69" sigue siendolo, asi que ningun plugin que use 80+ queda afuera.
function _isCustomWeaponId(weaponId) {
    if (weaponId >= PLUGIN_WEAPON_RANGE.FIRST && weaponId <= PLUGIN_WEAPON_RANGE.LAST) return true;
    return weaponId > WEAPON_ID_NATIVE_MAX;
}

// ============================================================================
// API - arma actual, cargador, clips del catalogo
// ============================================================================

// Lee slot / type / totalClip / ammo del arma seleccionada de CJ.
// Devuelve { char, slot, type, clip, ammo } o null si falla un native.
function _readSlotAndType() {
    try {
        var c = new Player(0).getChar();
        var weaponInfo = native("GET_CURRENT_CHAR_WEAPONINFO", c);
        if (!weaponInfo) return null;
        var slot = native("GET_WEAPONINFO_SLOT", weaponInfo);
        if (slot === null || slot === undefined) return null;
        var clip = native("GET_WEAPONINFO_TOTAL_CLIP", weaponInfo);
        var weaponType = native("GET_CURRENT_CHAR_WEAPON", c);
        var ammo = native("GET_AMMO_IN_CHAR_WEAPON", c, weaponType);
        return { char: c, slot: slot, type: weaponType, clip: clip, ammo: ammo };
    } catch (e) {
        return null;
    }
}

// setMagazine — pone la munición TOTAL del arma = balas del cargador montado.
// El clip lo rellena CWeapon::Reload() al terminar la anim (y Fire lo
// autocorrige desde el total si se interrumpe).
function setMagazine(w, ammo) {
    if (!w || !w.char) return;
    try {
        // 017B SET_CHAR_AMMO <char> <weaponType> <ammo>
        native("SET_CHAR_AMMO", w.char, w.type, ammo);
    } catch (e) { /* native fallido: el engine rellena desde el total */ }
}

// ============================================================================
// EQUIPO - registro de armas en slot (persistido en GameState)
// ============================================================================

// getEquipped — { [slotGta]: { id, hasMag } } de las armas en el ped
export function getEquipped() {
    var data = getModuleData("Ballistic");
    return (data && data.equipped) ? data.equipped : {};
}

// getEquippedAmmo — munición VIVA del arma de ese slot, leída del ped.
//
// El registro no la guarda: data.equipped es { id, hasMag } y nada mas. Por eso
// la fila del arma equipada en el inventario salia con guion en vez de sus
// balas, y por eso esto se lee del juego y no del save.
//
// Se usa el mismo native que unequipWeapon (GET_AMMO_IN_CHAR_WEAPON), que
// responde por tipo de arma y no por el arma en la mano: asi anda para cualquier
// slot que el jugador tenga encima.
//
// Devuelve:
//   0    el arma no tiene cargador. No es un "no se": _reconcileLoadout le pone
//        0 al arma en ese caso, asi que 0 es lo que de verdad tiene.
//   null  no se pudo leer. La pagina lo dibuja como guion, y es la respuesta
//        honesta: un 0 seria mentira, diria que el cargador esta vacio cuando en
//        realidad no lo sabemos.
export function getEquippedAmmo(slot) {
    var entry = getEquipped()[slot];
    if (!entry) return null;
    if (entry.hasMag === false) return 0;
    var wd = _weaponDefByItemId(entry.id);
    if (!wd) return null;
    var c = _playerChar();
    if (!c) return null;
    try {
        // Por el TIPO QUE ESTA MONTADO, no por el de la familia. Una colt45 con
        // cargador de 15 esta en el slot con el weaponType 60, y preguntar por el
        // 22 (que es lo que dice wd.weaponId) devuelve 0: la fila de municion del
        // arma muestra guion de balas en una pistola que tiene 15.
        return native("GET_AMMO_IN_CHAR_WEAPON", c, _tipoEnPies(entry, wd)) || 0;
    } catch (e) {
        return null;
    }
}

// ============================================================================
// CONFIGURACION DE ARMA - familia, accesorios y weaponType
// ============================================================================
// El weaponType de GTA no es la identidad de un arma: es la REPRESENTACION que
// el motor necesita para ejecutar una configuracion concreta. La identidad es la
// familia, y las configuraciones de la familia son las variantes.
//
// Antes, WEAPON_DATA ataba las dos: un item de inventario era un weaponId, y eso
// obligaba a que "Colt .45", "Colt .45 silenciada" y "Colt .45 con cargador de 15"
// fueran TRES items en el collar. Ahora son un item y cuatro representaciones.
//
// QUE CAMBIA Y QUE NO
//
//   NO cambia: el inventario sigue teniendo una sola "colt45". Montar o sacar un
//   accesorio no crea ni borra un item, y el id del arma no cambia.
//
//   SI cambia: el weaponType que el ped tiene en la mano. Sacar el silenciador
//   lleva de 23 a 22, y eso SI es un REMOVE_WEAPON + GIVE_WEAPON, porque el
//   motor tiene un CWeapon por slot y su tipo es parte de la identidad. No hay
//   forma deAvoidlo sin reescribir la CWeapon del ped a mano, que es peor.
//
// El WeaponInstance es { id, hasMag, attachments }: el item mas lo que tiene
// montado. `attachments` es una lista de ids ORDENADA (la ordena el resolver), y
// se guarda en el save. Se guarda la CONFIGURACION y no el weaponType, por dos
// razones: el weaponType se renumera solo cuando cambia WEAPON_VARIANTS, y un
// save que guarde el numero queda con un arma distinta al cambiar la tabla.

// -------- WeaponInstance --------

// Una instancia nueva para un item recien equipado: familia del item, sin
// accesorios. null si el item no es de ninguna familia, y null significa "arma de
// una sola configuracion" para todo el codigo de abajo.
export function newInstance(itemId) {
    var wd = getWeaponByItemId(itemId);
    if (!wd || !wd.family) return null;
    return { id: itemId, family: wd.family, attachments: [] };
}

// Los accesorios montados de una instancia. Array vacio si no es de una familia,
// para que el llamador pueda iterar sin preguntar.
export function getAttachments(instancia) {
    return (instancia && instancia.attachments) ? instancia.attachments : [];
}

// Cambia la lista de accesorios de una instancia y devuelve el weaponType que le
// corresponde, o null si la combinacion no existe.
//
// NO muta la instancia. Devuelve la lista nueva y el tipo, y es el llamador
// quien la guarda: una funcion que muta su argumento y devuelve un codigo de
// error deja al llamador sin poder distinguir entre "no se pudo" y "quedo como estado".
export function configure(instancia, attachments) {
    if (!instancia || !instancia.family) return null;
    var copia = (attachments || []).slice();

    // Un accesorio repetido no es una configuracion. Sin este chequeo, montar
    // dos veces el mismo silenciador daba una clave distinta y el resolver
    // devolvia null por un motivo que el jugador no puede ver.
    var vistos = {};
    for (var i = 0; i < copia.length; i++) {
        if (vistos[copia[i]]) {
            log("[Ballistic] WARN: " + instancia.family + " con " + copia[i] +
                " dos veces. No es una configuracion valida.");
            return null;
        }
        vistos[copia[i]] = true;
    }

    var tipo = resolveWeaponType(instancia.family, copia);
    if (tipo === null) {
        log("[Ballistic] WARN: no se puede configurar " + instancia.family +
            " con [" + copia.join(", ") + "]. La variante no esta declarada.");
        return null;
    }
    return { attachments: copia, weaponType: tipo };
}

// -------- Montar y desmontar --------

// Montar un accesorio sobre el arma EQUIPADA de ese slot.
//
// Devuelve:
//   { ok: true,  weaponType, instance }   el accesorio quedo montado
//   { ok: false, motivo }                no se pudo, y por que
//
// La razon de que sea UN arma equipada y no cualquier arma del inventario: el
// weaponType cambia lo que el motor ejecuta, y el motor solo ejecuta lo que el
// ped tiene en la mano. Montar un silenciador a una colt45 que esta en el baul
// no tendria ningun efecto observable hasta que se equipe, y para entonces el
// jugador ya se olvido de que lo monto.
export function attachAccessory(charId, slot, attachmentId) {
    var data = _ballisticData();
    var entry = data.equipped[slot];
    if (!entry) return { ok: false, motivo: "no hay arma equipada en el slot " + slot };

    var inst = _instanceOf(entry);
    if (!inst) return { ok: false, motivo: "esa arma no pertenece a ninguna familia" };

    var att = getAttachmentById(attachmentId);
    if (!att) return { ok: false, motivo: "el accesorio " + attachmentId + " no existe" };
    if (!isAttachmentCompatible(attachmentId, inst.family)) {
        return { ok: false, motivo: attachmentId + " no va en " + inst.family };
    }

    var actual = getAttachments(inst);
    if (actual.indexOf(attachmentId) !== -1) {
        return { ok: false, motivo: "ya esta montado" };
    }

    var nuevo = actual.concat([attachmentId]);
    return _aplicarConfiguracion(charId, slot, entry, inst.family, nuevo, "montar " + attachmentId);
}

// Sacar un accesorio del arma equipada de ese slot. Simetrico de attach.
export function detachAccessory(charId, slot, attachmentId) {
    var data = _ballisticData();
    var entry = data.equipped[slot];
    if (!entry) return { ok: false, motivo: "no hay arma equipada en el slot " + slot };

    var inst = _instanceOf(entry);
    if (!inst) return { ok: false, motivo: "esa arma no pertenece a ninguna familia" };

    var actual = getAttachments(inst);
    var quedan = [];
    for (var i = 0; i < actual.length; i++) {
        if (actual[i] !== attachmentId) quedan.push(actual[i]);
    }
    if (quedan.length === actual.length) {
        return { ok: false, motivo: "no tiene " + attachmentId + " montado" };
    }

    return _aplicarConfiguracion(charId, slot, entry, inst.family, quedan, "sacar " + attachmentId);
}

// El cuerpo comun de montar y sacar.
//
// Lo delicateo es la MUNICION. Cambiar el weaponType es un REMOVE + GIVE, y el
// GIVE arranca con el arma vacia: si no se lee la municion antes y no se
// escribe despues, montar un silenciador hace que el jugador pierda el cargador
// que tenia puesto. Y la operation inversa de la de quitar tambien.
//
// Ojo con el orden: primero se RESUELVE la configuracion (que puede fallar y no
// toca nada), despues se lee la municion, despues se cambia el arma, y recien ahi
// se escribe el estado. Si se escribiera el registro antes de confirmar que el
// motor acepto el give, un fallo dejaria el save diciendo que el silenciador esta
// montado y el arma sin silenciador.
function _aplicarConfiguracion(charId, slot, entry, family, attachments, que) {
    var cfg = configure({ family: family }, attachments);
    if (!cfg) return { ok: false, motivo: "la configuracion no existe" };

    var viejo = entry.variantWeaponType || entry.weaponType || null;
    if (viejo === cfg.weaponType) {
        return { ok: true, weaponType: cfg.weaponType, instance: entry, sinCambio: true };
    }

    var wd = getWeaponByItemId(entry.id);
    if (!wd) return { ok: false, motivo: "el item " + entry.id + " no esta en el catalogo" };

    // La municion se lee por el TIPO NUEVO de la columna? No: por el viejo. Es
    // la que tiene el ped ahora, y es la que hay que conservar.
    var ammo = 0;
    var c = _playerChar();
    if (c && viejo !== null) {
        try { ammo = native("GET_AMMO_IN_CHAR_WEAPON", c, viejo) || 0; } catch (e) { ammo = 0; }
    }

    // Cambio de tipo: el motor no tiene "cambiar el arma", tiene "dar" y "quitar".
    if (viejo !== null) {
        try { native("REMOVE_WEAPON_FROM_CHAR", c, viejo); } catch (e) { }
    }
    _ensureWeaponModel(cfg.weaponType);
    try {
        native("GIVE_WEAPON_TO_CHAR", c, cfg.weaponType, ammo);
        native("SET_CURRENT_CHAR_WEAPON", c, cfg.weaponType);
    } catch (e) {
        return { ok: false, motivo: "el motor no acepto el tipo " + cfg.weaponType };
    }

    // Capacidad de la configuracion nueva ANTES de normalizar: el motor ya tiene
    // una CWeaponInfo con el clip del .asi, y _aplicarCapacidad lo pone al del
    // cargador que quedo.
    var addr = _weaponAddrByType(_pedPointer(c), cfg.weaponType);
    if (addr) {
        var cap = getClipSizeByWeaponId(cfg.weaponType) || 0;
        if (cap > 0) {
            Memory.WriteI32(addr + _W_CLIP, Math.min(ammo, cap), false);
            Memory.WriteI32(addr + _W_AMMO, ammo, false);
        }
    }

    // Recien ahora el registro. Antes de esto nada del save cambio.
    entry.attachments = cfg.attachments;
    entry.variantWeaponType = cfg.weaponType;
    setModuleData("Ballistic", data);

    log("[Ballistic] " + que + ": " + entry.id + " -> tipo " +
        cfg.weaponType + " (era " + viejo + ") | [" + cfg.attachments.join(", ") + "]");

    return { ok: true, weaponType: cfg.weaponType, instance: entry };
}

// -------- Lectura de la instancia desde el registro --------

// El WeaponInstance de lo que hay en un slot del registro.
//
// El registro guarda weaponType en algunos slots viejos y el item en todos. La
// precedencia es: attachments si estan guardados, si no la variante que
// declara el weaponType guardado, si no la variante base de la familia.
//
// El caso del medio es el que hace que un save viejo siga funcionando: antes de
// este refactor el registro guardaba el weaponType, y un save con "colt45" y
// weaponType 23 significa "colt45 con silenciador" aunque nadie lo haya escrito
// como attachment. Sin esa capa, cargar un save viejo deja el silenciador
// montado para siempre y no hay forma de sacarlo.
function _instanceOf(entry) {
    if (!entry) return null;
    var wd = getWeaponByItemId(entry.id);
    if (!wd || !wd.family) return null;
    return {
        id: entry.id,
        family: wd.family,
        attachments: entry.attachments || null
    };
}

// Los accesorios que TIENE montados, resolviendo desde el weaponType si el
// registro no los guarda. Devuelve una lista nueva.
export function resolveAttachmentsOf(entry) {
    if (!entry) return [];
    var wd = getWeaponByItemId(entry.id);
    if (!wd || !wd.family) return [];
    if (entry.attachments) return entry.attachments.slice();

    // Sin attachments guardados: deducir del weaponType registrado.
    var tipo = entry.variantWeaponType || entry.weaponType || wd.weaponId;
    var v = getVariantByWeaponType(tipo);
    if (v && v.family === wd.family) return (v.attachments || []).slice();

    // Y si tampoco hay weaponType, la variante base: sin accesorios.
    return [];
}

// ============ Fin CONFIGURACION DE ARMA ============
// ============================================================================
// DIRECCION DE TRABAJO
// ============================================================================
// Copia de lectura de SaveManager. Aparte de equipped, guarda la CONFIGURACION
// de cada arma: que familia es y que accesorios tiene montado. Eso es lo que
// sobrevive a un cambio de weaponType, y por eso no se deduce del tipo.
//
// Ver CONFIGURACION DE ARMA mas arriba.

// ¿Este weaponType es una representacion de esa familia?
//
// La regla de pertenencia, y por que no es "comparar con el weaponId del item":
// el item es la FAMILIA y la familia tiene N representaciones. Con una sola
// variante, la familia tiene un tipo y esto es exactamente lo de antes. Con
// varias, el arma registrada puede estar en cualquiera de ellas.
//
// El caso que NO entra aca: un item sin familia (las armas que todavia no se
// migraron) cae al weaponId del item, o sea el comportamiento de siempre.
function _typeBelongsTo(wd, weaponType) {
    if (!wd) return false;
    if (wd.weaponId === weaponType) return true;
    if (!wd.family) return false;
    var v = getVariantByWeaponType(weaponType);
    return !!(v && v.family === wd.family);
}

// El weaponType que el ped tiene REALMENTE en la mano, para la entrada del
// registro de un slot.
//
// Por que hace falta: `_weaponDefByItemId(entry.id)` devuelve la fila de la
// FAMILIA, y en esa fila `weaponId` es la variante BASE. La colt45 tiene
// weaponId 22, pero un ped con el cargador de 15 montado tiene el 60, y con el
// silenciador el 23.
//
// Y `wd.weaponId` a secas es un error silencioso, no un detalle:
//
//   unequipWeapon con una colt45 de 15 en la mano
//     GET_AMMO_IN_CHAR_WEAPON(c, 22)      -> 0, porque el 22 no esta en el ped
//     REMOVE_WEAPON_FROM_CHAR(c, 22)      -> no quita nada, el que esta es el 60
//     HAS_CHAR_GOT_WEAPON(c, 22)          -> false, "salio del ped"
//
//   Y el mod cree que el arma se fue: la guarda en el inventario CON CERO BALAS
//   y borra la entrada del registro, mientras el 60 sigue fisicamente en la mano
//   del ped. El arma esta en los dos sitios y el cargador de 15 desaparece con
//   las 15 balas.
//
// La prelación es: la variante guardada en el registro, si esta; si no, el
// weaponType guardado en el registro (saves viejos); si no, la variante base.
// Un item sin familia cae al weaponId del item, que es el comportamiento de
// siempre.
function _tipoEnPies(entry, wd) {
    if (entry && entry.variantWeaponType !== null && entry.variantWeaponType !== undefined) {
        return entry.variantWeaponType;
    }
    if (entry && entry.weaponType !== null && entry.weaponType !== undefined) {
        return entry.weaponType;
    }
    return wd ? wd.weaponId : 0;
}

function _ballisticData() {
    var data = getModuleData("Ballistic");
    if (!data) data = {};
    if (!data.equipped) data.equipped = {};
    // Armas que dio de alta un plugin (weaponId >= 70) y el mod todavia no
    // conoce. Viven en un mapa APARTE a proposito: data.equipped tiene una
    // forma que consumen getEquippedAmmo, equipWeapon, unequipWeapon, la UI y
    // el bolso, y meterle una forma nueva los obliga a todos a saber que
    // existe. Afuera, no hay nada que ajustar ni nada que se pueda romper.
    // Ver gsis_WEAPONS.md §3.3.
    if (!data.foreign) data.foreign = {};
    return data;
}

// Puntero del ped, o 0. Lo usan las operaciones que escriben en CWeapon y
// necesitan la direccion del ped sin pasar por un charId.
function _pedPointer(charId) {
    try {
        var c = (charId !== undefined && charId !== null) ? charId : _playerChar();
        if (c === null || c === undefined) return 0;
        var p = native("GET_PED_POINTER", c);
        return p || 0;
    } catch (e) {
        return 0;
    }
}

// Ficha del catalogo por itemId (null si no es arma equipable).
// El filtro de "equipable" es tener weaponId y slot: un cargador no tiene de
// las dos, y un slot 0/undefined tambien lo saca. Ver gsis_WEAPONS.md §3.4
// (kind) — la idea de que que es un cargador no se va a resolver por nulidades
// sino por un kind explicito.
function _weaponDefByItemId(itemId) {
    if (!itemId) return null;
    var wd = getWeaponByItemId(itemId);
    if (!wd || wd.weaponId === null || wd.weaponId === undefined || !wd.slot) return null;
    return wd;
}

// itemId de catalogo para un weaponId (22 → "9mm"); null si no esta en catalogo
function _itemIdByWeaponId(weaponType) {
    var wd = getWeaponByWeaponId(weaponType);
    return wd ? wd.itemId : null;
}

// Char del jugador o null
function _playerChar() {
    try {
        return new Player(0).getChar();
    } catch (e) {
        return null;
    }
}

// Dirección de CWeapon de un weaponId en el ped (0 si no esta montado)
function _weaponAddrByType(ped, weaponType) {
    for (var i = 1; i < _SLOT_COUNT; i++) {
        var addr = ped + _WEAPONS_OFF + i * _WEAPON_SIZE;
        if (Memory.ReadI32(addr, false) === weaponType) return addr;
    }
    return 0;
}

// Un modelo custom de arma tiene que estar en SU rango, que no es el de los
// personajes: un ID de modelo es un puntero a un modelo, no una etiqueta, y si
// dos cosas toman el mismo, la segunda pisa a la primera. Un id fuera de los dos
// rangos suele ser un typo; uno dentro del rango de personajes es una colision
// directa. Los dos se avisan al init (una vez) en vez de fallar en juego, que es
// como un arma invisible se descubre tarde.
// ============================================================================
// CONTRATO DE VARIANTES - el cruce con el .asi
// ============================================================================
// El .dat lo lee SOLO el .asi, en su DllMain. Este modulo no abre archivos, y no
// hay forma de que lea el .dat desde CLEO sin meter una API de lectura que el
// mod no tiene.
//
// Asi que el contrato se verifica en dos partes, y conviene saber cual es cual:
//
//   1. Lo que se puede verificar aca: que WEAPON_VARIANTS sea consistente. Eso
//      lo hace validateVariants() y son errores de este lado.
//
//   2. Lo que NO se puede verificar desde aca: que el .asi haya dado de alta los
//      tipos que este lado declara. Para eso se imprime el .dat QUE DEBERIA
//      tener el .asi, linea por linea, y se compara con el log del .asi
//      (gsis_limiter.txt). Es una verificacion manual, y se dice.
//
// La alternativa —exportar una funcion del .asi para que el mod la llame y le
// pregunte— es la correcta, y es exactamente lo que se pidio para la fase 2. Es
// tambien lo que hace que esto deje de ser manual: el .asi podria responder
// "tengo el 60 y el 61, con estos parent y estos clip".
//
// Por que el .asi no lee WEAPON_VARIANTS: son dos languages y un archivo cada
// uno. La fuente de verdad son las tablas, y mientras no haya un puente el
// chequeo cruzando logs es lo unico que hay. La duplicacion es real y por eso
// este log existe: para que cuando diverjan, la culpa sea de una linea y no de
// una tarde.
function _validateVariantContract() {
    // Parte 1: consistencia interna. validateVariants no loguea porque el
    // modulo de variantes es un modulo de datos puro.
    var problemas = validateVariants();
    for (var i = 0; i < problemas.Length; i++) {
        log("[Variantes] ERROR: " + problemas[i]);
    }

    // Parte 2: el .dat que el .asi deberia tener.
    //
    // Se imprime con el MISMO formato que el parser del .asi, para que se pueda
// copiar y pegar. Y se distinguen cuales son de plugin y cuales no.
    var tipos = getPluginWeaponTypes();
    if (!tipos.length) {
        log("[Variantes] ninguna variante de plugin: el .asi no necesita tipos nuevos.");
        return;
    }
    log("[Variantes] " + tipos.length + " variante(s) de plugin. El .asi deberia tener estas lineas en gsis_weapons.dat:");
    for (var j = 0; j < WEAPON_VARIANTS.length; j++) {
        var v = WEAPON_VARIANTS[j];
        if (!v.parent) continue;
        var f = getVariantProfile(v.weaponType);
        log("[Variantes]   " + v.weaponType + " " + v.parent + " " +
            (f ? f.modelId : "?") + " " + (f ? f.slot : "?") + " " +
            (f ? f.clipSize : "?") + " -1" +
            "   (" + v.family + (v.attachments.length ? " + " + v.attachments.join("+") : "") + ")");
    }
    log("[Variantes] verificar contra gsis_limiter.txt: si el .asi no dice 'dado de alta: tipo N', esa variante no existe en el juego.");
}

// Como se llama un archivo para que el juego lo encuentre.
//
// Esto es una caja negra y no se resuelve leyendo el codigo: los actores pasan
// "fam5" para models\fam5.dff, o sea el nombre pelado, y no hay forma de saber
// que acepta para un archivo DOS NIVELES mas abajo.
//
// Adivinar desde aca es adivinar. Un intento fallido en el log no dice cual de
// los formatos era el bueno, y probar de a uno obliga a arrancar el juego por
// cada intento. La alternativa es que el cargador examine los candidatos y
// ASIENTE en el log el que funciona: una corrida lo resuelve y queda escrito.
//
// El orden es el que dice "cada vez mas specfico al ultimo". Si el buscador
// aceptara cualquier subcarpeta, el nombre pelado bastaria y el camino entero
// seria innecesario — que es exactamente lo que hay que comprobar primero.
function _nombresCandidatos(dff) {
    var sinExt = dff.replace(/\.dff$/i, "");
    var conBarra = sinExt.replace(/\\/g, "/");
    var conBackslash = sinExt.replace(/\//g, "\\");
    var partes = conBarra.split("/");
    var pelado = partes[partes.length - 1];
    // Sin la primera carpeta: por si el buscador cuelga de models\<algo>\ y no
    // de models\.
    var sinPrimera = partes.slice(1).join("/");
    var candidatos = [
        conBarra,                 // weapons/colt45/colt45_c15
        conBackslash,             // weapons\colt45\colt45_c15
        sinPrimera,               // colt45/colt45_c15
        pelado                    // colt45_c15
    ];
    // Sin repetidos y en orden: el mismo nombre dos veces no aporta nada y hace
    // que el log diga que probo cinco cosas cuando probo cuatro.
    var out = [];
    for (var i = 0; i < candidatos.length; i++) {
        if (candidatos[i] && out.indexOf(candidatos[i]) === -1) out.push(candidatos[i]);
    }
    return out;
}

// El .txd que va con un .dff. El comando recibe los dos por separado, asi que
// el nombre del txd sale del del dff y no hay que mantenerlo a mano en la tabla.
function _nombreTxd(dff) {
    return dff.replace(/\.dff$/i, ".txd");
}

// ============================================================================
// MODELOS DE ARMA PROPIOS
// ============================================================================
// Cargar un .dff con su .txd y quedarse con el modelId que devuelve el juego:
//
//   LOAD_SPECIAL_MODEL(dff, txd) -> modelId      (0F00, clase Streaming)
//
// QUE HACE DISTINTO DE TODO LO QUE HABIA ANTES
//
// El comando ASIGNA el modelId. No lo elegimos nosotros, no vive en
// WEAPON_RANGE y no hay que reservarlo. Por eso la tabla WEAPON_MODELS no
// tiene claves numericas: tiene nombres, y las variantes los referencian por
// nombre. El nombre es estable y esta escrito a mano; el ID lo pone el juego.
//
// La version anterior de esto fijaba un ID a mano y usaba
// LOAD_SPECIAL_CHARACTER_FOR_ID, que si lo permite. Se podia hacer, pero obligaba
// a que el mismo numero estuviera en el .dat, en el Config y en
// WEAPON_VARIANTS, y a que divergieran sin que nada lo dijera. Con 0F00 no hay
// numero que sincronizar.
//
// "cutscene object", segun el doc. El punto importante es el ultimo parrafo: el
// clump se trata como cualquier otro modelo, asi que HAS_MODEL_LOADED lo
// verifica y LOAD_ALL_MODELS_NOW lo fuerza. Y las mayusculas las baja el juego
// solo, asi que los nombres van en minuscula.
var _modelosArma = {};   // nombre -> modelId que devolvio el juego

// EL TIMEOUT DE 2 SEGUNDOS, Y POR QUE LA CARGA NO ESTA EN EL INIT
//
// CLEO+ da 2 segundos por ejecucion de script, y el index.js corre TODO el
// initAll() dentro de una sola. Cargar un modelo con LOAD_SPECIAL_MODEL es
// una llamada al juego que entra al streamer, y con cuatro nombres candidatos
// mas el LOAD_ALL_MODELS_NOW final, la carga se comia el presupuesto entero y el
// script moria con "has timed out after the default timeout of 2 seconds".
//
// El sintoma era que el mod no arrancaba: no fallaba UNA cosa, fallaba todo lo
// que venia despues, porque initAll() se cortaba a mitad.
//
// Asi que la carga es una COLA que se drena de a un paso por frame desde
// update(), no un bloque en init(). El init sigue siendo instantaneo y el
// modelo esta cargado a los pocos frames — mucho antes de que el jugador pueda
// sacar un arma del inventario.
//
// Consecuencia aceptable: durante esos pocos frames un arma con modelo propio
// se puede dar y salir invisible. Se arregla sola cuando termina la cola, que
// escribe el modelId en la CWeaponInfo de las variantes. El fallo es visible y
// dura menos de un segundo; la alternativa —cargar en el init— es que el mod no
// arranque nunca.
var _carga = null;

// Prepara la cola. NO ejecuta nada: solo arma los pasos.
function _cargarModelosDeArma() {
    // Apagado por default. Ver WEAPON_MODELS.ENABLED en gsis_Config.js: la
    // carga entra al streamer y el modo de fallo de que sea lenta no es "el
    // modelo no carga", es "el script se corta y el mod entero parece roto".
    //
    // Se avisa igual, una vez, porque un flag apagado en silencio es un flag que
    // nadie va a mirar.
    // El flag es WEAPON_MODELS_ENABLED, NO SPECIAL_MODELS.ENABLED. Ese segundo
    // es el de los PERSONAJES (los que usan fam5) y apagarlo ahi deja a los
    // dealers sin modelo. Ya paso una vez: se confundo el nivel y el mod
    // crasheo con los actores en esferas.
    if (SPECIAL_MODELS.WEAPON_MODELS_ENABLED === false) {
        log("[ModelosArma] DESACTIVADO (WEAPON_MODELS_ENABLED = false). " +
            "La Colt .45 con cargador de 15 sale con el modelo de vanilla.");
        return;
    }
    var tabla = SPECIAL_MODELS.WEAPON_MODELS;
    if (!tabla) {
        log("[ModelosArma] sin tabla WEAPON_MODELS: no hay modelos propios que cargar.");
        return;
    }
    var nombres = [];
    for (var clave in tabla) {
        if (Object.prototype.hasOwnProperty.call(tabla, clave)) nombres.push(clave);
    }
    nombres.sort();
    if (!nombres.length) return;

    _carga = {
        tabla: tabla,
        nombres: nombres,
        i: 0,          // modelo en curso
        c: 0,          // candidato en curso
        id: 0,
        elegido: null,
        probados: [],
        cargados: 0,
        paso: 0        // 0 = intentos, 1 = LOAD_ALL_MODELS_NOW, 2 = cerrar
    };
    log("[ModelosArma] " + nombres.length + " modelo(s) en cola (se cargan por frame).");
}

// Un paso por frame. El nombre es `_paso` y no `_update` a proposito: update
// corre en un loop y esto no puede correr cada frame para siempre.
function _pasoCargaModelos() {
    if (!_carga) return;
    var c = _carga;

    if (c.paso === 1) {
        // FASE B: la carga real, UNA vez por modelo, con el nombre que la fase A
        // confirmo. Probar formatos CARGANDO es lo que mataba el frame: un
        // nombre que no existe hace que el streamer lo busque por todo el arbol
        // de datos. Consultar (fase A) y cargar (fase B) son operaciones de
        // coste distinto y no se mezclan.
        var mb = c.tabla[c.nombres[c.i]];
        var id = 0;
        try {
            id = native("LOAD_SPECIAL_MODEL", c.nombre, _nombreTxd(c.nombre)) | 0;
        } catch (e) {
            log("[ModelosArma] ERROR LOAD_SPECIAL_MODEL '" + c.nombre + "': " + e.message);
            id = 0;
        }
        if (id) {
            _modelosArma[c.nombres[c.i]] = id;
            c.cargados++;
            log("[ModelosArma] " + c.nombres[c.i] + " -> modelId " + id + "  ('" + c.nombre + "')");
        } else {
            log("[ModelosArma] WARN " + c.nombres[c.i] + ": el juego DECLARO que '" +
                c.nombre + "' existe pero LOAD_SPECIAL_MODEL devolvio 0.");
        }
        c.i++; c.c = 0; c.nombre = null; c.probados = [];
        c.paso = (c.i >= c.nombres.length) ? 2 : 0;
        return;
    }

    if (c.paso === 2) {
        _aplicarModelosAVariantes();
        log("[ModelosArma] " + c.cargados + " de " + c.nombres.length +
            " modelo(s) propio(s) cargado(s).");
        _carga = null;
        return;
    }

    // ---- FASE A: encontrar el nombre correcto. Consulta BARATA.
    //
    // IS_MODEL_AVAILABLE_BY_NAME no carga nada, solo mira si el archivo esta. Por
    // eso los cuatro formatos se pueden probar en un MISMO frame: son
    // consultas, no cargas. Y por eso los cuatro salen juntos en el log, que
    // es lo que hace falta para corregir la ruta sin adivinar.
    var nombre = c.nombres[c.i];
    var m = c.tabla[nombre];
    if (c.c === 0) c.probados = [];

    var candidatos = _nombresCandidatos(m.dff);
    if (c.c >= candidatos.length) {
        log("[ModelosArma] WARN " + nombre + ": el juego no encuentra " + m.dff +
            " con NINGUN formato. Probados: [" + c.probados.join(" | ") + "]");
        c.i++; c.c = 0;
        c.paso = (c.i >= c.nombres.length) ? 2 : 0;
        return;
    }

    for (; c.c < candidatos.length; c.c++) {
        var limpio = candidatos[c.c].replace(/^.*[\\/]/, "");   // el juego baja mayusculas
        var ok = false;
        try { ok = native("IS_MODEL_AVAILABLE_BY_NAME", limpio); }
        catch (e) { log("[ModelosArma] ERROR IS_MODEL_AVAILABLE_BY_NAME: " + e.message); }
        c.probados.push(limpio + (ok ? " <- SI" : ""));
        if (ok) {
            c.nombre = limpio;
            c.paso = 1;
            log("[ModelosArma] " + nombre + ": encontrado como '" + limpio + "', cargando...");
            return;
        }
    }
}

// Escribir el modelId que devolvio la carga en la CWeaponInfo de las variantes
// que lo usan.
//
// POR QUE HAY QUE HACERLO Y NO ALCANZA CON QUE EL .ASI LO PONGA
//
// El .asi clona la CWeaponInfo de forma PEREZOSA: la primera vez que el motor
// pide la ficha del tipo 60, y no al arrancar. Esa clonacion pisa m_modelId con
// lo que dice el .dat. Si el mod escribiera el ID una sola vez en el init y el
// clonara despues, la escritura del mod se pierde y el arma vuelve al modelo
// del padre — sin error, sin aviso, y solo con la primera variante equipada.
//
// Por eso se escribe ACAPARANDOSE del arma, en _ensureWeaponModel, que corre
// justo antes de darla. En ese momento el clon ya ocurrio (dar el arma pide la
// ficha) y la escritura gana.
function _aplicarModelosAVariantes() {
    for (var i = 0; i < WEAPON_VARIANTS.length; i++) {
        var v = WEAPON_VARIANTS[i];
        if (!v.model) continue;
        var id = _modelosArma[v.model];
        if (!id) continue;
        _escribirModelId(v.weaponType, id);
    }
}

// El modelId que hay que poner en la CWeaponInfo de un tipo, o 0 si no hay.
// Para un modelo propio es el que devolvio LOAD_SPECIAL_MODEL; para uno de
// vanilla, el del catalogo.
function _modelIdDeTipo(weaponType) {
    var v = getVariantByWeaponType(weaponType);
    if (v && v.model) return _modelosArma[v.model] || 0;
    return getModelIdByWeaponId(weaponType) || 0;
}

// Escribe m_modelId (offset 0x0C) en la CWeaponInfo de las cuatro skills.
//
// 0x0C es el offset del modelo en CWeaponInfo, confirmado en la cabecera de FLA
// (WeaponLimits.h:365, `int m_modelId`). Los offsets de este bloque salen de ahi
// y no de un SDK.
//
// m_modelId2 (0x10) NO se toca: en weapon.dat es -1 para la pistola y el juego
// lo usa para un segundo modelo en armas de melee combinado. Dejarlo como lo
// clono la tabla es lo que corresponde.
function _escribirModelId(weaponType, modelId) {
    if (!modelId) return false;
    var n = 0;
    for (var skill = 0; skill <= 3; skill++) {
        var info = _weaponInfoAddr(weaponType, skill);
        if (!info) continue;
        try {
            Memory.WriteI32(info + _MODEL_OFF, modelId, false);
            n++;
        } catch (e) { /* sin memoria: el modelo no se escribe */ }
    }
    return n > 0;
}

function _validateWeaponModels() {
    var rango = SPECIAL_MODELS.WEAPON_RANGE;
    var tabla = SPECIAL_MODELS.WEAPON_MODELS || {};
    if (!rango) return;

    // Parte 1: los items de WEAPON_DATA que declaran modelo de plugin.
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        var w = WEAPON_DATA[i];
        if (w.modelSource !== MODEL_SOURCE_SPECIAL) continue;
        var m = w.modelId;
        if (m === null || m === undefined) {
            log("[Ballistic] WARN: " + w.itemId + " declara modelSource 'special' pero no tiene modelId");
            continue;
        }
        if (m >= SPECIAL_MODELS.RANGE_START && m <= SPECIAL_MODELS.RANGE_END) {
            log("[Ballistic] WARN: " + w.itemId + " usa el modelId " + m +
                ", que esta en el rango de PERSONAJES (" + SPECIAL_MODELS.RANGE_START +
                "-" + SPECIAL_MODELS.RANGE_END + "): colision de ID de modelo");
        } else if (m < rango.START || m > rango.END) {
            log("[Ballistic] WARN: " + w.itemId + " usa el modelId " + m +
                ", fuera del rango de armas (" + rango.START + "-" + rango.END + ")");
        }
    }

    // Parte 2: las VARIANTES, que es donde viven hoy los modelos propios.
    //
    // El chequeo es por NOMBRE, no por numero: el modelId de un modelo propio lo
    // asigna el juego cuando lo carga (LOAD_SPECIAL_MODEL lo devuelve), asi que
    // no hay numero contra el que validar. Lo que si se puede validar es que el
    // nombre exista en la tabla y que el nombre exista en el archivo.
    for (var t = 0; t < WEAPON_VARIANTS.length; t++) {
        var v = WEAPON_VARIANTS[t];
        if (v.model) {
            if (!Object.prototype.hasOwnProperty.call(tabla, v.model)) {
                log("[Ballistic] ERROR: la variante " + v.weaponType + " (" + v.family +
                    ") pide el modelo '" + v.model + "' y NO esta en SPECIAL_MODELS.WEAPON_MODELS. " +
                    "El arma va a salir invisible. Agregalo a WEAPON_MODELS en gsis_Config.js.");
            }
            if (v.modelSource !== MODEL_SOURCE_SPECIAL) {
                log("[Ballistic] WARN: la variante " + v.weaponType + " usa el modelo propio '" +
                    v.model + "' pero no declara modelSource 'special'. Sin eso el mod lo pide " +
                    "con REQUEST_MODEL, que no lo encuentra, y nunca verifica que haya cargado.");
            }
            if (v.modelId !== null && v.modelId !== undefined) {
                log("[Ballistic] WARN: la variante " + v.weaponType + " declara model '" +
                    v.model + "' Y modelId " + v.modelId + ". El modelId lo pone el juego; " +
                    "declararlo tambien es tener dos fuentes para el mismo numero.");
            }
            continue;
        }
        // Sin modelo propio: tiene que ser uno de vanilla, y tiene que estar en
        // el rango del juego. Un numero fuera de 15000-15099 y fuera del rango de
        // vanilla no lo dibuja nadie.
        var mid = v.modelId;
        if (mid === null || mid === undefined) continue;
        if (mid >= SPECIAL_MODELS.RANGE_START && mid <= SPECIAL_MODELS.RANGE_END) {
            log("[Ballistic] WARN: la variante " + v.weaponType + " (" + v.family +
                ") usa el modelId " + mid + ", que colisiona con el rango de PERSONAJES (" +
                SPECIAL_MODELS.RANGE_START + "-" + SPECIAL_MODELS.RANGE_END + ")");
        }
    }
}

// _ensureWeaponModel — carga el modelo 3D de un arma antes de darla.
//
// REQUEST_MODEL + LOAD_ALL_MODELS_NOW, que es el orden del doc de 01B2
// (GIVE_WEAPON_TO_CHAR). Sin esto el arma se puede dar "invisible" — el ped la
// tiene en la mano y no se ve — y segun el doc hasta puede crashear. Los
// modelos de arma son vanilla y estan cargados siempre, asi que esto no arregla
// un caso que se vea hoy: es la garantia de que el give no depende de que otro
// los haya pedido.
//
// NO se hace mark_model_as_no_longer_needed despues del give, aunque el doc lo
// haga: el ped ya tiene el arma en la mano y liberarle el modelo es
// justamente el modo de fallo que esto previene. Devuelve false si el modelo no
// se pudo pedir; el give sigue igual (un modelo no cargado no es razon para
// negarle el arma al jugador), pero quien llame puede saberlo.

// Dirección entera de CWeaponInfo* (handle WeaponInfo → number)
//
// Un handle de CLEO no siempre es un numero: puede venir como objeto con
// `.address`, o como algo que se convierte con valueOf. Por eso prueba las tres
// y no castea de una.
//
// Devuelve 0 cuando no puede, nunca un numero inventado: los tres call sites
// (expandMagazine, _weaponInfoAddr y _reloadTargets) tratan el 0 como "no hay
// info", y un numero al azar seria escribir m_nAmmoClip en cualquier lado.
function _infoAddr(info) {
    if (!info) return 0;
    if (typeof info === "number") return info;
    if (typeof info.address === "number") return info.address;
    var n = +info;
    if (n) return n;
    if (typeof info.valueOf === "function") {
        var v = info.valueOf();
        if (typeof v === "number" && v) return v;
    }
    return 0;
}

// El modelo custom ya esta en la memoria del juego (lo registro un plugin), asi
// que la unica pregunta util es "esta de verdad". Si no esta, se avisa con el id
// y el weaponId, que es justo lo que hace falta para encontrar al culpable sin
// tener que adivinar.
function _specialModelReady(modelId) {
    try {
        if (native("HAS_MODEL_LOADED", modelId)) return true;
        log("[Ballistic] WARN: modelo de arma " + modelId +
            " no esta cargado. Si lo registro un .ASI, su .dff/.txd no cargo; el arma va a salir invisible.");
        return false;
    } catch (e) {
        return false;
    }
}

function _ensureWeaponModel(weaponId) {
    try {
        var modelId = _modelIdDeTipo(weaponId);
        if (!modelId) return false;  // fuera de catalogo: no hay modelo que pedir
        if (getModelSourceByWeaponId(weaponId) === MODEL_SOURCE_SPECIAL) {
            // El modelo lo cargo un plugin: ya esta en la memoria del juego y
            // REQUEST_MODEL no es lo que lo trae. Lo que si tiene que pasar es
            // que este de verdad, porque si falta el arma se da igual pero sale
            // invisible, y eso no se ve solo.
            //
            // Y ANTES de verificar, escribir el modelId en la CWeaponInfo. Ver
            // _aplicarModelosAVariantes: el .asi clona de forma perezosa y esa
            // clonacion pisa m_modelId con lo del .dat, asi que escribir aca y
            // no en el init es lo que hace que la escritura gane.
            _escribirModelId(weaponId, modelId);
            return _specialModelReady(modelId);
        }
        native("REQUEST_MODEL", modelId);
        native("LOAD_ALL_MODELS_NOW");
        return true;
    } catch (e) {
        return false;
    }
}

// _giveWeapon — arma al ped con su cargador: modelo + GIVE_WEAPON_TO_CHAR +
// total vía SET_CHAR_AMMO + clip/state en memoria (listo para disparar sin
// recargar).
function _giveWeapon(c, weaponId, ammo, hasMag) {
    var total = hasMag ? Math.max(0, ammo | 0) : 0;
    _ensureWeaponModel(weaponId);
    try {
        native("GIVE_WEAPON_TO_CHAR", c, weaponId, total);
        if (!native("HAS_CHAR_GOT_WEAPON", c, weaponId)) {
            // El give no fue del todo, pero el modelo ya esta cargado. Se reintenta
            // con municion y el total se deja en 0 despues: hay que conseguir que
            // HAS_CHAR_GOT_WEAPON de true, o el arma no existe para el mod.
            native("GIVE_WEAPON_TO_CHAR", c, weaponId, _capacityByType(weaponId) || 1);
            if (!native("HAS_CHAR_GOT_WEAPON", c, weaponId)) {
                native("REMOVE_WEAPON_FROM_CHAR", c, weaponId); // no dejar nada a medias
                return false;
            }
        }
        native("SET_CHAR_AMMO", c, weaponId, total);
    } catch (e) {
        return false;
    }
    try {
        var ped = native("GET_PED_POINTER", c);
        var addr = ped ? _weaponAddrByType(ped, weaponId) : 0;
        if (addr) {
            var cap = _capacityByType(weaponId) || 0;
            Memory.WriteI32(addr + _W_CLIP, Math.min(cap, total), false);
            Memory.WriteI32(addr + _W_AMMO, total, false);
            Memory.WriteI32(addr + _W_STATE, 0, false); // WEAPONSTATE_READY
            Memory.WriteI32(addr + _W_TIME, 0, false);
        }
    } catch (e) { /* sin memoria: el engine rellena desde el total */ }
    return true;
}

// equipWeapon — arma del inventario → su slot de GTA. Si el slot ya tiene
// otra arma (otra instancia), esta se desequipa antes (auto-swap).
// Devuelve true si se equipo. Llamado desde InventoryMenu.
export function equipWeapon(itemId) {
    var wd = _weaponDefByItemId(itemId);
    if (!wd) return false; // body_armor, material, arma fuera de catalogo
    var c = _playerChar();
    if (!c) return false;
    var data = _ballisticData();
    var slot = wd.slot;
    // Si el slot ya tiene una arma (otra u otra instancia) → se desequipa
    // antes; si no hay espacio en el inventario, no se equipa la nueva
    if (data.equipped[slot] && !unequipWeapon(slot)) return false;
    var taken = query("items:takeWeapon", { id: itemId });
    if (!taken) return false; // esa arma no esta en el inventario

    // La configuracion que se esta equipando. Vuelve con la instancia si el arma
    // se desequipo con accesorios puestos; si no, es la variante base.
    //
    // Sin esto, reequipar una Colt .45 que estaba con silenciador la deja pelada
    // Y con el cargador de 15 en la mano del ped, que es un estado que el
    // inventario no puede describir. Ojo con null contra []: significan cosas
    // distintas, y la primera es la de un arma recien comprada.
    var attachments = taken.attachments || [];
    var tipo = wd.weaponId;
    if (attachments.length) {
        var t = resolveWeaponType(wd.family, attachments);
        if (t !== null) {
            tipo = t;
        } else {
            log("[Ballistic] WARN: " + itemId + " vuelve con [" +
                attachments.join(", ") + "] pero esa configuracion no existe. Queda como variante base.");
        }
    }

    var cap = getClipSizeByWeaponId(tipo) || getClipSizeByItemId(itemId) || 0;
    var ammo = Math.min(taken.ammo || 0, cap);
    if (!_giveWeapon(c, tipo, ammo, taken.hasMag !== false)) {
        // native fallido: la instancia vuelve al inventario (no se pierde)
        query("items:storeWeapon", {
            id: itemId, hasMag: taken.hasMag, ammo: taken.ammo, salud: taken.salud,
            attachments: taken.attachments || null, force: true
        });
        return false;
    }
    // El cargador que trae el arma se anota en el registro, porque es lo que
    // decide su capacidad. Un arma que llega sin cargador (que es como las
    // entrega el dealer) deja magId en null y usa la del arma.
    //
    // variantWeaponType y attachments van porque el weaponType de la familia es
    // la variante BASE: sin ellos, el slot 2 con una colt45 no dice si lo que hay
    // en la mano es el 22, el 23 o el 60. Ver _tipoEnPies.
    data.equipped[slot] = {
        id: itemId,
        hasMag: taken.hasMag !== false,
        salud: taken.salud,
        magId: taken.magId || (taken.hasMag !== false ? (getMagIdsByWeaponId(tipo)[0] || null) : null),
        attachments: attachments,
        variantWeaponType: tipo
    };
    setModuleData("Ballistic", data);
    _aplicarCapacidad(slot); // el motor usa la capacidad del cargador que entro
    try {
        native("SET_CURRENT_CHAR_WEAPON", c, tipo);
    } catch (e) { /* sin native: el jugador cambia a mano */ }
    showTextBox(t("EQP_OK"));
    return true;
}

// unequipWeapon — arma del slot → inventario, con el cargador que lleve puesto
// y sus balas (leidas del ped). Si no cabe en el inventario (INV_FUL) sigue
// equipada. Devuelve true si salio.
export function unequipWeapon(slot) {
    var data = _ballisticData();
    var entry = data.equipped[slot];
    if (!entry) return false;
    var wd = _weaponDefByItemId(entry.id);
    var c = _playerChar();
    if (!wd || !c) return false;
    var hasMag = entry.hasMag !== false;
    // El tipo que el ped tiene EN LA MANO, que con variantes no es el de la
    // familia. Con una colt45 de cargador de 15 mounted es 60, no 22, y usar
    // wd.weaponId a secas hace que el GET_AMMO devuelva 0, que el REMOVE no
    // quite nada, y que el "salio del ped" de mas: el arma queda en el
    // inventario con cero balas mientras sigue en la mano del ped. Ver _tipoEnPies.
    var tipo = _tipoEnPies(entry, wd);
    var ammo = 0;
    try {
        ammo = native("GET_AMMO_IN_CHAR_WEAPON", c, tipo) || 0;
    } catch (e) { /* sin native: se guarda sin balas */ }
    // La capacidad con la que hay que guardar las balas que quedan es la del
    // CARGADOR MONTADO, no la del arma: con un tambor de 75, guardar con la
    // capacidad del base (30) tiraria 45 balas a la basura. Y es la del TIPO
    // montado, que con variantes no es la del item.
    var cap = _capacidadMontada(slot) || getClipSizeByWeaponId(tipo) || getClipSizeByItemId(entry.id) || 0;
    if (ammo > cap) ammo = cap;
    try {
        native("REMOVE_WEAPON_FROM_CHAR", c, tipo);
    } catch (e) { /* sin native: se verificara abajo */ }
    // Solo se guarda el item si el arma salio del ped (si no, habria copias)
    var stillThere = false;
    try {
        var ped = native("GET_PED_POINTER", c);
        var addr = ped ? _weaponAddrByType(ped, tipo) : 0;
        if (addr && Memory.ReadI32(addr, false) === tipo) stillThere = true;
        if (native("HAS_CHAR_GOT_WEAPON", c, tipo)) stillThere = true;
    } catch (e) { /* sin verificacion: confiamos en el native */ }
    if (stillThere) return false;
    if (!query("items:storeWeapon", {
        id: entry.id, hasMag: hasMag, ammo: ammo, salud: entry.salud,
        attachments: entry.attachments || null
    })) {
        // sin espacio en el inventario: el arma sigue siendo tuya→ se recupera
        _giveWeapon(c, tipo, ammo, hasMag);
        return false;
    }
    delete data.equipped[slot];
    setModuleData("Ballistic", data);
    // El arma se fue del ped: si era la unica que llevaba, la capacidad global
    // de su tipo vuelve a la del arma. Sin esto, un AK con tambor le dejaria 75
    // balas a todos los AK del juego para siempre, y con el arma guardada en la
    // mochila que ya no hay de donde sacar el tambor.
    if (_slotConArma(tipo) === null) {
        var base = getClipSizeByWeaponId(tipo) || 0;
        if (base > 0) _escribirClip(tipo, base);
    }
    if (typeof info === "number") return info;
    if (typeof info.address === "number") return info.address;
    var n = +info;
    if (n) return n;
    if (typeof info.valueOf === "function") {
        var v = info.valueOf();
        if (typeof v === "number" && v) return v;
    }
    return 0;
}

// expandMagazine — escribe m_nAmmoClip (uint16 en +0x20) en la tabla global
// Alcance: GLOBAL type+skill (también NPCs). Próxima recarga → size balas.
function expandMagazine(size, weaponType, skill) {
    try {
        var info = native("GET_WEAPONINFO", weaponType, skill);
        var addr = _infoAddr(info);
        if (!addr) return false;
        Memory.WriteU16(addr + _CLIP_OFF, size, false);
        return true;
    } catch (e) {
        return false;
    }
}

// syncClipSizes — clip de juego = clipSize del catalogo (por arma × skill 0..3)
// Sincroniza arma equipada, CWeaponInfo y capacidad de mag_* en una sola cifra.
// Solo en init (una vez). Devuelve cuántos combos se parchearon.
function syncClipSizes() {
    var n = 0;
    var primeraDir = null;
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        var w = WEAPON_DATA[i];
        if (w.weaponId === null || w.weaponId === undefined) continue;
        if (w.clipSize === null || w.clipSize === undefined) continue;
        // Lo que la tiene el motor no se toca: es la CWeaponInfo de un plugin.
        if (w.clipSource === CLIP_SOURCE_ENGINE) continue;
        // Y ningun weaponId fuera del rango nativo: el mod no escribe en la
        // tabla que creo el .ASI, ni para una variante propia.
        if (w.weaponId > WEAPON_ID_NATIVE_MAX) continue;
        for (var skill = 0; skill <= 3; skill++) {
            if (primeraDir === null) primeraDir = _weaponInfoAddr(w.weaponId, skill);
            if (expandMagazine(w.clipSize, w.weaponId, skill)) n++;
        }
    }
    // DONDE VIVE LA TABLA REAL de CWeaponInfo, para un .asi que quiera dar de
    // alta armas nuevas.
    //
    // Esto se midio, no se copio de un SDK. El plugin-sdk declara la tabla en
    // 0xC8AAB8 y GetWeaponInfo en 0x743C60, pero en ESTA build esa region esta en
    // ceros incluso 30 s despues de que este modulo escriba los cargadores
    // aca: o sea que no es la tabla. La unica fuente que responde es el handle
    // que devuelve GET_WEAPONINFO, y se loguea una vez para que el .asi parta
    // de un numero real en vez de uno de manual.
    log("[Ballistic] CWeaponInfo: " + WEAPON_DATA[0].itemId + " (tipo " +
        WEAPON_DATA[0].weaponId + ") en " + primeraDir +
        " | " + n + " parcheados (tipo x skill)");
    return n;
}

// Direccion de la CWeaponInfo de un (tipo, skill). Aislada de expandMagazine
// para poder mirarla sin escribir nada.
function _weaponInfoAddr(weaponType, skill) {
    try {
        return _infoAddr(native("GET_WEAPONINFO", weaponType, skill));
    } catch (e) {
        return null;
    }
}

// ============================================================================
// RECONCILIACION - el ped solo puede llevar armas del registro
// ============================================================================

// Export de diagnostico. _ensureWeaponModel es privada, pero es el UNICO lugar
// donde se decide si a un modelo se lo pide o se lo verifica, y esa decision es
// justamente la que cambia con un .ASI: un modelo que registro un plugin no se
// pide, se verifica que este. Sin una costura el test tendria que duplicar la
// decision, y un test con su propia copia de la decision no verifica la del
// codigo: verifica la suya.
export function weaponModelReady(weaponId) {
    return _ensureWeaponModel(weaponId);
}

// Capacidad que tiene el MOTOR para un tipo de arma. Se usa solo cuando la
// CWeaponInfo la registro un plugin (clipSource "engine"): el catalogo puede no
// conocerla, y aunque la conozca, la que vale es la del motor.
//
// Se lee por el mismo camino que usa _readSlotAndType para el arma en la mano
// (GET_WEAPONINFO -> GET_WEAPONINFO_TOTAL_CLIP) en vez de por offset fijo, para
// no depender de que el layout sea el de _CLIP_OFF: el bloque de CWeaponInfo lo
// escribio el plugin, no el juego.
function _engineClip(weaponType) {
    try {
        var c = _playerChar();
        if (!c) return 0;
        var skill = native("GET_CHAR_WEAPON_SKILL", c, weaponType) || 0;
        var info = native("GET_WEAPONINFO", weaponType, skill);
        if (!info) return 0;
        return native("GET_WEAPONINFO_TOTAL_CLIP", info) || 0;
    } catch (e) {
        return 0;
    }
}

// Capacidad que el motor ve para un arma de PLUGIN (un .asi la dio de alta).
//
// NO va por _engineClip, y esa es toda la razon de existir esta funcion.
//
// _engineClip le pregunta al PED que skill tiene de ese arma, con
// GET_CHAR_WEAPON_SKILL. Para un weapon type que dio de alta un .asi ese native
// no tiene de donde sacar el dato: el engine no lo conoce, asi que sale 0 y
// _engineClip devuelve 0 sin decir nada. Se comprobo: _capacityByType(60)
// daba 0 con el arma correctly recognizes y con sus cuatro filas sirviendo.
//
// Ademas el planteo esta al reves. La capacidad del cargador es una propiedad
// del ARMA, no del jugador: no depende de en que skill este el ped. Preguntarle
// al ped agrega una dependencia que ademas no existe para estos tipos.
//
// Se consulta la fila STD (skill 1) y listo. weapon.dat repite el mismo K
// (ammoClip) en las cuatro lineas de un arma con skills, asi que las cuatro
// filas dan el mismo numero y cualquiera de las cuatro serviria; STD es la que
// representa al arma sin estar en una punta de la escala.
function _engineClipPlugin(weaponType) {
    try {
        var info = native("GET_WEAPONINFO", weaponType, 1);
        if (!info) return 0;
        return native("GET_WEAPONINFO_TOTAL_CLIP", info) || 0;
    } catch (e) {
        return 0;
    }
}

// Capacidad del cargador MONTADO en un slot, o 0 si ese arma esta sin cargador.
// Lee equipped[slot].magId, que es el unico lugar donde queda escrito que
// cargador esta en la boca del arma.
function _capacidadMontada(slot) {
    var entry = getEquipped()[slot];
    if (!entry) return 0;
    if (entry.hasMag === false) return 0;
    if (!entry.magId) return 0;
    return getClipSizeByItemId(entry.magId) || 0;
}

// Que slot del jugador esta usando ESTE TIPO DE ARMA ahora mismo, o null.
//
// Acepta tanto un weaponType (60, 23) como un itemId ("colt45"), porque hay dos
// formas legitimas de preguntar y antes cada una fallaba por su cuenta:
//
//   por itemId   → el slot que tiene esa FAMILIA, este el tipo o no
//   por weaponType→ el slot que tiene esa REPRESENTACION
//
// El caso que rompia antes: el item colt45 tiene weaponId 22 en su fila (la
// variante base), asi que buscar el tipo 60 comparando `wd.weaponId === 60` no
// encontraba NADA. No es un caso raro: es el caso normal de un arma con
// cargador de 15, que es el 60.
//
// Y el efecto era malo en los dos sentidos. `_aplicarCapacidad` caia al
// `getClipSizeByWeaponId` de emergencia y escribia la capacidad en el tipo BASE
// — la pistola de vanilla — en vez de en el tipo que el ped tiene en la mano. Eso
// deja la capacidad del 60 sin tocar y le pone a TODAS las pistolas de 22 balas
// del juego la del cargador montado. La recarga lee la capacidad del tipo que
// esta en la mano, asi que el arma se queda con la que no le corresponde.
function _slotConArma(weaponType) {
    if (weaponType === null || weaponType === undefined) return null;
    var porItemId = (typeof weaponType === "string");
    var eq = getEquipped();
    for (var i = 1; i < _SLOT_COUNT; i++) {
        var entry = eq[i];
        if (!entry) continue;
        var wd = _weaponDefByItemId(entry.id);
        if (!wd) continue;
        var coincide = porItemId
            ? (entry.id === weaponType)
            : (wd.weaponId === weaponType || _tipoEnPies(entry, wd) === weaponType);
        if (coincide) return i;
    }
    return null;
}

// Capacidad que el motor debe usar para este tipo de arma.
//
// Antes salia del clipSize del catalogo, y por eso el reconciliador recortaba un
// tambor de 75 a 30 en el frame siguiente: la capacidad laonia el ARMA, y un
// tambor no es un arma distinta, es un cargador distinto. Ahora, si el jugador
// tiene ese arma con un cargador de otra capacidad montado, manda el cargador.
    function _capacityByType(weaponType) {
        var w = getWeaponByWeaponId(weaponType);
        if (!w) {
            // Fuera del catalogo. Antes se devolvia 0 y se acababa, y eso hacia
            // inalcanzable el unico camino que el mod ya tiene para leer la
            // capacidad DE UNA ARMA QUE EL MOTOR CONOCE: _engineClip va por
            // GET_WEAPONINFO, que es justo la puerta por la que un .ASI como
            // gsisWeaponLimiter.asi sirve su CWeaponInfo propia. Con el corte
            // temprano, el tipo 60 nunca llegaba ahi y su cargador de 30 era
            // invisible para el reconciliador.
            //
            // El filtro por _isCustomWeaponId NO es cosmetico. Sin el, una
            // granada (tipo 16, fuera de catalogo) tambien caeria aca, y
            // _engineClip(16) contesta 1 porque la granada tiene clip 1: el mod
            // creeria que es un arma de plugin con un cargador de 1 bala.
            //
            // Y por que _engineClipPlugin y no _engineClip: _engineClip le
            // pregunta al ped el skill del arma, y un .asi que dio de alta el
            // tipo no esta en la tabla de skills del engine, asi que ese native
            // no tiene dato que devolver. Ver la funcion.
            if (_isCustomWeaponId(weaponType)) return _engineClipPlugin(weaponType);
            return 0; // melee, granadas, camara, fuera de catalogo
        }
        if (w.clipSource === CLIP_SOURCE_ENGINE) return _engineClip(weaponType);
    var slot = _slotConArma(weaponType);
    if (slot !== null) {
        var montada = _capacidadMontada(slot);
        if (montada > 0) return montada;
    }
    var capacity = getClipSizeByWeaponId(weaponType);
    return capacity > 0 ? capacity : 0;
}

// Escribe una capacidad en la CWeaponInfo del motor, para las cuatro skills.
// Que el juego use una capacidad u otra es escribir en m_nAmmoClip, y el alcance
// es GLOBAL por tipo de arma: mientras el jugador lleve el tambor, los enemigos
// con AK tambien entran 75. Es el costo de este camino, y esta asumido.
function _escribirClip(weaponType, cap) {
    if (!cap || cap < 1) return;
    for (var skill = 0; skill <= 3; skill++) expandMagazine(cap, weaponType, skill);
}

// Deja la capacidad que le corresponde al slot: la del cargador montado, o la
// base del arma si esta sin cargador. Se llama al montar, al sacar y al equipar.
//
// Escribe en el TIPO QUE ESTA MONTADO, no en el weaponId de la familia. Con
// variantes son distintos y la diferencia no es academica: escribir en la base
// deja la variante sin capacidad correcta y le escribe la del cargador a todas
// las armas vanilla de ese tipo. Ver _tipoEnPies y _slotConArma.
function _aplicarCapacidad(slot) {
    var entry = getEquipped()[slot];
    if (!entry) return;
    var wd = _weaponDefByItemId(entry.id);
    if (!wd) return;
    if (wd.clipSource === CLIP_SOURCE_ENGINE) return; // la tiene el motor
    var tipo = _tipoEnPies(entry, wd);
    var montada = _capacidadMontada(slot);
    var cap = montada > 0 ? montada : (getClipSizeByWeaponId(tipo) || 0);
    _escribirClip(tipo, cap);
}

// Monta un cargador completo en la direccion de memoria del arma.
function _mountMagazine(weaponAddr, capacity) {
    try {
        Memory.WriteI32(weaponAddr + _W_CLIP, capacity, false);
        Memory.WriteI32(weaponAddr + _W_AMMO, capacity, false);
    } catch (e) { /* sin memoria: queda la munición que tenga el arma */ }
}

// Normaliza la municion del arma en memoria segun la capacidad que le toca.
//
// Esto es el bloque que el arma del CATALOGO ejecuta cuando esta registrada y
// coincidente con su slot. Vive aparte para que el arma de PLUGIN ejecute el
// MISMO codigo y no una copia: antes la rama de plugin hacia continue en la de
// "fuera de catalogo" y nunca llegaba aca, asi que su reserva se la llevaba el
// engine por su cuenta (90 en una pistola con cargador de 30) sin que el mod
// opinara.
//
// hasMag se decide distinto segun quien sea el arma, y no por gusto sino porque
// la fuente del dato es distinta:
//   - catalogo: lo dice el registro del inventario (entry.hasMag), porque el
//     modulo de inventario es quien sabe si hay un cargador fisico en la boca
//     del arma.
//   - plugin:   no hay item en el inventario, asi que se deduce del arma: tiene
//     cargador si tiene municion. Un arma de plugin sin municion no tiene nada
//     que montar, y una con municion tiene al menos un cargador entero.
function _normalizarMunicion(weaponAddr, weaponType, hasMag) {
    var cap = _capacityByType(weaponType) || 0;
    var total = Memory.ReadI32(weaponAddr + _W_AMMO, false);
    if (!hasMag) {
        if (total !== 0) _unloadWeapon(weaponAddr); // sin cargador: 0/0
    } else if (cap && total > cap) {
        _mountMagazine(weaponAddr, cap); // balas de mas -> un cargador
    }
}

// _reconcileLoadout — arma equipada <-> inventario, cada frame (solo con
// control de jugador, asi las armas de cutscene/mision se adoptan al terminar):
//  - arma de catalogo en el ped SIN registro (mision, cheat, save viejo) → se
//    adopta: pasa al inventario como instancia con su estado (hasMag/ammo)
//  - registro cuyo arma ya no esta en el ped → se limpia la entrada
//  - coincidencia → munición normalizada: jamás mas de un cargador montado y,
//    si el registro dice "sin cargador", el arma queda en 0/0
// Fuera de catalogo (melee, granadas, camara, paracaidas) → no se toca.
function _reconcileLoadout() {
    var c = _playerChar();
    if (!c) return;
    try {
        if (native("IS_CHAR_DEAD", c)) return;
        if (!native("IS_PLAYER_CONTROL_ON", new Player(0))) return;
    } catch (e) { /* sin native: seguimos con el resto */ }
    var ped;
    try {
        ped = native("GET_PED_POINTER", c);
    } catch (e) {
        return;
    }
    if (!ped) return;
    var data = _ballisticData();
    var changed = false;
    for (var i = 1; i < _SLOT_COUNT; i++) {
        var addr = ped + _WEAPONS_OFF + i * _WEAPON_SIZE;
        var type = Memory.ReadI32(addr, false);
        var entry = data.equipped[i];
        if (!type) {
            // slot vacio: el arma se fue (wasted, mision, script)
            if (entry) { delete data.equipped[i]; changed = true; }
            // el arma de plugin que estuviera aqui tampoco esta mas
            if (data.foreign[i]) { delete data.foreign[i]; changed = true; }
            continue;
        }
        // ¿El arma del ped es la registrada?
        //
        // ANTES: wd.weaponId === type. Eso era correcto cuando un item de
        // inventario era un weaponId, y es exactamente el bug que este refactor
        // arregla: la colt45 tiene los tipos 22, 60, 23 y 61, y con la
        // comparacion vieja el ped con la variante 23 en la mano se reconocia
        // como "no registrada" y la linea de abajo le borraba el arma del save
        // en el primer frame. El sintoma (el arma desaparece del inventario al
        // tocar cualquier tecla) es indistinguible de "se perdio".
        //
        // AHORA: la pregunta es si el tipo pertenece a la FAMILIA del item
        // registrado. Un item con una sola variante se comporta igual que antes,
        // porque su familia tiene un solo tipo.
        var wd = entry ? _weaponDefByItemId(entry.id) : null;
        var registered = !!wd && _typeBelongsTo(wd, type);
        if (!registered) {
            // Fuera de catalogo (melee/granadas): no es nuestra, pero si había
            // una registrada en este slot, acaba de perderse
            var presentId = _itemIdByWeaponId(type);
            if (!presentId) {
                // El ped tiene un arma que el catalogo no reconoce. Hay DOS
                // motivos muy distintos y el trato no puede ser el mismo:
                //
                //  - type < 70: basura vanilla (melee, granada, camara,
                //    paracaidas). El mod no la maneja nunca y no hay nada que
                //    registrar.
                //  - type >= 70: un tipo de arma que dio de alta un plugin.
                //    El mod todavia no lo conoce, pero el arma es real, esta
                //    agarrada y tiene su propio slot. ANTES esta linea la
                //    borraba del save en el primer frame, sin error ni log.
                //    Ahora se anota aparte (data.foreign) y no se toca.
                if (_isCustomWeaponId(type)) {
                    if (!data.foreign[i] || data.foreign[i].weaponId !== type) {
                        data.foreign[i] = { weaponId: type, slot: i };
                        changed = true;
                    }
                    // Aviso, una vez por tipo. Sin esto el registro es un write
                    // mudo: se anota, y como data.foreign todavia no lo lee nadie
                    // para decidir nada, no hay forma de saber desde afuera si el
                    // reconciliador reconoco el arma o la borro como basura. Y el
                    // sintoma (la reserva sigue visible en el HUD) es el mismo en
                    // los dos casos, asi que no sirve para distinguir.
                    // No cambia comportamiento: solo hace observable el write.
                    if (!_foreignVistos[type]) {
                        _foreignVistos[type] = true;
                        log("[Ballistic] arma de plugin en slot " + i +
                            " | type " + type +
                            " | _isCustomWeaponId=" + _isCustomWeaponId(type) +
                            " | _capacityByType=" + _capacityByType(type) +
                            " | Anotada en data.foreign. La reserva del engine NO " +
                            "se toca todavia: data.foreign todavia no la usa nadie.");
                    }
                    // Si habia una arma del catalogo registrada en este slot,
                    // ya no esta (el plugin la sustituyo): se libera el registro.
                    // El arma en si no se pierde — el save la tiene el juego.
                    if (entry) { delete data.equipped[i]; changed = true; }
                    // Y aca, en vez de seguir de largo, el arma pasa por la misma
                    // normalizacion que una del catalogo. Es el unico cambio de
                    // comportamiento de esta etapa: hasta ahora el engine se
                    // llevaba solo la reserva de un arma que el mod ya sabia
                    // medir (cap 30) y nunca montaba un cargador.
                    //
                    // hasMag se deduce del arma y no de un item del inventario:
                    // el 60 no tiene entrada en data.equipped, y darle una seria
                    // inventar el item de inventario que todavia no existe.
                    _normalizarMunicion(addr, type, Memory.ReadI32(addr + _W_AMMO, false) > 0);
                    continue;
                }
                if (entry) { delete data.equipped[i]; changed = true; }
                continue;
            }
            // arma no registrada (mision, cheat, save viejo) → adoptarla al
            // inventario con su estado. Orden: quitarla del ped, verificar que
            // salio y solo entonces guardar el item (asi no puede haber copias)
            var total = Memory.ReadI32(addr + _W_AMMO, false);
            var cap = _capacityByType(type) || 0;
            var hasMag = total > 0;
            if (cap && total > cap) total = cap;
            try {
                native("REMOVE_WEAPON_FROM_CHAR", c, type);
            } catch (e) { continue; }
            // Verificar por memoria y por native que salio antes de guardar:
            // si sigue ahi no se guarda nada (evita duplicados)
            var stillThere = Memory.ReadI32(addr, false) === type;
            try {
                if (native("HAS_CHAR_GOT_WEAPON", c, type)) stillThere = true;
            } catch (e) { /* sin native: vale la lectura de memoria */ }
            if (stillThere) continue;
            if (!query("items:storeWeapon", {
                id: presentId, hasMag: hasMag, ammo: total, salud: SALUD_MAX, force: true
            })) {
                _giveWeapon(c, type, total, hasMag); // sin sitio: vuelve al ped
                continue;
            }
            if (entry) delete data.equipped[i];
            // el slot vuelve a ser del catalogo: el arma de plugin que
            // estuviera anotada aqui ya no aplica
            if (data.foreign[i]) delete data.foreign[i];
            changed = true;
            continue;
        }
        // Registrada y coincidente → normalizar la munición del cargador
        if (data.foreign[i]) { delete data.foreign[i]; changed = true; }
        _normalizarMunicion(addr, type, entry.hasMag !== false);
    }
    if (changed) setModuleData("Ballistic", data);
}

// ============================================================================
// RECARGA - guards, anim nativa y swap de cargador
// ============================================================================

// Guards + targets de memoria de la recarga del arma "w".
// Devuelve { weapon, ms } o null si no se puede recargar.
function _reloadTargets(w) {
    try {
        // 09E7 — si el control esta off (cutscene/mission) no recargamos
        if (!native("IS_PLAYER_CONTROL_ON", new Player(0))) return _sinRecarga("control del player apagado", w);
    } catch (e) { /* guard opcional: si falla el native seguimos */ }
    try {
        if (native("IS_CHAR_DEAD", w.char)) return _sinRecarga("ped muerto", w);
        if (_NO_ANIM.indexOf(w.type) >= 0) return _sinRecarga("el tipo " + w.type + " no tiene anim de recarga", w);
        var ped = native("GET_PED_POINTER", w.char);
        if (!ped) return _sinRecarga("sin puntero de ped", w);
        var slot = Memory.ReadU8(ped + _SLOT_OFF, false);
        if (!slot) return _sinRecarga("slot 0 = sin arma", w);
        var weapon = ped + _WEAPONS_OFF + slot * _WEAPON_SIZE;
        if (Memory.ReadI32(weapon + _W_STATE, false) === _STATE_RELOADING) return _sinRecarga("ya recargando", w);
        var info = _infoAddr(native("GET_CURRENT_CHAR_WEAPONINFO", w.char));
        // Esta es la guarda que mas se ha partido. Sin info no hay ni flags ni
        // tiempo de recarga, y como el return era silencioso el sintoma era
        // "no recarga" sin ninguna pista de cual de las cinco guards habia
        // cortado. Se loguea cada una, una vez por combinacion.
        if (!info) return _sinRecarga("GET_CURRENT_CHAR_WEAPONINFO no devolvio info", w);
        // WEAPON_RELOAD (0x1000) — solo armas con anim de recarga
        if (!(native("GET_WEAPONINFO_FLAGS", info) & 0x1000)) {
            return _sinRecarga("el tipo " + w.type + " no tiene el flag WEAPON_RELOAD (0x1000) en su CWeaponInfo", w);
        }
        var ms = Memory.CallMethodReturn(_RELOAD_TIME_FN, info, 0, 0);
        if (ms <= 0) return _sinRecarga("GetWeaponReloadTime devolvio " + ms + " para el tipo " + w.type, w);
        return { weapon: weapon, ms: ms, info: info };
    } catch (e) {
        return _sinRecarga("excepcion: " + e.message, w);
    }
}

// Por que NO se recargo. Loguea el motivo y devuelve null, que es lo que espera
// el llamador.
//
// Un `_reloadTargets` que devuelve null sin decir por que es el peor tipo de
// falla para debuggear: hay CINCO guards y todas se ven igual desde afuera —
// "no recarga". Con esto, el log dice exactamente cual corto, con el tipo y el
// slot, y la primera vez que aparece ya dice la causa.
//
// Se loguea una vez por (motivo, tipo): si no, recargar 60 veces por minuto
// llena el log y el motivo real queda tapado por 3000 copias.
var _sinRecargaVisto = {};
function _sinRecarga(motivo, w) {
    var tipo = w && w.type !== undefined ? w.type : "?";
    var clave = tipo + "|" + motivo;
    if (!_sinRecargaVisto[clave]) {
        _sinRecargaVisto[clave] = true;
        log("[Ballistic] NO recarga (tipo " + tipo + ", slot " + (w ? w.slot : "?") +
            "): " + motivo);
    }
    return null;
}

// Dispara la recarga nativa: CWeapon::m_nTimeForNextShot = ahora + reloadTime
// y m_nState = 2 (RELOADING). CTaskSimpleGunControl ve el estado y lanza el
// anim RELOAD; al vencer, CWeapon::Update → Reload() rellena el clip.
function _startReloadAnim(targets, w, ammo) {
    try {
        var now = Memory.ReadI32(_TIMER_ADDR, false);
        Memory.WriteI32(targets.weapon + _W_TIME, now + targets.ms, false);
        Memory.WriteI32(targets.weapon + _W_STATE, _STATE_RELOADING, false);
        // Watchdog: si Update no termina la recarga, la cerramos nosotros
        _reloadPending = {
            ped: native("GET_PED_POINTER", w.char),
            weapon: targets.weapon,
            deadline: now + targets.ms,
            cap: w.clip,
            ammo: ammo // total esperado tras la recarga (0 si fue descarga)
        };
    } catch (e) { /* sin memoria: el swap de cargador ya se hizo */ }
}

// _watchdogReload — cierre forzado de la recarga.
// CWeapon::Update solo sale de RELOADING cuando now > m_nTimeForNextShot,
// pero si no hay anim RELOAD asociado (o algo reescribe el estado, p. ej.
// mod de arma a cero → OUT_OF_AMMO) queda state 2/3 eterno y CWeapon::Fire
// hace return false (no dispara). Pasado el deadline + RELOAD_GRACE con
// state 2 o 3, replicamos el cierre del engine: total = esperado,
// clip = min(capacidad, total), state = READY, time = ya.
function _watchdogReload() {
    var p = _reloadPending;
    if (!p) return;
    try {
        var now = Memory.ReadI32(_TIMER_ADDR, false);
        if (now <= p.deadline + TIMERS.RELOAD_GRACE) return; // margen del engine
        var ped = native("GET_PED_POINTER", new Player(0).getChar());
        if (ped && ped !== p.ped) { _reloadPending = null; return; } // CJ cambio
        var state = Memory.ReadI32(p.weapon + _W_STATE, false);
        if (state !== _STATE_RELOADING && state !== _STATE_OUT_OF_AMMO) {
            _reloadPending = null; // el engine termino la recarga solo
            return;
        }
        if (Memory.ReadI32(p.weapon + _W_AMMO, false) !== p.ammo) {
            Memory.WriteI32(p.weapon + _W_AMMO, p.ammo, false); // reafirma total
        }
        Memory.WriteI32(p.weapon + _W_CLIP, Math.min(p.cap, p.ammo), false);
        Memory.WriteI32(p.weapon + _W_STATE, 0, false); // WEAPONSTATE_READY
        Memory.WriteI32(p.weapon + _W_TIME, now, false);
        _reloadPending = null;
    } catch (e) { /* sin memoria: sin watchdog */ }
}

// Descarga el arma: clip y total = 0 (el cargador salio al inventario)
function _unloadWeapon(weaponAddr) {
    try {
        Memory.WriteI32(weaponAddr + _W_CLIP, 0, false);
        Memory.WriteI32(weaponAddr + _W_AMMO, 0, false);
    } catch (e) { /* sin memoria: el cargador ya esta en el inventario */ }
}

// Marca si el arma equipada de ese slot lleva cargador montado, y cual.
//
// Antes solo guardaba `hasMag` (si/no). Eso alcanzaba mientras el cargador de un
// arma fuera siempre el mismo, porque la capacidad laonia el ARMA. Con un tambor
// de 75 el cargador YA NO es el de por defecto, asi que el registro necesita
// saber cual es: sin `magId` no hay forma de saber que capacidad aplica, ni de
// devolverla a la base cuando el jugador saca el tambor.
//
// La `salud` del registro NO se toca desde aca: es estado de la instancia, y esta
// funcion reacciona a un evento de recarga, no a desgaste. Igual con `id`.
function _setHasMag(slot, mounted, magId) {
    var data = _ballisticData();
    if (!data.equipped[slot]) return;
    data.equipped[slot].hasMag = !!mounted;
    // Al sacar el cargador se borra el magId, no se deja el viejo: si queda, el
    // slot sin cargador hereda la capacidad de un cargador que ya no esta ahi.
    if (magId !== undefined) data.equipped[slot].magId = mounted ? magId : null;
    setModuleData("Ballistic", data);
}

// tryReload — R: swap desde el cinturon o descarga, con la anim nativa.
// Ver gsis_INVENTORY.md.
function tryReload(w) {
    if (!w) return;
    // Que cargadores acepta ESTE arma. Con variantes de capacidad el arma es una
    // sola y lo que cambia es el cargador, asi que ya no hay un unico magId que
    // exigir: hay una lista, y el cinturon resuelve cual de los que tenes se
    // monta. Para las armas sin variantes la lista tiene un elemento y el
    // comportamiento es el de siempre.
    var magIds = getMagIdsByWeaponId(w.type);
    if (!magIds.length) return _sinRecarga("el tipo " + w.type + " no tiene cargadores en el catalogo", w);
    // La capacidad del arma en la mano. Si esto da 0 el arma no tiene donde
    // recargar y es el corte mas silencioso de todos: la capacidad sale de la
    // CWeaponInfo del TIPO que esta montado, y con variantes ese tipo no es
    // el weaponId de la familia.
    if (!w.clip || w.clip < 1) return _sinRecarga("la capacidad del tipo " + w.type + " es " + w.clip, w);
    var targets = _reloadTargets(w);
    if (!targets) return;
    var entry = getEquipped()[w.slot];
    if (!entry) return _sinRecarga("el slot " + w.slot + " no esta en el registro", w);
    var hasMag = entry.hasMag !== false;
    // El cargador montado sale con min(balas, capacidad): no puede haber mas
    // balas fuera de catalogo que capacidad
    //
    // `mountedMagId` es el cargador que ESTA EN EL ARMA, y Items lo necesita para
    // devolverlo al cinturon. Sin esto el swap solo sabe el cargador que ENTRA, y
    // un cargador que sale solo se puede describir por el de entrada — que es
    // como un cargador de 15 se convierte en uno de 8 y se pierde el otro. Ver
    // "items:swapMagazine" en gsis_Items.js.
    var resp = query("items:swapMagazine", {
        magIds: magIds,
        ammo: Math.min(w.ammo || 0, w.clip),
        mounted: hasMag,
        mountedMagId: entry.magId || null
    });
    if (resp) {
        // La capacidad es la del cargador que ENTRÓ, no la que tenia el arma
        // antes. Con un tambor son 75 y no 30: usar w.clip aqui recortaria el
        // cargador nuevo a la capacidad del anterior, que es el mismo error del
        // reconciliador y por el mismo motivo.
        var cap = getClipSizeByItemId(resp.magId) || w.clip;
        _setHasMag(w.slot, true, resp.magId);
        _aplicarCapacidad(w.slot); // el motor pasa a usar la capacidad del tambor
        setMagazine(w, Math.min(resp.ammo, cap));
        _startReloadAnim(targets, w, Math.min(resp.ammo, cap));
        log("[Ballistic] recarga: " + w.type + " coge " + resp.magId +
            " con " + resp.ammo + " (cap " + cap + ")");
        return;
    }
    // Sin recambio en el cinturon → descarga: el cargador montado pasa al
    // inventario y el arma se queda sin balas; la misma anim remata la escena
    if (hasMag && (w.ammo || 0) > 0) {
        var out = Math.min(w.ammo, w.clip);
        if (query("items:extractMagazine", { magId: entry.magId || magIds[0], ammo: out })) {
            _unloadWeapon(targets.weapon);
            _setHasMag(w.slot, false, null);
            _aplicarCapacidad(w.slot); // vuelve a la capacidad del arma
            _startReloadAnim(targets, w, 0);
            showTextBox(t("MAG_OUT"));
        } // si no cabe: INV_FUL lo muestra Items y el arma no cambia
        return;
    }
    showTextBox(t("NO_MAG"));
    log("[Ballistic] recarga sin resultado: tipo " + w.type +
        " | hay cargador montado=" + hasMag + " ammo=" + w.ammo +
        " | cinturon sin recambio util");
}

// ============================================================================
// REGISTRO - tecla R (recarga) + cambio de slot (TEST)
// ============================================================================

register({
    name: "Ballistic",
    init: function () {
        _lastSlot = null;
        _reloadPending = null; // sin recarga pendiente al cargar partida
        registerModule("Ballistic", { equipped: {}, foreign: {} }); // armas en slot (+ armas de plugin)
        // Migracion de saves viejos: hasMag[slot] → equipped[slot].hasMag
        var data = getModuleData("Ballistic");
        var migrado = false;
        if (data && data.hasMag) {
            delete data.hasMag;
            migrado = true;
        }
        // equipped[slot].salud no existia antes: los slots de un save viejo la
        // toman a SALUD_MAX. Sin esto el registro queda con salud undefined y
        // el desequiparla la manda al inventario en 100% por el default de
        // addItem, que es el mismo numero pero por el camino corto y de rebote.
        if (data && data.equipped) {
            for (var slot in data.equipped) {
                if (!Object.prototype.hasOwnProperty.call(data.equipped, slot)) continue;
                var entry = data.equipped[slot];
                if (!entry) continue;
                var s = clampSalud(entry.salud);
                if (entry.salud !== s) {
                    entry.salud = s;
                    migrado = true;
                }
                // Un save viejo no tiene magId, porque antes el cargador de un
                // arma era siempre el mismo y no hacia falta anotarlo. Ahora si:
                // un arma con un cargador de otra capacidad se recortaria a la
                // del base en el primer reconcile. Se rellena con el cargador
                // por defecto del arma, que es lo que esos saves tenian montado.
                // Un slot sin cargador (hasMag false) se queda en null.
                if (entry.magId === undefined) {
                    var wdM = _weaponDefByItemId(entry.id);
                    entry.magId = (entry.hasMag === false || !wdM)
                        ? null
                        : (getMagIdsByWeaponId(wdM.weaponId)[0] || null);
                    migrado = true;
                }
            }
        }
        if (migrado) setModuleData("Ballistic", data);
        // Modelos custom: valida que los ids no colisionen con el rango de
        // personajes antes de que un arma salga invisible en juego
        _validateWeaponModels();
        // Modelos propios de arma. _cargarModelosDeArma SOLO arma la cola: la
        // carga corre de a un paso por frame desde update(), porque en el init
        // se comia el timeout de 2 segundos de CLEO+ y el mod no arrancaba.
        _cargarModelosDeArma();
        // Variantes: que la tabla de este lado y la del .asi no se separen.
        // Corre DESPUES de todo lo de arriba porque es el unico chequeo que ve
        // las dos mitades, y necesita el catalogo ya construido.
        _validateVariantContract();
        // Capacidades: clip de juego = clipSize del catalogo (igual que mag_*)
        syncClipSizes();
    },
    update: function (now) {
        // Un paso de la carga de modelos por frame. Va PRIMERO y no al final a
        // proposito: si el arma con modelo propio se da este mismo frame, el
        // paso ya escribio el modelId en la CWeaponInfo y sale con el modelo
        // correcto en vez de invisible. Runs una vez por frame mientras la cola
        // este viva, y una vez mas cuando _carga queda en null, que no hace nada.
        _pasoCargaModelos();
        _reconcileLoadout();
        _watchdogReload();
        var cur = _readSlotAndType();
        if (keyJustPressed(KEYS.RELOAD)) tryReload(cur);
        if (!cur) return;
        // Solo actua al cambiar de slot de arma
        if (_lastSlot !== null && cur.slot === _lastSlot) return;
        _lastSlot = cur.slot;
    }
});
