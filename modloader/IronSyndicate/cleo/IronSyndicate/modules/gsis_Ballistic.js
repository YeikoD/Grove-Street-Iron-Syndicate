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
import { KEYS, TIMERS, SPECIAL_MODELS } from "../core/gsis_Config.js";
import { keyJustPressed } from "../core/gsis_Input.js";
import { t } from "../core/gsis_L10n.js";
    import { WEAPON_DATA, WEAPON_ID_NATIVE_MAX, CLIP_SOURCE_ENGINE, MODEL_SOURCE_SPECIAL, getModelIdByWeaponId, getModelSourceByWeaponId, getMagIdByWeaponId, getClipSizeByItemId, getClipSizeByWeaponId, getWeaponByItemId, getWeaponByWeaponId } from "../data/gsis_weapon_data.js";
import { SALUD_MAX, clampSalud } from "../data/gsis_item_data.js";

var _CLIP_OFF = 0x20; // m_nAmmoClip en CWeaponInfo (uint16)
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
function _isCustomWeaponId(weaponId) {
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
        return native("GET_AMMO_IN_CHAR_WEAPON", c, wd.weaponId) || 0;
    } catch (e) {
        return null;
    }
}

// Direccion de trabajo del modulo (copia de lectura de SaveManager)
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
function _validateWeaponModels() {
    var rango = SPECIAL_MODELS.WEAPON_RANGE;
    if (!rango) return;
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
        var modelId = getModelIdByWeaponId(weaponId);
        if (!modelId) return false;  // fuera de catalogo: no hay modelo que pedir
        if (getModelSourceByWeaponId(weaponId) === MODEL_SOURCE_SPECIAL) {
            // El modelo lo registro un plugin en CModelInfo: ya esta en la
            // memoria del juego y REQUEST_MODEL no es lo que lo trae. Lo que si
            // tiene que pasar es que este de verdad, porque si falta el arma se
            // da igual y sale invisible, y eso no se ve solo.
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
    var cap = getClipSizeByItemId(itemId) || 0;
    var ammo = Math.min(taken.ammo || 0, cap);
    if (!_giveWeapon(c, wd.weaponId, ammo, taken.hasMag !== false)) {
        // native fallido: la instancia vuelve al inventario (no se pierde)
        query("items:storeWeapon", {
            id: itemId, hasMag: taken.hasMag, ammo: taken.ammo, salud: taken.salud, force: true
        });
        return false;
    }
    data.equipped[slot] = { id: itemId, hasMag: taken.hasMag !== false, salud: taken.salud };
    setModuleData("Ballistic", data);
    try {
        native("SET_CURRENT_CHAR_WEAPON", c, wd.weaponId);
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
    var ammo = 0;
    try {
        ammo = native("GET_AMMO_IN_CHAR_WEAPON", c, wd.weaponId) || 0;
    } catch (e) { /* sin native: se guarda sin balas */ }
    var cap = getClipSizeByItemId(entry.id) || 0;
    if (ammo > cap) ammo = cap;
    try {
        native("REMOVE_WEAPON_FROM_CHAR", c, wd.weaponId);
    } catch (e) { /* sin native: se verificara abajo */ }
    // Solo se guarda el item si el arma salio del ped (si no, habria copias)
    var stillThere = false;
    try {
        var ped = native("GET_PED_POINTER", c);
        var addr = ped ? _weaponAddrByType(ped, wd.weaponId) : 0;
        if (addr && Memory.ReadI32(addr, false) === wd.weaponId) stillThere = true;
        if (native("HAS_CHAR_GOT_WEAPON", c, wd.weaponId)) stillThere = true;
    } catch (e) { /* sin verificacion: confiamos en el native */ }
    if (stillThere) return false;
    if (!query("items:storeWeapon", { id: entry.id, hasMag: hasMag, ammo: ammo, salud: entry.salud })) {
        // sin espacio en el inventario: la arma sigue siendo tuya → se recupera
        _giveWeapon(c, wd.weaponId, ammo, hasMag);
        return false;
    }
    delete data.equipped[slot];
    setModuleData("Ballistic", data);
    showTextBox(t("EQP_OUT"));
    return true;
}

// Dirección entera de CWeaponInfo* (handle WeaponInfo → number)
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

// Capacidad efectiva de un tipo de arma en el juego.
//
// Antes hacia la vuelta completa: arma -> su magId -> quitar "mag_" -> el arma
// otra vez -> su clipSize. Para un arma base eso vuelve al punto de partida; para
// una variante daba la capacidad del BASE, que es justo el bug que viene a
// arreglar. Ahora va directo a la entrada del weaponId, y si la capacidad la
// tiene el motor, la lee de ahi.
function _capacityByType(weaponType) {
    var w = getWeaponByWeaponId(weaponType);
    if (!w) return 0; // melee, granadas, fuera de catalogo
    if (w.clipSource === CLIP_SOURCE_ENGINE) return _engineClip(weaponType);
    var capacity = getClipSizeByWeaponId(weaponType);
    return capacity > 0 ? capacity : 0;
}

// Monta un cargador completo en la direccion de memoria del arma.
function _mountMagazine(weaponAddr, capacity) {
    try {
        Memory.WriteI32(weaponAddr + _W_CLIP, capacity, false);
        Memory.WriteI32(weaponAddr + _W_AMMO, capacity, false);
    } catch (e) { /* sin memoria: queda la munición que tenga el arma */ }
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
        // ¿El arma del ped es la registrada? (mismo weaponId)
        var wd = entry ? _weaponDefByItemId(entry.id) : null;
        var registered = !!(wd && wd.weaponId === type);
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
                    // Si habia una arma del catalogo registrada en este slot,
                    // ya no esta (el plugin la sustituyo): se libera el registro.
                    // El arma en si no se pierde — el save la tiene el juego.
                    if (entry) { delete data.equipped[i]; changed = true; }
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
        var capR = _capacityByType(type) || 0;
        var totalR = Memory.ReadI32(addr + _W_AMMO, false);
        if (entry.hasMag === false) {
            if (totalR !== 0) _unloadWeapon(addr); // sin cargador: 0/0
        } else if (capR && totalR > capR) {
            _mountMagazine(addr, capR); // balas de mas → un cargador
        }
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
        if (!native("IS_PLAYER_CONTROL_ON", new Player(0))) return null;
    } catch (e) { /* guard opcional: si falla el native seguimos */ }
    try {
        if (native("IS_CHAR_DEAD", w.char)) return null;
        if (_NO_ANIM.indexOf(w.type) >= 0) return null; // sin anim de recarga
        var ped = native("GET_PED_POINTER", w.char);
        if (!ped) return null;
        var slot = Memory.ReadU8(ped + _SLOT_OFF, false);
        if (!slot) return null; // slot 0 = sin arma
        var weapon = ped + _WEAPONS_OFF + slot * _WEAPON_SIZE;
        if (Memory.ReadI32(weapon + _W_STATE, false) === _STATE_RELOADING) return null; // ya recargando
        var info = _infoAddr(native("GET_CURRENT_CHAR_WEAPONINFO", w.char));
        if (!info) return null;
        // WEAPON_RELOAD (0x1000) — solo armas con anim de recarga
        if (!(native("GET_WEAPONINFO_FLAGS", info) & 0x1000)) return null;
        var ms = Memory.CallMethodReturn(_RELOAD_TIME_FN, info, 0, 0);
        if (ms <= 0) return null;
        return { weapon: weapon, ms: ms };
    } catch (e) {
        return null;
    }
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

// Marca si el arma equipada de ese slot lleva cargador montado.
//
// Solo `hasMag`. La `salud` del registro NO se toca desde aca: es estado de la
// instancia, y esta funcion reacciona a un evento de recarga, no a desgaste.
// Igual con `id`. Lo unico que la recarga escribe en el registro es si hay
// cargador montado, porque eso es lo que la recarga cambia.
function _setHasMag(slot, mounted) {
    var data = _ballisticData();
    if (!data.equipped[slot]) return;
    data.equipped[slot].hasMag = !!mounted;
    setModuleData("Ballistic", data);
}

// tryReload — R: swap desde el cinturon o descarga, con la anim nativa.
// Ver gsis_INVENTORY.md.
function tryReload(w) {
    if (!w) return;
    var magId = getMagIdByWeaponId(w.type); // arma equipada → su cargador
    if (!magId) return; // melee, granadas, armas fuera de catalogo
    if (!w.clip || w.clip < 1) return; // sin capacidad = no hay cargador valido
    var targets = _reloadTargets(w);
    if (!targets) return;
    var entry = getEquipped()[w.slot];
    if (!entry) return; // sin registrar: no es tuya (el reconcile la adopta)
    var hasMag = entry.hasMag !== false;
    // El cargador montado sale con min(balas, capacidad): no puede haber mas
    // balas fuera de catalogo que capacidad
    var resp = query("items:swapMagazine", {
        magId: magId,
        ammo: Math.min(w.ammo || 0, w.clip),
        mounted: hasMag
    });
    if (resp) {
        setMagazine(w, Math.min(resp.ammo, w.clip));
        _setHasMag(w.slot, true);
        _startReloadAnim(targets, w, Math.min(resp.ammo, w.clip));
        return;
    }
    // Sin recambio en el cinturon → descarga: el cargador montado pasa al
    // inventario y el arma se queda sin balas; la misma anim remata la escena
    if (hasMag && (w.ammo || 0) > 0) {
        var out = Math.min(w.ammo, w.clip);
        if (query("items:extractMagazine", { magId: magId, ammo: out })) {
            _unloadWeapon(targets.weapon);
            _setHasMag(w.slot, false);
            _startReloadAnim(targets, w, 0);
            showTextBox(t("MAG_OUT"));
        } // si no cabe: INV_FUL lo muestra Items y el arma no cambia
        return;
    }
    showTextBox(t("NO_MAG")); // sin cargador montado y sin recambio equipado
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
            }
        }
        if (migrado) setModuleData("Ballistic", data);
        // Modelos custom: valida que los ids no colisionen con el rango de
        // personajes antes de que un arma salga invisible en juego
        _validateWeaponModels();
        // Capacidades: clip de juego = clipSize del catalogo (igual que mag_*)
        syncClipSizes();
    },
    update: function (now) {
        _reconcileLoadout();
        _watchdogReload();
        var cur = _readSlotAndType();
        if (keyJustPressed(KEYS.RELOAD)) tryReload(cur);
        if (!cur) return;
        // Solo actúa al cambiar de slot de arma
        if (_lastSlot !== null && cur.slot === _lastSlot) return;
        _lastSlot = cur.slot;
    }
});
