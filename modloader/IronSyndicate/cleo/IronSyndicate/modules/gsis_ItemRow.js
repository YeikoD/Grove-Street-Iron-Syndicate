// GSIS - Item Row
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Item Row - la fila de la tabla web, compartida
//
// Una fila es lo que la pagina dibuja: { id, cat, name, qty, ammo, weight,
// value, tip }. La arman todas las pantallas de items —el inventario, el baul,
// el retiro— y cada una la necesita igual, asi que vive UNA vez aca.
//
// El motivo es el mismo que movio el mapa de iconos a data/gsis_web_data.js: si
// cada pantalla tiene su copia del constructor, las dos divergen calladas. Peor
// todavia con las reglas que trae: el recorte de la municion a la capacidad del
// cargador, el guion en vez del cero, el nombre de la instancia. Acas no hay
// ningun estado y ninguna dependencia de modulos: es una hoja de funciones que
// el resto de los serializadores importan.
//
// Depende de: data/item_data, data/weapon_data
// No depende de: ningun modulo del juego, ningun estado global
// ============================================================================

import { getItemName, getItemWeight, getItemType, clampSalud } from "../data/gsis_item_data.js";
import { getClipSizeByItemId, getSellPrice } from "../data/gsis_weapon_data.js";

// --------------------------------------------------------------------------- //

// Municion de una instancia como "30/30". Un item apilado de material no tiene
// ammo y devuelve null: la celda queda con guion, no con un cero inventado.
export function ammoCell(it, esVivo) {
    if (it.ammo === undefined || it.ammo === null) {
        // Sin ammo guardado. Un cargador nunca cae aca —makeMagazineInstance
        // siempre escribe el campo— pero un arma si: save viejo, o instancia a
        // medio hacer. El default del mod para un arma es "cargador montado y
        // lleno" (makeWeaponInstance), salvo que hasMag diga que no hay.
        //
        // esVivo es la fila del arma que el jugador tiene encima, que NO viene
        // del save: ahi no se inventa nada. Si la lectura en vivo fallo, el guion
        // es la respuesta honesta.
        if (esVivo || getItemType(it.id) !== "weapon") return null;
        var cap0 = getClipSizeByItemId(it.id) || 0;
        // cap0 > 0 es lo que protege a body_armor: esta tipado como "weapon" en
        // ITEMS pero no tiene clipSize, asi que sin este guard apareceria un
        // "0/0" en vez del guion de un chaleco.
        if (cap0 > 0) return (it.hasMag === false ? "0/" : cap0 + "/") + cap0;
        return null;
    }
    var cap = getClipSizeByItemId(it.id);
    if (cap === null || cap === undefined || cap <= 0) {
        return null; // sin cargador conocido: no hay nada que medir
    }
    // Recorta a la capacidad. El mod lo hace en todos lados (_reconcileLoadout
    // normaliza, unequipWeapon clampa) y sin esto la celda puede mostrar
    // "18/17": mas balas que el cargador. Si el total excede la capacidad lo que
    // hay montado es un cargador lleno, que es lo que deja el motor.
    var total = Math.min(Number(it.ammo), cap);
    return String(total) + "/" + String(cap);
}

// Valor de reventa. Solo las armas tienen precio en WEAPON_DATA, asi que
// materiales y cargadores devuelven null y no un 0 que se lee como "gratis".
export function valueCell(id) {
    var v = getSellPrice(id);
    return v ? v : null;
}

// Una fila de la tabla. Los items instanciados (cargadores, armas) llegan del
// mod como un elemento por unidad con su propia municion; los materiales llegan
// apilados con qty > 1 y una salud para todo el stack. El nombre lo arma la
// pagina, que es quien decide si muestra "x5" segun el tipo.
//
// salud: 0..100, y SIEMPRE sale. Sin salud es 100 —que es como nace todo— y la
// celda lo pinta igual, asi que la fila nunca queda con un hueco que el jugador
// lea como "esto no tiene salud" cuando en realidad esta nuevo.
//
// esVivo: la fila no viene del save sino del arma equipada ahora. Solo cambia
// la municion —ver ammoCell—: el resto de la fila es la misma.
export function itemRow(it, esVivo) {
    var w = getItemWeight(it.id) * (it.qty || 1);
    return {
        id: it.id,
        cat: getItemType(it.id),
        name: getItemName(it.id),
        qty: it.qty || 1,
        ammo: ammoCell(it, esVivo),
        salud: clampSalud(it.salud),
        weight: Math.round(w * 100) / 100,
        value: valueCell(it.id),
        tip: tipFor(it)
    };
}

// El texto que aparece con el mouse sobre la fila. No lo lee nada por codigo:
// es la unica ayuda de una tabla de ids, asi que tiene que decir que es, si
// apila o es una unidad, cuanto pesa, cuanto tiene de salud y si lleva cargador.
//
// La salud va SIEMPRE y antes del cargador: es el dato que aplica a los tres
// tipos (material, cargador, arma) y el cargador montado solo a dos. Al reves la
// ultima parte del tooltip seria distinta segun el item y la primera igual.
export function tipFor(it) {
    var parts = [getItemName(it.id)];
    if (it.qty > 1) {
        parts.push(it.qty + " unidades");
    } else {
        parts.push("instanciado");
    }
    parts.push(getItemWeight(it.id) + " kg c/u");
    var a = ammoCell(it);
    if (a) {
        parts.push(a + " balas");
    }
    parts.push("salud " + clampSalud(it.salud) + "%");
    if (it.hasMag === false) {
        parts.push("sin cargador");
    }
    return parts.join(" · ");
}