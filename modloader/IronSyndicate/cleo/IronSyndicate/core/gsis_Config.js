// GSIS - Config
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

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
    SAVE: 116,          // F5 — guardar partida
    DEBUG_ITEM: 76,     // L — debug: agregar item
    BAG: 80,            // P — toggle bolso visual
    RELOAD: 82,         // R — swap de cargador (Ballistic)
    ESC: 27,            // ESC — cierra la UI web (modules/gsis_WebInterface.js)

    // SPACE — abre y cierra los menus que viven en una esfera (baul, armeria,
    // retiro, trueque). Es la I de esos menus, con la condicion de que el jugador
    // este parado adentro de la esfera.
    //
    // La misma tecla para abrir y cerrar, y el dueno de la tecla es el bridge
    // (modules/gsis_WebInterface.js, toggleFlow), no cada modulo. Con un dueno
    // solo, una pulsacion se gasta en UNA decision —cerrar lo que esta abierto, o
    // abrir lo que el jugador tiene adelante— en vez de que la abran y la cierren
    // cuatro modulos a la vez en el mismo frame.
    //
    // Antes cada menu tenia su tecla (B para el baul, F para los de esfera) y se
    // abria al TOCAR la esfera. Ahora es una sola tecla para los cuatro, porque lo
    // unico que cambia entre ellos es la esfera: el resto es el panel de inventario
    // con otra lista.
    FLOW: 32
};

// Las teclas de movimiento.
//
// La lista existia para el menu de proximidad, que se cerraba ALEJANDOSE y no
// congelaba al jugador: con un panel en pantalla la pagina se queda con el
// teclado entero, asi que sin W no habia forma de alejarse. Se las pasaba al
// runtime con setMenuKeyPassthrough (core/gsis_Input.js), que las saca del
// WndProc antes de que las vea la pagina.
//
// Hoy ningun menu se cierra alejandose — todos congelan al jugador como el
// inventario — asi que la lista ya no se pasa. Queda porque el runtime la
// necesita igual: son las teclas cuyo estado se lee del teclado real
// (GetAsyncKeyState) y no del estado del juego, que es lo que las hacia utiles
// para detectar una pulsacion de verdad (ver updateProximityMove, y la escalera
// de lectura de readDown en core/gsis_Input.js, que es la que usa el dueno de
// los menus para armar el flanco de la I, la ESPACIO y el ESC).
//
// Son codigos de teclado virtual, como los de KEYS. NO son los codigos de tecla de
// GTA: los dos sistemas numeran distinto (VK_W es 87, y el codigo de tecla de GTA
// viene de un scancode de DirectInput). Confundirlos produce una lista que no
// matchea nada en el WndProc.
export var MOVE_KEYS = [87, 65, 83, 68];  // W A S D

// Distancias (unidades de juego)
export var DIST = {
    PICKUP_RADIUS: 5.0,       // Radio del pickup de registro
    DOOR_LOCK: 30.0,          // Maxima distancia para lock/unlock

    // "Estar dentro de la esfera" para poder ABRIR el menu con SPACE. Es el radio
    // de acceso de cada tipo, no DIST.SPHERE: el objeto esfera mide 0.75 m, que
    // es el radio del marcador, no una zona donde una persona pueda clavarse a
    // apretar una tecla. O sea que la esfera sigue midiendo lo que mide — la
    // cooldown la apaga y la enciende de verdad — pero la puerta de entrada se
    // mide con estos.
    //
    // Y tiene que ser MENOR O IGUAL que el radio de cierre de abajo. Si el de
    // apertura fuera mayor, el menu abriria y se cerraria en el mismo frame: se
    // abre porque estas a 2 m, y el auto-cierre ve que ya estas fuera del radio de
    // cierre y lo baja. Eso es un menu que se abre solo para no existir, y es
    // justo el bug que hizo que el baul no abriera con la B.
    //
    // El del baul era 3.0 porque lo tomaba la B con el menu sin congelar al
    // jugador: 3 m era "estoy al lado del auto", no "estoy en el baul". Con el menu
    // congelando, 3 m no sirve de nada y el punto de mira del baul esta en la
    // parte de atrás: 1.5 m del punto es estar en el baul.
    TRUNK_ACCESS: 1.5,        // Apertura con SPACE del menu baul
    DEALER_ACCESS: 1.5,       // Apertura con SPACE de dealer/seller/pickup

    // El radio del objeto Sphere.Create. Lo que se apaga en la cooldown.
    SPHERE: 0.75,

    // Auto-cierre por distancia. Importa aunque el menu congele al jugador: es la
    // red de seguridad para el caso de que el menu se abra justo cuando algo lo
    // teletransporta (un vehiculo, un script), donde el freeze no alcanza.
    MENU_CLOSE: 1.5,          // Auto-cierre del menu baul
    DEALER_CLOSE: 1.5         // Auto-cierre de dealer/seller/pickup
};

// Timers (milisegundos / frames)
export var TIMERS = {
    POS_UPDATE: 500,              // Batch de posiciones de vehiculos
    ENGINE_SYNC: 250,             // Sincronizacion de motor
    SAVE_THROTTLE: 2000,          // Guardado minimo entre toggles
    TRUNK_SPHERE: 200,            // Update de sphere del baul
    AUTO_SAVE_FRAMES: 18000,      // Auto-save (~5 min a 60fps)
    RELOAD_GRACE: 1000,           // Watchdog recarga (Ballistic): margen tras el deadline
    CHUNK_SIZE: 120,              // Tamanio de chunk JSON en INI

    // Cuanto queda apagada la esfera de un menu recien cerrado.
    //
    // La esfera es la condicion para abrir el menu, asi que apagarla es lo que
    // impide que el menu se reabra solo en el mismo frame en que se cerro: el
    // jugador sigue parado adentro, el juego no lo movio, y sin este tiempo la
    // condicion "estoy en la esfera" seguiria dando true al frame siguiente. Con
    // el menu congelando al jugador, el caso de verdad es el cierre por comando
    // (Escape, ESPACIO) o por una accion que vacia el menu, no el alejarse.
    //
    // 6 s es el tiempo de una ida y vuelta corta: sale, se aleja un poco, y
    // vuelve. Alcanza para que el cierre no se sienta como un menu trabado —si
    // fuera 1 o 2 s, el mismo gesto de abrir-cerrar lo haria desaparecer y
    // reaparecer— y no tanto que el jugador tenga que esperar para poder volver a
    // usar el baul o el vendedor.
    SPHERE_COOLDOWN: 6000
};

// Otros
// Coords de dealer/seller/retiro NO aqui → data/gsis_spot_data.js (N esferas)
export var MISC = {
    MAX_INVENTORY_WEIGHT: 12,     // Peso maximo inventario (kg)
    MAG_BELT_SLOTS: 3,            // Slots ficticios de cinturon (cargadores equipados)
    TOTAL_SAVE_SLOTS: 3,          // Slots de guardado
    DEBUG_ENABLED: true,          // Logs de debug
    PICKUP_X: 2528.0168,          // Posicion pickup de registro (vehiculos)
    PICKUP_Y: -1715.6896,
    PICKUP_Z: 13.4925,
    PICKUP_MODEL: 1254,           // Modelo del pickup
    PICKUP_DEALER_BLIP: 18,       // Sprite radar del punto de retiro
    HIDE_RADAR_WHEN_MENU: true    // Esconder el radar con CUALQUIER menu. Antes era solo con el que congela, porque los de proximidad no congelaban y el jugador seguia en el mundo; ahora todos son de pausa.
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
    FILES: ["fam5"],              // Archivos DFF custom (solo seller)
    // Rango de IDs de modelo RESERVADO PARA ARMAS.
    //
    // Aparte del de personajes a proposito: un ID de modelo es un puntero a un
    // modelo, no una etiqueta. Si una variante de arma y un ped tomaran el
    // mismo ID, el segundo que se cargara pisa al primero y el arma aparece con
    // el cuerpo de un personaje (o al reves). Son rangos separados y no se tocan.
    //
    // Lo que vive aca es el CONTRATO con un .ASI que registre armas: el plugin
    // reserva sus modelos en WEAPON_RANGE y el mod los lee de ahi. Por eso el
    // rango esta en el Config y no en una constante del modulo: es un acuerdo
    // entre dos cosas, y un numero agreementado en un solo lugar.
    WEAPON_RANGE: { START: 15025, END: 15099 }
};

// Rango de weaponId que reservan los plugins (.asi) para sus armas.
//
// Mismo criterio que SPECIAL_MODELS.WEAPON_RANGE: es un acuerdo entre el .asi y
// el mod, asi que el numero vive aca y no como constante en el modulo.
// gsisWeaponLimiter.asi da de alta sus tipos DENTRO de este rango y el mod los
// reconoce por estar aca. Si el .asi y este rango se desincronizan, el arma
// dispara pero el mod la trata como basura vanilla y la borra del save.
//
// Por que un rango y no solo "mayor que WEAPON_ID_NATIVE_MAX (69)": el 69 es
// "el ultimo que reserva FLA" (WEAPONTYPE_FASTMAN92_LAST), no "el ultimo arma
// de vanilla". Los tipos 60..69 no los usa GTA pero son justo los que un
// limitador necesita, porque ahi no cae ningun pseudo-tipo de muerte (49..59).
//
// El rango se AGREGA a la regla vieja, no la reemplaza: todo lo que era
// "> 69" sigue siendolo. Asi ningun plugin que use 80+ queda sin reconocer por
// haber metido este rango.
export var PLUGIN_WEAPON_RANGE = { FIRST: 60, LAST: 79 };
