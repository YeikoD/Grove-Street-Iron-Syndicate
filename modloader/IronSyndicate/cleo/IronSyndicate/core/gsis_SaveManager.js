// GSIS - SaveManager
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS SaveManager - Persistencia via JSON en INI (chunked)
// ============================================================================

import { TIMERS, MISC } from "./gsis_Config.js";
import { migrateSave, SAVE_FORMAT_VERSION, versionDe } from "./gsis_SaveMigration.js";

var GameState = {
    // El numero del ESQUEMA del save, no la del mod. Lo sube el modulo que cambia
    // la forma de lo que persiste, y es lo que decide que migraciones corren al
    // leer. Ver SAVE_FORMAT_VERSION en gsis_SaveMigration.js.
    version: SAVE_FORMAT_VERSION,
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
// BASE64
// ============================================================================
//
// Por que: el JSON crudo viaja dentro de un INI, y GTA no|round-trippea
// texto con comillas, llaves ni dos puntos — el slot se guardaba bien pero al
// leerlo el string llegaba incompleto y JSON.parse moria con "expecting '}'".
// Base64 es [A-Za-z0-9+/=]: no hay un solo caracter que un parser de INI, un
// buffer de linea o un salto de linea pueda interpretar. Mata la clase de
// bug, no el caso.
//
// No se usa btoa/atob: el motor no los garantiza.

var _B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function _utf8Encode(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) {
            out.push(c);
        } else if (c < 0x800) {
            out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
        } else if (c < 0xD800 || c >= 0xE000) {
            out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
        } else {
            // surrogate pair
            i++;
            var cp = 0x10000 + (((c & 0x3FF) << 10) | (str.charCodeAt(i) & 0x3FF));
            out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
        }
    }
    return out;
}

function _utf8Decode(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length;) {
        var b = bytes[i++];
        if (b < 0x80) {
            out += String.fromCharCode(b);
        } else if (b < 0xE0) {
            out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i++] & 0x3F));
        } else if (b < 0xF0) {
            out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F));
        } else {
            var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
            cp -= 0x10000;
            out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        }
    }
    return out;
}

function _b64Encode(str) {
    var bytes = _utf8Encode(str);
    var out = "";
    for (var i = 0; i < bytes.length; i += 3) {
        var b0 = bytes[i];
        var b1 = (i + 1 < bytes.length) ? bytes[i + 1] : -1;
        var b2 = (i + 2 < bytes.length) ? bytes[i + 2] : -1;
        out += _B64.charAt(b0 >> 2);
        out += _B64.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4));
        out += (b1 < 0) ? "=" : _B64.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6));
        out += (b2 < 0) ? "=" : _B64.charAt(b2 & 63);
    }
    return out;
}

function _b64Decode(str) {
    var clean = "";
    for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i);
        if (c !== "=" && _B64.indexOf(c) >= 0) clean += c;
    }
    var bytes = [];
    for (var j = 0; j < clean.length; j += 4) {
        // Ojo: indexOf("") devuelve 0, no -1. Un caracter vacio hay que
        // descartarlo antes, si no el padding empuja bytes basura.
        var c2 = clean.charAt(j + 2);
        var c3 = clean.charAt(j + 3);
        var n0 = _B64.indexOf(clean.charAt(j));
        var n1 = _B64.indexOf(clean.charAt(j + 1));
        var n2 = c2 ? _B64.indexOf(c2) : -1;
        var n3 = c3 ? _B64.indexOf(c3) : -1;
        if (n0 < 0 || n1 < 0) return null;
        bytes.push((n0 << 2) | (n1 >> 4));
        if (n2 >= 0) bytes.push(((n1 & 15) << 4) | (n2 >> 2));
        if (n3 >= 0) bytes.push(((n2 & 3) << 6) | n3);
    }
    return _utf8Decode(bytes);
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
    // El numero de version va con cada guardado. Sin esto, un save guardado por
    // una version nueva y nunca recargado no tendria forma de decir cual es su
    // esquema, y la unica forma de averiguarlo seria abrir el archivo a mano.
    GameState.version = SAVE_FORMAT_VERSION;
    if (GameState.VehicleModule && GameState.VehicleModule.vehicles) {
        for (var vi = 0; vi < GameState.VehicleModule.vehicles.length; vi++) {
            var veh = GameState.VehicleModule.vehicles[vi];
            _log("[Save] Vehiculo id=" + veh.id + " x=" + veh.x.toFixed(1) + " y=" + veh.y.toFixed(1) + " z=" + veh.z.toFixed(1));
        }
    }
    var json = _b64Encode(JSON.stringify(GameState));  // Base64: el INI no puede danarlo
    var path = _getSavePath(slot);  // Obtiene ruta del archivo
    var sec = "GSIS";  // Seccion INI

    // Si el slot viejo tiene mas chunks que el nuevo, se pisa la clave "n" y las
    // sobrantes quedan huerfanas. No molestan: la lectura usa n del encabezado.
    _wStr(path, sec, "fmt", "b64");

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

    var raw = "";
    var _diag = "n=" + n + " ";
    for (var i = 0; i < n; i++) {
        var chunk = _rStr(path, sec, "d" + i, "");
        if (chunk === "") { _log("Chunk vacio: d" + i); return false; }
        _diag += "d" + i + "=" + chunk.length + " ";
        raw += chunk;
    }

    // Largo leido de cada chunk. Si el total no calza con lo que se escribio,
    // el INI devolvio otra cosa y conviene saberlo: el mensaje solo dice DONDE
    // se corto el save.
    _log("[diag] " + _diag + "total=" + raw.length);

    // El slot puede estar en el formato viejo (JSON crudo) o en el nuevo
    // (base64, marcado con fmt=b64). Se intentan los dos y gana el que de JSON
    // valido, asi que un slot anterior al fix sigue cargando sin tocarlo.
    var parsed = null;
    var fmt = _rStr(path, sec, "fmt", "");
    var b64 = (fmt === "b64") ? _b64Decode(raw) : null;
    if (b64 !== null) {
        try { parsed = JSON.parse(b64); _log("Formato: base64."); } catch (e) { parsed = null; }
    }
    if (!parsed) {
        try { parsed = JSON.parse(raw); _log("Formato: JSON crudo (slot viejo)."); }
        catch (e) {
            _log("JSON parse error: " + e.message);
            _log("No se carga nada de este slot — se conserva el estado actual.");
            return false;
        }
    }

    // Migracion ANTES de que GameState reciba nada. Si se hiciera despues de la
    // linea de abajo, el modulo de inventario ya habria desconocido los items
    // viejos (no estan en ITEMS todavia) y los habria descartado antes de que la
    // migracion pudiera tocarlos.
    //
    // Y el orden de los dos pasos de migrateSave es el de ahi: primero los
    // renombres de itemId, que son independientes de la version, y despues los
    // migradores por version, que leen esos ids ya renombrados.
    try {
        var inf = migrateSave(parsed);
        _log("Migracion: version " + inf.versionAntes + " -> " + inf.versionDespues + ".");
        if (inf.renombrados > 0) {
            _log("Migracion: " + inf.renombrados + " item(s) con id viejo renombrado(s).");
        }
        // Cada paso se reporta por su cuenta. Un save viejo se carga con el log
        // diciendo que version entro, que version salio y que hizo cada migrador,
        // que es lo que hace falta para saber si un arma perdida fue por la
        // migracion o por otra cosa.
        for (var mi = 0; mi < inf.pasos.length; mi++) {
            var paso = inf.pasos[mi];
            if (!paso.ok) {
                _log("Migracion AVISO: paso " + paso.nombre + ": " + paso.detalle);
            } else if (paso.detalle) {
                _log("Migracion: paso " + paso.nombre + " -> " + JSON.stringify(paso.detalle));
            } else {
                _log("Migracion: paso " + paso.nombre + " ok.");
            }
        }
    } catch (e) {
        // Un save que no se puede migrar se carga igual. Perder una partida
        // entera por un renombre mal escrito es peor que cargar con items
        // viejos que el catalogo no va a reconocer.
        _log("WARN migracion fallo (" + e.message + "); se carga el save sin migrar.");
    }

    try {
        // La version sale de `parsed` YA MIGRADO, no del original: migrateSave la
        // escribio. Copiarla antes seria guardar la version vieja con los datos
        // nuevos, que es la forma de que la proxima carga vuelva a migrar.
        GameState.version = versionDe(parsed.version);
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

        _log("JSON parse OK. Chunks: " + n);
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
