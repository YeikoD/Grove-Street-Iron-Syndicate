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
// Estos ocho modulos todavia importan de aca, y dejarlos apuntar a la fuente
// nueva es parte del refactor, no una evasion:
//
//   gsis_item_data   gsis_Bag          gsis_Ballistic     gsis_FlowSerialization
//   gsis_ItemRow     gsis_Items        gsis_WeaponDealer  gsis_WeaponSeller
//
// La fase 3 repunta esos imports a weapons.js y borra este archivo. Hasta
// entonces, lo que cambia es DONDE estan los datos, no lo que dicen.
//
// ============================================================================
// LO QUE ESTA DERIVADO Y POR QUE IMPORTA
// ============================================================================
// `weaponId` en la vista legada es el weaponType de la VARIANTE BASE de la
// familia, no "el weaponId de este item". Antes esas dos cosas eran la misma
// porque cada configuracion era un item; ahora son distintas y el shim expone la
// base.
//
// Eso tiene una consecuencia concreta y es la razon por la que el shim tiene una
// fecha: Ballistic todavia usa `weaponId` para decidir que tipo tiene el ped, y
// con ese campo puesto va a leer siempre la base. Para la colt45 eso es 63 en vez
// de 22, y para el resto coincide con lo de antes. La correccion es resolver por
// `family + attachments` y es trabajo de la fase 3.
//
// Ver la seccion "VISTA LEGADA" de weapons.js, que es donde esta el codigo.
export * from "./gsis_weapons.js";
