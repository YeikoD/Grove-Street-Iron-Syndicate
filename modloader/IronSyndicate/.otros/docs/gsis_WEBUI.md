# GSIS — UI Web (CEF / SAWeb)

> **Este documento es del mod, no del runtime.** Describe cómo GSIS usa
> SAWebUI: qué archivos toca, qué le manda a la página, qué recibe de ella y
> qué reglas tiene que cumplir el lado CLEO.
>
> La documentación del runtime —la API, la ASI, cómo se escribe una página, el
> canal de retorno— está aparte, en
> [`C:\Dev\SAWebUI\docs\`](C:\Dev\SAWebUI\docs\README.md). Acá se cita lo
> imprescindible para trabajar en el mod; para el "por qué" del runtime, el
> documento del runtime.

La interfaz del mod es una **página web** que dibuja la ASI `SAWebUI.SA.asi`
(CEF OSR → textura D3D9 → framebuffer del juego). Es la única capa de UI: no
hay otra, ni quedó rastro de la anterior.

- Runtime (API, ASI, guía de páginas): [`C:\Dev\SAWebUI\docs\`](C:\Dev\SAWebUI\docs\README.md)
- Patrón de código en el mod: [gsis_ARCHITECTURE.md §2](./gsis_ARCHITECTURE.md)
- Reglas de mantenimiento: [gsis_MAINTENANCE.md §2.5](./gsis_MAINTENANCE.md)

---

## 1. Donde vive cada cosa

```text
modloader/IronSyndicate/
├── UI/                                  ← La página (servida por la ASI)
│   ├── index.html                       ← Estructura del panel
│   ├── app.js                           ← Estado + render + contrato
│   ├── style.css                        ← Tokens de color/tipografía (fuente única)
│   └── assets/                          ← Tipografías, iconos de cabecera, keycaps
├── UI/assets/    Iconos PNG: imagenes/, imagenes/weapons/, iconos/categorias/                               ← Iconos PNG de items
└── cleo/IronSyndicate/
    ├── core/
    │   ├── gsis_Input.js                ← Dueño del teclado, los menus y el freeze
    │   └── gsis_Notice.js               ← El aviso de una accion, que viaja con el snapshot
    └── modules/
        ├── ui/
        │   ├── index.js                 ← Dueño del estado + push + teclas
        │   ├── bridge.js                ← El cable con la ASI: send / pushChunked / drainCommands
        │   ├── commands.js              ← Qué significa cada verbo de la página
        │   └── views/
        │       ├── inventory.js          ← snapInventory()   ("inv")
        │       ├── catalog.js            ← snapCatalog()     ("catalog")
        │       ├── flow.js               ← currentFlow / openFlow / closeFlow + snapFlow() ("screen")
        │       └── itemRow.js            ← La fila, compartida por las 5 pantallas
        ├── inventory/
        │   └── index.js                  ← Dueño de items[] / baul / cinturon (los snapshot lo leen)
        └── weapons/
            └── logic.js                  ← Dueño de equipar / desequipar / recargar
```

> Los archivos de la UI solian vivir en `cleo\IronSyndicate\ui\`, y despues en
> `modules\` como `gsis_WebInterface.js` (1122 lineas) + `gsis_ItemRow.js` +
> `gsis_InventorySerialization.js` + `gsis_FlowSerialization.js`. Ahora son un
> paquete, `modules\ui\`, partido por lo que cambia junto: el transporte, los
> comandos y las vistas. El estado del teclado, que antes estaba repartido, tiene
> su propio modulo en `core\` — ver [gsis_INPUT.md](./gsis_INPUT.md).

La ASI resuelve la raíz de las páginas en `modloader\SAWebUI\SAWebUI.ini`:

```ini
[SAWeb]
WebRoot = modloader\IronSyndicate\UI
Index   = index.html
```

`SAWebUI.ini` se lee al arrancar el juego: cambiarlo requiere reiniciar GTA SA.

## 2. Quien es dueño de que

| Cosa | Dueño | Nota |
|---|---|---|
| Si el teclado está en la página o en el juego | `SAWeb_GetInputState` (la ASI) | Se consulta desde `gsis_Input.refresh()` |
| Si hay algún menú abierto | `gsis_Input.js` | El principal más las fuentes de cada módulo |
| Cursor del panel | `gsis_Input.js` | `setMenuCursor()`, con **cualquier** menú abierto |
| Freeze + cámara | `gsis_Input.js` | `setMenuGameState()`, con **cualquier** menú abierto: los cinco son de pausa |
| Qué pantalla está a la vista | `modules/ui/index.js` | `pantallaVisible()` / `currentFlow()`: una sola a la vez |
| Qué tecla abre/cierra cada menú | `modules/ui/index.js` | Una tabla (`TECLAS`) y un despacho (`resolverTecla()`). `togglePanel()` con `I`, `abrirFlujo()` con `ESPACIO`/`INTRO`/`F`, `cerrarVisible()` con `F`/`ESC`. Un dueño por tecla: si los cuatro módulos leyeran la suya, una pulsación abriría y cerraría menús cruzados |
| Si un menú de esfera se puede abrir | El módulo dueño | `openXMenu()` → `spotCanOpen()` (radio, esfera prendida, vehículo). Lo llama `openFlow()` |
| Qué tecla se suprime | `gsis_Input.js` | `keyJustPressed()`; los módulos preguntan |
| Visibilidad del panel | `modules/ui/index.js` | `_uiState.menuVisible`; la página solo refleja |
| Datos que ve el jugador | `ui/views/inventory.js` + `ui/views/flow.js` | Un `snap*()` por grupo |
| Qué comando se ejecuta | `ui/commands.js` | `handleCommand()`; los módulos validan |
| El aviso de la última acción | `core/gsis_Notice.js` | Lo consulta `ui/index.js` **después** del throttle, y lo manda aunque los datos no hayan cambiado |
| DOM, scroll, selección, atajos | `app.js` | **Sin** estado de input propio |
| Abrir/cerrar el browser | La ASI | El mod no llama `ui.open` ni `ui.close` |

**El browser nunca se cierra.** Se oculta por clase `.hidden`: el DOM sigue vivo,
los listeners atados y el pump de frames corriendo. Abrir y cerrar es cambiar una
clase, no un ciclo de vida de CEF.

## 3. Direccion de los datos

```text
CLEO   -> pagina    ui/index.js -> ui/bridge.js -> SAWeb.ui.send -> window.SAWeb.receive -> app.js
pagina -> CLEO      emit("cmd:...") -> cola de la ASI -> SAWeb_PollCommand() -> ui/bridge.js -> ui/commands.js
```

Las dos direcciones andan, por caminos distintos:

- **CLEO → pagina**: `SAWeb.ui.send`. El shim entrega y el comando nativo funciona.
- **pagina → CLEO**: `window.SAWeb.emit("cmd:<algo>", data)`. El shim encola en la ASI como
  `saweb:<uiId>:cmd:<algo>`, y el mod lo **PULLA** con `SAWeb.takeCommand()`
  una vez por frame, que es un `native()` y si funciona.

Lo que **no** funciona, y no hizo falta arreglar, es el camino que el runtime
tenia para la vuelta: `TriggerEvent` → `addEventListener` en el script. CLEO
Redux **1.5.0** no le entrega eventos a los scripts JS, asi que un
`on("main", "cmd")` no llega. Por eso el bridge **no** usa `on()` para los
comandos: los pull. Esta es la razón por la que existe el camino `cmd:`.

> **Evidencia del corte, no reproducible.** La medición (26/09/2026, script de
> sonda `cleo\zz_sonda.js`: 1500 ticks, `timers=0`, `eventos=0`) la hizo un script
> que **ya no está en el repo**. Se cita como justificación de por qué no se usa
> `on()`, no como premisa de diseño: el camino elegido no depende de que ese
> corte siga existiendo.

Tope de 4 comandos por frame (`MAX_COMMANDS_PER_FRAME`) para que una página con
un bug en un click no deje al mod pegado drenando.

> **Del runtime, no de acá**: por qué existe la regla del prefijo `cmd:`, qué
> garantiza que `on()`/`onAny()` no cambien, y las decisiones de diseño, están en
> [SAWEB_V2.md](C:\Dev\SAWebUI\docs\SAWEB_V2.md). La forma del comando y sus
> límites, en [SAWEB_API.md](C:\Dev\SAWebUI\docs\SAWEB_API.md) §2.

## 4. El contrato de ida

Cuatro eventos, todos iniciados por el bridge. La página los escucha con
`window.SAWeb.on()` y **no define `window.SAWeb`** (el shim es su dueño).

| Evento | Payload | Cuándo | Efecto en la página |
|---|---|---|---|
| `uistate` | `{ read, menu, anyMenu, keys, mode, focus, openUis, flow }` | cambia cualquiera de los campos | Abre/oculta `#panel`, decide qué panel se ve y refleja el estado del input |
| `catalog` | `{ i, n, d }` | **una vez**, al abrir el menú | Peso máximo, iconos y bandas de grupo (troceado, §5) |
| `inv` | `{ i, n, d }` | cada `PUSH_MS` si el snapshot cambió | Trozo de inventario (§5) |
| `screen` | `{ i, n, d }` | cada `PUSH_MS` si el snapshot cambió, y solo con un menú de esfera abierto | Trozo del panel de baúl / armería / retiro / trueque (§6) |

El puente manda el `uiId` `"main"` fijo (`UI_ID` en `ui/bridge.js`, que es el
único archivo del paquete que habla con la ASI).

`inv` y `screen` son excluyentes: con un menú de esfera abierto se manda
`screen` y el inventario no se manda, porque la página muestra un panel a la vez
y mandarlo sería pagar 9 a 14 trozos cada 400 ms para algo que no está en
pantalla. El baúl no es la excepción: su lista de la mochila viaja dentro de
`screen`, no en `inv`.

### `uistate` reemplaza a `input` + `panels`

Antes eran dos eventos y la página armaba sola las otras dos banderas —si el
teclado estaba prendido, y si tenía el foco— a partir de una señal que no le
permitía distinguir dos cosas distintas:

| Campo | Qué es | Por qué no se deducía |
|---|---|---|
| `read` | Se pudo leer el estado real | `false` = no se pudo leer, que **no** es "teclado apagado" |
| `menu` | El panel se ve | Lo controlaba el mod |
| `anyMenu` | Hay algún menú abierto (incluidos baúl, dealer, retiro, trueque) | Antes solo miraba el principal |
| `flow` | Cuál de los cuatro menús de esfera: `""`, `trunk`, `dealer`, `seller`, `pickup` | La página no sabe cuál está abierto |
| `keys` | **La página tiene el teclado ahora mismo** | Es el gate real del WndProc, no una suposición |
| `mode` | -1 auto, 0 oculto, 1 visible | El valor que se le pasó a `SAWeb.setCursor` |
| `focus` | id de la UI con el foco, `""` si no hay | Se llenaba con `hover` a ciegas |
| `openUis` | Cuántas UIs tiene abiertas el runtime | Diagnóstico |

`flow` va en `uistate` y no en el snapshot de `screen` a propósito: `uistate` va
latcheado por firma, así que el cambio llega en el frame en que pasa, mientras que
`screen` tiene throttle de 400 ms y el panel cerraría tarde. El `flow` solo dice
*qué* menú está abierto; los datos van en `screen`.

`keys` es el campo que hace que el resto sea confiable, y **no** significa "hay
un menú visible": significa que el WndProc está mandando las teclas a la página
ahora. El detalle completo está en [gsis_INPUT.md §2](./gsis_INPUT.md) y en
[SAWEB_V3.md](C:\Dev\SAWebUI\docs\SAWEB_V3.md).

> La frase que suele aparecer acá —"exige que el puntero esté sobre el panel"— es
> **falsa**, y durante bastante tiempo se dio por cierta. La región de input de una
> UI en el runtime es la pantalla completa: el panel se dibuja como un quad de
> pantalla completa y ese rect es el que decide a quién le llega la tecla. Con un
> panel abierto, el juego deja de ver todas las teclas al primer movimiento de
> mouse y no las vuelve a ver hasta que el panel se cierra. No hay "puntero
> afuera" porque el puntero no puede estar afuera de algo que es toda la pantalla.

### `passthrough`: las teclas que el mod se queda

**Hoy va siempre vacía**: el bridge llama `setMenuKeyPassthrough(null)` en cada frame
porque ningún menú se cierra alejándose — los cinco congelan al jugador y se cierran
con `ESPACIO`, `ESC` o el botón de la página. Lo de abajo está como estaba, y explica
el problema que existiría el día que un menú vuelva a cerrarse caminando.

Desde la v4 del runtime, `getInputState()` trae un campo más:

```json
{"mode":1,"keys":1,"focus":"main","openUis":1,"cursor":0,"passthrough":4}
```

`passthrough` es cuántas teclas hay en la lista que el mod le pidió que vayan al
juego aunque la página tenga el teclado. El mod la arma con
`setMenuKeyPassthrough()` (`gsis_Input.js`) y la lee de vuelta acá para confirmar
que el runtime la tomó.

Hacía falta por lo de arriba. Los cuatro menús de proximidad se cerraban
**alejándose**, y sin `W` no había forma de alejarse: el char salía del freeze en el
frame en que el jugador apretaba una dirección, y para que el juego se enterara de
esa pulsación la lista tenía que estar puesta. Eso es un soft-lock con una sola
puerta, el `Escape` de la página, si no está.

La lista iba con "hay menú de proximidad" y no con "no está congelado": con el
player congelado —que es como arrancaba el menú de proximidad— la lista tenía que
estar puesta igual, porque la pulsación con la que el jugador se iba ya fue
enrutada a la página y el juego se quedaría sin la `W` para siempre. Con la lista
puesta, el autorepeat de Windows reenvía el `WM_KEYDOWN` mientras la tecla esté
apretada y ese sí pasa. Ver [gsis_UIDESIGN.md §3.1](./gsis_UIDESIGN.md).

Esto hace que el mod **requiera el runtime v4** si alguna vez se vuelve a encender
el camino de proximidad, y no por la versión sino por el comando:
`SAWEB_SET_KEY_PASSTHROUGH` tiene que estar declarado en `cleo\.config\sa.json`, que
se edita a mano. Ver [gsis_MAINTENANCE.md §2.7](./gsis_MAINTENANCE.md).

Detalle completo del lado del runtime en
[SAWEB_V4.md](C:\Dev\SAWebUI\docs\SAWEB_V4.md).

La página **no afirma nada que el mod no le haya dicho**. Antes tenía una bandera
`focused` propia y un aviso que pedía apretar F12, que no existía en ningún
handler del proyecto; los dos están fuera. Si `read` es `false`, la página lo
dice y no afirma nada del input.

### Por que `catalog` va una sola vez

`icons`, `cats` y `maxWeight` no cambian en toda la partida. Mandarlos en cada
push sumaría ~700 caracteres en un canal con tope de 255 por evento, o sea 12
trozos que no aportan nada. Se mandan la primera vez que se abre el menú, con
el flag `_catalogSent`, que **solo se levanta si la tanda salió completa**: si
algún trozo falla, se reintenta al frame siguiente en vez de dejar la página sin
iconos.

El orden importa: primero `uistate` (abre el panel), después `catalog`. Al revés
se ve el panel un instante con la tabla sin iconos.

### Latch por firma, no flood

`broadcast()` corre en **todos** los frames pero solo emite cuando el estado
difiere de verdad. Como `inputState()` devuelve una copia nueva en cada llamada,
el latch es la **firma**, no el objeto:

```javascript
var st = inputState();
st.menu = anyVisible;
var sig = st.read + "|" + st.mode + "|" + st.keys + "|" + st.focus + "|" + st.anyMenu;
if (_lastUiState !== sig) {
    _lastUiState = sig;
    send("uistate", st);
}
```

Sin esto, cada frame mandaría el estado y la cola de 256 se llenaría en ~2 s
con el menú abierto.

El cursor y el freeze no salen de acá: los lleva `gsis_Input.js`, que es el dueño de esas
dos cosas. Van en **setters separados** (`setMenuCursor` y `setMenuGameState`) porque los
prenden motivos distintos: el cursor lo necesita cualquier menú —sin él no se puede
clickear una fila— y el freeze solo los que son de pausa. Hoy coinciden (los cinco son de
pausa), pero están separados para que volver a encender el camino de proximidad sea cambiar
un argumento y no reescribir el bridge. Ver [gsis_INPUT.md §6](./gsis_INPUT.md).

## 5. Troceado: por que el payload va partido

`SAWEB_SEND_EVENT` lleva el payload como **string de parametro de comando CLEO**.
El plugin lo lee con capacidad `unsigned char`, o sea **255 es el tope duro**:

```cpp
// SAWebCleo.cpp:192
std::string GetString(Context context, unsigned char capacity = 255) {
```

Un snapshot completo ronda los 800 caracteres. Si se mandara entero y se
truncara, el trozo llega como JSON valido pero corrupto, la pagina arma una
string rota, `JSON.parse` falla, el error se va a `console` -invisible sin
devtools- y el menu se ve vacio sin explicacion.

Por eso el bridge trocea con `PUSH_CHUNK = 60` y la pagina reensambla. Con 60 el
`dataJson` queda en ~80 caracteres, lejos de cualquier tope plausible. Medido en
juego: `inv: 819 chars en 14 chunks`.

**El limite es del comando, no de la frecuencia.** Mandar algo una sola vez no
lo esquiva: el catalogo son ~1440 chars (45 iconos + 3 bandas) y se trocea igual,
en 25 trozos. Por eso el troceado vive en `pushChunked(name, json)`, que sirve
para cualquier canal, y la pagina tiene un buffer por canal en `_trozos` para
que `inv` y `catalog` no se pisen.

La pagina **reensambla y recien ahi muestra el resultado**: si falta un trozo,
`_diag` dice cual y la lista queda como estaba. No hay estado a medio construir.

## 6. Ritmo de push

| Parametro | Valor | Donde |
|---|---|---|
| `PUSH_MS` | 400 ms | `modules/ui/index.js` |
| `PUSH_CHUNK` | 60 chars | `modules/ui/bridge.js` |
| `DEBOUNCE_MS` | 200 ms | `modules/ui/index.js` |
| `MAX_COMMANDS_PER_FRAME` | 4 | `modules/ui/bridge.js` |
| `HOLD_MS` (tecla X) | 600 ms | `app.js` |

`pushInventory()` se auto-limita por tiempo **y** compara el JSON con el ultimo
enviado: un menu abierto quieto no genera trafico. El precio es que un cambio
tarda hasta 400 ms en verse, imperceptible para un menu.

La excepcion es `pushInventory(force)`: despues de una accion de la pagina se
manda igual, porque 400 ms de espera despues de un click se siente roto. El
throttle existe para no pagar el stringify en cada frame, no para retrasar la
reaccion.

## 7. Los comandos de la pagina

### El protocolo

La pagina emite con el prefijo `cmd:` y el mod despacha:

```javascript
// app.js
emitCommand({ cmd: "inv:equip", id: "ak47" });   ->  cola: saweb:main:cmd:inv:equip
```

```javascript
// modules/ui/bridge.js  —  el transporte. No sabe que significa cada verbo.
function drainCommands(handler) {
    for (var i = 0; i < MAX_COMMANDS_PER_FRAME; i++) {
        var cmd = SAWeb.takeCommand(UI_ID);
        if (!cmd) break;
        handler(cmd);
    }
}
```

Los comandos salen del **nombre del evento**, no del payload. El prefijo `cmd:`
es lo que el runtime usa para decidir que encola para el mod.

El `handler` que se le pasa es `_alComando`, armado en `ui/index.js`: un objeto con
`handleCommand` y las funciones de visibilidad. Va así porque
`commands.js` necesita llamar a `togglePanel`/`abrirFlujo`/`cerrarVisible`/`closeFlow`, que viven
en `index.js`, y un import en las dos direcciones sería un ciclo — y un ciclo
entre dos archivos de este paquete es un `undefined` en el menú. Lo que **no** va
por ahí es el transporte: que haya un comando no depende de que el canal ande, y
meterlo en la misma caja haría que un problema de SAWeb pareciera un problema de
la UI.

`drainCommands()` se drena **con el menú cerrado también**. No es un detalle:
`ui:toggle` y `flow:open` son justamente los comandos que reabren, así que gatearlos
por `menuVisible` los deja muertos por construcción. El costo es un `takeCommand()` por
frame con el menú cerrado; la página visible está siempre, así que en teoría
podría mandar algo en cualquier momento y dejarlo acumular sería peor.

### Los veintitrés comandos

> Esta tabla se contrasta con `modules/ui/commands.js`. Los nombres anteriores
> (`inv:mount`, `inv:unmount`, `inv:belt`, `inv:belt:off`, `flow:toggle`) ya no
> existen: los de armas toman `inv:attach` / `inv:detach` /
> `inv:equipMag` / `inv:unequipMag` / `inv:fillMag`, y la apertura de esfera es
> `flow:open`, que **no** alterna —el cierre es `ui:close`.

| `cmd` | Payload | Qué ejecuta | Quién valida |
|---|---|---|---|
| `inv:equip` | `{ id }` | `equipar(id)` | `modules/weapons/gsis_Weapons.js` |
| `inv:unequip` | `{ slot }` | `desequipar(slot)` | `modules/weapons/gsis_Weapons.js` |
| `inv:equipMag` | `{ id }` | `equiparCargador(id)`: saca el cargador de la mochila y lo pone en una ranura | `modules/weapons/gsis_Weapons.js` |
| `inv:unequipMag` | `{ indice }` | `guardarCargador(indice)`: lo saca de su ranura y lo devuelve | `modules/weapons/gsis_Weapons.js` |
| `inv:fillMag` | `{ indice, equipado }` | `llenarDesdeCaja(equipado, indice)`: `equipado` dice si el índice es una ranura o un lugar de la mochila | `modules/weapons/gsis_Weapons.js` |
| `inv:attach` | `{ id, slot }` | `montarSilenciador(slot, id)`: consume la pieza de la mochila y la monta | `modules/weapons/gsis_Weapons.js` |
| `inv:detach` | `{ slot }` | `quitarSilenciador(slot)`: lo saca y lo devuelve a la mochila. **Sin `id`**: es el que el arma ya tiene | `modules/weapons/gsis_Weapons.js` |
| `inv:drop` | `{ id, qty }` | `removeItem(id, qty)` | `modules/inventory/index.js` |
| `trunk:put` | `{ id, qty }` | `putInTrunk(id, qty)` | `gsis_Trunk.js` |
| `trunk:take` | `{ id, qty }` | `takeFromTrunk(id, qty)` | `gsis_Trunk.js` |
| `dealer:add` | `{ id, qty }` | `addToCart(id, qty)` | `gsis_WeaponDealer.js` |
| `dealer:cart:remove` | `{ id, qty }` | `removeFromCart(id, qty)` | `gsis_WeaponDealer.js` |
| `dealer:cart:clear` | — | `resetCart()` | `gsis_WeaponDealer.js` |
| `dealer:checkout` | — | `checkout()` | `gsis_WeaponDealer.js` |
| `pickup:take` | `{ id, qty }` | `collectItem(id, qty)` | `gsis_DealerPickup.js` |
| `pickup:takeAll` | — | `collectAll()` | `gsis_DealerPickup.js` |
| `pickup:cancel` | — | `cancelOrder()`: **devuelve el dinero** del pedido pendiente y lo borra | `gsis_DealerPickup.js` |
| `seller:offer` | `{ id, qty, price }` | `doOffer(id, qty, price)` | `gsis_WeaponSeller.js` |
| `seller:quote` | `{ id, delta }` | `moveOffer(id, delta)`: las teclas `+`/`-` y los botones del pie. **Sin** `clearNotice()`, porque el aviso que quedó trae el precio seguro, que es justo el dato que se está ajustando | `gsis_WeaponSeller.js` |
| `ui:close` | — | `cerrarVisible()`: cierra **lo que se está viendo** —el panel si está abierto, si no el flujo | `modules/ui/index.js` |
| `ui:toggle` | — | `togglePanel()`: `closeMenu()` si está abierto, si no `openMenu()`, y **con un flujo abierto no hace nada** | `modules/ui/index.js` |
| `flow:open` | — | `abrirFlujo()` → `openFlow()`: prueba los cuatro menús de esfera y gana el primero que puede abrir. **Con el inventario abierto no hace nada** | `modules/ui/index.js` → `views/flow.js` |
| `ui:diag` | `{ dice, flow, menu, hidden }` | **no es una acción**: la página reporta qué recibió y qué clase quedó en el DOM, y el módulo lo loguea. No cambia nada | `modules/ui/index.js` |

**Recargar no es un comando.** La recarga es la tecla `R`, y la lee
`gsis_Weapons.js` en su update (`keyJustPressed(KEYS.RELOAD) → recargar()`), no
la página. Hubo un `case "inv:reload"` y se borró porque nadie lo emitía, y un
`case` que nadie emite es código que no se puede probar (§7, "Un comando muerto
también es falla"). Para que la recarga sea una acción del panel hay que
agregar el botón y el `case` juntos.

Tres detalles del contrato que no se deducen de la tabla:

- **`inv:attach` / `inv:detach` son el único camino al silenciador.** La `R` solo
  cambia cargadores; sin esto, los tipos 60 y 61 serían inalcanzables desde el
  juego. `inv:attach` lleva el **slot** del arma y no su id, porque puede haber
  más de una equipada.
- **`clearNotice()` va al principio de cada comando de flujo.** No es cosmético: un
  comando que vuelve temprano por payload inválido no escribe aviso, y si el
  anterior siguiera pendiente la página repetiría el mensaje viejo como si fuera la
  respuesta de este.
- **Un comando que revienta no se lleva el frame.** `handleCommand` tiene el
  `try/catch` alrededor del `switch`, y un comando desconocido se loguea **una
  sola vez** por nombre, no en cada frame.

`flow:open` existe por lo mismo que `ui:toggle` y `ui:close`: **el bridge es el
dueno de la tecla, y no la ve cuando la pagina tiene el teclado**. La
pagina traduce la `ESPACIO` (con `preventDefault`, que si no hace scroll la caja) y
el bridge la despacha a la **misma** `abrirFlujo()` que usa la tecla. El debounce de
200 ms es lo que evita que la misma pulsación, que llega por los dos caminos, se
cancele a sí misma. Ver [INPUT §4.1 y §7](./gsis_INPUT.md).

### Por qué existe `ui:diag`

**La página es ciega para diagnosticar.** Sus `_diag()` escriben en
`console.log`, y el runtime **no captura `OnConsoleMessage`**: esa salida no
queda en ningún archivo. Así que el mod podía decir `menu=0` mientras la página
mostraba un panel, y los dos datos vivían en universos distintos: la
contradicción se tenía que buscar a ciegas.

`ui:diag` pone los dos lados **en el mismo log**. En cada `uistate` la página
manda qué le llegó y — esto es lo importante — **`hidden`, la clase que
realmente quedó en el DOM, no la que se pidió**. Cuando lo que se ve mal es que
algo quedó prendido, lo que importa es el resultado, no la intención.

Esto no es hipotético: el bug del panel fantasma se cerró de este modo. Con
`menu:false` dos veces seguidas:

1. La primera vez `setPanelVisible(false)` ve el panel prendido, le pone
   `panel--closing` y programa el timer de cierre.
2. La segunda vez ve que ya tiene `hidden` y **retorna temprano, sin programar
   nada**.
3. `setPantalla("")` —que antes decidía la visibilidad de `#panel`— le **quitaba**
   ese `hidden` con `toggle("hidden", false)`.

Resultado: **el panel prendido para siempre**, sin timer que lo apague, con los
datos del último snapshot. Por eso `hidden` es el campo que se loguea, y por eso
`setPantalla()` ya no toca la visibilidad de `#panel`: esa es de
`setPanelVisible()` y de nadie más. Cubierto por `check_render.mjs`.

El prefijo del comando es el id del menú (`trunk`, `dealer`, `pickup`,
`seller`), así que en el log se lee en qué panel se ejecutó sin que el payload
lleve el menú adentro. Es el mismo nombre que usa `registerMenuSource()` en cada
módulo y que viaja en `uistate.flow`.

**Los valida el módulo dueño, no el bridge.** Cada caso de `handleCommand` es una
línea que delega: el pre-chequeo de peso, los límites de cantidad y el mensaje de
error viven en el módulo (`putInTrunk`, `doOffer`, `collectItem`), no en
`ui/commands.js`. La razón es que la página ve un snapshot que tiene hasta
400 ms: si el peso lo calculara la página, su respuesta sería la de hace un
snapshot. El bridge no sabe cuánto pesa un baúl.

`ui:close` es **un** comando para las dos cosas. La página no sabe si hay un
flujo abierto —o no debería saberlo— así que manda lo mismo para cerrar un panel
o un menú de esfera, y es el mod el que decide, con la misma regla que decide
qué pantalla se ve (`pantallaVisible()`): **cierra lo que el jugador está
viendo**, no lo que haya abierto.

`ui:toggle` y `flow:open` **no tienen su propia lógica**: llaman a `togglePanel()`
y `abrirFlujo()`, que son las mismas funciones que usan las teclas `I` y `ESPACIO` del
mod. Es a propósito — la tecla y el comando son la misma acción, y si cada una
decidiera por su cuenta una de las dos terminaría abriendo algo que la otra prohíbe, que
es exactamente la interfaz rota que la regla 1 prohíbe (ver `gsis_UIDESIGN.md` §3.1).

Con un flujo abierto, `togglePanel()` ignora y loguea: la `I` es del inventario,
y con el baúl abierto lo que se ve es el baúl. Tampoco lo "cierra" — no hay
inventario abierto que cerrar. Un cuarto uso de `togglePanel()` significa que
alguien se la saltó por un camino, y `check_pantallas.mjs` lo falla.

`abrirFlujo()` es el camino **único** de apertura de los cuatro menús de esfera, y lo
comparten tres teclas (`ESPACIO`, `INTRO` y `F`): tres teclas, una función. No
alterna —abrir y cerrar en el mismo comando es lo que hacía que la apertura tuviera
que preguntar primero si había algo abierto—, y no cierra nunca: el cierre es
`ui:close`, con `F` o `ESC`. `abrirFlujo()` llama a
`openFlow()` —que prueba los cuatro y gana el primero que puede— **salvo que esté el
inventario abierto**, en cuyo caso no hace nada. Con las dos funciones así, el estado
"inventario visible y un menú de esfera abierto del lado del módulo" es inalcanzable: la
`I` no abre el inventario con un flujo abierto, y la `ESPACIO` no abre un flujo con el
inventario abierto. Antes ese estado sí se daba, y el flujo esperaba turno.

`inv:unequipMag` va por **índice de ranura**, no por id, porque puede haber dos
cargadores del mismo tipo —el vacío y el lleno— y la ranura es lo único que los
distingue. Antes esto era `inv:belt:off` y hablaba de "casilla del cinturón"; el
cinturón de dos casillas es ahora las dos ranuras de equipados.

Los dos de `ui:` existen por el consumo de teclas. Cuando la página se queda con
el teclado, el WndProc hace `return 0` y el juego nunca ve ese `WM_KEYDOWN`: el
menú solo se cerraría sacando el puntero del panel. El canal de retorno no
depende del input, así que funciona siempre. Ver
[gsis_INPUT.md §7](./gsis_INPUT.md).

Los dos pasan por el mismo `DEBOUNCE_MS` que las teclas del mod. Sin eso, cerrar
con Escape desde la página y la `I` del mod en el mismo frame se anulan y el
menú cierra y abre.

La página elige la acción por tipo de item (`actionFor` en `app.js`) en el
inventario, y por **pantalla** (`PANTALLAS[id].acciones` y `pieAcciones`) en los
menús de proximidad. Un comando desconocido se loguea **una sola vez** y se
ignora; un comando que revienta se loguea y el frame sigue.

El payload tiene que entrar en 255 chars: son `{cmd, id, qty, price}` chicos,
nunca el snapshot. Para datos grandes esta el otro sentido (`ui.send`), que trocea.

> **El contrato de los nombres va en los dos sentidos y se rompe callado.** La página emite
> `cmd:X` y el mod lo busca en un `case "X"`. Si uno de los dos cambia un nombre,
> `node --check` no dice nada y en el juego el comando no tiene efecto. Por eso
> `check_pantallas.mjs` (en el temp del proyecto) compara los dos conjuntos: todo
> `cmd:` que emite la página tiene su `case`, y todo `case` tiene un `cmd:` que
> lo mande. Un comando muerto también es falla.

### Donde se dispara

| Superficie | Como |
|---|---|
| Tecla `X` | **Al soltar**: un toque (menos de 600 ms) corre la acción **principal** de la fila —equipar un arma, equipar un cargador, llenar, quitar, montar el silenciador—; mantenerla 600 ms y soltar tira **una** unidad |
| Tecla `Enter` | Con un menú de proximidad, la acción principal de la fila. **En el inventario no hace nada** |
| Tecla `I` | `ui:toggle` (ignorado con un flujo abierto) |
| `Escape` | Con el menú contextual abierto lo cierra; si no, `ui:close` |
| Flechas | Mueven la selección, con `scrollIntoView` para que no se salga de la caja |
| `W` `S` | **Alias de las flechas**, arriba y abajo. Son de las teclas que sí ve la página |
| `Home` / `End` | Primera / última fila |
| `PageUp` / `PageDown` | Una caja de alto |
| `←` `→` o `Q` `E` | Cambio de banda (inventario) o de lista (baúl) |
| `ESPACIO` | Abre el menú contextual de la fila elegida (solo en el inventario) |
| `ESPACIO` / `Enter` / `W` `S` | Con el menú contextual abierto: `ESPACIO` e `INTRO` ejecutan el renglón, `W` `S` y las flechas lo recorren |
| Keycaps del pie | Los dos `<button data-action>` del pie hacen lo mismo con un click |
| Click en fila | Selecciona. La ventana de detalle ya no existe: el detalle esta en el `title` de la celda |

> **`X` y las flechas no las ve la página: las reenvía el puente.** En el juego la `X`
> y las flechas llegan al juego, no a la página (lista y evidencia en
> [gsis_INPUT.md §4.2](./gsis_INPUT.md)). Por eso la `X` va por un canal del puente y
> las flechas horizontalmente no sirven para recorrer el menú contextual — `W` `S` sí,
> y `↑` `↓` tampoco llegan. Para el inventario y los menús de esfera, `Q` `E` cambian
> de banda y no hay alternativa de teclado.

### La `X`: dos acciones en un gesto

La `X` **no ejecuta nada al apretar**: solo arma el reloj. Lo que se ejecute lo
decide el **soltar**, y el tiempo es lo único que decide:

| Mantenida | Ejecuta |
|---|---|
| < 600 ms (toque) | La acción **principal** de la fila |
| ≥ 600 ms | `inv:drop` de **una** unidad |

Decidir al soltar no es un detalle: decidir al apretar es lo que hacía que un click
que se lingeriera un frame tirara un item. Con las dos cosas en el soltar, un item
solo se borra si el jugador lo estuvo apretando 600 ms.

La principal es `principalDeFila()`: **la primera acción del registro `ACCIONES` que
le sirve a la fila** — la misma regla del menú contextual, cuyo primer renglón es la
principal — y corre por `runAccion()`, o sea el mismo camino que el menú. La `X` y
`ESPACIO` + `INTRO` no pueden divergir.

**`drop` queda excluida de la principal, a propósito.** "Tirar" es la única acción
del panel que no se puede deshacer, así que no puede ser la que dispara un toque. Si
lo fuera, una fila que solo ofrece tirar —un material, que no se equipa ni se monta—
borraría el item con un click, y el gesto de mantener la `X` dejaría de ser la única
forma de hacerlo. Por eso una fila que solo tiene "Tirar" **no tiene principal**: la
`X` no hace nada con un toque y hay que mantenerla.

> **Lo que esta fila de la tabla antes decía, y por qué se corrigió:** decía que la
> `X` al apretar "ya no hace equipar, porque esa acción se fue con el sistema de
> armas". Era falso —el sistema de armas está entero, y `data/gsis_item_data.js`
> tiene `colt45`— y el código cumplía la frase equivocada. El `Enter` del inventario
> **sigue** sin hacer nada, que es otra cosa: ese sí es un hueco real, y está
> anotado acá para que no se confunda con el de la `X`.

### El menú contextual con teclado

El menú contextual de la fila —el del click derecho— se abre y se recorre entero
desde el teclado. No es un camino nuevo a las acciones: es el **mismo** `#ctxmenu`,
armado por `abrirCtxMenu()` desde las dos entradas.

| Tecla | Que hace |
|---|---|
| `ESPACIO` | **Abre** el menú de la fila elegida, anclado a la fila |
| `W` / `↑` | Renglón anterior |
| `S` / `↓` | Renglón siguiente |
| `ESPACIO` o `Enter` | **Corre** el renglón elegido —equipar, llenar, quitar, montar, tirar— y cierra el menú |
| `Escape`, `I`, `F` | Lo cierran |

La `F` cierra el menú de opciones como cierra cualquier otra cosa del panel, y por
el camino del puente: la lee `cerrarVisible()` en `pollKeys()`, que ve que hay algo
en pantalla y lo cierra. No pasa por la página —el runtime no le deja ver la `F`, y
tampoco la `X`, la `R` o la `D`; la lista y la evidencia están en
[gsis_INPUT.md §4.2](./gsis_INPUT.md)—, así que no es la rama del contexto de
`app.js` la que la atiende, sino el puente.

Eso significa que la `F` cierra el menú contextual **y el panel que está detrás**, en
la misma pulsación, en vez de primero el contexto y después el panel con un segundo
toque. `Escape` e `I` sí cierran solo el contexto, porque esas dos sí llegan a la
página. No es una diferencia que se note: los tres borran el menú de la pantalla.

La `ESPACIO` es la tecla de **aceptar** del menú, y hace las dos mitades del mismo
gesto: abre la lista y ejecuta el renglón marcado. `Enter` hace exactamente lo
mismo, por la misma función —no es redundancia: son las dos teclas de "aceptar" que
el panel ya tenía, y el menú no tiene por qué elegir una sola.

> **La `ESPACIO` antes cerraba el menú en vez de ejecutarlo.** Con eso el menú se
> podía recorrer con el teclado pero no accionar: había que abrir con `ESPACIO`,
> bajar con `S` y apretar `Enter`. El `Enter` funcionaba; la `ESPACIO` no hacía
> nada útil. Ahora las dos hacen lo mismo, y cerrar quedó en `Escape`, `I` y `F`.

La `F` tiene doble sentido en el contrato —abre esfera con la pantalla cerrada y
cierra el panel con la abierta—, así que la fila de arriba es una de las dos: con
el menú abierto cierra **el menú**, y con el inventario abierto y sin menú sigue
mandando `ui:close`, y con nada en pantalla sigue mandando `flow:open`. Las tres
están probadas.

Las seis reglas que sostienen esto:

- **`inventarioVisible()` es la guarda, y no `!pantallaActual()`.**
  `pantallaActual()` devuelve `uiState.flow || ""`: `""` para el inventario **y**
  para "no hay nada en pantalla". O sea que `!pantallaActual()` es verdadero en los
  dos casos, y lo único que impedía que el menú se abriera con el inventario
  cerrado era que la rama de "abrir esfera" está antes en el handler y se come la
  `ESPACIO` primero. Eso es un accidente del orden de ramas: reorderarlas abría el
  menú con el panel cerrado sin que nada lo pidiera. La guarda mira el estado, así
  que ningún orden la puede romper.
- **`inventarioVisible()` son las dos mitades de REGLA 1 a la vez:**
  `uiState.menu === true && !uiState.flow`. `menu` sola no alcanza —es `true`
  también con un menú de esfera abierto—, y `flow` sola no describe nada visible.
- **La guarda está también dentro de `abrirCtxMenuEnFila()`,** no solo en la tecla:
  es la única que construye el menú, y con la guarda solo en el llamador el otro
  llamador —el click derecho, que solo puede venir de `#rows`— tendría que
  confiar en que el panel está a la vista.
- **Solo en el inventario.** Los cuatro menús de esfera ya tienen su equivalente —
  la barra de acción, con `↑↓` y su `Enter` (`correrPrincipal`) —, y poner un
  segundo menú contextual arriba sería dos respuestas a la misma tecla.
- **`ESC`, `I` y `F` cierran el contexto antes que el panel, y la `ESPACIO` ya no
  lo cierra.** El menú vive en `body`, **fuera** de `#panel`, así que no se apaga
  con él: si la `I` llegara a su rama, cerraría el panel de atrás y dejaría el
  menú flotando solo en pantalla. Por eso la rama del contexto va **antes** que las
  de `I` y `F`. Y las tres están explícitas en esa rama, no en un `return` genérico:
  como la rama va antes que la de `Escape`, un `return` al final se come el `ESC` y
  el menú no cierra. El `return` final es solo para las teclas que no son del
  contrato.
- **La `W`/`S` se anotan aparte y no en el alias de `nav`.** El alias de más abajo
  traduce `W`/`S` a flechas para mover la **fila**; con el menú abierto la fila
  está detrás del menú, y la que se mueve es la elección del menú. Misma tecla,
  distinto destino, y por eso dos ramas y no una.

El `Enter` dispara `b.click()` y no `runAccion()` con el id reconstruido: el click
ya sabe que la fila es `_ctxRow` —la que estaba abierta, no la que quedó elegida
después—, y esa es la distinción que evita que la acción caiga sobre otra.

Y el renglón elegido se marca con `.is-sel`, no con `focus()`: `:focus-visible`
depende de cómo el navegador decide el foco, y con foco programático —que es lo
único que hay acá, la `ESPACIO` abre sin que el puntero se mueva— Chrome no lo
aplica siempre. El puntero encima también mueve la elección, para que el `Enter`
que venga después ejecute lo que está **debajo del cursor** y no lo que estaba
elegido al abrir.

> **Lo que NO se cambió, a propósito:** el pie (`HINT_TECLAS`) sigue siendo la misma
> línea en los cinco menús. Anunciar "ESPACIO: menú de la fila" solo en el
> inventario rompería la regla de que el contrato sea idéntico en los cinco, que es
> lo que evita que el jugador tenga que reaprender al cambiar de panel. El menú
> contextual es un overlay modal: cuando está abierto tapa el pie igual que el
> click derecho lo tapaba.

En los menús de proximidad el mapa es otro, y lo declara cada pantalla en
`PANTALLAS[id].teclas` (el pie lo anuncia, así que no hay una tecla fija escrita
en el teclado):

| Tecla | Que hace |
|---|---|
| `↑` `↓` | Mueven la selección de la lista activa |
| `←` `→` | Cambian de lista (solo en el baúl, que tiene dos) |
| `Tab` / `Shift+Tab` | Eligen qué campo de la barra de acción mueve `+` / `−` |
| `+` `−` | Mueven el valor del campo elegido, con tope en la fila |
| `Enter` o `X` | La acción principal de la barra de acción |
| La tecla de cada botón del pie | La que declara `pieAcciones[].tecla` (`P` pagar, `V` vaciar, `A` recoger todo) |

El umbral de la `X` se decide **al soltar**, no al apretar: si no, un click que
se lingeria un frame tiraría un item.

Hay una guarda que no es cosmetics: el `keyup` que decide el drop vuelve
**falso** si `_xDownAt` sigue en `0`, que es el valor inicial y significa "no
hay pulsación en curso". Sin ella, un `keyup` sin `keydown` previo —lo que pasa
si el jugador llega al menú con la `X` ya mantenida, porque todos los `keydown`
llegan con `repeat` y el guard `!e.repeat` los descarta— calculaba
`performance.now() - 0`, que siempre supera el umbral, y **borraba un item**. Es
la única acción del panel que no se puede deshacer.

La `X` y los keycaps actuan sobre la **fila seleccionada**, que es el unico
estado que la pagina conoce. El mod no sabe cual es - no lo necesita, porque la
pagina manda el `id` explicito.

### Si el canal no esta

`canCommand()` (en `ui/bridge.js`) prueba el comando una vez en `init`. Con la ASI
v1 (sin `SAWeb_PollCommand`) el comando no existe, `native()` tira y el canal queda
desactivado **para siempre**: la UI se degrada a solo lectura sin que se note y
sin reintentar cada frame.

En el log: `canal de acciones activo (SAWeb v2)` o el motivo del
`NO disponible`.

## 8. Los cuatro menus de esfera

Baúl, armería, retiro y trueque se abren con `ESPACIO` parado adentro de su esfera
y se cierran con la misma tecla, con `ESC` o con el botón de la página — el mismo
panel que el inventario, con otra función. La página tiene una ventana por menú,
todas con la misma tabla y el mismo tamaño; solo una está visible a la vez, y es la
que dice `uistate.flow`.

El que decide cuál está abierto es `currentFlow()` en
`modules/ui/views/flow.js`, que consulta a los cuatro módulos por su
`isXMenuVisible()`. Ese mismo archivo tiene `openFlow()`, que el bridge llama cuando
la `ESPACIO` no tenía nada que cerrar: prueba los cuatro en orden y gana el primero
que puede abrir. No hay una segunda copia de esa lista en el bridge: el nombre
del id es el mismo que usa `registerMenuSource()` y el mismo que el prefijo del
comando. Ver [SPOTS §3](./gsis_SPOTS.md#3-c%C3%B3mo-se-abre-y-se-cierra-un-men%C3%BA-de-esfera).

### El payload

Un archivo arma los cuatro snapshots (`ui/views/flow.js`), no uno por
menú: el canal es uno, así que la forma del payload quedaría repartida en cuatro
lugares y cada campo nuevo habría que acordarlo cuatro veces.

```js
{
  id: "trunk",                       // lo pone snapFlow() después de armar
  titulo: "Baul - Infernus (411)",   // ya traducido, con t()
  subtitulo: "ESPACIO: menu | 3: cerrar baul | ...",
  notice: "~r~Baul lleno (libre 1.3 kg, necesitas 2.5 kg)",  // o null
  panes: [
    { key: "mochila", titulo: "MOCHILA", vacio: "(inventario vacio)",
      weight: 6.2, max: 12, rows: [ /* filas de ui/views/itemRow.js */ ] }
  ],
  pie: { izq: "Tu dinero: $4.200", der: "Total carrito: $1.440" }  // o null
}
```

| Menú | `panes` | Columnas de la tabla | Barra de acción | Botones del pie |
|---|---|---|---|---|
| `trunk` | **2**: mochila y baúl | Las del inventario | Cantidad | — |
| `dealer` | 1: catálogo | Arma, Precio, Carrito | Cantidad | Pagar (`P`), Vaciar (`V`) |
| `seller` | 1: tus armas | Arma, Base, Oferta | Cantidad, Oferta | — |
| `pickup` | 1: líneas del pedido | Pedido, Queda, Salud, Peso, Valor | Cantidad | Recoger todo (`A`), **Cancelar pedido** |

**"Cancelar pedido" no es un extra**: el peso del pedido **no se reserva** al
comprar, se valida al recoger, así que contra el tope de 12 kg hay pedidos que no
caben nunca (2× RPG = 14 kg, 2× minigun = 20 kg). Sin cancelación el jugador
pagaba por algo que no podía recoger ni deshacer. Va en `pieAcciones` (no en la
barra) porque es del pedido entero, como "Recoger todo"; sin tecla propia para no
sumar una al mapa de atajos, y sin `principal` para que el Enter siga siendo
"Recoger". Reembolsa el dinero **nativo de CJ** (`addScore(+total)`), que es como
lo cobró `checkout` (`addScore(-total)`).

Las filas son de `ui/views/itemRow.js` —la misma fila que el inventario, con las
claves extra de cada menú: `precio`/`enCarrito` en la armería, `base`/`oferta` en
el trueque, `disponible` en el retiro. Es un archivo aparte y no una copia dentro
del inventario por la misma razón que el mapa de iconos: si cada pantalla
construyera su fila, divergirían calladas, y las reglas que trae (el recorte de
la munición a la capacidad, el guion en vez del cero) son de las que se rompen
sin que se note.

Dos que se notan en el recorte:

- **El denominador de la celda de munición** es el `rounds` del item, **no** la
  capacidad del motor. Son dos números distintos, y confundirlos hacía que la
  misma fila valiera distinto según el cargador montado: `"8/8"` en la colt
  pelada y `"15/15"` con el cargador extendido no son el mismo arma ni la misma
  munición.
- **La fila lleva la lista de accesorios** (`attachments`) y la de los que **no**
  son cargador (`otros`). La página decide si ofrece "Quitar accesorio" mirando
  `otros`, no deduciendo del prefijo `mag_` del id: la convención de nombres del
  catálogo no vive en el frontend. Ninguna de las dos listas lleva `weaponType`;
  el tipo se deriva, no viaja.

La banda de grupo de cada fila sale de `cat`. En la armería y el trueque es **la
categoría del arma** (`Pistolas`, `Escopetas`), no el `type` del item: con el
`type` quedarían todas las filas en una sola banda, que es el inventario con
otros números. `bandasDe()` ya agrega las categorías que no están en el catálogo,
así que no hizo falta nada para esto.

### El aviso

`notice` es el feedback de la última acción, y antes no había ninguno: el mod
escribía con `showTextBox()`, que dibuja abajo a la izquierda, detrás del panel.
Ese camino sigue —el texto sale de las teclas, no del mouse— pero ahora el mismo
texto viaja en el snapshot.

Va **ya traducido** (`t()`) y con los códigos de color del juego (`~r~` rojo,
`~g~` verde). La página saca los códigos y saca el tono del prefijo, así que el
mod no decide cómo se ve: lo decide la hoja de estilo. Un código suelto en medio
del texto se ve como basura, así que se sacan todos.

Es de un solo uso: `core/gsis_Notice.js` lo guarda y `pushScreen()` lo consume
justo antes de mandar. El orden importa en los dos sentidos:

- Si se consumiera en el comando, el throttle de 400 ms se lo comería cuando el
  push no salía en ese frame, y el aviso se perdería.
- La comparación de "cambió" se hace **sin** el aviso. Con él, dos avisos
  seguidos (apretar dos veces el mismo botón que falla) darían el mismo JSON y
  el segundo no se vería.

Por eso un error que no mueve nada —"no cabe"— igual llega: el aviso hace que el
JSON sea distinto aunque los datos sean los mismos.

### El presupuesto del comprador

`getSellState()` devuelve `budget: null` hasta que el jugador hizo su primera
oferta, y recién ahí lo manda. El gate está en el mod y no en la página a
propósito: si fuera en la página, el dato viajaría en el snapshot y cualquiera que
lea el log del bridge lo vería igual. Es la regla del juego, no una decisión de
diseño.

## 9. Pendiente (aun no implementado)

| # | Pendiente | Donde | Nota |
|---|---|---|---|
| 1 | Pestanas Propiedades / Vehiculos | `app.js` | Hoy muestran estado vacio. Falta `snapProperties()` / `snapVehicles()` en `ui/views/` |
| 2 | Tienda de propiedades | `gsis_PropertyModule.js` | Hay modulo y datos, pero no hay menu de proximidad ni comando: es el quinto overlay, si alguna vez hace falta |
| 3 | Datos enviados sin consumidor | `ui/views/inventory.js` | Se limpio: el snapshot de inventario ahora es `{ weight, rows }`. `money`, `belt` y `equipped` se mandaban en cada push y nadie los leia |
| 4 | L10n en la pagina | `app.js` | Los labels de los botones estan hardcodeados en espanol. Excepcion documentada en [gsis_MAINTENANCE.md §2.2](./gsis_MAINTENANCE.md). Los textos que vienen del mod si estan traducidos |
| 5 | Dependencia de otro mod sin declarar | `ui/bridge.js` | Importa el facade de SAWeb por ruta relativa; no esta en `mod.json` ni en el doc de setup |
| 6 | Menu contextual en los 4 menus | `app.js` | El click derecho es del inventario. Los 4 usan la barra de accion, que es mejor para una accion de dos pasos |

## 10. Reglas de la pagina

Las reglas de escribir una página para SAWebUI viven en el doc del runtime
([GUIA_WEB_CEF_ASI.md](C:\Dev\SAWebUI\docs\GUIA_WEB_CEF_ASI.md), *Anti-patrones*).
Acá solo las que **incumplirían el mod**, que son pocas:

- **No** definir `window.SAWeb` ni stubs: el shim es el dueño y los reemplaza.
- **No** definir `window.SAWeb.tick` fuera de un `if (window.SAWeb)`: si el shim
  no se inyectó, eso tira `TypeError` y se come el render entero.
- No emitir en cada `mousemove`: la cola de eventos de la ASI es de 256 y cada
  descarte queda logueado.
- Nada de actions que el mod no pueda recibir: el canal de vuelta es el de §7 y
  solo llega a los comandos que están en el `switch` de `handleCommand`.
- **No mantener estado de input propio.** Todo lo del input llega en `uistate`
  (`app.js: uiState`). La página no puede saber si el WndProc le está mandando
  teclas, y antes que inventar el dato tenía una bandera `focused` y un aviso
  que pedía apretar F12 —que no existía en ningún handler del proyecto. Un
  `keydown` con el teclado real apagado no es de una pulsación del jugador: por
  eso el handler arranca con `if (!tecladoEnLaPagina()) return;`.
- **No calcular lo que el juego ya sabe.** La página no mira precios, pesos ni
  capacidades: las recibe en el snapshot y manda el `id` con la intención. El
  unico calculo que hace es el tope visual de los steppers, y es una ayuda de
  lectura —el mod recorta otra vez, y es el que manda.

El resto de las reglas del runtime se cumplen y no hace falta repetirlas acá.

### Diagnostico

La pagina **no tiene** linea de estado en el DOM: el diagnóstico del transporte
va a `console` (`_diag()`). Existió una caja visible (`#diag`) que se sirvió
para esto, porque sin devtools un `JSON.parse` fallido se veía como un menú
 vacío; se retiró por tapar los botones de navegación.

Consecuencia asumida: un error de transporte es invisible en pantalla y solo
aparece en el log de CEF. Si vuelve a hacer falta, la receta correcta es un
flag de debug en el evento `uistate`, no una caja permanente.

## 11. Verificacion

Los checks de la UI viven en el temp (`%TEMP%\opencode`) y se ejecutan con node.
No son del mod: son herramientas de desarrollo, no archivos que el juego carga.
Los del mod (`.dat`, migracion de saves, flujo de armas) viven en
`.IronSyndicate\tools\` y estan en [gsis_TESTING.md](./gsis_TESTING.md).

| Check | Donde | Que cubre |
|---|---|---|
| `check_render.mjs` | temp | Corre el `app.js` en un DOM falso y compara el render. Modo juego (puente, canales troceados) y modo preview (mock). Detecta una columna mal, un `NaN` en una celda, un comando que no sale, una pane que no se dibuja |
| `check_pantallas.mjs` | temp | El contrato de los comandos en los dos sentidos, los ids de flujo, las claves de fila que la página lee y el mod escribe, y que toda clase que la página pone exista en el CSS |
| `check_imports.mjs` | temp | Imports que apuntan a algo que ya no existe, imports sin usar, ciclos entre módulos y claves de `t()` que no están en `gsis_lang_data.js` |
| `check_icons.mjs` | temp | Que todo id de `WEB_ICONS` exista en `ITEMS`, que todo PNG referenciado esté en `image\` y que los `magazine` de `ITEMS` sean exactamente los `magId` de `WEAPON_DATA` |
| `check-ui-flow.mjs` | `.IronSyndicate\tools\` | Las 4 configuraciones de un arma **desde el flujo real** (página → `commands.js` → `weapons/logic.js` → bus → motor), con `fake-engine.mjs` en lugar de GTA. Y que `weapons/` e `inventory/` no se importen |
| `check-dat.mjs` | `.IronSyndicate\tools\` | Que la tabla de armas, el `.dat` y el `.asi` digan lo mismo |
| `check-migration.mjs` | `.IronSyndicate\tools\` | Que los migradores del save sigan funcionando sobre saves de cada version |

```powershell
# Los del temp, en cualquier orden. Salida 0 = todo ok.
cd $env:TEMP\opencode
node check_render.mjs
node check_pantallas.mjs
node check_imports.mjs
node check_icons.mjs

# Los del repo
cd <gta>\.IronSyndicate
node tools\check-dat.mjs
node tools\check-migration.mjs
node tools\check-ui-flow.mjs
```

> **Los checks del temp quedaron atrasados y hay que saber leer su salida.**
> `check_pantallas.mjs` tira `ENOENT` sobre `modules\gsis_WebInterface.js`, que ya
> no existe (ahora es `modules\ui\`). `check_imports.mjs` reporta que cinco
> archivos importan de `data\gsis_weapons.js` nombres que "no exporta": es un
> **falso positivo** de su resolucion por regex, que no ve el `export *` del shim.
> Ninguno de los dos es un bug del mod —los tres checks del repo pasan—, pero
> ninguno de los dos se puede usar como luz verde hasta que se actualicen.

Y los que no necesitan node:

```powershell
# 1. Sintaxis de la página y del mod
$mod = "modloader\IronSyndicate\cleo\IronSyndicate"
$ui  = "modloader\IronSyndicate\UI"
Get-ChildItem -Path $mod,$ui -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }

# 2. Que la página no defina el shim
Select-String -LiteralPath "$ui\app.js" -Pattern 'window\.SAWeb\s*='

# 3. Que el contrato declarado coincida con lo que manda el bridge
Select-String -LiteralPath "$ui\app.js" -Pattern 'INBOUND = \['
Select-String -Path "$mod\modules\ui\*.js","$mod\modules\ui\views\*.js" -Pattern 'send\("|pushChunked\("'

# 4. Que la frontera inventory/ <-> weapons/ siga cerrada
#    (lo verifica tools\check-ui-flow.mjs; el grep es la version rapida)
Select-String -Path "$mod\modules\weapons\*.js" -Pattern 'from ".*inventory/'
Select-String -Path "$mod\modules\inventory\*.js" -Pattern 'from ".*weapons/'

# 5. Que nadie lea teclas por su cuenta (tiene que salir vacío).
#    Ver gsis_INPUT.md §9 para el resto de los chequeos del subsistema.
Get-ChildItem -Path $mod -Recurse -Filter *.js |
  Where-Object { $_.Name -ne "gsis_Input.js" } |
  Select-String -Pattern "Pad\.IsKeyJustPressed|isKeyPressed\("

# 6. Suite del runtime (shim embebido + facade + superficie de API + getter de input).
#    Vive en el proyecto del runtime, no en este: C:\Dev\SAWebUI
cd C:\Dev\SAWebUI; node tests\run.js
```

### El preview sin juego

La página se puede abrir en un navegador normal: sin puente, se aplica el mock y
**arranca con un menú de esfera abierto**, porque son los que tienen la tabla más
interesante para revisar y en el juego necesitan estar parado en una esfera para
verlos.

```
modloader\IronSyndicate\UI\index.html?flujo=trunk      (por defecto)
modloader\IronSyndicate\UI\index.html?flujo=dealer
modloader\IronSyndicate\UI\index.html?flujo=seller
modloader\IronSyndicate\UI\index.html?flujo=pickup
```

Los datos del mock están en `MOCK` y `MOCK_FLUJOS` (`app.js`) y tienen la misma
forma que los que manda el mod, **id incluido**: la página dibuja la pantalla
según el id del snapshot, así que un mock sin id dibuja el esqueleto vacío.

Lo que el mock **no** puede probar: si el `id` está, si el `qty` cabe, y los
precios —todo eso lo valida el mod y el preview no lo ejecuta.

En juego:

- `cleo_redux.log` tiene que mostrar los **once** comandos `SAWEB_*` registrados
  y ningun `unknown command SAWEB`. Ver la lista en la línea de abajo.
- `cleo.log` tiene que mostrar `[UI] canal de acciones activo (SAWeb v2)`.
  Si dice `NO disponible`, el comando no quedo declarado en
  `cleo\.config\sa.json` o la ASI es de otra versión.
- `cleo.log` **no** puede mostrar `[Input] SET_PLAYER_CONTROL no se pudo llamar`.
  Si aparece, el menú abre sin congelar al jugador y hay que revisar la firma. El
  camino de congelado se ejecuta con **cualquier** menú abierto —los cinco son de
  pausa—, así que el aviso aplica a todos.
- `SAWebUICef.log` tiene que dar `mode=1 keys=1` con el menú abierto. Y `keys=1`
  **también con el puntero afuera**: eso no es un bug, es que la región de input de
  la UI es la pantalla completa. `keys=0` con el menú abierto significa que el
  puntero todavía no se movió nunca.
- `cleo_redux.log` tiene que mostrar `Registering command SAWEB_` **once** veces y
  ningún `unknown command SAWEB`. Son los once de la API v5
  (`SAWebUI\cleo\SAWebUI\SAWeb.js`, `API_VERSION = 5`): `REGISTER_UI`, `OPEN_UI`,
  `CLOSE_UI`, `TOGGLE_UI`, `IS_UI_OPEN`, `SEND_EVENT`, `SET_CURSOR`,
  `POLL_COMMAND`, `GET_INPUT_STATE`, `SET_KEY_PASSTHROUGH` y
  `SET_GAME_MOUSE_BLOCK`. Con menos, falta alguno declarado en
  `cleo\.config\sa.json`.
- `I` abre/cierra el inventario, `↑↓` elige fila, `X` equipa, `X` mantenida tira,
  `Enter` equipa, `Escape` cierra.
- `ESPACIO` (o `INTRO`, o `F`) **abre** los cuatro menús de esfera, parado en la
  esfera; con el inventario abierto no hace nada. **Ninguna de las tres cierra**: el
  cierre es `F` o `ESC`. Y `cleo.log` tiene que mostrar
  `[UI] menu de dealer abierto por tecla ESPACIO`, y para el cierre
  `la pagina cerro el flujo <id>` si llegó por la página, o
  `menu de dealer cerrado por tecla <F|ESC>` si llegó por el teclado.
- El peso aparece con hasta 400 ms de retraso, y al instante después de una acción.
- En los cuatro menús de esfera: `cleo.log` **no** puede mostrar
  `comando desconocido`. Ese texto es la señal de que la página y el mod no
  coinciden en el nombre del comando, y es la única que aparece en el log cuando eso
  pasa.
- `cleo.log` tiene que mostrar `[UI] la pagina cerro el flujo <id>` cuando se cierra
  con `Escape` desde la página, y no `la pagina cerro el menu`. Si aparece el
  segundo con un menú de esfera abierto, el `flow` no está llegando y la
  página está viendo el inventario por debajo del flujo.
- Con un menú de esfera abierto el `cleo.log` **no** puede mostrar
  `el menu esta visible pero snapFlow() dio null`. Si aparece, el módulo publica
  su visibilidad antes de tener datos y el panel se ve vacío.
- Con un menú de esfera abierto, el **panel tiene que verse con contenido**.
  Un rectángulo negro sin título ni tabla es el síntoma de que el canal `screen`
  no está llegando; la causa más común es gatear el push con el flag del panel
  principal (`_uiState.menuVisible`) en vez de con el de "hay algún menú visible"
  (`_anyVisible`), porque un menú de esfera abre sin apretar `I`.
