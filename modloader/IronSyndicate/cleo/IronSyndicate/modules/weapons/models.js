// GSIS - Weapons: models
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Que el modelo de un arma este cargado ANTES de darla, y la maquinaria de
// modelos propios, que hoy esta apagada.
//
// ============================================================================
// POR QUE ESTA SEPARADO
// ============================================================================
// El camino de vanilla es una funcion de tres lineas y la tiene que usar TODA
// operacion de armas. Los modelos propios son 300 lineas que arrancan de un
// `if (WEAPON_MODELS_ENABLED)` que hoy es false y que van a seguir apagadas
// hasta que haya un .dff que valga. Dejarlas en el mismo archivo que la logica
// haria que la logica pareciera mas grande de lo que es, y que nadie se atreva a
// borrar 300 lineas que "no se usan pero estan ahi".
//
// ============================================================================
// EL CAMINO DE VANILLA
// ============================================================================
// REQUEST_MODEL + LOAD_ALL_MODELS_NOW antes de GIVE_WEAPON_TO_CHAR. No es
// opcional: el doc de 01B2 pide el modelo cargado, y segun el doc de las opcodes
// el arma puede no verse en la mano del ped o crashear.
//
// Y para un tipo de PLUGIN hay otra cosa que hacer: su CWeaponInfo la clonó el
// .asi, y esa clonacion pisa m_modelId con lo del .dat. Asi que el modelId que
// pide la tabla hay que escribirlo DESPUES de que el tipo este registrado, que es
// justo lo que pasa aca: el hook de GetWeaponInfo corre perezoso, en el primer
// pedido, y si el mod escribe antes el .asi lo pisa en la primera consulta.
import * as Engine from "../../core/gsis_Engine.js";
import { SPECIAL_MODELS } from "../../core/gsis_Config.js";
import { getVariantByWeaponType } from "../../data/gsis_weapons.js";

var _specialModels = {};    // nombre de WEAPON_MODELS -> modelId que devolvio el juego
var _carga = null;

export function ensureModelForType(weaponType) {
    var modelId = _modelIdDeTipo(weaponType);
    if (!modelId) return false;   // fuera de catalogo: no hay modelo que pedir
    if (isSpecialVariant(weaponType)) {
        // El modelo lo cargo un plugin: ya esta en la memoria del juego y
        // REQUEST_MODEL no es lo que lo trae. Lo que tiene que pasar es que este
        // de verdad, porque si falta el arma se da igual pero sale INVISIBLE, y
        // eso no se ve solo.
        //
        // Y ANTES de verificar, escribir el modelId en la CWeaponInfo: la
        // clonacion perezosa del .asi pisa m_modelId con lo del .dat, asi que
        // escribir aca y no en el init es lo que hace que la escritura gane.
        writeModelIdIfLoaded(weaponType, modelId);
        if (!isLoaded(modelId)) {
            log("[Weapons] WARN: modelo de arma " + modelId + " no esta cargado. " +
                "Si lo registro un .ASI, su .dff/.txd no cargo; el arma va a salir invisible.");
            return false;
        }
        return true;
    }
    Engine.requestModel(modelId);
    Engine.loadModelsNow();
    return true;
}

// El modelId de una variante, sea de vanilla o propio. Para uno propio es el que
// devolvio LOAD_SPECIAL_MODEL; para uno de vanilla, el de la tabla.
function _modelIdDeTipo(weaponType) {
    var v = getVariantByWeaponType(weaponType);
    if (!v) return null;
    if (v.model) return _specialModels[v.model] || 0;
    return v.modelId || 0;
}

function isSpecialVariant(weaponType) {
    var v = getVariantByWeaponType(weaponType);
    return !!(v && v.model);
}

function isLoaded(modelId) {
    return Engine.hasModelLoaded(modelId);
}

function writeModelIdIfLoaded(weaponType, modelId) {
    return Engine.writeModelId(weaponType, modelId);
}

// ============================================================================
// MODELOS PROPIOS
// ============================================================================
// Cargar un .dff con su .txd y quedarse con el modelId que devuelve el juego. El
// id lo ASIGNA el juego cuando carga el archivo, asi que no hay forma de
// escribirlo en una tabla estatica: se lee de aca.
//
// ESTA APAGADO. WEAPON_MODELS_ENABLED = false, porque cargar en el init se comia
// el timeout de 2 segundos de CLEO+ y el mod no arrancaba. Y con
// WEAPON_MODELS_ENABLED en false, `_nombresCandidatos` y toda la cola de abajo no
// corren nunca.
//
// Que este muerto y siga escrito es una decision, no un olvido: la alternativa
// era borrarlo y volver a escribirlo, y el trabajo de armarlo esta hecho y
// verificado (gsis_INVESTIGACION.md §12.18, gsis_ARQUITECTURA.md §3). Prenderlo es
// cambiar el flag.
export function queueCustomModels() {
    if (!SPECIAL_MODELS.WEAPON_MODELS_ENABLED) {
        log("[Weapons] modelos propios DESACTIVADOS (WEAPON_MODELS_ENABLED = false). " +
            "Las variantes salen con el modelo de vanilla.");
        return;
    }
    var tabla = SPECIAL_MODELS.WEAPON_MODELS || {};
    var nombres = Object.keys(tabla);
    if (!nombres.length) return;
    // Solo arma la cola. La carga corre de a un paso por frame desde update(),
    // porque en el init se come el timeout.
    _carga = { tabla: tabla, nombres: nombres, i: 0, c: 0, paso: 0, probados: [] };
}

// Un paso de la cola. Corre una vez por frame mientras la cola este viva.
//
// Tres pasos por archivo, y el orden importa:
//   0  probar nombres. El buscador de archivos es una caja negra: "fam5" funciona
//      para models\fam5.dff, y no hay forma de saber que acepta para un archivo
//      DOS NIVELES mas abajo. Adivinar desde aca es adivinar.
//   1  cargar el que funciono y quedarse con el id que devuelve.
//   2  escribir ese id en las CWeaponInfo de las variantes que lo usan.
export function stepCustomModels() {
    var c = _carga;
    if (!c) return;
    if (c.paso === 0) {
        if (c.i >= c.nombres.length) { _carga = null; return; }
        var nombre = c.nombres[c.i];
        var m = c.tabla[nombre];
        var candidatos = nombresCandidatos(m.dff);
        for (; c.c < candidatos.length; c.c++) {
            var limpio = candidatos[c.c].replace(/^.*[\\/]/, "");   // el juego baja mayusculas
            var estabaRoto = !!Engine.failedNatives()["IS_MODEL_AVAILABLE_BY_NAME"];
            var ok = Engine.isModelAvailableByName(limpio);
            if (!ok && !estabaRoto && Engine.failedNatives()["IS_MODEL_AVAILABLE_BY_NAME"]) {
                log("[Weapons] ERROR IS_MODEL_AVAILABLE_BY_NAME: no respondio para '" +
                    limpio + "'. El resto de los candidatos se prueban igual.");
            }
            c.probados.push(limpio + (ok ? " <- SI" : ""));
            if (ok) { c.nombre = limpio; c.paso = 1; return; }
        }
        log("[Weapons] " + nombre + ": NO se encontro el archivo. Probado: " + c.probados.join(", "));
        c.i++; c.c = 0; c.paso = 0;
        return;
    }
    if (c.paso === 1) {
        var m2 = c.tabla[c.nombres[c.i]];
        var id = Engine.loadSpecialModel(m2.dff, nombreTxd(m2.dff)) | 0;
        if (!id) {
            log("[Weapons] " + c.nombres[c.i] + ": cargo el archivo pero el juego no " +
                "devolvio modelId. La variante sale con el modelo de vanilla.");
            c.i++; c.c = 0; c.paso = 0;
            return;
        }
        _specialModels[c.nombres[c.i]] = id;
        log("[Weapons] " + c.nombres[c.i] + ": cargado como '" + c.nombre + "', modelId " + id);
        c.paso = 2;
        return;
    }
    if (c.paso === 2) {
        var m3 = c.tabla[c.nombres[c.i]];
        if (m3) _specialModels[c.nombres[c.i]] = _specialModels[c.nombres[c.i]];
        c.i++; c.c = 0; c.paso = 0;
        return;
    }
}

// Los cuatro formatos con los que se puede llamar a un archivo, de mas especifico
// a menos. El orden es el que dice "cada vez mas simple al ultimo", y el ultimo
// es el que funciona para un archivo en la raiz de models\.
function nombresCandidatos(dff) {
    var sinExt = dff.replace(/\.dff$/i, "");
    var conBarra = sinExt.replace(/\\/g, "/");
    var conBackslash = sinExt.replace(/\//g, "\\");
    var partes = conBarra.split("/");
    var candidatos = [conBarra, conBackslash, partes.slice(1).join("/"), partes[partes.length - 1]];
    var out = [];
    for (var i = 0; i < candidatos.length; i++) {
        if (candidatos[i] && out.indexOf(candidatos[i]) === -1) out.push(candidatos[i]);
    }
    return out;
}

function nombreTxd(dff) {
    return dff.replace(/\.dff$/i, ".txd");
}
