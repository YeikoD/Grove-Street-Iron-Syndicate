// ============================================================================
// GSIS Config - Teclas, distancias y timers centralizados
// ============================================================================

// Teclas (codes de teclado virtual)
export var KEYS = {
    ENGINE: 49,         // 1 — motor on/off
    LOCK: 50,           // 2 — lock/unlock puertas
    TRUNK: 51,          // 3 — abrir/cerrar baul
    REGISTER: 79,       // O — registrar vehiculo
    INVENTORY: 73,      // I — menu inventario
    TRUNK_MENU: 66,     // B — menu baul
    SAVE: 116,          // F5 — guardar partida
    DEBUG_ITEM: 76,     // L — debug: agregar item
    BAG: 80,            // P — toggle bolso visual
    DEALER: 70,         // F — menu dealer mayorista
    RELOAD: 82          // R — swap de cargador (Ballistic)
};

// Distancias (unidades de juego)
export var DIST = {
    PICKUP_RADIUS: 5.0,       // Radio del pickup de registro
    DOOR_LOCK: 30.0,          // Maxima distancia para lock/unlock
    TRUNK_ACCESS: 3.0,        // Maxima distancia para tecla R (menu baul)
    SPHERE: 0.75,             // Radio de la sphere del baul (auto-apertura menu)
    MENU_CLOSE: 1.5,          // Distancia para auto-cerrar menu baul
    DEALER_ACCESS: 2.0,       // Radio para tecla F (menu dealer)
    DEALER_CLOSE: 3.0         // Auto-cierre menu dealer (histeresis > ACCESS)
};

// Timers (milisegundos / frames)
export var TIMERS = {
    POS_UPDATE: 500,              // Batch de posiciones de vehiculos
    ENGINE_SYNC: 250,             // Sincronizacion de motor
    SAVE_THROTTLE: 2000,          // Guardado minimo entre toggles
    TRUNK_SPHERE: 200,            // Update de sphere del baul
    AUTO_SAVE_FRAMES: 18000,      // Auto-save (~5 min a 60fps)
    RELOAD_GRACE: 1000,           // Watchdog recarga (Ballistic): margen tras el deadline
    CHUNK_SIZE: 120               // Tamanio de chunk JSON en INI
};

// Otros
// Coords de dealer/seller/retiro NO aqui → data/gsis_spot_data.js (N esferas)
export var MISC = {
    MAX_INVENTORY_WEIGHT: 12,     // Peso maximo inventario (kg)
    TOTAL_SAVE_SLOTS: 3,          // Slots de guardado
    DEBUG_ENABLED: true,          // Logs de debug
    PICKUP_X: 2528.0168,          // Posicion pickup de registro (vehiculos)
    PICKUP_Y: -1715.6896,
    PICKUP_Z: 13.4925,
    PICKUP_MODEL: 1254,           // Modelo del pickup
    PICKUP_DEALER_BLIP: 18        // Sprite radar del punto de retiro
};

// Actores permanentes: dormancy por radio + budgets de spawn/check
// ENTER < EXIT (histeresis). Lejanos → dormant (sin handle/modelo en memoria)
export var ACTORS = {
    SPAWN_PER_FRAME: 3,           // CREATE_CHAR exitosos por frame
    SPAWN_SCAN_PER_FRAME: 8,      // slots de cola a intentar por frame
    CHECK_SLICE: 20,              // entradas ready polleadas por tick
    CHECK_MS: 450,                // intervalo checks (≠ POS_UPDATE → sin pico con Spawner)
    ENTER: 150.0,                 // radio de activacion (dormant → spawn)
    EXIT: 180.0                   // radio de desactivacion (> ENTER)
};

// Animaciones de actores (IFP vanilla) — modules/gsis_ActorAnims.js
export var ACTOR_ANIMS = {
    DEFAULT_BLEND: 4.0,     // framedelta TASK_PLAY_ANIM
    LOAD_TIMEOUT_MS: 8000,  // si HAS_ANIMATION_LOADED nunca true → drop
    TICK_MS: 200            // polling de cola pending
};

// Audio seco (click al apretar disparo con arma sin balas) — modules/gsis_FireButton.js
// DRYFIRE_PATH: camino relativo a la raiz del juego; modloader monta
// modloader/IronSyndicate/sounds/dryfire.wav como sounds/dryfire.wav
export var AUDIO = {
    DRYFIRE_PATH: "sounds/dryfire.wav", // wav del click seco (modloader)
    DRYFIRE_VOLUME: 0.8               // factor sobre la posicion de la camara (0xB5FCCC)
};

// Idioma por defecto (sin switch en runtime): "es" | "en"
export var LANG = {
    DEFAULT: "es"
};

// Subtitulos / dialogos (00BB PRINT lowpriority) — modules/gsis_Dialogue.js
export var DIALOGUE = {
    FLAG: 1,              // flag 00BB (subtitulos)
    DEFAULT_MS: 3000,     // duracion default por linea
    GAP: 200,             // ms entre lineas de una secuencia
    MAX_QUEUE: 8,         // limite practico (juego encola ~8)
    DEFAULT_COLOR: "~w~"  // color si la linea no trae codigo ~x~ (blanco)
};

// Bolso visual (CALIBRADO a mano sobre CJ — NO cambiar sin probar en juego)
export var BAG = {
    MODEL: 2919,                  // Modelo del render object
    BONE: 1,                      // Hueso de enganche
    OFFSET_X: 0.1,                // Posicion relativa al hueso
    OFFSET_Y: -0.13,
    OFFSET_Z: 0.0,
    ROT_X: 0.0,                   // Rotacion
    ROT_Y: 0.0,
    ROT_Z: 0.0,
    SCALE_X: 0.330,               // Tamano (x, y, z)
    SCALE_Y: 0.10,
    SCALE_Z: 0.330,
    FINAL_ROT_X: 0.0,             // Rotacion final tras crear
    FINAL_ROT_Y: 70.0,
    FINAL_ROT_Z: -10.0
};

// Modelos especiales (CLEO+ LOAD_SPECIAL_CHARACTER_FOR_ID + GET_MODEL_DOESNT_EXIST_IN_RANGE)
// Los archivos .dff/.txd deben estar en una carpeta accesible por el juego (ModLoader)
// Special chars del juego (Emmet EMMET): gsis_actor_data.js → specialCharacter vía 023C, no FILES
export var SPECIAL_MODELS = {
    ENABLED: true,                // Habilita carga de modelos especiales custom
    RANGE_START: 15000,           // Rango de IDs disponibles (recomendado 15000-15024)
    RANGE_END: 15024,             // Fin del rango de IDs disponibles
    FILES: ["fam5"]               // Archivos DFF custom (solo seller)
};
