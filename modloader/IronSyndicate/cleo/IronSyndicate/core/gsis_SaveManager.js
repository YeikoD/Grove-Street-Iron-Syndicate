// GSIS - SaveManager
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS SaveManager - Persistencia via JSON en INI (chunked)
// ============================================================================

import { TIMERS, MISC } from "./gsis_Config.js";
import { migrateSave, SAVE_FORMAT_VERSION, versionDe } from "./gsis_SaveMigration.js";
// El bus no importa nada, asi que esto no es un ciclo: SaveManager puede emitir
// `save:dirty` sin que el modulo que lo escucha entre en la cadena.
import { emit } from "./gsis_EventBus.js";

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
// SAVE / LOAD - JSON chunked via INI, con doble buffer
// ============================================================================
//
// EL POR QUE DEL DOBLE BUFFER
// ---------------------------------------------------------------------------
// `WRITE_STRING_TO_INI_FILE` reescribe el archivo ENTERO en cada llamada, asi que un
// guardado son N escrituras sobre el MISMO archivo. La version anterior escribia los
// chunks `d0..dn` en su lugar y `n` al final, y el resultado era que una caida a
// mitad dejaba el archivo con los chunks viejos y los nuevos mezclados: `n` ya no
// describia lo que habia, `loadGame` abortaba con "chunk vacio", y el save bueno —
// que estaba en el mismo archivo, en el mismo lugar— ya no existia. Todo el save
// perdido por un corte de energia en el chunk 40 de 60.
//
// LA REGLA
// ---------------------------------------------------------------------------
// Un guardado NUNCA escribe en el namespace que esta vivo. Escribe en el otro, y al
// final —y solo si se lee de vuelta y calza— escribe `commit`, que es lo unico que
// dice cual de los dos es el bueno. El namespace muerto se pisa en el siguiente
// guardado, asi que nunca hay mas de dos y no hay que limpiar nada.
//
// POR QUE SOLO DOS Y NO UN NUMERO DE GENERACION
// ---------------------------------------------------------------------------
// Un contador de generacion dejaria las claves muertas para siempre, y con el costo
// de borrarlas despues: N escrituras extra por guardado, sobre un archivo que cada
// escritura reescribe completo. Con dos namespaces el costo es el mismo que antes —
// N escrituras— y el archivo no crece nunca.
//
// Y EL VERIFICADO, que es lo que hace que esto sea una garantia y no una esperanza
// ---------------------------------------------------------------------------
// Antes del `commit` se releen los N chunks y se comparan con lo que se acaba de
// escribir. Si algo no calza —el INI trunco un valor, el disco fallo, el motor
// escribio otra cosa— NO se escribe `commit`, y el namespace vivo sigue siendo el
// viejo. Un guardado fallido se pierde; el guardado anterior no.
//
// Es N lecturas, que no reescriben el archivo, contra N escrituras que si. Cuesta
// menos que el doble del guardado.
//
// LOS SAVES VIEJOS SIGUEN LEYENDOSE
// ---------------------------------------------------------------------------
// Un slot anterior a esto tiene `n` y `d0..dn`, sin `commit`. `loadGame` intenta el
// `commit` primero y, si no esta o no parsea, cae al formato viejo. O sea que un save
// hecho por la version anterior se carga sin tocarlo y se graba en el nuevo la
// proxima vez. Los saves con base64 crudo, mas viejos aun, ya tenian su propio
// fallback antes de esto y no cambian.

// Los dos namespaces. El vivo lo dice `commit`; el otro es el que se puede pisar.
var _NS_A = "a";
var _NS_B = "b";

// Leer el `commit` de un slot.
//
// DEVUELVE UN ESTADO, Y LA DISTINCION ENTRE LOS TRES CASOS ES EL PUNTO
// ---------------------------------------------------------------------------
//   ausente   no hay clave `commit`. O el slot es de la version anterior, y hay que
//             leerlo por el camino viejo, o no hay slot. Es el unico caso en que
//             tiene sentido caer al formato anterior.
//   ok        el commit esta completo y dice namespace, cantidad y largo.
//   roto      HAY clave `commit` pero no parsea. O sea: un archivo del formato
//             nuevo con el commit a medias.
//
// Y EL CASO "ROTO" NO SE CAE AL FORMATO VIEJO, y esa es la parte que hay que
// entender: caer seria leer un `n` y unos `d<i>` que en un archivo del formato nuevo
// no existen, concluir "no hay chunks", y reportar un archivo que esta a medias como
// si estuviera vacio. El save no se pierde —el namespace bueno sigue en el
// archivo— pero el diagnostico pasa de "el commit se corto" a "este slot no tiene
// nada", que es la clase de mentira que hace que un bug se busque en el lugar
// equivocado.
//
// Los tres campos tienen que estar, y en ese orden. El largo no es una verificacion
// de contenido —base64 podria dar el mismo largo con otros bytes—, es una
// verificacion de INTEGRIDAD ESTRUCTURAL, que es lo que un commit trunco rompe.
function _leerCommit(path) {
    var raw = _rStr(path, "GSIS", "commit", "");
    if (!raw) return { estado: "ausente" };

    var p1 = raw.indexOf(" ");
    if (p1 <= 0) return { estado: "roto", motivo: "no tiene separador" };
    var ns = raw.substring(0, p1);
    if (ns !== _NS_A && ns !== _NS_B) {
        return { estado: "roto", motivo: "namespace '" + ns + "' desconocido" };
    }

    var resto = raw.substring(p1 + 1);
    var p2 = resto.indexOf(" ");
    if (p2 <= 0) return { estado: "roto", motivo: "falta el campo de largo" };

    var n = parseInt(resto.substring(0, p2), 10);
    if (isNaN(n) || n < 0) return { estado: "roto", motivo: "cantidad no numerica" };
    var len = parseInt(resto.substring(p2 + 1), 10);
    if (isNaN(len) || len < 0) return { estado: "roto", motivo: "largo no numerico" };

    return { estado: "ok", ns: ns, n: n, len: len };
}

// Que namespace se puede pisar: el que no esta vivo.
function _namespaceLibre(path) {
    var c = _leerCommit(path);
    if (c.estado !== "ok") return _NS_A;
    return (c.ns === _NS_A) ? _NS_B : _NS_A;
}

// SINCRONIZAR ANTES DE SERIALIZAR
// ---------------------------------------------------------------------------
// Algunos datos que el mod persiste NO estan en `GameState`: estan en el juego, y el
// juego tiene su save aparte. El ejemplo es la municion del cargador que esta montado
// en el arma, que vive en `m_aWeapons[]` del ped. Sin esto, el modulo guardaria "hay
// un cargador de 15 montado" sin las quince balas, que es el estado que hace que al
// cargar la partida el arma aparezca vacia.
//
// ESTA EN `saveGame` Y NO EN F5, Y ESO ES LO IMPORTANTE
// ---------------------------------------------------------------------------
// Hay tres caminos de guardado —F5, el automatico y el de entrar a un interior— y el
// de F5 ya hacia `emit("vehicle:syncForSave")` desde `gsis_Vehicles.js`. Poner el
// enganche aca es lo que hace que los TRES quede cubiertos: un modulo que se engancha
// a un camino de guardado y no a los demas se comporta bien en el que se probo y mal
// en los otros dos, sin ningun sintoma que lo delate.
//
// Y es idempotente de a proposito: volver a leer el ped y volver a escribir el mismo
// numero no cambia nada, asi que engancharse dos veces al mismo guardado no rompe
// nada. Es la unica manera de que un enganche sea seguro de agregar.
function _sincronizarAntesDeGuardar() {
    try {
        emit("save:preSync", {});
    } catch (e) {
        // Un modulo que no esta no puede impedir el guardado. Se loguea porque un
        // modulo que se sale a Hookear y despues tira es exactamente el caso que
        // hay que ver, y no algo que se deba tragarse en silencio.
        _log("WARN save:preSync lanzo (" + (e && e.message ? e.message : e) +
            "). Se guarda igual.");
    }
}

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

    // Los datos que estan en el juego y no en GameState se copian antes de que se
    // serialice. Ver _sincronizarAntesDeGuardar.
    _sincronizarAntesDeGuardar();
    if (GameState.VehicleModule && GameState.VehicleModule.vehicles) {
        for (var vi = 0; vi < GameState.VehicleModule.vehicles.length; vi++) {
            var veh = GameState.VehicleModule.vehicles[vi];
            _log("[Save] Vehiculo id=" + veh.id + " x=" + veh.x.toFixed(1) + " y=" + veh.y.toFixed(1) + " z=" + veh.z.toFixed(1));
        }
    }

    var path = _getSavePath(slot);  // Obtiene ruta del archivo
    var json = _b64Encode(JSON.stringify(GameState));  // Base64: el INI no puede danarlo
    var sec = "GSIS";  // Seccion INI

    // El namespace MUERTO. El vivo no se toca hasta el commit.
    var ns = _namespaceLibre(path);

    var chunks = [];
    for (var i = 0; i < json.length; i += _chunkSize) {
        chunks.push(json.substring(i, i + _chunkSize));  // Divide JSON en chunks
    }

    for (var j = 0; j < chunks.length; j++) {
        _wStr(path, sec, ns + "d" + j, chunks[j]);  // Escribe cada chunk
    }

    // VERIFICADO, y antes del commit a proposito. Lo que se relee tiene que calzar
    // con lo que se escribio; si no calza, el `commit` no se escribe y el namespace
    // vivo sigue siendo el anterior.
    var mal = null;
    for (var v = 0; v < chunks.length; v++) {
        var leido = _rStr(path, sec, ns + "d" + v, "");
        if (leido !== chunks[v]) {
            mal = "d" + v + ": escritos " + chunks[v].length + ", leidos " + leido.length;
            break;
        }
    }
    if (mal !== null) {
        _log("WARN guardado NO confirmado en el chunk " + mal +
            ". No se escribe el commit: el slot conserva el guardado anterior.");
        return false;
    }

    // Un solo _wStr. Esta es la unica escritura que decide cual de los dos
    // namespaces es el bueno, y por eso es la unica que no tiene un antes y un
    // despues que puedan quedar desiguales.
    //
    // El largo va en el commit y no en una clave aparte para que esta sea LA unica
    // escritura atomica del guardado. Ver _leerCommit.
    _wStr(path, sec, "commit", ns + " " + chunks.length + " " + json.length);

    _activeSlot = slot;  // Actualiza slot activo
    _log("Guardado OK. " + chunks.length + " chunks. Namespace " + ns + ". Slot " + slot);
    return true;
}

// ============================================================================
// MODULOS_BORRADOS
// ============================================================================
// Las claves de GameState que ningun modulo escribe ya, y que por eso se borran al
// cargar en vez de copiarse.
//
// CUANDO SE BORRA UN MODULO, SU CLAVE NO SE QUEDA COLGADA
// ------------------------------------------------------
// GameState es un objeto plano donde cada modulo mete lo suyo por su nombre. Si un
// modulo se borra y su clave se deja pasar, el save conserva datos muertos: el
// archivo sigue ocupando lo que ocupaba, `saveGame()` los vuelve a escribir, y no
// hay forma de que el log diga por que el save pesa 4 KB mas que la suma de sus
// datos. Con el tiempo es la clase de basura que hace que un save de 300 KB pese
// 600.
//
// Y no hay forma de que GameState las ignore sola: el bucle de abajo copia
// cualquier clave que no sea version/ts/player. La lista tiene que ser explicita.
//
// POR QUE ESTA EN SaveManager Y NO EN SaveMigration
// --------------------------------------------------
// Porque NO es una migracion y no es un renombre.
//
// Una migracion traduce datos viejos a una forma nueva: el item viejo se
// renombra, el weaponType guardado se convierte en una lista de accesorios. Eso es
// lo que hace SaveMigration.js, y sus pasos son versionados e idempotentes.
//
// Esto es otra cosa: la clave no se traduce, se tira. `GameState.Ballistic` era
// { equipped: { "2": { id, family, attachments, salud } } }, y de ese objeto no
// sale un item de inventario —las armas equipadas vivian FUERA de items[], que es
// justo por lo que el modulo de armas las sacaba del inventario al equiparlas—.
// No hay destino al que migrar, y por eso no hay paso de migracion que lo haga.
//
// O sea: la tabla de renombres y la lista de borrados son las dos caras de la
// misma pregunta sobre un save viejo, y por eso viven en archivos distintos. Una
// pregunta "que hago con esto" y la otra "esto no lo quiero".
//
// AGREGAR UN NOMBRE ACA CUANDO SE BORRA UN MODULO
// ------------------------------------------------
// Y borrar su entrada de ITEM_RENAMES en SaveMigration.js, si tenia. Las dos cosas
// o ninguna: la renombra sola deja filas con ids que el catalogo no conoce, que es
// justo lo que la tabla vacia evita.
var MODULOS_BORRADOS = [
    // El registro de armas equipadas. Lo escribia modules/weapons/state.js con
    // registerModule("Ballistic", { equipped: {} }) y no lo escribe nadie mas.
    //
    // El nombre no es "Weapons" y esa es la parte que confunde: la clave del save
    // fue "Ballistic" desde el primer dia y el nombre del modulo siempre fue
    // "Weapons". Renombrar la clave habria sido un rename de save entero.
    "Ballistic"
];

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

    // El commit manda. Si esta y parsea, el payload vive en el namespace que dice
    // el commit con el prefijo `<ns>d`. Si no esta —o esta pero no parsea, que es lo
    // que deja una escritura a medias— se cae al formato viejo, con `n` y `d<i>`.
    //
    // La caida al formato viejo tambien es lo que hace que un slot escrito por la
    // version anterior de este codigo siga cargando sin tocarlo.
    var commit = _leerCommit(path);

    // UN COMMIT ROTO NO SE LEE COMO UN SLOT VIEJO
    // ---------------------------------------------------------------------------
    // Hay clave `commit` y no parsea: el archivo es del formato nuevo y el commit se
    // quedo a medias. Leerlo por el camino viejo daria "no hay chunks", que reporta
    // un archivo a medias como vacio. Se dice lo que es y se conserva el estado.
    if (commit.estado === "roto") {
        _log("WARN el slot tiene un commit ilegible (" + commit.motivo + ").");
        _log("No se carga nada de este slot — se conserva el estado actual.");
        return false;
    }

    var hayCommit = commit.estado === "ok";
    var ns = hayCommit ? commit.ns : "";
    var n = hayCommit ? commit.n : _rInt(path, sec, "n", 0);
    var prefijo = hayCommit ? (ns + "d") : "d";

    if (n <= 0) { _log("Sin chunks"); return false; }

    var raw = "";
    var _diag = "n=" + n + " ";
    for (var i = 0; i < n; i++) {
        var chunk = _rStr(path, sec, prefijo + i, "");
        if (chunk === "") { _log("Chunk vacio: " + prefijo + i); return false; }
        _diag += prefijo + i + "=" + chunk.length + " ";
        raw += chunk;
    }

    // Largo leido de cada chunk. Si el total no calza con lo que se escribio,
    // el INI devolvio otra cosa y conviene saberlo: el mensaje solo dice DONDE
    // se corto el save.
    _log("[diag] " + _diag + "total=" + raw.length);

    // EL COMMIT DICHA QUE TANTO PESO, Y SI NO CALZA EL COMMIT MIENTE
    // ---------------------------------------------------------------------------
    // Es el unico caso en que el commit puede estar bien formado y aun asi no
    // describir lo que hay en los chunks: un commit truncado, que parsea con un `n`
    // mas chico. Se detecta aca y no mas abajo, porque mas abajo el sintoma seria un
    // `JSON.parse` que muere sin decir por que.
    //
    // Y NO HAY REINTENTO con el otro namespace a proposito: el namespace muerto no
    // tiene un `n` del que fiarse —no hay commit que lo diga—, y adivinarlo seria
    // buscar un payload en un lugar que el propio formato dice que no es el bueno.
    // Lo que corresponde es decir que el commit no calza y no cargar nada.
    if (hayCommit && raw.length !== commit.len) {
        _log("WARN el commit declara " + commit.len + " caracteres y se leyeron " +
            raw.length + ". El commit esta incompleto o el slot esta roto.");
        _log("No se carga nada de este slot — se conserva el estado actual.");
        return false;
    }

    // QUE FORMATO ES, Y POR QUE NO HAY QUE ADIVINARLO
// ---------------------------------------------------------------------------
// Hay tres, y el que decide es la clave que ya se esta leyendo:
//
//   con commit        el formato nuevo, y es SIEMPRE base64. No hace falta ninguna
//                     marca: es la unica forma en que este codigo escribe, y el
//                     base64 es lo que hace falta porque el INI no round-trippea
//                     texto con comillas, llaves ni dos puntos.
//   con fmt=b64       la version anterior, que si marcaba el base64 con una clave.
//   sin ninguna       lo mas viejo: JSON crudo, sin base64.
//
// Y el ultimo caso intenta las DOS cosas, en el orden que no puede equivocar:
// primero crudo —que es lo que un slot viejo es de verdad—, y si no parsea,
// base64. Un slot crudo nunca es base64 valido, asi que la confusion no produce un
// save equivocado: produce, en el peor caso, un intento mas.
var parsed = null;
var fmt = hayCommit ? "b64" : _rStr(path, sec, "fmt", "");

function _probarBase64() {
    var b64 = _b64Decode(raw);
    if (b64 === null) return null;
    try { return JSON.parse(b64); } catch (e) { return null; }
}
function _probarCrudo() {
    try { return JSON.parse(raw); } catch (e) { return null; }
}

if (fmt === "b64") {
    parsed = _probarBase64();
    if (parsed) _log("Formato: base64.");
} else {
    parsed = _probarCrudo();
    if (parsed) _log("Formato: JSON crudo (slot viejo).");
    else {
        parsed = _probarBase64();
        if (parsed) _log("Formato: base64 (sin marca).");
    }
}

if (!parsed) {
    _log("No se pudo parsear este slot en ningun formato conocido.");
    _log("No se carga nada de este slot — se conserva el estado actual.");
    return false;
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

        // Las claves de los modulos que ya no existen se SACAN del save, no se
        // copian. Sin esto un save de antes del borrado se cargaria con su
        // GameState.Ballistic intacto, se guardaria de vuelta con el, y el archivo
        // seguiria creciendo con datos que ningun modulo lee.
        //
        // Y borrar es la respuesta correcta y no una perdida: el contenido de
        // estas claves no tiene a donde migrar. Un arma equipada no se puede
        // guardar como item, y sus cargadores no saltan al cinturon. Ver
        // MODULOS_BORRADOS.
        for (var mb = 0; mb < MODULOS_BORRADOS.length; mb++) {
            var claveMuerta = MODULOS_BORRADOS[mb];
            if (!parsed[claveMuerta]) continue;
            _log("Migracion: se descarta GameState." + claveMuerta +
                " (modulo borrado del mod).");
            delete parsed[claveMuerta];
            delete GameState[claveMuerta];
        }

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

    // TODO CAMBIO DE ESTADO MARCA EL GUARDADO SUCIO, y va ACA y NO en cada modulo
    // ---------------------------------------------------------------------------
    // `setModuleData` es el UNICO camino de escritura: el indice llama a
    // `_invalidateCache()` cada frame, asi que la cache nunca sobrevive un frame y
    // todo lo que llega aca o venia de `getModuleData` o es una mutacion de GameState
    // que otro modulo todavia no persistio. Es el punto donde se sabe "algo cambio".
    //
    // POR QUE ESTO ERA UN AGUERO
    // ---------------------------------------------------------------------------
    // `save:dirty` solo lo emitian `gsis_Spawner` y `gsis_EngineLock`. Ni el modulo
    // de armas ni el de inventario lo emitian nunca, asi que equipar, recargar,
    // llenar un cargador, montar el silenciador o comprar no marcaban nada: el
    // guardado con throttle de 2s no se enteraba, y la partida perdiase hasta el
    // guardado automatico.
    //
    // Lo que AMORTIGUA es poco, y conviene decirlo: el entry tiene dos guardados
    // mas que no dependen de este evento —el automatico cada `AUTO_SAVE_FRAMES` y el
    // de entrar a un interior—, asi que la perdida maxima era la ventana entre
    // esos dos, no la partida entera. Lo que se arregla es que la operacion que el
    // jugador acaba de hacer llegue al disco en 2 segundos en vez de en 5 minutos.
    //
    // Y EMITIR EN `initState` NO MOLESTA: un modulo que normaliza su estado al
    // arrancar marca sucio una vez, y dos segundos despues hay un guardado que no
    // hacia falta. Es barato y es el precio de que la regla sea "escribio, se
    // guardo" en vez de "el rememberba".
    try {
        emit("save:dirty", { modulo: name });
    } catch (e) {
        // El bus no puede impedir que un cambio se guarde. Un `emit` que falla
        // significa que el modulo que escucha no esta, y sin el se pierde el
        // guardado con throttle —no el guardado automatico.
    }
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
