// GSIS - UI: views/itemRow
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// La fila de la tabla web, compartida. Una fila es lo que la pagina dibuja:
// { id, cat, name, qty, ammo, salud, weight, value, tip }.
//
// La arman todas las pantallas de items —el inventario, el baul, el retiro— y
// cada una la necesita igual, asi que vive UNA vez aca. El motivo es el mismo que
// movio el mapa de iconos a data/gsis_web_data.js: si cada pantalla tiene su
// copia del constructor, las dos divergen calladas.
//
// Acas no hay ningun estado y ninguna dependencia de modulos: es una hoja de
// funciones que el resto de los serializadores importan.
//
// Por eso "instanciado o N unidades" no pregunta por it.qty: pregunta por
// isInstanced(id), que es la misma pregunta que hace el modulo al guardar. Si
// la fila y el modulo tuvieran cada uno su regla, la tabla podria llamar
// instanciado a un stack de uno.
//
// Depende de: data/gsis_item_data (incluido isInstanced)
// No depende de: ningun modulo del juego, ningun estado global
//
// ============================================================================
// LO QUE SE FUE CON EL SISTEMA DE ARMAS
// ============================================================================
// La fila era la pieza mas enganchada al sistema de armas, por tres vias:
//
//   _capacidadDe()  la capacidad del denominador de "17/30". Preguntaba por la
//                   VARIANTE del arma —family + attachments -> weaponType ->
//                   perfil— y caia al item cuando la fila no traia configuracion.
//                   Hacian falta dos fuentes porque un arma con silenciador y
//                   cargador de 15 es el MISMO item que una pelada: la capacidad
//                   no estaba en el id, estaba en la configuracion.
//
//   ammoCell()      "N/cap", y su regla de que sin cargador el denominador no
//                   existe. Todo eso era para medir municion.
//
//   valueCell()     getMagValue() para un cargador y getSellPrice() para el
//                   resto. Los dos salian de la tabla de armas.
//
// Que se hayan ido las tres NO deja la fila mas pobre: la deja con lo que un item
// apilable necesita, que es id, categoria, nombre, cantidad, peso, salud y valor.
// `ammo` sale siempre null y la pagina lo pinta con guion, que es la respuesta
// honesta para "no hay nada que medir".
// ============================================================================

import {
    getItemName, getItemWeight, getItemType, clampSalud, isInstanced
} from "../../../data/gsis_item_data.js";

// --------------------------------------------------------------------------- //
// LA MUNICION Y EL VALOR
// --------------------------------------------------------------------------- //
// Las dos celdas que con el sistema de armas habian derivado de la tabla de
// armas, y que hoy tienen una respuesta sola.
//
// --------------------------------------------------------------------------- //
// LA MUNICION: POR QUE NO HAY DENOMINADOR
// --------------------------------------------------------------------------- //
// La celda de municion era "N/cap", y el denominador salia de DOS fuentes:
//
//   la fila trae family + attachments   -> resolveWeaponType() -> perfil
//   la fila no trae nada                 -> getClipSizeByItemId(it.id)
//
// Hacian falta dos porque un arma con silenciador y cargador de 15 es el MISMO item
// de inventario que una pelada: la capacidad no estaba en el id, estaba en la
// configuracion. Y equivocarse en la segunda era un bug de la UI, no de la tabla:
// un arma de 15 balas con un id que dice 8 muestra "8/8" cuando esta llena.
//
// Sin armas no hay de donde sacar ninguna de las dos, y la respuesta NO es 0: un 0
// es "el cargador tiene capacidad cero", que es un numero. Lo que hay es "este item
// no tiene municion", y eso es un null que la pagina pinta con guion.

export function ammoCell(it, esVivo) {
    return null;
}

// --------------------------------------------------------------------------- //
// EL VALOR: POR QUE NO HAY PRECIO
// --------------------------------------------------------------------------- //
// Era getMagValue() para un cargador —que valia mas lleno que vacio— y
// getSellPrice() para el resto, y los dos salian de la tabla de armas. Sin precios
// de mercado no hay valor que mostrar.
//
// Y null en vez de 0 a proposito: un 0 en la columna Valor se lee como "gratis", y
// no saber el valor de mercado es otra cosa.
export function valueCell(it) {
    return null;
}

// Una fila de la tabla. Los items instanciados llegan del mod como un elemento por
// unidad con su propio estado; los materiales llegan apilados con qty > 1 y una
// salud para todo el stack. El nombre lo arma la pagina, que es quien decide si
// muestra "x5" segun el tipo.
//
// salud: 0..100, y SIEMPRE sale. Sin salud es 100 —que es como nace todo— y la
// celda lo pinta igual, asi que la fila nunca queda con un hueco que el jugador
// lea como "esto no tiene salud" cuando en realidad esta nuevo.
//
// esVivo, family, attachments y hasMag: los cuatro campos que con el sistema de
// armas describian la CONFIGURACION de un arma equipada. Se conservan tal cual
// viaja la fila —solo si el dato viene— porque son parte del contrato entre el
// serializador y la pagina, y porque un campo que se documenta y no se entrega es
// peor que uno que no se menciona: el que lo usa se entera cuando lo usa.
//
// Con el catalogo sin armas, ninguna fila los trae: `family` queda sin poner, y
// `attachments`/`hasMag` tambien. No es que la pagina pueda recibirlos, es que no
// hay quien los mande.
export function itemRow(it, esVivo) {
    var w = getItemWeight(it.id) * (it.qty || 1);
    var row = {
        id: it.id,
        cat: getItemType(it.id),
        name: getItemName(it.id),
        qty: it.qty || 1,
        ammo: ammoCell(it, esVivo),
        salud: clampSalud(it.salud),
        weight: Math.round(w * 100) / 100,
        value: valueCell(it),
        tip: tipFor(it)
    };
    // Solo si vienen. Un `family: undefined` explicitado seria indistinguible de un
    // null, y la pagina no puede diferenciar "no es un arma" de "no se pudo leer".
    if (it.family) row.family = it.family;
    if (it.attachments !== undefined && it.attachments !== null) {
        row.attachments = it.attachments.slice();
    }
    if (it.hasMag !== undefined && it.hasMag !== null) row.hasMag = it.hasMag === true;
    return row;
}

// El texto que aparece con el mouse sobre la fila. No lo lee nada por codigo:
// es la unica ayuda de una tabla de ids, asi que tiene que decir que es, si
// apila o es una unidad, cuanto pesa y cuanto tiene de salud.
//
// "instanciado" o "N unidades" sale de isInstanced(id) y NO de it.qty > 1. La
// diferencia importa en el caso de una sola unidad: un stack de 1 se apila igual,
// asi que decir "instanciado" mentia.
//
// Con qty == 1 y no instanciado no se dice nada: el nombre ya esta en singular y
// un "1 unidad" al lado es ruido. La celda de cantidad muestra guion en ese caso,
// que es lo mismo que dice la columna.
export function tipFor(it) {
    var parts = [getItemName(it.id)];
    if (isInstanced(it.id)) {
        parts.push("instanciado");
    } else if (it.qty > 1) {
        parts.push(it.qty + " unidades");
    }
    parts.push(getItemWeight(it.id) + " kg c/u");
    // ammoCell() devuelve null hoy, asi que la linea de las balas no sale. No se
    // borra: es la que dice "N balas" en cuanto vuelva a haber un item que las
    // tenga, y quitarla seria reescribirla cuando vuelva.
    var a = ammoCell(it);
    if (a) {
        parts.push(a + " balas");
    }
    parts.push("salud " + clampSalud(it.salud) + "%");
    return parts.join(" · ");
}