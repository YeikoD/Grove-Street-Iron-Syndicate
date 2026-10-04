# GSIS — Diseno de Interfaz

Menús y notificaciones. **HUD overlay: ❌ Descartado** (solo inventario; ver roadmap 1.8).

> **Implementacion**: UI web CEF vía `SAWebUI.SA.asi` (ver
> [gsis_WEBUI.md](./gsis_WEBUI.md)). El diseño de abajo es de la etapa anterior y se
> conserva como referencia de intendcion; lo que está implementado es el panel
> de inventario descrito en §4, con las diferencias marcadas en cada sección.
> Los mockups de §3 (menú principal, ATM, Propiedad) **no existen** en la UI web.

---

## 1. Elementos en Pantalla (diseño original — HUD no implementado)

> Nota: el HUD de saldo/calor/zona fue descartado. El dinero se muestra solo en
> el panel Propiedades del inventario; el peso, en el menú principal de inventario.

### Ubicacion en Pantalla (referencia de diseño)

```
+--------------------------------------------------+
|  Saldo: $45,000                          [1*]    |  <- Saldo + Wanted
|                                          LS      |  <- Zona actual
|                                                  |
|                                                  |
|              (Pantalla del juego)                |
|                                                  |
|                                                  |
|  [INVENTARIO: 8.5/15 kg]                CALOR:35 |  <- Peso + Calor
|  Pony GSIS001                          [MAPA]    |  <- Vehiculo cercano
+--------------------------------------------------+
```

### Elementos del HUD (diseño — no implementado)

| Elemento | Posicion | Formato | Color |
|---|---|---|---|
| Saldo bancario | Arriba-derecha | `$XX,XXX` | Blanco |
| Dinero sucio | Debajo del saldo | `Sucio: $X,XXX` | Rojo suave |
| Zona actual | Arriba-centro | Nombre de zona | Gris |
| Wanted level | Arriba-derecha | Estrellas | Amarillo |
| Peso inventario | Abajo-izquierda | `[X.X/X.X kg]` | Blanco |
| Calor policial | Abajo-derecha | `CALOR:XX` | Rojo (alto) / Verde (bajo) |
| Vehiculo cercano | Debajo del peso | Modelo + Patente | Gris |

---

## 2. Renderizado del HUD — ❌ Descartado

El overlay El overlay fue descartado (roadmap 1.8). No hay archivo de HUD.
Información equivalente:

- **Dinero**: panel Propiedades del inventario (`Dinero: $`)
- **Peso**: menú principal del inventario (`Peso: X.X kg`)

---

## 3. Menu Principal de Interaccion

### Tecla de Activacion: I (abrir menu)

> El menu real es la pagina web de `UI\`, no el cajon de este mockup. La tecla es
> `I` (ver §7), y el diseño vigente está en
> [gsis_WEBUI.md](./gsis_WEBUI.md). Lo de abajo se conserva como registro de la
> intencion original de navegacion por teclas, que la pagina si respeta.

```
+------------------------------------------+
|      GROVE STREET IRON SYNDICATE         |
|                                          |
|  [1] Inventario                          |
|  [2] Cajero Automatico                   |
|  [3] Propiedades                         |
|  [4] Vehiculo                            |
|  [5] Mapa de Progresion                  |
|  [0] Cerrar                              |
+------------------------------------------+
```

### Navegacion

| Tecla | Accion |
|---|---|
| Flechas arriba/abajo | Mover cursor |
| Enter / Num5 | Seleccionar |
| 0 / Escape | Cerrar menu |

---

## 4. Submenus

### Menu de Inventario (implementado — `app.js`, página web)

> Mockup de la etapa anterior. La version web mantiene la
> lista por secciones sin menú de categorías, cuatro columnas por fila
> (Objeto | Cant | Balas | Peso | Valor) y banda de grupo por categoría, y agrega
> un encabezado de tabla que la version anterior no tenía. Solo la pestaña **INVENTARIO** está
> implementada; **PROPIEDADES** y **VEHICULOS** son rows placeholder.

Lista unica por secciones (estilo Kingdom Come Deliverance): sin menu de
categorias. Cuatro columnas por fila — Nombre | Cant | Peso | Info — con
separador entre filas. La seccion
**DOCUMENTOS** no lista elementos sueltos: son dos filas-resumen con la
cantidad de cada cosa y boton **Abrir**, y cada fila abre **su propia
ventana** (una sola cosa por ventana).

```
+--------------------------------------------------------------+
|  Inventario                                                  |
|  INVENTARIO                                                  |
|  Peso: 8.5 kg                                                |
|  ------------------------------------------------------------|
|  +--------------------------------------------------------+  |
|  | -- ARMAMENTO --                                        |  |
|  | 9mm                       x2      3.0 kg   Daño: 25    |  |
|  | ------------------------------------------------------ |  |
|  | Escopeta                  x1      3.0 kg   Daño: 130   |  |
|  | ------------------------------------------------------ |  |
|  | -- CARGADORES --                                       |  |
|  | Cargador 9mm - Calidad 1   x1      0.2 kg   12/17 balas|  |
|  | ------------------------------------------------------ |  |
|  | -- MATERIALES --                                       |  |
|  | Chatarra                  x10     5.0 kg   -           |  |
|  | ------------------------------------------------------ |  |
|  | -- DOCUMENTOS --                                       |  |
|  | PROPIEDADES                3       -        [Abrir]    |  |
|  | ------------------------------------------------------ |  |
|  | VEHICULOS                  1       -        [Abrir]    |  |
|  +--------------------------------------------------------+  |
|  ------------------------------------------------------------|
|  [                         Cerrar                           ] |
+--------------------------------------------------------------+
```

- Secciones vacias no se muestran; inventario vacio → `(inventario vacio)`.
- Ventana **PROPIEDADES**: dinero + fichas con boton Comprar + lista de
  documentos/escrituras (`DOC_CNT` / `DOC_NON`).
- Ventana **VEHICULOS**: solo las fichas de papeles de los vehiculos
  registrados (`DOC_NRV` si no hay).
- Ambas al lado de la lista (o encima si no hay sitio) y se cierran con
  **Cerrar** o con la X (vuelve la lista completa).

### Menu de ATM

```
+------------------------------------------+
|     CAJERO AUTOMATICO - Banco LS         |
|                                          |
|  Saldo: $45,000                          |
|  Sucio: $12,500                          |
|  Tasa actual: 0.63                       |
|                                          |
|  [1] Lavar $1,000  -> $630               |
|  [2] Lavar $5,000  -> $3,150             |
|  [3] Lavar TODO   -> $7,875              |
|  [0] Cerrar                              |
+------------------------------------------+
```

### Menu de Propiedad

```
+------------------------------------------+
|   ALMACEN GANTON - Nivel 2               |
|   Empleados: 3/5 | Stock: 150/500 kg    |
|                                          |
|  Produccion: 2.5 u/10min                 |
|  Nomina diaria: $350                     |
|                                          |
|  [1] Contratar Empleado ($100/dia)       |
|  [2] Despedir Empleado                   |
|  [3] Depositar Materiales                |
|  [4] Retirar Productos                   |
|  [5] Ver Produccion                      |
|  [0] Cerrar                              |
+------------------------------------------+
```

### Los cuatro menus de esfera (✅ implementados)

> **Donde están.** Cuatro paneles que se abren apretando `ESPACIO` parado adentro de
> su esfera: baúl (al lado de un baúl abierto), armería, retiro y trueque. Los cuatro
> son el mismo panel con otra función —misma tabla, mismo pie, mismas teclas— y lo
> único que cambia es qué muestran, que está entero en `PANTALLAS` (`UI/app.js`).
>
> **Son menús de pausa, como el inventario**: congelan al player, esconden el radar,
> encienden el cursor y suprimen los hotkeys. La única diferencia es la condición de
> entrada —la esfera— y el apagado de 6 s que sigue al cierre. La `ESPACIO` abre y
> cierra; el `Escape` y el botón de cerrar también cierran. Ver §3.1 y
> [gsis_SPOTS.md §3](./gsis_SPOTS.md).
>
> El diseño de abajo es la referencia de intención; la implementación usa los
> tokens de la casa (`.panel--flujo`, `.table`, `.accionbar`) en vez de los
> bordes dibujados. Ver [gsis_WEBUI.md §8](./gsis_WEBUI.md) para el contrato.

### 3.1 Las dos reglas de pantalla (no negociables)

Son dos reglas de diseño, no detalles de implementación. Las dos se rompen
facil con una línea cambiada, así que viven acá y tienen checks que las vigilan
(`check_pantallas.mjs`, sección *REGLAS DE PANTALLA*).

**Regla 1 — una sola pantalla a la vez.** El inventario y los cuatro menús de
esfera ocupan el mismo lugar. Si hubiera dos abiertos se taparían entre sí y
el jugador no sabría cuál está leyendo: el inventario se apagaría solo al
cerrarse el flujo, y la tecla que abría uno cerraría el otro sin querer.

Quién gana lo decide `pantallaVisible()` en `gsis_WebInterface.js`, y el que gana
es **el que ya está abierto**:

| Caso | Regla | Por qué |
|---|---|---|
| El jugador aprieta `I` con un flujo abierto | No abre el inventario | El jugador apretó `I`: quiere el inventario. Que le aparezca una armería porque está parado en la esfera es lo contrario de lo que pidió. |
| El jugador aprieta `ESPACIO` con el inventario abierto | No abre el flujo | El inventario se abre con `I` y se cierra con `I` o `Escape`. La `ESPACIO` no lo toca, así que no hay forma de que un menú de esfera aparezca por debajo. |

Las dos mitades son un solo botón, y las dos teclas tienen **un dueño**: el
bridge. La `I` del mod y el comando `ui:toggle` de la página llaman a la misma
`togglePanel()`; la `ESPACIO` del mod y el comando `flow:toggle` llaman a la misma
`toggleFlow()`. Si cada camino decidiera por su cuenta, uno de los dos terminaría
abriendo algo que el otro prohíbe. Por lo mismo `ui:close` cierra **lo que se está
viendo**, no lo que haya abierto.

Que el dueño de la tecla sea el bridge y no cada módulo es lo que hace que la
`ESPACIO` sirva para los cuatro: si los cuatro leyeran la suya, la misma pulsación
la verían los cuatro en el mismo frame, y el primero que la consumiera se la sacaría
al resto —un menu abriéndose y cerrándose en un frame, que es el síntoma más difícil
de ver de todos—. Con un dueño solo, la pulsación se gasta en **una** decisión:
cerrar lo que está abierto, o abrir lo que el jugador tiene adelante. Y que el abrir
y el cerrar estén en la **misma** función es lo que evita que una pulsación haga las
dos cosas.

Un menu de pausa sin freeze —o con freeze que se levanta solo— es el bug que la regla
2 arregla: el jugador ve a su personaje corriendo o disparando al fondo mientras
elige un item, y la cámara se queda donde el gameplay la dejó.

| Señal | Con cualquier menu |
|---|---|
| Cursor | **sí** — sin él no se puede clickear una fila |
| Freeze del player | **sí** — todos son de pausa |
| Click del mouse al juego | **no** — el click es de la página |
| Teclado | va a la página (con la `ESPACIO` y el `Escape` incluidos, si la página tiene el foco) |
| Radar oculto | **sí** |
| Supresión de hotkeys | **sí** |
| Se cierra con | la misma tecla que lo abre, `Escape` o el botón de cerrar |

Las dos filas del medio son el mismo arreglo y la misma razón: el **mouse del juego**
no es el **cursor del menú**. Son dos caminos distintos alimentando dos destinos
distintos — el click le llega a la página por el WndProc, y el juego lo lee aparte por
DirectInput—. Por eso hace falta el bloqueo del mouse (`setMenuGameMouse`) cuando un
menu **no** congela: congelado, el click no tiene a quién pegarle.

```js
// modules/gsis_WebInterface.js
setMenuCursor(anyVisible);
setMenuGameState(anyVisible);         // el freeze, con cualquier menu
setMenuKeyPassthrough(null);          // dormido: sin teclas para el juego
  setMenuGameMouse(anyVisible);         // el juego no ve el mouse con el menu abierto (§6.1 de gsis_INPUT.md)
setMenuAnchor(false);                 // dormido: el ancla era para caminar con el menu
```

Si alguna vez hace falta un menu que **no** sea de pausa, el problema no es la línea:
es que ese menú se cierra alejándose. Ahí hay que volver a encender las tres llamadas
dormidas (y `updateProximityMove`, que hoy no tiene consumidor), que están escritas
y explicadas en [gsis_INPUT.md §6](./gsis_INPUT.md).

**Cómo se vigilan.** `check_pantallas.mjs` mira la *forma* de estas expresiones,
no su resultado — el freeze no se puede ejecutar en node porque toca el juego.
Falla si `congelar` vuelve a mencionar `flow` o `anyMenuVisible`, si el
`openMenu()` de `togglePanel()` queda antes del guardia del flujo, si `ui:close`
cierra el flujo antes que el panel, si los dos snapshots dejan de ser excluyentes,
o si aparece un cuarto uso de `togglePanel` (alguien se la saltó por un camino).

Del lado del passthrough también: falla si la lista se manda para el panel
principal (dejaría el menú de pausa con el teclado en el juego), si `MOVE_KEYS`
deja de venir de la config, o si el setter pierde el latch y termina mandando un
`native()` por frame.

**Quién apagaba el panel: un dueño, no dos.** La regla 1 no se sostiene sola. En
la página hay dos funciones que deciden qué se ve —`setPanelVisible()` para el
inventario y `setPantalla()` para los flujos— y durante un tiempo las dos
tocaron la clase `hidden` de `#panel`. Con un solo escritor anda; con dos aparece
esto:

1. Llega `menu:false`. `setPanelVisible(false)` ve el panel prendido, le pone
   `panel--closing` y programa el timer de cierre. `setPantalla("")` no hace nada,
   porque `toggle("hidden", false)` sobre un panel que ya no tiene `hidden` quita
   una clase que no está. El timer corre y lo apaga. **Todo bien.**
2. Llega `menu:false` otra vez. `setPanelVisible(false)` ve que el panel ya tiene
   `hidden` y **retorna temprano**: no hay nada que apagar, no programa nada. Pero
   `setPantalla("")` sí actúa, y le **quita** ese `hidden`.

El panel queda **prendido para siempre**, con el snapshot viejo, y sin ningún timer
que lo apague: la animación de salida ya se había programado en el paso 1, y en el
2 no se reprograma. Es lo que se veía en el juego al salir de una esfera — un
panel de inventario con datos viejos, o vacío si el snapshot nunca había llegado,
que solo se iba al apretar `I` porque eso sí pasaba por `setPanelVisible(true)`.

El arreglo es de una línea de responsabilidad: **`setPanelVisible()` es la única que
decide si `#panel` está visible, y `setPantalla()` solo elige qué flujo se ve.** Con
`id === ""` no toca `#panel`; con un flujo le *agrega* `hidden`, porque el flujo y
el inventario son hermanos en `document.body` y no se excluyen solos.

Lo que hace el bug fácil es el **return temprano**: no es un error de la línea que
quita el `hidden`, es que la línea anterior dejó de hacer su parte sin avisar. Por
eso el invariante que hay que mirar después de cada `uistate` es la clase que
**quedó**, no la que se pidió:

```js
panelEl.classList.contains("hidden") === !uiState.menu
```

Y por eso `ui:diag` loguea `hidden` y no `dice`: cuando lo que falla es que algo
quedó prendido, el resultado es la información y la intención no. Ver
[gsis_WEBUI.md](./gsis_WEBUI.md) § *Por qué existe `ui:diag`*.

**Baul.** El único de dos listas. Va al centro de la pantalla, con la mochila a
la izquierda y el baúl a la derecha: son dos columnas iguales (`grid 1fr 1fr`),
y a la izquierda quedaría con la mitad del ancho y los nombres no entrarían. Es
el único que no usa el ancho del panel principal, y por eso tiene su propia
variante de posición y tamaño (`.panel--centro`).

```
+--------------------------------------------------------------+
|  Baul - Pony (413)                                           |
|  ESPACIO: menu | 3: cerrar baul | ESC: cerrar el menu             |
|  ------------------------ ----------------------------------- |
|  MOCHILA  3.5/12kg        |  BAUL  12.0/400kg                 |
|  -- Armas --              |  -- Armas --                      |
|  [img] AK-47    30/30  …  |  [img] Escopeta  1/1    …        |
|  -- Materiales --         |  -- Materiales --                 |
|  [img] Chatarra x5   2.5  |  [img] Chatarra x10   5.0        |
|  ------------------------ ----------------------------------- |
|  AK-47   Cantidad − 1 +   Guardar en baul                   |
|  6.0/12kg                                     ←/→ lista   |
+--------------------------------------------------------------+
```

- El peso de cada lista va en **su** encabezado, no en el pie: el pie es del
  menú entero y el baúl tiene dos pesos distintos.
- `←` `→` cambian de lista. Es el mismo gesto horizontal del inventario (donde
  cambian de filtro) para el mismo propósito: moverse entre listas.
- La barra de acción dice "Guardar" o "Sacar" según de qué lista vengas, y el
  botón principal es el único que cambia: es el mismo comando con el sentido
  contrario.
- Una sola selección: la de la lista activa. La otra se ve entera, para
  comparar, pero no se puede apuntar con el teclado.

**Armeria.** Catálogo con precio y cuanto hay ya en el carrito. La banda de
grupo es **la categoría del arma** (`Pistolas`, `Escopetas`), no el `type` del
item: con el `type` quedarían todas las filas en una sola banda, que es el
inventario con otros números. El carrito se paga desde el pie (`P` y `V`), no
desde la barra: pagar no es una acción sobre la fila elegida sino sobre el
carrito entero, que no es ninguna fila.

```
+---------------------------------------------+
|  Armeria Mayorista                           |
|  Vendedor local                             |
|  -- Pistolas --                              |
|  [img] 9mm         $480            [img] 2  |
|  -- Escopetas --                             |
|  [img] Escopeta    $1050           [img] 0  |
|  -- Fusiles de asalto --                    |
|  [img] AK-47       $1800           [img] 1  |
|  -------------------------------------------|
|  9mm    Cantidad − 1 +     Agregar al carrito|
|  Tu dinero: $4.200  Total: $1.440  [Vaciar] [Pagar] |
+---------------------------------------------+
```

**Retiro.** Las líneas del pedido con lo que queda de cada una. "Recoger todo"
está en el pie porque es la única acción del mod que valida el peso del pedido
**completo** antes de tocar nada (`collectAll`): si no entra todo, no entra nada
y el pedido no queda mutilado.

```
+---------------------------------------------+
|  Retiro de pedido                           |
|  Pedido: $1440  |  Peso: 5.0 kg              |
|  -- Armas --                              |
|  [img] AK-47    Queda 1   3.5   [img]      |
|  -- Pistolas --                           |
|  [img] 9mm      Queda 2   1.5   [img]      |
|  -------------------------------------------|
|  AK-47   Cantidad − 1 +     Recoger        |
|  Libre en mochila: 5.8 kg        [Recoger todo] |
+---------------------------------------------+
```

**Trueque.** Negociación completa: cantidad, oferta por unidad, y el comprador
acepta o rechaza. La oferta arranca en el valor base, que es lo único que el
jugador puede calcular sin que el NPC le diga nada. `Tab` elige qué campo mueve
`+` y `−`, así que con dos campos no hay que adivinar.

```
+----------------------------------------------------------+
|  Trueque — Cliente local                                 |
|  Busca hoy: Fusiles de asalto, Escopetas                 |
|  -- Armas --                                              |
|  [img] AK-47      $900      $900                         |
|  [img] 9mm        $240      $240                         |
|  --------------------------------------------------------|
|  AK-47  Cantidad − 1 +  Oferta − $900 + $10 +  [Ofrecer]   |
|  Presupuesto: (no te lo dijo)                             |
+----------------------------------------------------------+
```

- `sellPrice = round(price * 0.6 / 10) * 10` (helper `getSellPrice`)
- Techo NPC: interés `sellPrice + rand(50,450)` · sin interés `+ rand(0,150)`
- El presupuesto se ve **solo después de la primera oferta**, y el gate está en
  el mod (`getSellState()` devuelve `budget: null` hasta entonces), no en la
  página: si fuera en la página, el dato viajaría en el snapshot y cualquiera que
  lea el log del bridge lo vería igual.
- El NPC también habla, con `emit("characters:say")`: el texto de diálogo y el
  aviso de la página son la misma key, en dos destinos. Ver
  [gsis_CHARACTERS.md](./gsis_CHARACTERS.md)

### Barra de accion y aviso

Las dos piezas que hacen que los cuatro menus sean el mismo menu con otra
función:

- **Barra de acción**: el nombre de la fila elegida, los campos (cantidad, y el
  precio en el trueque) y el botón principal. Los valores viven en la página
  porque son la intención del jugador todavía no confirmada; el mod recibe un
  comando con el número ya escrito y es el que valida.
- **Aviso**: una línea entre la tabla y la barra, que sale 3.8 s y se va sola.
  El texto llega con los códigos de color del juego (`~r~`/`~g~`) porque es el
  mismo `t()` de siempre, y el tono sale del prefijo: el mod no decide cómo se
  ve, lo decide la hoja de estilo. Es de un solo uso, y viaja aunque los datos no
  hayan cambiado —que es justo el caso de "no cabe".

El sistema de notificaciones para el resto del juego (HUD, de la etapa
descartada) sigue sin implementarse; ver §5. Lo que hay ahora es el aviso del
panel, que es un caso particular y no una cola de notificaciones.

---

## 5. Notificaciones

### Sistema de Notificaciones (❌ no implementado)

> **PENDIENTE, y es distinto de lo que hay.** El código de abajo es el diseño de
> la etapa anterior; **no existe en el mod**. Hoy los mensajes al jugador salen
> por `showTextBox(t("KEY"))` directo desde cada módulo.
>
> Lo que **sí** existe es el aviso del panel (§4): una línea de texto de un solo
> uso que viaja en el snapshot de la pantalla y se dibuja con `.aviso`. No es una
> cola de notificaciones —no hay lista, no hay posiciones apiladas, no hay
> duración por tipo— y no pretende serlo: cubre el caso de "una acción falló y
> el jugador tiene que saber por qué", que es el que `showTextBox` no puede
> cubrir porque dibuja abajo a la izquierda, justo detrás del panel.
>
> Lo que sigue siendo deuda real: el resto de los mensajes del juego (zonas,
> nyos, sistema) siguen saliendo por `showTextBox` y se leen cuando no hay un
> panel tapandolos.

Las notificaciones aparecen en la parte superior de la pantalla y desaparecen automaticamente.

> Textos al jugador: usar `t("KEY")` de [gsis_L10N.md](./gsis_L10N.md) — no hardcodear en `showTextBox`.

```javascript
const notifications = [];

function showNotification(text, duration) {
    notifications.push({
        text: text,
        startTime: Date.now(),
        duration: duration || 3000
    });
}

function renderNotifications() {
    const now = Date.now();
    let y = 10; // Posicion Y inicial

    for (let i = notifications.length - 1; i >= 0; i--) {
        const notif = notifications[i];
        if (now - notif.startTime > notif.duration) {
            notifications.splice(i, 1);
            continue;
        }

        showTextBox(notif.text);
        y += 30;
    }
}
```

### Tipos de Notificacion

| Tipo | Color | Duracion | Ejemplo |
|---|---|---|---|
| Info | Blanco | 3s | "Zona desbloqueada: San Fierro" |
| Exito | Verde | 3s | "Entrega completada: $35,000" |
| Advertencia | Amarillo | 4s | "Calor policial alto en zona" |
| Error | Rojo | 4s | "Fondos insuficientes para nomina" |
| Sistema | Cyan | 3s | "Nomina cobrada: -$800" |

En la página web estos tonos ya existen como custom properties
(`--tint-*-bg/bd/tx`), que es lo que usaría `toast--info|ok|warn|bad`.

---

## 6. Textos Fijos en Pantalla (FXT) — Opcional

Los textos FXT son opcionales. Se pueden usar para textos estaticos o como fallback, pero la UI se renderiza como HTML.

### Archivo de Textos (opcional)

```fxt
// gsis_text.fxt
GSIS_MENU_TITLE  Grove Street Iron Syndicate
GSIS_SALDO       Saldo
GSIS_SUCIO       Sucio
GSIS_INV_PESO    INV: {1}/{2} kg
GSIS_CALOR       CALOR:{1}
GSIS_ZONA        Zona: {1}
GSIS_CARGA       Carga: {1}%
GSIS_NO_MONEY    Fondos insuficientes
GSIS_UNLOCKED    NUEVA ZONA DESBLOQUEADA
GSIS_PAYDAY_OK   Nomina cobrada: -${1}
GSIS_PAYDAY_FAIL FONDOS INSUFICIENTES PARA NOMINA
```

### Uso de FxtStore

```javascript
FxtStore.insert("GSIS_SALDO", "$" + money, true);
Text.PrintNow("GSIS_SALDO", 1000, 2);
```

> Preferir `t(key)` + `initL10n()` (ver [gsis_L10N.md](./gsis_L10N.md)); `FxtStore.insert` manual solo para valores dinámicos puntuales. Keys fijas viven en `gsis_lang_data.js` / `gsis.fxt`.

---

## 7. Deteccion de Teclado

### Teclas Principales

| Tecla | Accion |
|---|---|
| O | Registrar/spawn vehiculo |
| I | **Panel web** (abre/cierra) |
| ESC | Cierra el panel web |
| L | Debug: +items |
| P | Bolso (si hay arma larga) |
| 1 / 2 / 3 | Motor / lock / baul |
| R | Recarga (swap de cargador en Ballistic) |
| B | Menu baul (se abre solo al lado de un baul abierto) |
| F | Dealer mayorista / retiro pedido / trueque (segun esfera cercana) |
| F5 | Guardar partida |

Todas vienen de `KEYS` en `core/gsis_Config.js`. La tabla de arriba es de
documentacion: ningun modulo decide por su cuenta si una de esas teclas actua.
Eso es `core/gsis_Input.js`, y la regla es una sola — **se leen con
`keyJustPressed(vk)`, que devuelve `false` mientras haya un menu abierto**. Asi el
menu es modal de verdad: con el panel abierto, `Q` no abre el mapa, `R` no
 recarga y `F` no abre el dealer. Ver
[gsis_INPUT.md §5](./gsis_INPUT.md).

> **`B` no puede cerrar el baúl.** Es la tecla que lo abre, y la segunda mitad del
> toggle es inalcanzable: `keyJustPressed` devuelve `false` mientras haya un
> menú abierto, y el menú del baúl es un `registerMenuSource` más. Se cierra
> con `3` (cerrar el baúl), alejándose (1.5 m) o con `Escape` desde la página.
> No es un bug del diseño, es lo que sale de que la tecla que abre sea la única
> que puede cerrar.

### Las teclas del panel web

Con el panel abierto el menu se siente como el de pausa: el player queda
congelado y la camara vuelve a su sitio. El teclado no se le quita a nadie; lo
que cambia es que un player congelado no reacciona. Lo resuelve
`setMenuGameState()` en `gsis_Input.js`.

Los cuatro menus de esfera **tambien son de pausa**, y por el mismo camino: se abren
apretando `ESPACIO` y se cierran con `ESPACIO`, `Escape` o el boton de cerrar. Antes
se abrian al tocar la esfera y se cerraban al alejarse, que con el freeze era un
soft-lock (congelado no habria forma de alejarse, y la tecla que los abria esta
suprimida mientras hay un menu abierto). Ver `gsis_INPUT.md` §6.

Lo que comparten con el panel principal es todo: el **freeze**, la camara detras del
personaje, el **cursor** (sin el no se puede clickear una fila), el **radar
oculto** y la **supresion de hotkeys** (mientras el menu esta abierto, `Q` no abre
el mapa). El estado del juego ya no depende de "de que clase es el menu":

```javascript
setMenuCursor(anyVisible);
setMenuGameState(anyVisible);
```

Lo que **no** comparten es la condicion de entrada: el inventario se abre en
cualquier parte y los de esfera solo con la esfera prendida y el jugador adentro. Y
al cerrarse uno, su esfera queda apagada 6 s (`TIMERS.SPHERE_COOLDOWN`): el menu
congela al jugador, asi que al cerrarlo sigue parado en el mismo lugar, y sin el
apagado cualquier chequeo de proximidad daria true en el frame siguiente.

La consecuencia de que el player arranque congelado es una trampa de UX: el menu
puede parecer trabado, porque el panel aparece en el medio de la pantalla, puede
quedar **debajo del puntero**, y con el puntero encima las teclas son de la
pagina — o sea que el jugador no tiene forma de saber que tiene que apretar algo.
Por eso los cuatro subtitulos dicen "ESPACIO o ESC para cerrar el menu" (`MENU_HNT`),
y por eso la pagina traduce la `ESPACIO` a `flow:toggle` cuando la tiene: sin eso,
con el puntero encima del panel la tecla no llegaria al mod.

Lo que apaga cada uno: `ui:close` cierra el flujo si hay uno y, si no, el panel.

### La excepcion: I, ESPACIO y ESC

Son las unicas tres que se leen **sin** supresion (`rawKeyDown`), porque tienen que
funcionar justo cuando el menu esta visible, que es el unico momento en que
interesan. Y aun asi no alcanzan: el WndProc de la ASI consume la tecla y el
juego no la ve, y no solo con el puntero sobre el panel sino con cualquiera, porque
la region de input de la UI es la pantalla completa (ver `gsis_INPUT.md` §2). Por
eso la pagina tambien pide la accion por el canal de retorno (`ui:close` /
`ui:toggle` / `flow:toggle`).

La `I` con un menu de esfera abierto se ignora y se loguea: el menu tiene la
pantalla, y cerrarla porque el jugador aproto la tecla del inventario seria apagar
algo que no esta mirando. La `ESPACIO` con el inventario abierto no hace nada, por
el mismo motivo al reves. Y el `Escape` sale siempre: es **un solo comando** para
las dos cosas, la pagina no sabe si hay un flujo abierto —ni deberia saberlo— asi
que manda `ui:close` siempre, y es el mod el que decide si lo que se cierra es el
baul o el inventario.

### Codigo de Deteccion

El bridge polea el rising edge a mano, porque `isKeyPressed` es estado sostenido
y hace falta el flanco:

```javascript
// modules/gsis_WebInterface.js
var keyI     = rawKeyDown(KEYS.INVENTORY);
var keySpace = rawKeyDown(KEYS.FLOW);
var justI     = keyI     && !_prevKeyI;
var justSpace = keySpace && !_prevKeySpace;
_prevKeyI     = keyI;
_prevKeySpace = keySpace;

if (justI)        togglePanel(now, "tecla I");
else if (justSpace) toggleFlow(now, "tecla ESPACIO");
```

El flanco va armado con la lectura **sostenida del teclado real**, no con
`Pad.IsKeyJustPressed`: el flanco del juego puede reportar la misma pulsacion dos
frames seguidos, y una pulsacion que se ve dos veces abre y cierra el menu en el
mismo instante. Ver `gsis_INPUT.md` §4.1.

El debounce tambien protege contra que la `I` del mod y el Escape de la pagina
se anulen en el mismo frame.

---

## 8. Paleta de Color (implementado)

Identidad: **verde Grove Street**. La fuente unica de color es
`modloader\IronSyndicate\UI\style.css`, en las custom properties del bloque
`:root` (líneas ~58-165). La página **no** tiene su equivalente de `COLORS`:
el CSS es la unica fuente de color de la UI.

Grupos disponibles: `--g-000` … `--g-950` (escala de grises), `--gold`, `--green`,
`--green-soft`, `--amber`, `--blue`, `--red`, las tríadas de estado
(`--tint-{info,ok,warn,bad}-{bg,bd,tx}`), los roles de superficie
(`--surface-{overlay,raised,hover,active,sunken}`), bordes (`--border-*`),
divisores, acentos (`--accent`), estados (`--state-{ok,warn,bad,info}`) y texto
(`--text-{body,muted,inverse,gold,accent,ok,warning,danger,info}`).

Reglas:

- Color nuevo → **custom property nueva** en `:root`, nunca un literal suelto en
  una regla. La hoja usa `--var` en todas las declaraciones.
- Estados de texto → `--text-ok` / `--text-warning` / `--text-danger` /
  `--text-info`, nunca un RGB calculado a mano.
- Tipografía: `--font-display` (Diploma/SAWeb Gothic, títulos), `--font-ui`
  (Arial Narrow, UI), `--font-mono` (Consolas, datos). Las tres se cargan con
  `@font-face` desde `UI\assets\`.
- Tamaños en `vh` (`--fs-xs` … `--fs-xl`) y espaciado en `--sp*`: la página
  tiene que escalar con la resolución.
- No reintroducir una paleta por codigo (0-255, estilo `COLORS.*`): el render no pasa
  por un framework. El color se resuelve en el CSS, y el CSS es la unica fuente.
