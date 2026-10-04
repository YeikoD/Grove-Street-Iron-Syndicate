# GSIS — Localización (L10n)

Sistema de cadenas es/en para mensajes al jugador (`showTextBox`) **y subtitulos** (00BB). Los labels de la UI web quedan fuera: es una excepcion declarada.

---

## 1. Flujo

```
data/gsis_lang_data.js (STRINGS es/en)
        ↓
core/gsis_L10n.js → t(key, params) → string activo (LANG.DEFAULT = "es")
        ↓
[fs][mem]gsis_index.js → initL10n() → FxtStore.insert(key, val) [runtime]
        ↓
modloader\IronSyndicate\cleo\cleo_text\gsis.fxt        (mensajes/UI — fallback ES, UTF-8)
modloader\IronSyndicate\cleo\cleo_text\gsis_dialog.fxt (diálogos/subtítulos — fallback ES, UTF-8)
```

## 2. API

```javascript
import { t } from "../core/gsis_L10n.js";

showTextBox(t("SAVE_OK", { slot: 2 }));
// es: "Partida guardada en slot 2"
// en: "Game saved in slot 2"
```

| Función | Uso |
|---|---|
| `t(key, params)` | Traducción activa; `params` reemplaza `{name}`, `{n}`, etc. |
| `initL10n()` | Llamado **una vez** en index, **antes** de `initSaveManager()` |
| `getLang()` | Idioma actual (`"es"` / `"en"`) |
| `hasKey(key)` | Existe la key en STRINGS |

## 3. Reglas de keys (GXT)

- **≤ 7 caracteres** (límite GXT). `_syncFxt()` loguea y salta keys >7.
- SCREAMING_SNAKE: `SAVEINT`, `TRK_FUL`, `VHC_REG`…
- **115 keys** en STRINGS; FXT = `gsis.fxt` (101) + `gsis_dialog.fxt` (13) — emparejadas al añadir.
- **UI web**: la página tiene sus labels en español hardcodeado, fuera de `t()`.
  Excepción declarada en [gsis_MAINTENANCE.md §2.2](./gsis_MAINTENANCE.md).
- Fuentes:
  - **ES**: `modloader\IronSyndicate\cleo\cleo_text\gsis.fxt` (mensajes/UI) + `modloader\IronSyndicate\cleo\cleo_text\gsis_dialog.fxt` (diálogos + nombres `CH_*`) — UTF-8
  - **Ambos**: `data/gsis_lang_data.js` → `STRINGS[key] = { es, en }`
- Valores activos se sincronizan a **FxtStore** en `initL10n()`.

### Deuda abierta: `GSIS_MENU`

`GSIS_MENU` tiene **9 caracteres** y está en `data/gsis_lang_data.js`, pero
**no está en ninguno de los dos FXT**. Consecuencias, todas verificables:

- El check 7 del checklist (keys ≤7) la marca.
- El check 8 da `MISMATCH (115 vs 114)`: hay una key más que líneas de FXT.
- El log lo dice en cada arranque: `[L10n] Key >7 chars: GSIS_MENU`.

Es un bug de **datos**, no de documentación: se arregla en
`data/gsis_lang_data.js` (renombrarla a ≤7, p. ej. `GSIS_MENU` → `GS_MENU`) y
agregando la línea al FXT. Hasta entonces, los checks 7 y 8 del checklist
fallan y es lo esperado. Inventario: [gsis_MAINTENANCE.md §7](./gsis_MAINTENANCE.md).

## 4. Añadir un string nuevo

1. Agregar key ≤7 chars en `data/gsis_lang_data.js` (`es` y `en`).
2. Agregar la misma key en el FXT ES (UTF-8):
   - mensaje / label UI → `modloader\IronSyndicate\cleo\cleo_text\gsis.fxt`
   - key de diálogo (`dialogue:play`) o nombre de personaje (`CH_*`) → `modloader\IronSyndicate\cleo\cleo_text\gsis_dialog.fxt`
3. Usar `t("KEY", { param })` — `showTextBox` **nunca** hardcodeado.
4. Parámetros: `{n}` `{name}` `{qty}` `{free}` `{need}` `{slot}` `{id}` `{model}` `{order}` `{w}` `{max}` `{list}` `{a}` `{b}` `{x}` `{y}`.

### Dónde va cada texto

| Uso | Ejemplo | Códigos `~` |
|---|---|---|
| `showTextBox` / GXT | `t("INV_FUL")` → `~r~Inventario lleno` | sí |
| **Labels de la página web** | `"Peso: " + …` en `UI/app.js` | **nunca** — el CSS pone el color |

Los labels de la UI web **no pasan por `t()`**: es la excepción declarada en
[gsis_MAINTENANCE.md §2.2](./gsis_MAINTENANCE.md). Si se localiza la página, el
texto tiene que viajar en el snapshot, no resolved en el navegador.

## 5. Diálogo / subtítulos (00BB)

- **Módulo**: `modules/gsis_Dialogue.js` — cola con timing (una línea o secuencia).
- **Opcode**: `00BB` (`PRINT` / `show_text_lowpriority`) = subtítulos GXT lowpriority.
- **FXT de diálogos**: `modloader\IronSyndicate\cleo\cleo_text\gsis_dialog.fxt` (keys usadas en `dialogue:play`; resto en `gsis.fxt`).
- **Color**: `DIALOGUE.DEFAULT_COLOR` (`~w~` blanco) se aplica si la línea **no** trae código `~x~` (`~r~`/`~g~`/`~y~` se respetan).
- **Render**: resuelve con `t()`/literal → `PRINT_STRING` (no depende de FXT en runtime; FXT es fallback ES).
- **EventBus**:

```javascript
import { emit, query } from "../core/gsis_EventBus.js";

// Una línea
emit("dialogue:play", { key: "DLG_T01", ms: 2500 });

// Secuencia (gap entre líneas; replace corta la actual)
emit("dialogue:play", {
    lines: [
        { key: "DLG_T01", ms: 2500 },
        { key: "DLG_T02", ms: 3000, gap: 400 }
    ],
    replace: true
});

// Línea con params → t() en runtime (p.ej. SEL_A1 + { n })
emit("dialogue:play", { key: "SEL_A1", params: { n: 300 }, ms: 3000, replace: true });

// Texto literal (sin key) — si no trae ~x~, pinta blanco por defecto
emit("dialogue:play", { text: "Hola", ms: 1500 });

emit("dialogue:stop", {});
var busy = query("dialogue:isPlaying", {}); // → bool
```

| Campo | Default | Notas |
|---|---|---|
| `ms` | `DIALOGUE.DEFAULT_MS` (3000) | Duración de la línea |
| `gap` | `DIALOGUE.GAP` (200) | ms **tras** la línea antes de la siguiente |
| `replace` | `false` | Limpia cola + `CLEAR_PRINTS` |
| `flag` | `DIALOGUE.FLAG` (1) | flag 00BB |
| color | `DIALOGUE.DEFAULT_COLOR` (`~w~`) | solo si la línea no trae `~x~` |

- Keys de diálogo: ≤7 + `gsis_lang_data.js` / **`gsis_dialog.fxt`**.
- Sin vínculo a actores (texto suelto de sistema).
- Diálogo **con nombre** de personaje → usar `characters:say` (no `dialogue:play` a mano) · guía [gsis_CHARACTERS.md](./gsis_CHARACTERS.md).
- Config: `core/gsis_Config.js` → `DIALOGUE`.

## 6. Cómo ver en juego

- Spanish por defecto (`LANG.DEFAULT = "es"`).
- FXT hot-reload: editar `gsis.fxt` o `gsis_dialog.fxt` reinicia el script.
- Faltante en FXT → muestra clave cruda o vacío según CLEO (el runtime de diálogo usa `t()`).
