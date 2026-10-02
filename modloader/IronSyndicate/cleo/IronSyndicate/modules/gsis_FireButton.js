// GSIS - FireButton
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS FireButton - El boton de disparo se deshabilita cuando el arma esta vacia
// ============================================================================
// UNA sola regla: si el arma de la mano no tiene balas, el boton de disparo se
// desactiva. Con balas —o sin arma que lo admita— se vuelve a activar.
//
// Y una sola cosa mas: cuando esta vacia y el jugador aprieta, el martillo.
//
// ============================================================================
// EL MARTILLO: POR QUE AHORA ES UN STREAM 2D
// ============================================================================
// El modulo replica en JS el mod KeepNoAmmo (Junior_Djjr), que ademas de esto
// reproducía el martillo con un .wav.
//
// El primer intento uso un stream 3D (0x0AC1) y fallo por tres cosas a la vez:
//
//   1. AudioStream3D   no existe en este build. La documentacion de CLEO Redux
//      lista Player, Car, Char, Checkpoint y Text, y Pad tiene cuatro metodos,
//      todos de teclas. AudioStream3D no esta en ninguno de los 25 plugins de
//      cleo\cleo_plugins. El codigo lo llamaba igual, recibia algo truthy sin
//      haber cargado nada, y `_playClick` reventaba con un catch que se lo comia.
//   2. la ruta del .wav  apuntaba a sounds/dryfire.wav, que es donde ModLoader
//      montaria el archivo si tuviera handler para .wav. No lo tiene: en
//      modloader.log dice "No handler or callme for file sounds\dryfire.wav".
//      El archivo no se copia a la raiz del juego, y ahi vivian los otros .wav.
//   3. Pad.IsButtonPressed y Pad.GetControllerMode tampoco existen, asi que la
//      deteccion del disparo devolvia false siempre y el click nunca se pedia.
//      Ese ultimo bug rompia SOLO el sonido: era el unico uso que tenia.
//
// Ademas el boton de disparo se deshabilitaba con el offset equivocado de
// m_eWeaponFire (0x1C, que es m_animGroup) y nunca llegaba al chequeo de balas.
// Ese fix es del boton, no del sonido, y quedo.
//
// Ahora: 2D (0x0AAC) y `native()`, que es la via documentada. Un stream 3D
// ademas necesita su posicion (SET_PLAY_3D_AUDIO_STREAM_AT_CHAR) y despues se
// atenua con la distancia; para un martillo seco eso son dos pasos que no
// aportan nada, el 2D suena igual desde donde lo dispares.
//
// VERIFICADO EN JUEGO el 02/10/2026: el martillo suena, y el stream se puede
// volver a disparar sin recargarlo entre pulsaciones. No tocar esta secuencia.
//
// Secuencia, la misma de los .cs de siempre:
//   0x0AAC  LOAD_AUDIO_STREAM       (ruta)                 -> handle
//   0x0ABC  SET_AUDIO_STREAM_VOLUME (handle, volumen)
//   0x0AAD  SET_AUDIO_STREAM_STATE  (handle, 1)            1 = play
//
// QUE HACE CADA FRAME (solo jugador 0):
//   muerto / sin control / en coche / sin arma / arma que no dispara directo
//     → SET_PLAYER_FIRE_BUTTON(true)
//   clip == 0 y total == 0 → SET_PLAYER_FIRE_BUTTON(false), una sola vez
//     y si el boton izquierdo esta apretado, martillo
//   con balas             → SET_PLAYER_FIRE_BUTTON(true)
//
// Nativos: SET_PLAYER_FIRE_BUTTON (0881) y los tres de audio. Los de arma los
// pide core/gsis_Engine.js, que es el unico lugar con offsets y natives de arma.
// Memoria: una sola lectura, el volumen general del juego. Los offsets de
// CWeapon y de CWeaponInfo viven en Engine.
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { AUDIO } from "../core/gsis_Config.js";
// La capa de armas. Antes este archivo declaraba sus propias copias de 0x5A0,
// 0x718, 28, 0x8 y 0xC, y su propia copia de la conversion de handle a
// direccion. Las dos cosas son una sola ahora.
import * as Engine from "../core/gsis_Engine.js";

var _VK_LBUTTON = 1;   // VK_LBUTTON: el martillo es el disparador, no un mando
var _VOL_GAME   = 11926732;  // volumen general de audio del juego (el .cs leia esta)

var _fireOff    = false;  // ya deshabilitamos el boton: no lo volvemos a desactivar
var _stream     = 0;      // handle del stream 2D, cargado una vez en init
var _clickLatch = false;  // el click se dispara por FRONTE de pulsacion, no por nivel

// Activa el boton de disparo. Solo emite el native cuando el estado cambia, para no
// llamar un native 60 veces por frame.
function _enableFire() {
    if (!_fireOff) return;
    try {
        native("SET_PLAYER_FIRE_BUTTON", new Player(0), true);
        _fireOff = false;
    } catch (e) { /* native fallido: reintenta el proximo frame */ }
}

// Desactiva el boton de disparo, y solo una vez mientras siga vacio.
function _disableFire() {
    if (_fireOff) return;
    try {
        native("SET_PLAYER_FIRE_BUTTON", new Player(0), false);
        _fireOff = true;
    } catch (e) { /* native fallido: reintenta el proximo frame */ }
}

// Carga el .wav una sola vez. 0x0AAC devuelve -1 si no puede abrirlo, asi que el
// handle se prueba contra 0 Y contra -1 antes de usarlo.
function _cargarStream() {
    try {
        _stream = native("LOAD_AUDIO_STREAM", AUDIO.DRYFIRE_PATH) | 0;
    } catch (e) {
        _stream = -1;
    }
}

// El volumen general del juego multiplicado por el factor del mod: si el jugador
// tiene el audio bajo, el martillo tambien.
function _volumen() {
    try {
        var v = new Memory().readFloat(_VOL_GAME);
        if (v > 0 && v <= 1) return v * AUDIO.DRYFIRE_VOLUME;
    } catch (e) { /* sin memoria: usamos el factor solo */ }
    return AUDIO.DRYFIRE_VOLUME;
}

function _playClick() {
    if (_stream <= 0) return;
    try {
        native("SET_AUDIO_STREAM_VOLUME", _stream, _volumen());
        native("SET_AUDIO_STREAM_STATE", _stream, 1);   // 1 = play
    } catch (e) { /* sin audio: el martillo es opcional, el boton no */ }
}

// El unico metodo de disparo que existe es por tecla: VK_LBUTTON.
function _isFiring() {
    try { return Pad.IsKeyDown(_VK_LBUTTON) === true; } catch (e) { return false; }
}

register({
    name: "FireButton",
    init: function () {
        _fireOff = false;
        _clickLatch = false;
        _cargarStream();
        log("[FireButton] stream dryfire handle " + _stream + " (" + AUDIO.DRYFIRE_PATH + ")");
    },
    update: function () {
        var c;
        try {
            c = new Player(0).getChar();
        } catch (e) { return; }
        if (!c) return;

        // Los tres guards del original (@42-@46). Con cualquiera se reactiva el
        // boton: si el jugador no esta manejando el personaje, no es este modulo el
        // que decide si puede disparar.
        try {
            if (Engine.isCharDead(c)) { _enableFire(); return; }
            if (!Engine.isPlayerControlOn()) { _enableFire(); return; }
            if (Engine.isCharInAnyCar(c)) { _enableFire(); return; }
        } catch (e) { return; }

        try {
            var ped = Engine.pedPointer(c);
            if (!ped) return;
            var slot = Engine.selectedSlot(ped);
            if (!slot) { _enableFire(); return; }  // slot 0 = sin arma (su @76)

            var infoAddr = Engine.currentWeaponInfoAddress(c);
            if (!infoAddr) { _enableFire(); return; }

            // m_eWeaponFire en CWeaponInfo+0x00. Solo las armas de disparo directo
            // tienen el boton; un lanzallamas o un spray no pasan por el boton de
            // disparo y no hay nada que deshabilitar ahi.
            if (Engine.infoFireType(infoAddr) !== 1) { _enableFire(); return; }

            var weapon = Engine.slotAddress(ped, slot);
            if (Engine.slotClip(weapon) === 0 && Engine.slotTotal(weapon) === 0) {
                _disableFire();

                // El boton ya esta apagado, asi que la pulsacion llega igual pero el
                // motor no dispara. Por eso el martillo se busca aca y no antes: es
                // el unico punto del frame donde sabemos que el arma esta vacia.
                if (_isFiring()) {
                    if (!_clickLatch) {
                        _clickLatch = true;
                        _playClick();
                    }
                } else {
                    _clickLatch = false;
                }
                return;
            }
            _clickLatch = false;
            _enableFire();
        } catch (e) { /* sin memoria: sin gestion este frame */ }
    }
});