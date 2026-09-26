// ============================================================================
// GSIS L10n - Localizacion (es/en) + preload FxtStore
// ============================================================================
// Catalogo: data/gsis_lang_data.js (STRINGS) — keys GXT/FXT max 7 chars
// Idioma: Config.LANG.DEFAULT (sin switch en runtime)
// t(key, params?) → string localizado con {placeholders} en JS
// FxtStore.insert una vez en init para Text.* / GXT futuro
// Depende de: Config (LANG), lang_data
// ============================================================================

import { LANG } from "./gsis_Config.js";
import { STRINGS } from "../data/gsis_lang_data.js";

var _lang = LANG.DEFAULT || "es";  // Idioma activo (es/en)

export function getLang() {
    return _lang;  // Retorna el idioma actual
}

export function hasKey(key) {
    return !!(STRINGS && STRINGS[key]);  // Verifica si existe la key
}

// Texto localizado. params: { n, free, need, name, qty, id, slot, model, order }
export function t(key, params) {
    var entry = STRINGS ? STRINGS[key] : null;  // Busca entrada en catalogo
    if (!entry) {
        log("[L10n] Key desconocida: " + key);
        return key;  // Retorna la key si no existe
    }
    var text = entry[_lang];  // Texto en idioma actual
    if (text === undefined) text = entry.es;  // Fallback a español
    if (text === undefined) text = key;  // Fallback a la key
    if (params) {
        for (var k in params) {
            if (params.hasOwnProperty(k)) {
                text = text.split("{" + k + "}").join(String(params[k]));  // Reemplaza placeholders
            }
        }
    }
    return text;  // Retorna texto localizado
}

// Preload al store FXT global (una vez en init)
// Permite Text.PrintHelp('INV_FUL') u 00BB con la misma key en el futuro.
function _syncFxt() {
    try {
        if (typeof FxtStore === "undefined" || !FxtStore) return;  // Verifica disponibilidad
        var n = 0;
        for (var key in STRINGS) {
            if (!STRINGS.hasOwnProperty(key)) continue;
            if (key.length > 7) {
                log("[L10n] Key >7 chars: " + key);
                continue;  // Omite keys > 7 caracteres (limite GXT)
            }
            var entry = STRINGS[key];
            var val = entry[_lang] !== undefined ? entry[_lang] : entry.es;  // Valor en idioma
            if (val !== undefined) {
                FxtStore.insert(key, val, true);  // Inserta en FXT store
                n++;
            }
        }
        log("[L10n] FxtStore sync: " + n + " keys (" + _lang + ")");
    } catch (e) {
        log("[L10n] FxtStore no disponible: " + e.message);
    }
}

export function initL10n() {
    _lang = LANG.DEFAULT || "es";  // Establece idioma default
    _syncFxt();  // Sincroniza con FXT store
    log("[L10n] Inicializado lang=" + _lang);
}
