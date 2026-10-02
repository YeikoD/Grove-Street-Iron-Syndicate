// GSIS - Bag
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Bag - Bolso visual (render object en CJ)
// ============================================================================
// ESTE MODULO ESTA INERTE, Y SE SABE POR QUE.
//
// El bolso se activa solo con >=1 arma larga en el inventario, y el sistema de
// armas se borro entero: ITEMS ya no tiene ninguna fila `type: "weapon"`, asi que
// `hasLongWeapon()` no tiene nada que preguntar y devuelve false siempre. La
// consecuencia es que el bolso no aparece nunca, ni por la tecla P ni por el
// auto-on.
//
// Que el modulo siga cargado y no se borre es una decision, no un olvido:
//
//   1. La geometria esta CALIBRADA contra el juego (BAG en core/gsis_Config.js):
//      offsets, rotacion final y escala se ajustaron a ojo hasta que el bolso quedo
//      bien pegado a la espalda de CJ. Borrarla tira esa calibracion, y volver a
//      obtenerla es el trabajo de un dia que no se puede recuperar de un archivo.
//   2. Es la UNICA parte del codigo que sabe montar un render object con este
//      bone. Si manana vuelve el armament, el modulo entero funciona: solo hay que
//      devolverle la condicion.
//
// Y no se simulo la condicion con un `if (false)` repartido por el update: lo que
// se borro fue la PREGUNTA (`hasLongWeapon`, que vivia en la tabla de armas que ya
// no existe), no la maquina. La funcion que decide si hay arma larga paso a ser una
// constante con su nombre, para que el lugar donde hay que tocar sea uno y visible.
//
// Depende de: Config, ModuleRegistry
// ============================================================================

import { KEYS, BAG } from "../core/gsis_Config.js";
import { keyJustPressed } from "../core/gsis_Input.js";
import { register } from "../core/gsis_ModuleRegistry.js";

// Handle del objeto renderizado del bolso (null = no equipado)
var _bagRenderObject = null;
var _bagLoading = false;
var _bagPendingChar = null;

export function initBag() {
    log("[GSIS] Bag inicializado - inerte: no hay armas largas en el catalogo");
}

// Armas largas propias. Antes miraba el inventario Y el registro de equipping
// (`GameState.Ballistic.equipped`), que ya no existe.
//
// La respuesta es false y no una consulta: la condicion era "hay >=1 item de
// catalogo marcado como arma larga", y el catalogo se quedo con chatarra. La
// funcion se conserva con su nombre porque es la que hay que volver a mirar si
// el armament vuelve, y porque un `false` a secas en el update no dice de que
// paso.
function _tieneArmaLarga() {
    return false;
}

// Aparecer bolso
function showBag(char) {
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

function isBagVisible() {
    return _bagRenderObject !== null;
}

// La geometria del bolso queda lista para cuando vuelva a haber un arma larga que
// la dispare: el update se queda, y las tres ramas que quedan —cargar el modelo,
// borrarlo, togglearlo con P— son las tres que ya estaban.
function updateBag(now) {
    updateBagLoading();

    var hasLong = _tieneArmaLarga();

    // Auto-ocultar si se perdio la ultima arma larga
    if (!hasLong && _bagRenderObject) {
        hideBag();
    }

    // Toggle manual solo si hay arma larga
    if (keyJustPressed(KEYS.BAG)) {
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
