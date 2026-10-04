# GSIS — Sistema de Actores

Spawn y lifecycle de peds (dealer, seller, escoltas…). Los actores son **solo visuales**: no abren menús ni tienen esferas — eso es [gsis_SPOTS.md](./gsis_SPOTS.md) (cosas distintas, sin acoplar).

Ver: [Arquitectura](./gsis_ARCHITECTURE.md) · [Mantenimiento](./gsis_MAINTENANCE.md) · [Testing](./gsis_TESTING.md) · [Spots](./gsis_SPOTS.md) · [Personajes](./gsis_CHARACTERS.md) · [Anims](./gsis_ACTORANIMS.md) · [L10n](./gsis_L10N.md)

---

## 1. Archivos

| Archivo | Rol |
|---|---|
| `data/gsis_actor_data.js` | Catálogo: modelos, tareas, lifetime, `spawn`, `idleAnim?` |
| `modules/gsis_Actors.js` | Runtime: dormancy, cola de spawn, checks, EventBus |
| `core/gsis_Config.js` → `ACTORS` | Budgets, radios ENTER/EXIT, `CHECK_MS` |
| `core/gsis_Config.js` → `SPECIAL_MODELS` | Modelos especiales (rango IDs, archivos) |
| `[fs][mem]gsis_index.js` | Import side-effect (Actors, luego ActorAnims, antes de dealer/seller) |

---

## 2. Configurar un actor

En `gsis_actor_data.js`:

```javascript
export var ACTORS = [
    {
        id: "weapon_dealer",          // único (permanent) o prefijo (disposable)
        role: "dealer",               // agrupación para queries/tareas
        model: 290,                   // special slot 1 → 289 + 1 (Emmet)
        specialCharacter: { slot: 1, name: "EMMET" },  // 023C del juego
        pedType: 4,                   // 4 = civmale
        spawn: { x: 2512.3333, y: -1681.3495, z: 13.4744, heading: 48.8572 },
        onSpawn: ACTOR_TASKS.QUIET,   // ["clear", "stayInPlace"]
        idleAnim: "dealer_idle",
        lifetime: "permanent",        // permanent | disposable
        autoDespawnOnDeath: false
    },
    {
        id: "weapon_seller",
        role: "seller",
        model: ACTOR_MODELS.WEAPON_SELLER,  // fallback si no es especial
        pedType: 4,
        isSpecialModel: true,         // usa LOAD_SPECIAL_CHARACTER_FOR_ID (dff custom)
        modelFile: "fam5",            // nombre sin extensión (en ModLoader)
        spawn: { x: 2518.8044, y: -1678.0944, z: 14.5308, heading: 79.9008 },
        onSpawn: ACTOR_TASKS.QUIET,
        idleAnim: "seller_idle",
        lifetime: "permanent",
        autoDespawnOnDeath: false
    }
];
```

### Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Permanent: clave única en registry. Disposable: prefijo (`id#seq`) |
| `role` | string | Selector EventBus: `query("actors:handle", { role: "dealer" })` |
| `model` | number | ID de modelo — fallback si no es especial; special char → `289+slot` (023C); `isSpecialModel` → ID dinámico (15000+) |
| `pedType` | number | `4` = ped civil masculino (default si se omite) |
| `specialCharacter` | object | `{ slot, name }`: **023C `LOAD_SPECIAL_CHARACTER`** del juego (Emmet, etc.). **No** usar 0E9A para esto |
| `isSpecialModel` | bool | `true`: carga vía CLEO+ `LOAD_SPECIAL_CHARACTER_FOR_ID` (**solo dffs nuevos** en ModLoader) |
| `modelFile` | string | Nombre del archivo `.dff/.txd` sin extensión (debe estar en `SPECIAL_MODELS.FILES`) |
| `spawn` | object | **Absoluto**: `{ x, y, z, heading }` — sin relación con esferas |
| `onSpawn` | string[] | Preset de tareas al nacer (ver §4) |
| `idleAnim` | string | Opcional: id en `gsis_actor_anim_data.js` — al spawn, ActorAnims la reproduce · [gsis_ACTORANIMS.md](./gsis_ACTORANIMS.md) |
| `lifetime` | string | `"permanent"` auto-spawn en init · `"disposable"` solo vía `actors:spawn` |
| `autoDespawnOnDeath` | bool | `true`: si muere, se limpia la entry (sensible con disposable) |

### Modelos especiales (2 formas)

**1. Special chars del juego (023C)** — peds que ya vienen con nombre (`EMMET`, `TENPEN`…):

```javascript
{
    model: 290,                                    // 289 + slot
    specialCharacter: { slot: 1, name: "EMMET" }    // LOAD_SPECIAL_CHARACTER
}
```

- Init: `LOAD_SPECIAL_CHARACTER(slot, name)` → model = `289 + slot` (rango **290-299**)
- Spawn: espera `HAS_SPECIAL_CHARACTER_LOADED(slot)` antes de `CREATE_CHAR`
- **No** es 0E9A; **no** usar `model: 6` (free ID / no REQUEST_MODEL-viable)

**2. DFFs custom (CLEO+ 0E9A)** — `.dff/.txd` nuevos en ModLoader **sin reemplazar** IDs — ver [Mini-Guía](#mini-guía-cargar-modelos-sin-reemplazar-nada) abajo.

**Fallback** (si `ENABLED: false` o falla carga): se usa `model` del def (`ACTOR_MODELS`).

---

## Mini-Guía: Cargar modelos SIN reemplazar nada

Carga peds con skins custom (`.dff`/`.txd`) **sin pisar** modelos vanilla del juego. Usa CLEO+ `LOAD_SPECIAL_CHARACTER_FOR_ID` con IDs dinámicos en rango libre (15000+).

### Requisitos

| Requisito | Verificación |
|---|---|
| CLEO+ | `cleo/CLEO+.cleo` existe |
| ModLoader | `modloader.asi` en raíz del juego |
| Archivos | `mimodelo.dff` + `mimodelo.txd` (mismo nombre base) |

### Pasos

**1. Copiar archivos a ModLoader**

```
modloader/
└── IronSyndicate/                ← carpeta del proyecto en modloader/
    ├── models/
    │   ├── fam4.dff
    │   ├── fam4.txd
    │   ├── fam5.dff
    │   └── fam5.txd
    ├── sounds/
    │   └── dryfire.wav           ← click seco del FireButton
    └── KeepNoAmmo.SA.asi         ← keep-no-ammo (heredado de Junior_Djjr)
```

Los .dff/.txd los monta `gta3.std.stream` por nombre de archivo (da igual la
subcarpeta); el wav se abre por camino exacto (`AUDIO.DRYFIRE_PATH`).

> ModLoader escanea subcarpetas automáticamente. Si es carpeta nueva, reiniciar el juego 1× para que la registre.

**2. Registrar en Config**

```javascript
// core/gsis_Config.js
export var SPECIAL_MODELS = {
    ENABLED: true,
    RANGE_START: 15000,        // IDs libres (no colisionan con vanilla)
    RANGE_END: 15024,          // 25 slots disponibles
    FILES: ["fam5"]              // nombres SIN extensión
};
```

**3. Marcar el actor**

```javascript
// data/gsis_actor_data.js
{
    id: "weapon_seller",
    isSpecialModel: true,      // ← activa carga especial
    modelFile: "fam5",         // ← debe estar en SPECIAL_MODELS.FILES
    model: 291,                // fallback vanilla (si falla la carga)
    // ...
}
```

**4. Verificar en log** (`cleo_redux.log`)

```
[Actors] Cargando 1 modelos especiales...
[Actors] Especial cargado: fam5 → ID 15000
[Actors] Especiales listos: {"fam5":15000}
[Actors] Actor weapon_seller → modelo ID 15000
```

### Cómo funciona (flujo interno)

```
initActors()
  ├─ _initSpecialCharacters()                       → 023C (EMMET, etc.)
  │    ├─ LOAD_SPECIAL_CHARACTER 1 "EMMET"          → model 290
  │    └─ _specialCharModels[290] = true            → skip REQUEST_MODEL
  └─ _initSpecialModels()                           → solo dffs custom (0E9A)
       ├─ IS_MODEL_AVAILABLE_BY_NAME "fam5"          → ¿existe?
       ├─ GET_MODEL_DOESNT_EXIST_IN_RANGE 15000 15024 → ID libre
       ├─ LOAD_SPECIAL_CHARACTER_FOR_ID <id> "fam5"   → carga en ID
       ├─ (salta IDs ya usados en este loop)
       ├─ LOAD_ALL_MODELS_NOW                         → fuerza carga
       └─ _assignSpecialModelsToActors()              → sobreescribe model
```

- **No** toca `gta3.img` ni IDE — el ID 15000+ es temporal en memoria
- **No** reemplaza skins vanilla — cada modelo tiene su propio slot
- **Refcount**: modelos especiales se mantienen cargados (skip en `_releaseModel`)

### Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `WARN: Modelo no encontrado` | ModLoader no escaneó carpeta | Reiniciar juego; verificar carpeta dentro de `modloader/` |
| Ambos actores misma skin | Mismo ID asignado | Revisar log — deben decir IDs distintos (15000, 15001) |
| `Sin ID disponible` | Rango agotado | Ampliar `RANGE_END` o liberar IDs con `UNLOAD_SPECIAL_CHARACTER_FROM_ID` |
| Ped invisible / crash | `.txd` incorrecto o dañado | Verificar que `.dff` y `.txd` correspondan al mismo modelo |
| `ERROR LOAD_SPECIAL_CHARACTER_FOR_ID` | CLEO+ no instalado | Copiar `CLEO+.cleo` a `cleo/` |
| `ERROR LOAD_SPECIAL_CHARACTER` | Nombre/slot inválido en `specialCharacter` | Usar nombre vanilla exacto (`EMMET`, `TENPEN`…) y slot 1-10; **no** confundir con 0E9A |

### Limitaciones

- **No streaming**: modelos se cargan 1× en init (no se descargan por distancia)
- **Límite ped**: `LOAD_SPECIAL_CHARACTER_FOR_ID` añade un ped type — con pocos modelos (2-5) no hay problema; para 50+ considerar aumentar límite
- **Rango**: 25 IDs (15000-15024) por defecto — suficiente para peds custom

---

## 3. Lifetime

### Permanent + dormancy (N grande / 200)

Estados:

```
dormant ──dist ≤ ENTER──► pending ──modelo──► ready ──¿muerto?──► dead
   ▲                         │                   │
   └────dist ≥ EXIT──────────┴── (DELETE) ◄──────┘
```

| State | Handle | Modelo | En checks/dist |
|---|---|---|---|
| `dormant` | null | liberado | solo dist (JS) |
| `pending` | null | retenido | cola spawn |
| `ready` | sí | retenido | dist + muerte |
| `dead` | null | liberado | no (solo queries) |

- Al pasar el gate interior: se **registran** en `dormant` (sin crear peds).
- Sweep cada `ACTORS.CHECK_MS`: `distSq` vs `ENTER` (150) / `EXIT` (180) — histeresis.
- Cerca → `CREATE_CHAR`; lejos → `DELETE_CHAR` + libera modelo. **No** emite `actor:died`.
- Reaparecer emite `actors:spawned` de nuevo.
- **No** se despawn vía `actors:despawn` (salvo `instanceKey` propio).
- Muerte: emite `actor:died` solo tras **2** `DOES_CHAR_EXIST` fallidos seguidos; no respawnea solo (Fase 1).
- Más N permanentes = N entradas en `ACTORS` (cada una con `spawn`).

### Disposable

- No auto-spawn, **sin dormancy**. Solo: `emit("actors:spawn", { templateId, ... })`.
- Coords: `x/y/z` del evento, o `spawn` fijo del def si el evento no las trae.
- `autoDespawnOnDeath: true` → al morir se borra la entry (libera modelo).
- Keys con `instanceKey` permiten varias instancias del mismo template.

---

## 4. Tareas

Único switch de natives en `_applyTask`:

| Task | Native | Args |
|---|---|---|
| `clear` | `CLEAR_CHAR_TASKS` (0687) | — |
| `stayInPlace` | `SET_CHAR_STAY_IN_SAME_PLACE` (0350) | `args: { on?: boolean }` (default `true`) |
| `setHeading` | `SET_CHAR_HEADING` | `args: { heading: number }` |
| `delete` | `DELETE_CHAR` | — |

Presets en data:

```javascript
ACTOR_TASKS = {
    QUIET: ["clear", "stayInPlace"],
    CLEAR_ONLY: ["clear"]
};
```

Aplicación:
- **Al spawn**: `onSpawn` del def.
- **A demanda**: `emit("actors:task", { role|id|instanceKey, task, args? })`.
- Solo `{ role }` → aplica a **todos** los de ese role con handle vivo.

---

## 5. EventBus

### Queries (síncronas)

```javascript
import { query } from "../core/gsis_EventBus.js";

var h = query("actors:handle", { role: "dealer" });     // → handle | null
var hs = query("actors:handles", { role: "dealer" });   // → handle[]
// Selector: instanceKey > id > role
// dormant / dead → handle null (entry existe, ped no)
```

### Comandos

```javascript
import { emit } from "../core/gsis_EventBus.js";

// Spawn disposable
emit("actors:spawn", {
    templateId: "escort_grunt",
    instanceKey: "mission_1",   // opcional
    x: 100, y: 200, z: 15,      // o spawn fijo en def
    heading: 90
});

// Despawn (solo disposable o con instanceKey)
emit("actors:despawn", { instanceKey: "mission_1" });
// emit("actors:despawn", { role: "escort" });  // primer ready de role

// Tarea
emit("actors:task", { role: "dealer", task: "clear" });
emit("actors:task", { id: "weapon_seller", task: "setHeading", args: { heading: 45 } });
```

### Notificaciones

| Evento | Payload |
|---|---|
| `actors:spawned` | `{ key, id, role, instanceKey?, handle }` |
| `actor:died` | `{ key, id, role }` |

Tabla completa: [ARCHITECTURE §3.3](./gsis_ARCHITECTURE.md#33-eventbus--comunicacion-entre-modulos).

---

## 6. Runtime (`gsis_Actors.js`)

### Config (`core/gsis_Config.js` → `ACTORS`)

| Clave | Default | Rol |
|---|---|---|
| `SPAWN_PER_FRAME` | 3 | `CREATE_CHAR` exitosos/frame |
| `SPAWN_SCAN_PER_FRAME` | 8 | Slots de cola a intentar/frame (no toda) |
| `CHECK_SLICE` | 20 | Ready polleados por tick |
| `CHECK_MS` | 450 | Intervalo dormancy+muerte (≠ `POS_UPDATE` → sin pico con Spawner) |
| `ENTER` | 150 | Radio activación (dormant → spawn) |
| `EXIT` | 180 | Radio desactivación (> ENTER) |

### Init

1. `_initSpecialCharacters()` — actores con `specialCharacter` (023C del juego, p.ej. EMMET) + `_specialCharModels`.
2. `_initSpecialModels()` — solo si `SPECIAL_MODELS.ENABLED` (dffs custom 0E9A):
   - `IS_MODEL_AVAILABLE_BY_NAME` verifica cada archivo
   - `GET_MODEL_DOESNT_EXIST_IN_RANGE` asigna ID (15000-15024, saltando usados)
   - `LOAD_SPECIAL_CHARACTER_FOR_ID` + `LOAD_ALL_MODELS_NOW`
   - `_assignSpecialModelsToActors()` sobreescribe `model` en defs con `isSpecialModel`
2. Registra handlers EventBus.
3. Si hay permanentes: `_pendingInitSpawn = true` — **no** crea entries aún.
4. Log: `[GSIS] Actors: permanentes pendientes (esperar exterior)` (o `sin permanentes`).
### Update (cada frame)

| Paso | Frecuencia | Qué hace |
|---|---|---|
| Gate interior | mientras pending | `getAreaVisible() !== 0` → espera; `=== 0` → `_registerPermanentsDormant()` (una vez) |
| `_processSpawnQueue` | cada frame | Hasta `SPAWN_PER_FRAME` creates; escanea `SPAWN_SCAN_PER_FRAME` slots |
| `_processTick` | cada `CHECK_MS` (450ms) | 1× coords CJ → dormancy ENTER/EXIT + checks muerte (`CHECK_SLICE`) |

**Por qué el gate**: si la partida carga en interior (`areaId !== 0`), spawnear ahí deja el ped en coords equivocadas al salir. Mismo patrón que Spawner. Disposable vía `actors:spawn` no espera (coords explícitas).

**Por qué dormancy**: con N=200 solo hay handle+modelo para los cercanos (`≤ EXIT`); el resto es data barata en `_entries`. Sin dormancy, 100+ peds en pool + models fijos + polleo de checks.

### Modelos (refcount)

- `_retainModel` → `REQUEST_MODEL` al primer user (activar / spawn). **Modelos especiales**: ya cargados, skip.
- `_releaseModel` → `MARK_MODEL_AS_NO_LONGER_NEEDED` al llegar a 0 (dormir / morir / cleanup). **Modelos especiales**: skip (se mantienen para reuso).
- Varios actors pueden compartir modelo sin pisarse.
- Helper: `_isSpecialModelId(model)` verifica si un ID pertenece a `_specialModelIds`.

### Spawn del ped

1. Espera `HAS_MODEL_LOADED` (sino `false`, reintenta en frames siguientes, solo slots escaneados).
2. `CREATE_CHAR(pedType, model, x, y, z)` → fallback `Char.Create`.
3. `SET_CHAR_HEADING` + `onSpawn` tasks.
4. Entra a `_readyKeys`; emite `actors:spawned`.

### Muerte (confirmada)

- `IS_CHAR_DEAD` → sí; o `DOES_CHAR_EXIST` false **2 ticks seguidos** (`_miss >= 2`).
- Emite `actor:died`; saca de `_readyKeys` y `_permKeys`.
- **Disposable + `autoDespawnOnDeath`**: `_cleanupEntry` (borra entry).
- **Permanent**: suelta handle, entry `state: "dead"` (queries → `null`); no respawnea Fase 1.

### Placement

Prioridad en `_createEntry`:

1. `opts.x/y/z` (evento `actors:spawn`)
2. `def.spawn` absoluto
3. Nada → log error, no crea entry

**No** lee `Config.MISC` coords ni `spot_data` — catálogo independiente de esferas.

---

## 7. Cómo agregar actores

| Caso | Acción |
|---|---|
| 200 dealers permanentes | 200 objetos en `ACTORS`, cada uno con `spawn` y `role` — dormancy filtra por radio |
| 5 dealers permanentes | 5 objetos en `ACTORS`, cada uno con `spawn` distinto y `role: "dealer"` |
| Escolta de misión | Def `lifetime: "disposable"`; spawn con `actors:spawn` + coords (sin dormancy) |
| Cambiar posición de un ped | Editar `spawn` del def (no `Config.MISC`) |
| Modelo vanilla | Def con `model: <ID>` (sin `isSpecialModel`) |
| Modelo custom (dff/txd) | `isSpecialModel: true` + `modelFile` + agregar a `SPECIAL_MODELS.FILES` + copiar archivos a ModLoader |
| Tunear radios/budgets | `Config.ACTORS` (`ENTER`/`EXIT`/`SPAWN_*`/`CHECK_*`) |
| Tunear rango IDs especiales | `Config.SPECIAL_MODELS` (`RANGE_START`/`RANGE_END`/`FILES`) |

**No** hace falta tocar `gsis_Actors.js` ni el index (ya importado).

---

## 8. Actores vs esferas (importante)

| | Actores | Spots (esferas) |
|---|---|---|
| Archivo | `gsis_actor_data.js` | `gsis_spot_data.js` |
| Qué es | Ped en el mundo | Punto de interacción (se abre con `ESPACIO`) |
| Módulo | `gsis_Actors.js` | WeaponDealer / Seller / Pickup |
| N instancias | N entradas en `ACTORS` | N entradas en `SPOTS.*` |
| Gate interior | `_pendingInitSpawn` (igual que Spawner) | gate en SpotRuntime / módulos |
| Dormancy | Radio ENTER/EXIT (permanents) | n/a (esferas solo si tipo lo pide, y apagadas por la cooldown) |
| Relación | **Ninguna** | **Ninguna** |

Mover el dealer no mueve su esfera F, y al revés. Coordenadas pueden ser idénticas o no — se escriben aparte. Guía completa de esferas: [gsis_SPOTS.md](./gsis_SPOTS.md).

**Personajes** ([gsis_CHARACTERS.md](./gsis_CHARACTERS.md)): la identidad (nombre + diálogos) referencia `actorId` → este catálogo. Actors **no** importa Characters ni al revés (solo datos).

**Animaciones** ([gsis_ACTORANIMS.md](./gsis_ACTORANIMS.md)): módulo aparte (`anims:*` + `idleAnim` en el def). Actors **no** importa ActorAnims — solo emite `actors:spawned` y expone `actors:handle`.

---

## 9. Verificación

```powershell
node --check "modloader\IronSyndicate\cleo\IronSyndicate\modules\gsis_Actors.js"
node --check "modloader\IronSyndicate\cleo\IronSyndicate\data\gsis_actor_data.js"
```

Logs esperados (ver [TESTING §8](./gsis_TESTING.md#8-logs-esperados)):

```
[Actors] Cargando 1 modelos especiales...
[Actors] Especial cargado: fam5 → ID 15000
[Actors] Especiales listos: {"fam5":15000}
[Actors] Permanentes registrados (dormant): 2
[Actors] Spawn weapon_dealer (weapon_dealer)   // si MISC.DEBUG_ENABLED
[Actors] Spawn weapon_seller (weapon_seller)
```

Casos manuales: [TESTING §9](./gsis_TESTING.md#9-pruebas-manuales-checklist-en-juego) #36–51 (dormancy: #45–51).
