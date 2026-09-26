// GSIS - Dialogue
// Copyright (C) 2026  YeikoD
// Licencia: GNU GPL v3 o posterior (texto completo en LICENSE).

// ============================================================================
// GSIS Dialogue - Subtitulos / dialogos (00BB PRINT lowpriority)
// ============================================================================
// Cola propia con timing (una linea o secuencia). Sin vinculo a actores.
// EventBus:
//   on     dialogue:play       { key, ms?, params? } | { lines:[...], replace? }
//   on     dialogue:stop       {}
//   query  dialogue:isPlaying  {} → bool
// Line: { key?, text?, params?, ms?, gap? }  — gap solo entre lineas
// Render: t()/literal + DEFAULT_COLOR si no trae ~x~ → PRINT_STRING
// Depende de: Config (DIALOGUE, MISC), ModuleRegistry, EventBus, L10n (t, hasKey)
// ============================================================================

import { DIALOGUE, MISC } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { on } from "../core/gsis_EventBus.js";
import { t, hasKey } from "../core/gsis_L10n.js";

var _queue = [];      // lineas pendientes { key?, text?, params?, ms, gap }
var _active = false;  // mostrando linea actual
var _until = 0;       // fin de linea actual (Date.now)
var _gapUntil = 0;    // fin de gap antes de la siguiente
var _inGap = false;
var _pendingGap = 0;  // gap a aplicar al terminar la linea actual

function _dbg(msg) {
    if (MISC.DEBUG_ENABLED) log(msg);
}

function _normalizeLine(raw, fallbackMs) {
    if (!raw) return null;
    var line = {
        key: raw.key || null,
        text: raw.text || null,
        params: raw.params || null,
        ms: (raw.ms !== undefined && raw.ms > 0) ? raw.ms : fallbackMs,
        gap: (raw.gap !== undefined && raw.gap >= 0) ? raw.gap : DIALOGUE.GAP
    };
    if (!line.key && !line.text) return null;
    return line;
}

function _normalizePayload(d) {
    var out = [];
    var fallback = (d.ms !== undefined && d.ms > 0) ? d.ms : DIALOGUE.DEFAULT_MS;

    if (d.lines && d.lines.length) {
        for (var i = 0; i < d.lines.length; i++) {
            var ln = _normalizeLine(d.lines[i], fallback);
            if (ln) out.push(ln);
        }
        return out;
    }

    // Linea unica: { key | text, ms?, params? }
    var single = _normalizeLine({
        key: d.key,
        text: d.text,
        params: d.params,
        ms: d.ms,
        gap: 0
    }, fallback);
    if (single) out.push(single);
    return out;
}

// Color por defecto si la linea no trae codigo ~x~
function _withColor(text) {
    if (!text) return text;
    if (text.indexOf("~") !== -1) return text;
    return (DIALOGUE.DEFAULT_COLOR || "~w~") + text;
}

function _showLine(line) {
    try {
        if (line.key && !hasKey(line.key)) {
            _dbg("[Dialogue] Key desconocida: " + line.key);
        }
        var text = line.text;
        if (!text && line.key) text = t(line.key, line.params);
        if (!text) return;
        text = _withColor(text);
        native("PRINT_STRING", text, line.ms, DIALOGUE.FLAG);
        _dbg("[Dialogue] PRINT_STRING " + (line.key || "text") + " (" + line.ms + "ms)");
    } catch (e) {
        log("[Dialogue] Error mostrar linea: " + e.message);
    }
}

function _startNext(now) {
    if (_queue.length === 0) {
        _active = false;
        _inGap = false;
        return;
    }
    var line = _queue.shift();
    _active = true;
    _inGap = false;
    _showLine(line);
    _until = now + line.ms;
    _pendingGap = line.gap;
}

function _clearPrints() {
    try { native("CLEAR_PRINTS"); } catch (e) { }
}

function _onPlay(e) {
    var d = e || {};
    if (d.data && (d.data.key || d.data.text || d.data.lines)) d = d.data;

    var lines = _normalizePayload(d || {});
    if (lines.length === 0) {
        _dbg("[Dialogue] play sin lineas validas");
        return;
    }

    if (d.replace === true) {
        _queue.length = 0;
        _active = false;
        _inGap = false;
        _pendingGap = 0;
        _clearPrints();
    }

    var free = DIALOGUE.MAX_QUEUE - _queue.length;
    if (free <= 0) {
        _dbg("[Dialogue] Cola llena — omitido");
        return;
    }
    for (var i = 0; i < lines.length && i < free; i++) {
        _queue.push(lines[i]);
    }
    if (lines.length > free) {
        _dbg("[Dialogue] Cola recortada a " + DIALOGUE.MAX_QUEUE);
    }

    if (!_active && !_inGap) {
        _startNext(Date.now());
    }
}

function _onStop() {
    _queue.length = 0;
    _active = false;
    _inGap = false;
    _pendingGap = 0;
    _clearPrints();
    _dbg("[Dialogue] Stop");
}

function _onIsPlaying(e) {
    if (e && typeof e.respond === "function") {
        e.respond(_active || _inGap || _queue.length > 0);
    }
}

function initDialogue() {
    _queue.length = 0;
    _active = false;
    _inGap = false;
    _pendingGap = 0;
    on("dialogue:play", _onPlay);
    on("dialogue:stop", _onStop);
    on("dialogue:isPlaying", _onIsPlaying);
}

function updateDialogue(now) {
    if (!_active && !_inGap) return;

    if (_active && now >= _until) {
        _active = false;
        if (_queue.length > 0) {
            if (_pendingGap > 0) {
                _inGap = true;
                _gapUntil = now + _pendingGap;
            } else {
                _startNext(now);
            }
        }
        return;
    }

    if (_inGap && now >= _gapUntil) {
        _inGap = false;
        _startNext(now);
    }
}

register({
    name: "Dialogue",
    init: initDialogue,
    update: updateDialogue
});
