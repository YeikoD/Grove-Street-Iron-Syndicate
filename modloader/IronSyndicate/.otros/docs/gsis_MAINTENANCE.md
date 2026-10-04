# GSIS — Guía de Mantenimiento

Reglas y checklists para mantener el proyecto limpio y alineado a la arquitectura.

---

## 1. Checklist Pre-Commit (obligatorio)

Todos los paths son **relativos a la raíz del juego** (`<GTA SA>\`).

```powershell
# 0. Raices del proyecto
$mod = "modloader\IronSyndicate\cleo\IronSyndicate"   # codigo CLEO
$ui  = "modloader\IronSyndicate\UI"                  # pagina web

# 1. Sintaxis de TODOS los .js (mod + pagina)
$all = @(Get-ChildItem -Path $mod -Recurse -Filter *.js) + @(Get-ChildItem -Path $ui -Filter *.js)
$ok = $true
foreach ($f in $all) { node --check $f.FullName; if (-not $?) { $ok = $false; Write-Output "FAIL $($f.FullName)" } }
if ($ok) { Write-Output "ALL OK ($($all.Count))" }

# 2. Sin imports entre módulos (solo EventBus)
Select-String -Path "$mod\modules\*.js" -Pattern 'from ["'']\.\./modules/'

# 3. Sin referencias a código eliminado / APIs muertas
Select-String -Path "$mod\**\*.js" -Pattern 'getGameState|isInitialized|consumeDirty|getTrunkPosition|_wFloat|_rFloat'

# 4. Sin console.log/debugger (usar log() de CLEO)
Select-String -Path "$mod\**\*.js" -Pattern 'console\.(log|debug)|debugger'

# 5. Sin TODO/FIXME rotos en código nuevo
# CaseSensitive y con dos puntos/parentesis: en español "todo" es una palabra
# comun ("todo el lado del modulo"), asi que un TODO pelado matchea la mitad de
# las frases del proyecto.
Select-String -Path "$mod\**\*.js" -CaseSensitive -Pattern 'TODO[:(]|FIXME|HACK|XXX'

# 6. Sin showTextBox hardcodeado (usar t("KEY"))
Select-String -Path "$mod\**\*.js" -Pattern 'showTextBox\(["'']~'

# 6b. La pagina no puede reescribir el shim (es del runtime)
Select-String -LiteralPath "$ui\app.js" -Pattern 'window\.SAWeb\s*='

# 6b-2. Cada SAWeb.tick tiene que estar guardado con if (window.SAWeb)
$guard = (Select-String -LiteralPath "$ui\app.js" -Pattern 'if \(window\.SAWeb\)').Count
$ticks = (Select-String -LiteralPath "$ui\app.js" -Pattern 'SAWeb\.tick\s*=').Count
if ($guard -ge $ticks) { "tick guardado ($ticks/$guard)" } else { "FAIL: tick sin guardar ($ticks ticks, $guard guards)" }

# 6c. La pagina no duplica datos del mod (catalogo, tipos, peso maximo)
# El bloque MOCK_CATALOG queda excluido a proposito: es la copia de diseño del
# preview sin puente, nunca se lee en juego y no es fuente. Lo que se busca es
# que el catalogo de verdad no tenga una segunda copia adentro de la pagina.
$js = Get-Content -LiteralPath "$ui\app.js" -Raw
$jsSinMock = [regex]::Replace($js, '(?s)const MOCK_CATALOG = \{.*?\r?\n\};', '')
Select-String -InputObject $jsSinMock -Pattern 'MAX_INVENTORY_WEIGHT|\.png["'']|"weapon".*"magazine"'

# 6d. Nadie lee teclas por su cuenta: la lectura vive en gsis_Input.js
# Sin esto, un modulo nuevo se saltea la supresion sin dejar rastro, y con el
# menu abierto Q abre el mapa, R recarga y F abre el dealer.
Get-ChildItem -Path $mod -Recurse -Filter *.js |
  Where-Object { $_.Name -ne 'gsis_Input.js' } |
  Select-String -Pattern 'Pad\.IsKeyJustPressed|isKeyPressed\('

# 6e. La pagina no mantiene estado de input propio
# Todo el estado del input llega en "uistate". Una bandera propia (focused,
# inputOn) es el sintoma de que alguien esta adivinando lo que no puede saber.
Select-String -LiteralPath "$ui\app.js" -Pattern '\bfocused\b|\binputOn\b'

# 6f. Cada export de gsis_Input tiene consumidor
# Una API que nadie llama es documentacion que se contradice sola.
$inp = "$mod\core\gsis_Input.js"
$exp = (Select-String -LiteralPath $inp -Pattern '^export function (\w+)' -AllMatches).Matches | ForEach-Object { $_.Groups[1].Value }
$exp | ForEach-Object {
    $n = (Get-ChildItem -Path $mod -Recurse -Filter *.js |
            Where-Object { $_.FullName -ne $inp } |
            Select-String -Pattern ("\b" + $_ + "\b") -AllMatches | Measure-Object).Count
    if ($n -eq 0) { "SIN USO: " + $_ }
}

# 7. Keys L10n <=7 chars (GXT)
$keys = Select-String -LiteralPath "$mod\data\gsis_lang_data.js" -Pattern '^\s{4}([A-Z0-9_]+):' | ForEach-Object { $_.Matches[0].Groups[1].Value }
$keys | Where-Object { $_.Length -gt 7 }

# 8. STRINGS == FXT (gsis.fxt + gsis_dialog.fxt)
$es = (Select-String -LiteralPath "$mod\data\gsis_lang_data.js" -Pattern '^\s{4}[A-Z0-9_]+:' -AllMatches).Matches.Count
$fxt = (Select-String -Path "modloader\IronSyndicate\cleo\cleo_text\gsis.fxt","modloader\IronSyndicate\cleo\cleo_text\gsis_dialog.fxt" -Pattern '^[A-Z0-9_]+ ' -AllMatches).Matches.Count
if ($es -eq $fxt) { "STRINGS == FXT ($es)" } else { "MISMATCH ($es vs $fxt)" }
```

| Check | Esperado |
|---|---|
| `node --check` | 0 fallos |
| Imports `../modules/` dentro de `modules/` | 0 matches |
| APIs muertas | 0 matches |
| `console.*` / `debugger` | 0 matches |
| `TODO`/`FIXME` sin ticket | 0 en código nuevo |
| `showTextBox("~...")` | 0 — siempre `t("KEY")` |
| Shim reescrito a mano | 0 — el shim es el dueño |
| `SAWeb.tick` sin guardar | 0 — siempre dentro de `if (window.SAWeb)` |
| Catálogo duplicado en la página | 0 — la fuente es `data/` |
| Lectura de teclas fuera de `gsis_Input.js` | 0 — todo va por `keyJustPressed()` |
| Estado de input propio en la página | 0 — llega en `uistate` |
| Exports de `gsis_Input.js` sin uso | 0 |
| Keys STRINGS/FXT | todas ≤7 chars |
| STRINGS count vs FXT | `gsis.fxt` + `gsis_dialog.fxt` = STRINGS |

Y uno que no es un `Select-String` sino un comando, y que por eso estaba faltando
mucho tiempo:

| Check | Cómo |
|---|---|
| **`check_smoke_mod.mjs`** — el `update()` real no tira | `cd $env:TEMP\opencode; node check_smoke_mod.mjs` |
| **`check_scope.mjs`** — ninguna función llamada sin definir | `cd $env:TEMP\opencode; node check_scope.mjs` |

> Los checks de contrato (render, pantallas, imports, icons) **no alcanzan para
> esto**. Verifican que un nombre coincida de los dos lados, no que el código corra:
> un `ReferenceError` es sintaxis válida, pasa `node --check` y pasa los cuatro.
> Pasó una sesión entera con la suite en verde y el mod tirando 3138 frames por
> segundo.
>
> Los dos que sí lo agarran se complementan, y cada uno cubre una mitad:
>
> | Check | Cubre | No cubre |
> |---|---|---|
> | `check_scope.mjs` | Una **función** llamada que nadie definió | Una **variable** leída sin declarar |
> | `check_smoke_mod.mjs` | Las dos: ejecuta el `update()` de verdad | Nada que no se llegue a ejecutar |
>
> Los dos se verificaron reintroduciendo el bug a propósito. Al `check_scope` se le
> borró `readJustPressed()` de una copia y lo Marca el nombre sin definir con su
> archivo y su línea. Al smoke test se le deshizo el arreglo de `_flowVisible` y
> falló con el mismo `ReferenceError` del juego.
>
> `check_scope` acepta un directorio por argv, que es lo que permite correrlo contra
> la copia: `node check_scope.mjs <dir>`.

> **Los checks 7 y 8 fallan hoy** (ver §7). Es deuda conocida, no un error
> de este checklist: 7/8 se arreglan en `data/gsis_lang_data.js`. No en el doc.
> El 6c sí pasó con la reorganización: la página ya no duplica el catálogo.

---

## 2. Reglas de Arquitectura (invariantes)

Estas reglas **nunca** se rompen. Si una tarea las exige, se cambia la arquitectura primero (con revisión), no el código.

### 2.1 Dirección de dependencias

```
modules/  →  core/  →  data/
```

- `modules/` importa de `core/` y `data/` — **NUNCA de otros `modules/`**
- `core/` no conoce `modules/` ni `data/`
- `data/` no importa nada (puro datos)

> Antes había una capa `ui/` entre `modules/` y `core/`. Ya no existe: los dos
> archivos de la UI web son módulos comunes y viven en `modules/`. `ui/` que
> aparece en documentos viejos era la carpeta, no una capa de arquitectura.

**Comunicación entre módulos: solo EventBus.**

```javascript
// BIEN — modules → EventBus
import { on, emit, query } from "../core/gsis_EventBus.js";
emit("save:dirty", {});
var entry = query("spawner:find", { car: car });

// MAL — módulo importa módulo
import { isTrunkOpen } from "./gsis_Trunk.js";   // ❌ prohibido
```

### 2.2 Fuente única de verdad

| Dato | Fuente única | Prohibido |
|---|---|---|
| Estado persistente | `SaveManager` (`registerModule`/`getModuleData`/`setModuleData`) | Globales, `GameState` crudo, archivos sueltos |
| Teclas / distancias / timers / límites | `core/gsis_Config.js` | Hardcodear `50`, `0.75`, `KEYS.X` en módulos |
| **Lectura de teclas y estado del input** | `core/gsis_Input.js` (supresión) y `modules/gsis_WebInterface.js` (teclas de menú) · guía [gsis_INPUT.md](./gsis_INPUT.md) | `Pad.IsKeyJustPressed` o `isKeyPressed` fuera de `gsis_Input.js`; un módulo leer la tecla de su propio menú; la página mantener banderas propias de input (`focused`, `inputOn`) |
| Catálogo de items | `data/gsis_item_data.js` | `ITEMS` duplicado en UI/módulos |
| Iconos y bandas de la tabla web | `data/gsis_web_data.js` (`WEB_ICONS` / `WEB_CAT_ORDER` / `WEB_CAT_LABELS`) | Reimplementar el mapa de iconos o la lista de tipos dentro de `UI/app.js`. El bloque `MOCK_CATALOG` es la única excepción: es la copia de diseño del preview sin puente y no se lee en juego |
| **Fila de la tabla web** | `modules/gsis_ItemRow.js` (`itemRow`/`ammoCell`/`valueCell`/`tipFor`) | Que cada pantalla construya su fila. Las reglas que trae (recorte de munición a la capacidad, guion en vez de cero, tip de la instancia) son de las que divergen calladas |
| **Shape del inventario** | `modules/gsis_InventorySerialization.js` (`snapCatalog`/`snapInventory`) | Mandar en cada push lo que es estático (`catalog` va una sola vez) o lo que nadie lee (se limpiaron `money`, `belt` y `equipped`) |
| **Shape de los 4 menús de esfera** | `modules/gsis_FlowSerialization.js` (`snapFlow` + los 4 `snap*`) | Un snapshot por pantalla o un archivo por menú: el canal es uno, así que la forma del payload vive en un archivo |
| **Lista de menús de esfera** | `FLUJOS` en `gsis_FlowSerialization.js` (con `visible`/`open`/`close` de cada uno) + los ids de `registerMenuSource()` | Que el bridge tenga su propia lista de menus abiertos: se desincroniza del modulo que publica la visibilidad |
| **Definición de cada pantalla web** | `PANTALLAS` en `UI/app.js` | Escribir el esqueleto de un panel en el `index.html` cuatro veces. El esqueleto se arma con `crearPanel()` desde el registro |
| **Columnas de una tabla** | La lista `cols` de la pantalla, con el `.table--N` del CSS del mismo largo | Hardcodear el sexto elemento o dejar que la cabecera y la fila tengan distinto número de celdas |
| **Comandos de la página** | El `switch` de `handleCommand` en `gsis_WebInterface.js`, prefijo = id del menú | Que la página mande un `cmd:` que el mod no tiene: no hay error en ninguna parte, el comando no hace nada. Lo chequea `check_pantallas.mjs` |
| **Validación de una acción de flujo** | El módulo dueño (`putInTrunk`, `doOffer`, `collectItem`, `addToCart`) | Que la página calcule pesos o precios: el snapshot que tiene puede tener 400 ms |
| **Feedback de una acción** | `core/gsis_Notice.js` + el campo `notice` del snapshot | `showTextBox` para lo que el jugador ve en el panel: sale detrás del panel |
| `weaponType` de un arma | `tipoDe()` en `data/gsis_weapons.js`, sobre `FAMILIAS[].variantes` | Declararlo en el item, derivarlo del nombre, o escribir un `switch` por variante |
| Variante / configuración de un arma | `tipoDe(familia, clip, silenciador)` — **derivada, nunca guardada** | Guardar el `weaponType` en el save: queda con un arma distinta en cuanto la tabla cambie |
| Estado de los accesorios | `equipped[slot].silenciador` + `enArma[slot]` (id del cargador) en `modules/weapons/state.js` | Inventar un registro por slot para el silenciador: no puede seguir al arma a la mochila |
| Capacidad y cargador de un arma | `data/gsis_weapons.js` (`CARGADORES[].clipSize`) + `Engine.clipCapacityOf` | Copiar la capacidad a la UI o al catálogo |
| Modelos/tareas/lifetime de actores | `data/gsis_actor_data.js` | Hardcodear model id o presets en módulos |
| Anims de actores (IFP/name/loop) | `data/gsis_actor_anim_data.js` + `idleAnim` en actor def · guía [gsis_ACTORANIMS.md](./gsis_ACTORANIMS.md) | Llamar `TASK_PLAY_ANIM`/`REQUEST_ANIMATION` desde UI u otros módulos; importar ActorAnims |
| Spawn de peds (coords propias) | `spawn` en `gsis_actor_data.js` | Meter 100 coords en `Config.MISC` ni ligar a spots |
| Esferas de interacción (N por tipo) | `data/gsis_spot_data.js` → `SPOTS` + runtime en `core/gsis_SpotRuntime.js` · guía [gsis_SPOTS.md](./gsis_SPOTS.md) | Coords dealer/seller/retiro en `Config.MISC`; acoplar a actores; duplicar create/dist/gate/cooldown en los 3 módulos |
| Precio mayorista / trueque | `getDealerPrice` (WeaponDealer, con `ch.dealer.prices`) · `FAMILIAS.precio` / `CARGADORES.precio` / `SILENCIADORES.precio` en `gsis_weapons.js` | Hardcodear precios en UI o módulos |
| Geometría bolso (`BAG`) | `Config.BAG` | Mover sin probar en juego |
| Modelos especiales peds custom | `Config.SPECIAL_MODELS` + `isSpecialModel`/`modelFile` en `gsis_actor_data.js` · guía [gsis_ACTORS.md](./gsis_ACTORS.md) §Mini-Guía | Hardcodear IDs 15000+ en módulos; cargar sin `LOAD_SPECIAL_CHARACTER_FOR_ID` |
| Cadenas al jugador (`showTextBox`) | `t(key)` en `core/gsis_L10n.js` + `data/gsis_lang_data.js` + `CLEO_TEXT\gsis.fxt` | Texto hardcodeado `showTextBox("~r~...")` en módulos/UI |
| Subtítulos / diálogo | `emit("dialogue:play", …)` + keys en L10n y **`CLEO_TEXT\gsis_dialog.fxt`** · [gsis_L10N.md](./gsis_L10N.md) §5 | Llamar `native("PRINT")` a mano; texto hardcodeado; key de diálogo fuera de `gsis_dialog.fxt` |
| Identidad de personaje (nombre + líneas) | `data/gsis_character_data.js` + `emit("characters:say", …)` · guía [gsis_CHARACTERS.md](./gsis_CHARACTERS.md) | Duplicar nombre/diálogos en UI o módulos; importar Characters desde otro módulo; meter model/spawn en character_data |
| Datos que ve la página web | `modules/gsis_InventorySerialization.js` + `gsis_FlowSerialization.js` (snapshots) + `data/` para catálogo | Reimplementar el catálogo de items, los tipos o `MAX_INVENTORY_WEIGHT` dentro de `UI/app.js` |
| **Excepción: L10n en la página web** | Español hardcodeado en `UI/app.js` | Declarada, no desirable. El shim no expone STRINGS: localizarla exige un evento nuevo por push y que la página aplique el formateo. Revisar si el costo de L10n outweighs el de un evento extra |

### 2.3 Patrón de módulo

Cada módulo de `modules/` o `ui/` **se auto-registra**:

```javascript
import { register } from "../core/gsis_ModuleRegistry.js";

register({
    name: "NombreUnico",     // único en todo el proyecto
    init: function () { ... },
    update: function (now) { ... }
});
```

- **No** exportar `initX`/`updateX` para que index los llame a mano
- **No** tocar `[fs][mem]gsis_index.js` salvo para agregar el `import` side-effect
- Orden de `import` en index = orden de `update` por frame

### 2.4 Eventos estándar

Nombres: `sujeto:accion` (kebab-case). Payload mínimo.

| En uso | Payload | Emisor → Listener |
|---|---|---|
| `save:dirty` | `{}` | Spawner/EngineLock → Vehicles |
| `vehicle:destroyed` | `{ id }` | Spawner → Trunk |
| `trunk:restore` | `{ vehicleId, car }` | Spawner → Trunk |
| `vehicle:blip:add` / `:remove` | `{ entry, ... }` | Spawner → EngineLock |
| `vehicle:syncForSave` | `{}` | Vehicles → Trunk |
| `spawner:find` / `:closest` / `:isSpawning` | query | Trunk/EngineLock → Spawner |
| `dialogue:play` / `:stop` / `:isPlaying` | `{ key\|lines\|text, … }` / `{}` / query bool | cualquier módulo → Dialogue |
| `characters:info` / `:name` / `:say` | query def/nombre / `{ characterId\|actorId, key?\|topic?, … }` | UI/módulos → Characters → Dialogue |
| `anims:play` / `anims:stop` | `{ id\|instanceKey\|role, anim?, … }` / `{ id\|instanceKey\|role }` | cualquier módulo → ActorAnims |

**Consulta síncrona** (necesita respuesta): `query(evt, data)` + handler `e.respond(valor)`.

Al agregar un evento nuevo: documentarlo en `gsis_ARCHITECTURE.md` §3.3 **en el mismo PR**.

### 2.5 UI (página web CEF)

- `modules/gsis_WebInterface.js` es el **único** que manda estado a la página
  (`SAWeb.ui.send`). Latcheado por **firma**, no por referencia: `inputState()`
  devuelve una copia nueva en cada llamada, así que comparar el objeto no
  detectaría ningún cambio.
- `core/gsis_Input.js` es el **único** que llama `SAWeb.setCursor`, el único que
  consulta `SAWeb_GetInputState`, el único que congela al player y el único que
  decide que el juego no vea el mouse. El bridge le pasa información; no decide
  input. Ver [gsis_INPUT.md](./gsis_INPUT.md).
- El bloqueo del mouse (`setMenuGameMouse`) y el passthrough
  (`setMenuKeyPassthrough`) van **dormidos**: el bridge los llama en `false` y
  `null` en cada frame, porque ningún menú se cierra alejándose. Quedan escritos
  porque son el único lugar donde se sabe cómo se le habla a la ASI para eso, y
  volver a encenderlos es cambiar los argumentos que les pasa el bridge. Los dos
  setters van **separados** a propósito: comparten estado en el `CPad` del juego
  (`PCTempKeyState` está a dos líneas de `PCTempMouseState`), así que si
  compartieran línea, cambiar la polaridad de uno rompería el otro en silencio.
- **Las teclas de menú las lee solo el bridge**: `togglePanel()` con la `I` y
  `toggleFlow()` con la `ESPACIO`, armando el flanco con `rawKeyDown`. Ningún módulo
  lee la tecla de su propio menú. Con la `ESPACIO` abriendo y cerrando, cuatro
  módulos leyéndola verían la misma pulsación en el mismo frame y el primero se la
  sacaría al resto. La `I` con un menú de esfera abierto y la `ESPACIO` con el
  inventario abierto se ignoran (regla 1, una sola pantalla).
- El browser **nunca** se cierra: se oculta por clase `.hidden`.
- **La visibilidad de `#panel` (el inventario) tiene un solo dueño:
  `setPanelVisible()` en `UI/app.js`.** `setPantalla()` elige qué sección de flujo
  se ve y nada más; no toca la clase `hidden` de `#panel` salvo para *agregarla*
  cuando hay un flujo en pantalla. El invariante, después de procesar cualquier
  `uistate`:

  ```js
  // lo que se pide y lo que quedó tienen que coincidir
  panelEl.classList.contains("hidden") === !uiState.menu
  ```

  Esto no es estilo. Con dos escritores sobre la misma clase, `setPanelVisible()`
  hace early-return cuando el panel ya tiene `hidden` (no hay nada que hacer), y
  ese return temprano le **deja la puerta abierta a la otra función**, que después
  le quita el `hidden` y lo deja prendido sin ningún timer que lo apague. Fue el
  panel fantasma: aparecía al salir de una esfera, con datos viejos, y solo
  desaparecía al apretar `I`. Cubierto por `check_render.mjs`.
- `#panel` y las secciones `.panel--flujo` son **hermanos en `document.body`**, no
  padre e hijo. Por eso `setPantalla()` tiene que esconder explícitamente
  `#panel` cuando hay un flujo: no alcanza con que las secciones se excluyan
  entre sí.
- Los snapshots de `modules/gsis_InventorySerialization.js` son de **solo lectura**. Toda mutación
  de estado vive en el módulo, nunca en la vista.
- La página **no define `window.SAWeb`** (el shim es el dueño) y **no define
  `window.SAWeb.tick`** fuera de un `if (window.SAWeb)`.
- La página **no mantiene estado de input propio**. Todo llega en `uistate`.
  Tiene un motivo concreto, no una preferencia: la página *no puede* saber si el
  WndProc le está mandando teclas, y cuando intentó deducirlo terminó inventando
  avisos (uno pedía apretar F12, que no existía en ningún handler). Si `uistate`
  viene con `read: false`, se dice que no se pudo leer y no se afirma nada.
- Payload: `dataJson` de `SAWEB_SEND_EVENT` tiene **255 chars de tope duro**
  (`SAWebCleo.cpp:192`, capacidad `unsigned char`). Todo lo que supere eso va
  troceado; la página reensambla y no muestra hasta tener el snapshot entero.
- Las **acciones** llegan por el canal de retorno (SAWeb v2): la página emite
  `cmd:<algo>` y el bridge lo pulla con `SAWeb.takeCommand()` una vez por frame.
  Reglas:
  - El `cmd` sale del **nombre** del evento con el prefijo `cmd:`. Un nombre sin
    ese prefijo no llega al mod: se pierde en el `TriggerEvent`, que es el
    camino que CLEO Redux 1.5.0 no le entrega a los scripts.
  - El payload tiene que entrar en 255 chars (misma razón que arriba). Comandos
    chicos: `{cmd, id, qty}`. Datos grandes van por `ui.send`, que trocea.
  - Toda acción se valida en el módulo, no en la página: la página decide qué
    botón ofrece, `equipWeapon`/`removeItem`/`equipMagToBelt` decide si puede.
  - Un comando que revienta no puede llevarse el frame: `handleCommand()` lo
    loguea y sigue.
  - Tope de 4 por frame (`MAX_COMMANDS_PER_FRAME`).
  - El drenaje ocurre **con el menú cerrado también**. `ui:toggle` es el comando
    que reabre, así que gatearlo por `menuVisible` lo deja muerto por
    construcción.
  - Con la ASI v1 el canal no existe: `detectCommandChannel()` lo desactiva
    una vez y la UI degrada a solo lectura sin romper. **No** se agrega UI de
    acciones sin ese canal: sería un control visible que no hace nada.
  - El runtime y el `.cleo` tienen que ser de la **misma revisión**. La
    negociación de versión es de igualdad exacta (`SAWebCleo.cpp`: se compara
    `g_getApiVersion() == SAWEB_API_VERSION`), así que una ASI v3 con un facade
    v4 deja al mod **sin ningún comando registrado**. No es un degradado parcial:
    es la UI entera muerta.
  - Un `native()` que no existe devuelve `false`, **nunca tira**. El runtime vive
    en otro proyecto y el comando puede faltar: un `throw` en el per-frame se
    lleva por detrás el estado del teclado, los pushes y la página entera. El
    `gsis_Input.js` además avisa **una** vez y sigue, porque un modulo que se
    queja es recuperable y uno que dejó de correr no lo es.
- Colores/tamaños vía las custom properties de `UI\style.css` (`:root`), nunca
  literales sueltos: son la unica fuente de color de la UI.
- L10n: **excepción declarada** — los labels de la página están en español
  hardcodeado (ver §2.2).

### 2.6 Saves / handles

- Throttle: toggles emiten `save:dirty`; `saveGame()` solo F5 / auto-save / interior
- Handles de entidades: verificar `DOES_VEHICLE_EXIST` antes de usar
- `wait(0)` obligatorio en el loop principal; nada pesado sin yield

---

## 2.7 Desplegar el runtime (cinco artefactos)

El mod depende de una ASI que vive en otro proyecto, y actualizar el runtime es
parte del trabajo del mod. Son **cinco** artefactos y van juntos: cuatro se copian,
el quinto se edita a mano.

| # | Artefacto | Cómo llega |
|---|---|---|
| 1 | `SAWebUI.SA.asi` | build de `C:\Dev\SAWebUI\source\` |
| 2 | `cleo\cleo_plugins\SAWeb.cleo` | build de `cleo_bridge\` (CMake) |
| 3 | `cleo\SAWebUI\SAWeb.js` | copia |
| 4 | `cleo\SAWebUI\sa-commands.json` | copia — **es una plantilla** |
| 5 | `cleo\.config\sa.json` | **a mano**, en la raíz del juego |

El quinto es el que se saltea, y es una línea de diferencia entre "funciona" y
"el mod se muere 60 veces por segundo". CLEO Redux solo lee
`cleo\.config\sa.json`; el `sa-commands.json` del `modloader\` no lo lee nadie.

Pasa con cada comando nuevo. La v4 agrego `SAWeb_SetKeyPassthrough` y salió con
el facade actualizado y la declaración en v3:

```text
[WARN] Plugin attempted to register an unknown command SAWEB_SET_KEY_PASSTHROUGH.
       Check your sa.json file.
```

**Verificación, y es la más barata de todas:** al arrancar, `cleo_redux.log`
tiene que mostrar `Registering command SAWEB_` **diez** veces y ningún
`unknown command SAWEB`. El número delata el archivo desactualizado sin abrir
nada más. Con nueve, falta el nuevo.

El mod no depende de la v4 para todo —funciona con la v3—. El passthrough solo haría
falta **si volviera a haber un menú que se cierre alejándose**: hoy ninguno, porque
todos congelan al jugador y se cierran con la `ESPACIO`, el `Escape` o el botón. Ver
[gsis_UIDESIGN.md §3.1](./gsis_UIDESIGN.md).

### Orden de verificación después de un despliegue

```powershell
# 1. El runtime esta completo
cd C:\Dev\SAWebUI; node tests\run.js

# 2. Los cuatro artefactos del build estan en el juego, y son los del source
#    (hash igual, no solo que el archivo exista)

# 3. El mod
cd $env:TEMP\opencode
node check_render.mjs; node check_pantallas.mjs
node check_imports.mjs; node check_icons.mjs
node check_smoke_mod.mjs

# 4. En juego, con el log a la vista: el conteo de SAWEB y cero 'Error en update'
```

Y si algo falla en el juego, el log va primero. Ver
[gsis_TESTING.md §4](./gsis_TESTING.md).

---

## 3. Cómo agregar un módulo nuevo

| Paso | Acción |
|---|---|
| 1 | Crear `modules/gsis_Nombre.js` (o `modules/gsis_NombreMenu.js`) con `register({name, init, update})` |
| 2 | Si tiene datos estáticos → `data/gsis_*_data.js` |
| 3 | Si persiste → `registerModule("Nombre", defaults)` en `init` |
| 4 | Comunicación cross-module → `emit`/`on`/`query` (documentar evento nuevo) |
| 5 | Si lee teclas → `keyJustPressed(vk)` de `core/gsis_Input.js`, **nunca** `Pad.IsKeyJustPressed` |
| 6 | Si tiene menú → `registerMenuSource("nombre", getter)` en su `init`. Con eso ya queda modal, con cursor y con el player congelado, sin tocar el bridge |
| 7 | Agregar **solo** `import "./IronSyndicate/modules/gsis_Nombre.js";` en `[fs][mem]gsis_index.js` (orden correcto) |
| 8 | Actualizar árbol en `gsis_ARCHITECTURE.md` y `gsis_README.md` |
| 9 | Ejecutar checklist §1 |

**No** importar el módulo desde otro módulo. **No** duplicar constantes.
**No** registrar un menú "en `computeVisible()`": esa lista se hugó, cada módulo
publica su visibilidad y el OR sale solo. Ver
[gsis_INPUT.md §8](./gsis_INPUT.md).

> Un atajo que la página también maneja no va a funcionar nunca: con el puntero
> sobre el panel el juego no ve la tecla. Si el atajo es para gameplay, se
> ejecuta con el puntero afuera; si es de la UI, lo maneja `app.js`.

---

## 4. Cómo refactorizar sin romper

1. Identificar dependencias reales (grep de imports y `query`/`emit`)
2. Mantener API pública estable o actualizar **todos** los consumidores en el mismo cambio
3. No mezclar refactor + feature en un commit
4. Después de cada paso: `node --check` + grep §1
5. Probar en juego (hot reload) si toca: teclas 1/2/3/O/I/R, save F5, baúl

---

## 5. Deuda técnica — política

| Tipo | Acción |
|---|---|
| Import/export sin uso | **Borrar** en el mismo cambio que lo deja huérfano |
| Constante duplicada vs Config | Mover a Config (o importar) |
| Docs que mencionan archivos inexistentes | Actualizar doc en el mismo PR |
| API "por si acaso" sin consumidor | **No crear** — crear cuando se use |
| `catch (e) {}` en natives CLEO | Permitido (patrón deliberado); comentar si el catch es no-obvio |
| Eventos documentados sin emitir | Permitido solo si están en §3.3 como "pendientes" con dueño claro |
| Romper el límite del runtime (CEO/ASI) desde el mod | **Prohibido.** Un límite de la ASI o del motor se resuelve en el runtime y con su propio freeze de API, no con un rodeo en el mod |

**Prohibido**: agregar features "porque quedó fácil" durante un refactor. Roadmap manda.

---

## 6. Sincronización de documentación

| Si cambias… | Actualiza también… |
|---|---|
| Archivos/árbol de carpetas | `gsis_ARCHITECTURE.md` §1, `gsis_README.md` estructura |
| API de SaveManager/EventBus/Config | `gsis_ARCHITECTURE.md` §3 |
| Eventos EventBus | `gsis_ARCHITECTURE.md` §3.3 (tabla en uso) |
| Strings / localización | `gsis_L10N.md` + `gsis_lang_data.js` + `CLEO_TEXT\gsis.fxt` + `CLEO_TEXT\gsis_dialog.fxt` |
| Personajes / topics de diálogo | `gsis_CHARACTERS.md` + `gsis_character_data.js` |
| Anims de actores | `gsis_ACTORANIMS.md` + `gsis_actor_anim_data.js` |
| Módulos/orden de update | `gsis_ARCHITECTURE.md` §4 |
| Teclas / distancias | `gsis_Config.js` → reflejar en §3.2 si es nuevo |
| Milestones roadmap | `gsis_ROADMAP.md` (estado ✅/⏳/❌) |
| Patrón UI / **página web** | [gsis_WEBUI.md](./gsis_WEBUI.md), [gsis_UIDESIGN.md](./gsis_UIDESIGN.md) |
| Patrones de UI anteriores | **Eliminados.** La UI es web: todo lo de la UI esta en [gsis_WEBUI.md](./gsis_WEBUI.md) |
| Contrato con el runtime SAWeb | [SAWEB_API.md](C:\Dev\SAWebUI\docs\SAWEB_API.md), [GUIA_WEB_CEF_ASI.md](C:\Dev\SAWebUI\docs\GUIA_WEB_CEF_ASI.md) |
| Flujo de items/inventario | `gsis_INVENTORY.md` (diseño) + código real en § ejemplo |

Docs de **diseño** (ECONOMY, PROPERTIES, VEHICLES, BANKING, MAPPROGRESSION) describen el target; el código real manda. Si divergen, marcar en la doc: *"Diseño — no implementado"*.

---

## 7. Estado actual (referencia rápida)

| Área | Estado |
|---|---|
| Fase 0 — Setup + migración `core/modules/ui/data` | ✅ |
| Fase 1 — Prototipo (items, propiedades, baúl, UI) | ✅ en juego |
| Dealer mayorista + retiro de pedidos | ✅ en juego · **menú sin renderer** (ver abajo) |
| Punto de venta / trueque NPC | ✅ en juego · **menú sin renderer** (ver abajo) |
| Actores (dealer + seller, EventBus) | ✅ en juego · guía [gsis_ACTORS.md](./gsis_ACTORS.md) |
| Anims actores (IFP vanilla, `idleAnim`, `anims:*`) | ✅ en juego · guía [gsis_ACTORANIMS.md](./gsis_ACTORANIMS.md) |
| Personajes (nombre + diálogos + actor) | ✅ en juego · guía [gsis_CHARACTERS.md](./gsis_CHARACTERS.md) |
| Modelos especiales custom (sin reemplazar vanilla) | ✅ en juego · guía [gsis_ACTORS.md](./gsis_ACTORS.md) §Mini-Guía |
| Spots / esferas (N por tipo) | ✅ en juego · guía [gsis_SPOTS.md](./gsis_SPOTS.md) |
| Localización es/en (`t()`, 115 keys) | ✅ en juego, con 2 excepciones de datos (ver abajo) |
| UI web CEF (panel de inventario) | ✅ en juego · guía [gsis_WEBUI.md](./gsis_WEBUI.md) |
| HUD overlay | ❌ Descartado (solo inventario) |
| Menús de baúl / dealer / retiro / trueque | ⏳ **Flags sin renderer**: los 4 módulos exportan `isXxxMenuVisible()` y nadie lo consume |
| Pestañas Propiedades / Vehículos en la UI web | ⏳ Rows placeholder |
| Canal de retorno UI → CLEO (acciones) | ✅ **SAWeb v2** — equipar / cinturon / tirar. `takeCommand` + `cmd:` · [gsis_WEBUI.md §7](./gsis_WEBUI.md) |
| Acciones de dealer / propiedades desde la página | ⏳ Sin comando: dependen de los overlays, que no tienen renderer |
| EventBus clúster vehículos | ✅ en uso |
| Deuda técnica código existente | ⚠️ **No limpia.** Ver abajo |
| Fase 2+ — Economía, banco, map progression | ⏳ Pendiente (roadmap) |

### Deuda conocida (verificada contra el codigo)

Lo que se resolvió en la limpieza de la UI web (26/09) salió de esta tabla:
catálogo replicado en la página, tipos de item replicados, MAX_INVENTORY_WEIGHT
duplicado, canales inexistentes en INBOUND, código muerto (EMIT_THROTTLE_MS,
lastEmitAt, getRowState(), `tick()` vacío), #title fijo y KEY_ESC
hardcodeado. Y con la v2, los keycaps sin tecla: la `X` y el pie ahora mandan
comandos de verdad.

| Deuda | Donde | Nota |
|---|---|---|
| `GSIS_MENU` con 9 chars | `data/gsis_lang_data.js:245` | Rompe el check 7 y no esta en ningun FXT § check 8 da `MISMATCH (115 vs 114)`. El log lo advierte en cada arranque |
| 54 claves de idioma sin usar | `data/gsis_lang_data.js` | Restan de los menus de ImGui que se fueron. `check_imports.mjs` las lista; se limpian si no vuelven |
| Errores de transporte invisibles en pantalla | `UI/app.js` | `_diag()` va a `console`; sin devtools no hay caja de estado en el DOM. El `notice` cubre el caso que mas duele (una accion que falla) |
| CSS huerfano | `UI/style.css` | `.row` / `.meter*` (~130 lineas) quedaron sin consumidor cuando la tabla reemplazo al par lista+barra; tambien `.badge--*`, `.btn-action`, `.navbtn` |
| Archivos `.bak` en el root servible | `UI/*.bak` | Incluido un `index.html.bak` que la ASI podria cargar por URL |
| `logo_yeiko_v1.png` sin referenciar | `UI/assets/` | 14 KB sin uso |
| Paths de esta guia desactualizados | 7 docs | `gsis_SETUP/ TESTING / L10N / SPOTS / ACTORS / ACTORANIMS / CHARACTERS` |
| Menu contextual ausente en los 4 menus de esfera | `UI/app.js` | El click derecho es del inventario. La barra de accion cubre el caso comun; si hace falta, `PANTALLAS[id].ctx` es el lugar |
## 8. Comandos útiles

```powershell
# Verificar sintaxis (mod + pagina web)
$mod = "modloader\IronSyndicate\cleo\IronSyndicate"
node --check "modloader\IronSyndicate\cleo\[fs][mem]gsis_index.js"
node --check "$mod\core\gsis_Input.js"
node --check "$mod\modules\gsis_WebInterface.js"
node --check "modloader\IronSyndicate\UI\app.js"

# Suite del runtime (superficie de API congelada + getter de input en C++ real)
cd C:\Dev\SAWebUI; node tests\run.js

# Buscar imports prohibidos entre módulos
Select-String -Path "$mod\modules\*.js" -Pattern '\.\./modules/'

# Buscar uso de una API
Select-String -Path "$mod\**\*.js" -Pattern 'addItem\('

# Contar archivos JS
(Get-ChildItem -Path $mod -Recurse -Filter *.js).Count

# Suite del runtime SAWeb (shim embebido + facade)
cd C:\Dev\SAWebUI; node tests\run.js

# Los cuatro checks del contrato pagina↔mod (viven en el temp, no son del mod)
cd $env:TEMP\opencode
node check_render.mjs      # corre el app.js en un DOM falso y compara el render
node check_pantallas.mjs   # comandos en los dos sentidos, ids de flujo, claves de fila, clases de CSS
node check_imports.mjs     # imports rotos, imports sin usar, ciclos, claves de t() inexistentes
node check_icons.mjs       # WEB_ICONS contra ITEMS, PNGs que faltan, magazine vs magId
```

Los checks son la red que cubre lo que `node --check` no ve: que el render
diga lo que tiene que decir, que los nombres de comando coincidan de los dos
lados y que una fila no se dibuje con una columna que el mod ya no manda. Los
cuatro responden con salida 0 cuando todo esta bien.

---

## 9. Errores clásicos (evitar)

| Error | Cómo evitarlo |
|---|---|
| Módulo importa módulo | Grep §1.2 antes de commit |
| Tecla/distancia hardcodeada | Importar de `Config` |
| Agregar feature en refactor | Separar commits; roadmap manda |
| Doc desactualizada | Checklist §6 en el PR |
| Export sin consumidor | Borrar o justificar en §5 |
| Parchear un límite del runtime desde el mod | Ir al runtime (§5) |
| Declarar en la página un evento que el bridge no manda | `INBOUND` se deriva de lo que `gsis_WebInterface.js` envía, no al revés |
| Que la página mande un `cmd:` que el mod no atiende | `check_pantallas.mjs`. No hay error en ninguna parte: el comando no hace nada y en el log tampoco dice nada, salvo el `comando desconocido` que se loguea una sola vez |
| Que el mod atienda un comando que nadie manda | Es el mismo check, al revés: un `case` sin emisor es código muerto |
| Copiar la fila de la tabla para una pantalla nueva | Importar `itemRow` de `gsis_ItemRow.js`. Las reglas de la fila divergen calladas |
| Que la página calcule un peso, un precio o una capacidad | El snapshot puede tener 400 ms. El módulo valida y avisa |
| Consumir el aviso antes de saber si se manda | `takeNotice()` va en `pushScreen()`, después del throttle. Si se consume en el comando, el throttle se lo come |
| Agregar una columna a una pantalla y olvidar el `.table--N` | El número del modificador ES el de `cols.length`: `renderTablaEn()` lo pone solo, pero la variante tiene que existir en el CSS |
| Que dos funciones escriban la misma clase del mismo elemento | Cada clase tiene **un** dueño. `#panel` la decide `setPanelVisible()`; las secciones de flujo, `setPantalla()`. El síntoma es siempre el mismo: un `if` con early-return deja de hacer su parte y la otra función sigue escribiendo sobre el resultado |
| Confiar en que un check verde demuestra que el check muerde | Reintroducir el bug en una copia y verlo fallar. Un check que pasa con y sin el arreglo no está probando el arreglo (§1) |
| Que el stub de un check no tenga reloj | Si el código depende de `setTimeout`, el stub lo corre. Sino el test mide el stub, no el juego — y falla al revés: marca como roto lo que funciona |
| Tocar el teclado desde el camino del mouse | En la ASI, `PCTempKeyState` y `PCTempMouseState` son structs **vecinos** del mismo `CPad`. Si el bloqueo del mouse los alcanza, el juego deja de ver `W` y un menú que se cerrara alejándose sería un soft-lock: sin error, sin build roto, sin ningún test previo. `mouse_block_harness.js` tiene un bloque que falla si el código del bloqueo siquiera los **menciona** |
| Medir la transición de un menú contra su flag de visibilidad | El flag ya puede venir en `false`: el cierre por tecla lo hace el bridge, que corre **después** de todos los módulos. La transición se mide contra lo que el módulo publicó en su update anterior (`_sawOpen`). Con el flag, cerrar con la `ESPACIO` no apagaría la esfera y la cooldown no se dispararía. Ver [gsis_SPOTS.md §4](./gsis_SPOTS.md) |
| Grep de un campo que el propio código comentario | El harness estático borra comentarios antes de buscar. Sin eso da el resultado inverso al que uno quiere, porque el código correcto nombra `PCTempKeyState` en el comentario que explica por qué no lo toca |

---

Ver también: [gsis_ARCHITECTURE.md](./gsis_ARCHITECTURE.md) · [gsis_ROADMAP.md](./gsis_ROADMAP.md) · [gsis_TESTING.md](./gsis_TESTING.md)
