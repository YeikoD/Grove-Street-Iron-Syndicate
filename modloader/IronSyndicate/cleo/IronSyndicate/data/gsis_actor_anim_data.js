// GSIS - Actor Anim Data
// Copyright (C) 2026  YeikoD
// Licencia: GNU GPL v3 o posterior (texto completo en LICENSE).

// GSIS Actor Anim Data - Catalogo de animaciones de actores (IFP vanilla)
// Runtime: modules/gsis_ActorAnims.js (REQUEST/HAS/PLAY + EventBus anims:*)
// id debe ser unico; ifp "PED" no requiere REQUEST_ANIMATION ni REMOVE_ANIMATION
// Nombres de anim/ifp: ajustar en data si el juego no reproduce nada (sin crash)
//
// Campos opcionales del def (defaults en Config.ACTOR_ANIMS / defaults abajo):
//   blend    float  framedelta (default 4.0)
//   loop     bool   default true
//   lockX    bool   default false
//   lockY    bool   default false
//   keepLast bool   default false
//   time     int    ms; -1 = hasta que termine sola (default -1)

export var ANIM_DEFAULTS = {
    blend: 4.0,
    loop: true,
    lockX: false,
    lockY: false,
    keepLast: false,
    time: -1
};

// Nombres reales SA (ver listas de anims): IFP "DEALER" tiene DEALER_IDLE*
// Pedir REQUEST_ANIMATION para ifp != "PED" (lo hace ActorAnims)
export var ACTOR_ANIMS = [
    {
        id: "dealer_idle",
        ifp: "DEALER",
        name: "DEALER_IDLE",
        loop: true
    },
    {
        id: "seller_idle",
        ifp: "DEALER",
        name: "DEALER_IDLE_01",
        loop: true
    }
];

export function getAnimDef(id) {
    for (var i = 0; i < ACTOR_ANIMS.length; i++) {
        if (ACTOR_ANIMS[i].id === id) return ACTOR_ANIMS[i];
    }
    return null;
}
