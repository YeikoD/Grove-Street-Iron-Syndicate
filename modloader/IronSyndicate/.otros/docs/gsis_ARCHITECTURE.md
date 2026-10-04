# GSIS — Arquitectura de Codigo

Documentacion tecnica de la arquitectura del mod Grove Street Iron Syndicate.

Ver [gsis_README.md](./gsis_README.md) para estructura de directorios.

---

## 1. Estructura de Directorios

```
cleo/
└── [fs][mem]gsis_index.js                 ← Shim que delega (el scanner de CLEO solo lee la raiz de cleo\)
    └── modloader/IronSyndicate/cleo/[fs][mem]gsis_index.js
        └── IronSyndicate/
    ├── core/                         ← Infraestructura (NO cambia al agregar features)
    │   ├── gsis_SaveManager.js       ← Persistencia + cache por frame
    │   ├── gsis_SaveMigration.js     ← Version del save, migradores registrados, renames de itemId
    │   ├── gsis_Config.js            ← Teclas, distancias, timers centralizados
    │   ├── gsis_EventBus.js          ← Pub/sub para desacoplar modulos
    │   ├── gsis_EventNames.js        ← Tabla de strings: los nombres de evento que cruzan modulos
    │   ├── gsis_Input.js             ← DUENO del teclado: supresion, menus, freeze del player
    │   ├── gsis_ModuleRegistry.js    ← Init/update automatico de modulos
    │   ├── gsis_SpotRuntime.js       ← Esferas: gate, ciclo de vida, cooldown, spotCanOpen/closeSpotFlow
    │   ├── gsis_Engine.js            ← El unico camino a la memoria de CWeapon / CWeaponInfo
    │   ├── gsis_Notice.js            ← Aviso de una sola accion para la pagina (set/take/clear)
    │   └── gsis_L10n.js              ← t(key, params), initL10n, FxtStore sync
    │
    ├── modules/                      ← Logica de negocio (sin UI, sin imports entre si)
    │   │   ┌ Un archivo por RESPONSABILIDAD, no un archivo por modulo.
    │   │   │ Cada subcarpeta reexporta por su index.js y se registra sola.
    │   │   └ Los modulos de una linea (gsis_*.js) no tienen subcarpeta.
    │   │
    │   ├── gsis_Spawner.js           ← Registro O, handles, spawn/load, batch (tecla O)
    │   ├── gsis_EngineLock.js        ← Motor + lock + blips (teclas 1, 2)
    │   ├── gsis_Trunk.js             ← Baules, spheres que siguen al auto, menu (3, ESPACIO) + putInTrunk/takeFromTrunk
    │   ├── gsis_Vehicles.js          ← Save throttle + F5
    │   ├── gsis_Documents.js         ← Documentos/propiedades
    │   ├── gsis_Bag.js               ← Bolso visual (tecla P, requiere arma larga)
    │   ├── gsis_PropertyModule.js    ← Compra/listado de propiedades
    │   ├── gsis_Actors.js            ← Spawn peds permanentes/descartables + especiales (EventBus)
    │   ├── gsis_ActorAnims.js        ← Animaciones actores IFP vanilla (anims:*)
    │   ├── gsis_Dialogue.js          ← Subtitulos 00BB: cola timing (dialogue:*)
    │   ├── gsis_Characters.js        ← Personajes: nombre + lineas + actorId → dialogue:*
    │   ├── gsis_WeaponDealer.js      ← Dealer: carrito memoria + checkout (esfera + ESPACIO)
    │   ├── gsis_DealerPickup.js      ← Retiro: esfera + blip condicional (esfera + ESPACIO) + collectItem/collectAll
    │   ├── gsis_WeaponSeller.js      ← Trueque: NPC intereses/budget + techo (esfera + ESPACIO) + doOffer
    │   ├── gsis_FireButton.js        ← Boton disparo con arma vacia + click seco (fix KeepNoAmmo)
    │   │
    │   ├── inventory/                ← items[], trunks{}, cinturon, peso, precio de entrega
    │   │   ├── index.js              ← register("Items") + la superficie publica reexportada
    │   │   ├── state.js              ← Los contenedores y las fabricas de filas (SAVE_KEY)
    │   │   ├── logic.js              ← Mover items: add/remove, baul, cinturon
    │   │   └── events.js             ← Los handlers del bus que ATIENDE (import side-effect)
    │   │
    │   ├── weapons/                  ← Registro equipped[slot], equipar, montar, recargar
    │   │   ├── index.js              ← register("Weapons") + init/update + la tecla R
    │   │   ├── state.js              ← Donde vive la configuracion (SAVE_KEY = "Ballistic")
    │   │   ├── logic.js              ← equipar, desequipar, montar, sacar, tryReload
    │   │   ├── internal.js           ← El UNICO punto que le da un arma al motor
    │   │   ├── reconcile.js          ← Que el ped y el registro digan lo mismo (adopcion)
    │   │   ├── models.js             ← ensureModelForType + cola de modelos propios
    │   │   ├── migrate.js            ← Migracion v1→v2 del registro; se registra al importarse
    │   │   └── events.js             ← Los nombres que weapons EMITE
    │   │
    │   └── ui/                       ← La pagina web (CEF/SAWeb). register("WebInterface")
    │       ├── index.js              ← Ciclo de vida: teclado, visibilidad, los 2 pushes
    │       ├── bridge.js             ← El cable con el runtime: send/pushChunked/drainCommands
    │       ├── commands.js           ← Que significa cada verbo de la pagina
    │       └── views/
    │           ├── inventory.js      ← snapInventory()   ("inv")
    │           ├── catalog.js        ← snapCatalog()     ("catalog")
    │           ├── flow.js           ← currentFlow/openFlow/closeFlow + snapFlow() ("screen")
    │           └── itemRow.js        ← La fila de la tabla, compartida por las 5 pantallas
    │
    ├── data/                         ← Datos estaticos (no logica)
    │   ├── gsis_vehicle_data.js      ← Nombres/capacidades de vehiculos
    │   ├── gsis_item_data.js         ← Catalogo de items (pesos/tipos)
    │   ├── gsis_weapons.js           ← FAMILIAS + CARGADORES + SILENCIADORES: una familia por item, el tipo se deriva
    │   ├── gsis_actor_data.js        ← Modelos, tareas, lifetime, spawn, idleAnim de peds
    │   ├── gsis_actor_anim_data.js   ← Catalogo anims actores (IFP vanilla)
    │   ├── gsis_character_data.js    ← Personajes: nameKey, actorId, lines (topics)
    │   ├── gsis_spot_data.js         ← Esferas (dealer/seller/pickup) — independiente de actores
    │   ├── gsis_web_data.js          ← Iconos y bandas de la tabla web (lo que la pagina no puede deducir)
    │   ├── gsis_lang_data.js         ← STRINGS es/en (L10n, keys GXT ≤7)
    │   ├── gsis_property_data.js     ← Propiedades comprables (Fase 1 LS)
    │   └── gsis_VARIANTES.md        ← Doc del modelo de familias, junto a la tabla
    │
    ├── saves/
    └── mod.json

modloader/IronSyndicate/
├── UI/                                 ← Pagina web que dibuja la ASI (HTML/CSS/JS)
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── assets/                         ← Tipografias (.woff2/.woff)
├── UI/assets/    Iconos PNG: imagenes/, imagenes/weapons/, iconos/categorias/                              ← Iconos PNG de items
├── models/  sounds/
└── KeepNoAmmo.SA.asi

cleo/CLEO_TEXT/  →  modloader/IronSyndicate/cleo/cleo_text/
    ├── gsis.fxt                         ← Fallback ES mensajes/UI (UTF-8, hot-reload)
    └── gsis_dialog.fxt                  ← Fallback ES diálogos/subtítulos (UTF-8)
```

### Regla de Dependencias (un solo sentido)

```
ui/  →  modules/  →  core/  →  data/
```

- **ui/** importa de modules/ (leer estado) y core/ (config)
- **modules/** importa de core/ y data/, y de los `index.js` de los otros modulos
  — nunca de un archivo interno de otro
- **core/** no conoce modules/ ni ui/
- **NUNCA** al reves: modules/ no importa ui/, core/ no importa modules/
- Comunicacion de datos entre modulos: **solo EventBus** (`emit`/`on`/`query`)

Importar el `index.js` de un modulo no es una excepcion a la regla del bus: es lo
unico que ese modulo publica. Lo que **no** se hace es importar un archivo de
adentro, porque `state.js` es la implementacion y no la puerta.

#### La excepcion que es una regla: `inventory/` y `weapons/`

Entre si, estos dos **no** pueden hablarse por import. Y como son los unicos que
se hablan seguido, se partieron en subcarpetas con una puerta: cada uno tiene un
`index.js` que se registra y reexporta, y archivos adentro que se usan entre si
para trabajar.

```
inventory/index.js  ←  el unico que otros modulos importan
  ├─ state.js   ├─ logic.js   └─ events.js
weapons/index.js    ←  el unico que otros modulos importan
  ├─ state.js  ├─ logic.js  ├─ internal.js  ├─ reconcile.js  ├─ models.js
  ├─ migrate.js  └─ events.js
```

Entre ellos tampoco hay imports. Se hablan por el bus, y los **nombres** de los
eventos estan en `core/gsis_EventNames.js` — un archivo que no es un modulo, es
una tabla de strings. La razon de que sea un archivo y no que cada modulo
declare los suyos: ver el header de `gsis_EventNames.js`.

Esa frontera **es un assert, no una convencion**: la seccion 7 de
`tools/check-ui-flow.mjs` lee los archivos de las dos carpetas y falla si alguna
menciona a la otra, y ademas prueba que el contrato funcione (que
`items:takeWeapon` responda, que `weapons:capacityOfItem` de 75). El resto de los
modulos si se importan entre si (`gsis_Trunk.js` importa de `gsis_Spawner.js`),
asi que el corte es solo sobre estas dos carpetas.

---

## 2. Patron de Modulo

### Modulo logico de una linea (init + update)

Los modulos que no tienen subcarpeta son un archivo: `gsis_Spawner.js`,
`gsis_Trunk.js`, etc. Se registran y se auto-registran al importarse.

```javascript
// modules/gsis_MiModulo.js
import { registerModule, getModuleData, setModuleData } from "../core/gsis_SaveManager.js";
import { KEYS, TIMERS } from "../core/gsis_Config.js";
import { emit, on } from "../core/gsis_EventBus.js";
import { register } from "../core/gsis_ModuleRegistry.js";

register({
    name: "MiModulo",
    init: function () {
        registerModule("MiModulo", { datos: [] });
    },
    update: function (now) {
        // Logica cada frame — receives timestamp
    }
});
```

### Modulo partido (subcarpeta) — `inventory/` y `weapons/`

Cuando un modulo crece hasta hacer todo, la division es **un archivo por
responsabilidad**, y cada uno cabe en una frase. La puerta es el `index.js`: se
registra, corre el `init`/`update`, y reexporta la superficie publica. Los
archivos de adentro si se importan entre si, que es lo unico que cambia con
respecto a la regla de arriba.

```javascript
// modules/weapons/index.js
import "./migrate.js";                 // side-effect: registra el migrador al importarse
import { register } from "../../core/gsis_ModuleRegistry.js";
import { SAVE_KEY } from "./state.js";
import { tryReload } from "./logic.js";
import { reconcile } from "./reconcile.js";
import { stepCustomModels } from "./models.js";

register({
    name: "Weapons",                   // el nombre en el registro
    init: function () {
        registerModule(SAVE_KEY, { equipped: {} });   // SAVE_KEY = "Ballistic"
    },
    update: function (now) {
        stepCustomModels();
        reconcile();
        if (keyJustPressed(KEYS.RELOAD)) tryReload();
    }
});
```

El `name` del registro y la clave del save **no son lo mismo** y no tienen por que
serlo: `"Weapons"` es para los logs y el orden de update, `"Ballistic"` es la
ruta dentro de `GameState`. Renombrar la segunda es un rename de save y va con su
migracion.

### Puente de UI web (`modules/ui/` — se auto-registra)

La UI del mod es una pagina web que dibuja la ASI de SAWeb (CEF OSR -> textura D3D9 -> framebuffer).
`modules/ui/index.js` es el unico dueno de la visibilidad del panel y el unico que
empuja datos a la pagina. Del **teclado** no es dueno: eso es `core/gsis_Input.js`.

El paquete esta partido por lo que cambia junto, y no por capa:

| Archivo | Que resuelve | Que lo cambia |
|---|---|---|
| `ui/index.js` | Ciclo de vida: teclas, visibilidad, los dos pushes | El ciclo de vida del modulo |
| `ui/bridge.js` | El cable con el runtime: `send` / `pushChunked` / `canCommand` / `drainCommands` | Un cambio en el runtime de la pagina |
| `ui/commands.js` | Que significa cada verbo de la pagina (`handleCommand`) | Un boton nuevo en la pagina |
| `ui/views/*.js` | Los snapshots que la pagina dibuja | Lo que la pagina dibuja |

```javascript
// modules/ui/index.js
import { register } from "../../core/gsis_ModuleRegistry.js";
import { KEYS, MISC } from "../../core/gsis_Config.js";
import { setMenuVisible, anyMenuVisible, refresh as refreshInput, inputState,
         rawKeyDown, setMenuCursor, setMenuGameState, setMenuKeyPassthrough,
         setMenuGameMouse, setMenuAnchor } from "../../core/gsis_Input.js";
import { UI_ID, send, pushChunked, canCommand, drainCommands, isOpen } from "./bridge.js";
import { handleCommand } from "./commands.js";
import { snapInventory } from "./views/inventory.js";
import { snapCatalog } from "./views/catalog.js";
import { currentFlow, openFlow, closeFlow, snapFlow } from "./views/flow.js";

function pollKeys() {
    refreshInput();            // lee SAWeb_GetInputState: donde esta el teclado de verdad
    // rising edge de KEYS.INVENTORY -> togglePanel()   (rawKeyDown: sin supresion)
    // rising edge de KEYS.FLOW     -> toggleFlow()    (idem: la ESPACIO abre y cierra)
    // broadcast() cada frame: latch por firma, manda "uistate" si algo cambio (incluido flow)
    // estado del juego: cursor + freeze + sin passthrough + sin mouse + sin ancla
    // drainCommands(): drena "cmd:*" de la pagina, con el menu cerrado tambien
    // REGLA 1: pushInventory() si se ve el panel, pushScreen() si se ve un flujo
}

register({
    name: "WebInterface",
    init: initUI,              // detecta si el canal de retorno esta disponible
    update: pollKeys
});
```

`index.js` y `commands.js` se necesitan mutuamente (`commands.js` llama a
`togglePanel`/`toggleFlow`, que viven en `index.js`), y eso seria un ciclo. Se
resuelve pasando un objeto con lo que `commands.js` necesita, armado una vez en
`index.js` (`_alComando`). Lo que **no** va por ahi es el transporte: que haya un
comando no depende de que el canal ande.

Reglas del modelo (dos niveles, igual que era con el UIManager):

- El bridge es dueno de la visibilidad. La pagina refleja, y las **acciones** llegan
  por un canal de retorno en el que el bridge es el que decide.
- El **teclado** lo tiene `core/gsis_Input.js`, que es el unico que llama a
  `SAWeb.setCursor`, el unico que consulta el estado y el unico que decide si un
  hotkey se suprime. El bridge solo le pasa informacion. Ver
  [gsis_INPUT.md](./gsis_INPUT.md).
- El browser **nunca** se cierra: se oculta por clase `.hidden` y el DOM sigue vivo.
- Los dos sentidos andan, por caminos distintos: **CLEO → pagina** con
  `SAWeb.ui.send`, y **pagina → CLEO** con `cmd:` + `SAWeb.takeCommand()`. El
  camino de `on()` / `TriggerEvent` es el que CLEO Redux 1.5.0 no le entrega a
  los scripts, asi que no se usa. Ver [gsis_WEBUI.md §3](./gsis_WEBUI.md).
- Los snapshots (`ui/views/`) son de **solo lectura**; toda mutación de estado vive
  en el módulo dueño. El bridge no sabe cuánto pesa un baúl ni cuánto cuesta un
  arma: delega en el módulo y este le dice.
- **La fila de la tabla vive en un archivo solo** (`ui/views/itemRow.js`). La usan
  las cinco pantallas. Copiarla por pantalla es la forma concreta de que el
  recorte de munición a la capacidad y el guion en vez del cero diverjan sin que
  nadie se entere.

Solo falta el `import` side-effect en `[fs][mem]gsis_index.js` (orden = orden de update).

Contrato, troceado y limites: [gsis_WEBUI.md](./gsis_WEBUI.md).
Reglas de mantenimiento: [gsis_MAINTENANCE.md](./gsis_MAINTENANCE.md).

---

## 3. Core — Infraestructura

### 3.1 SaveManager — Hub de Estado

Estado centralizado y persistencia via JSON chunked en INI.

```javascript
import { registerModule, getModuleData, setModuleData } from "../core/gsis_SaveManager.js";

registerModule("VehicleModule", { vehicles: [] });   // Registrar defaults
var data = getModuleData("VehicleModule");            // Leer (cache por frame)
data.vehicles.push(nuevo);
setModuleData("VehicleModule", data);                 // Escribir
```

| Funcion | Uso |
|---|---|
| `initSaveManager()` | Inicializar, cargar partida |
| `saveGame(slot)` / `loadGame(slot)` | Persistencia |
| `registerModule(name, def)` | Registrar modulo con defaults |
| `getModuleData(name)` | Leer datos (1 clone/frame via cache) |
| `setModuleData(name, data)` | Escribir datos |
| `_invalidateCache()` | Limpiar cache (se llama al inicio de cada frame) |

**Cache por frame**: `getModuleData` clona 1 vez por modulo por frame, despues cachea. Se invalida automaticamente al inicio de cada frame en index.js. Evita deep clones repetidos.

### 3.2 Config — Constantes Centralizadas

```javascript
// core/gsis_Config.js
export var KEYS = {
    ENGINE: 49,         // 1
    LOCK: 50,           // 2
    TRUNK: 51,          // 3
    REGISTER: 79,       // O
    INVENTORY: 73,      // I — inventario (abre y cierra)
    SAVE: 116,          // F5
    DEBUG_ITEM: 76,     // L
    BAG: 80,            // P
    RELOAD: 82,         // R — recarga (swap de cargador en weapons/)
    ESC: 27,            // ESC — cierra cualquier menu
    FLOW: 32            // ESPACIO — abre y cierra los menus de esfera
};

export var MOVE_KEYS = [87, 65, 83, 68];  // W A S D (VK, NO codigos de tecla de GTA)

export var DIST = {
    PICKUP_RADIUS: 5.0,       // Radio del pickup de registro
    DOOR_LOCK: 30.0,          // Max distancia lock/unlock
    TRUNK_ACCESS: 1.5,        // Apertura con ESPACIO del menu baul
    DEALER_ACCESS: 1.5,       // Apertura con ESPACIO (dealer/seller/pickup)
    SPHERE: 0.75,             // Radio del objeto esfera (el marcador, no la puerta)
    MENU_CLOSE: 1.5,          // Auto-cierre del menu baul
    DEALER_CLOSE: 1.5         // Auto-cierre de dealer/seller/pickup
};

export var TIMERS = {
    POS_UPDATE: 500,          // Batch de posiciones
    ENGINE_SYNC: 250,         // Sincronizacion de motor
    SAVE_THROTTLE: 2000,      // Guardado minimo entre toggles
    TRUNK_SPHERE: 200,        // Seguimiento de la sphere del baul
    AUTO_SAVE_FRAMES: 18000,  // Auto-save (~5 min a 60fps)
    RELOAD_GRACE: 1000,       // SIN CONSUMIDOR (quedo del watchdog de recarga viejo)
    CHUNK_SIZE: 120,          // Tamanio de chunk JSON en INI
    SPHERE_COOLDOWN: 6000     // Esfera apagada tras cerrar un menu de esfera
};

export var LANG = {
    DEFAULT: "es"        // "es" | "en" — idioma del mod (L10n)
};
```

> **Deuda conocida en Config**: `TIMERS.RELOAD_GRACE` no lo lee nadie. Quedo del
> watchdog de recarga (`_watchdogReload`), que se fue entero con el cambio de
> cargador por cambio de `weaponType`: ahora no hay animacion que esperar y por lo
> tanto no hay margen que darle. Se puede borrar en el mismo cambio que la
> mencion a "cargador montado" desaparezca de otro archivo.
>
> `MOVE_KEYS` sigue viva porque `core/gsis_Input.js` la usa para leer el teclado
> **real** (`GetAsyncKeyState`), que es de donde salen los flancos de la I, la
> ESPACIO y el ESC del bridge. Lo que ya no se hace es pasarsela a la pagina con
> `setMenuKeyPassthrough`: ningun menu se cierra alejandose, todos congelan.
>
> `PLUGIN_WEAPON_RANGE = { FIRST: 60, LAST: 79 }` esta en Config, pero **la fuente
> de verdad son `PLUGIN_TYPE_MIN` / `PLUGIN_TYPE_MAX` de `data/gsis_weapons.js`**,
> que son los que usa `weapons/index.js` para validar. Ver
> [gsis_WEAPONS.md §0](./gsis_WEAPONS.md).

> `KEYS` declara **que tecla es que**. Quien decide si esa tecla actua o no es
> `core/gsis_Input.js`: ningun modulo llama `Pad.IsKeyJustPressed` directo, van
> todos por `keyJustPressed(vk)`, que devuelve `false` mientras haya un menu
> abierto. Ver [gsis_INPUT.md §5](./gsis_INPUT.md).

```javascript
// Subtitulos / dialogos (00BB) — modules/gsis_Dialogue.js
// Keys en CLEO_TEXT/gsis_dialog.fxt (resto de strings en gsis.fxt)
export var DIALOGUE = {
    FLAG: 1,              // flag 00BB (subtitulos)
    DEFAULT_MS: 3000,     // duracion default por linea
    GAP: 200,             // ms entre lineas de una secuencia
    MAX_QUEUE: 8,         // limite practico (juego encola ~8)
    DEFAULT_COLOR: "~w~"  // si la linea no trae ~x~ → blanco
};

export var MISC = {
    MAX_INVENTORY_WEIGHT: 12,     // Peso maximo del inventario (kg)
    MAG_BELT_SLOTS: 3,            // Slots del cinturon de cargadores
    TOTAL_SAVE_SLOTS: 3,
    DEBUG_ENABLED: true,
    PICKUP_X: 2528.0168,          // Posicion del pickup de registro
    PICKUP_Y: -1715.6896,
    PICKUP_Z: 13.4925,
    PICKUP_MODEL: 1254,
    PICKUP_DEALER_BLIP: 18,       // Sprite radar del punto de retiro
    HIDE_RADAR_WHEN_MENU: true    // Oculta el radar con cualquier ventana de la UI
};

// Actores permanentes: dormancy por radio + budgets de spawn/check
export var ACTORS = {
    SPAWN_PER_FRAME: 3,
    SPAWN_SCAN_PER_FRAME: 8,
    CHECK_SLICE: 20,
    CHECK_MS: 450,
    ENTER: 150.0,                 // radio dormant → spawn
    EXIT: 180.0                   // radio spawn → dormant (histeresis)
};

export var ACTOR_ANIMS = {
    DEFAULT_BLEND: 4.0,
    LOAD_TIMEOUT_MS: 8000,
    TICK_MS: 200
};

export var AUDIO = {
    DRYFIRE_PATH: "sounds/dryfire.wav",   // click seco (modloader)
    DRYFIRE_VOLUME: 0.8
};

// Bolso visual (calibrado a mano sobre CJ — NO cambiar sin probar en juego)
export var BAG = {
    MODEL: 2919,                  // Modelo del render object
    BONE: 1,                      // Hueso de enganche
    OFFSET_X: 0.1,                // Posicion relativa al hueso
    OFFSET_Y: -0.13,
    OFFSET_Z: 0.0,
    ROT_X: 0.0,                   // Rotacion
    ROT_Y: -0.15,
    ROT_Z: 0.0,
    SCALE_X: 0.330,               // Tamano (x, y, z)
    SCALE_Y: 0.10,
    SCALE_Z: 0.330,
    FINAL_ROT_X: 0.0,             // Rotacion final tras crear
    FINAL_ROT_Y: 70.0,
    FINAL_ROT_Z: -10.0
};

// Modelos especiales peds custom (CLEO+ LOAD_SPECIAL_CHARACTER_FOR_ID)
// Guia: docs/gsis_ACTORS.md → "Mini-Guía: Cargar modelos SIN reemplazar nada"
// Special chars del juego (Emmet): gsis_actor_data.js → specialCharacter: {slot,name} vía 023C
export var SPECIAL_MODELS = {
    ENABLED: true,
    RANGE_START: 15000,   // IDs libres (no colisionan con vanilla)
    RANGE_END: 15024,     // 25 slots
    FILES: ["fam5"]       // solo seller (dff custom); Emmet va por 023C, no por aquí
};
```

**Nunca** hardcodear teclas/distancias en modulos — siempre importar de Config.
**Nunca** hardcodear textos al jugador en `showTextBox` — siempre `t("KEY")` (ver [gsis_L10N.md](./gsis_L10N.md)).

### 3.3 EventBus — Comunicacion entre Modulos

Desacopla modulos: nadie importa directamente de otro modulo hermano.

```javascript
// core/gsis_EventBus.js
var _handlers = {};

export function on(evt, fn) {
    (_handlers[evt] = _handlers[evt] || []).push(fn);
}

export function emit(evt, data) {
    var fns = _handlers[evt];
    if (fns) for (var i = 0; i < fns.length; i++) fns[i](data);
}

// Consulta sincrona (emit corre en el mismo tick)
export function query(evt, data) {
    var result;
    emit(evt, { data: data, respond: function (v) { result = v; } });
    return result;
}
```

**Notificacion (emit/on):** fire-and-forget.
**Consulta (query):** el handler responde con `e.respond(valor)` y `query` lo devuelve (para handles, flags, etc).

### TODO CAMINO QUE TERMINA EN `return` RESPONDE

Es la regla que mas caro salio, y no es una convencion: es la unica forma de que
`query` sea interpretable.

`query` devuelve **lo que el ultimo `respond()` dejo**. Si un handler no llama a
`respond`, el llamador recibe `undefined`, y `undefined` es indistinguible de
"no habia nada que hacer". Con eso el llamador no puede saber si el otro modulo
funciono o si fallo a mitad de camino, y elige mal.

```javascript
// MAL. La rama del `return` no responde, y el llamador lee undefined.
on(ALGO, function (e) {
    if (!hayDondeVolver) { log("..."); return; }      // <-- sin respond
    hacerLaOperacion();
    e.respond({ ok: true });
});

// BIEN. Cada `return` responde.
on(ALGO, function (e) {
    if (!hayDondeVolver) { log("..."); e.respond(null); return; }
    hacerLaOperacion();
    e.respond({ ok: true });
});
```

`e.respond(null)` es "no habia" y `e.respond({...})` es "hay". Los dos son
respuestas. Lo que no es una respuesta es no responder.

**MEDIDO 30/09, y fue el bug de la duplicacion de cargadores.** Una rama
condicional de `items:swapMagazine` hacia `return` sin `respond`. El llamador
(`weapons/logic.js`) hacia `if (resp)`, leia `undefined` como "el inventario no
cambio", y caia en el camino de DESMONTA, que hacia `addItem()` sobre una pieza
que **ya estaba escrita en el cinturon**. Una copia de cargador nueva por
pulsacion de R. El cinturon no pierde nada visible, el arma parece igual, y lo
unico que cambia es que el inventario crece.

Lo que lo hace peligroso es que el sintoma **no esta donde esta la causa**: la
rama equivocada estaba en inventario, el efecto se veia en el inventario, y el
`respond` que faltaba era en el modulo que se ocupaba de otra cosa. Sin leer el
codigo no sale.

**Como se evita:**

- Un handler con mas de un `return` se revisa rama por rama. `return` pelado en
  un handler de `query` es un bug, y no uno menor.
- Cuando el `return` esta en un `if` de una linea, el `e.respond` va **dentro de
  las llaves**. Escribirlo despues, "por las dudas", no cuenta.
- Solo hace falta responder si el evento se **consulta**. Un evento que solo se
  emite con `emit()` no necesita `respond` porque nadie lee el resultado. El
  arbol de eventos de arriba dice cual es cual.
- Los tres checks del repo corren `validateWeapons()` y los flujos completos con
  `fake-engine.mjs`, asi que un `respond` faltante aparece como una pieza que no
  cuadra en el balance, no como un fallo de sintaxis.

**Eventos en uso:**

| Evento | Payload | Emisor | Escucha |
|---|---|---|---|
| `save:dirty` | `{}` | Spawner, EngineLock | Vehicles (throttle save) |
| `vehicle:destroyed` | `{ id }` | Spawner | Trunk (limpia baul) |
| `trunk:restore` | `{ vehicleId, car }` | Spawner | Trunk |
| `vehicle:blip:add` | `{ entry, x, y, z }` | Spawner | EngineLock |
| `vehicle:blip:remove` | `{ entry }` | Spawner | EngineLock |
| `vehicle:syncForSave` | `{}` | Vehicles (F5) | Trunk |
| `dealer:orderReady` | `{}` | WeaponDealer (checkout) | nadie (el retiro lee el pedido en su update; el evento queda como aviso) |
| `spawner:find` | query → entry | query desde Trunk/EngineLock | Spawner |
| `spawner:closest` | query → entry | query desde Trunk/EngineLock | Spawner |
| `spawner:isSpawning` | query → bool | query desde Trunk | Spawner |
| `actors:handle` | query → handle | query desde cualquier modulo | Actors |
| `actors:handles` | query → handle[] | query por role | Actors |
| `actors:spawn` | `{ templateId, instanceKey?, x?, y?, z?, heading? }` | cualquier modulo (descartables) | Actors |
| `actors:despawn` | `{ id\|instanceKey\|role }` | cualquier modulo | Actors |
| `actors:task` | `{ id\|instanceKey\|role, task, args? }` | cualquier modulo | Actors |
| `actors:spawned` | `{ key, id, role, instanceKey?, handle }` | Actors | (notif) |
| `actor:died` | `{ key, id, role }` | Actors | (notif) |
| `anims:play` | `{ id\|instanceKey\|role, anim, blend?, loop?, time? }` | cualquier módulo → ActorAnims |
| `anims:stop` | `{ id\|instanceKey\|role }` | cualquier módulo → ActorAnims |
| `dialogue:play` | `{ key\|text\|lines, ms?, params?, replace? }` | cualquier módulo | Dialogue |
| `dialogue:stop` | `{}` | cualquier módulo | Dialogue |
| `dialogue:isPlaying` | query → bool | query desde cualquier módulo | Dialogue |
| `characters:info` | query → def\|null | query `{ id\|actorId\|characterId }` | Characters |
| `characters:name` | query → `{ key, name, color }`\|null | query idem | Characters |
| `characters:say` | `{ characterId\|actorId, key?\|text?\|lines?\|topic?, params?, ms?, replace? }` | UI/módulos → Dialogue | Characters |
| `items:swapMagazine` | query `{ magIds[], ammo, mounted?, mountedMagId }` → `{ ammo, magId }` \| `null` | query desde weapons/logic (`tryReload`, caso 1; fuente = cinturon `belt[]`) | inventory (`inventory/events.js`) |
| `items:extractMagazine` | query `{ magId, ammo }` → `{ ammo }` \| `null` | query desde weapons/logic (`tryReload`, caso 2) | inventory |
| `items:takeWeapon` | query `{ id }` → `{ hasMag, ammo, salud, attachments }` \| `null` | query desde weapons/logic (`equipWeapon`) | inventory |
| `items:storeWeapon` | query `{ id, hasMag, ammo, salud, attachments?, force? }` → `{ ok }` \| `null` | query desde weapons/logic (`unequipWeapon`, adopcion) | inventory |
| `items:takeAttachment` | query `{ id }` → `{ item }` \| `null` | query desde weapons/logic (`_aplicar`, montar) | inventory |
| `items:storeAttachment` | query `{ item, force? }` → `{ ok }` \| `null` | query desde weapons/logic (deshacer el montaje) | inventory |
| `weapons:capacityOfItem` | query `{ itemId }` → number (0 si no tiene) | query desde inventory/state (`capacityOfItem`) | weapons (`data/gsis_weapons.js`) |
| `inventory:changed` | `{ motivo, id }` | inventory (tras cada mutacion) | nadie todavia (declarado para el que lo necesite) |
| `weapon:changed` | ver `weapons/events.js` | weapons | (notif) |
| `weapon:variant` | ver `weapons/events.js` | weapons | (notif) |

Los **nombres** de los siete eventos de la primera tanda no son strings sueltos:
están declarados en `core/gsis_EventNames.js` y los dos modulos los importan de
ahi. `inventory/events.js` los reexporta para que `weapons/` los importe del lado
que los **atiende**, y `weapons/events.js` declara los que **emite** (que no son
contratos, y por eso no van en la tabla compartida). Contrato completo:
[gsis_CONTRATOS.md](./gsis_CONTRATOS.md).

Tres detalles de los payloads que no se deducen del nombre:

- `items:swapMagazine` recibe una **lista** de `magIds` (un arma acepta varias
  capacidades) y `mountedMagId`, que es el cargador que estaba puesto. Sin ese
  segundo campo el cargador de la vuelta se reconstruye con el id del que entra y
  el jugador pierde una pieza.
- `items:takeWeapon` / `items:storeWeapon` viajan **`attachments` en el namespace
  de INVENTARIO** (`mag_colt45_extended`, no el canonico `mag_colt45_15`). La
  conversion la hace `weapons/` con `inventoryAttachmentId()`.
- `items:takeAttachment` devuelve la **fila entera**, no un id, para que
  `storeAttachment` la pueda devolver igual. Un `{ id, ammo }` obligaria a
  reconstruirla y un cargador volveria vacio.

**Eventos estandar (pendientes de uso):**

| Evento | Payload | Emisor |
|---|---|---|
| `vehicle:registered` | `{ id, model }` | Spawner |
| `trunk:opened` | `{ vehicleId }` | Trunk |
| `trunk:closed` | `{ vehicleId }` | Trunk |
| `item:added` | `{ id, qty }` | inventory |
| `item:removed` | `{ id, qty }` | inventory |
| `game:saved` | `{ slot }` | SaveManager |

> Nota sobre el nombre: el modulo se llama `Items` en el registro y la clave del
> save es `ItemManager`, pero la carpeta es `inventory/`. Lo que quedo al lado es
> `items:*`, y `items:takeWeapon` no describe lo que hace —saca del inventario—,
> sino de donde viene. Renombrar el prefijo es tocar los dos modulos y el
> verificador de la seccion 7 del check de flujo.

### 3.4 ModuleRegistry — Init/Update Automatico

Index no crece al agregar modulos.

```javascript
// core/gsis_ModuleRegistry.js
var _mods = [];

export function register(mod) {
    _mods.push(mod);   // { name, init, update }
}

export function initAll() {
    for (var i = 0; i < _mods.length; i++) {
        if (_mods[i].init) _mods[i].init();
    }
}

export function updateAll(now) {
    for (var i = 0; i < _mods.length; i++) {
        if (_mods[i].update) _mods[i].update(now);
    }
}
```

### 3.5 Engine — El unico camino a la memoria del motor

`core/gsis_Engine.js` es el unico archivo del mod que escribe en la memoria de
`CWeapon` / `CWeaponInfo`. Nadie mas calcula offsets a mano, ni llama al native
que lee la capacidad, ni escribe `m_nAmmoInClip`.

La consecuencia que se nota desde afuera es que **la capacidad de un arma es del
motor, no del mod**: `clipCapacityOf(weaponType)` lee `CWeaponInfo` a traves del
native, y `weapons/` recorta contra ese numero. Por eso el `.asi` puede cambiar
una capacidad sin que ningun dato del mod se entere, y por eso tambien un test
puede correr el flujo entero de armas con un motor falso
(`tools/fake-engine.mjs`).

| Grupo | Que resuelve |
|---|---|
| Direcciones | `W_CLIP`, `W_AMMO`, `W_STATE`, `slotAddress`, `addressOfType` |
| Lectura del arma en mano | `readCurrentWeapon()` → `{ char, slot, type, ... }` |
| Armar / sacar | `giveWeapon`, `removeWeapon`, `hasWeapon`, `setCurrentWeapon`, `giveUsesNative` |
| Municion | `getAmmo`, `setAmmo`, `slotClip`, `slotTotal` |
| Capacidad y modelo | `clipCapacityOf`, `writeModelId`, `requestModel`, `loadModelsNow`, `loadSpecialModel` |

### 3.6 Notice y SaveMigration

Dos archivos de core que existen por una sola razon y por eso son cortos:

- **`gsis_Notice.js`** — un aviso de una sola accion para la pagina
  (`setNotice` / `hasNotice` / `takeNotice` / `clearNotice`). Lo consulta `ui/`
  **despues** del throttle, y lo manda aunque los datos no hayan cambiado: es
  exactamente el caso de "no cabe", donde no se movio nada y sin el aviso el
  jugador no leeria nunca por que. De un solo uso, y la comparacion de "cambio"
  del snapshot se hace sin el a proposito.
- **`gsis_SaveMigration.js`** — `SAVE_FORMAT_VERSION = 2`, la lista de itemIds que
  se renombraron, y `registerSaveMigrator(version, nombre, fn)`. El punto de por que
  un migrador se registra **al importarse el archivo** y no en el `init()` del
  modulo esta en el header de `modules/weapons/migrate.js`: `initSaveManager()`
  corre `loadGame()` antes que `initAll()`, y registrado en el `init()` llegaria
  tarde.

---

## 4. Flujo de Control

```javascript
// [fs][mem]gsis_index.js
import { initL10n, t } from "./IronSyndicate/core/gsis_L10n.js";
import { initSaveManager } from "./IronSyndicate/core/gsis_SaveManager.js";
import { initAll, updateAll } from "./IronSyndicate/core/gsis_ModuleRegistry.js";
import { _invalidateCache } from "./IronSyndicate/core/gsis_SaveManager.js";

// Imports de modulos (efecto secundario: se auto-registran)
// Orden de import = orden de update por frame
import "./IronSyndicate/modules/gsis_Spawner.js";
import "./IronSyndicate/modules/gsis_EngineLock.js";
import "./IronSyndicate/modules/gsis_Trunk.js";
import "./IronSyndicate/modules/gsis_Vehicles.js";
import "./IronSyndicate/modules/gsis_Documents.js";
import "./IronSyndicate/modules/gsis_Bag.js";
import "./IronSyndicate/modules/inventory/index.js";
import "./IronSyndicate/modules/gsis_PropertyModule.js";
import "./IronSyndicate/modules/gsis_Actors.js";
import "./IronSyndicate/modules/gsis_ActorAnims.js";
import "./IronSyndicate/modules/gsis_Dialogue.js";
import "./IronSyndicate/modules/gsis_Characters.js";
import "./IronSyndicate/modules/gsis_WeaponDealer.js";
import "./IronSyndicate/modules/gsis_DealerPickup.js";
import "./IronSyndicate/modules/gsis_WeaponSeller.js";
import "./IronSyndicate/modules/ui/index.js";
import "./IronSyndicate/modules/weapons/index.js";
import "./IronSyndicate/modules/gsis_FireButton.js";

initL10n();          // FxtStore + STRINGS ANTES de modulos
initSaveManager();   // corre loadGame(): por eso los migradores ya estan registrados
initAll();           // Llama init() de todos (registra handlers EventBus antes del loop)

while (true) {
    wait(0);                    // Yield obligatorio
    _invalidateCache();         // Limpiar cache del frame anterior
    updateAll(Date.now());      // Logica de todos los modulos
    // auto-save por frames + save al entrar a un interior
}
```

| Paso | Funcion | Descripcion |
|---|---|---|
| 1 | `wait(0)` | Cede control al VM |
| 2 | `_invalidateCache()` | Cache fresco para el frame |
| 3 | `updateAll(now)` | Logica + UI (menos via `register({update: render*})`) |
| 4 | `saveGame(getActiveSlot())` | Al cruzar a un interior, y cada `TIMERS.AUTO_SAVE_FRAMES` |

**Regla de Oro**: NUNCA poner logica pesada sin `wait(0)`.
**Orden**: Spawner → EngineLock → Trunk → Vehicles → Documents → Bag →
**inventory** → PropertyModule → Actors → ActorAnims → Dialogue → Characters →
WeaponDealer → DealerPickup → WeaponSeller → **ui/** (lee los flags de menu de
este frame y puede ABRIR los de esfera, asi que va despues de los modulos que los
calculan) → **weapons** → FireButton.

Dos reglas del orden que no son esteticas:

- **ui/ antes que weapons/**: el bridge manda `equipWeapon` / `unequipWeapon` a
  weapons por el canal de retorno, y si weapons corriera primero, el clic del
  frame se ejecutaria contra un registro que recien se reconcilia despues.
- **FireButton al final**: ve el total de municion nuevo en el mismo frame en que
  weapons lo cambio, y por eso reactiva el boton de disparo en la misma pulsacion
  en vez de al frame siguiente.

### El orden de los imports no es el de las carpetas

Los imports del entry se evaluan **antes** de `initSaveManager()`, y eso es lo que
hace que dos cosas se puedan registrar al importarse y no en el `init()`:

| Que se registra al importarse | Por que tiene que ser antes de `loadGame()` |
|---|---|
| `inventory/index.js` → `events.js` (los handlers `items:*`) | si un modulo de armas pregunta la capacidad durante la carga de un save, el handler tiene que existir ya |
| `weapons/index.js` → `migrate.js` (migracion v1→v2) | registrado en el `init()` llegaria tarde, y la primera carga de un save viejo pasaria sin migrar |

---

## 5. Convenciones de Nombrado

| Elemento | Convencion | Ejemplo |
|---|---|---|
| Modulo logico de una linea | `modules/gsis_Nombre.js` | `modules/gsis_Vehicles.js` |
| Modulo partido | `modules/nombre/index.js` + un archivo por responsabilidad | `modules/weapons/index.js` |
| Paquete de UI web | `modules/ui/` (bridge / commands / views) | `modules/ui/bridge.js` |
| Core infra | `core/gsis_Nombre.js` | `core/gsis_Config.js` |
| Datos estaticos | `data/gsis_Nombre_data.js` | `data/gsis_item_data.js` |
| Tabla de armas | `data/gsis_weapons.js` (sin `_data`: no son stats sueltas) | `data/gsis_weapons.js` |
| Init | `initNombre()` | `initUI()` |
| Update (logica) | `updateNombre()` | `updateTrunk(now)` |
| Snapshot (UI→pagina) | `snapNombre()` | `snapInventory()` / `snapFlow()` |
| Evento | `sujeto:accion` | `trunk:opened` |
| Nombre de evento compartido | constante en `core/gsis_EventNames.js` | `ITEMS_TAKE_WEAPON` |
| Handler evento | `_onNombreEvento` | `_onVehicleDestroyed` |
| Visibilidad | `_visible` / `_uiState.menuVisible` | `_visible = false` |
| Evento CLEO→pagina | `uistate` / `inv` / `catalog` / `screen` | `send("uistate", st)` |
| ID item | snake_case | `scrap_metal` |
| Prefijo de un archivo de un paquete | ninguno | `weapons/logic.js`, no `weapons/gsis_Logic.js` |

Los archivos de un paquete **no** llevan el prefijo `gsis_`: la carpeta ya dice de
que modulo es, y `gsis_weapons/logic.js` seria el mismo nombre dos veces. El
prefijo se mantiene en `core/` y `data/`, que son carpetas compartidas, y en los
modulos sueltos de `modules/`, que conviven con los paquetes.

---

## 6. Reglas de Comunicacion

1. **Modulos NO importan entre si** — usar EventBus (`emit`/`on`/`query`).
   La excepcion acotada: los archivos de un mismo paquete (`inventory/`,
   `weapons/`, `ui/`) si se importan entre si, y entre paquetes hay imports de
   una sola direccion (el dueno de un menu exporta su `openXMenu`, el bridge lo
   llama). La frontera dura, la que se verifica, es `inventory/` ↔ `weapons/`:
   ver §1.
2. **Modulos NO importan de ui/** — la UI no depende de los modulos, nunca al reves
3. **ui/ importa de modules/ y core/** — para leer estado, llamar funciones de accion y leer config
4. **Un modulo = una responsabilidad**. Cuando son dos, son dos archivos: la
   frontera va en el nombre, no en un `// ESTO ES OTRA COSA` a mitad de archivo
5. **SaveManager es la unica fuente de verdad** para estado persistente
6. **Config es la unica fuente** para teclas/distancias/timers
7. **Init ordenado**: SaveManager → modulos (via registry) → menus
8. **Tick ligero**: < 1ms por funcion update
9. **`modules/ui/` es lo unico que habla con la pagina** en los dos sentidos: manda
   estado con `SAWeb.ui.send` (latcheado, solo cuando el valor difiere) y recibe
   acciones con `SAWeb.takeCommand()`. El browser no se cierra nunca, se oculta por
   clase. Ver [gsis_WEBUI.md §3](./gsis_WEBUI.md)
10. **Throttle saves**: `_markDirty()` emite `save:dirty`; `saveGame()` solo en F5/auto-save
11. **La fila de la tabla web es una sola** (`modules/ui/views/itemRow.js`). Las
    cinco pantallas la importan; nadie la copia
12. **La forma del payload es un archivo** (`ui/views/inventory.js` para el
    inventario, `ui/views/flow.js` para los 4 menus). Un campo nuevo se agrega en
    un lugar, no en uno por pantalla
13. **`FLUJOS` en `ui/views/flow.js` es la unica lista de menus de esfera**.
    El bridge no mantiene su copia: si aparece un menu nuevo, se agrega ahi (con sus
    tres puertas: `visible`, `open`, `close`) y en `PANTALLAS` (pagina), y el prefijo
    del comando se deriva del id. `openFlow()` es el que elige a quien abrir con la
    `ESPACIO`, y `currentFlow()` el que dice cual esta abierto.
    `check-ui-flow.mjs` verifica que el `weapons` ↔ `inventory` no se importen; el
    contrato de las pantallas lo verifica `check_pantallas.mjs` (ver
    [gsis_TESTING.md](./gsis_TESTING.md))
14. **Todos los menus son de pausa, y el estado del juego es el mismo para los
    cinco**: `setMenuGameState(anyVisible)` congela y `setMenuCursor(anyVisible)`
    enciende el cursor. No hay dos clases de menu. Antes las habia —el inventario
    de pausa y los de proximidad, que se cerraban alejandose y congelaban solo hasta
    que el jugador apretase `WASD`— y por eso el bridge tenia que preguntar de que
    clase era el menu abierto con `currentFlow()` + `updateProximityMove()`. Ese
    camino quedo **dormido** (ver [gsis_INPUT.md §6](./gsis_INPUT.md)): ningun menu
    se cierra alejandose, y volver a encenderlo es cambiar los argumentos que le
    pasa el bridge, no reescribirlo
15. **El dueno de las teclas de menu es del bridge**: `togglePanel()` con la `I` y
    `toggleFlow()` con la `ESPACIO`. Cada modulo tiene su `openXMenu()` para que lo
    llamen, pero ninguno lee la tecla. Con `ESPACIO` abriendo y cerrando, cuatro
    modulos leyendo la suya harian que la misma pulsacion abriera un menu y cerrara
    otro en el mismo frame
16. **La esfera es la condicion, y por eso tiene cooldown**: apagarla es lo que
    impide que un menu se reabra en el frame siguiente a cerrarse —el menu congela,
    asi que el jugador sigue parado adentro—. La pide el modulo dueño, con la
    transicion contra lo que publico en su update anterior (`_sawOpen`), no contra
    el flag: el cierre por tecla lo hace el bridge, que corre despues. Ver
    [gsis_SPOTS.md §4](./gsis_SPOTS.md)
17. **La superficie reexportada de un `index.js` no es un compat**: cada nombre
    exportado tiene un consumidor, y si uno se queda sin él, la línea se borra del
    `index.js` **y** del archivo que lo define, en el mismo commit. La lista se
    verifica con grep, y por eso la regla sirve: un `export` sin uso es la forma
    barata de que un archivo quede creyendo que tiene una API que no tiene
18. **Un nombre de evento que cruza dos modulos vive en
    `core/gsis_EventNames.js`**, no en el archivo de la parte que lo emite. Un
    string mal escrito en un bus no tira: el handler nunca corre y el que espera
    la respuesta se queda colgado. Ver el header de ese archivo y
    [gsis_CONTRATOS.md](./gsis_CONTRATOS.md)

Checklist pre-commit, politica de deuda y guia de refactor: [gsis_MAINTENANCE.md](./gsis_MAINTENANCE.md).

---

## 7. Como Agregar un Modulo Nuevo

Ver guia completa: [gsis_MAINTENANCE.md §3](./gsis_MAINTENANCE.md#3-como-agregar-un-modulo-nuevo).

Resumen (ejemplo: sistema de Gasolina):

| Paso | Accion | Archivo |
|---|---|---|
| 1 | Crear `modules/gsis_Fuel.js` con `register({name, init, update})` | nuevo |
| 2 | Auto-registrarse al importarse | — |
| 3 | Si tiene datos estaticos → `data/gsis_fuel_data.js` | nuevo |
| 4 | Si la UI web lo muestra → agregar su `snap*()` en `ui/views/inventory.js` (inventario) o `ui/views/flow.js` (menu de esfera), y su entrada en `PANTALLAS` (`app.js`) | existente |
| 5 | Persistencia → `registerModule("Fuel", {...})` en init | — |
| 6 | Comunicar con otros → `emit("fuel:empty", {vehicleId})`; si el nombre lo usan dos modulos, declararlo en `core/gsis_EventNames.js` | nuevo o existente |
| 7 | Si necesita datos de inventory o weapons → `query()` al bus, **nunca** importar del paquete | — |
| 8 | Agregar **solo** el `import` side-effect en index (orden correcto) | index.js |
| 9 | Actualizar arbol en §1 de este doc + `gsis_README.md` | docs |

Y cuando el modulo nuevo **no** cabe en un archivo, el paso 1 no es "un archivo
mas grande": es una carpeta con un `index.js` que hace de puerta, y un archivo por
responsabilidad adentro. Ver §2 y el ejemplo de `modules/weapons/`.

---

## 8. Optimizaciones de Performance

| Tecnica | Implementada en | Impacto |
|---|---|---|
| Cache por frame | SaveManager | ~40 clones/frame → ~5 |
| Batch de posiciones | Spawner (500ms) | 1 get + 1 set para N vehiculos |
| Save throttle | Vehicles (`save:dirty`) | Max 1 save/2s en toggles |
| Sphere por distancia | Trunk | Recrea solo si auto se movio >0.5m |
| Contador en vez de Object.keys | Trunk (`_openTrunkCount`) | Cero allocations |
| Handle via query | Spawner (`spawner:find`) | Sin import entre modulos |
| Engine sync throttle | EngineLock (250ms) | En vez de cada frame |
| Latch por firma | `ui/index.js` (`uistate`) | 1 evento en vez de 60/seg |
| Un canal por lo que se ve | `ui/index.js` (`inv` vs `screen`) | Con un flujo abierto no se manda el inventario: 0-14 trozos |
| "Solo si cambió" por canal | `ui/index.js` (`_lastJson`, `_lastScreenData`) | Un snapshot quieto no genera trafico |
| Reset de caches al cambiar de flujo | `ui/index.js` (`_flowVisible`) | Un menu recien abierto no espera 400ms para verse |
| La fila compartida | `ui/views/itemRow.js` | 5 pantallas, una sola implementación de las reglas de fila |
| Spawn queue max/frame | Actors (`ACTORS.SPAWN_*`) | 3 creates + 8 slots/frame, no N de golpe |
| Check death staggered | Actors (`ACTORS.CHECK_SLICE`/`CHECK_MS`) | 20 ready / 450ms, sin pico con Spawner |
| Dormancy por radio | Actors (`ENTER`/`EXIT`) | Permanents lejanos: sin handle/modelo; target ~200 |
| Modelos con refcount | Actors (`_retainModel`/`_releaseModel`) | REQUEST/MARK solo al 0 usuarios |
| Carga de modelos por frame | `weapons/models.js` (`stepCustomModels`) | No se come el timeout de 2 s de CLEO+ en el init |

---

## 9. Roadmap de Migracion

| # | Tarea | Estado |
|---|---|---|
| 1 | Crear `core/gsis_Config.js` | ✅ Hecho |
| 2 | Crear `core/gsis_EventBus.js` (pub/sub + query) | ✅ Hecho (en uso: clúster vehículos) |
| 3 | Crear `core/gsis_ModuleRegistry.js` (init/update auto) | ✅ Hecho |
| 4 | Renombrar `GSIS_ItemsModule` → `modules/gsis_Items.js` + extraer `data/gsis_item_data.js` | ✅ Hecho (el archivo **ya no existe**, ver 21) |
| 5 | Dividir `gsis_VehicleModule.js` en Vehicles/Engine/Locks/Trunk/Spawner | ✅ Hecho |
| 6 | Mover InventoryModule → `modules/gsis_Documents.js` + `gsis_Bag.js` | ✅ Hecho |
| 7 | Mover menus a `ui/` | ✅ Hecho (despues reemplazado por la UI web, ver 16) |
| 8 | Reescribir index solo con registry | ✅ Hecho |
| 9 | Probar todo (registro, motor, lock, bául, items, guardado) | ✅ Hecho |
| 10 | Desacople EventBus (`query`, sin imports entre módulos) | ✅ Hecho |
| 11 | Limpieza de deuda técnica (imports/exports muertos, Config) | ✅ Hecho |
| 12 | Sistema de actores (permanent + descartables, EventBus) | ✅ Hecho |
| 13 | Spots / esferas (`gsis_SpotRuntime.js`, N por tipo) + cooldown de 6 s al cerrar | ✅ Hecho |
| 14 | Localización es/en (`gsis_L10n.js` + `gsis_lang_data.js` + FXT) | ✅ Hecho |
| 15 | Subtítulos / diálogo 00BB (`gsis_Dialogue.js`, cola EventBus) | ✅ Hecho |
| 16 | UI web CEF/SAWeb (`modules/ui/` + `modloader\IronSyndicate\UI\`) | ✅ Hecho - commit `13588b1` |
| 17 | Canal de retorno UI -> CLEO (SAWeb v2: `SAWeb_PollCommand` + prefijo `cmd:`) | ✅ Hecho - equipar / cinturon / tirar |
| 18 | `core/gsis_Engine.js`: toda la memoria de `CWeapon`/`CWeaponInfo` en un archivo | ✅ Hecho |
| 19 | `core/gsis_SaveMigration.js` + versionado del save (`SAVE_FORMAT_VERSION = 2`) | ✅ Hecho |
| 20 | Partir `gsis_Items.js` y `gsis_Ballistic.js` en `modules/inventory/` y `modules/weapons/`, con `core/gsis_EventNames.js` como tabla de contratos | ✅ Hecho |
| 21 | Partir la UI en `modules/ui/` (bridge / commands / views) y `gsis_ItemRow.js` → `ui/views/itemRow.js` | ✅ Hecho |
| 22 | Tabla de armas unificada en `data/gsis_weapons.js` (`FAMILIAS` + `CARGADORES` + `SILENCIADORES`), con **una** familia por item y las variantes como datos | ✅ Hecho. El diseño pasó por "un item por configuración" y volvió a familias el 03/10/2026: cambiaron los nombres de tabla (`ARMAS` → `FAMILIAS`) y el tipo pasó de declarado a derivado por `tipoDe()` |
| 23 | L10n en la pagina web + pestanas Propiedades/Vehiculos + overlays de baul/dealer | ⏳ Pendiente - ver [gsis_WEBUI.md](./gsis_WEBUI.md) |
| 24 | Rellenar el cargador ya montado con municion suelta (el "caso 3" de `tryReload`, hoy no implementable) | ⏳ Pendiente - decision de diseno abierta, ver [gsis_WEAPONS_VERIFICADO.md §4](./gsis_WEAPONS_VERIFICADO.md) |
| 25 | Apagar `TIMERS.RELOAD_GRACE`, que no lo lee nadie | ⏳ Pendiente - deuda de una linea |

Guía completa del sistema: [gsis_ACTORS.md](./gsis_ACTORS.md).

Esferas de interacción F (spots): [gsis_SPOTS.md](./gsis_SPOTS.md).

Localización + subtítulos: [gsis_L10N.md](./gsis_L10N.md).

Personajes (nombre + diálogos + actor): [gsis_CHARACTERS.md](./gsis_CHARACTERS.md).

Animaciones de actores (IFP vanilla, `idleAnim`, `anims:*`): [gsis_ACTORANIMS.md](./gsis_ACTORANIMS.md).
UI web (CEF/SAWeb): [gsis_WEBUI.md](./gsis_WEBUI.md). Runtime: [SAWEB_API.md](C:\Dev\SAWebUI\docs\SAWEB_API.md).
Ver [gsis_ROADMAP.md](./gsis_ROADMAP.md) para milestones de gameplay.
Ver [gsis_MAINTENANCE.md](./gsis_MAINTENANCE.md) para mantener la arquitectura limpia.
