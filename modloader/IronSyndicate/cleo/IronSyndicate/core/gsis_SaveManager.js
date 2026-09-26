// ============================================================================
// GSIS SaveManager - Persistencia via JSON en INI (chunked)
// ============================================================================

import { TIMERS, MISC } from "./gsis_Config.js";

var GameState = {
    version: "1.0",  // Version del formato de guardado
    ts: 0,  // Timestamp de ultimo guardado
    player: { model: 0, cleanMoney: 0, dirtyMoney: 0 }  // Datos del jugador
};

var _activeSlot = 1;  // Slot de guardado activo
var _initialized = false;  // Flag de inicializacion
var _debugEnabled = MISC.DEBUG_ENABLED;  // Habilita logs de debug
var _savesDir = "";  // Directorio de guardados
var _chunkSize = TIMERS.CHUNK_SIZE;  // Tamaño de chunk para JSON
var _totalSlots = MISC.TOTAL_SAVE_SLOTS;  // Numero total de slots

// Cache por frame: evita deep clones repetidos
var _frameCache = {};  // Cache de datos por frame
var _cacheValid = false;  // Flag de validez del cache

function _invalidateCache() {
    _frameCache = {};  // Limpia el cache
    _cacheValid = false;  // Marca cache como invalido
}

function _log(msg) {
    if (!_debugEnabled) return;  // Solo log si debug habilitado
    log("[SaveManager] " + msg);  // Log con prefijo SaveManager
}

function _getSavePath(slot) {
    return _savesDir + "slot_" + slot + ".ini";  // Retorna ruta del archivo INI
}

function _fileExists(path) {
    try { return Fs.DoesFileExist(path); } catch (e) { return false; }  // Verifica existencia del archivo
}

// ============================================================================
// INI helpers (exportados para uso de modulos)
// ============================================================================

function _wInt(path, sec, key, val) {
    try { native("WRITE_INT_TO_INI_FILE", val, path, sec, key); return true; }  // Escribe entero en INI
    catch (e) { _log("wInt err: " + key); return false; }
}

function _wStr(path, sec, key, val) {
    try { native("WRITE_STRING_TO_INI_FILE", val, path, sec, key); return true; }  // Escribe string en INI
    catch (e) { _log("wStr err: " + key); return false; }
}

function _rInt(path, sec, key, def) {
    try {
        var r = native("READ_INT_FROM_INI_FILE", path, sec, key);  // Lee entero de INI
        return (typeof r === "number") ? r : def;
    } catch (e) { return def; }
}

function _rStr(path, sec, key, def) {
    try {
        var r = native("READ_STRING_FROM_INI_FILE", path, sec, key);  // Lee string de INI
        return (typeof r === "string" && r !== "") ? r : def;
    } catch (e) { return def; }
}

// ============================================================================
// SAVE / LOAD - JSON chunked via INI
// ============================================================================

function saveGame(slot) {
    if (!_initialized) { _log("Error: no inicializado"); return false; }  // Verifica inicializacion
    if (slot < 1 || slot > _totalSlots) { _log("Error: slot invalido"); return false; }  // Valida slot

    _log("=== GUARDANDO SLOT " + slot + " ===");

    try {
        var p = new Player(0);
        var c = p.getChar();
        GameState.player.model = c.getModel();  // Guarda modelo del jugador
    } catch (e) { _log("Err jugador: " + e.message); }

    GameState.ts = Date.now();  // Actualiza timestamp
    if (GameState.VehicleModule && GameState.VehicleModule.vehicles) {
        for (var vi = 0; vi < GameState.VehicleModule.vehicles.length; vi++) {
            var veh = GameState.VehicleModule.vehicles[vi];
            _log("[Save] Vehiculo id=" + veh.id + " x=" + veh.x.toFixed(1) + " y=" + veh.y.toFixed(1) + " z=" + veh.z.toFixed(1));
        }
    }
    var json = JSON.stringify(GameState);  // Convierte estado a JSON
    var path = _getSavePath(slot);  // Obtiene ruta del archivo
    var sec = "GSIS";  // Seccion INI

    var chunks = [];
    for (var i = 0; i < json.length; i += _chunkSize) {
        chunks.push(json.substring(i, i + _chunkSize));  // Divide JSON en chunks
    }

    _wInt(path, sec, "n", chunks.length);  // Escribe numero de chunks
    for (var j = 0; j < chunks.length; j++) {
        _wStr(path, sec, "d" + j, chunks[j]);  // Escribe cada chunk
    }

    _activeSlot = slot;  // Actualiza slot activo
    _log("Guardado OK. " + chunks.length + " chunks. Slot " + slot);
    return true;
}

function loadGame(slot) {
    if (!_initialized) { _log("Error: no inicializado"); return false; }
    if (slot < 1 || slot > _totalSlots) { _log("Error: slot invalido"); return false; }

    _log("=== CARGANDO SLOT " + slot + " ===");
    var path = _getSavePath(slot);

    if (!_fileExists(path)) {
        _log("Slot vacio");
        _activeSlot = slot;
        return true;
    }

    var sec = "GSIS";
    var n = _rInt(path, sec, "n", 0);
    if (n <= 0) { _log("Sin chunks"); return false; }

    var json = "";
    for (var i = 0; i < n; i++) {
        var chunk = _rStr(path, sec, "d" + i, "");
        if (chunk === "") { _log("Chunk vacio: d" + i); return false; }
        json += chunk;
    }

    try {
        var parsed = JSON.parse(json);
        GameState.version = parsed.version || "1.0";
        GameState.ts = parsed.ts || 0;
        GameState.player = parsed.player || GameState.player;

        for (var key in parsed) {
            if (key !== "version" && key !== "ts" && key !== "player") {
                GameState[key] = parsed[key];
            }
        }
        if (GameState.VehicleModule && GameState.VehicleModule.vehicles) {
            for (var vi = 0; vi < GameState.VehicleModule.vehicles.length; vi++) {
                var veh = GameState.VehicleModule.vehicles[vi];
                _log("[Load] Vehiculo id=" + veh.id + " x=" + veh.x.toFixed(1) + " y=" + veh.y.toFixed(1) + " z=" + veh.z.toFixed(1));
            }
        }

        _log("JSON parse OK. Chunks: " + n + " Len: " + json.length);
    } catch (e) {
        _log("JSON parse error: " + e.message);
        return false;
    }

    if (GameState.player.model > 0) {
        try { new Player(0).setModel(GameState.player.model); }
        catch (e) { _log("Err modelo: " + e.message); }
    }

    _activeSlot = slot;
    _log("Carga OK. Slot " + slot);
    _invalidateCache();
    return true;
}

// ============================================================================
// ACCESO
// ============================================================================

function getActiveSlot() { return _activeSlot; }  // Retorna slot activo

function registerModule(name, def) {
    if (!GameState[name]) {
        GameState[name] = JSON.parse(JSON.stringify(def));  // Inicializa con defaults
        _log("Modulo: " + name + " (inicializado con defaults)");
    } else {
        _log("Modulo: " + name + " (ya existe, usando datos cargados)");
    }
    delete _frameCache[name];  // Invalida cache del modulo
}

function getModuleData(name) {
    if (!GameState[name]) return null;  // Retorna null si no existe
    if (_cacheValid && _frameCache[name] !== undefined) {
        return _frameCache[name];  // Retorna cache si es valido
    }
    var clone = JSON.parse(JSON.stringify(GameState[name]));  // Deep clone del dato
    _frameCache[name] = clone;  // Guarda en cache
    _cacheValid = true;
    return clone;
}

function setModuleData(name, data) {
    GameState[name] = JSON.parse(JSON.stringify(data));  // Guarda datos con deep clone
    _frameCache[name] = JSON.parse(JSON.stringify(data));  // Actualiza cache
    _cacheValid = true;
    return true;
}

// Dinero del jugador (prototipo Fase 1)
function getCleanMoney() { return GameState.player.cleanMoney; }  // Dinero limpio
function getDirtyMoney() { return GameState.player.dirtyMoney; }  // Dinero sucio

function setCleanMoney(v) {
    GameState.player.cleanMoney = Math.max(0, v | 0);  // Establece dinero limpio (min 0)
    delete _frameCache.player;  // Invalida cache
    return GameState.player.cleanMoney;
}

function setDirtyMoney(v) {
    GameState.player.dirtyMoney = Math.max(0, v | 0);  // Establece dinero sucio (min 0)
    delete _frameCache.player;  // Invalida cache
    return GameState.player.dirtyMoney;
}

function addCleanMoney(v) { return setCleanMoney(GameState.player.cleanMoney + v); }  // Suma dinero limpio
function addDirtyMoney(v) { return setDirtyMoney(GameState.player.dirtyMoney + v); }  // Suma dinero sucio

// Gasta cleanMoney; false si no alcanza
function spendCleanMoney(v) {
    v = v | 0;
    if (v < 0 || GameState.player.cleanMoney < v) return false;  // Verifica fondos suficientes
    GameState.player.cleanMoney -= v;  // Resta dinero
    delete _frameCache.player;  // Invalida cache
    return true;
}

// ============================================================================
// INIT
// ============================================================================

function initSaveManager() {
    log("--- Modulo SaveManager cargado correctamente ---");
    _savesDir = __dirname + "\\..\\saves\\";
    _log("Init. Dir: " + _savesDir);
    _initialized = true;

    var gtaSlot = Game.GetCurrentSaveSlot();
    _log("GTA SA save slot: " + gtaSlot);

    if (gtaSlot === 0) {
        _activeSlot = 1;
        _log("Partida nueva - GSIS limpio");
    } else {
        _activeSlot = gtaSlot;
        if (_activeSlot > _totalSlots) _activeSlot = 1;
        _log("Cargando GSIS del slot " + _activeSlot);
        loadGame(_activeSlot);
    }
    return true;
}

export {
    initSaveManager, saveGame, loadGame, getActiveSlot,
    registerModule, getModuleData, setModuleData,
    _invalidateCache,
    getCleanMoney, getDirtyMoney, setCleanMoney, setDirtyMoney,
    addCleanMoney, addDirtyMoney, spendCleanMoney,
    _wInt, _wStr, _rInt, _rStr
};
