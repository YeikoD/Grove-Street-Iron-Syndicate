// GSIS - Trunk
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Trunk - Sistema de baules (abrir/cerrar, spheres, menu)
// ============================================================================
// El menu del baul se abre con ESPACIO parado al lado de un baul abierto, igual
// que el inventario (congelando, ESC para cerrar) pero con la condicion de la
// esfera. Al cerrarlo la esfera se apaga TIMERS.SPHERE_COOLDOWN (core/gsis_SpotRuntime).
// Depende de: SaveManager, Config, ModuleRegistry, EventBus, Items, L10n, Notice,
//             Input, SpotRuntime
// Usa query("spawner:*") para handles (sin importar Spawner)
// ============================================================================

import { getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { KEYS, DIST, TIMERS, MISC } from "../core/gsis_Config.js";
import { keyJustPressed, keyEdge, registerMenuSource } from "../core/gsis_Input.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { on, query } from "../core/gsis_EventBus.js";
import { t } from "../core/gsis_L10n.js";
import { setNotice } from "../core/gsis_Notice.js";
import { ITEMS, getItemName } from "../data/gsis_item_data.js";
import { beginSpotCooldown, spotOff } from "../core/gsis_SpotRuntime.js";
import {
    addToTrunk,
    removeFromTrunk,
    getTrunkItems,
    getTrunkWeight,
    getTrunkMaxCapacity,
    getItems,
    getTotalWeight,
    isInstanced
} from "./gsis_Items.js";

// Estado de baules abiertos
var _openTrunks = {}; // { vehicleId: { handle, pickup, lastUpdate, sphereX/Y/Z } }
var _openTrunkCount = 0;

// Estado del menu de baul
var _trunkOpen = false;
var _trunkCar = null;
var _showTrunkMenu = false;
var _trunkVehicleId = -1;
var _pendingTrunkStateSync = -1;

// ============================================================================
// API para Vehicles
// ============================================================================

// Tecla 3: alternar baul del vehiculo dado
export function toggleTrunk(entry) {
    try {
        if (!entry) {
            showTextBox(t("VHC_NON"));
            return;
        }

        var car = entry.handle;
        var vehicleId = entry.id;
        var isCurrentlyOpen = _openTrunks[vehicleId] !== undefined;

        if (!isCurrentlyOpen) {
            car.openDoor(1);
            _openTrunks[vehicleId] = {
                handle: car,
                pickup: null,
                lastUpdate: 0
            };
            _openTrunkCount++;
            _createTrunkPickupForVehicle(vehicleId, car);
            _updateTrunkStateInDataById(vehicleId, true);
        } else {
            car.fixDoor(1);
            _destroyTrunkPickupForVehicle(vehicleId);
            delete _openTrunks[vehicleId];
            _openTrunkCount--;
            _updateTrunkStateInDataById(vehicleId, false);
        }
    } catch (e) { }
}

// Restaurar baul abierto al spawnear vehiculo
export function restoreTrunk(vehicleId, car) {
    try {
        car.openDoor(1);
        _openTrunks[vehicleId] = {
            handle: car,
            pickup: null,
            lastUpdate: 0
        };
        _openTrunkCount++;
        _createTrunkPickupForVehicle(vehicleId, car);
        log("[Trunk] Baul restaurado para vehiculo id=" + vehicleId);
    } catch (e) { }
}

// Limpiar baul si el vehiculo murio/desaparecio
export function onVehicleDead(vehicleId) {
    if (!_openTrunks[vehicleId]) return;
    _destroyTrunkPickupForVehicle(vehicleId);
    delete _openTrunks[vehicleId];
    _openTrunkCount--;
    _updateTrunkStateInDataById(vehicleId, false);
}

// Leer si el baul de un vehiculo esta abierto (para batch de posiciones)
export function isTrunkOpenFor(vehicleId) {
    return _openTrunks[vehicleId] !== undefined;
}

// Persistir estado de todos los baules abiertos (F5)
export function syncStatesForSave() {
    if (_openTrunkCount <= 0) return;
    var vehicleIds = Object.keys(_openTrunks);
    for (var i = 0; i < vehicleIds.length; i++) {
        _updateTrunkStateInDataById(parseInt(vehicleIds[i]), true);
    }
}

// Tecla 3: alternar baul del vehiculo dado (entry via query a Spawner)
function handleTrunkKey(c) {
    if (!keyJustPressed(KEYS.TRUNK)) return;
    try {
        var entry = c.isInAnyCar()
            ? query("spawner:find", { car: c.getCarIsUsing() })
            : query("spawner:closest", { char: c });
        toggleTrunk(entry);
    } catch (e) { }
}

// Update por frame: tecla 3, pending sync, esferas, menu por tecla, cooldown
//
// El menu del baul se abre como el del inventario (una tecla, congelando, ESC
// para cerrar) con la condicion de que haya un baul abierto a DIST.TRUNK_ACCESS.
// Antes se abria solo al tocar la esfera y se cerraba alejandose; ver el comentario
// de la cooldown abajo para por que se dio vuelta.
export function updateTrunk(c, now, spawning) {
    handleTrunkKey(c);

    // El flanco de ESPACIO se lee TODOS los frames, aunque no se llegue a la parte
    // que lo usa: si el estado queda viejo mientras el jugador camina hacia el auto,
    // al entrar en rango contaria como pulsacion la tecla que ya venia apretada.
    var abrio = keyEdge("trunk", KEYS.FLOW);

    // Sincronizar estado pendiente (diferido tras closeTrunk)
    if (_pendingTrunkStateSync !== -1) {
        _updateTrunkStateInDataById(_pendingTrunkStateSync, false);
        _pendingTrunkStateSync = -1;
    }

    if (spawning) return;

    var estaba = _showTrunkMenu;

    // --- Esferas: seguir al auto + destruir si auto destruido ---
    //
    // La cooldown manda sobre el seguimiento: mientras la esfera esta apagada no se
    // crea una ni aunque el auto se mueva, porque la esfera ES la condicion para
    // abrir el menu. Si se dejara, un auto en marcha la volveria a prender en medio
    // del apagado y el menu se podria abrir antes de tiempo.
    if (_openTrunkCount > 0) {
        var apagadas = spotOff("trunk");
        if (apagadas) _dropTrunkSpheres("cooldown");

        var vehicleIds = Object.keys(_openTrunks);
        for (var i = vehicleIds.length - 1; i >= 0; i--) {
            var vid = parseInt(vehicleIds[i]);
            var trunkData = _openTrunks[vid];
            if (!trunkData) continue;

            var carExists = false;
            try { carExists = native("DOES_VEHICLE_EXIST", trunkData.handle); } catch (e) { }

            if (!carExists) {
                try { trunkData.handle.fixDoor(1); } catch (e) { }
                _destroyTrunkPickupForVehicle(vid);
                delete _openTrunks[vid];
                _openTrunkCount--;
                _updateTrunkStateInDataById(vid, false);
                log("[Trunk] Baul cerrado automaticamente (vehiculo destruido) id=" + vid);
            } else if (!apagadas) {
                var now2 = Date.now();
                if (now2 - trunkData.lastUpdate > TIMERS.TRUNK_SPHERE) {
                    trunkData.lastUpdate = now2;
                    _updateTrunkPickupForVehicle(vid, trunkData.handle);
                }
            }
        }
    }

    // --- Abrir el menu con ESPACIO, al lado de un baul abierto ---
    //
    // La distancia es DIST.TRUNK_ACCESS y no DIST.SPHERE: el objeto esfera mide
    // 0.75 m, que es el radio del marcador, no una zona donde se pueda apretar una
    // tecla. Ver la nota de KEYS.FLOW en core/gsis_Config.js.
    if (abrio && !_showTrunkMenu && !c.isInAnyCar() && !spotOff("trunk") && _openTrunkCount > 0) {
        var cerca = _nearestTrunk(c, DIST.TRUNK_ACCESS);
        if (cerca !== null) {
            _trunkCar = _openTrunks[cerca].handle;
            _trunkVehicleId = cerca;
            _trunkOpen = true;
            _showTrunkMenu = true;
        }
    }

    // --- Auto-cerrar menu al salirse de la sphere ---
    //
    // Con el jugador congelado mientras el menu esta abierto, esto solo se da si
    // algo lo movio (un vehiculo, un script). Queda igual: congelado no alcanza
    // para un menu que se quedaria puesto en un sitio del que el ped ya no esta.
    if (_showTrunkMenu && _trunkCar) {
        var pPos2 = c.getCoordinates();
        var tPos = _getTrunkPos(_trunkCar);
        var dx2 = pPos2.x - tPos.x;
        var dy2 = pPos2.y - tPos.y;
        var dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (dist2 > DIST.MENU_CLOSE || c.isInAnyCar()) {
            closeTrunkMenu();
        }
    }

    // --- Cerrar el menu apaga la esfera ---
    //
    // Con la TRANSICION, no con el estado: la cooldown es por cierre. Pedirla en
    // cada frame sin menu la pediria en el frame en que se abre, y el menu no se
    // podria volver a abrir nunca —la esfera no llega a existir—.
    //
    // Y el caso de verdad no es el de antes: el menu congela al jugador, asi que
    // al cerrarlo sigue parado ADENTRO de la esfera, en el mismo lugar. Sin el
    // apagado, cualquier cosa que vuelva a mirar "estoy en la esfera" en el frame
    // siguiente daria true (ver TIMERS.SPHERE_COOLDOWN).
    if (estaba && !_showTrunkMenu) {
        beginSpotCooldown("trunk");
        _dropTrunkSpheres("menu cerrado");
    }
}

// El baul abierto mas cerca, o null si no hay ninguno dentro de maxDist.
//
// No se busca el auto mas cercano sino el auto con el baul ABIERTO: un baul
// cerrado no tiene esfera, y al que no tiene esfera no se le abre menu. Un auto
// con el baul abierto y otro con el baul cerrado al lado no son la misma cosa.
function _nearestTrunk(c, maxDist) {
    if (_openTrunkCount <= 0) return null;

    var p = c.getCoordinates();
    var mejor = null;
    var mejorDist = maxDist;

    var ids = Object.keys(_openTrunks);
    for (var i = 0; i < ids.length; i++) {
        var vid = parseInt(ids[i]);
        var td = _openTrunks[vid];
        if (!td) continue;

        var existe = false;
        try { existe = native("DOES_VEHICLE_EXIST", td.handle); } catch (e) { }
        if (!existe) continue;

        var pos = _getTrunkPos(td.handle);
        var dx = p.x - pos.x;
        var dy = p.y - pos.y;
        var d = Math.sqrt(dx * dx + dy * dy);

        if (d < mejorDist) {
            mejorDist = d;
            mejor = vid;
        }
    }
    return mejor;
}

// ============================================================================
// API para UI (TrunkMenu / InventoryMenu)
// ============================================================================

export function isTrunkOpen() {
    return _openTrunkCount > 0;
}

export function getTrunkVehicleId() {
    if (!_trunkOpen || !_trunkCar) return -1;
    return _trunkVehicleId;
}

export function isTrunkMenuVisible() {
    return _showTrunkMenu;
}

export function closeTrunkMenu() {
    _showTrunkMenu = false;
    _trunkCar = null;
    _trunkOpen = false;
    _trunkVehicleId = -1;
}

export function closeTrunk() {
    if (_trunkVehicleId === -1) return false;

    var vid = _trunkVehicleId;
    var trunkData = _openTrunks[vid];
    if (!trunkData) {
        closeTrunkMenu();
        return false;
    }

    var carExists = false;
    try { carExists = native("DOES_VEHICLE_EXIST", trunkData.handle); } catch (e) { }

    if (carExists) {
        try { trunkData.handle.fixDoor(1); } catch (e) { }
    }

    _destroyTrunkPickupForVehicle(vid);
    delete _openTrunks[vid];
    _openTrunkCount--;
    _pendingTrunkStateSync = vid;
    closeTrunkMenu();
    return true;
}

// ============================================================================
// API para la pagina web (gsis_FlowSerialization + gsis_WebInterface)
// ============================================================================
//
// Estas dos son las que ejecutan el "Guardar" y el "Sacar" del panel. No son un
// alias de addToTrunk: traen el chequeo de peso explicito y el aviso, que es lo
// que vivia en el ui/gsis_TrunkMenu.js que se borro. addToTrunk ya devuelve
// false cuando no entra, pero sin el dato de cuanto falta no se puede escribir
// un mensaje util ("necesitas 5 kg") y sin mensaje el jugador cree que el panel
// esta roto.
//
// Devuelven true/false para que el bridge sepa si redibujar.

// Inventario -> baul. id y qty vienen de la fila elegida y su stepper.
export function putInTrunk(id, qty) {
    var vid = getTrunkVehicleId();
    if (vid === -1) {
        setNotice(t("TRK_NOG"));
        return false;
    }
    qty = Math.max(1, parseInt(qty, 10) || 1);

    var def = ITEMS[id];
    if (!def) {
        setNotice(t("TRK_NOG"));
        return false;
    }
    // El pre-cheque va aca y no adentro de addToTrunk para poder decir cuanto
    // falta. La funcion igual vuelve a calcular el peso y a rechazar: si el
    // chequeo y la mutacion se separan, el segundo es el que manda.
    var need = def.weight * qty;
    var free = getTrunkMaxCapacity(vid) - getTrunkWeight(vid);
    if (need > free) {
        setNotice(t("TRK_FUL", { free: Math.round(free * 10) / 10, need: Math.round(need * 10) / 10 }));
        return false;
    }
    // No hay enough en el inventario tampoco: sin este mensaje, un item que el
    // baul acepta y el inventario no, se come el TRK_NOG generico.
    if (!_hasInInventory(id, qty)) {
        setNotice(t("TRK_NOG"));
        return false;
    }

    if (!addToTrunk(vid, id, qty)) {
        setNotice(t("TRK_NOG"));
        return false;
    }
    setNotice(t("TRK_PUT", { qty: qty, name: getItemName(id) }));
    return true;
}

// Baul -> inventario. El chequeo es el del inventario, no el del baul: es el que
// puede rechazar y por eso el mensaje es INV_FR.
export function takeFromTrunk(id, qty) {
    var vid = getTrunkVehicleId();
    if (vid === -1) {
        setNotice(t("TRK_NON"));
        return false;
    }
    qty = Math.max(1, parseInt(qty, 10) || 1);

    var def = ITEMS[id];
    if (!def) {
        setNotice(t("TRK_NON"));
        return false;
    }
    if (_trunkQty(vid, id) < qty) {
        setNotice(t("TRK_NON"));
        return false;
    }
    var need = def.weight * qty;
    var free = MISC.MAX_INVENTORY_WEIGHT - getTotalWeight();
    if (need > free) {
        setNotice(t("INV_FR", { free: Math.round(free * 10) / 10, need: Math.round(need * 10) / 10 }));
        return false;
    }

    if (!removeFromTrunk(vid, id, qty)) {
        setNotice(t("TRK_NON"));
        return false;
    }
    setNotice(t("TRK_TAK", { qty: qty, name: getItemName(id) }));
    return true;
}

// Cuantas unidades de un id hay en un lado. Suma qty salvo para los instanciados
// (cargadores y armas), que son una fila por unidad y valen 1 cada una.
function _trunkQty(vehicleId, id) {
    var items = getTrunkItems(vehicleId);
    var n = 0;
    for (var i = 0; i < items.length; i++) {
        if (items[i].id !== id) continue;
        n += isInstanced(id) ? 1 : (items[i].qty || 1);
    }
    return n;
}

function _hasInInventory(id, qty) {
    var items = getItems();
    var n = 0;
    for (var i = 0; i < items.length; i++) {
        if (items[i].id !== id) continue;
        n += isInstanced(id) ? 1 : (items[i].qty || 1);
        if (n >= qty) return true;
    }
    return false;
}

// ============================================================================
// INTERNAS
// ============================================================================

function _getTrunkPos(car) {
    return car.getOffsetInWorldCoords(0, -3.6, 0.5);
}

// Todas las esferas de baul apagadas de una.
//
// La cooldown vive en core/gsis_SpotRuntime.js (beginSpotCooldown) porque es la
// misma para los cuatro menus, pero las esferas del baul son de este archivo: las
// suyas cuelgan del auto y hay que seguirlas, no salen de un catalogo estatico.
//
// Ademas borra la posicion de la esfera, y no es un detalle: el seguimiento solo
// recrea cuando el auto se movio (ver _updateTrunkPickupForVehicle), asi que con
// el auto quieto y la posicion guardada, una esfera apagada no volveria nunca.
function _dropTrunkSpheres(porQue) {
    var n = 0;
    for (var vid in _openTrunks) {
        if (!_openTrunks.hasOwnProperty(vid)) continue;
        var td = _openTrunks[vid];
        if (td.pickup !== null) n++;
        _destroyTrunkPickupForVehicle(parseInt(vid));
        td.sphereX = null;
        td.sphereY = null;
        td.sphereZ = null;
    }
    if (n > 0) {
        log("[Trunk] " + n + " esfera(s) de baul apagada(s) (" + porQue + ")");
    }
}

function _createTrunkPickupForVehicle(vehicleId, car) {
    _destroyTrunkPickupForVehicle(vehicleId);
    // Con la cooldown armada no se crea. La esfera es la condicion para abrir el
    // menu, y durante el apagado no hay menu: crearla seria una esfera que no abre
    // nada, y que ademas el seguimiento del auto volveria a prender.
    if (spotOff("trunk")) return;
    try {
        var pos = _getTrunkPos(car);
        var sphere = Sphere.Create(pos.x, pos.y, pos.z, DIST.SPHERE);
        if (_openTrunks[vehicleId]) {
            _openTrunks[vehicleId].pickup = sphere;
            _openTrunks[vehicleId].sphereX = pos.x;
            _openTrunks[vehicleId].sphereY = pos.y;
            _openTrunks[vehicleId].sphereZ = pos.z;
        }
    } catch (e) { }
}

function _updateTrunkPickupForVehicle(vehicleId, car) {
    var trunkData = _openTrunks[vehicleId];
    if (!trunkData) return;
    try {
        var pos = _getTrunkPos(car);
        var dx = pos.x - (trunkData.sphereX || 0);
        var dy = pos.y - (trunkData.sphereY || 0);
        var dz = pos.z - (trunkData.sphereZ || 0);
        var distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 0.25) return;

        // La esfera no estaba: es el reencendido (fin de la cooldown) y no el
        // seguimiento de un auto que se movio. Se loguea porque es el evento que
        // el jugador no ve y del que depende que el menu vuelva a poder abrirse.
        var reencendido = trunkData.pickup === null;

        _destroyTrunkPickupForVehicle(vehicleId);
        var sphere = Sphere.Create(pos.x, pos.y, pos.z, DIST.SPHERE);
        if (_openTrunks[vehicleId]) {
            _openTrunks[vehicleId].pickup = sphere;
            _openTrunks[vehicleId].sphereX = pos.x;
            _openTrunks[vehicleId].sphereY = pos.y;
            _openTrunks[vehicleId].sphereZ = pos.z;
        }
        if (reencendido) {
            log("[Trunk] esfera del baul id=" + vehicleId + " encendida de nuevo: el menu se puede abrir");
        }
    } catch (e) { }
}

function _destroyTrunkPickupForVehicle(vehicleId) {
    if (_openTrunks[vehicleId] && _openTrunks[vehicleId].pickup !== null) {
        try { native("REMOVE_SPHERE", _openTrunks[vehicleId].pickup); } catch (e) { }
        _openTrunks[vehicleId].pickup = null;
    }
}

function _updateTrunkStateInDataById(vehicleId, trunkOpen) {
    try {
        var data = getModuleData("VehicleModule");
        if (!data || !data.vehicles) return;

        for (var i = 0; i < data.vehicles.length; i++) {
            if (data.vehicles[i].id === vehicleId) {
                data.vehicles[i].trunkOpen = trunkOpen;
                setModuleData("VehicleModule", data);
                break;
            }
        }
    } catch (e) { }
}

// ============================================================================
// REGISTRO (auto al importarse)
// ============================================================================

function initTrunk() {
    log("[GSIS] Trunk inicializado (menu con esfera: ESPACIO para abrir, ESC para cerrar)");
    // El menu del baul es un menu: mientras este abierto, el teclado es de la UI
    // y ningun hotkey del mod tiene que disparar. Antes no se registraba y el
    // interruptor de teclado solo miraba el menu principal, asi que la R del
    // menu del baul competia con la R de recargar.
    registerMenuSource("trunk", isTrunkMenuVisible);
    on("vehicle:destroyed", function (e) {
        onVehicleDead(e.id);
    });
    on("trunk:restore", function (e) {
        restoreTrunk(e.vehicleId, e.car);
    });
    on("vehicle:syncForSave", function () {
        syncStatesForSave();
    });
}

function updateTrunkModule(now) {
    try {
        var p = new Player(0);
        var c = p.getChar();
        var spawning = !!query("spawner:isSpawning", {});
        updateTrunk(c, now, spawning);
    } catch (e) { }
}

register({
    name: "Trunk",
    init: initTrunk,
    update: updateTrunkModule
});
