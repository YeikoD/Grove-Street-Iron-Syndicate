// ============================================================================
// GSIS Actors - Spawn lifecycle de peds (permanent + descartables)
// ============================================================================
// Catalogo: data/gsis_actor_data.js
// Placement: opts x/y/z > def.spawn absoluto (independiente de esferas/spots)
// Esferas F: data/gsis_spot_data.js — NO se ligan a actores
// Interior: permanentes esperan a areaId === 0 (igual que Spawner)
// Dormancy (permanents): radio ENTER/EXIT → dormant (sin handle/modelo)
//   dormant ──dist<=ENTER──► pending ──► ready ──► dead (confirm x2)
//   ready   ──dist>=EXIT───► dormant
// EventBus:
//   query  actors:handle   { id|instanceKey|role } → handle|null (null si dormant/dead)
//   query  actors:handles  { role } → handle[]
//   on     actors:spawn    { templateId, instanceKey?, x?, y?, z?, heading? }
//   on     actors:despawn  { id|instanceKey|role }
//   on     actors:task     { id|instanceKey|role, task, args? }
//   emit   actors:spawned  { key, id, role, instanceKey?, handle }
//   emit   actor:died      { key, id, role }
// Depende de: Config (ACTORS), ModuleRegistry, EventBus, actor_data
// ============================================================================

import { ACTORS as ACTORS_CFG, MISC, SPECIAL_MODELS } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { on, emit } from "../core/gsis_EventBus.js";
import { ACTORS, getActorDef } from "../data/gsis_actor_data.js";

var _entries = {};    // key → entry
var _byRole = {};     // role → [key, ...]
var _queue = [];      // keys pendientes de create (modelo cargando)
var _readyKeys = [];  // keys con handle vivo (checks de muerte)
var _permKeys = [];   // keys permanentes (sweep de dormancy)
var _modelUsers = {}; // model → refcount
var _specialModelIds = {};    // fileName → modelId (0E9A custom dff)
var _specialCharModels = {};  // modelId → true (023C special chars del juego, p.ej. EMMET)
var _specialModelsLoaded = false;
var _seq = 1;
var _lastCheck = 0;
var _checkCursor = 0;
var _pendingInitSpawn = false; // espera a exterior al cargar en interior

// entry: { key, def, role, model, lifetime, coords, heading, onSpawn,
//          autoDespawnOnDeath, instanceKey, state, handle, _miss }
// state: pending | ready | dormant | dead | despawned

// ============================================================================
// INTERNAS — registry / models / listas
// ============================================================================

function _dbg(msg) {
    if (MISC.DEBUG_ENABLED) log(msg);
}

function _addToRole(role, key) {
    if (!_byRole[role]) _byRole[role] = [];
    if (_byRole[role].indexOf(key) === -1) _byRole[role].push(key);
}

function _removeFromRole(role, key) {
    var list = _byRole[role];
    if (!list) return;
    var idx = list.indexOf(key);
    if (idx !== -1) list.splice(idx, 1);
}

function _addReady(key) {
    if (_readyKeys.indexOf(key) === -1) _readyKeys.push(key);
}

function _removeReady(key) {
    var idx = _readyKeys.indexOf(key);
    if (idx === -1) return;
    _readyKeys.splice(idx, 1);
    if (_checkCursor > idx) _checkCursor--;
    if (_checkCursor >= _readyKeys.length) _checkCursor = 0;
}

function _isSpecialModelId(model) {
    if (_specialCharModels[model]) return true;
    for (var fileName in _specialModelIds) {
        if (_specialModelIds[fileName] === model) return true;
    }
    return false;
}

function _retainModel(model) {
    if (_modelUsers[model] === undefined) {
        _modelUsers[model] = 0;
        // Modelos especiales: ya cargados por LOAD_SPECIAL_CHARACTER (023C)
        // o LOAD_SPECIAL_CHARACTER_FOR_ID (0E9A, dffs custom)
        if (!_isSpecialModelId(model)) {
            try { native("REQUEST_MODEL", model); } catch (e) { }
        }
    }
    _modelUsers[model]++;
}

function _releaseModel(model) {
    if (_modelUsers[model] === undefined) return;
    _modelUsers[model]--;
    if (_modelUsers[model] <= 0) {
        _modelUsers[model] = 0;
        // Modelos especiales: mantener cargados (reuso, sin streaming)
        if (!_isSpecialModelId(model)) {
            try { native("MARK_MODEL_AS_NO_LONGER_NEEDED", model); } catch (e) { }
        }
    }
}

function _findEntry(selector) {
    if (!selector) return null;
    if (selector.instanceKey && _entries[selector.instanceKey]) {
        return _entries[selector.instanceKey];
    }
    if (selector.id && _entries[selector.id]) {
        return _entries[selector.id];
    }
    if (selector.id) {
        for (var k in _entries) {
            if (_entries.hasOwnProperty(k) && _entries[k].def.id === selector.id) {
                return _entries[k];
            }
        }
    }
    if (selector.role) {
        var list = _byRole[selector.role] || [];
        for (var i = 0; i < list.length; i++) {
            var e = _entries[list[i]];
            if (e && e.state === "ready" && e.handle) return e;
        }
        for (var j = 0; j < list.length; j++) {
            if (_entries[list[j]]) return _entries[list[j]];
        }
    }
    return null;
}

function _dequeue(key) {
    var qIdx = _queue.indexOf(key);
    if (qIdx !== -1) _queue.splice(qIdx, 1);
}

function _cleanupEntry(entry) {
    if (!entry) return;
    if (entry.handle) {
        try { native("SET_CHAR_STAY_IN_SAME_PLACE", entry.handle, false); } catch (e) { }
        try { native("MARK_CHAR_AS_NO_LONGER_NEEDED", entry.handle); } catch (e) { }
        try { native("DELETE_CHAR", entry.handle); } catch (e) { }
        entry.handle = null;
    }
    if (entry.state !== "dead" && entry.state !== "despawned") {
        entry.state = "despawned";
    }
    _removeReady(entry.key);
    var pi = _permKeys.indexOf(entry.key);
    if (pi !== -1) _permKeys.splice(pi, 1);
    _releaseModel(entry.model);
    _removeFromRole(entry.role, entry.key);
    _dequeue(entry.key);
    delete _entries[entry.key];
}

function _createEntry(def, opts) {
    opts = opts || {};
    var key;
    if (opts.instanceKey) {
        key = opts.instanceKey;
    } else if (def.lifetime === "permanent") {
        key = def.id;
    } else {
        key = def.id + "#" + (_seq++);
    }

    if (_entries[key]) return _entries[key];

    var coords = null;
    var heading = opts.heading;
    if (opts.x !== undefined && opts.y !== undefined && opts.z !== undefined) {
        coords = { x: opts.x, y: opts.y, z: opts.z };
        if (heading === undefined) heading = 0;
    } else if (def.spawn) {
        coords = { x: def.spawn.x, y: def.spawn.y, z: def.spawn.z };
        if (heading === undefined) heading = def.spawn.heading || 0;
    }
    if (!coords) {
        log("[Actors] Sin spawn para id=" + def.id + " role=" + def.role);
        return null;
    }

    var startDormant = opts.dormant === true;
    var entry = {
        key: key,
        def: def,
        role: def.role,
        model: def.model,
        lifetime: def.lifetime || "permanent",
        coords: coords,
        heading: heading || 0,
        onSpawn: def.onSpawn || [],
        autoDespawnOnDeath: def.autoDespawnOnDeath === true,
        instanceKey: opts.instanceKey || null,
        state: startDormant ? "dormant" : "pending",
        handle: null,
        _miss: 0
    };

    _entries[key] = entry;
    _addToRole(entry.role, key);
    if (startDormant) {
        if (_permKeys.indexOf(key) === -1) _permKeys.push(key);
    } else {
        _retainModel(entry.model);
    }
    return entry;
}

// ============================================================================
// MODELOS ESPECIALES (CLEO+ LOAD_SPECIAL_CHARACTER_FOR_ID)
// ============================================================================
// GET_MODEL_DOESNT_EXIST_IN_RANGE → ID disponible (15000-15024)
// LOAD_SPECIAL_CHARACTER_FOR_ID <id> <nombre> → carga modelo en ese ID
// Requiere que los archivos .dff/.txd estén en carpeta accesible por el juego

// ============================================================================
// SPECIAL CHARS DEL JUEGO (023C LOAD_SPECIAL_CHARACTER — p.ej. EMMET)
// ============================================================================
// NO es 0E9A (eso es solo dffs nuevos en ModLoader).
// slot → model id = 289 + slot (rango 290-299). Se mantiene cargado como fam5.

function _initSpecialCharacters() {
    for (var i = 0; i < ACTORS.length; i++) {
        var a = ACTORS[i];
        var sc = a.specialCharacter;
        if (!sc || !sc.name || !sc.slot) continue;
        var modelId = 289 + sc.slot;
        try {
            native("LOAD_SPECIAL_CHARACTER", sc.slot, sc.name);
            _specialCharModels[modelId] = true;
            log("[Actors] Special char request: " + sc.name +
                " slot " + sc.slot + " → model " + modelId);
        } catch (e) {
            log("[Actors] ERROR LOAD_SPECIAL_CHARACTER " + sc.name + ": " + e.message);
        }
    }
}

function _initSpecialModels() {
    if (_specialModelsLoaded || !SPECIAL_MODELS.ENABLED) {
        _dbg("[Actors] _initSpecialModels saltada - ya cargada o deshabilitada");
        _specialModelsLoaded = true;
        _initSpecialCharacters();
        _assignSpecialModelsToActors();
        return;
    }

    var files = SPECIAL_MODELS.FILES || [];
    log("[Actors] Cargando " + files.length + " modelos especiales...");

    var usedIds = {};  // rastrear IDs asignados en este loop
    for (var i = 0; i < files.length; i++) {
        var fileName = files[i];

        // Verificar que el modelo existe por nombre
        var available = false;
        try { available = native("IS_MODEL_AVAILABLE_BY_NAME", fileName); } catch (e) { }
        if (!available) {
            log("[Actors] WARN: Modelo no encontrado por nombre: " + fileName +
                " (¿archivos en carpeta ModLoader?)");
            continue;
        }

        // Obtener ID disponible en el rango (saltando ya usados)
        var modelId = 0;
        var searchStart = SPECIAL_MODELS.RANGE_START;
        while (searchStart <= SPECIAL_MODELS.RANGE_END) {
            var candidate = 0;
            try {
                candidate = native("GET_MODEL_DOESNT_EXIST_IN_RANGE",
                    searchStart, SPECIAL_MODELS.RANGE_END);
            } catch (e) {
                log("[Actors] ERROR GET_MODEL_DOESNT_EXIST_IN_RANGE: " + e.message);
                break;
            }
            if (!candidate) break;
            if (!usedIds[candidate]) {
                modelId = candidate;
                break;
            }
            searchStart = candidate + 1;  // ya usado → buscar desde el siguiente
        }

        if (!modelId) {
            log("[Actors] ERROR: Sin ID disponible para " + fileName);
            continue;
        }

        // Cargar modelo especial en ese ID
        try {
            native("LOAD_SPECIAL_CHARACTER_FOR_ID", modelId, fileName);
            _specialModelIds[fileName] = modelId;
            usedIds[modelId] = true;
            log("[Actors] Especial cargado: " + fileName + " → ID " + modelId);
        } catch (e) {
            log("[Actors] ERROR LOAD_SPECIAL_CHARACTER_FOR_ID " + fileName + ": " + e.message);
        }
    }

    // Forzar carga de todos los modelos especiales
    if (Object.keys(_specialModelIds).length > 0) {
        try { native("LOAD_ALL_MODELS_NOW"); } catch (e) { }
    }

    _specialModelsLoaded = true;
    log("[Actors] Especiales listos: " + JSON.stringify(_specialModelIds));
    _initSpecialCharacters();
    _assignSpecialModelsToActors();
}

function _assignSpecialModelsToActors() {
    for (var j = 0; j < ACTORS.length; j++) {
        var actor = ACTORS[j];
        if (actor.isSpecialModel && actor.modelFile) {
            var id = _specialModelIds[actor.modelFile];
            if (id) {
                actor.model = id;
                log("[Actors] Actor " + actor.id + " → modelo ID " + id);
            } else {
                log("[Actors] ERROR: Sin ID para actor " + actor.id +
                    " (archivo: " + actor.modelFile + ")");
            }
        }
    }
}

// ============================================================================
// DORMANCY — activar / desactivar permanent por radio
// ============================================================================

function _activatePermanent(entry) {
    if (!entry || entry.state !== "dormant") return;
    entry.state = "pending";
    entry._miss = 0;
    _retainModel(entry.model);
    if (_queue.indexOf(entry.key) === -1) _queue.push(entry.key);
    _dbg("[Actors] Activar " + entry.key);
}

function _deactivateToDormant(entry) {
    if (!entry || entry.state !== "ready" || !entry.handle) return;
    var h = entry.handle;
    try { native("SET_CHAR_STAY_IN_SAME_PLACE", h, false); } catch (e) { }
    try { native("MARK_CHAR_AS_NO_LONGER_NEEDED", h); } catch (e) { }
    try { native("DELETE_CHAR", h); } catch (e) { }
    entry.handle = null;
    _removeReady(entry.key);
    _releaseModel(entry.model);
    entry.state = "dormant";
    entry._miss = 0;
    _dbg("[Actors] Dormant " + entry.key);
}

function _processDormancy(c) {
    if (_permKeys.length === 0) return;
    var p = c.getCoordinates();
    var enterSq = ACTORS_CFG.ENTER * ACTORS_CFG.ENTER;
    var exitSq = ACTORS_CFG.EXIT * ACTORS_CFG.EXIT;

    for (var i = 0; i < _permKeys.length; i++) {
        var entry = _entries[_permKeys[i]];
        if (!entry) continue;

        var dx = p.x - entry.coords.x;
        var dy = p.y - entry.coords.y;
        var dSq = dx * dx + dy * dy;

        if (entry.state === "dormant") {
            if (dSq <= enterSq) _activatePermanent(entry);
        } else if (entry.state === "ready") {
            if (dSq >= exitSq) _deactivateToDormant(entry);
        } else if (entry.state === "pending") {
            // cancelado si el jugador se aleja antes de crear
            if (dSq >= exitSq) {
                _dequeue(entry.key);
                _releaseModel(entry.model);
                entry.state = "dormant";
                entry._miss = 0;
                _dbg("[Actors] Cancel activar " + entry.key);
            }
        }
        // dead: fuera de ready/perm efectivo (se saca en _markDead)
    }
}

// ============================================================================
// TAREAS — unico switch de natives
// ============================================================================

function _applyTask(handle, task, args) {
    if (!handle || !task) return;
    try {
        if (task === "clear") {
            native("CLEAR_CHAR_TASKS", handle);
        } else if (task === "stayInPlace") {
            var onPlace = true;
            if (args && args.on !== undefined) onPlace = !!args.on;
            native("SET_CHAR_STAY_IN_SAME_PLACE", handle, onPlace);
        } else if (task === "setHeading") {
            var h = (args && args.heading !== undefined) ? args.heading : 0;
            native("SET_CHAR_HEADING", handle, h);
        } else if (task === "delete") {
            native("DELETE_CHAR", handle);
        } else {
            log("[Actors] Task desconocida: " + task);
        }
    } catch (e) {
        log("[Actors] Error task " + task + ": " + e.message);
    }
}

function _applyTasks(entry) {
    for (var i = 0; i < entry.onSpawn.length; i++) {
        _applyTask(entry.handle, entry.onSpawn[i], null);
    }
}

function _extractHandle(result) {
    if (typeof result === "number") return result;
    if (result && typeof result === "object") {
        if (typeof result.char === "number") return result.char;
        if (typeof result.handle === "number") return result.handle;
        if (typeof result.actor === "number") return result.actor;
        for (var k in result) {
            if (result.hasOwnProperty(k) && typeof result[k] === "number" && result[k] > 0) {
                return result[k];
            }
        }
    }
    return null;
}

function _createChar(entry) {
    // Special char del juego (023C): esperar HAS_SPECIAL_CHARACTER_LOADED
    if (entry.def.specialCharacter) {
        var loaded = false;
        try {
            loaded = native("HAS_SPECIAL_CHARACTER_LOADED", entry.def.specialCharacter.slot);
        } catch (e) { loaded = false; }
        if (!loaded) return false;
    } else if (!native("HAS_MODEL_LOADED", entry.model)) {
        return false;
    }

    var handle = null;
    try {
        var result = native("CREATE_CHAR",
            entry.def.pedType !== undefined ? entry.def.pedType : 4,
            entry.model,
            entry.coords.x, entry.coords.y, entry.coords.z);
        handle = _extractHandle(result);
    } catch (e) {
        log("[Actors] CREATE_CHAR fallo: " + e.message);
    }

    if (!handle) {
        try {
            handle = Char.Create(entry.model, entry.coords.x, entry.coords.y, entry.coords.z);
        } catch (e2) {
            log("[Actors] Char.Create fallo: " + e2.message);
        }
    }

    if (!handle) return false;

    entry.handle = handle;
    entry.state = "ready";
    entry._miss = 0;
    _addReady(entry.key);
    try { native("SET_CHAR_HEADING", handle, entry.heading); } catch (e) { }
    _applyTasks(entry);

    emit("actors:spawned", {
        key: entry.key,
        id: entry.def.id,
        role: entry.role,
        instanceKey: entry.instanceKey,
        handle: handle
    });
    _dbg("[Actors] Spawn " + entry.key + " (" + entry.def.id + ")");
    return true;
}

// ============================================================================
// EVENTBUS
// ============================================================================

function _onSpawnCmd(e) {
    var d = e.data || {};
    var def = getActorDef(d.templateId || d.id);
    if (!def) {
        log("[Actors] spawn: template desconocido " + (d.templateId || d.id));
        return;
    }
    var entry = _createEntry(def, {
        instanceKey: d.instanceKey,
        x: d.x, y: d.y, z: d.z,
        heading: d.heading
    });
    if (!entry) return;

    if (entry.state === "dormant") {
        _activatePermanent(entry);
    } else if (entry.state === "dead") {
        entry.state = "pending";
        entry._miss = 0;
        _retainModel(entry.model);
        _addToRole(entry.role, entry.key);
        if (_queue.indexOf(entry.key) === -1) _queue.push(entry.key);
    } else if (entry.state === "pending" && _queue.indexOf(entry.key) === -1) {
        _queue.push(entry.key);
    }
}

function _onDespawnCmd(e) {
    var d = e.data || {};
    var entry = _findEntry(d);
    if (!entry) return;
    if (entry.lifetime === "permanent" && !d.instanceKey) {
        log("[Actors] despawn: " + entry.key + " es permanent — omitido");
        return;
    }
    _cleanupEntry(entry);
    log("[Actors] Despawn " + entry.key);
}

function _onTaskCmd(e) {
    var d = e.data || {};
    if (!d.task) return;

    if (d.role && !d.id && !d.instanceKey) {
        var list = (_byRole[d.role] || []).slice();
        for (var i = 0; i < list.length; i++) {
            var en = _entries[list[i]];
            if (en && en.handle) _applyTask(en.handle, d.task, d.args);
        }
        return;
    }

    var entry = _findEntry(d);
    if (entry && entry.handle) _applyTask(entry.handle, d.task, d.args);
}

// ============================================================================
// BATCH spawn + dormancy + check death
// ============================================================================

function _processSpawnQueue() {
    var creates = ACTORS_CFG.SPAWN_PER_FRAME;
    var scans = ACTORS_CFG.SPAWN_SCAN_PER_FRAME;
    var i = 0;
    var scanned = 0;

    while (i < _queue.length && scanned < scans && creates > 0) {
        scanned++;
        var entry = _entries[_queue[i]];
        if (!entry || entry.state !== "pending") {
            _queue.splice(i, 1);
            continue;
        }
        if (_createChar(entry)) {
            _queue.splice(i, 1);
            creates--;
        } else {
            i++;
        }
    }
}

function _markDead(entry) {
    _removeReady(entry.key);
    var pi = _permKeys.indexOf(entry.key);
    if (pi !== -1) _permKeys.splice(pi, 1);

    entry.state = "dead";
    entry._miss = 0;
    emit("actor:died", { key: entry.key, id: entry.def.id, role: entry.role });
    log("[Actors] Died " + entry.key);

    if (entry.lifetime === "disposable" && entry.autoDespawnOnDeath) {
        _cleanupEntry(entry);
        return;
    }

    // permanent / disposable sin auto: suelta handle, no respawnea solo
    if (entry.handle) {
        try { native("MARK_CHAR_AS_NO_LONGER_NEEDED", entry.handle); } catch (e) { }
        try { native("DELETE_CHAR", entry.handle); } catch (e) { }
        entry.handle = null;
    }
    _releaseModel(entry.model);
    _removeFromRole(entry.role, entry.key);
    _dequeue(entry.key);
    // entry queda en _entries como dead (queries → null)
}

function _processChecks() {
    if (_readyKeys.length === 0) return;

    var slice = Math.min(ACTORS_CFG.CHECK_SLICE, _readyKeys.length);
    var processed = 0;

    while (processed < slice && _checkCursor < _readyKeys.length) {
        var key = _readyKeys[_checkCursor++];
        processed++;
        var entry = _entries[key];
        if (!entry || entry.state !== "ready" || !entry.handle) continue;

        var exists = true;
        var dead = false;
        try { exists = native("DOES_CHAR_EXIST", entry.handle); } catch (e) { exists = true; }
        if (exists) {
            try { dead = native("IS_CHAR_DEAD", entry.handle); } catch (e) { dead = false; }
        }

        if (dead) {
            _markDead(entry);
        } else if (!exists) {
            // 2 misses seguidos → no es streaming out, es real (handle de script)
            entry._miss = (entry._miss || 0) + 1;
            if (entry._miss >= 2) _markDead(entry);
        } else {
            entry._miss = 0;
        }
    }

    if (_checkCursor >= _readyKeys.length) _checkCursor = 0;
}

function _processTick(now) {
    if (now - _lastCheck < ACTORS_CFG.CHECK_MS) return;
    _lastCheck = now;

    // Un solo getCoordinates de CJ por tick (dormancy + death)
    try {
        var c = new Player(0).getChar();
        if (!_pendingInitSpawn) _processDormancy(c);
    } catch (e) { }

    _processChecks();
}

// ============================================================================
// REGISTRO
// ============================================================================

function initActors() {
    // Inicializar modelos especiales antes de registrar eventos
    _initSpecialModels();

    on("actors:spawn", _onSpawnCmd);
    on("actors:despawn", _onDespawnCmd);
    on("actors:task", _onTaskCmd);

    on("actors:handle", function (e) {
        var entry = _findEntry(e.data || {});
        e.respond(entry && entry.handle ? entry.handle : null);
    });
    on("actors:handles", function (e) {
        var out = [];
        var list = (_byRole[(e.data || {}).role] || []);
        for (var i = 0; i < list.length; i++) {
            var en = _entries[list[i]];
            if (en && en.handle) out.push(en.handle);
        }
        e.respond(out);
    });

    // Permanentes: no spawnean aun — si la partida cargo en interior,
    // spawnear alla deja el ped en coords equivocadas al salir.
    // Igual que Spawner (_pendingLoadSpawn): esperar a areaId === 0.
    _pendingInitSpawn = false;
    for (var i = 0; i < ACTORS.length; i++) {
        if ((ACTORS[i].lifetime || "permanent") === "permanent") {
            _pendingInitSpawn = true;
            break;
        }
    }
    log("[GSIS] Actors: " + (_pendingInitSpawn ?
        "permanentes pendientes (esperar exterior)" : "sin permanentes"));
}

function _registerPermanentsDormant() {
    var n = 0;
    for (var i = 0; i < ACTORS.length; i++) {
        var def = ACTORS[i];
        if ((def.lifetime || "permanent") !== "permanent") continue;
        var entry = _createEntry(def, { dormant: true });
        if (entry) n++;
    }
    log("[Actors] Permanentes registrados (dormant): " + n);
}

function updateActors(now) {
    if (_pendingInitSpawn) {
        var areaId = 0;
        try { areaId = new Player(0).getChar().getAreaVisible(); } catch (e) { areaId = 0; }
        if (areaId === 0) {
            _pendingInitSpawn = false;
            _registerPermanentsDormant();
        }
        // CJ en interior: seguir esperando (registro unico al salir)
    }
    _processSpawnQueue();
    _processTick(now);
}

register({
    name: "Actors",
    init: initActors,
    update: updateActors
});
