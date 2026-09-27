// GSIS - ModuleRegistry
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

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
//
// Un error por frame se loguea una vez y despues se cuenta.
//
// No es una optimizacion de log. update corre 60 veces por segundo, asi que un
// modulo que tira deja 3000 lineas identicas en cinco minutos: el log se agranda
// y el error REAL —el segundo de los dos, el que nadie estaba mirando porque
// estaba tapado por 3000 copias del primero— se pierde. Paso de verdad: un
// ReferenceError escribio 3138 lineas y escondio que el comando del runtime no
// estaba declarado en cleo\.config\sa.json.
//
// El primer aviso lleva el conteo para que se sepa que hay mas, y el modulo se
// sigue llamando: puede ser un estado transitorio (el runtime todavia no
// cargo) y un modulo que deja cobrarse es peor que uno que se queja.
var _errores = {};

export function updateAll(now) {
    for (var i = 0; i < _mods.length; i++) {
        var m = _mods[i];
        if (m.update) {
            try {
                m.update(now);  // Ejecuta update del modulo con timestamp
            } catch (e) {
                var clave = m.name + ": " + e.message;
                var veces = (_errores[clave] || 0) + 1;
                _errores[clave] = veces;
                if (veces === 1) {
                    log("[ModuleRegistry] Error en update de " + clave);
                } else if (veces === 2) {
                    // El segundo aviso es el que dice "no es de una vez". A partir
                    // de aca solo el resumen, cada 10 segundos: hay que poder ver
                    // que sigue vivo sin que el log sea ilegible.
                    log("[ModuleRegistry] Sigue fallando (2 veces): " + clave);
                } else if (veces % 600 === 0) {
                    log("[ModuleRegistry] Sigue fallando (" + veces + " veces): " + clave);
                }
            }
        }
    }
}

// Obtener lista de modulos registrados (debug)
export function getModules() {
    return _mods.slice();  // Retorna copia del array de modulos
}
