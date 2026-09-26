// GSIS Actor Data - Catalogo de actores (modelos, tareas, lifetime, placement)
// Cada actor tiene spawn propio absoluto — NO se liga a esferas ni spots
// (interaccion F: data/gsis_spot_data.js — cosas distintas)
// lifetime: "permanent" auto-spawn en init | "disposable" solo via actors:spawn
//
// Tres formas de modelo:
//   1) Vanilla: model: <ID> (REQUEST_MODEL/CREATE_CHAR normal)
//   2) Special char del juego (023C): specialCharacter: { slot, name }
//      p.ej. Emmet 'EMMET' → model = 289 + slot (NO usar LOAD_SPECIAL_CHARACTER_FOR_ID)
//   3) Custom dff (CLEO+ 0E9A): isSpecialModel + modelFile en SPECIAL_MODELS.FILES

// Fallback si SPECIAL_MODELS.ENABLED = false o falla la carga
export var ACTOR_MODELS = {
    WEAPON_SELLER: 291    // fallback vanilla si falla fam5
};

// Presets de tareas aplicadas al spawn (y reutilizables via actors:task)
// "clear" = CLEAR_CHAR_TASKS (0687) | "stayInPlace" = SET_CHAR_STAY_IN_SAME_PLACE (0350)
export var ACTOR_TASKS = {
    QUIET: ["clear", "stayInPlace"],  // Limpia tareas y mantiene en lugar
    CLEAR_ONLY: ["clear"]  // Solo limpia tareas
};

// idleAnim (opcional): id en data/gsis_actor_anim_data.js
// Al actors:spawned, modules/gsis_ActorAnims.js reproduce esa anim sola
// Actors no importa ActorAnims — solo data en el def

export var ACTORS = [
    {
        id: "weapon_dealer",  // ID unico del actor
        role: "dealer",  // Rol para agrupar actores
        model: 290,  // Modelo (special slot 1 → 289 + 1 para Emmet)
        specialCharacter: { slot: 1, name: "EMMET" },  // Special char del juego
        pedType: 4,  // Tipo de ped
        spawn: { x: 2512.3333, y: -1681.3495, z: 13.4744, heading: 48.8572 },  // Coordenadas spawn
        onSpawn: ACTOR_TASKS.QUIET,  // Tareas al spawnear
        idleAnim: "dealer_idle",  // Animacion idle
        lifetime: "permanent",  // Permanente (respawnea automaticamente)
        autoDespawnOnDeath: false  // No despawnea al morir
    },
    {
        id: "weapon_seller",  // ID unico del actor
        role: "seller",  // Rol para agrupar actores
        model: ACTOR_MODELS.WEAPON_SELLER,  // Modelo fallback
        pedType: 4,  // Tipo de ped
        isSpecialModel: true,  // Indica modelo especial custom
        modelFile: "fam5",  // Archivo DFF custom
        spawn: { x: 2518.8044, y: -1678.0944, z: 14.5308, heading: 79.9008 },  // Coordenadas spawn
        onSpawn: ACTOR_TASKS.QUIET,  // Tareas al spawnear
        idleAnim: "seller_idle",  // Animacion idle
        lifetime: "permanent",  // Permanente (respawnea automaticamente)
        autoDespawnOnDeath: false  // No despawnea al morir
    }
    // 5 dealers → 5 entradas con spawn propio (coords distintas a las esferas si quieres)
    // Descartables:
    // { id: "escort_grunt", role: "escort", model: ..., pedType: 4,
    //   onSpawn: ACTOR_TASKS.CLEAR_ONLY, lifetime: "disposable", autoDespawnOnDeath: true }
    //   (coords llegan via actors:spawn x/y/z, o spawn fijo en def)
];

export function getActorDef(id) {
    for (var i = 0; i < ACTORS.length; i++) {
        if (ACTORS[i].id === id) return ACTORS[i];  // Retorna definicion por ID
    }
    return null;  // Retorna null si no existe
}
