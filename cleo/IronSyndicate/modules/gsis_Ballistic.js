// ============================================================================
// GSIS Ballistic - Recarga por cargador (arma equipada <-> inventario)
// ============================================================================
// R (KEYS.RELOAD) → tryReload():
//   1. arma equipada → su cargador (getMagIdByWeaponId); melee/granadas salen
//   2. query("items:swapMagazine", { magId, ammo, mounted }): sale del inventario
//      el cargador con mas balas y vuelve el montado con sus balas restantes
//      (0 si se vacio); con "mounted: false" no devuelve nada (arma descargada)
//   3. sin recambio → query("items:extractMagazine"): el cargador montado pasa
//      al inventario, el arma queda sin cargador (0/0, MAG_OUT) y corre la
//      misma anim de recarga. Si el arma ya esta sin cargador o no cabe en el
//      inventario → NO_MAG / INV_FUL
//   4. SET_CHAR_AMMO(total = cargador nuevo) + anim nativa de recarga
//      Watchdog: si el engine no sale de RELOADING (state 2) al vencer el
//      deadline + TIMERS.RELOAD_GRACE, lo forzamos (clip = min(cap, total),
//      state = READY) — si no, CWeapon::Fire devuelve false y el arma queda
//      muda (estado RELOADING eterno por empujon del deadline en Update).
// ¿Hay cargador montado? GameState.Ballistic.hasMag[slot] (persistido); las
// balas del montado siguen viajando en el save del juego.
// Invariante: m_TotalAmmo (nativo) = balas del cargador montado, asi que el
// cargador montado NO esta en el inventario y su estado viaja en el save del
// juego (no hay modulo propio que persistir).
// Arma nueva (POI, cheat, mision…) → _trackMountedMags() le monta un cargador
// lleno (calidad 1) al aparecer en un slot, y si trae mas balas que la
// capacidad se normaliza. El primer frame solo hace baseline: al cargar
// partida no se rellena nada.
// Test: al cambiar de slot → showTextBox (sin rellenar munición).
// Init: syncClipSizes() → CWeaponInfo.m_nAmmoClip = WEAPON_DATA.clipSize.
// Nativos CLEO+: GET_CURRENT_CHAR_WEAPONINFO (0E83), GET_WEAPONINFO (0E84),
// GET_WEAPONINFO_SLOT (0E8A), GET_WEAPONINFO_TOTAL_CLIP (0E88),
// GET_CURRENT_CHAR_WEAPON (0470), GET_AMMO_IN_CHAR_WEAPON (041A),
// SET_CHAR_AMMO (017B), GET_PED_POINTER (0A96), IS_CHAR_DEAD (0118),
// IS_PLAYER_CONTROL_ON (09E7), GET_WEAPONINFO_FLAGS (0E86).
// Memory.WriteU16 → CWeaponInfo+0x20 (m_nAmmoClip).
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { query } from "../core/gsis_EventBus.js";
import { registerModule, getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { KEYS, TIMERS } from "../core/gsis_Config.js";
import { t } from "../core/gsis_L10n.js";
import { WEAPON_DATA, getMagIdByWeaponId, getClipSizeByItemId } from "../data/gsis_weapon_data.js";

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
var _known = []; // type por slot visto en el escaneo anterior
var _capacities = []; // capacidad (clipSize) del arma en cada slot
var _primed = false; // false = primer escaneo (baseline, sin montar)
var _reloadPending = null; // { ped, weapon, deadline, cap } recarga nossa en curso

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

// hasMagazine — ¿hay cargador montado en ese slot? Persistido en GameState
// (una descarga debe seguir viendose tras guardar/cargar).
function hasMagazine(slot) {
    var data = getModuleData("Ballistic");
    return !data || !data.hasMag || data.hasMag[slot] !== false;
}

// setHasMagazine — marca el slot al montar (swap o arma nueva) o al descargar
function setHasMagazine(slot, mounted) {
    var data = getModuleData("Ballistic");
    if (!data || !data.hasMag) data = { hasMag: {} };
    data.hasMag[slot] = mounted;
    setModuleData("Ballistic", data);
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
    for (var i = 0; i < WEAPON_DATA.length; i++) {
        var w = WEAPON_DATA[i];
        if (w.weaponId === null || w.weaponId === undefined) continue;
        if (w.clipSize === null || w.clipSize === undefined) continue;
        for (var skill = 0; skill <= 3; skill++) {
            if (expandMagazine(w.clipSize, w.weaponId, skill)) n++;
        }
    }
    return n;
}

// ============================================================================
// CARGADOR MONTADO - arma nueva → cargador lleno (calidad 1)
// ============================================================================

// Capacidad del cargador de un weaponId (0 si esa arma no tiene cargador)
function _capacityByType(weaponType) {
    var magId = getMagIdByWeaponId(weaponType);
    if (!magId) return 0; // melee, granadas, fuera de catalogo
    var capacity = getClipSizeByItemId(magId);
    return capacity > 0 ? capacity : 0;
}

// Monta el cargador en el slot: m_nAmmoInClip y m_nAmmoTotal = capacidad.
// No toca el inventario: el arma viene con su cargador puesto.
function _mountMagazine(weaponAddr, capacity) {
    try {
        Memory.WriteI32(weaponAddr + _W_CLIP, capacity, false);
        Memory.WriteI32(weaponAddr + _W_AMMO, capacity, false);
    } catch (e) { /* sin memoria: queda la munición que tenga el arma */ }
}

// Escanea los 13 slots de arma de CJ cada frame:
//  - arma nueva en un slot → cargador lleno montado (= clipSize del catalogo)
//  - munición por encima de la capacidad → se normaliza (nunca mas de un cargador)
// El primer escaneo es baseline: al cargar partida no se rellena nada.
function _trackMountedMags() {
    var ped;
    try {
        ped = native("GET_PED_POINTER", new Player(0).getChar());
    } catch (e) {
        return;
    }
    if (!ped) return;
    for (var i = 1; i < _SLOT_COUNT; i++) {
        var addr = ped + _WEAPONS_OFF + i * _WEAPON_SIZE;
        var type = Memory.ReadI32(addr, false);
        var total = Memory.ReadI32(addr + _W_AMMO, false);
        if (_known[i] !== type) {
            _known[i] = type;
            _capacities[i] = _capacityByType(type);
            // arma recien obtenida → cargador lleno (state ya viene en READY)
            if (_primed && _capacities[i]) {
                _mountMagazine(addr, _capacities[i]);
                setHasMagazine(i, true);
                continue;
            }
        }
        if (_capacities[i] && total > _capacities[i]) {
            _mountMagazine(addr, _capacities[i]); // balas de mas → un cargador
        }
    }
    _primed = true;
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

// tryReload — R: swap de cargador o descarga, ambos con la anim nativa.
// Ver gsis_INVENTORY.md.
function tryReload(w) {
    if (!w) return;
    var magId = getMagIdByWeaponId(w.type); // arma equipada → su cargador
    if (!magId) return; // melee, granadas, armas fuera de catalogo
    if (!w.clip || w.clip < 1) return; // sin capacidad = no hay cargador valido
    var targets = _reloadTargets(w);
    if (!targets) return;
    var hasMag = hasMagazine(w.slot);
    // El cargador montado sale con min(balas, capacidad): no puede haber mas
    // balas fuera de catalogo que capacidad
    var resp = query("items:swapMagazine", {
        magId: magId,
        ammo: Math.min(w.ammo || 0, w.clip),
        mounted: hasMag
    });
    if (resp) {
        setMagazine(w, Math.min(resp.ammo, w.clip));
        setHasMagazine(w.slot, true);
        _startReloadAnim(targets, w, Math.min(resp.ammo, w.clip));
        return;
    }
    // Sin recambio → descarga: el cargador montado pasa al inventario y el
    // arma se queda sin balas; la misma anim de recarga remata la escena
    if (hasMag && (w.ammo || 0) > 0) {
        var out = Math.min(w.ammo, w.clip);
        if (query("items:extractMagazine", { magId: magId, ammo: out })) {
            _unloadWeapon(targets.weapon);
            setHasMagazine(w.slot, false);
            _startReloadAnim(targets, w, 0);
            showTextBox(t("MAG_OUT"));
        } // si no cabe: INV_FUL lo muestra Items y el arma no cambia
        return;
    }
    showTextBox(t("NO_MAG")); // arma ya sin cargador y sin recambio
}

// ============================================================================
// REGISTRO - tecla R (recarga) + cambio de slot (TEST)
// ============================================================================

register({
    name: "Ballistic",
    init: function () {
        _lastSlot = null;
        _known = [];
        _capacities = [];
        _primed = false; // primer escaneo = baseline (sin montar)
        _reloadPending = null; // sin recarga pendiente al cargar partida
        registerModule("Ballistic", { hasMag: {} }); // slots con cargador montado
        // Capacidades: clip de juego = clipSize del catalogo (igual que mag_*)
        syncClipSizes();
    },
    update: function (now) {
        _trackMountedMags();
        _watchdogReload();
        var cur = _readSlotAndType();
        if (Pad.IsKeyJustPressed(KEYS.RELOAD)) tryReload(cur);
        if (!cur) return;
        // Solo actúa al cambiar de slot de arma
        if (_lastSlot !== null && cur.slot === _lastSlot) return;
        _lastSlot = cur.slot;
    }
});
