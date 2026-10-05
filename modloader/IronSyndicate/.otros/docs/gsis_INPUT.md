# GSIS — Input

> Teclado, menus y el estado que la pagina necesita para saber si el juego le
> esta dando el teclado a ella o se lo quedo el juego.
>
> El modulo es [`core/gsis_Input.js`](C:\Program%20Files\GTA%20SA\modloader\IronSyndicate\cleo\IronSyndicate\core\gsis_Input.js).
> Para como viaja el input hacia la pagina, ver
> [gsis_WEBUI.md](./gsis_WEBUI.md).

---

## 1. Que resuelve

El input estaba repartido en tres capas sin dueno, y ninguna podia preguntar nada:

| Capa | Que sabia | Por que no alcanzaba |
|---|---|---|
| Cada modulo | `Pad.IsKeyJustPressed(vk)` | 11 archivos leyendo teclas por su cuenta, ninguno mirando si habia un menu abierto |
| `gsis_WebInterface.js` | `_uiState.menuVisible` | "el menu esta visible" no es "la pagina esta recibiendo teclas" |
| `app.js` | `focused`, `inputOn` | Banderas propias de la pagina, que no puede leer el estado real del WndProc |

El resultado eran tres verdades sin validar ninguna contra las otras, y la
consecuencia visible: con el menu abierto, `Q` abria el mapa de GTA, `R`
recargaba el arma y `F` abria el dealer mientras el jugador elegia un item.

El problema de fondo era otro. En la ASI el teclado de la pagina **no es un
canal que se pueda consultar**: cuelga del mismo interruptor que el cursor, y
hasta la v3 del runtime no habia forma de leer si estaba abierto. Un mod solo
podia deducirlo, y toda deduccion es una oportunidad de mentir.

La v3 agrego `SAWeb_GetInputState`. Este modulo lo consulta una vez por frame y
lo reparte, asi que "la pagina tiene el teclado" paso de ser una opinion a ser un
dato.

## 2. La verdad del teclado: el cursor y el teclado son un interruptor

Esto no es una decision del mod, es como esta hecho el runtime, y conviene
entenderlo antes de tocar nada aca.

```cpp
// SAWebUI Main.cpp
bool UiTakesKeyboard() {
  return gCursorMode.load() != kCursorModeHidden && HasAnyOpenUi();
}
```

`SAWEB_SET_CURSOR` escribe `gCursorMode`. Leer el teclado es leer ese mismo
atómico. **No hay dos cosas que prender, hay una.** Por eso la doc del runtime
dice "son un interruptor, no dos" y por eso no existe forma de darle el teclado
a la pagina sin que el cursor aparezca.

Y el gate real del teclado son **dos** condiciones, no una:

```cpp
// case de teclas en el WndProc, desde la v4 del runtime
if (IsKeyPassthrough(static_cast<int>(wParam))) {
  break;  // la tecla es del juego (SAWeb_SetKeyPassthrough)
}
if (gFocusedUiId.empty() || !UiTakesKeyboard()) {
  break;  // la tecla sigue al juego
}
return 0;  // la pagina se la queda
```

### El hover no es un traspaso (esta parte se creia mal)

`gFocusedUiId` se llena cuando el puntero **pasa por encima** de la UI, y en
principio eso parecia un traspaso con hover: puntero arriba, la pagina tiene el
teclado; puntero afuera, el juego lo recupera.

No funciona asi, y saber por que es lo que evita un soft-lock. `FindUiUnderCursor`
decide con `state->viewRect`, y ese rect se arma asi:

```cpp
// SAWebUI Main.cpp, en el draw de la UI
state->viewRect.left = 0.0f;
state->viewRect.top = 0.0f;
state->viewRect.right = viewWidth;
state->viewRect.bottom = viewHeight;
```

La UI **es** un quad de pantalla completa —por eso el rect es la pantalla
completa—. O sea que `FindUiUnderCursor()` acierta en **cualquier** punto
mientras haya una UI abierta, y el `ReleaseUiFocus()` del mismo `WM_MOUSEMOVE`
no puede dispararse nunca.

> **Con un menu abierto, el juego no ve ninguna tecla desde el primer movimiento
> de mouse hasta que el panel se cierra.** No hay "puntero afuera": el puntero
> no puede estar afuera de algo que es toda la pantalla.

Y no hay forma de arreglarlo desde el mod. El WndProc ya hizo `return 0`, asi
que ni el juego ni las teclas polladas del mod (`rawKeyDown`) ven el
`WM_KEYDOWN`. La unica autoridad esta en la ASI.

Para un menu de pausa eso no importa: con el player congelado, que las teclas vayan
a la pagina es lo correcto. Antes los cuatro menus de proximidad eran un soft-lock
por esto —se cerraban **alejandose** y sin `W` no habia forma de alejarse—, y por
eso existian el passthrough (§6.3) y el ancla (§6.2). Hoy ningun menu se cierra
alejandose, asi que los dos estan apagados. Ver §6 y [SPOTS §3](./gsis_SPOTS.md#3-c%C3%B3mo-se-abre-y-se-cierra-un-men%C3%BA-de-esfera).

La salida es la v4 del runtime: el mod declara cuales son sus teclas de juego y la
ASI las saca del WndProc **antes** del gate de foco. Ver
`setMenuKeyPassthrough` mas abajo y `SAWEB_V4.md`.

El raton es distinto: se enruta por hit-test y nada mas
(`FindUiUnderCursor`), sin mirar el modo del cursor ni el foco. Por eso se
puede **clickear el panel con el cursor apagado** pero las teclas no llegan. Esa
asimetria es la razon de que el sintoma anterior fuera "los clicks funcionan y el
teclado no": la pagina lo interpretaba como "el teclado esta apagado".

## 3. Quien es dueño de que

| Cosa | Dueño | Nota |
|---|---|---|
| Si el teclado esta en la pagina o en el juego | `SAWeb_GetInputState` (la ASI) | Se consulta, no se supone |
| Si hay un menu abierto (de cualquier modulo) | `gsis_Input.js` | El menu principal mas las fuentes registradas |
| Que el cursor se vea | `gsis_Input.js` | Con **cualquier** menu abierto: sin cursor no se puede clickear una fila |
| Que el **juego** no vea el mouse | `gsis_Input.js` | Hoy se pasa en `false` siempre (§6.1). El teclado no se toca nunca por aca |
| Congelar al player y resetear la camara | `gsis_Input.js` | Con **cualquier** menu abierto: los cinco son de pausa (§6) |
| Que tecla se suprime | `gsis_Input.js` | Los modulos preguntan, no deciden |
| Que tecla abre/cierra cada menu | `gsis_WebInterface.js` | `togglePanel()` con `I`, `toggleFlow()` con `ESPACIO`. El dueno de las teclas de menu es del bridge (§4.1) |
| Como se ejecuta un comando de la pagina | `gsis_WebInterface.js` | `handleCommand()` |
| Que hace la tecla dentro de la pagina | `app.js` | Ya no inventa estado de input |

## 4. La API

Exportes. Cada uno tiene un consumidor; si uno queda sin uso se borra, porque
una API que nadie llama es documentacion que se contradice sola.

| Export | Para que | Consumidor |
|---|---|---|
| `keyJustPressed(vk)` | **El unico camino de lectura de teclas de los modulos.** Devuelve `false` si hay un menu abierto | Todos los modulos |
| `rawKeyDown(vk)` | Estado sostenido **sin** supresion. Solo el WebInterface lo usa, para `I`, `ESPACIO` y `ESC` | `gsis_WebInterface.js` |
| `registerMenuSource(name, fn)` | Un modulo con menu publica su getter de visibilidad en su `init` | Los 4 modulos de menu |
| `setMenuVisible(bool)` | El WebInterface marca el menu principal | `gsis_WebInterface.js` |
| `anyMenuVisible()` | OR de todo. La condicion de modalidad | Todos |
| `setMenuCursor(visible)` | El cursor. Lo necesita **cualquier** menu | `gsis_WebInterface.js` |
| `setMenuGameState(frozen)` | Freeze + camara. El parametro es "congelado" | `gsis_WebInterface.js` |
| `setMenuKeyPassthrough(vks)` | Las teclas que van al juego con la pagina focused. Hoy se pasa en `null` siempre (§6.3) | `gsis_WebInterface.js` |
| `setMenuGameMouse(block)` | Que el juego deje de ver el mouse. **Hoy se pasa en `anyVisible`** (§6.1) | `gsis_WebInterface.js` |
| `setMenuAnchor(on)` | El ancla: mantiene al player en su lugar **sin quitarle el control**. Hoy se pasa en `false` siempre (§6.2) | `gsis_WebInterface.js` |
| `updateProximityMove(proxOpen)` | Devuelve si el jugador **pidio moverse** (flanco de WASD del teclado real). **Sin consumidor**: era del camino de proximidad, que ya no existe (§6.4) | — |
| `refresh()` | Lee la ASI. La llama el WebInterface una vez por frame | `gsis_WebInterface.js` |
| `inputState()` | Copia del estado real, para propagar | `gsis_WebInterface.js` |

El cursor y el freeze estan en setters separados porque se han prendido y apagado
por motivos distintos: el cursor lo necesita cualquier menu, y el freeze solo los
que son de pausa. Hoy coinciden, pero estan separados para que volver a encender el
camino de proximidad sea cambiar un argumento y no reescribir el bridge.

### 4.1 Quien lee las teclas de menu

**El bridge, y solo el bridge**: `I`, `ESPACIO` y `ESC` se leen en `pollKeys()` con
`rawKeyDown`, y el flanco lo arma el mismo archivo (`down && !_prevKey`), no
`keyJustPressed`.

Tres razones, y las tres importan:

1. **`keyJustPressed` no puede abrir nada.** Suprime con "hay menu abierto", asi que
   para abrir un menu —que es justo cuando no hay ninguno— devuelve `false`.
2. **El flanco del juego se repite.** `Pad.IsKeyJustPressed` lee el estado del
   pad, que puede reportar la misma pulsacion dos frames seguidos: alimentado a otro
   detector de flancos produce pulsos dobles, y una pulsacion de `I` abria y
   cerraba el inventario dos veces. `GetAsyncKeyState` da `false` en cuanto el dedo
   suelta, haya pasado la tecla por el WndProc o no.
3. **Un dueño por tecla.** Con los cuatro menus de esfera leyendo `ESPACIO` por su
   cuenta, la misma pulsacion la verian los cuatro en el mismo frame y el primero
   que la consumiera se la sacaria del resto. Con un dueno solo, la pulsacion se
   gasta en **una** decision: cerrar lo que esta abierto, o abrir lo que el
   jugador tiene adelante. Que el abrir y el cerrar esten en la misma funcion
   (`toggleFlow`) es lo que evita que una pulsacion haga las dos cosas.

### La X: una tecla que la página no ve, y por qué

`I`, `ESPACIO` y `ESC` se leen en el puente y la página los espeja como comandos. La
`X` —la acción principal de la fila— **no sigue ese camino**, porque **la página no
la recibe**.

El runtime de la página tiene una lista de teclas que manda al juego en vez de a la
página. Se ve en `SAWebUICef.log`:

```
SAWeb tecla UI abierta: VK=88 bajada (passthrough)
```

**Y no es una lista que el mod pueda vaciar.** `setMenuKeyPassthrough(null)` se llama
todos los frames desde `broadcast()` y el runtime lo aplica —`SAWeb key passthrough:
0 tecla(s)`, 348 veces en el log— y las teclas siguen yendo al juego. El comando
escribe una lista y el log lista de otra, y manda la segunda.

Medido sobre una sesión completa, las teclas que la página **no** ve:

| No llega | Vk | Sí llega |
|---|---|---|
| `X` | 88 | `W` `S` `A` |
| `R` | 82 | `ESPACIO` (32) |
| `D` | 68 | `I` (73) |
| `T` `H` `N` `F` `Z` | 84/72/78/70/90 | `ESC` (27), `INTRO` (13) |
| `←` `↑` `↓` | 37/38/40 | `E` (69), `Q` (81) |
| `F1` `F3` `F5` `F6` `F8` `F11`, `4` `8` `9` | — | |

La asimetría es lo que la delata: de la fila de WASD solo la `D` se va al juego. No es
una lista de teclas de juego —la `D` no es de juego—, es una lista interna de la ASI.

**Qué se hace con esto.** El puente, que es el dueño de las teclas de menú (§4.1) y las
lee con `rawKeyDown`, lee la `X` también y **se la reenvía a la página** por un canal
`x` con las dos mitades de la pulsación:

```
mod reenviarX()  ──send("x", {fase:"down"})──▶  pagina: armarX()
               ──send("x", {fase:"up", ms})──▶  pagina: resolverX(ms)
```

Las dos mitades viven en la página (`app.js`), que es donde está el registro `ACCIONES`
y la fila elegida. El mod solo dice "bajo" y "subo tras N ms"; no mira el inventario ni
decide qué hacer.

**Las dos entradas no pueden correr la acción dos veces.** En el juego la página no ve
la `X`, así que la entrada real es el canal; en el preview no hay runtime que la retenga
y la entrada real es el teclado. Si las dos llegaran, `armarX`/`resolverX` son
idempotentes —la segunda llamada encuentra la bandera de "hay pulsación" en false o
`_xFired` en true y no hace nada—, y hay una prueba que manda las cuatro cosas y
comprueba que sale **una** acción.

**Consecuencia, y es la menor:** `F` tampoco la ve la pagina, asi que la atiende el
puente. Con el menu contextual abierto, eso significa que la `F` cierra el menu **y el
panel de atras** en la misma pulsacion, en vez de cerrar primero el contexto y despues
el panel con un segundo toque. `Escape` e `I` cierran solo el contexto porque si llegan
a la pagina.

No se nota: los tres borran el menu de la pantalla. Lo que no se puede es usar la `F`
como cierre en dos niveles, y para eso haria falta un handshake —el puente manda, la
pagina contesta si lo tenia, el puente solo cierra el panel si la respuesta fue "no"—,

## 5. La regla de los modulos

**Un modulo lee teclas solo con `keyJustPressed`.** No hay excepciones ni
atajos, y la razon es que un modulo que use `Pad.IsKeyJustPressed` se saltea la
supresion sin dejar rastro.

```javascript
// Asi:
import { keyJustPressed } from "../core/gsis_Input.js";
if (keyJustPressed(KEYS.REGISTER)) { ... }

// Asi no, y no hay forma de que se note que esta mal:
if (Pad.IsKeyJustPressed(KEYS.REGISTER)) { ... }
```

### Por que la supresion mira "hay menu" y no "la pagina tiene el teclado"

Porque son condiciones distintas, y con el menu abierto las dos cosas pasan:

| Puntero | El juego ve las teclas | `keyJustPressed` |
|---|---|---|
| Sobre el panel | No | `false` |
| Afuera del panel | **Si** | `false` |

Con el puntero afuera el juego recupera el teclado, asi que una supresion
atada a `keys` dejaria resucitar `Q`, `R`, `F`, `1`, `2`, `3` en cuanto el
jugador moviera el mouse. La supresion tiene que valer en los dos casos para
que el menu se sienta modal de verdad.

> La segunda fila de esa tabla describe la **intencion** del modelo: el teclado
> es de la pagina con el puntero arriba y del juego con el puntero afuera. En el
> runtime **no es lo que pasa** —la region de input de la UI es la pantalla
> completa, asi que con el menu abierto `keys` queda en `1` para siempre— y por
> eso la conclusion de arriba no se sostiene tal cual: si la supresion estuviera
> atada a `keys`, `Q`/`R`/`F` no resucitarian al mover el mouse porque el juego
> no los ve. La supresion por "hay menu" sigue siendo la correcta, pero por el
> motivo del §2, no por el de esta tabla. Ver [gsis_UIDESIGN.md §3.1](./gsis_UIDESIGN.md).

`rawKeyDown` es la unica excepcion y es del WebInterface: sus teclas de abrir y
cerrar tienen que funcionar **justo** cuando el menu esta visible, que es el
unico momento en que interesan. Ver §4.1.

## 6. Congelar al player (y el camino de proximidad, dormido)

### El freeze: todos los menus son de pausa

**Con cualquier menu abierto.** Los cinco: el inventario (`I`) y los cuatro menus
de esfera (`ESPACIO`). Congelan al player y le vuelven a poner la camara atras, que
es lo que hace el menu de pausa de San Andreas. Es la diferencia entre "una pagina
dibujada encima del juego" y "un menu del juego".

El bridge lo pide con la misma condicion para todos —`setMenuGameState(anyVisible)`—
porque ya no hay dos clases de menu que tratar distinto. Cuando las habia, el
inventario congelaba y los menus de proximidad no: se cerraban alejandose, y
congelado no se puede caminar, o sea que congelarlos era un soft-lock (§6.2).

**Todos los menus siguen teniendo el cursor**, para poder clickear una fila, y eso
lo da `setMenuCursor()` con cualquier menu abierto. Por eso el cursor y el freeze
no son el mismo setter.

### Lo que se apago, y por que

El camino de(menu de proximidad —el ancla, el passthrough de WASD y el bloqueo del
mouse— esta escrito y **dormido**: el bridge los llama en `false` en cada frame.
Se conservan porque son el unico lugar donde se sabe como se le habla a la ASI
para eso, y volver a encenderlos es cambiar los argumentos que les pasa el bridge,
no reescribirlos.

| Dormido | Existia para | Por que ya no hace falta |
|---|---|---|
| `setMenuAnchor` (§6.2) | Parar al player **sin** congelarlo, para que se alejara y cerrara el menu | El menu congela. Anclar es para poder caminar con el menu abierto |
| `setMenuKeyPassthrough` (§6.3) | Que la `W` del "alejate" llegara al juego con la pagina tomando el teclado | Ningun menu se cierra alejandose |
| `setMenuGameMouse` (§6.1) | Que un click que se escapaba a la pagina no golpeara a quien estuviera enfrente **y que el juego no le recentre el cursor al usuario** | Congelado no hay a quien pegarle, pero **congelar no suelta el mouse**: el juego sigue leyendo deltas y recentrando el puntero. Ver §6.1 |
| `updateProximityMove` (§6.4) | Detectar que el jugador queria moverse para soltar el ancla | Sin ancla no hay nada que soltar. Ademas el export quedo **sin consumidor** |

Lo que sigue en §6.2 a §6.4 esta como estaba, y explica el problema que existia y
que volveria a existir el dia que un menu vuelva a cerrarse alejandose. Es la
documentacion de por que el codigo sigue ahi y apagado.

### El bug que faltaba: el menu de proximidad no paraba a nadie

Con el menu abierto, el juego puede quedarse creyendo que `W` sigue apretada: con
la pagina tomando el teclado, el `WM_KEYUP` de la `W` que el jugador solto no lo ve
nadie (el WndProc lo enruto a la pagina y la tecla ya se perdio). El personaje
**sigue caminando solo**, se sale de la esfera y el menu se le cierra en la cara.
Para usar un menu de proximidad hay que estar parado en el, y el menu no paraba a
nadie.

Ese semaforo no se puede levantar desde el mod: no hay comando en la v5 del runtime
que le mande un key-up al juego, y `setMenuKeyPassthrough` no sirve para eso —esa
lista existe para que la tecla **llegue**, no para soltar la que quedo pegada—.

Con los menus de ahora el problema no aparece: congelados, el juego no necesita ver
la `W` porque el player no camina.

### El ancla: pararlo sin quitarle el control

Lo que si se puede es que **al ped no le importe lo que el juego creo del teclado**:
mientras el jugador no apriete una direccion de verdad, se le devuelven sus
coordenadas. `setMenuAnchor()` en `core/gsis_Input.js`.

**No es un freeze.** El player conserva el control entero: camara, clicks, armas,
entrar a un auto. Lo unico que no puede es *moverse*, y en el frame en que aprieta
una direccion el ancla se suelta y camina normal. Eso lo decide `updateProximityMove`.

| Momento | Ancla | Que ve el jugador |
|---|---|---|
| Toca la esfera | **Si** | El menu aparece y **el personaje se para** |
| Esta parado, elige un item | **Si** | El mundo quieto, cursor y click en las filas |
| Apreta `W` (o cualquier direccion) | No | Camina con el menu abierto |
| Se aleja mas de 1.5 m | No | El menu se cierra solo |

```javascript
// modules/gsis_WebInterface.js — como queda HOY
setMenuCursor(anyVisible);
setMenuGameState(anyVisible);              // el freeze, con cualquier menu
setMenuKeyPassthrough(null);               // sin teclas para el juego (§6.3)
  setMenuGameMouse(anyVisible);               // el juego no ve el mouse con el menu abierto (§6.1)
setMenuAnchor(false);                      // sin ancla (§6.2)

// Y como era con los menus de proximidad (DORMIDO, no se borra):
// var panel = _uiState.menuVisible;
// var prox  = anyVisible && !panel;
// var sale  = updateProximityMove(prox);   // se llamaba SIEMPRE
// setMenuGameState(panel);                 // solo el panel congelaba
// setMenuAnchor(prox && !sale);            // el ancla, solo la proximidad
```

Detalles del ancla que no son gusto:

- **El punto es donde estaba**, no el centro de la esfera: el jugador tiene que
  poder quedarse donde entro.
- **`SET_CHAR_HEADING` va despues de cada correccion.** `SET_CHAR_COORDINATES` no
  lleva el heading, y sin eso el ped queda mirando al norte cada vez que se corrige.
- **Una sola correccion por frame, y solo si se movio de verdad** (2 cm). Caminar son
  ~4 cm por frame, asi que en la practica corrige casi todos los frames; el
  threshold existe para no gastar un native en frames tranquilos.
- **Un salto de mas de 3 m no se corrige: el ancla se corre.** Eso no es drift del
  teclado, es otra cosa moviendo al ped (un script, una explosion), y
  teletransportarlo de vuelta podria arruinarle una cutscene.
- **Al enganchar se borra la tarea del ped** (`CLEAR_CHAR_TASKS`), una sola vez: si
  entro caminando, sin eso se queda con la animacion de caminar puesta. Despues el
  juego le vuelve a poner la tarea de caminar —por el input que el cree apretado— y
  por eso esta el snap de cada frame. `CLEAR_CHAR_TASKS` por frame no alcanza: la
  tarea se vuelve a crear en el mismo frame.
- **En un auto el ancla se suelta.** El menu ya se cerro si el player entra a un
  auto (`closeSpotFlow`), asi que es el caso raro de un script que lo mete en un
  vehiculo con el menu abierto.

### El flanco, y del teclado real

Tres detalles de `updateProximityMove(prox)`, que devuelve `true` desde el primer
flanco de `WASD` hasta que el menu se cierra:

- **Flanco, no nivel.** El caso que se arregla es entrar a la esfera con `W`
  apretada. Con el *nivel* de la tecla, esa `W` ya apretada contaria como "el
  jugador pide moverse" y el ancla no se pondria nunca. Con el flanco hay que
  soltar y volver a apretar: el menu para, y recien ahi una pulsacion lo saca.
- **El latch.** Si dependiera del nivel, cada vez que el jugador suelta la
  direccion volveria a pararse en el medio de un paso, que se ve peor que el
  problema que arregla.
- **Se lee con `readDown`** —`isKeyPressed` > `GetAsyncKeyState`, o sea el teclado
  REAL), no con `Pad.IsKeyPressed`, que lee el estado del juego: en este escenario
  justo lo que esta trabado es el estado del juego, y leerlo ahi daria "el jugador
  pide moverse" para siempre, con lo que el ancla no se pondria nunca. Si el build
  no tiene lectura real, `_movimientoConfiable()` lo detecta, avisa una vez y **no
  ancla**: un ancla sin forma de soltarse seria el soft-lock que este modulo no va
  a tener, y el menu se comporta como antes (el jugador camina y se sale de la
  esfera, que es el bug reportado).

### La tecla fantasma, y como se diagnostica

`_avisarFantasma()` (dentro de `setMenuAnchor`, una vez por menu) compara lo que el
teclado dice con lo que el juego cree, y loguea si no coinciden:

```
[Input] tecla fantasma: el juego cree que la W esta apretada y el teclado no. El
key-up se perdio en el WndProc; se limpia con la proxima pulsacion de esa tecla que
llegue al juego. Por que el ancla existe.
```

Importa porque la fantasma **se limpia sola**: la proxima pulsacion de esa tecla
que llegue al juego le manda el `WM_KEYDOWN` y despues el `WM_KEYUP`, y el estado
vuelve a cero. O sea que el caso raro es uno solo: entrar a la esfera con la `W`
apretada, soltarla con el menu abierto, y salirse apretando otra tecla — ahi la
`W` sobrevive al menu. Si el log dice que hay fantasma y se ve ese symptoms, el
siguiente paso es un guardia de fantasma fuera del menu, y no antes.

> El diagnostico necesita dos fuentes distintas: `Pad.IsKeyPressed` (el pad del
> juego) y la lectura sostenida. Si la escalera de `readDown` ya cayo en un `Pad.*`,
> no hay dos fuentes que comparar y no loguea nada: un "no hay fantasma" sin fuentes
> distintas seria mentira.

### Que el ancla no alcance tampoco alcanza: hay que devolverle las teclas

**DORMIDO.** Esta es la mitad de la regla 2 que faltaba, y la que costo un
soft-lock. Se conserva entera porque es el problema que volveria a aparecer el dia
que un menu vuelva a cerrarse alejandose.

Con un panel abierto, **la pagina se queda con todas las teclas**. No es por el
hover: la region de input de la UI en la ASI es la pantalla completa (§2). Al
primer movimiento de mouse el juego deja de ver `W`, y no lo vuelve a ver hasta
que el panel se cierra.

Y el menu de proximidad se cerraba **alejandose**. O sea que sin `W` no habia forma
de alejarse: la unica salida era `Escape`, o sea la pagina mandando `ui:close`.
Un soft-lock con una sola puerta.

La salida era la v4 del runtime. El mod declara cuales son sus teclas de juego y la
ASI las saca del WndProc antes del gate de foco:

```javascript
// core/gsis_Config.js
export var MOVE_KEYS = [87, 65, 83, 68];  // W A S D

// core/gsis_Input.js
export function setMenuKeyPassthrough(vks) { /* ... */ }

// modules/gsis_WebInterface.js — COMO ERA (dormido)
var panel = _uiState.menuVisible;
var prox  = anyVisible && !panel;
var sale  = updateProximityMove(prox);
var congelar = panel || (prox && !sale);

setMenuCursor(anyVisible);
setMenuGameState(congelar);
setMenuKeyPassthrough(prox ? MOVE_KEYS : null);   // hoy: siempre null
```

Lo que sigue de esa ultima linea se Learn si un menu vuelve a cerrarse
alejandose:

- **`prox`, no `!congelar`.** La lista tiene que estar puesta con el menu de
  proximidad abierto **incluso congelado**, que es justo el estado en el que el
  jugador esta parado. Si se mandara solo cuando no esta congelado, la pulsacion
  con la que se va se perderia: el WndProc ya la enruto a la pagina y el juego se
  queda sin la `W` para siempre. Con la lista puesta, el autorepeat de Windows
  reenvia el `WM_KEYDOWN` de `W` mientras la tecla este apretada, y ese si pasa.
  El panel principal no manda lista: ahi es un menu de pausa y el teclado entero
  va a la pagina.
- **`MOVE_KEYS` son codigos de teclado virtual de Windows, no los codigos de
  tecla de GTA.** Los dos sistemas numeran distinto (`VK_W` es 87; el codigo de
  GTA viene de un scancode de DirectInput). Confundirlos produce una lista que no
  matchea nada en el WndProc — y el sintoma es el soft-lock otra vez, con el
  detalle de que la lista "se aplico" sin error.
- **La lista se manda una vez por cambio, no por frame.** Va con su propio latch
  en `gsis_Input.js`, como el cursor.

El freeze y el passthrough eran las dos caras de la misma regla: *con un menu de
proximidad abierto el juego se para al entrar, y camina cuando el jugador aprieta
una direccion.* Por eso los dos se decidian en el mismo bloque de `broadcast()` y
ninguno de los dos mencionaba un flujo: la regla era de clase de menu, no de menu.
Hoy no hay dos clases, asi que las dos caras se fueron: el freeze congelando, el
passthrough apagado.

> La trampa de la UX que viene con el menu congelado sigue viva: el panel aparece en
> el medio de la pantalla y puede quedar **debajo del puntero**. Con el puntero
> encima, las teclas son las de la pagina —incluida la `ESPACIO` y el `ESC` que
> cierran—, asi que el menu tiene que decirlo: por eso los cuatro menus de esfera
> tienen "ESPACIO o ESC para cerrar el menu" en el subtitulo (`MENU_HNT` en
> `gsis_lang_data.js`). Sin esa linea, un menu congelado parece trabado.

**No se le quita el teclado a nadie para lograr el freeze.** El teclado de la
pagina se queda igual, y el del juego tambien, con la excepcion de las teclas que
el mod declara como suyas. Lo que cambia con el freeze es que un player congelado
no reacciona a ninguna de las dos, con lo que el estado se ve limpio en vez de
medio partido.

Va en `gsis_Input.js` y no en el WebInterface para que no haya que acordarse de
cada menu: el WebInterface le pasa "hay algun menu visible" y el modulo aplica el
estado. Un menu nuevo no tiene que registrarse en el freeze: se registra con
`registerMenuSource` y ya esta.

```cpp
// sa.json
SET_PLAYER_CONTROL   in: self:Player, state:bool
SET_CAMERA_BEHIND_CHAR  in: (nada)
```

### La trampa: la polaridad

El parametro de `SET_PLAYER_CONTROL` es **"el jugador tiene control"**, no "esta
congelado". Congelar es mandarle `false`. Por eso el codigo calcula la
traduccion en un solo lugar y con nombre explicito:

```javascript
var control = want ? 0 : 1;   // want = "congelado"
SET_PLAYER_CONTROL(p, control);
```

Pasar el flag crudo al opcode lo invierte **sin dar error**: el comando no
falla, simplemente hace lo contrario de lo pedido, y el juego se congela al
cerrar el menu en vez de al abrirlo. Ya se hizo ese error una vez y lo cazó la
prueba de cableado (§9). Si se toca `setPlayerFrozen`, el chequeo de §9 sigue
siendo el que lo detecta.

### Como se invoca

`sa.json` declara el primer parametro como `self:Player` y no hay type
definitions en disco, asi que la forma exacta depende de la version del
runtime. Va con una cadena defensiva, la misma que ya usa el mod para el radar:
primero la forma con namespace, despues `native()` con el objeto `Player`, y por
ultimo con el indice. Si ninguna entra, se loguea **una vez** con el motivo, para
que un desajuste de firma sea diagnosticable en juego y no un fallo silencioso.

> Esto es lo unico del modulo que no se pudo verificar sin arrancar GTA. El
> criterio de exito en el log es que **no** aparezca
> `[Input] SET_PLAYER_CONTROL no se pudo llamar`.

## 6.1 El mouse del juego no es el cursor del menu

**ACTIVO desde el 04/10/2026.** Antes era `setMenuGameMouse(false)` en cada frame y no
se anulaba nada. Se dio vuelta por un sintoma medido, no por teoría.

### Lo que pasaba

Con la UI abierta el cursor se prendía bien (`mode=1`, `keys=1`) pero **no se podía
sacar del centro de la pantalla**: se movía un poco y volvía solo.

La explicación que estaba escrita acá — *"congelado no hay a quien pegarle"* — era
correcta para el golpe pero estaba equivocada en lo que de verdad rompía, por una razón
que no es obvia: **`SET_PLAYER_CONTROL` al revés congela al jugador y NO suelta el
mouse.** El juego sigue leyendo los deltas del mouse para la cámara.

### Lo que se midió, en dos pasos

**Paso 1 — el bloqueo del mouse NO era la causa.** Con `setMenuGameMouse(true)` el log
de la ASI dice:

```
SAWeb directinput: bloqueo aplicado al buffer del mouse. GetDeviceState=580
```

O sea que el juego recibe los deltas **en cero**, y el cursor **seguía** volviendo al
centro. Con cero deltas la cámara no se está moviendo, así que el recentrado no podía
venir de ahí.

**Paso 2 — el recentrado es `SetCursorPos`, y es del juego.** Con el mismo mecanismo que
la ASI ya usa para `ShowCursor` (reportar el módulo que llama), hookeando `SetCursorPos`:

```
SAWeb cursor: flips=0 (openUis=1 mode=1 keys=1) callers:
  gta_sa.exe[hide=0,null=0,setpos=120,bloq=120,clip=0]
```

**120 llamadas de `gta_sa.exe` por bloque de log, con la UI abierta.** `SetCursorPos`
escribe el puntero directamente: no depende de los deltas, y por eso el bloqueo del
mouse no lo tocaba. Eran dos caminos distintos.

`clip=0`: `ClipCursor` no lo llama nadie, así que no se toca.

### Qué hace cada cosa ahora

| Pieza | Qué resuelve |
|---|---|
| `setMenuGameMouse(anyVisible)` | El click no golpea al que está enfrente. Los deltas en cero tampoco mueven la cámara |
| La ASI inhibiendo `SetCursorPos` | El puntero no vuelve al centro |

**Las dos hacen falta.** El bloqueo del mouse por sí solo no mueve el puntero; la
inhibición de `SetCursorPos` por sí sola no evita que el click dispare.

### El resto de esta seccion, sin cambios

Lo que sigue estaba escrito cuando esto estaba dormido y sigue siendo correcto: con un
menu de proximidad abierto, clickear a un personaje lo golpeaba. Y con el mismo menu,
mover el mouse movia la camara. Dos sintomas, una sola causa raiz, y la causa no es la
que uno primero pensaría.

Con un menu de proximidad abierto, clickear a un personaje lo golpeaba. Y con el mismo
menu, mover el mouse movia la camara. Dos sintomas, una sola causa raiz, y la causa no
es la que uno primero pensaría.

### El teclado y el mouse entran por caminos distintos

| | De donde lo lee el juego | Lo frena el WndProc |
|---|---|---|
| Teclado | los mensajes de ventana | **si** |
| Mouse | DirectInput, y de ahi al estado del mouse de `CPad` | **no** |

La ASI ya traga los clicks en el `WndProc`: si hay una UI abierta, `FindUiUnderCursor()`
acierta (el rect de input es la pantalla completa, porque el panel se dibuja como un quad
de pantalla completa) y el mensaje no llega al `WndProc` del juego. **Y no alcanza**, porque
el estado del dispositivo ya estaba en otro lado y el juego lo lee igual.

Por eso el passthrough de §6.2 existe y por que el mouse necesita otra cosa: mismo
problema, distinto camino de entrada. La v4 arreglo el teclado; el mouse hizo falta la v5.

### Que se anula, y que no

`setMenuGameMouse(true)` pone a cero, una vez por frame, en el estado del juego:

| Se anula | No se anula | Por que |
|---|---|---|
| Los botones (`lmb`, `rmb`, `mmb`) | `PCTempKeyState` | El teclado. El menu se cerraba **alejandose**, asi que `W` tenia que llegar al juego |
| La rueda | `PCTempJoyState` | El joystick |
| Los deltas de camara (`x`, `y`) | `DisablePlayerControls` | El campo que congela al player. Es otro setter, y solo congela |
| | `NewState` / `OldState` | El pad ya fusionado: es lo que mueve al personaje |
| | El cursor | Ver abajo |

**El teclado y el mouse son structs vecinos en el mismo `CPad`**, a dos lineas. Por eso el
`setMenuGameMouse` va en su propio setter, con su propio latch, y no pegado al del
passthrough: si compartieran linea, un cambio de polaridad en uno romperia el otro en
silencio. El harness de la ASI tiene un bloque que verifica justamente que el codigo del
bloqueo **no mencione siquiera** ninguno de los cinco campos de la derecha, con los
comentarios ya borrados — porque el codigo correcto los nombra en el comentario que
explica por que no los toca.

### Por que los dos, y no solo el click

Porque con la camara libre el problema es igual de malo por otro lado: apuntar a una fila
mueve la camara, y la mira de GTA barre a los NPCs que quedan por debajo de la fila que
estas por clickear. Bloquear solo el boton deja el click resuelto y el resto igual.

### El cursor del menu y el del juego son el mismo

Hay **un** cursor, el del sistema. "Bloquear el mouse del juego" no puede significar
"ocultar el cursor", porque el cursor es el del menu: sin el no se puede clickear una
fila.

Lo que deja las filas clickeables es que **el click igual le llega a la pagina**: el
`WndProc` sigue mandandolo a CEF. Lo que se anula es la lectura que hace el juego por su
cuenta. Dos caminos, dos destinos.

### La condicion, y por que es al reves de lo que se espera

```js
  setMenuGameMouse(anyVisible);   // con el menu visible el juego no ve el mouse

```

Con el panel principal el click tiene que **llegar** a la pagina: bloquearlo ahi dejaria
el panel sin poder usarse con el mouse. Con un menu de proximidad era al reves —el mundo
esta en pausa (congelado) o el jugador ya se esta yendo y el menu esta por cerrarse, y en
los dos casos el click no tiene que pegarle a nadie.

Era la misma condicion que la lista de teclas —las dos eran "hay un menu de
proximidad"—, y por el mismo motivo: con el panel principal el click va a la
pagina y con un menu de proximidad va al mundo, nunca a las dos. Hoy las dos
condiciones son `false` siempre, asi que no hay nada que decidir.

### Limitacion aceptada

Si el jugador tiene el boton apretado en el exact frame en que se cierra el menu, el
bloqueo se levanta y el juego puede ver ese click como un ataque. Es un caso de un
frame, con consecuencia menor, y se **acepta**: el arreglo seria un latch que espere a
que el boton se suelte, que traba el input del jugador medio segundo por un caso que casi
no pasa.

## 7. El menu se cierra por comando, no solo por tecla

Cuando la pagina se queda con el teclado, el WndProc hace `return 0`: **la tecla
se consume y el juego nunca la ve**. El `rawKeyDown` del WebInterface esta
muerto justo en el momento en que haria falta.

Por eso la pagina pide el cierre por el canal de retorno, que no depende del
input:

```text
app.js: Escape        -> emit("cmd:ui:close")     -> cola de la ASI
app.js: I             -> emit("cmd:ui:toggle")    -> cola de la ASI
app.js: ESPACIO       -> emit("cmd:flow:toggle")  -> cola de la ASI
WebInterface: takeCommand() por frame -> closeMenu() / togglePanel() / toggleFlow()
```

Los tres comandos van a la **misma funcion** que la tecla: `ui:toggle` cae en
`togglePanel()` y `flow:toggle` en `toggleFlow()`. Si cada camino decidiera por su
cuenta, uno de los dos se desincroniza y la pagina hace algo distinto de lo que
hace la tecla.

Esto no es un detalle de la pagina: `ui:toggle` y `flow:toggle` son justamente
los comandos que **reabren**, asi que `dispatchCommands()` se drena con el menu
cerrado tambien. Gatearlo por `menuVisible` los dejaria muertos por
construccion.

El debounce de 200 ms es lo que hace que las dos mitades de una pulsacion no se
cancelen: con el teclado en la pagina, el mod igual lee la tecla por
`GetAsyncKeyState` y la pagina la manda por el comando, asi que la misma
pulsacion puede llegar por los dos caminos. La segunda cae dentro de la ventana.

## 8. Como agregar cosas

### Un menu nuevo

En el `init` del modulo, una linea:

```javascript
function initMiModulo() {
    registerMenuSource("miMenu", function () { return _showMiMenu; });
}
```

Listo: el cursor se prende, el freeze se aplica, los hotkeys de los demas se
suprimen, y el menu entra en el `anyMenuVisible()` que decide la modalidad.
**No hay que tocar el WebInterface**, y por eso `computeVisible()` no es una lista que hay que acordarse
de actualizar.

Lo que **no** se decide con esa linea es el freeze: el modulo no lo pide, lo aplica
el bridge, y la regla sale sola de "hay algun menu visible". Hoy todos los menus
son de pausa, asi que la regla es una sola:

| Tipo | Se abre | Se cierra | Congela |
|---|---|---|---|
| **Pausa** (los cinco) | Con una tecla: `I` el inventario, `ESPACIO` los de esfera | Con la misma tecla o `ESC` | **Siempre** |

Un menu de pausa sin freeze —o con freeze que se levanta solo— es el bug que esta
seccion arregla: el jugador ve a su personaje corriendo o disparando al fondo
mientras elige un item, y la camara se queda donde el gameplay la dejo.

Si aparece un menu que **no** es de pausa (se cierra alejandose, o deja al jugador
caminar con el panel abierto), hay que volver a encender el camino de §6.2 a §6.4
—los tres estan escritos, apagados— y revisar §6.1.

### Una esfera nueva

Un punto de menu con esfera tiene cuatro partes, y la que se olvida es la ultima:

1. La entrada en `SPOTS` de `data/gsis_spot_data.js`.
2. `registerMenuSource` en el `init` del modulo, y su `update` llamando
   `updateSpotSpheres(tipo, gate, want)` + `closeSpotFlow(...)`.
3. Un `openXMenu()` que consulta `spotCanOpen(tipo, c)` y deja el estado listo.
4. **`_sawOpen`**: la cooldown se pide con la transicion contra lo que el modulo
   publico en su update anterior, no contra el flag. Ver [SPOTS §4](./gsis_SPOTS.md#4-la-cooldown-la-esfera-se-apaga-6-s-al-cerrar).
   Sin eso, cerrar con la tecla no apaga la esfera.

Y en `modules/gsis_FlowSerialization.js`, la entrada en `FLUJOS` con sus tres
puertas (`visible`, `open`, `close`): ese archivo es el que el bridge consulta, y
`openFlow()` prueba los cuatro en orden para elegir a quien abrir.

### Un atajo nuevo

1. La tecla va en `KEYS` (`core/gsis_Config.js`).
2. Se lee con `keyJustPressed(K). Nueva`, no con `Pad.IsKeyJustPressed`.
3. Si la tecla tambien existe en la pagina, elegir una: si la pagina la maneja,
   el atajo del mod no va a disparar nunca, porque con el puntero sobre el
   panel el juego no ve la tecla.

## 9. Verificacion

### El camino rapido: polaridad y supresion

Hay una prueba de cableado que importa con este modulo, porque con `node
--check` no se encuentra ni un import mal escrito ni una bandera invertida.
Se escribio porque justo eso paso dos veces: un `inputState` importado con
nombre equivocado (habria tirado en el juego) y el freeze al reves.

```powershell
# Sintaxis de todo
Get-ChildItem -Path "modloader\IronSyndicate\cleo\IronSyndicate","modloader\IronSyndicate\UI" `
  -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }

# Que nadie lea teclas por su cuenta
Get-ChildItem -Path "modloader\IronSyndicate\cleo\IronSyndicate" -Recurse -Filter *.js |
  Where-Object { $_.Name -ne "gsis_Input.js" } |
  Select-String -Pattern "Pad\.IsKeyJustPressed|isKeyPressed\("
# Tiene que salir vacio.

# Que cada export tenga consumidor
Select-String -Path "modloader\IronSyndicate\cleo\IronSyndicate\core\gsis_Input.js" -Pattern "^export function"
```

### En juego

| Que mirar | Donde | Lo esperable |
|---|---|---|
| El getter se lee | `SAWebUICef.log` | `mode=1 keys=1` con el menu abierto y el puntero arriba |
| El freeze anduvo | `cleo.log` | **No** aparece `[Input] SET_PLAYER_CONTROL no se pudo llamar` |
| La firma es la correcta | en juego | Con **cualquier** menu abierto (`I` o `ESPACIO`) el personaje no se mueve al caminar |
| La lectura es del teclado real | `cleo.log` | `[Input] lectura de tecla sostenida: isKeyPressed`. Si dice otra cosa, aparece el aviso de `sin lectura de teclado REAL` y ningun menu se abre a mano |
| El cursor esta en los dos casos | `SAWebUICef.log` | `mode=1` con el inventario y con un menu de esfera |
| El menu es modal | en juego | Con el menu abierto, `Q`/`R`/`1`/`2`/`3` no hacen nada |
| Se abre con la tecla | en juego | `ESPACIO` parado en la esfera abre; en la calle no hace nada |
| Se cierra con la tecla | en juego | `ESPACIO` con el menu abierto lo cierra; con el inventario abierto no hace nada |
| Se cierra por comando | en juego | `Escape` cierra con el puntero **afuera** del panel; con el puntero arriba tambien, por `cmd:ui:close` |
| El estado es real | en juego | La pagina no muestra avisos inventados: si no se pudo leer, lo dice |

Las dos filas de freeze y lectura son las que definen el comportamiento actual, y
van en contra de la version anterior (menus de proximidad sin freeze, con el
personaje libre para seguir de largo). La prueba de que no es un soft-lock es la de
las dos ultimas de teclado: **los cinco menus se abren y se cierran con una tecla
sin tocar el mouse**, y el Escape y el boton de cerrar siguen funcionando.

La ultima fila es la que distingue esta version de la anterior. La pagina ya no
afirma nada que el mod no le haya dicho, y en particular ya no pide apretar una
tecla que no existe.
