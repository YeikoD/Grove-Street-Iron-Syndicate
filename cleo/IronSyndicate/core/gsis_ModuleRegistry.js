// ============================================================================
// GSIS ModuleRegistry - Init/update automatico de modulos
// ============================================================================
//
// Uso (en cada modulo):
//   import { register } from "../core/gsis_ModuleRegistry.js";
//
//   register({
//       name: "Trunk",
//       init: function () { ... },
//       update: function (now) { ... }
//   });
//
// Uso (en index.js):
//   import { initAll, updateAll } from "./IronSyndicate/core/gsis_ModuleRegistry.js";
//   import "./IronSyndicate/modules/gsis_Trunk.js";  // efecto: se auto-registra
//
//   initAll();
//   while (true) { wait(0); updateAll(Date.now()); }
//
// Ventaja: index.js NO crece al agregar modulos nuevos.
// ============================================================================

var _mods = [];  // Array de modulos registrados

// Registrar modulo: { name, init?, update? }
export function register(mod) {
    if (!mod || !mod.name) {
        log("[ModuleRegistry] Registro invalido: falta name");
        return;
    }
    // Evitar duplicados por nombre
    for (var i = 0; i < _mods.length; i++) {
        if (_mods[i].name === mod.name) {
            log("[ModuleRegistry] Modulo duplicado: " + mod.name);
            return;
        }
    }
    _mods.push(mod);  // Agrega modulo al registro
}

// Llamar init() de todos los modulos registrados
export function initAll() {
    for (var i = 0; i < _mods.length; i++) {
        var m = _mods[i];
        if (m.init) {
            try {
                m.init();  // Ejecuta inicializacion del modulo
                log("[ModuleRegistry] init: " + m.name);
            } catch (e) {
                log("[ModuleRegistry] Error en init de " + m.name + ": " + e.message);
            }
        }
    }
}

// Llamar update(now) de todos los modulos registrados
export function updateAll(now) {
    for (var i = 0; i < _mods.length; i++) {
        var m = _mods[i];
        if (m.update) {
            try {
                m.update(now);  // Ejecuta update del modulo con timestamp
            } catch (e) {
                log("[ModuleRegistry] Error en update de " + m.name + ": " + e.message);
            }
        }
    }
}

// Obtener lista de modulos registrados (debug)
export function getModules() {
    return _mods.slice();  // Retorna copia del array de modulos
}
