// GSIS - FireButton
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS FireButton - Boton de disparo con arma vacia + click seco
// ============================================================================
// Replica en JS la logica del mod KeepNoAmmo (Junior_Djjr), con el fix que a
// su .cs le falta: si m_nAmmoTotal > 0 el boton SIEMPRE se reactiva (su rama
// de modo A hace return temprano sin pasar por la limpieza @1026, asi que
// tras recargar el arma quedaba muda pese a mostrar balas en el contador).
// El .cs original se elimino; KeepNoAmmo.SA.asi sigue en
// modloader/IronSyndicate/. El wav es modloader/IronSyndicate/sounds/dryfire.wav
// (modloader lo monta como sounds/dryfire.wav en la raiz del juego).
// Cada frame (solo jugador 0):
//   guards (muerto / control off / en coche) o slot 0 o arma sin
//     WEAPON_FIRE_INSTANT_HIT → SET_PLAYER_FIRE_BUTTON(true)  (su cleanup)
//   secos (total==0 && clip==0) → SET_PLAYER_FIRE_BUTTON(false) con flag
//     (su 5@) + click seco: flanco de disparo (su 7@) + modo de camara →
//     AudioStream3D anclado a CJ, volumen = camara * AUDIO.DRYFIRE_VOLUME
//   con balas (total>0 o clip>0) → SET_PLAYER_FIRE_BUTTON(true)   ← FIX
// Excluido del original: combo de drop LS1+DpadLeft (reemplazo del script
// 'WEADROP') y el loop de 2 jugadores.
// Nativos: SET_PLAYER_FIRE_BUTTON (0881), IS_CHAR_DEAD (0118),
// IS_PLAYER_CONTROL_ON (09E7), IS_CHAR_IN_ANY_CAR (00DF), GET_PED_POINTER
// (0A96), GET_CURRENT_CHAR_WEAPONINFO (0E83); Pad.IsButtonPressed (00E1),
// Pad.GetControllerMode (0293); AudioStream3D.Load (0AC1) + setPlayAtChar
// (0AC4), setVolume (0ABC), setState (0AAD, Play=1).
// Memoria: slot ped+0x718, m_aWeapons ped+0x5A0 (CWeapon 28b: clip +0x8,
// total +0xC), CWeaponInfo+0 = m_eWeaponFire (1 = INSTANT_HIT); camara word
// 11989416 ∈ {5,7,8,46,51,53,65}; volumen float 11926732.
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { AUDIO } from "../core/gsis_Config.js";

var _WEAPONS_OFF = 0x5A0;     // CPed::m_aWeapons (CWeapon[13])
var _SLOT_OFF = 0x718;        // CPed::m_nSelectedWepSlot (uint8)
var _WEAPON_SIZE = 28;        // sizeof(CWeapon)
var _W_CLIP = 0x8;            // CWeapon::m_nAmmoInClip
var _W_AMMO = 0xC;            // CWeapon::m_nAmmoTotal
var _CAMMODE_ADDR = 11989416; // word: modo de camara actual
var _CAMVOL_ADDR = 11926732;  // float: volumen de referencia de audio
var _BTN_CIRCLE = 17;         // Button.Circle (disparo en PC)
var _BTN_RS2 = 7;             // Button.RightShoulder2 (pad modo 1)
var _BTN_LS1 = 4;             // Button.LeftShoulder1 (pad demas modos)
var _AIM_CAMS = [5, 7, 8, 46, 51, 53, 65]; // camaras donde suena el click

var _stream = null;      // AudioStream3D (null = sin wav de click)
var _fireOff = false;    // ya deshabilitamos el boton (su 5@)
var _clickLatch = false; // click sonado en esta pulsacion (su 7@)

// Direccion entera de CWeaponInfo* (handle WeaponInfo → number)
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

// Emite el native solo en transicion (sin spamear cada frame)
function _enableFire() {
    if (!_fireOff) return;
    try {
        native("SET_PLAYER_FIRE_BUTTON", new Player(0), true);
        _fireOff = false;
    } catch (e) { /* native fallido: reintenta el proximo frame */ }
}

function _disableFire() {
    if (_fireOff) return;
    try {
        native("SET_PLAYER_FIRE_BUTTON", new Player(0), false);
        _fireOff = true;
    } catch (e) { /* native fallido: reintenta el proximo frame */ }
}

// _isFiring — su @1068: Circle (PC) o pad segun controller mode
function _isFiring() {
    try {
        if (Pad.IsButtonPressed(0, _BTN_CIRCLE)) return true;
    } catch (e) { /* sin pad: probamos el branch de mando */ }
    try {
        var mode = Pad.GetControllerMode();
        var btn = mode === 1 ? _BTN_RS2 : _BTN_LS1;
        return !!Pad.IsButtonPressed(0, btn);
    } catch (e) {
        return false;
    }
}

// _aimCamOk — su @1138: solo en camaras de apuntado suena el click
function _aimCamOk() {
    try {
        var mode = Memory.ReadI16(_CAMMODE_ADDR, false);
        return _AIM_CAMS.indexOf(mode) >= 0;
    } catch (e) {
        return false;
    }
}

// _playClick — su @689: stream anclado a CJ con el volumen actual
function _playClick(c) {
    if (!_stream) return;
    try {
        _stream.setPlayAtChar(c);
        _stream.setVolume(Memory.ReadFloat(_CAMVOL_ADDR, false) * AUDIO.DRYFIRE_VOLUME);
        _stream.setState(1); // AudioStreamAction.Play
    } catch (e) { /* sin click: el resto de la logica sigue */ }
}

register({
    name: "FireButton",
    init: function () {
        _stream = null;
        _fireOff = false;
        _clickLatch = false;
        try {
            _stream = AudioStream3D.Load(AUDIO.DRYFIRE_PATH); // undefined si falta el wav
        } catch (e) {
            _stream = null;
        }
        if (!_stream) log("FireButton: sin click seco (" + AUDIO.DRYFIRE_PATH + ")");
    },
    update: function () {
        var c;
        try {
            c = new Player(0).getChar();
        } catch (e) { return; }
        if (!c) return;
        // Guards (su @42-@46): cualquiera → boton activo y salimos
        try {
            if (native("IS_CHAR_DEAD", c)) { _enableFire(); return; }
            if (!native("IS_PLAYER_CONTROL_ON", new Player(0))) { _enableFire(); return; }
            if (native("IS_CHAR_IN_ANY_CAR", c)) { _enableFire(); return; }
        } catch (e) { return; }
        try {
            var ped = native("GET_PED_POINTER", c);
            if (!ped) return;
            var slot = Memory.ReadU8(ped + _SLOT_OFF, false);
            if (!slot) { _enableFire(); return; } // slot 0 = sin arma (su @76)
            var infoAddr = _infoAddr(native("GET_CURRENT_CHAR_WEAPONINFO", c));
            if (!infoAddr) { _enableFire(); return; }
            // m_eWeaponFire en CWeaponInfo+0: solo armas de disparo directo
            if (Memory.ReadI32(infoAddr, false) !== 1) { _enableFire(); return; }
            var weapon = ped + _WEAPONS_OFF + slot * _WEAPON_SIZE;
            var clip = Memory.ReadI32(weapon + _W_CLIP, false);
            var total = Memory.ReadI32(weapon + _W_AMMO, false);
            if (clip === 0 && total === 0) {
                _disableFire();
                // Click seco: una vez por pulsacion (flanco + latch, su @689)
                if (_isFiring()) {
                    if (!_clickLatch && _aimCamOk()) _playClick(c);
                    _clickLatch = true;
                } else {
                    _clickLatch = false;
                }
                return;
            }
            // FIX (su modo A no lo hace): con balas el boton siempre activo
            _enableFire();
        } catch (e) { /* sin memoria: sin gestion este frame */ }
    }
});
