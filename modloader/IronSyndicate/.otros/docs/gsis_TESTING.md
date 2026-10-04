# GSIS — Testing y Debugging

Guias de prueba, debugging y prevencion de crashes.

Ver tambien: [gsis_MAINTENANCE.md](./gsis_MAINTENANCE.md) — checklist pre-commit y politica de deuda.
Ver tambien: [gsis_ACTORS.md](./gsis_ACTORS.md) — sistema de actores (spawn, tasks, EventBus).
Ver tambien: [gsis_SPOTS.md](./gsis_SPOTS.md) — esferas (dealer/seller/pickup, gate interior, cooldown al cerrar).
Ver tambien: [gsis_L10N.md](./gsis_L10N.md) — localización es/en, claves GXT/FXT, subtítulos 00BB.

Ver tambien: [gsis_CHARACTERS.md](./gsis_CHARACTERS.md) — personajes (nombre + diálogos + actor).

---

## 1. Hot Reload

### Como Probar Cambios

1. Editar el archivo `.js` correspondiente
2. Guardar el archivo
3. Volver al juego y jugar unos segundos
4. Revisar `cleo_redux.log` para errores
5. Los cambios se aplican automaticamente

### Limitaciones del Hot Reload

- No recarga `mod.json` (requiere reiniciar)
- No recarga archivos `.json` de config (si se importan via ESM)
- Los handles de vehiculos/peds no se actualizan automaticamente

---

## 2. Verificacion Rapida (antes de probar en juego)

```powershell
# Sintaxis de todos los .js (mod + pagina web)
$mod = "modloader\IronSyndicate\cleo\IronSyndicate"
$ui  = "modloader\IronSyndicate\UI"
$all = @(Get-ChildItem -Path $mod -Recurse -Filter *.js) + @(Get-ChildItem -Path $ui -Filter *.js)
$ok = $true
foreach ($f in $all) { node --check $f.FullName; if (-not $?) { $ok = $false; Write-Output "FAIL $($f.FullName)" } }
if ($ok) { Write-Output "ALL OK ($($all.Count))" }

# Imports prohibidos entre modulos
Select-String -Path "$mod\modules\*.js" -Pattern 'from ["'']\.\./modules/'

# Sin showTextBox hardcodeado
Select-String -Path "$mod\**\*.js" -Pattern 'showTextBox\(["'']~'

# Sin console.log / debugger en el mod (usar log() de CLEO)
Select-String -Path "$mod\**\*.js" -Pattern 'console\.(log|debug)|debugger'

# STRINGS == FXT (gsis.fxt + gsis_dialog.fxt)
$es = (Select-String -LiteralPath "$mod\data\gsis_lang_data.js" -Pattern '^\s{4}[A-Z0-9_]+:' -AllMatches).Matches.Count
$fxt = (Select-String -Path "modloader\IronSyndicate\cleo\cleo_text\gsis.fxt","modloader\IronSyndicate\cleo\cleo_text\gsis_dialog.fxt" -Pattern '^[A-Z0-9_]+ ' -AllMatches).Matches.Count
if ($es -eq $fxt) { "STRINGS == FXT ($es)" } else { "MISMATCH ($es vs $fxt)" }

# La pagina no reescribe el shim, ni el tick sin guardar
Select-String -LiteralPath "$ui\app.js" -Pattern 'window\.SAWeb\s*='

# La pagina no duplica el catalogo del mod (el bloque MOCK_CATALOG queda excluido)
$js = Get-Content -LiteralPath "$ui\app.js" -Raw
$jsSinMock = [regex]::Replace($js, '(?s)const MOCK_CATALOG = \{.*?\r?\n\};', '')
Select-String -InputObject $jsSinMock -Pattern 'MAX_INVENTORY_WEIGHT|\.png["'']'

# Keys L10n <=7  (hoy GSIS_MENU falla: ver gsis_L10N.md)
Select-String -LiteralPath "$mod\data\gsis_lang_data.js" -Pattern '^\s{4}([A-Z0-9_]{8,}):'

# Suite del runtime SAWeb (shim embebido + facade + superficie de API + getter de input)
cd C:\Dev\SAWebUI; node tests\run.js
```

Los tres checks siguientes son del subsistema de input y los agrega
[gsis_INPUT.md §9](./gsis_INPUT.md). Salen vacios cuando esta todo bien:

```powershell
# Nadie lee teclas por su cuenta
Get-ChildItem -Path $mod -Recurse -Filter *.js |
  Where-Object { $_.Name -ne 'gsis_Input.js' } |
  Select-String -Pattern 'Pad\.IsKeyJustPressed|isKeyPressed\('

# La pagina no mantiene estado de input propio
Select-String -LiteralPath "$ui\app.js" -Pattern '\bfocused\b|\binputOn\b'

# Cada export de gsis_Input tiene consumidor
$inp = "$mod\core\gsis_Input.js"
$exp = (Select-String -LiteralPath $inp -Pattern '^export function (\w+)' -AllMatches).Matches | ForEach-Object { $_.Groups[1].Value }
$exp | ForEach-Object {
    $n = (Get-ChildItem -Path $mod -Recurse -Filter *.js |
            Where-Object { $_.FullName -ne $inp } |
            Select-String -Pattern ("\b" + $_ + "\b") -AllMatches | Measure-Object).Count
    if ($n -eq 0) { "SIN USO: " + $_ }
}
```

### Los checks: donde viven y cuales muerden

Hay dos conjunto, y estan en lugares distintos a proposito.

| Conjunto | Donde | Cuando lo corres |
|---|---|---|
| **Del repo** (3) | `.IronSyndicate\tools\` | Antes de commitear. Son los unicos que el repo garantiza |
| **Del temp** (8) | `%TEMP%\opencode\` | Cuando se toca la UI o el render. Son herramientas de desarrollo, no archivos que el juego carga |

Los tres del repo:

| Check | Que cubre |
|---|---|
| `check-dat.mjs` | Que las variantes, el `.dat` y el `.asi` digan lo mismo. Cruza `FAMILIAS[].variantes` y `CARGADORES` de `data/gsis_weapons.js` contra el archivo real: que cada variante tenga fila, que el `clip` coincida, que la derivación de `tipoDe()` sea **reversible**, que toda combinación de (balas, silenciador) tenga variante, y que **todo item tenga icono y el PNG exista** |
| `check-migration.mjs` | Que los migradores del save sigan funcionando: corre `migrateSave()` sobre saves de cada version y verifica que el resultado sea el de la version actual |
| `check-ui-flow.mjs` | **Las cuatro configuraciones de un arma desde el flujo real**: pagina → `ui/commands.js` → `weapons/logic.js` → bus → motor, con `fake-engine.mjs` en lugar de GTA. Y que `weapons/` e `inventory/` no se importen entre si |

```powershell
cd <gta>\.IronSyndicate
node tools\check-dat.mjs
node tools\check-migration.mjs
node tools\check-ui-flow.mjs
```

Los tres de **`prueba-*.mjs` y `check-chamber.mjs`**, que son los del
comportamiento del motor y **no son opcionales**: los tres bugs de cargadores de
septiembre aparecieron en la R y en el intercambio del cinturon, y ninguno lo
agarraba `node --check`.

| Check | Que cubre |
|---|---|
| `prueba-ciclo-r.mjs` | El ciclo de la R completo, contando **piezas y balas** en cada paso. Incluye el bloque `EL CARGADOR DE FABRICA`: que no se fabrique, que no se pierda, y que con balas en el arma vuelva al cinturon con las suyas |
| `prueba-descarga.mjs` | Que descargar un cargador conserve el par `clip == total` en todos los estados |
| `check-chamber.mjs` | La recamara como estado persistente: las reglas 1 a 4, la forma del campo, el viaje por el inventario, y que guardar/cargar no cree ni pierda balas |
| `revision-camara.mjs` | **No es un gate: informa.** Los huecos de acotado que `check-chamber` no cubre —que `chamber.ammo` no esta acotado a 1, y que el id de la camara no se valida contra la familia— mas la verificacion de que el `+1` de la capacidad llega al `.dat` |

El conteo de piezas es el dato clave: un inventario que **crece** es un item que
se fabrica, y eso casi siempre es un `e.respond` que falta o una pieza que se
devuelve dos veces.

```powershell
node tools\prueba-ciclo-r.mjs
node tools\prueba-descarga.mjs
node tools\check-chamber.mjs
node tools\revision-camara.mjs    # informe de huecos, sale 0 siempre
```

Los ocho del temp:

```powershell
cd $env:TEMP\opencode
node check_weapons.mjs
node check_reconcile.mjs
node check_render.mjs
node check_pantallas.mjs
node check_imports.mjs
node check_icons.mjs
node check_smoke_mod.mjs
node check_scope.mjs
```

Los cinco primeros verifican **contratos entre archivos** —que un nombre coincida
de los dos lados, que una clase exista en el CSS, que un import apunte a algo
real—, y un contrato puede estar perfecto mientras el codigo no corre.

> **Estado real (medido el 30/09/2026): de los ocho del temp, dos pasan.**
>
> | Check | Estado | Por que |
> |---|---|---|
> | `check_scope.mjs` | ✅ pasa | 58 archivos, ningun nombre sin resolver |
> | `check_render.mjs` | ✅ pasa | modo juego y modo preview |
> | `check_weapons.mjs` | ❌ no arranca | busca la tabla vieja `WEAPON_DATA`, que ya no existe |
> | `check_icons.mjs` | ❌ no arranca | idem: `no encontre WEAPON_DATA` |
> | `check-dat.mjs` | ✅ corre | `node .IronSyndicate\tools\check-dat.mjs` cruza el `.dat` contra `FAMILIAS[].variantes`, `CARGADORES` y `SILENCIADORES`, y además verifica que todo item tenga línea en `WEB_ICONS` y que el PNG exista. **No** dice si el modelo se ve |
> | `check_reconcile.mjs` | ❌ no arranca | intenta copiar `modules/gsis_Ballistic.js`, que ya no existe |
> | `check_smoke_mod.mjs` | ❌ no arranca | `ENOENT` copiando `modules/gsis_WebInterface.js` |
> | `check_pantallas.mjs` | ❌ no arranca | `ENOENT` sobre `modules/gsis_WebInterface.js` |
> | `check_imports.mjs` | ⚠️ corre, con ruido | ver abajo |
>
> Los cinco que no arrancandied de los checks que el refactor de `weapons/` e
> `inventory/` dejo apuntando a archivos que se renombraron. **No son bugs del
> mod** —los tres del repo pasan—: son checks que quedaron atrasados. Lo que
> perdio cobertura mientras tanto es real: `_reconcileLoadout()` ya no tiene un
> test que lo ejercite frame a frame, y eso es lo que mas caro sale si se rompe.
>
> `check_imports.mjs` sí corre, y su salida hay que saber leerla: de 13 fallas,
> **11 son falsos positivos** de su resolucion por regex, que no ve el
> `export * from "./gsis_weapons.js"` de un shim que ya no existe. Las
> otras dos son **reales** y son deuda de la casa ("import sin usar -> borrar en
> el mismo cambio"):
>
> - `modules/inventory/logic.js` importa `getItems` y no lo usa
> - `modules/weapons/reconcile.js` importa `familyOfItem` y no lo usa
>
> Y sus 56 "claves sin usar" son en su mayoria labels de la pagina, que se
> traducen del otro lado (ver [gsis_WEBUI.md §9](./gsis_WEBUI.md), pendiente 4).

#### Los dos checks que derozen: congelar y reproducir

`check_weapons.mjs` y `check_reconcile.mjs` se sostienen el uno al otro, y son de
otra clase que los otros seis.

Los otros verifican **contratos**: que dos archivos se pongan de acuerdo. Esos
dos verifican **comportamiento con el tiempo**: que el reconciliador siga
haciendo lo correcto frame a frame, con estado acumulado, y que un dato del
catálogo no se mueva sin que nadie lo decida.

Un contrato puede estar perfecto mientras el codigo no corre, y un dato puede
moverse sin romper ningun contrato. Por eso los dos tienen la misma regla que el
resto: **hay que comprobar que muerden.**

- `check_weapons.mjs` acepta `GSIS_ROOT` para correr contra una copia de los
  `data/`. Se copia la tabla, se le cambia el `clipSize` del M4 de 50 a 30, y el
  check tiene que fallar en las tres cosas que eso mueve: el arma, la capacidad
  que de ahi deriva el cargador, y el valor lleno.
- `check_reconcile.mjs` acepta `GSIS_BALLISTIC` y `GSIS_WEAPON_DATA` para correr
  contra modulos o datos alternativos. Se copia el archivo, se le saca la
  rama que separa las armas de plugin, y el check tiene que fallar en los casos
  que dependian de ella. Lo mismo con los datos: se le devuelve la
  regla de capacidad vieja, y el check tiene que fallar en el caso que depende de
  que `capacity` gane sobre el prefijo.

Que un check pase no dice que el codigo este bien: dice que el check esta mirando
donde cree. Y un caso que sigue verde con el arreglo deshecho es un caso que no
esta mirando nada: el primer version de `CASO 7a` le daba a la variante `clipSize`
**y** `capacity`, asi que la regla vieja tambien daba 75 por el prefijo y el test
pasaba sin comprobar nada. Ver tambien `gsis_WEAPONS.md`, que es lo que estos dos
congelan.

> **Los dos estan caidos** (ver la tabla de arriba), y con ellos se perdio lo que
> esta seccion.Exists para vigilar: la foto de la tabla de armas y el
> reconciliador. El equivalente que **si** corre hoy es
> `tools/check-ui-flow.mjs`, que no congela el `.dat` pero si congela el
> comportamiento del flujo de armar y recargar. Cuando se reparen, las dos
> variables de entorno hay que reapuntar: `GSIS_BALLISTIC` ahora es
> `modules/weapons/reconcile.js` y `GSIS_WEAPON_DATA` es
> `data/gsis_weapons.js` (no el shim, que ya no tiene la tabla).


#### Que hace el smoke test y por que no alcanza con los otros

Carga el modulo con stubs, registra una fuente de menu como hace cada modulo de
esfera, y le corre `update()` apretando la `I` de verdad —el estado del panel se
maneja por la tecla, no seteando el flag por dentro, porque un test que setea el
flag se esta probando a si mismo.

Lo que verifica sale por las costuras reales, no por flags internos:

| Se verifica | Por donde se mira |
|---|---|
| El freeze y su polaridad | el native `SET_PLAYER_CONTROL` |
| El cursor | `SAWeb.setCursor` |
| Las teclas de juego | el CSV que el mod le pasa al runtime |
| Que panel ve la pagina | el `flow` del `uistate` |

Con eso cubre las dos reglas de [gsis_UIDESIGN.md §3.1](./gsis_UIDESIGN.md): que la `I`
no abra el inventario con un flujo abierto, que un flujo con el panel abierto no
tome la pantalla, y que con un flujo abierto el mod pida `87,65,83,68` y **no**
congele al player.

El `native()` del passthrough **tira a proposito** en el stub, que es lo que pasaba
en el juego: el facade era v4 y la declaracion en `sa.json` seguia en v3. Con eso
tambien verifica que el mod lo aguante, avise **una** vez, y siga funcionando.

> Que muerde se verifica reintroduciendo el bug: se le deshace el arreglo a una
> copia del modulo y el test tiene que fallar con el mismo mensaje del juego
> (`flow is not defined`). Un test que no falla cuando se rompe lo que vigila no es
> un test.

#### El render test y los timers: el stub no corre el reloj

`check_render.mjs` corre el `app.js` real en un DOM falso, y su `setTimeout` **solo
apila los callbacks en un array: no los ejecuta**. El navegador sí corre el reloj, así
que el stub no modela al juego justo en lo que el juego hace.

Eso se sintió con el caso que destapó el panel fantasma. `setPanelVisible(false)` no
apaga el panel en el momento: le pone `panel--closing` y **programa el apagado para
200ms después**, que es la animación de salida. Con el timer sin correr, el test veía
un panel que en el juego lleva 200ms apagándose, y daba por roto algo que funcionaba.

Por eso el sandbox expone `sandbox._flush()`, que corre los timers pendientes (y
vuelve a correrlos, porque un timer puede encolar otro). Y por eso las asserts van
**después** del flush: lo que ve el jugador es el panel ya apagado.

```js
sandbox._handlers.uistate({ menu: false, anyMenu: false, flow: "" });
sandbox._flush();
check(doc.getElementById("panel").classList.contains("hidden"),
  "con menu:false el panel se apaga, aunque no haya flujo");
```

**El orden importa y por eso el caso existe dos veces.** Con el bug, la primera
asert pasaba y la segunda fallaba: el primer `menu:false` programa el timer y el
flush lo apaga; el segundo no programa nada (el panel ya tiene `hidden`) y es
justo ahí donde la otra función lo volvía a prender. Un solo `menu:false` no
alcanzaba para verlo. Ver [gsis_UIDESIGN.md §3.1](./gsis_UIDESIGN.md).

> Regla general para estos checks: si el código under test depende del reloj, el
> stub tiene que tener reloj. Un check que pasa porque el timer nunca corrió está
> midiendo el stub, no el juego.

> `check_icons.mjs` copia los `data/` a una carpeta espejo del temp para poder
> importar los modulos sin el juego. Si se edita un `data/*.js` hay que volver a
> copiarlo (`Copy-Item` sobre `gsischk\data\`), si no el check corre contra la
> version vieja y no se entera.

**Esa nota quedo vieja, y conviene no creerla.** Hoy los checks leen los `data/`
reales: la carpeta `gsischk\` de `%TEMP%\opencode` es un resto sin una sola
referencia y se puede borrar sin que nada se entere. Los checks que si copian
archivos —`check_reconcile.mjs`, y el smoke test— arman un temporal nuevo en cada
corrida, asi que nunca corren contra una version vieja. Lo que si hay que
recordar es al reves: si un check se pone a leer una copia, hay que acordarse de
refrescarla, y por eso `check_weapons.mjs` acepta `GSIS_ROOT` y
`check_reconcile.mjs` acepta `GSIS_BALLISTIC` para poder correr contra lo que uno
le pase a proposito. (Los dos estan caidos: ver la tabla de arriba.)

### El preview sin juego

Antes de abrir GTA, la página se puede revisar en un navegador normal. Sin
puente arranca con el mock y **con un menú de esfera abierto**, que es el panel con
la tabla más interesante para revisar:

```
modloader\IronSyndicate\UI\index.html?flujo=trunk      ← por defecto
modloader\IronSyndicate\UI\index.html?flujo=dealer
modloader\IronSyndicate\UI\index.html?flujo=seller
modloader\IronSyndicate\UI\index.html?flujo=pickup
```

Lo que el preview **no** prueba: que el id exista, que la cantidad entre, y los
precios. Eso lo valida el mod y el preview no lo ejecuta.

---

## 3. Comandos de Debug (API real)

### Dinero

```javascript
import { getCleanMoney, setCleanMoney, setDirtyMoney } from "../core/gsis_SaveManager.js";

setCleanMoney(1000000);
setDirtyMoney(500000);
```

### Items (tecla L = debug)

```javascript
import { addItem, getItems, getTotalWeight, entregaOpts } from "../modules/inventory/index.js";

addItem("colt45", 1, entregaOpts("colt45"));          // arma desnuda, sin cargador
addItem("mag_colt45", 1, entregaOpts("mag_colt45"));  // cargador base, LLENO
addItem("scrap_metal", 5);
// En juego: la tecla L agrega las tres cosas de arriba (arma desnuda + cargador
// base + cargador extendido) y 5 de chatarra. Va con entregaOpts a proposito:
// colgado del default de addItem, probar el inventario daria un arma con
// municion que en el juego nunca se ve.
```

### Propiedades

```javascript
import { buyProperty, listProperties } from "../modules/gsis_PropertyModule.js";
buyProperty("taller_ganton");
```

### Localización

```javascript
import { t, getLang, hasKey } from "../core/gsis_L10n.js";
t("INV_FUL");                       // string del idioma LANG.DEFAULT
t("MON_LOW", { n: 500 });           // con params
hasKey("TRK_FUL");                  // true si existe en STRINGS
// Ver gsis_L10N.md
```

### Guardado

```javascript
import { saveGame, loadGame, getActiveSlot } from "../core/gsis_SaveManager.js";
saveGame(getActiveSlot());   // o tecla F5 en juego
```

### Vehiculo de prueba

```javascript
const testCar = Car.Create(482, 2447, -1690, 13.5);
```

### Simular Cambio de Dia (para probar nomina — futuro)

```javascript
native("SET_TIME_OF_DAY", 23, 55);
```

### Activar Trace de Opcodes

```javascript
CLEO.debug.trace(true);   // logging detallado en cleo_redux.log
CLEO.debug.trace(false);
```

---

## 4. Errores Comunes

### Olvidar wait(0)

```javascript
// MAL - Bloquea el juego
while (true) {
    updateHUD();
}

// BIEN - Cede control
while (true) {
    updateHUD();
    wait(0);
}
```

### Handle de Vehiculo Invalido

```javascript
// MAL - No verifica si el vehiculo existe
function badExample(car) {
    car.setHealth(1000);
}

// BIEN - Verifica antes de usar
function goodExample(car) {
    var exists = false;
    try { exists = native("DOES_VEHICLE_EXIST", car); } catch (e) { }
    if (exists) car.setHealth(1000);
}
```

### Division por Cero

```javascript
const ratio = maxWeight > 0 ? weight / maxWeight : 0;
```

### Array Vacio

```javascript
const first = items.length > 0 ? items[0].id : null;
```

### Objeto No Definido

```javascript
const prop = PROPERTY_DATA[propertyId];
if (!prop) return false;
```

### Import entre modulos (prohibido)

```javascript
// MAL — dos modulos hablando por import
import { isTrunkOpen } from "./gsis_Trunk.js";

// BIEN - EventBus
import { on, query } from "../core/gsis_EventBus.js";
var open = query("spawner:isSpawning", {});
```

Y lo que **no** es un error, para no "arreglarlo" por reflejo:

```javascript
// BIEN — los archivos de un MISMO paquete se importan entre si
import { getItems } from "../inventory/state.js";        // dentro de inventory/

// BIEN — el dueno de un menu exporta su puerta, y el bridge la llama
import { putInTrunk } from "../gsis_Trunk.js";          // desde ui/commands.js

// MAL — inventory/ y weapons/ NO se pueden nombrar entre si
import { ITEMS_TAKE_WEAPON } from "../inventory/events.js";   // desde weapons/
```

La tercera es la unica que esta **verificada**: `tools/check-ui-flow.mjs` lee los
archivos de las dos carpetas y falla si alguna menciona a la otra, y ademas prueba
que el contrato funcione de verdad. Ver
[gsis_ARCHITECTURE.md §1](./gsis_ARCHITECTURE.md) y
[gsis_CONTRATOS.md](./gsis_CONTRATOS.md).

### El sintoma esta en el juego y la causa esta en el log

Este es el error de proceso mas caro que tiene el proyecto, asi que va aqui y no
en un comentario suelto: **cuando algo falla en el juego, se lee el log antes de
tocar una linea de codigo.**

Paso de verdad, y fue una sesion entera. El sintoma era "el teclado sigue
bloqueado con el menu de esfera abierto". La causa eran **dos** bugs, ninguno
visible desde el sintoma:

```text
[WARN] Plugin attempted to register an unknown command SAWEB_SET_KEY_PASSTHROUGH.
       Check your sa.json file.
[ModuleRegistry] Error en update de WebInterface: Command ... not found     13 veces
[ModuleRegistry] Error en update de WebInterface: 'flow' is not defined   3138 veces
```

El primero: `SAWEB_SET_KEY_PASSTHROUGH` no estaba declarado en
`cleo\.config\sa.json`, asi que `native()` tiraba. El segundo: un
`ReferenceError` mio, 3138 frames seguidos. Los dos estaban a la vista en la
primera linea de la busqueda, y se gastaron dos cambios de codigo —uno en C++,
otro en el shim— sin mirar ninguno de los dos archivos.

```powershell
# Lo primero, siempre
Get-Content 'C:\Program Files\GTA SA\cleo_redux.log' -Tail 80
Get-Content 'C:\Program Files\GTA SA\cleo.log' -Tail 40
```

Tres reglas que hacen que el log sea legible:

- **Un error por frame se loguea una vez y despues se cuenta.** `update()` corre
  a 60 Hz, asi que un modulo que tira deja 3000 lineas identicas en cinco
  minutos. 3138 copias del mismo `ReferenceError` taparon el otro error, que era
  el que importaba. `gsis_ModuleRegistry.js` ahora avisa la primera vez, la
  segunda con "(2 veces)", y despues cada 600. El modulo que se queja **sigue
  corriendo**: puede ser transitorio, y uno que se deja de llamar es peor que
  uno que se queja.

- **Un error repetido no es ruido, es el dato.** Si el log tiene `Error en update
  de` con un numero alto, ese modulo esta muerto desde el primer frame. Todo lo
  que se pruebe despues de ese punto es ruido, porque el per-frame se corta en la
  excepcion.

- **Un sintoma que no apunta a su causa hay que buscarlo en el log del otro
  lado.** El sintoma era del teclado y la causa estaba en el runtime, un proyecto
  y tres archivos de distancia.

### Un comando del runtime sin declarar rompe el per-frame

Es el caso concreto del bug anterior, y tiene su propia forma:

```text
[WARN] Plugin attempted to register an unknown command SAWEB_SET_KEY_PASSTHROUGH.
       Check your sa.json file.
```

El plugin registra sus comandos igual —el `.cleo` no sabe que esta declarado—, pero
`native()` tira `Command with the name ... not found`. Si eso pasa en el per-frame
de un mod, se muere 60 veces por segundo.

La causa es que **`cleo\.config\sa.json` es un quinto artefacto** y se edita a
mano: el `sa-commands.json` del runtime es una plantilla para copiar, y copiarla al
`modloader\` no declara nada. Ver `gsis_MAINTENANCE.md` §1.

Y la regla del lado del facade, que es la que evita que un comando faltante mate
el mod: **un `native()` que no existe devuelve `false`, no tira.** Un `throw` en el
per-frame se lleva por delante todo lo que venia despues en el mismo frame.
`takeCommand()`, `getInputState()` y `setKeyPassthrough()` del facade tienen
`try`/`catch` por eso, y `facade.test.mjs` lo cubre.

### Un `return` sin `e.respond` duplica items (30/09)

**Sintoma:** el inventario **crece** con cada pulsacion de R. Un cargador nuevo
por pulsacion. El cinturon no pierde nada y el arma se ve igual.

**Causa:** una rama condicional de `items:swapMagazine` hacia `return` sin llamar
a `e.respond`. El llamador (`weapons/logic.js`) hace `if (resp)`, lee
`undefined` como "el inventario no cambio" y cae en el camino de DESMONTA, que
hace `addItem()` sobre una pieza que **ya estaba escrita en el cinturon**.

Lo dificil es que el sintoma y la causa estan en modulos distintos, y el sintoma
no senala el `respond` que faltaba. Ver `gsis_ARCHITECTURE.md` §3.3 para la regla.

**Como se caza sin juego:** `prueba-ciclo-r.mjs` cuenta las piezas al final de
cada paso y compara con el estado inicial. Una pieza que aparece sola es un
`respond` faltando o un item que se fabrica. Corre ese test antes de culpar al
motor.

### El cargador de fabrica se fabrica o se pierde (30/09)

**Sintoma:** un `mag_colt45(0)` aparece en el cinturon que el jugador nunca tuvo,
**o** se pierden 8 balas en cada ida al cargador extendido.

**Causa:** la variante base se declara con `attachments` vacia, asi que el
cargador de fabrica no esta nunca en la lista y `mountedMagazineOf()` devuelve
`null` con el arma pelada. Base tiene dos lecturas y el registro no las separa:
"no hay cargador" y "esta el de fabrica". La que las separa es la municion.

**La regla:**

```js
var magEnElArma = montado || (hayMunicion ? factoryMagazineOf(entry.family) : null);
```

Sin la parte de `hayMunicion`, o se fabrica un cargador vacio (arma desnuda) o se
comen 8 balas (arma con balas). Ver `gsis_WEAPONS.md` §6.

**Como se caza:** el bloque `EL CARGADOR DE FABRICA` de `prueba-ciclo-r.mjs` tiene
los tres casos — no aparece un segundo cargador, no aparece ninguna pieza que no
estuviera antes, y con balas en el arma el cargador de fabrica **sí** vuelve al
cinturon con sus 8. `validateWeapons()` además falla si una familia declara dos
cargadores de fabrica o ninguno.

### Checklist de la R con cargadores

En juego, con el arma equipada y el cinturon con un cargador de 8 y uno de 15.
Contar las piezas antes y después de cada paso, no mirar solo la pantalla.

| Paso | Tipo esperado | Balas | Cinturon |
|---|---|---|---|
| equipar pelada | 63 | 0/8 | sin cambios |
| R (sube a extendido) | 62 | 15/15 | el de 15 baja, el de 8 sube |
| R (vuelve a base) | 63 | 8/8 | el de 8 baja, el de 15 sube |
| R x4 | alterna 62/63 | 15/15 y 8/8 | **las mismas 2 piezas** |

Con el silenciador montado el ciclo es 60 ↔ 61 y el total de balas se conserva.

Un número redondito que **no** es bug: si el jugador dispara una bala del cargador
de 15 antes de recargar, el siguiente R deja `14/15`. Las balas viajan con la
pieza, no con el tipo.

---

## 5. Prevencion de Memory Leaks

### Reglas de Memoria

1. **No crear entidades sin necesidad** — Cada `Car.Create()` consume memoria
2. **Eliminar entidades que no se usan** — `car.delete()` cuando el vehiculo ya no es necesario
3. **No acumular listeners** — EventBus: registrar en `init`, no cada frame
4. **Limitar el log** — No hacer `log()` en cada frame
5. **Serializar con cuidado** — No serializar handles de entidades

### Limpieza de Listeners

```javascript
import { on, off } from "../core/gsis_EventBus.js";

var handler = function (e) { /* ... */ };
on("vehicle:destroyed", handler);

// Cuando ya no se necesita
off("vehicle:destroyed", handler);
```

---

## 6. Testing de Persistencia

### Probar Guardado (F5 o auto-save)

```javascript
import { saveGame, loadGame, getActiveSlot, getCleanMoney } from "../core/gsis_SaveManager.js";
import { addItem, getItems } from "../modules/inventory/index.js";

// 1. Modificar estado
setCleanMoney(999999);
addItem("scrap_metal", 5);

// 2. Guardar
saveGame(getActiveSlot());

// 3. Resetear / modificar
setCleanMoney(0);

// 4. Cargar
loadGame(getActiveSlot());

// 5. Verificar
if (getCleanMoney() === 999999) {
    log("[GSIS] PASS: Save/Load funciona");
} else {
    log("[GSIS] FAIL: Save/Load roto");
}
```

---

## 7. Testing de Combate (futuro — Fase 2)

```javascript
// Eventos estandar documentados en gsis_ARCHITECTURE.md §3.3
import { emit } from "../core/gsis_EventBus.js";

// Emboscada (pendiente implementar emisor)
emit("transport:risk", { type: "ambush" });

// Redada (pendiente)
emit("raid:triggered", { zone: "LOS_SANTOS", severity: "high" });
```

---

## 8. Logs Esperados

### Al Iniciar el Juego

```
========Grove Street Iron Syndicate=========
--- Modulo SaveManager cargado correctamente ---
[ModuleRegistry] init: Items
[ModuleRegistry] init: Properties
[ModuleRegistry] init: Documents
[ModuleRegistry] init: InventoryMenu
...
[GSIS] Modulos registrados: N
[GSIS] InventoryMenu inicializado - tecla I para abrir
```

### Al Comprar una Propiedad

```
[PropertyModule] Comprada: taller_ganton
~g~Compraste: Taller Ganton (-$10000)
```

### Al Comprar en el Dealer (checkout)

```
[WeaponDealer] Checkout OK: $3500
~g~Pedido confirmado (-$3500)
[SpotRuntime] 1 esferas de 'pickup' ENCENDIDAS
[DealerPickup] Blip de retiro creado en dealer_pickup_0
```

### Al Vender en el Trueque (punto de venta)

Feedback NPC vía `characters:say` (personaje `seller_local` → `dialogue:play`, subtítulo 00BB, reemplaza línea anterior):

```
[WeaponSeller] NPC generado: intereses=Pistolas budget=$850 target=3
[Characters] say seller_local → 1 linea(s)     // si MISC.DEBUG_ENABLED
~w~Vendedor local~w~: ~g~¡De una, me sirve el precio! (+$300)
~w~Vendedor local~w~: ~y~Uff, te estiraste mucho, dejalo para la próxima.
~w~Vendedor local~w~: ~r~¡Ni loco! Eso vale mucho menos.
```

### Al Iniciar (Actors + spots)

```
[Actors] Cargando 1 modelos especiales...
[Actors] Especial cargado: fam5 → ID 15000
[Actors] Especiales listos: {"fam5":15000}
// Carga en interior:
[GSIS] Actors: permanentes pendientes (esperar exterior)
[GSIS] Characters: 2 personajes
[GSIS] WeaponDealer: menu con esfera (ESPACIO abre y cierra)
[GSIS] WeaponSeller: menu con esfera (ESPACIO abre y cierra)
[GSIS] DealerPickup: spots=1 (menu con esfera: ESPACIO abre y cierra)
// Al salir al exterior:
[Actors] Permanentes registrados (dormant): 2
[Actors] Spawn weapon_dealer (weapon_dealer)   // si MISC.DEBUG_ENABLED
[Actors] Spawn weapon_seller (weapon_seller)   // si MISC.DEBUG_ENABLED
[SpotRuntime] 1 esferas de 'dealer' ENCENDIDAS
[SpotRuntime] 1 esferas de 'seller' ENCENDIDAS

// Carga en exterior (sin gate):
[Actors] Permanentes registrados (dormant): 2
[Actors] Spawn weapon_dealer (weapon_dealer)   // al entrar en ENTER, si DEBUG
[Actors] Spawn weapon_seller (weapon_seller)
[SpotRuntime] 1 esferas de 'dealer' ENCENDIDAS
[SpotRuntime] 1 esferas de 'seller' ENCENDIDAS
```

### Al abrir y cerrar un menu de esfera

```
[UI] menu de dealer abierto por tecla ESPACIO
// (al cerrarlo, con la tecla o con ESC desde la pagina)
[UI] menu de dealer cerrado por tecla ESPACIO
[SpotRuntime] esfera de 'dealer' APAGADA 6 s (menu cerrado)
[SpotRuntime] 1 esferas de 'dealer' apagadas (cooldown de 6 s)
// 6 s despues, sola:
[SpotRuntime] 1 esferas de 'dealer' ENCENDIDAS (fin de la cooldown)
```

El baúl usa su propio log, porque sus esferas cuelgan del auto y no del catálogo:

```
[Trunk] esfera del baul id=3 encendida de nuevo: el menu se puede abrir
[Trunk] 1 esfera(s) de baul apagada(s) (menu cerrado)
```

Los logs de Activar/Dormant/Spawn de peds solo salen con `MISC.DEBUG_ENABLED`.
`[Actors] Permanentes registrados (dormant)` es siempre visible (una vez al pasar el gate).
Los logs de modelos especiales (`Especial cargado`, `Especiales listos`) son siempre visibles al init.

### Errores

```
[EventBus] Error en handler de '...'
[ModuleRegistry] Error en update de Nombre: ...
~r~Inventario lleno
~r~Dinero insuficiente (falta $X)
~r~Carrito vacio
```

---

## 9. Pruebas Manuales (checklist en juego)

| # | Accion | Esperado |
|---|---|---|
| 1 | Tecla O cerca del pickup | Vehiculo registrado / spawn |
| 1b | Tecla 1 / 2 | Motor on/off, lock/unlock |
| 2 | Tecla 3 | Baúl abre, sphere aparece |
| 3 | Estar al lado de un baul abierto, sin apretar nada | **No pasa nada.** El menú ya no se abre al tocar la esfera: se abre apretando `ESPACIO` (ver 6r) |
| 4 | Guardar/Sacar con qty | Peso inv/baul se actualiza, pre-check con libre/necesario |
| 5 | Tecla `B` | Ya no hace nada: la tecla de los menús de esfera es `ESPACIO` |
| 6 | Tecla I | Abre el panel web: tabla por secciones con icono, cant, balas, peso y valor |
| 6b | Click en una fila | La selecciona (el detalle va en el `title` de la celda) |
| 6c | Pestañas Propiedades / Vehículos | Estado vacío "todavía no está implementado" (aún no tienen snapshot) |
| 6d | **X sobre un arma** | Equipa. El log del bridge dice `equipó <id>`; la fila desaparece del inventario al instante |
| 6e | **X mantenida ~600 ms sobre cualquier item** | Tira 1 unidad. Log: `tirar <id>` |
| 6f | **Click en el keycap "Equipar" / "Tirar"** del pie | Mismo que la X, sin tocar el teclado |
| 6g | X sobre un cargador | Va al cinturón (log: `cargador al cinturón`) |
| 6h | X sobre un material apilado | No hace nada; el log dice `no tiene accion de equipar` |
| 6i | Primer arranque tras instalar v2 | `cleo.log`: `[UI] canal de acciones activo (SAWeb v2)`. Si dice `NO disponible`, el comando no quedó declarado en `cleo\.config\sa.json` |
| 6j | 8 acciones seguidas rápido | Todas se atienden: el tope es 4 por frame, no 1 |
| 6k | Abrir el panel con `I` | El personaje queda **congelado** y la cámara vuelve a la vista de siempre. `cleo.log` **no** puede mostrar `[Input] SET_PLAYER_CONTROL no se pudo llamar` |
| 6l | Caminar con el panel **principal** abierto y el puntero **afuera** del panel | El personaje no se mueve. Con el puntero sobre el panel tampoco. La supresión vale en los dos casos |
| 6m | Con el panel abierto: `Q`, `E`, `R`, `1`, `2`, `3`, `O`, `P`, `L` | Ninguna hace nada. Antes `Q` abría el mapa y `F`/`B` abrían los menús de esfera |
| 6n | Cerrar el panel | El personaje recupera el control. `SAWebUICef.log` pasa a `keys=0` |
| 6o | `Escape` con el puntero **sobre** el panel | Cierra igual. Va por `cmd:ui:close`, porque con el teclado en la página el juego no ve la tecla |
| 6p | `I` con el puntero sobre el panel | Togglea igual, por `cmd:ui:toggle` |
| 6q | `SAWebUICef.log` con el panel abierto | `mode=1 keys=1`. Y `keys=1` **también con el puntero afuera**: eso no es un bug, es que la región de input de la UI es la pantalla completa. Con `keys=0` y el panel abierto, el puntero todavía no se movió nunca |
| 6r | `ESPACIO` al lado de un baúl abierto (tecla 3 primero) | El panel aparece **al centro con dos listas**, el inventario se apaga, el cursor se ve, los hotkeys se suprimen y **el personaje queda congelado**, igual que el principal. `cleo.log`: `menu de trunk abierto por tecla ESPACIO` |
| 6s | Llegar al panel con la `X` ya mantenida y soltarla | **No tira nada.** Antes borraba un item: el `keyup` sin `keydown` calculaba `ahora - 0` y siempre superaba el umbral |
| 6t | Navegar con flechas en un inventario más largo que la caja | La fila seleccionada queda siempre a la vista |
| 6u | `Enter` sobre un item con acción de equipar | Equipa, como la `X` al apretar. **No** tira |
| 6v | `Home` / `End` / `PageUp` / `PageDown` | Primera fila, última fila, y una caja de alto por salto |
| 6w | Filtrar con flechas en un inventario con bandas reordenadas | La selección sigue **el orden dibujado**, no el del snapshot: al bajar con las flechas la fila iluminada es la de abajo, no una de otra banda |
| 6x | Invertir el orden de las filas del snapshot | El inventario se ve igual, y la navegación con flechas sigue el orden visible |

### Los cuatro menus de esfera

Todos se abren apretando `ESPACIO` parado adentro de su esfera, y se cierran con la
misma `ESPACIO`, con `Escape` o con el botón de cerrar. El mismo para los cuatro: el
panel del inventario se apaga, el cursor aparece, los hotkeys del juego se suprimen,
**el radar se esconde y el player queda congelado** — igual que el panel principal
(caso 6k). La única diferencia con el inventario es la condición de entrada.

Al cerrarse uno, **su esfera queda apagada 6 s** (`TIMERS.SPHERE_COOLDOWN`) y vuelve
sola. En esos 6 s la `ESPACIO` no abre nada aunque el jugador siga parado en el
lugar.

| # | Caso | Que tiene que pasar |
|---|---|---|
| 6y | `ESPACIO` al lado de un baúl abierto | Abre el panel del baúl, **al centro y con dos listas**. La izquierda es la mochila, la derecha el baúl. Cada lista con su peso en su encabezado. El inventario se apaga. El subtítulo dice "ESPACIO: menu \| 3: cerrar baul \| ESPACIO o ESC para cerrar el menu" |
| 6z | `←` `→` en el baúl | Cambia de lista. La selección pasa a la otra y **el botón principal cambia de texto**: "Guardar en baul" ↔ "Sacar a mochila" |
| 6aa | `Enter` con una fila de la mochila y cantidad 3 | Se guardan 3. Log: `baul: trunk:put <id> x3`. La lista de la derecha crece en el siguiente push (hasta 400 ms) |
| 6ab | Guardar más de lo que entra en el baúl | Aviso rojo "Baul lleno (libre X kg, necesitas Y kg)" en el panel, y el inventario queda igual. El aviso aparece **aunque los datos no hayan cambiado** |
| 6ac | Sacar más de lo que entra en la mochila | Aviso rojo con el mensaje de inventario lleno. El baúl queda igual |
| 6ad | `Escape` con el baúl abierto | Cierra **el baúl**, no el inventario. `cleo.log`: `la pagina cerro el flujo trunk` o `Escape cerro el menu de trunk` |
| 6ae | `I` con el baúl abierto | No hace nada, y `cleo.log` dice `toggle ignorado (tecla I): hay un flujo abierto (trunk)` |
| 6af | `ESPACIO` con el baúl abierto | **Lo cierra**, y el log dice `menu de trunk cerrado por tecla ESPACIO`. Después la esfera queda apagada 6 s |
| 6ag | `ESPACIO` en la esfera de la armería | Abre "Armeria Mayorista" con el catálogo **agrupado por categoría de arma** (Pistolas, Escopetas…), no por tipo de item |
| 6ah | `Enter` en una fila de la armería | La suma al carrito. La columna "Carrito" sube y el pie muestra el total |
| 6ai | `P` con el carrito lleno | Compra: el pedido se confirma, el dinero baja, el carrito se vacía y aparecen la esfera y el blip de retiro |
| 6aj | `P` con el carrito vacío | Aviso "Carrito vacio", no pasa nada |
| 6ak | `V` | Vacía el carrito sin tocar el dinero |
| 6al | `P` sin dinero suficiente | Aviso rojo "Dinero insuficiente (falta $X)" y el carrito **sigue**: no se perdió lo que se eligió |
| 6am | `ESPACIO` en la esfera de retiro, con pedido | Abre "Retiro de pedido" con las líneas, la cantidad que queda de cada una, el peso total y el libre de la mochila |
| 6an | `Enter` (recoger) con cantidad parcial | Entra esa cantidad; la línea baja la cantidad que queda |
| 6ao | `A` (recoger todo) con espacio de sobra | Todo entra, el pedido queda vacío, la esfera y el blip desaparecen |
| 6ap | `A` con el pedido entero sin espacio | Aviso rojo "No cabe todo: libre X kg, pedido Y kg. Recoge de a poco" y **el pedido queda intacto**: no se cobró nada |
| 6aq | Recoger una cantidad mayor a la del pedido | Aviso "Cantidad invalida en el pedido", pedido intacto |
| 6ar | `ESPACIO` en la esfera de trueque con armas | Abre "Trueque — Cliente local" con tus armas vendibles, el valor base de cada una y la oferta arrancada en ese valor |
| 6as | `Tab` con el trueque abierto | El campo activo pasa de "Cantidad" a "Oferta", y se marca cuál responde a `+` / `−` |
| 6at | `+` / `−` en el campo de oferta | Sube o baja de a 10. El tope es el de la fila y **el mod recorta otra vez**: es el que manda |
| 6au | **Presupuesto antes de la primera oferta** | El pie dice "Presupuesto: (no te lo dijo)". El número no viaja en el snapshot: el gate está en `getSellState()` |
| 6av | Oferta de más del presupuesto del NPC | Aviso del rechazo + subtítulo del diálogo con el mismo texto. El arma sigue en la mochila |
| 6aw | Oferta aceptada | El arma sale de la mochila, el dinero sube, y la fila desaparece |
| 6ax | Vender el arma que el NPC busca | El presupuesto baja; si se completa el interés, el pie lo dice |
| 6ay | Reabrir el trueque tras cumplir el interés | Intereses y presupuesto nuevos. **Ojo:** si se cerró el menú hace menos de 6 s, la `ESPACIO` no abre nada — hay que esperar |
| 6az | Un flujo que se cierra mientras su snapshot está en vuelo | La página ignora el snapshot: el id no coincide con el `uistate.flow` y el panel se apaga igual |
| 6ba | Con un menú de esfera abierto y el **puntero fuera** del panel, caminar | El personaje **no** se mueve: está congelado, como con el inventario |
| 6bb | Caminar 2 m aleándose con un menú de esfera abierto | El menú se cierra solo, sin tocar ninguna tecla. Es la red de seguridad del auto-cierre por distancia: normalmente no se llega, porque el menú congela |
| 6bc | Con un menú de esfera abierto, el **cursor sigue visible** | `SAWebUICef.log` da `mode=1`. Es lo que permite clickear una fila |
| 6bd | `ESPACIO` con el panel principal (`I`) ya abierto | No pasa nada. El inventario tiene la pantalla, y la `ESPACIO` no lo toca |
| 6be | Con un menú de esfera abierto, el **radar** | **Se esconde**, igual que con el inventario: todos los menús son de pausa |
| 6bf | El subtítulo de los cuatro menús | Termina en "ESPACIO o ESC para cerrar el menu" (`MENU_HNT`). Sin esa línea el jugador no tiene cómo enterarse de que puede salir, porque el panel puede haber quedado debajo del puntero |
| 6bg | **Cerrar un menú y esperar 6 s, dos veces seguidas** | Al volver, la `ESPACIO` abre de nuevo. Este es el caso que hay que repetir: con un solo ciclo no se ve si la esfera se apaga y vuelve |
| 6bh | Lo mismo, pero con la `I` apretada en el medio | El inventario real abre y cierra normal |
| 6bi | **Clickear a un personaje** con un menú de esfera abierto | **No lo golpea**: el player está congelado. Antes hacía falta el bloqueo del mouse (v5) para eso; hoy no hace falta porque el freeze ya lo cubre |
| 6bj | **Mover el mouse** con un menú de esfera abierto | La cámara **gira** (o no, según el build): el bloqueo del mouse no está activo y no hace falta que lo esté con el jugador congelado |
| 6bk | **Clickear una fila** con un menú de esfera abierto | Funciona |
| 6bl | La rueda del mouse sobre el panel de un menú de esfera | Scrollea las filas. La `ESPACIO` sobre el panel **no** scrollea: la página la traduce a `flow:toggle` |
| 6bm | Con un menú de esfera abierto, `W A S D` | No camina. El menú congela: la salida es la `ESPACIO`, el `Escape` o el botón de cerrar |
| 6bn | El **panel principal** (`I`) | Sin cambios: el click llega a la página, las filas se clickean |
| 6bo | `ESPACIO` en la calle, lejos de toda esfera | No pasa nada, y no hay aviso. La `ESPACIO` también es saltar: no se castiga el salto con un cartel |
| 6bp | `SAWebUICef.log` al arrancar el juego (sin abrir nada) | Aparecen `patch en la carga del modulo ... slot sin resolver (llegamos primero)`, `DirectInput8Create interceptado` y `device del mouse parchebado`. Si falta alguna, el bloqueo **no está activo** aunque el latch diga 1. Con un menú abierto se suman `leyendo el mouse por los hooks` y `bloqueo aplicado al buffer del mouse`. Para ver esas dos últimas sin abrir nada: arrancar con `SAWEB_FORCE_MOUSE_BLOCK=1` (el latch arranca encendido y el CEF lo apaga en cuanto ve que no hay menú). Si falta `device del mouse parchebado`, el log trae el GUID real en `device pedido ...`: se compara contra `GUID_SysMouse = 6F1D2B60-D5A0-11CF-BFC7-444553540000` |
| 7 | Comprar propiedad | ⏳ **No probable en juego**: la compra vive en la pestaña Propiedades, que todavía no tiene snapshot. La lógica del módulo existe; falta la pantalla |
| 8 | F5 | Guarda; recargar partida conserva estado |
| 9 | Tecla L | +1 9mm, +5 chatarra, +1 cargador (debug) |
| 9b | R con arma descargada y sin cargadores | "No tienes cargadores", sin anim, inventario igual |
| 9c | R con arma equipada + cargadores | Anim recarga; salen 1 cargador y vuelve el montado con sus balas |
| 9d | Vaciar cargador y R | Arma llena; el cargador vuelve al inventario en 0 balas |
| 9e | Recarga sin vaciar (R a media carga) | El cargador que vuelve conserva las balas que quedan |
| 9f | Cambiar de slot de arma | Muestra slot/type/clip/ammo y NO rellena la munición |
| 9g | Recoger arma nueva (cheat/POI) con el arma anterior en uso | La nueva arranca con cargador lleno (= clipSize) |
| 9h | Cargar partida con armas ya obtenidas | No se rellena nada (baseline) |
| 9i | R con arma cargada y sin cargadores | El cargador montado pasa al inventario con sus balas, el arma queda en 0 y corre la anim de recarga ("Cargador extraido") |
| 9j | R tras descargar (sin cargadores) | "No tienes cargadores": no aparece ninguno nuevo |
| 9k | R con arma descargada + cargador en el inventario | Se monta solo ese: sale 1 y no vuelve ninguno |
| 9l | Guardar y cargar tras descargar | El arma sigue sin cargador (`hasMag` persistido) |
| 10 | Destruir vehiculo con baul abierto | Baul se cierra solo |
| 11 | Cerca de esfera dealer + `ESPACIO` | Panel "Armeria Mayorista" abre (catálogo + carrito) |
| 12 | qty + Agregar en fila | Item entra al carrito, el total del pie se actualiza |
| 13 | Pagar sin dinero CJ | Aviso rojo "Dinero insuficiente (falta $X)", el carrito **sigue** lleno |
| 14 | Pagar con dinero CJ | Pedido confirmado, el dinero baja, el carrito se vacía |
| 15 | Tras compra exitosa | Esferas + blips retiro en spots `SPOTS.pickup` |
| 16 | `ESPACIO` en la esfera de retiro | Panel "Retiro de pedido" con las líneas y la cantidad que queda |
| 17 | Recoger qty parcial (libre OK) | Solo esa qty entra al inventario, el pedido baja |
| 18 | Recoger qty que no cabe | Aviso rojo con libre/necesario, pedido intacto |
| 19 | Recoger mas del pedido | Aviso "Cantidad invalida en el pedido", pedido intacto |
| 20 | RECOGER TODO (espacio OK) | Todo entra, esfera + blip desaparecen |
| 21 | RECOGER TODO (no cabe) | Aviso "No cabe todo... recogé de a poco", pedido **intacto** (blip sigue) |
| 22 | Quitar ultima unidad del pedido | Pedido vacio → esfera + blip se destruyen |
| 23 | Vaciar el carrito | Carrito limpia sin tocar dinero |
| 24 | `ESPACIO` de nuevo con el menú abierto | El menú se cierra y la esfera queda apagada 6 s |
| 25 | Comprar arma larga | Bag se auto-muestra |
| 26 | Vender/soltar ultima larga | Bag se auto-oculta |
| 27 | Tecla P sin arma larga | No equipa (sin mensaje) |
| 28 | F5 tras compra | Pedido persiste en save (recargar conserva esfera) |
| 29 | `ESPACIO` en la esfera de trueque (2518.07, -1677.97) | Panel "Trueque — Cliente local" con solo armas |
| 30 | Oferta ≤ 85% del techo | Acepta seguro: subtítulo con prefijo `Vendedor local:` + `~g~¡De una...!`, inventario baja, dinero sube |
| 31 | Oferta entre 85–100% del techo | 50% acepta ("un poco caro") o rechaza ("te estiraste") — ambos vía `characters:say` |
| 32 | Oferta > techo NPC | Rechazo subtítulo: "~r~¡Ni loco! Eso vale mucho menos." |
| 33 | Vender arma de interes | salesCompleted++; budget baja; el pie muestra el presupuesto tras la 1ª oferta |
| 34 | Cumplir interes (N ventas o budget bajo) | Log fulfilled; al reabrir con `ESPACIO` (pasados los 6 s): nuevos intereses + budget |
| 35 | Arma sin interes del dia | Techo más bajo (compra más barata o rechaza más fácil) |
| 36 | Cargar partida | Dealer + seller quietos en coords propias; al entrar en ENTER: `[Actors] Spawn` ×2 (DEBUG) |
| 37 | Matar al dealer | Tras ~2 checks: log `actor:died`; el menú de la esfera sigue funcionando (el punto no depende del ped) |
| 38 | `actors:task` clear sobre dealer | Sin error; sigue quieto (0687 + 0350) |
| 39 | `actors:handle` role=dealer | Devuelve handle o null si murió o está dormant |
| 40 | Añadir 2+ entradas en `SPOTS.dealer` | N esferas; `ESPACIO` cerca de cualquiera abre el mismo menú carrito |
| 41 | Añadir entradas en `SPOTS.seller` / `SPOTS.pickup` | N esferas trueque / retiro (retiro solo con pedido) |
| 42 | Actor en coords distintas a la esfera | Ped no se pega a la esfera (catálogos independientes) |
| 43 | Cargar partida **en interior** | Logs `permanentes pendientes`; al salir: `registrados (dormant)`, spawns y `[SpotRuntime] ... ENCENDIDAS` en las coords correctas |
| 44 | Cargar partida en exterior | Registrados dormant + spawns al acercarse; dealer/seller en sitio |
| 45 | Alejarse >180m del dealer | Ped desaparece (`[Actors] Dormant` si DEBUG); sin `actor:died` |
| 46 | Volver a <150m | Ped reaparece en su `spawn`; `actors:handle` vuelve a handle |
| 47 | 165m (entre EXIT y ENTER) | No parpadea (histeresis): mantiene estado actual |
| 48 | Stress ~200 permanentes | Al pasar gate: solo `registrados (dormant): N`; peds solo cerca de CJ |
| 49 | Pasar gate con 200 | Cola no traba frames (3 creates + 8 slots/frame) |
| 50 | Streaming / no falsos dead | Ped lejano que se dormiría no emite `actor:died` |
| 51 | Muerte real del dealer | 1 miss no basta; al 2.º (o `IS_CHAR_DEAD`) → `actor:died` |
| 52 | `dialogue:play` una key | Subtítulo 00BB en pantalla ~ms; log `[Dialogue] PRINT_STRING` (DEBUG); sin `~x~` → blanco (`DEFAULT_COLOR`) |
| 53 | `dialogue:play` secuencia 2 líneas | 1ª → gap → 2ª; `dialogue:isPlaying` true hasta el final |
| 54 | `dialogue:play` + `replace: true` | Corta la actual (`CLEAR_PRINTS`) y muestra la nueva |
| 55 | `dialogue:stop` a mitad | Subtítulo desaparece; cola vacía |
| 56 | `characters:say` seller_local + key SEL_* | Prefijo `Vendedor local:` + línea; log `[Characters] say` |
| 57 | `characters:say` + `topic: "accept_ok"` | Resuelve topic del catálogo → misma línea que SEL_A1 |
| 58 | Init Characters | Log `[GSIS] Characters: 2 personajes` |
| 59 | 2 sellers con `characterId` distinto | Cada esfera → título/estado/carrito propios; al cerrar uno y abrir otro (pasados los 6 s), no se mezclan |
| 60 | `ch.dealer.items` / `prices` | DealerMenu (Emmet) solo muestra 9mm $100 / DE $300 / Micro Uzi $200; checkout cobra ese total |
| 61 | `ch.seller.interests` / `budget*` | SellMenu muestra esos intereses; techo/aceptación dentro del rango configurado |
| 62 | Acercarse a dealer/seller (<150m) | Ped spawnea y queda en pose idle; log `[ActorAnims] Play …` (DEBUG) |
| 63 | Alejarse >180m y volver | Re-spawn → idle se re-aplica solo (`actors:spawned`) |
| 64 | `emit("anims:play", { role: "dealer", anim: "dealer_idle" })` | Reproduce sin error; log Play |
| 65 | `emit("anims:stop", { role: "dealer" })` | Vuelve a quieto (CLEAR_CHAR_TASKS); sin crash IFP |
| 66 | Init | Log `[GSIS] ActorAnims: N anims` |

---

## 10. Pruebas Automaticas

**Ya no es futuro.** Hay tres checks en `.IronSyndicate\tools\` que corren con
`node`, sin GTA, importando los modulos reales y usando `fake-engine.mjs` en
lugar del motor:

| Check | Que ejercita de verdad |
|---|---|
| `check-ui-flow.mjs` | `data/gsis_weapons.js` + `modules/inventory/` + `modules/weapons/` + `modules/ui/views/` en el camino completo del click. Incluye el motor falso dando el arma y **tirando despues**, que es el bug de la sesion real |
| `check-dat.mjs` | La coherencia entre la tabla, el `.dat` y el `.asi` |
| `check-migration.mjs` | Los migradores del save, sobre saves de cada version |

Lo que **no** existe todavia: una suite que corra `modules/ui/index.js` frame a
frame con stubs (lo hacia `check_smoke_mod.mjs`, que ahora no arranca — ver §2), y
una que ejercite `_reconcileLoadout()` con estado acumulado (lo hacia
`check_reconcile.mjs`, tambien caido). Son los dos huecos que mas caro sale dejar:
uno es donde un `ReferenceError` se come el per-frame, y el otro es donde un arma
se pierde sin que nadie lo decida.

Pendiente de Fase 4 / [gsis_MAINTENANCE.md §1](./gsis_MAINTENANCE.md) como gate
minimo del checklist pre-commit.
