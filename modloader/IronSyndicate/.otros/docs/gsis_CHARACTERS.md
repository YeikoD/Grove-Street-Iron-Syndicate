# GSIS — Personajes

Identidad narrativa: **nombre + diálogos + actor** (el model/spawn vive en el actor; aquí solo se referencia).

Ver: [Arquitectura](./gsis_ARCHITECTURE.md) · [Actores](./gsis_ACTORS.md) · [Diálogo](./gsis_L10N.md#5-diálogo--subtítulos-00bb) · [L10n](./gsis_L10N.md)

---

## 1. Archivos

| Archivo | Rol |
|---|---|
| `data/gsis_character_data.js` | Catálogo: `id`, `nameKey`, `actorId`, `lines` (topics) |
| `modules/gsis_Characters.js` | Runtime: resuelve personaje + línea → `dialogue:play` con prefijo nombre |
| `modloader\IronSyndicate\cleo\cleo_text\gsis_dialog.fxt` | Keys de nombre (`CH_*`) y líneas |
| `[fs][mem]gsis_index.js` | Import side-effect (Characters, tras Dialogue) |

**Relación** (una sola dirección de datos):

```
CHARACTERS.actorId  ──►  ACTORS[].id   (model, spawn, dormancy)
CHARACTERS.lines    ──►  keys L10n     (gsis_dialog.fxt)
CHARACTERS.nameKey  ──►  L10n          (gsis_dialog.fxt)
```

Actors **no** conoce personajes. Dialogue **no** conoce personajes.

---

## 2. Data — `gsis_character_data.js`

```javascript
export var CHAR_NAME_COLOR = "~w~";   // default color del nombre (blanco)

export var CHARACTERS = [
    {
        id: "seller_local",           // único
        nameKey: "CH_SEL",            // ≤7 → "Vendedor local"
        nameColor: "~w~",             // opcional (si se omite: CHAR_NAME_COLOR)
        actorId: "weapon_seller",     // → ACTORS[].id (model + spawn)
        lines: {
            accept_ok: "SEL_A1",      // topic → key
            reject_high: "SEL_R1"
            // o secuencia: greet: ["DLG_S01", { key: "DLG_S02", gap: 400 }]
        }
    }
];
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador del personaje |
| `nameKey` | string | Key L10n del nombre (≤7, en `gsis_dialog.fxt`) |
| `nameColor` | string | Color `~w~` del prefijo; default `CHAR_NAME_COLOR` (blanco) |
| `actorId` | string | Referencia a `ACTORS[].id` — **no** duplica model/spawn |
| `lines` | object | Topics → key o array de keys/objs `{ key, ms?, gap? }` |
| `seller` | object | **Opcional** — config del trueque (WeaponSeller), ver §2b |
| `dealer` | object | **Opcional** — config de precios (WeaponDealer), ver §2b |

Helpers: `getCharacter(id)` · `getCharacterByActor(actorId)`.

---

## 2b. Config seller / dealer (multi-personaje)

La esfera que abre el menú aporta `characterId` ([SPOTS](./gsis_SPOTS.md)); cada NPC usa **su** config y **su** estado (intereses/budget/carrito). Sin config → comportamiento base (aleatorio / precios catálogo).

### `seller` — WeaponSeller (trueque)

```javascript
seller: {
    interests: ["Pistolas"],   // fijos; omitir = 1-2 aleatorios
    budgetMin: 200,            // presupuesto; omitir = formula (2-3 armas +10-30%)
    budgetMax: 600,            // rango; con budgetMin
    techoInterest: [50, 450],  // extra si le interesa la categoría (default)
    techoBase: [0, 150]        // extra si no (default)
}
```

Estado en memoria por `characterId` (`_states`); se genera al abrir el menú y regenera si se cumplió el interés (budget bajo o N ventas).

### `dealer` — WeaponDealer (mayorista)

```javascript
dealer: {
    items: ["9mm", "desert_eagle", "micro_uzi"],  // catálogo que vende (omitir = todas)
    prices: { "9mm": 100, "desert_eagle": 300, "micro_uzi": 200 },
    markup: 1.15                    // +15% sobre base; solo si no hay prices/item
}
```

- `items` → fuera de la lista: `getDealerPrice` = 0 (no aparece en el menú ni se agrega).
- `prices[itemId]` → precio fijo (ignora markup).
- Carrito en memoria por `characterId` (`_carts`). La UI usa `getDealerPrice(itemId)` (no `getWeaponPrice` directo). Checkout → `DealerOrders` (persiste) y limpia solo el carrito del personaje activo.

---

## 3. EventBus

```javascript
import { emit, query } from "../core/gsis_EventBus.js";

// Info / nombre
var ch = query("characters:info", { id: "seller_local" });
var n  = query("characters:name", { characterId: "seller_local" });
// n → { key: "CH_SEL", name: "Vendedor local", color: "~w~" }

// Hablar (prefija nombre → dialogue:play)
emit("characters:say", {
    characterId: "seller_local",
    key: "SEL_A1",              // o topic / lines / text
    params: { n: 300 },
    replace: true
});
// → "Vendedor local: ¡De una, me sirve el precio! (+$300)"

// Por topic del catálogo
emit("characters:say", {
    characterId: "seller_local",
    topic: "accept_ok",
    params: { n: 300 },
    replace: true
});

// Por actor (si no se pasa characterId)
emit("characters:say", {
    actorId: "weapon_seller",
    key: "SEL_R1",
    replace: true
});
```

| Evento | Payload | Hacia |
|---|---|---|
| `characters:info` | `{ id \| actorId \| characterId }` → def \| null | query |
| `characters:name` | idem → `{ key, name, color }` \| null | query |
| `characters:say` | `{ characterId\|actorId, key?\|text?\|lines?\|topic?, params?, ms?, gap?, replace? }` | on → emite `dialogue:play` |

**Prefijo**: `nameColor + name + "~w~: " + línea` (nombre en blanco; la línea conserva su `~r~`/`~g~` o `DEFAULT_COLOR`).

---

## 4. Flujo de `characters:say`

```
emit characters:say { characterId: "seller_local", key: "SEL_A1", params: { n: 300 } }
  → getCharacter("seller_local")
  → name = t("CH_SEL")  // "Vendedor local"
  → text = t("SEL_A1", { n: 300 })
  → full = "~w~Vendedor local~w~: ~g~¡De una... (+$300)"
  → emit dialogue:play { lines: [{ text: full, ms }], replace }
  → Dialogue: PRINT_STRING
```

---

## 5. Ejemplos en catálogo

| id | nameKey | actorId | Uso |
|---|---|---|---|
| `seller_local` | `CH_SEL` | `weapon_seller` | Trueque (SellMenu) |
| `dealer_local` | `CH_EMM` | `weapon_dealer` | Emmet — dealer mayorista (9mm/DE/uzi) |

---

## 6. Cómo agregar un personaje

1. Añadir entrada en `CHARACTERS` (`id`, `nameKey`, `actorId`, `lines`).
2. Añadir `nameKey` ≤7 en `gsis_lang_data.js` + `gsis_dialog.fxt` (ES UTF-8).
3. Asegurar que `actorId` exista en `ACTORS` (o crear el actor antes).
4. Emitir `characters:say` desde UI/módulo (no importar Characters a mano).
5. No hace falta tocar Dialogue ni Actors.

---

## 7. Verificación

```powershell
node --check "modloader\IronSyndicate\cleo\IronSyndicate\data\gsis_character_data.js"
node --check "modloader\IronSyndicate\cleo\IronSyndicate\modules\gsis_Characters.js"
```

Log init esperado:

```
[GSIS] Characters: 2 personajes
```

Caso manual: oferta en trueque → subtítulo con prefijo `Vendedor local:` + texto SEL_*.
