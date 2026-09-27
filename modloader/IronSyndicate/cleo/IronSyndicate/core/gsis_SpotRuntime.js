// GSIS - SpotRuntime
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS SpotRuntime - Runtime compartido de esferas F (spots)
// ============================================================================
// Sin duplicar: create/destroy, distancia min, gate interior, tecla F + histeresis.
// Catalogo: data/gsis_spot_data.js (N entradas por tipo)
// Distancias/tecla: core/gsis_Config.js (DIST.SPHERE / DEALER_ACCESS / DEALER_CLOSE, KEYS.DEALER)
//
// Uso en un modulo:
//   var _gate = createSpotGate();
//   var _spheres = [];
//   // init: nada (o log)
//   // update:
//   if (_gate.pending && updateSpotGate(_gate)) {
//       _spheres = createSpotSpheres("dealer");
//   }
//   _visible = updateSpotFKey(c, "dealer", _visible, _spheres.length > 0);
//
// Depende de: Config, spot_data (data)
// ============================================================================

import { KEYS, DIST } from "./gsis_Config.js";
import { keyJustPressed } from "./gsis_Input.js";
import { getSpots } from "../data/gsis_spot_data.js";

// Gate interior: pending hasta getAreaVisible() === 0 (igual que Spawner/Actors)
export function createSpotGate() {
    return { pending: true };  // Crea gate en estado pendiente
}

// true = listo para crear/usar esferas (una vez al salir, o ya exterior)
// false = seguir esperando (CJ en interior)
export function updateSpotGate(gate) {
    if (!gate || !gate.pending) return true;  // Gate ya listo o no existe
    var areaId = 0;
    try { areaId = new Player(0).getChar().getAreaVisible(); } catch (e) { areaId = 0; }
    if (areaId === 0) {
        gate.pending = false;  // Area exterior, gate listo
        return true;
    }
    return false;  // Aun en interior, seguir esperando
}

// 1 Sphere.Create por entrada del tipo — devuelve handle[]
export function createSpotSpheres(type) {
    var spheres = [];
    var spots = getSpots(type);  // Obtiene spots del tipo
    for (var i = 0; i < spots.length; i++) {
        try {
            spheres.push(Sphere.Create(spots[i].x, spots[i].y, spots[i].z, DIST.SPHERE));  // Crea esfera
        } catch (e) { }
    }
    return spheres;  // Retorna array de handles
}

// REMOVE_SPHERE de cada handle; limpia el array in-place
export function destroySpotSpheres(spheres) {
    if (!spheres) return;
    for (var i = 0; i < spheres.length; i++) {
        try { native("REMOVE_SPHERE", spheres[i]); } catch (e) { }  // Destruye cada esfera
    }
    spheres.length = 0;  // Limpia el array
}

// Spot mas cercano del tipo → { spot, dist } (spot null si no hay / sin char)
export function nearestSpot(type, c) {
    var spots = getSpots(type);
    if (!c || spots.length === 0) return { spot: null, dist: 9999 };
    var p = c.getCoordinates();
    var best = null;
    var bestD = 9999;
    for (var i = 0; i < spots.length; i++) {
        var dx = p.x - spots[i].x;
        var dy = p.y - spots[i].y;
        var d = Math.sqrt(dx * dx + dy * dy);  // Calcula distancia 2D
        if (d < bestD) {
            bestD = d;
            best = spots[i];  // Guarda el spot mas cercano
        }
    }
    return { spot: best, dist: bestD };
}

// Distancia 2D al spot mas cercano del tipo (9999 si no hay spots)
export function minDistToSpots(type, c) {
    return nearestSpot(type, c).dist;  // Retorna solo la distancia
}

// Tecla F + histeresis. Devuelve el nuevo estado de `visible`.
// - sin esferas / en auto → cierra
// - F dentro de DEALER_ACCESS → toggle
// - visible y fuera de DEALER_CLOSE → cierra
export function updateSpotFKey(c, type, visible, hasSpheres) {
    return updateSpotFKeySpot(c, type, visible, hasSpheres).visible;  // Retorna solo visibilidad
}

// Igual que updateSpotFKey pero devuelve { visible, spot }.
// `spot` = esfera mas cercana actual (o null si no hay / fuera de radio útil).
// UI/módulos usan spot.characterId para saber QUIÉN abrió el menú.
export function updateSpotFKeySpot(c, type, visible, hasSpheres) {
    if (!hasSpheres) return { visible: false, spot: null };  // Sin esferas, cierra
    if (!c || c.isInAnyCar()) return { visible: false, spot: null };  // En auto, cierra

    var n = nearestSpot(type, c);  // Busca spot mas cercano
    var open = visible;

    // Auto-apertura al entrar en la esfera o presionar tecla F en rango
    if (n.dist < DIST.SPHERE || (n.dist < DIST.DEALER_ACCESS && keyJustPressed(KEYS.DEALER))) {
        open = true;
    }

    // Auto-cierre al salir de la distancia de interacción (igual que menú de baúl)
    if (open && n.dist > DIST.DEALER_CLOSE) {
        open = false;
    }

    return { visible: open, spot: n.spot };  // Retorna estado y spot
}
