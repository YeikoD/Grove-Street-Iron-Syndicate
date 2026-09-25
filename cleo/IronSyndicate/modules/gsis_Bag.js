// ============================================================================
// GSIS Bag - Bolso visual (render object en CJ)
// ============================================================================
// Se activa solo con >=1 arma larga en inventario o equipada (isLong en weapon_data)
// Geometria calibrada en core/gsis_Config.js → BAG (NO cambiar sin probar)
// Depende de: SaveManager, Config, ModuleRegistry, data/weapon_data
// ============================================================================

import { KEYS, BAG } from "../core/gsis_Config.js";
import { getModuleData } from "../core/gsis_SaveManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { hasLongWeapon } from "../data/gsis_weapon_data.js";

// Handle del objeto renderizado del bolso (null = no equipado)
var _bagRenderObject = null;
var _bagLoading = false;
var _bagPendingChar = null;
var _hadLongWeapon = false;

export function initBag() {
    log("[GSIS] Bag inicializado - tecla P (requiere arma larga)");
}

function _getInventoryItems() {
    var data = getModuleData("ItemManager");
    return (data && data.items) ? data.items : [];
}

// Armas largas propias: en el inventario + las equipadas en slot de GTA
// (lo equipado sale de items[], pero el bolso sigue correspondiendo)
function _getOwnedItems() {
    var items = _getInventoryItems().slice();
    var b = getModuleData("Ballistic");
    var eq = (b && b.equipped) ? b.equipped : {};
    for (var slot in eq) {
        if (!Object.prototype.hasOwnProperty.call(eq, slot)) continue;
        if (eq[slot] && eq[slot].id) items.push({ id: eq[slot].id, qty: 1 });
    }
    return items;
}

// Aparecer bolso
export function showBag(char) {
    if (_bagRenderObject) return;
    if (_bagLoading) return;
    _bagLoading = true;
    _bagPendingChar = char;
    native("REQUEST_MODEL", BAG.MODEL);
}

// Completar spawn del render object cuando el modelo carga
function updateBagLoading() {
    if (!_bagLoading) return;
    if (!native("HAS_MODEL_LOADED", BAG.MODEL)) return;
    try {
        _bagRenderObject = native("CREATE_RENDER_OBJECT_TO_CHAR_BONE",
            _bagPendingChar, BAG.MODEL, BAG.BONE,
            BAG.OFFSET_X, BAG.OFFSET_Y, BAG.OFFSET_Z,
            BAG.ROT_X, BAG.ROT_Y, BAG.ROT_Z);
        native("SET_RENDER_OBJECT_SCALE", _bagRenderObject, BAG.SCALE_X, BAG.SCALE_Y, BAG.SCALE_Z);
        native("SET_RENDER_OBJECT_ROTATION", _bagRenderObject, BAG.FINAL_ROT_X, BAG.FINAL_ROT_Y, BAG.FINAL_ROT_Z);
    } catch (e) { _bagRenderObject = null; }
    _bagLoading = false;
    _bagPendingChar = null;
}

// Desaparecer bolso
export function hideBag() {
    if (!_bagRenderObject) return;
    try { native("DELETE_RENDER_OBJECT", _bagRenderObject); } catch (e) { }
    _bagRenderObject = null;
}

export function isBagVisible() {
    return _bagRenderObject !== null;
}

// Toggle tecla P + auto on/off por arma larga en inventario o equipada
function updateBag(now) {
    updateBagLoading();

    var hasLong = hasLongWeapon(_getOwnedItems());

    // Auto-ocultar si se perdio la ultima arma larga
    if (!hasLong && _bagRenderObject) {
        hideBag();
    }

    // Auto-mostrar al obtener la primera arma larga
    if (hasLong && !_hadLongWeapon) {
        try {
            showBag(new Player(0).getChar());
        } catch (e) { }
    }
    _hadLongWeapon = hasLong;

    // Toggle manual solo si hay arma larga
    if (Pad.IsKeyJustPressed(KEYS.BAG)) {
        if (!hasLong) return;
        try {
            var c = new Player(0).getChar();
            if (_bagRenderObject) {
                hideBag();
            } else {
                showBag(c);
            }
        } catch (e) { }
    }
}

register({
    name: "Bag",
    init: initBag,
    update: updateBag
});
