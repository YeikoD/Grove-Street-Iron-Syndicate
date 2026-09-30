// GSIS - Weapon Data (SHIM)
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// POR QUE ESTE ARCHIVO TODAVIA EXISTE
// ============================================================================
// La tabla vive en weapons.js, que es la fuente UNICA de que armas hay, que
// piezas se les montan y que weaponType ejecuta cada configuracion. Este archivo
// no tiene ninguna tabla: reexporta.
//
// Estos SEIS modulos todavia importan de aca, y dejarlos apuntar a la fuente
// nueva es parte del refactor, no una evasion:
//
//   data/gsis_item_data.js    gsis_Bag.js          gsis_WeaponDealer.js
//   gsis_WeaponSeller.js      ui/views/flow.js    ui/views/itemRow.js
//
// (La lista se verifica con grep sobre `from ".*gsis_weapon_data.js"`. Cuando
// baje a cero, se repuntan a weapons.js y se borra este archivo.)
//
// OJO con los verificadores: un chequeo de imports que resuelva los nombres por
// regex va a reportar que estos seis importan cosas que este archivo "no
// exporta", porque no ve el `export *` de abajo. Es un falso positivo, no un
// bug: hasta la ultima linea, lo que exporta este archivo es lo que exporta
// weapons.js.
//
// ============================================================================
// LO QUE ESTA DERIVADO Y POR QUE IMPORTA
// ============================================================================
// `weaponId` en la vista legada es el weaponType de la VARIANTE BASE de la
// familia, no "el weaponId de este item". Antes esas dos cosas eran la misma
// porque cada configuracion era un item; ahora son distintas y el shim expone la
// base.
//
// Ver la seccion "VISTA LEGADA" de weapons.js, que es donde esta el codigo.
//
// ============================================================================
// data/gsis_weapon_variants.js, EL OTRO SHIM, YA NO LO USA NADIE
// ============================================================================
// Hace lo mismo que este archivo (`export * from "./gsis_weapons.js"`) y no tiene
// ni un importador. Se puede borrar en el mismo cambio que borre este: los dos
// son el mismo compat y dejar los dos es lo que hace que grep no pueda decir cual
// es el bueno.
export * from "./gsis_weapons.js";
