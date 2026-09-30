// GSIS - UI: views/itemRow
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// La fila de la tabla web, compartida. Una fila es lo que la pagina dibuja:
// { id, cat, name, qty, ammo, salud, weight, value, tip, family, attachments }.
//
// La arman todas las pantallas de items —el inventario, el baul, el retiro— y
// cada una la necesita igual, asi que vive UNA vez aca. El motivo es el mismo que
// movio el mapa de iconos a data/gsis_web_data.js: si cada pantalla tiene su
// copia del constructor, las dos divergen calladas. Peor todavia con las reglas que
// trae: el recorte de la municion a la capacidad del cargador, el guion en vez del
// cero, el nombre de la instancia, y el instanciado-vs-apilado. Acas no hay
// ningun estado y ninguna dependencia de modulos: es una hoja de funciones que el
// resto de los serializadores importan.
//
// Por eso "instanciado o N unidades" no pregunta por it.qty: pregunta por
// isInstanced(id), que es la misma pregunta que hace el modulo al guardar. Si
// la fila y el modulo tuvieran cada uno su regla, la tabla podria llamar
// instanciado a un stack de uno.
//
// Depende de: data/gsis_item_data (incluido isInstanced), data/gsis_weapon_data
// No depende de: ningun modulo del juego, ningun estado global
// ============================================================================

import {
    getItemName, getItemWeight, getItemType, clampSalud, isInstanced
} from "../../../data/gsis_item_data.js";
import {
    getClipSizeByItemId, getMagValue, resolveWeaponType, getVariantProfile
} from "../../../data/gsis_weapon_data.js";

// --------------------------------------------------------------------------- //
// LA CAPACIDAD DE LA FILA
// --------------------------------------------------------------------------- //
// De donde sale el denominador de "17/30", que es la pregunta de la que depende
// toda la celda.
//
// Y tiene DOS fuentes, y equivocarse en la segunda es el bug de la fase 2
// volviendo por la UI: un arma se identifica por su itemId ("colt45"), y la
// capacidad de ESE item es la de su variante BASE. Un arma con silenciador y
// cargador de 15 sigue siendo el item "colt45", asi que getClipSizeByItemId dice
// 8, y la fila de un arma que en el juego tiene 15 balas muestra "15/8". Peor:
// se ve recortada, porque ammoCell recorta al denominador, asi que el arma
// muestra "8/8" cuando esta llena.
//
// La capacidad real es la de la VARIANTE, y la variante se deriva de lo que la
// fila trae: family + attachments. Que es justo lo que la UI ya recibe. Asi que
// cuando la fila trae configuracion, se resuelve; cuando no —un cargador suelto,
// un arma de una sola representacion, una fila sin familia— se cae al item, que
// es lo unico que hay.
//
// Y NO se pide el weaponType por el bus ni se resuelve "cual es": se resuelve de
// la lista, que es la unica fuente. Si la lista no resuelve, es que la fila no
// tiene configuracion, y se usa el item.
function _capacidadDe(it) {
    if (it.family && Array.isArray(it.attachments)) {
        var tipo = resolveWeaponType(it.family, it.attachments);
        if (tipo !== null) {
            var prof = getVariantProfile(tipo);
            if (prof && prof.clipSize > 0) return prof.clipSize;
        }
    }
    return getClipSizeByItemId(it.id);
}

// --------------------------------------------------------------------------- //

// Municion de una instancia como "30/30". Sin cargador montado —o sin municion
// que medir— devuelve null, y la pagina lo pinta con guion.
export function ammoCell(it, esVivo) {
    // SIN CARGADOR => GUION, y va PRIMERO, antes de mirar el ammo.
    //
    // Lo que hay que evitar es "0/17" en un arma desnuda. El denominador es la
    // capacidad del arma, y con el arma sin cargador no hay ningun cargador que
    // la lleno: leerlo asi dice "tiene un cargador de 17 y esta vacio", que es
    // justo lo contrario de lo que hay. Y el numero varia por calibre —7 en la
    // Desert Eagle, 8 en la Colt .45, 50 en la M4, 500 en el minigun-, asi que el
    // denominador tampoco es un dato constante que el jugador pueda leer como
    // "el cargador que le viene".
    //
    // Con este return, los tres estados se distinguen de verdad, y antes no:
    //   sin cargador      -> guion        (no hay con que medir)
    //   cargador vacio    -> "0/30"       (hay cargador, hay 0 balas)
    //   cargador con balas-> "17/30"      (hay cargador y hay balas)
    // Los dos ultimos se veian iguales desde la UI, que no recibia hasMag.
    if (it.hasMag === false) return null;

    if (it.ammo === undefined || it.ammo === null) {
        // Sin ammo guardado. Un cargador nunca cae aca —makeMagazineInstance
        // siempre escribe el campo— pero un arma si: save viejo, o instancia a
        // medio hacer. El default del mod para un arma es "cargador montado y
        // lleno" (makeWeaponInstance).
        //
        // esVivo es la fila del arma que el jugador tiene encima, que NO viene
        // del save: ahi no se inventa nada. Si la lectura en vivo fallo, el guion
        // es la respuesta honesta.
        if (esVivo || getItemType(it.id) !== "weapon") return null;
        var cap0 = _capacidadDe(it) || 0;
        // cap0 > 0 es lo que protege a body_armor: esta tipado como "weapon" en
        // ITEMS pero no tiene clipSize, asi que sin este guard apareceria un
        // "0/0" en vez del guion de un chaleco.
        if (cap0 > 0) return cap0 + "/" + cap0;
        return null;
    }
    var cap = _capacidadDe(it);
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

// Valor de reventa: lo que la fila vale.
//
// Recibe la INSTANCIA y no el id, porque un cargador vale mas lleno que vacio y
// esa parte del valor sale del `ammo` de la fila, que no se puede derivar del
// id. Para un cargador delega en getMagValue (precio + balas); para todo lo
// demas, getSellPrice como antes, asi que ninguna celda de material ni de arma
// cambia de numero.
//
// Materiales y body_armor devuelven null y no un 0: un 0 en la columna Valor se
// lee como "gratis", y no saber el valor es otra cosa.
export function valueCell(it) {
    var v = getMagValue(it);
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
//
// family y attachments: la CONFIGURACION del arma, y son la unica parte de la fila
// que no es un dato del catalogo. Viajan solo si la instancia los trae, y por eso
// las filas de material y las de un arma sin configurar salen sin las dos claves
// y no conlas vacias: la pagina distingue "no es un arma" de "es un arma sin
// accesorios" con `attachments === undefined` contra `attachments.length === 0`.
//
// Y el weaponType NO viaja, por dos razones. La primera es que la pagina no lo
// necesita: dibuja la familia y los accesorios, y el tipo es la representacion
// interna del motor. La segunda es que si viajara, la pagina podria guardarlo y
// mandarlo de vuelta, y un numero que vuelve al mod por un lado que no es el del
// registro es como vuelve el segundo modelo. Ver "family + attachments" en
// modules/weapons/state.js.
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
    return row;
}

// El texto que aparece con el mouse sobre la fila. No lo lee nada por codigo:
// es la unica ayuda de una tabla de ids, asi que tiene que decir que es, si
// apila o es una unidad, cuanto pesa, cuanto tiene de salud y si lleva cargador.
//
// "instanciado" o "N unidades" sale de isInstanced(id) y NO de it.qty > 1. La
// diferencia importa en el caso de una sola unidad: un stack de 1 (una
// chatarra, un chaleco, una placa) se apila igual, asi que decir "instanciado"
// mentia — y en el catalogo del dealer TODO es qty 1, asi que ahi todos los no
// instanciados decían "instanciado".
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
    var a = ammoCell(it);
    if (a) {
        parts.push(a + " balas");
    }
    parts.push("salud " + clampSalud(it.salud) + "%");
    if (it.hasMag === false) {
        parts.push("sin cargador");
    }
    // Los accesorios, y en el ORDEN en que los nombra el catalogo, no en el que
    // vinieron. La lista que manda el modulo ya viene ordenada, pero el tooltip
    // tambien se arma sobre filas que arma la pagina y esas no.
    if (it.attachments && it.attachments.length) {
        parts.push("con " + it.attachments.join(" + "));
    }
    return parts.join(" · ");
}