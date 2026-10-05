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
    // G — debug: dar el arma de pruebas del sistema de armas (modules/weapons/gsis_Weapons.js)
    // El 71 es el codigo de teclado virtual de la G. Es una tecla de debug: no la
    // maneja el juego, no esta en el contrato de los menus de la UI, y si algun
    // dia choca con algo se cambia la de ahi y en ningun otro lado.
    DEBUG_WEAPON: 71,
    BAG: 80,            // P — toggle bolso visual
    // R — recargar. Es la tecla que usa "Reload Mod", que es el mod del que sale
    // la secuencia de animacion. El 82 es su codigo de teclado virtual.
    //
    // No compite con la recarga del juego: el motor mueve balas del total al
    // clip, y con el invariante de modules/weapons/ammo.js el total ES el clip,
    // asi que la recarga del juego no tiene nada que mover. La R es la unica que
    // recarga de verdad, y consume un cargador del inventario.
    RELOAD: 82,
    ESC: 27,            // ESC — cierra cualquier menu de la UI web (modules/ui/index.js)
    // X - la accion principal de la fila. Al soltar, ejecuta la principal de la
    // fila elegida (equipar, llenar, quitar, montar); mantenida 600 ms, tira una
    // unidad. modules/ui/index.js la lee y se la REENVIA a la pagina, porque el
    // runtime no se la deja ver. Ver "LA X NO LA VE LA PAGINA" en ese archivo.
    // El 88 es su codigo de teclado virtual.
    ACTION: 88,

    // ============================================================================
    // EL CONTRATO DE TECLAS DE LOS CINCO MENUS
    // ============================================================================
    // Esta tabla es la que el jugador aprende. Vive entera aca y en el despacho
    // de modules/ui/index.js (resolverTecla); ningun modulo lee teclas de menu, y
    // el dueño de la pulsacion es UNO.
    //
    //   MENU CERRADO                MENU ABIERTO
    //   --------------------------   --------------------------
    //   I     -> inventario          I     -> (REGLA 1: no abre nada)
    //   SPACE -> abrir flujo         INTRO -> (la pagina acepta la fila)
    //   INTRO -> abrir flujo         F     -> cerrar
    //   F     -> abrir flujo         ESC   -> cerrar
    //
    // SPACE, INTRO y F abren SI Y SOLO si el menu esta cerrado: abrir es un
    // camino unico (abrirFlujo) con tres teclas, no tres caminos. Y ninguno de
    // los tres CIERRA — el cierre es F o ESC, en cualquier menu— porque una tecla
    // que abre y cierra hace que el jugador aprenda dos reglas por tecla en vez
    // de una, y el error de ese segundo sentido es un menu que se abre solo.
    //
    // F es la unica con doble sentido, y el orden de las preguntas es el que lo
    // hace seguro: primero se mira si hay un menu VISIBLE y se cierra; solo si no
    // hay nada se busca una esfera para abrir. Un F con el menu abierto no puede
    // reabrir, porque la reopenedura no existe en ese camino.
    //
    // Antes cada menu tenia su tecla (B para el baul, F para los de esfera) y se
    // abria al TOCAR la esfera. Lo que se unifico no es el contenido de los menus
    // —que son cuatro pantallas distintas— sino el gesto: lo unico que cambia
    // entre ellos es la esfera donde estas parado.
    FLOW: 32,           // SPACE — abrir (no cierra)
    ENTER: 13,          // INTRO  — abrir con el menu cerrado; aceptar con el menu abierto
    F: 70               // F      — cerrar con el menu abierto; abrir con el menu cerrado
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
// los menus para armar el flanco de I, SPACE, INTRO, F y ESC).
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

// Armas — modules/weapons/
//
// EL RANGO DE TIPOS DEL PLUGIN
// 60..79 es la franja libre de eWeaponType, y es libre SOLO porque fastman92 Limit
// Adjuster esta apagado: con el prendido, 60 y 61 pasan a ser JETPACK_TYPE y
// BINOCULARS_TYPE, y 70..79 caen fuera de NumberOfWeaponTypes. Es una
// precondicion del .asi, no una preferencia; el .asi la exige en su DllMain antes
// de leer gsis_weapons.dat.
//
// Vive aca y no en data/ porque NO es una tabla del mod: es el acuerdo con
// gsisWeaponLimiter.asi sobre que numeros son suyos. Los numeros de cada tipo
// —su padre, su modelo, su slot y su cargador— estan en gsis_weapons.dat, que el
// .asi lee y el mod no abre. Ver "LO QUE NO SE BORRA, Y POR QUE ESTA EN EL DISCO"
// en SPECIAL_MODELS, abajo.
//
// Y el rango no lo usa el modulo para decidir que arma existe: lo usa para
// distinguir "este tipo es mio" de "este tipo es del juego". La capacidad de cada
// tipo NO sale de ahi: se lee del motor con Engine.clipCapacityOf, porque la
// escribio el .asi y no el catalogo.
export var WEAPONS = {
    PLUGIN_TYPE_MIN: 60,
    PLUGIN_TYPE_MAX: 79,

    // Cuantos cargadores se pueden llevar equipado a la vez.
    //
    // No es un numero de UI: es una REGLA del inventario, y vive con los demas
    // numeros de armas por la misma razon que el rango de tipos. El mas alto es
    // aca porque el que decide si un cargador entra es state.js, y el que decide
    // si la UI muestra el "no hay lugar" es el modulo de armas. Los dos leen de
    // aca.
    //
    // Por que dos y no uno: con uno, recargar es un click y el cargador equipado
    // es solo un segundo inventario con la misma funcion. Con dos, el jugador
    // puede llevar el de recargados y el nuevo, y la R elige.
    CARGADORES_EQUIPADOS: 2
};

// Martillo seco (disparo con el arma vacia) — modules/gsis_FireButton.js
//
// SEGUNDO INTENTO: AHORA ES UN STREAM 2D (0x0AAC LOAD_AUDIO_STREAM) y no un 3D.
//
// El 3D (0x0AC1) no se descarta por la API sino por lo que hay que hacerle: un
// stream 3D necesita su POSICION (SET_PLAY_3D_AUDIO_STREAM_AT_CHAR) y despues se
// atenua con la distancia. Para un martillo seco eso son dos pasos que no
// aportan nada: el 2D suena igual desde donde lo dispares.
//
// LA RUTA ES UN RUTA REAL. ModLoader instala lo que tiene handler (.asi, .txt,
// .fxt, .dff, .txd, .cs) y de .wav NO tiene, asi que en modloader.log dice
// "No handler or callme" y el archivo no se copia a la raiz. El opcode 0x0AAC no
// pasa por ModLoader: abre el archivo del disco, relativo a la raiz del juego.
// Por eso el mod "Mantener armas sin balas" trae su .wav junto al script.
// Por que el martillo trae su .wav y la recarga no.
//
// Y VIVO.
// El martillo es un sonido que NO existe en el juego: es un invento del mod, asi
// que tiene que ser un archivo. La recarga si existe, y la tiene el motor con el
// banco del juego, asi que NO hay archivo: la pone el .asi.
//
// CORREGIDO el 04/10/2026. Este comentario decia que la recarga "va por
// Engine.playWeaponReload, que llama a CAEWeaponAudioEntity::WeaponReload". ESA
// FUNCION NO EXISTE: no hay ningun playWeaponReload en el mod, y este archivo es
// el unico lugar donde se mencionaba. El nombre de la funcion nativa del juego es
// correcto —CAEWeaponAudioEntity::WeaponReload existe en el ejecutable, con su
// tabla en 0x503838— pero no es una funcion de este modulo.
//
// Quien la pone, y por que no puede ser el script:
//
//   el motor no tiene una operacion "recargar" a la que llamar. La recarga ES
//   parte del disparo (CWeapon::Fire, 0x73FA20): el arma dispara, y si el cargador
//   quedo vacio y hay reserva, el motor se recarga solo. Como este mod NO tiene
//   reserva —el invariante de modules/weapons/ammo.js lo prohibe— el motor no
//   tiene nada que recargar, y su recarga nunca arranca.
//
//   asi que el script pone RECARGANDO y las balas, y el .asi ve el estado y
//   llama al juego por el lado del padre, que es lo que el motor exige para elegir
//   el sfx. Ver "El sonido NO se pide aca" en modules/weapons/gsis_Weapons.js.
//
// MEDIDO el 04/10/2026, y funciona: en gsis_limiter.txt el rastro del .asi cuenta
// StubSndReload en 301 de 779 trazas de audio. Si el .asi no esta o esta viejo, las
// armas recargan igual pero mudas.
//
// Y el factor: el volumen general del juego (0xB67A50) se multiplica por este
// numero. Es el criterio del mod "Mantener armas sin balas", que leia ese global
// y lo multiplicaba por 0.8.
export var AUDIO = {
    DRYFIRE_PATH: "modloader/IronSyndicate/sounds/dryfire.wav",
    DRYFIRE_VOLUME: 0.8               // factor sobre el volumen general del juego
};

// Idioma por defecto (sin switch in runtime): "es" | "en"
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

// EL RANGO DE MODELOS DE ARMA SE FUE CON EL SISTEMA DE ARMAS QUE SE BORRO.
    //
    // Este bloque SON los personajes (Emmet y los NPC): RANGE_START/END y FILES
    // son suyos y gsis_Actors.js los lee. NO se tocan.
    //
    // Lo que habia abajo, dentro de este mismo objeto, eran tres cosas del acuerdo
    // con gsisWeaponLimiter.asi:
    //
    //   WEAPON_RANGE           el rango 15025..15099 que el .asi reservaba
    //                          para sus modelos de arma
    //   WEAPON_MODELS_ENABLED  el flag de la carga de .dff propios, que ya
    //                          estaba en false desde el 30/09
    //   WEAPON_MODELS          el mapa nombre -> .dff/.txd de colt45_c15
    //
    // PLUGIN_WEAPON_RANGE, al final del archivo, era el rango de weaponId —no de
    // modelId— que el .asi daba de alta. Tambien se fue, y ahora vive en WEAPONS,
    // arriba, como PLUGIN_TYPE_MIN/PLUGIN_TYPE_MAX.
    //
    // La confusion entre los dos niveles ya costo un crash una vez —el ENABLED de
    // los personajes apagado dejaba a los dealers sin modelo—, asi que la
    // separacion de las dos ramas esta escrita aca y no se fusionan nunca.
    //
    // ============================================================================
    // LO QUE ESTA EN EL DISCO, Y NO SE BORRA
    // ============================================================================
    // gsis_weapons.dat, gsisWeaponLimiter.asi y models\weapons\ SIGUEN VIVOS.
    //
    // CORREGIDO el 04/10/2026. Este bloque decia que estaban "sin tocar y sin
    // usar", que "nada les pide los tipos 60..66", que quedaban "13 slots del rango
    // ocupados por armas que nadie puede pedir", y dejaba escrita la orden de
    // borrarlos. TODO ESO ERA FALSO, y la orden era el problema: seguirla borra
    // media capacidad del mod y no da ningun error al arrancar, porque el .asi
    // sigue cargando y solo deja de dar de alta los tipos.
    //
    // Que es lo que hay, MEDIDO en gsis_limiter.txt el 04/10/2026:
    //
    //   el .dat tiene 4 filas, y las 4 estan dadas de alta:
    //     60  padre 23  modelId 347    clip 8   colt45 silenciada
    //     61  padre 23  modelId 15066  clip 15  silenciada + cargador de 15
    //     62  padre 22  modelId 15065  clip 15  colt45 + cargador de 15
    //     63  padre 22  modelId 346    clip 8   colt45 pelada
    //
    //   o sea 4 tipos del rango 60..79, no 7 ni 13. Quedan 16 libres.
    //
    // Y los dos modelId propios —15065 y 15066— NO son opcionales: son los unicos
    // que hacen que el arma se vea con la forma de la C15. Sin ellos el .asi cae al
    // modelo del padre y el jugador ve una pistola normal creyendo que tiene la
    // C15. Ver AGREGAR_ARMAS.md, paso 1.
    //
    // NO HAY NADA QUE BORRAR ACA. Si alguna vez se decide sacar el sistema de armas
    // del mod —y no se ha decidido— lo que se borra es el modulo de CLEO, y el
    // .dat y el .asi se dejan, porque son la otra mitad del acuerdo y el .asi los
    // lee en su DllMain antes de que exista un solo script. Borrarlos es lo que
    // hay que pensar dos veces, no lo que hay que dejar anotado como tarea.
};
