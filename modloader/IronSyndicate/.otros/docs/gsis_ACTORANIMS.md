# GSIS — Animaciones de Actores

Reproduce animaciones IFP **vanilla** en peds de `gsis_Actors.js` (`TASK_PLAY_ANIM` 0605 + load 04ED/04EE/04EF).

Ver: [Arquitectura](./gsis_ARCHITECTURE.md) · [Actores](./gsis_ACTORS.md) · [Testing](./gsis_TESTING.md) · [Mantenimiento](./gsis_MAINTENANCE.md)

---

## 1. Archivos

| Archivo | Rol |
|---|---|
| `data/gsis_actor_anim_data.js` | Catálogo: id → `{ ifp, name, blend?, loop?, … }` + `getAnimDef` |
| `data/gsis_actor_data.js` | Campo opcional `idleAnim` en el def del actor |
| `modules/gsis_ActorAnims.js` | Runtime: REQUEST/HAS/PLAY/REMOVE + EventBus `anims:*` |
| `core/gsis_Config.js` → `ACTOR_ANIMS` | `DEFAULT_BLEND`, `LOAD_TIMEOUT_MS`, `TICK_MS` |
| `[fs][mem]gsis_index.js` | Import side-effect **tras** Actors, antes de Dialogue |

`gsis_Actors.js` **no** se importa ni se toca — handles solo vía `query("actors:handle")`.

---

## 2. Configurar anims

### Catálogo (`gsis_actor_anim_data.js`)

```javascript
export var ACTOR_ANIMS = [
    { id: "dealer_idle", ifp: "DEALER", name: "DEALER_IDLE", loop: true },
    { id: "seller_idle", ifp: "DEALER", name: "DEALER_IDLE_01", loop: true }
];
// Nombres reales SA: IFP DEALER → DEALER_IDLE, DEALER_IDLE_01/02/03, DEALER_DEAL…
// También existe DEALER_IDLE en IFP GANGS. "IDLE_STAND" NO existe en PED.
```

| Campo | Default | Notas |
|---|---|---|
| `id` | — | Único; lo referencian `idleAnim` y `anims:play.anim` |
| `ifp` | — | Archivo IFP vanilla (`PED`, `PLAYIDLES`, …). `"PED"`: sin REQUEST/REMOVE |
| `name` | — | Nombre de la secuencia dentro del IFP |
| `blend` | `4.0` | framedelta |
| `loop` | `true` | |
| `lockX` / `lockY` | `false` | |
| `keepLast` | `false` | |
| `time` | `-1` | ms; `-1` = hasta que termine sola |

Si el ped no anima: revisar `name`/`ifp` en data (no crash — solo no reproduce).

### Idle automático al spawn (`gsis_actor_data.js`)

```javascript
{
    id: "weapon_dealer",
    // …
    idleAnim: "dealer_idle"   // opcional → getAnimDef(idleAnim)
}
```

Al `actors:spawned` (incl. re-spawn tras dormancy >180m) se encola sola.

---

## 3. EventBus

| Evento | Payload | Dirección |
|---|---|---|
| `anims:play` | `{ id\|instanceKey\|role, anim, blend?, loop?, time? }` | cualquier módulo → ActorAnims |
| `anims:stop` | `{ id\|instanceKey\|role }` → `CLEAR_CHAR_TASKS` + suelta IFP | cualquier módulo → ActorAnims |

Selector de handle: misma prioridad que Actors (`instanceKey` > `id` > `role`).

```javascript
import { emit } from "../core/gsis_EventBus.js";

emit("anims:play", { role: "dealer", anim: "dealer_idle" });
emit("anims:stop", { role: "dealer" });
```

Escucha (no emitir desde fuera salvo tests):

| Evento | Uso |
|---|---|
| `actors:spawned` | Si `def.idleAnim` → enqueue |
| `actor:died` | Limpia pending + refcount del key |

---

## 4. Runtime

```
enqueue → REQUEST_ANIMATION(ifp) [refcount] → pending[]
update (TICK_MS):
  HAS_ANIMATION_LOADED → TASK_PLAY_ANIM → activa (refcount sigue)
  timeout LOAD_TIMEOUT_MS → drop + log
stop / died → CLEAR_CHAR_TASKS (si stop) + REMOVE_ANIMATION si refcount 0
```

- Refcount por `ifp` (como modelos en Actors); `"PED"` nunca se pide ni libera.
- Un solo `pending` por `key` (re-enqueue reemplaza).
- `anims:stop` con role libera solo ese role si el handle resuelve.

---

## 5. Natives

| Native | Opcode | Nota |
|---|---|---|
| `REQUEST_ANIMATION` | 04ED | No hace falta para `"PED"` |
| `HAS_ANIMATION_LOADED` | 04EE | Poll en update |
| `REMOVE_ANIMATION` | 04EF | **Nunca** con `"PED"` (crash) |
| `TASK_PLAY_ANIM` | 0605 | `(handle, name, ifp, blend, loop, lockX, lockY, keepLast, time)` |

---

## 6. Cómo agregar una anim

1. Entrada nueva en `ACTOR_ANIMS` (id/ifp/name…).
2. Uso: `idleAnim: "mi_anim"` en el def del actor **o** `emit("anims:play", { …, anim: "mi_anim" })`.
3. No tocar `gsis_ActorAnims.js` ni `gsis_Actors.js`.
4. Probar en juego (casos en [gsis_TESTING.md](./gsis_TESTING.md)).

---

## 7. Verificación

```powershell
node --check "modloader\IronSyndicate\cleo\IronSyndicate\modules\gsis_ActorAnims.js"
node --check "modloader\IronSyndicate\cleo\IronSyndicate\data\gsis_actor_anim_data.js"
```

En juego: dealer/seller con pose al spawnear; >180m y volver → re-aplica; log `[ActorAnims] Play …` si `MISC.DEBUG_ENABLED`.
