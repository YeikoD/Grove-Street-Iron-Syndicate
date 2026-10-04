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
import { capacidadDeclarada } from "../../../data/gsis_weapons.js";

// --------------------------------------------------------------------------- //
// LA MUNICION Y EL VALOR
// --------------------------------------------------------------------------- //
// Las dos celdas que con el sistema de armas habian derivado de la tabla de
// armas, y que hoy tienen una respuesta sola.
//
// --------------------------------------------------------------------------- //
// LA MUNICION: "N" EN UN ARMA Y "N/CAP" EN UN CARGADOR
// --------------------------------------------------------------------------- //
// El denominador sale del CARGADOR y no del arma, y no es una decision de la fila:
// es donde esta el dato. `clipSize` es del cargador (un cargador de 5 para un arma
// de 8 trae 5), mientras que la capacidad de un arma la escribe el .asi y el mod
// la LEE con Engine.clipCapacityOf. Copiarla aca seria la segunda copia que produjo
// el cargador de 15 que terminaba en 8.
//
// En un arma la celda queda en "N" a secas. El tope exacto esta en el HUD del
// juego y en la fila del arma equipada, que si la arma y si la muestra.
//
// Y null para lo que no es de armas: un material no tiene municion, y null es un
// guion en la pagina. Un 0 seria "tiene cero balas", que es otra cosa.
export function ammoCell(it) {
    var n = it.ammo || 0;
    var cap = capacidadDeclarada(it.id);
    if (cap > 0) return n + "/" + cap;
    // Un accesorio que se MONTA no tiene municion: el "0" de la linea de abajo
    // diria "tiene cero balas", que es otra cosa. Y el silenciador es instanciado
    // por un motivo de bookkeeping —una fila por unidad para que sacarlo y
    // devolverlo sean simetricos—, asi que sin esta linea su fila pintaria "0".
    //
    // El tipo sale del CATALOGO y no de la fila: la fila cruda del save es
    // `{ id, qty, salud, ammo }` y no tiene `type`. Preguntarle a la fila seria una
    // comparacion contra undefined que nunca da true, y el "0" volveria a pintar.
    if (getItemType(it.id) === "weapon_attachment") return null;
    if (isInstanced(it.id)) return String(n);
    return null;
}

// --------------------------------------------------------------------------- //
// EL VALOR: POR QUE NO HAY PRECIO
// --------------------------------------------------------------------------- //
// La tabla nueva trae un precio BASE (ARMAS.precio, CARGADORES.precio), que es lo
// que usan el dealer y el vendedor. Lo que no hay es un VALOR DE MERCADO: el
// precio de reventa dependia de la calidad del cargador, y esa regla no existe.
//
// Y null en vez de un numero a proposito: una columna Valor que no se sabe quien la
// pone se llena de numeros inventados. El precio de compra va en el carrito del
// dealer, que es donde el jugador lo ve.
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
// `ammo` sale de la fila cruda. La fila del arma EQUIPADA la arma
// equipadasSnap() en views/inventory.js, que le pasa la capacidad del motor y por
// eso puede pintar "8/8" donde esta fila pinta "3".
//
// family, attachments y hasMag: los tres campos que con el sistema de armas
// describian la CONFIGURACION de un arma equipada. Se conservan tal cual viaja la
// fila —solo si el dato viene— porque son parte del contrato entre el
// serializador y la pagina, y porque un campo que se documenta y no se entrega es
// peor que uno que no se menciona: el que lo usa se entera cuando lo usa.
//
// Hoy nadie los manda: el catalogo no tiene accesorios y una configuracion es solo
// un cargador. No es que la pagina no pueda recibirlos, es que no hay quien los mande.
export function itemRow(it) {
    var w = getItemWeight(it.id) * (it.qty || 1);
    var row = {
        id: it.id,
        cat: getItemType(it.id),
        name: getItemName(it.id),
        qty: it.qty || 1,
        ammo: ammoCell(it),
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
    // La linea de las balas sale sola si hay municion que medir. Un "-" de la
    // pagina es "no aplica" y un "0" es "cero balas": no es lo mismo un arma
    // desnuda en la mochila que un cargador vacio, y el tip lo distingue.
    var a = ammoCell(it);
    if (a !== null) {
        parts.push(a + " balas");
    }
    parts.push("salud " + clampSalud(it.salud) + "%");
    return parts.join(" · ");
}