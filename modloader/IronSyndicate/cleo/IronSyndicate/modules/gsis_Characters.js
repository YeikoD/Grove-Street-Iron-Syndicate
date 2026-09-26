// GSIS - Characters
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Characters - Personajes (nombre + dialogos + actor)
// ============================================================================
// Catalogo: data/gsis_character_data.js
// Orquesta: resuelve personaje + linea → emite dialogue:play con prefijo Nombre:
// Dialogue NO conoce personajes (solo muestra texto); Actors NO conoce personajes.
// EventBus:
//   query  characters:info   { id|actorId } → def | null
//   query  characters:name   { id|actorId } → { key, name, color } | null
//   on     characters:say    { characterId|actorId, key?|text?|lines?|topic?,
//                              params?, ms?, gap?, replace? }
// Depende de: ModuleRegistry, EventBus, L10n (t), character_data
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { on, emit } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";
import { MISC } from "../core/gsis_Config.js";
import {
    CHARACTERS, CHAR_NAME_COLOR,
    getCharacter, getCharacterByActor
} from "../data/gsis_character_data.js";

function _dbg(msg) {
    if (MISC.DEBUG_ENABLED) log(msg);
}

function _resolveChar(d) {
    if (!d) return null;
    if (d.characterId) return getCharacter(d.characterId);
    if (d.id && !d.key && !d.text && !d.lines && !d.topic) return getCharacter(d.id);
    if (d.actorId) return getCharacterByActor(d.actorId);
    // id como characterId shorthand si no es confundible con topic
    if (d.characterId === undefined && d.actorId === undefined && d.id) {
        var byId = getCharacter(d.id);
        if (byId) return byId;
    }
    return null;
}

function _nameInfo(ch) {
    if (!ch || !ch.nameKey) return null;
    var name = t(ch.nameKey);
    if (!name || name === ch.nameKey) return null;
    return {
        key: ch.nameKey,
        name: name,
        color: ch.nameColor || CHAR_NAME_COLOR
    };
}

function _prefixText(nameInfo, text) {
    if (!nameInfo || !text) return text;
    // "~w~Vendedor local~w~: " + linea (la linea conserva su ~r~/~g~ o DEFAULT_COLOR)
    return nameInfo.color + nameInfo.name + "~w~: " + text;
}

function _resolveTopicLine(ch, topic) {
    if (!ch || !ch.lines || !topic) return null;
    var v = ch.lines[topic];
    if (v === undefined || v === null) return null;
    if (typeof v === "string") return { key: v };
    if (Object.prototype.toString.call(v) === "[object Array]") return { keyList: v };
    if (v.key || v.text) return v;
    return null;
}

function _lineToRaw(src, fallbackMs) {
    if (!src) return null;
    if (typeof src === "string") {
        return { key: src, ms: fallbackMs, gap: 0 };
    }
    return {
        key: src.key || null,
        text: src.text || null,
        params: src.params || null,
        ms: (src.ms !== undefined && src.ms > 0) ? src.ms : fallbackMs,
        gap: (src.gap !== undefined && src.gap >= 0) ? src.gap : undefined
    };
}

function _resolveLinesPayload(d, ch) {
    var fallbackMs = (d.ms !== undefined && d.ms > 0) ? d.ms : undefined;
    var out = [];

    // topic del personaje → key o secuencia
    if (d.topic) {
        var resolved = _resolveTopicLine(ch, d.topic);
        if (!resolved) {
            _dbg("[Characters] Topic desconocido: " + d.topic +
                (ch ? " en " + ch.id : " (sin personaje)"));
            return null;
        }
        if (resolved.keyList) {
            for (var i = 0; i < resolved.keyList.length; i++) {
                var ln = _lineToRaw(resolved.keyList[i], fallbackMs);
                if (ln) out.push(ln);
            }
        } else {
            var single = _lineToRaw({
                key: resolved.key,
                text: resolved.text,
                params: d.params || resolved.params,
                ms: d.ms,
                gap: d.gap
            }, fallbackMs);
            if (single) {
                // params del say aplican al topic
                if (d.params) single.params = d.params;
                out.push(single);
            }
        }
        return out.length ? out : null;
    }

    // lines explicitas del payload
    if (d.lines && d.lines.length) {
        for (var j = 0; j < d.lines.length; j++) {
            var ln2 = _lineToRaw(d.lines[j], fallbackMs);
            if (ln2) out.push(ln2);
        }
        return out.length ? out : null;
    }

    // key / text unico
    if (d.key || d.text) {
        var u = _lineToRaw({
            key: d.key,
            text: d.text,
            params: d.params,
            ms: d.ms,
            gap: 0
        }, fallbackMs);
        if (u) out.push(u);
        return out.length ? out : null;
    }

    return null;
}

function _resolveText(raw) {
    if (raw.text) return raw.text;
    if (raw.key) return t(raw.key, raw.params);
    return null;
}

function _onSay(e) {
    var d = (e && e.data) ? e.data : (e || {});
    var ch = _resolveChar(d);
    var nameInfo = _nameInfo(ch);

    var rawLines = _resolveLinesPayload(d, ch);
    if (!rawLines) {
        _dbg("[Characters] say sin lineas validas" +
            (ch ? " (" + ch.id + ")" : ""));
        return;
    }

    // Prefijar nombre → dialogue:play con text resuelto (Dialogue solo pinta)
    var playLines = [];
    for (var i = 0; i < rawLines.length; i++) {
        var text = _resolveText(rawLines[i]);
        if (!text) continue;
        playLines.push({
            text: _prefixText(nameInfo, text),
            ms: rawLines[i].ms,
            gap: rawLines[i].gap
        });
    }
    if (playLines.length === 0) {
        _dbg("[Characters] say: nada que mostrar");
        return;
    }

    var payload = { lines: playLines };
    if (d.replace === true) payload.replace = true;
    if (d.ms !== undefined && d.ms > 0) payload.ms = d.ms;

    emit("dialogue:play", payload);
    _dbg("[Characters] say " + (ch ? ch.id : "?") +
        " → " + playLines.length + " linea(s)");
}

function initCharacters() {
    on("characters:info", function (e) {
        var d = e.data || {};
        e.respond(_resolveChar(d));
    });
    on("characters:name", function (e) {
        var d = e.data || {};
        e.respond(_nameInfo(_resolveChar(d)));
    });
    on("characters:say", _onSay);
    log("[GSIS] Characters: " + CHARACTERS.length + " personajes");
}

register({
    name: "Characters",
    init: initCharacters,
    update: function () { }
});
