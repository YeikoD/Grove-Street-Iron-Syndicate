// GSIS - Variantes de arma (SHIM)
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// POR QUE ESTE ARCHIVO TODAVIA EXISTE
// ============================================================================
// Las tres tablas viven en weapons.js, junto con el resolver y el validador, que
// es donde tienen que estar: la identidad de un arma es una cosa, y partirla en
// "la tabla de armas" y "la tabla de variantes" es exactamente lo que dejo dos
// modelos vivos al mismo tiempo.
//
// Este archivo no tiene ninguna tabla: reexporta. Lo unico que lo sigue
// importando es gsis_Ballistic.js, y la fase 3 lo repunta a weapons.js y lo borra.
//
// ============================================================================
// QUE LE GANO ESTA FUSION
// ============================================================================
// Antes eran 1.114 + 459 lineas con dos modelos de la misma idea conviviendo, y
// solo 1 de 17 armas estaba en el nuevo. Cuatro de ellas:
//
//   la fila de la colt45 repetia en las dos tablas 11 valores (itemId, name, slot,
//   modelId, clipSize, ammoType, category, realWorldName, weight, isLong, price)
//   con un comentario de 40 lineas de calibracion de precio al lado, sin que nada
//   los comparara. Hoy hay una sola fila y el precio esta una vez.
//
//   el silenciador vivia en tres sitios: WEAPON_ATTACHMENTS, WEAPON_DATA e ITEMS.
//   Tres definiciones del mismo objeto, y `clipSource` / `modelSource` se leian
//   en Ballistic y no los declaraba NINGUN item: dos ramas muertas.
//
//   `weaponId` era la identidad en un archivo y una representacion en el otro, y
//   por eso `_tipoEnPies`, `_typeBelongsTo`, el `tipo = wd.weaponId` de
//   equipWeapon y la copia de `resolveAttachmentsOf` eran cuatro respuestas a
//   "que tipo tiene el ped". Ahora hay una funcion.
//
// La tabla y la razon de cada numero estan en weapons.js. Este archivo es un
// puntero, y por diseño lo va a ser por un rato mas.
export * from "./gsis_weapons.js";
