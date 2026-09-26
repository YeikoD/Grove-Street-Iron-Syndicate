// GSIS - Character Data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// GSIS Character Data - Catalogo de personajes (nombre, dialogos, actor)
// Identidad narrativa: une nombre (L10n) + lineas de dialogo + ped visual.
// El MODEL/spawn/dormancy viven en el actor (data/gsis_actor_data.js);
// aqui solo se REFERENCIA via actorId — no se duplica lifecycle.
// Sin imports de modules (data/ puro). L10n: t(nameKey) / t(lineKey).
//
// seller (opcional) — WeaponSeller lee ch.seller:
//   interests: ["Pistolas", ...]   // fijos; omitir = aleatorio 1-2
//   budgetMin / budgetMax: number  // presupuesto; omitir = formula actual
//   techoInterest: [min, max]      // extra si le interesa (default [50,450])
//   techoBase: [min, max]          // extra si no (default [0,150])
//
// dealer (opcional) — WeaponDealer lee ch.dealer:
//   items: [itemId, ...]            // catalogo que VENDE (omitir = todas las armas)
//   markup: number                  // 1.2 = +20%, 0.85 = -15%; omitir = base
//   prices: { itemId: n }           // precio fijo por arma (ignora markup)

// Color de nombre en prefijo de dialogo (si nameColor se omite en la entry)
// Blanco: nombre y textos sin ~x~ se leen igual (DEFAULT_COLOR = ~w~)
export var CHAR_NAME_COLOR = "~w~";  // Color default para nombres

export var CHARACTERS = [
    {
        id: "seller_local",  // ID unico del personaje
        nameKey: "CH_SEL",  // Key de localizacion para nombre
        // nameColor: "~w~",  // Color opcional del nombre
        actorId: "weapon_seller",  // Referencia al actor visual
        lines: {  // Mapeo de topics a keys de dialogo
            noqty: "SEL_NOQ",  // Sin cantidad suficiente
            err: "SEL_ERR",  // Error general
            invalid: "SEL_IVL",  // Oferta invalida
            nobuy: "SEL_NOB",  // No compra hoy
            reject_high: "SEL_R1",  // Rechazo: muy caro
            reject_poor: "SEL_R2",  // Rechazo: sin dinero
            reject_stretch: "SEL_R3",  // Rechazo: muy estirado
            accept_pricey: "SEL_A2",  // Acepta: un poco caro
            accept_ok: "SEL_A1"  // Acepta: precio ok
        }
        // seller: { interests: ["Pistolas"], budgetMin: 200, budgetMax: 600 }
        // (sin seller → intereses/budget aleatorios como hasta ahora)
    },
    {
        id: "dealer_local",  // ID unico del personaje
        nameKey: "CH_EMM",  // Key de localizacion para nombre
        actorId: "weapon_dealer",  // Referencia al actor visual
        lines: {},  // Topics TBD (checkout dealer)
        dealer: {  // Configuracion del dealer
            items: ["9mm", "desert_eagle", "micro_uzi"],  // Catalogo que vende
            prices: { "9mm": 100, "desert_eagle": 300, "micro_uzi": 200 }  // Precios fijos
        }
        // markup: number  // 1.15 = +15% (si no hay items/prices)
    }
];

export function getCharacter(id) {
    for (var i = 0; i < CHARACTERS.length; i++) {
        if (CHARACTERS[i].id === id) return CHARACTERS[i];  // Retorna personaje por ID
    }
    return null;  // Retorna null si no existe
}

export function getCharacterByActor(actorId) {
    if (!actorId) return null;
    for (var i = 0; i < CHARACTERS.length; i++) {
        if (CHARACTERS[i].actorId === actorId) return CHARACTERS[i];  // Retorna personaje por actorId
    }
    return null;  // Retorna null si no existe
}
