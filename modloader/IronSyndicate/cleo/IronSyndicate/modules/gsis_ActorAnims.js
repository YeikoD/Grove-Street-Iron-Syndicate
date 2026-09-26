// GSIS - Actor Anims
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Actor Anims - Animaciones de actores (IFP vanilla)
// ============================================================================
// Natives: REQUEST_ANIMATION (04ED) · HAS_ANIMATION_LOADED (04EE)
//          REMOVE_ANIMATION (04EF) · TASK_PLAY_ANIM (0605)
// NO liberar "PED" (crash). Refcount de ifp como modelos en Actors.
// Catalogo: data/gsis_actor_anim_data.js · idleAnim en data/gsis_actor_data.js
// EventBus:
//   on   anims:play   { id|instanceKey|role, anim, blend?, loop?, time? }
//   on   anims:stop   { id|instanceKey|role }
//   on   actors:spawned { key, id, handle } → idleAnim del def si existe
//   on   actor:died   { key } → limpia pending del key
// Depende de: ModuleRegistry, EventBus, Config, actor_anim_data, actor_data
// NO importa otros módulos — handles solo via query("actors:handle")
// ============================================================================

import { register } from "../core/gsis_ModuleRegistry.js";
import { on, query } from "../core/gsis_EventBus.js";
import { ACTOR_ANIMS as CFG, MISC } from "../core/gsis_Config.js";
import {
    ACTOR_ANIMS, ANIM_DEFAULTS, getAnimDef
} from "../data/gsis_actor_anim_data.js";
import { getActorDef } from "../data/gsis_actor_data.js";

// ifp → refcount mientras hay pending o activa (PED nunca se pide ni libera)
var _ifpRefs = {};
// pending: { key, handle, ifp, animId, name, blend, loop, lockX, lockY, keepLast, time, t0 }
var _pending = [];
// key → { ifp } cuando la anim sigue programada (para stop/died)
var _active = {};
var _lastTick = 0;

function _dbg(msg) {
    if (MISC.DEBUG_ENABLED) log(msg);
}

function _selectorFrom(d) {
    return {
        id: d.id,
        instanceKey: d.instanceKey,
        role: d.role
    };
}

function _resolveHandle(sel) {
    if (!sel) return null;
    return query("actors:handle", _selectorFrom(sel));
}

function _retainIfp(ifp) {
    if (!ifp || ifp === "PED") return;
    _ifpRefs[ifp] = (_ifpRefs[ifp] || 0) + 1;
}

function _releaseIfp(ifp) {
    if (!ifp || ifp === "PED") return;
    var n = (_ifpRefs[ifp] || 0) - 1;
    if (n <= 0) {
        delete _ifpRefs[ifp];
        try { native("REMOVE_ANIMATION", ifp); } catch (e) { }
    } else {
        _ifpRefs[ifp] = n;
    }
}

function _dropPendingAt(i) {
    var p = _pending[i];
    if (!p) return;
    _releaseIfp(p.ifp);
    _pending.splice(i, 1);
}

function _clearPendingForKey(key) {
    for (var i = _pending.length - 1; i >= 0; i--) {
        if (_pending[i].key === key) _dropPendingAt(i);
    }
}

function _releaseActive(key) {
    var a = _active[key];
    if (!a) return;
    _releaseIfp(a.ifp);
    delete _active[key];
}

function _playNow(p) {
    try {
        // 0605: loop/lockX/lockY/keepLast son int en el opcode (1/0)
        native("TASK_PLAY_ANIM",
            p.handle, p.name, p.ifp,
            p.blend,
            p.loop ? 1 : 0,
            p.lockX ? 1 : 0,
            p.lockY ? 1 : 0,
            p.keepLast ? 1 : 0,
            p.time);
        if (_active[p.key]) {
            if (_active[p.key].ifp === p.ifp) {
                _releaseIfp(p.ifp);
            } else {
                _releaseActive(p.key);
            }
        }
        _active[p.key] = { ifp: p.ifp, loop: p.loop, time: p.time };
        _dbg("[ActorAnims] Play " + p.animId + " → " + p.key +
            " (" + p.name + "/" + p.ifp + ")");
    } catch (e) {
        log("[ActorAnims] TASK_PLAY_ANIM fallo (" + p.animId + "): " + e.message);
        _releaseIfp(p.ifp);
    }
}

function _enqueue(key, handle, animId, overrides) {
    var def = getAnimDef(animId);
    if (!def) {
        log("[ActorAnims] Anim desconocida: " + animId);
        return;
    }
    if (!handle) {
        _dbg("[ActorAnims] Sin handle, drop " + animId + " (" + key + ")");
        return;
    }

    // reemplaza pendiente del mismo key (su refcount ya se soltó en clear)
    _clearPendingForKey(key);

    var o = overrides || {};
    var p = {
        key: key,
        handle: handle,
        ifp: def.ifp,
        animId: animId,
        name: def.name,
        blend: (o.blend !== undefined) ? o.blend
            : (def.blend !== undefined) ? def.blend : CFG.DEFAULT_BLEND,
        loop: (o.loop !== undefined) ? !!o.loop
            : (def.loop !== undefined) ? !!def.loop : !!ANIM_DEFAULTS.loop,
        lockX: (def.lockX !== undefined) ? !!def.lockX : !!ANIM_DEFAULTS.lockX,
        lockY: (def.lockY !== undefined) ? !!def.lockY : !!ANIM_DEFAULTS.lockY,
        keepLast: (def.keepLast !== undefined) ? !!def.keepLast : !!ANIM_DEFAULTS.keepLast,
        time: (o.time !== undefined) ? o.time
            : (def.time !== undefined) ? def.time : ANIM_DEFAULTS.time,
        t0: Date.now()
    };

    // pending siempre retiene; playNow transfiere/deduplica al active
    _retainIfp(p.ifp);

    if (p.ifp !== "PED") {
        try {
            native("REQUEST_ANIMATION", p.ifp);
            _dbg("[ActorAnims] REQUEST " + p.ifp + " (" + animId + ")");
        } catch (e) {
            log("[ActorAnims] REQUEST_ANIMATION " + p.ifp + ": " + e.message);
        }
    }
    _pending.push(p);
}

function _handleForKey(key) {
    var h = query("actors:handle", { instanceKey: key });
    if (h) return h;
    h = query("actors:handle", { id: key });
    if (h) return h;
    return query("actors:handle", { role: key });
}

function _stopForKey(key) {
    _clearPendingForKey(key);
    if (!_active[key]) return;
    var h = _handleForKey(key);
    if (h) {
        try { native("CLEAR_CHAR_TASKS", h); } catch (e) { }
    }
    _releaseActive(key);
    _dbg("[ActorAnims] Stop " + key);
}

function _onSpawned(e) {
    var d = e || {};
    var def = getActorDef(d.id);
    if (!def || !def.idleAnim) return;
    _dbg("[ActorAnims] Spawned " + (d.key || d.id) +
        " → idleAnim " + def.idleAnim);
    _enqueue(d.key || d.id, d.handle, def.idleAnim, null);
}

function _onDied(e) {
    var d = e || {};
    var key = d.key || d.id;
    _clearPendingForKey(key);
    _releaseActive(key);
}

function _onPlay(e) {
    var d = e || {};
    if (!d.anim) {
        log("[ActorAnims] anims:play sin anim");
        return;
    }
    var handle = _resolveHandle(d);
    if (!handle) {
        _dbg("[ActorAnims] anims:play sin handle (" + d.anim + ")");
        return;
    }
    var key = d.instanceKey || d.id || d.role || "?";
    _enqueue(key, handle, d.anim, d);
}

function _onStop(e) {
    var d = e || {};
    var key = d.instanceKey || d.id || d.role;
    if (!key) {
        log("[ActorAnims] anims:stop sin selector");
        return;
    }
    _stopForKey(key);
}

function _processPending(now) {
    for (var i = _pending.length - 1; i >= 0; i--) {
        var p = _pending[i];
        if (now - p.t0 > CFG.LOAD_TIMEOUT_MS) {
            log("[ActorAnims] Timeout IFP " + p.ifp + " (" + p.animId + ")");
            _dropPendingAt(i);
            continue;
        }
        var loaded = true;
        if (p.ifp !== "PED") {
            try { loaded = !!native("HAS_ANIMATION_LOADED", p.ifp); } catch (e) {
                // si el native falla, reintenta (no crashea)
                loaded = false;
            }
        }
        if (loaded) {
            _playNow(p);
            _pending.splice(i, 1);
        }
    }
}

function initActorAnims() {
    on("actors:spawned", _onSpawned);
    on("actor:died", _onDied);
    on("anims:play", _onPlay);
    on("anims:stop", _onStop);
    log("[GSIS] ActorAnims: " + ACTOR_ANIMS.length + " anims");
}

function updateActorAnims(now) {
    if (_pending.length === 0) return;
    if (now - _lastTick < CFG.TICK_MS) return;
    _lastTick = now;
    _processPending(now);
}

register({
    name: "ActorAnims",
    init: initActorAnims,
    update: updateActorAnims
});
