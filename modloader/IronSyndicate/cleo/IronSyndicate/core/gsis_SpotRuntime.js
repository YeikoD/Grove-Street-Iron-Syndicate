// GSIS - SpotRuntime
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS SpotRuntime - Runtime compartido de las esferas de spot
// ============================================================================
// El ciclo de vida completo de una esfera: cuando existe, cuando se apaga y que
// decide si el menu que hay adentro puede abrirse.
//
// Catalogo: data/gsis_spot_data.js (N entradas por tipo)
// Distancias/tecla: core/gsis_Config.js (DIST.SPHERE / DEALER_ACCESS /
//                   DEALER_CLOSE, KEYS.FLOW), cooldown: TIMERS.SPHERE_COOLDOWN
//
// Uso en un modulo:
//   var _gate = createSpotGate();
//   var _sawOpen = false;                // lo que publico este modulo (ver abajo)
//   function updateModulo(now) {
//       updateSpotSpheres("dealer", _gate, true);   // want = la esfera hace falta
//       _showMenu = closeSpotFlow(c, "dealer", _showMenu, spotHas("dealer"));
//       if (_sawOpen && !_showMenu) beginSpotCooldown("dealer");   // se apago la esfera
//       _sawOpen = _showMenu;
//   }
//   export function openDealerMenu() {            // la llave la pide el bridge
//       if (_showMenu) return false;
//       var spot = spotCanOpen("dealer", new Player(0).getChar());
//       if (!spot) return false;
//       _activeCharId = spot.characterId || DEFAULT_CHAR;
//       _showMenu = true;
//       return true;
//   }
//
// Lo de _sawOpen no es un detalle menor: la transicion que apaga la esfera se
// mide contra lo que el modulo publico en su update ANTERIOR, no contra el flag.
// El cierre puede venir de afuera —la tecla, el Escape, el comando de la pagina—
// y esos corren en el update del bridge, que es el ULTIMO de la lista. Cuando el
// update del modulo llega, el flag ya vale false: midiendo contra el flag, cerrar
// con la tecla no apagaria la esfera.
//
// Las dos mitades tienen que ir juntas y por eso estan aca y no en cada modulo:
//
//   1. LA ESFERA decide si el menu puede abrir. Sin esfera no hay menu: no es una
//      decoracion del mundo, es la condicion. Por eso apagarla (la cooldown)
//      ALGO mas que un efecto visual.
//   2. LA TECLA decide si el jugador la quiere. Se abre apretando ESPACIO parado
//      adentro del radio de acceso, no al tocarla como antes: asi el menu se abre
//      y se cierra como el inventario (una tecla, congelando, la misma para
//      abrir y cerrar) en vez de ser un toggle invisible que aparece y desaparece
//      solo. La tecla la lee el bridge; el radio y la esfera se preguntan aca.
//
// El baul (modules/gsis_Trunk.js) comparte la cooldown con este runtime pero no
// las esferas: las suyas siguen al auto, asi que las crea y destruye el mismo.
// Por eso la cooldown se puede pedir de afuera (beginSpotCooldown) en vez de
// salir de una transicion.
// Depende de: Config, spot_data (data)
// ============================================================================

import { DIST, TIMERS } from "./gsis_Config.js";
import { getSpots } from "../data/gsis_spot_data.js";

// ------------------------------------------------------------ LAS ESFERAS --
//
// El array vive aca y no en el modulo. Antes cada modulo guardaba el suyo y lo
// creaba una vez al salir a la calle; con el ciclo de vida nuevo hay que poder
// apagarlo y encenderlo en cualquier frame, y que el unico que decide sea el mismo
// en los dos caminos (crear al iniciar la sesion, destruir al cerrar el menu).
//
// Un id por tipo. El baul NO entra: sus esferas cuelgan del auto.

var _sph = {};

// Las esferas del tipo, vivas o no (vacio = apagadas).
export function spotSpheres(type) {
    if (!_sph[type]) _sph[type] = [];
    return _sph[type];
}

// Hay esfera de este tipo. Es la condicion de apertura del menu.
export function spotHas(type) {
    return spotSpheres(type).length > 0;
}

// --------------------------------------------------------- LA COOLDOWN --
//
// La esfera apagada un rato después de cerrar el menu: TIMERS.SPHERE_COOLDOWN.
//
// Por que hace falta si el menu ya no se abre solo: el menu congela al jugador, y
// al cerrarlo el ped sigue EXACTAMENTE donde estaba —dentro de la esfera—. Sin la
// cooldown, cualquier cosa que vuelva a mirar "estoy en la esfera" en el frame
// siguiente daria true: el menu recien cerrado, el jugador inmovil, y la
// condicion intacta. Con la cooldown apagada, la condicion se apaga con ella.
//
// 6 s (TIMERS.SPHERE_COOLDOWN) es el tiempo de una ida y vuelta corta: sale del
// punto, se aleja un poco y vuelve. Es lo que separa "cerro el menu" de "el menu
// se reabrio solo": con el menu congelando al jugador, la unica forma de que la
// condicion de esfera siga dando true es que el mismo menu se reabra.
//
// Y es bastante mas que un frame, que es lo que haria falta para que la segunda
// mitad de la pulsacion que abre el menu no lo cerrara. Por eso el debounce del
// bridge (200 ms) y esta cooldown estan separados: el debounce cuida el mismo
// frame, esta cuida el gesto del jugador.
//
// El valor es un timestamp y no un contador de frames porque los timers de CLEO
// Redux no andan en los scripts JS (ver gsis_FlowSerialization.js): la cuenta
// atras la hace el update de cada modulo.

var _off = {};

// Apaga la esfera del tipo y la enciende sola en SPHERE_COOLDOWN ms.
//
// La Id de la cooldown es la del TIPO, no la de un spot: la cooldown es del menu,
// y el menu no es de un spot. Un jugador parado entre dos esferas del mismo tipo
// los tiene apagados a los dos, y eso es lo correcto —si no, se apagaria el de al
// lado cada vez que cierra el menu del otro—.
export function beginSpotCooldown(type) {
    _off[type] = Date.now() + TIMERS.SPHERE_COOLDOWN;
    _dropSpheres(type, "cooldown de " + Math.round(TIMERS.SPHERE_COOLDOWN / 1000) + " s");
    log("[SpotRuntime] esfera de '" + type + "' APAGADA " +
        Math.round(TIMERS.SPHERE_COOLDOWN / 1000) + " s (menu cerrado)");
}

// La esfera esta apagada: no hay menu posible.
export function spotOff(type) {
    return (_off[type] || 0) > Date.now();
}

// Cuanto le falta para encenderse. Para el log.
export function spotOffLeft(type) {
    return Math.max(0, (_off[type] || 0) - Date.now());
}

// Cancela la cooldown.
//
// No es un caso teorico: el retiro (pickup) pierde su esfera porque el pedido se
// vacio, no porque el menu se cerro. Si la cooldown quedara armada, la compra
// siguiente no tendria esfera para el menu y el punto de retiro se quedaria
// apagado hasta que se venciera. El que no hace falta la esfera (want === false)
// la cancela solo.
export function endSpotCooldown(type) {
    if (!_off[type]) return false;
    _off[type] = 0;
    log("[SpotRuntime] esfera de '" + type + "' encendida antes de tiempo");
    return true;
}

// ------------------------------------------------------ CICLO DE VIDA --
//
// El estado de la esfera de un tipo, una vez por frame. Se llama SIEMPRE (no
// solo cuando hay menu), y devuelve el array vigente: vacio = no hay esfera.
//
//   gate pendiente (interior)  → sin esfera: adentro no hay esferas de spot
//   want === false             → sin esfera, y cooldown cancelada
//   cooldown                   → sin esfera
//   de lo contrario            → esfera creada si no habia
//
// `want` es "este tipo necesita esfera ahora". El retiro lo calcula con el pedido
// (no hay pedido, no hay punto de retiro); la armeria y el trueque pasan true.
//
// El gate se resuelve adentro en vez de dejarlo al modulo: es el mismo para todos
// y en el medio queda el caso dificil —el modulo sin gate resuelto llama con
// spheres.length === 0 y se le crea la esfera adentro de un interior—.
export function updateSpotSpheres(type, gate, want) {
    if (gate && gate.pending) {
        // El gate se resuelve aca y no en el modulo: es el mismo para todos los
        // tipos, y en el medio queda el caso dificil —un modulo que crea esferas
        // adentro de un interior porque se olvido de la linea del gate—.
        updateSpotGate(gate);
        if (gate.pending) {
            _dropSpheres(type, "gate de interior");
            return spotSpheres(type);
        }
    }

    if (!want) {
        _dropSpheres(type, "ya no hace falta");
        endSpotCooldown(type);
        return spotSpheres(type);
    }

    if (spotOff(type)) {
        _dropSpheres(type, "cooldown");
        return spotSpheres(type);
    }

    if (spotSpheres(type).length === 0 && getSpots(type).length > 0) {
        _sph[type] = _createSpheres(type);
        // El flag se limpia recien ahora, con la esfera ya creada: mientras estaba
        // en cooldown spotOff() era true y este camino no se alcanzaba, asi que
        // dejarlo hasta aca no cambia la decision de ningun frame.
        var comeback = !!_off[type];
        _off[type] = 0;
        log("[SpotRuntime] " + _sph[type].length + " esferas de '" + type +
            "' ENCENDIDAS" + (comeback ? " (fin de la cooldown)" : ""));
    }
    return spotSpheres(type);
}

// ------------------------------------------------------ LA VISIBILIDAD --
//
// Aqui se parte la decision en dos, y la parte la hace el dueno de la tecla.
//
// ABRIR lo pide el bridge (modules/ui/index.js) con spotCanOpen, porque
// el que lee la tecla es el. Y tiene que ser el: la I abre y cierra el
// inventario desde el mismo lugar, y si cada modulo leyera la suya, la tecla que
// abre un menu podria cerrar el que estuviera abierto al mismo tiempo — dos
// toggles en el mismo frame, que es el menu que no se abre o se cierra solo—.
//
// CERRAR lo resuelve cada modulo con closeSpotFlow, porque el cierre no es de una
// tecla: es la esfera apagada, un vehiculo, o alejarse del punto. Son datos que
// tiene el modulo, no el bridge.
//
// Gate interior: pending hasta getAreaVisible() === 0 (igual que Spawner/Actors).
// El create de las esferas es de updateSpotSpheres, no del gate: ver la nota de
// arriba sobre por que el gate se resuelve adentro.
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

// ------------------------------------------------------ LA APERTURA --
//
// Se puede abrir el menu de este tipo? Devuelve el spot al que pertenece el menu
// (el mas cercano, el que va a poner los precios), o null si no.
//
// Las tres condiciones, en el orden en que se descartan:
//
//   1. Sin esfera (gate de interior, cooldown, o sin pedido en el retiro) → no.
//      La esfera ES la condicion: apagarla apaga el menu.
//   2. En un vehiculo → no. El menu de un punto se abre desde la calle.
//   3. Fuera del radio de acceso → no. Este es el "estar dentro de su esfera": el
//      radio de acceso, no DIST.SPHERE (el radio del marcador). Ver KEYS.FLOW.
//
// Devuelve el spot y no un bool porque el modulo necesita el characterId de el
// para saber a que NPC le esta comprando el jugador, y eso se decide al abrir.
export function spotCanOpen(type, c) {
    if (!spotHas(type)) return null;  // Sin esfera, no hay menu
    if (!c || c.isInAnyCar()) return null;  // En auto, no
    var n = nearestSpot(type, c);
    if (n.dist >= DIST.DEALER_ACCESS) return null;  // Lejos del punto
    return n.spot;
}

// ------------------------------------------------------ EL CIERRE --
//
// Lo unico que el modulo tiene que decidir por su cuenta: si el menu que esta
// abierto todavia corresponde a donde esta el jugador. Devuelve la visibilidad
// nueva.
//
//   sin esfera (gate, cooldown, sin pedido) → cierra
//   en un vehiculo                          → cierra
//   abierta y fuera de DEALER_CLOSE          → cierra
//
// El ultimo caso es la red de seguridad. El menu congela al jugador, asi que no
// se cierra por alejarse —para eso no hace falta estar parado: con la tecla se
// cierra— y queda para cuando algo lo movio de lugar (un vehiculo, un script):
// un menu congelando a un ped que ya no esta en el punto es un panel injerto.
//
// Lo que NO esta aca, y por que:
//
//   - La auto-apertura al tocar la esfera. Era el toggle invisible: el menu
//     aparecia por haber pasado por al lado y se cerraba por alejarse. Con el
//     jugador congelado mientras esta abierto, un menu de ese tipo solo puede
//     dejar al jugador parado adentro de la esfera sin poder salir, que es el
//     soft-lock que el ancla existed para tapar. Con la tecla, el menu es un menu
//     de pausa y se cierra con la tecla de siempre.
//   - La tecla. Antes cada spot abria con F y el baul con B. Ahora hay una sola
//     tecla para los cuatro menus con esfera (KEYS.FLOW), que es la misma logica
//     que la del inventario: lo unico que cambia entre un menu y otro es donde
//     esta.
export function closeSpotFlow(c, type, visible, hasSpheres) {
    if (!hasSpheres) return false;  // Sin esfera, cierra
    if (!c || c.isInAnyCar()) return false;  // En auto, cierra
    if (!visible) return false;  // Cerrado, sigue cerrado

    var n = nearestSpot(type, c);
    if (n.dist > DIST.DEALER_CLOSE) {
        return false;  // Se salio del radio
    }
    return true;
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

// ------------------------------------------------------------- INTERNAS --

// 1 Sphere.Create por entrada del tipo — devuelve handle[]
function _createSpheres(type) {
    var spheres = [];
    var spots = getSpots(type);  // Obtiene spots del tipo
    for (var i = 0; i < spots.length; i++) {
        try {
            spheres.push(Sphere.Create(spots[i].x, spots[i].y, spots[i].z, DIST.SPHERE));  // Crea esfera
        } catch (e) { }
    }
    return spheres;  // Retorna array de handles
}

// REMOVE_SPHERE de cada handle. Loguea SOLO si habia algo que apagar: el
// updateSpotSpheres llama esto una vez por frame por tipo, y un log por frame
// llena el archivo.
function _dropSpheres(type, porQue) {
    var spheres = _sph[type];
    if (!spheres || spheres.length === 0) return false;
    var n = spheres.length;
    for (var i = 0; i < n; i++) {
        try { native("REMOVE_SPHERE", spheres[i]); } catch (e) { }
    }
    spheres.length = 0;
    log("[SpotRuntime] " + n + " esferas de '" + type + "' apagadas (" + porQue + ")");
    return true;
}
