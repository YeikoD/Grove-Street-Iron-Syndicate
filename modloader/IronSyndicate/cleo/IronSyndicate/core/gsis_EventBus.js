// ============================================================================
// GSIS EventBus - Pub/sub minimo para desacoplar modulos
// ============================================================================
//
// Uso:
//   import { on, emit } from "../core/gsis_EventBus.js";
//
//   // Escuchar (en init de otro modulo)
//   on("vehicle:destroyed", function(e) { ... });
//
//   // Emitir (cuando ocurre)
//   emit("vehicle:destroyed", { id: 3 });
//
// Regla: modulos NUNCA importan entre si — solo se comunican via eventos.
// ============================================================================

var _handlers = {};  // Mapa de evento → lista de funciones handler

// Registrar handler para un evento
export function on(evt, fn) {
    if (!_handlers[evt]) _handlers[evt] = [];  // Crea array si no existe
    _handlers[evt].push(fn);  // Agrega handler al evento
}

// Emitir evento a todos los handlers
export function emit(evt, data) {
    var fns = _handlers[evt];
    if (!fns) return;  // No hay handlers para este evento
    // Copia para evitar problemas si un handler modifica la lista
    var copy = fns.slice();
    for (var i = 0; i < copy.length; i++) {
        try {
            copy[i](data);  // Ejecuta cada handler con los datos
        } catch (e) {
            log("[EventBus] Error en handler de '" + evt + "': " + e.message);
        }
    }
}

// Consulta sincrona: emite y devuelve la respuesta del handler via callback.
// emit corre en el mismo tick, por eso query puede retornar valor.
// Uso:
//   var entry = query("spawner:find", { car: car });
//   on("spawner:find", function (e) { e.respond(findHandleByHandle(e.data.car)); });
export function query(evt, data) {
    var result;  // Variable para capturar la respuesta
    emit(evt, {
        data: data,
        respond: function (v) { result = v; }  // Callback para capturar respuesta
    });
    return result;  // Retorna la respuesta capturada
}
