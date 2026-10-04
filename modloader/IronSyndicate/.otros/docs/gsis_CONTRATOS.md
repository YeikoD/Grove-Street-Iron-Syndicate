# GSIS - Contratos entre piezas

> **Este documento es la segunda fuente de verdad.** Describe **como se comunican
> las piezas**: que nombres existen, quien los produce, quien los atiende, y que
> payload lleva cada uno.
>
> No describe que hace el sistema ([gsis_WEAPONS.md](./gsis_WEAPONS.md)) ni si
> funciona ([gsis_WEAPONS_VERIFICADO.md](./gsis_WEAPONS_VERIFICADO.md)).
>
> **Cuando algo no responde, el fallo esta casi siempre en este documento.** Un
> nombre de evento mal escrito es un handler que no se ejecuta nunca, sin error y
> sin log: el que manda espera una respuesta y recibe `undefined`. Ver
> [Por que los nombres viven en un archivo aparte](#4-por-que-los-nombres-viven-en-un-archivo-aparte).

---

## Indice

1. [Las cuatro reglas de dependencia](#1-las-cuatro-reglas-de-dependencia)
2. [La cadena de las armas, de punta a punta](#2-la-cadena-de-las-armas-de-punta-a-punta)
3. [Los 22 comandos de la pagina](#3-los-22-comandos-de-la-pagina)
4. [Por que los nombres viven en un archivo aparte](#4-por-que-los-nombres-viven-en-un-archivo-aparte)
5. [El contrato del snapshot](#5-el-contrato-del-snapshot)
6. [Los dos namespaces de los accesorios](#6-los-dos-namespaces-de-los-accesorios)
7. [Como agregar un comando](#7-como-agregar-un-comando)
8. [Como agregar un evento](#8-como-agregar-un-evento)

---

## 1. Las cuatro reglas de dependencia

```
UI\app.js  (pagina web)
    ↓  emit("cmd:<nombre>", payload)
ui/bridge.js ── el UNICO archivo que habla con SAWeb
    ↓
ui/commands.js ── que significa cada verbo
    ↓
modules/weapons/ ── el dominio
    ↓  query(...) por el EventBus
modules/inventory/
    ↓
core/gsis_Engine.js ── el UNICO archivo que habla con el motor
```

| Regla | Que significa |
|---|---|
| **UI ↔ mod, un solo camino** | Todo lo que la pagina manda entra por `emitCommand` y sale por `send`/`pushChunked`. No hay un segundo cable |
| **weapons ↔ inventory, EventBus** | Ninguno importa al otro. Ni siquiera para un string |
| **core/gsis_Engine.js es la frontera del motor** | Ningun modulo llama `native()` ni `Memory.*`. Ese archivo y solo ese |
| **ui/bridge.js es la frontera del runtime** | Ningun otro archivo importa SAWeb |

Las dos ultimas son las que se rompieron primero cuando los modulos se
reorganizaron, y por eso estan aqui y no en un comentario suelto.

### Que se violo y como se resolvio

La version anterior de la regla de `weapons ↔ inventory` era "no se importan".
Se cumplia en un sentido y no en el otro: `inventory/state.js` importaba
`getClipSizeByItemId` de `data/gsis_weapon_data.js` —**un archivo que ya no
existe**, se borró con el sistema de variantes el 30/09—, o sea que el modulo de
inventario leia la tabla de armas por la puerta de atras. Dos caminos a la misma
verdad, y cambiar la tabla podia cambiar un cargador y no el otro.

La primera correccion fue que weapons importara el nombre del evento de
inventory — lo cual es **peor**, porque sigue siendo un import entre los dos, solo
que del lado inverso y disfrazado de un string. Ese error quedo escrito en el
codigo a proposito. Ver seccion 4.

---

## 2. La cadena de las armas, de punta a punta

Una accion completa, del click a la memoria del juego:

```
1.  app.js         click derecho -> ACCIONES -> actionFor(r, "mount")
                      -> { cmd: "inv:mount", slot: 2, id: "suppressor" }
2.  bridge.js      emitCommand -> window.SAWeb.emit("cmd:inv:mount", payload)
3.  SAWeb          encola el comando
4.  ui/index.js    drainCommands(handler) -> takeCommand(UI_ID), 4 por frame
5.  commands.js    case "inv:mount" -> attachAccessory(null, 2, "suppressor")
6.  logic.js       getEntry(2) -> { family: "colt45", attachments: [] }
                      resolveWeaponType("colt45", ["suppressor"]) -> 60
7.  EventBus       query(items:takeAttachment, { id: "suppressor" })
                      <- inventory saca la pieza del inventario
8.  logic.js       _aplicar -> _giveInternal(char, "colt45", ["suppressor"], 8)
9.  internal.js    Engine.clipCapacityOf(60) -> 8   (LA CAPACIDAD LA DICE EL MOTOR)
                      Engine.removeWeapon(char, 60)   si el tipo viejo != 60
                      Engine.giveWeapon(char, 60, 8)
10. Engine.js      native("GIVE_WEAPON_TO_CHAR", ...)
11. log            "[Weapons] montar Silenciador: colt45 -> tipo 60 (era 63) | 8/8"
12. state.js       setEntry(2, { id, family, attachments, salud }) -> persiste
13. events.js      weaponVariant(...) -> weapon:variant
14. inventory.js   el snapshot cambia -> pushChunked("inv", json) -> la pagina se redibuja
```

Lo que se ve desde afuera son dos lineas de log. Lo que hay entre ellas es este
camino, y cada paso tiene un modulo dueno.

### Los dos caminos de error, y por que se distinguen

`attachAccessory` y `equipWeapon` pueden fallar en dos lugares distintos, y el
lugar del fallo cambia que hay que deshacer:

| Falla | Que se revierte | Como se detecta |
|---|---|---|
| La combinacion no existe, o el accesorio no es compatible | Nada: se devuelve `false` antes de tocar el inventario | Log `fallo: <motivo>` |
| Falta la pieza en el inventario | Nada: no se gasto | Log `fallo: no tenes ningun X` |
| El motor no acepta el tipo | **La pieza vuelve al inventario**, intacta | Log `EQUIP FALLO` |

La pieza se saca del inventario **antes** de dar el arma, no despues. Al reves, si
el motor rechazara la configuracion, el accesorio quedaria montado en un arma que
no se dio, y habria que volver a dar la anterior para deshacerlo.

---

## 3. Los 22 comandos de la pagina

Los manda `UI\app.js` con `emit("cmd:<nombre>", payload)` y los atiende
`ui/commands.js`. **El `id` puede venir en cualquiera de los dos namespaces de
accesorios**: el modulo lo canonicaliza (seccion 6).

| Comando | Payload | Que hace | Quien decide |
|---|---|---|---|
| `ui:close` | — | Cierra lo que se esta viendo | `ui/index.js` |
| `ui:toggle` | — | Abre/cierra el panel principal | `ui/index.js` |
| `flow:toggle` | — | Abre/cierra un menu de esfera | `ui/index.js` |
| `ui:diag` | `dice`, `flow`, `menu`, `hidden` | No es accion: la pagina reporta su DOM | se loguea |
| `inv:equip` | `id`, `attachments?` | Equipa. Con `attachments`, monta esa configuracion | `weapons` |
| `inv:unequip` | `slot` | Devuelve el arma al inventario | `weapons` |
| **`inv:mount`** | `slot`, `id` | **Monta un accesorio. Consume la pieza** | `weapons` |
| **`inv:unmount`** | `slot` | **Saca el accesorio. Devuelve la pieza** | `weapons` |
| `inv:belt` | `id` | Cargador del inventario al cinturon | `inventory` |
| `inv:belt:off` | `slot` | Cinturon al inventario | `inventory` |
| `inv:drop` | `id`, `qty?` | Tira un item | `inventory` |
| `trunk:put` | `id`, `qty?` | Inventario -> baul | `Trunk` |
| `trunk:take` | `id`, `qty?` | Baul -> inventario | `Trunk` |
| `dealer:add` | `id`, `qty?` | Al carrito | `Dealer` |
| `dealer:cart:remove` | `id`, `qty?` | Saca del carrito | `Dealer` |
| `dealer:cart:clear` | — | Vacia el carrito | `Dealer` |
| `dealer:checkout` | — | Cobra | `Dealer` |
| `pickup:take` | `id`, `qty?` | Retira del pedido | `Pickup` |
| `pickup:takeAll` | — | Retira todo | `Pickup` |
| `pickup:cancel` | — | Cancela el pedido | `Pickup` |
| `seller:offer` | `id`, `qty?`, `price?` | Oferta de trueque | `Seller` |
| `seller:quote` | `id`, `delta` | Mueve la oferta | `Seller` |

### Las dos reglas de los comandos

**Ninguno valida peso, inventario lleno, ni si el jugador esta parado al lado del
baul.** Eso vive en el modulo dueno (`addItem`, `putInTrunk`, `doOffer`), y hay
una razon concreta: *la pagina ve un snapshot que puede tener hasta 400 ms de
antiguedad*. Si el modulo no valida, su respuesta seria la de hace un snapshot.

**Ninguno loguea a ciegas.** Cada handler mira el retorno antes de loguear que lo
hizo, porque un log que afirma una accion que no ocurrio manda a investigar al
archivo equivocado — y durante el debugging del armar, `inv:equip` logueaba
`equipo colt45` con `equipWeapon` devolviendo `false`. Ese fue el error mas caro de
la sesion: el log afirmaba lo contrario de lo que pasaba.

### `inv:unmount` va sin `id`, a proposito

La pagina **no puede** decidir cual es el accesorio que no es cargador: su
documentacion dice que no consulta el catalogo, y no lo tiene. Adivinarlo por el
prefijo `mag_` seria meter en el frontend una convencion de nombres del catalogo.

Asi que la pagina manda el slot y el modulo elige. Y para que el boton aparezca
solo cuando hay algo que quitar, el modulo manda `otros` en la fila del arma
equipada (seccion 5).

---

## 4. Por que los nombres viven en un archivo aparte

`core/gsis_EventNames.js` — **no es un modulo.** No se registra, no tiene `init`,
no habla con nadie. Es una tabla de strings.

Un nombre de evento es un string, y un string mal escrito es la peor clase de bug
que hay en un bus: el handler no se ejecuta nunca, no tira, y el que manda se
queda esperando una respuesta. El sintoma es un `undefined` o un `false` tres
archivos mas alla, sin nada que apunte al error.

Un import de simbolo convierte ese string en algo que el runtime verifica.

### Las tres alternativas, y por que se descartaron

| Alternativa | Por que no |
|---|---|
| Que cada modulo declare sus nombres y el otro los importe del modulo | **Es un import directo entre los dos**, que es justo lo que la regla prohibe. Se cambia el archivo a mover cuando uno se reorganiza, y un modulo termina importando el `events.js` del otro solo por un string: un acoplamiento que no se ve en la logica y aparece como `undefined` en runtime. **Este error se cometio y quedo escrito en el codigo.** |
| Que el nombre sea un literal en los dos lados | Lo que hay hoy en `query("items:takeWeapon", ...)` de `weapons/logic.js` era esto. Riesgo de typo silencioso |
| Un archivo de nombres compartidos | Un nombre con **dos firmas** es un contrato. Un archivo que crece con cada evento deja de ser un contrato y pasa a ser un tablero |

### Que va aca y que no

Solo los nombres que **dos modulos tienen que acordar**:

```js
// weapons -> inventory
export var ITEMS_TAKE_WEAPON      = "items:takeWeapon";
export var ITEMS_STORE_WEAPON     = "items:storeWeapon";
export var ITEMS_TAKE_MAGAZINE    = "items:takeMagazine";
export var ITEMS_STORE_MAGAZINE   = "items:storeMagazine";
export var ITEMS_TAKE_ACCESSORY   = "items:takeAccessory";
export var ITEMS_STORE_ACCESSORY  = "items:storeAccessory";
export var ITEMS_MAG_AMMO         = "items:magAmmo";
export var ITEMS_SET_MAG_AMMO     = "items:setMagAmmo";
export var ITEMS_TAKE_AMMO        = "items:takeAmmo";
export var ITEMS_STORE_AMMO       = "items:storeAmmo";

// inventory -> weapons
export var WEAPONS_CAPACITY       = "weapons:capacityOfItem";
```

> **Esta lista estaba desactualizada y se corrigió el 04/10/2026.** Tenía
> `ITEMS_SWAP_MAGAZINE`, `ITEMS_EXTRACT_MAGAZINE`, `ITEMS_TAKE_ATTACHMENT` y
> `ITEMS_STORE_ATTACHMENT`: **ninguno de los cuatro existe.** Los primeros dos son de
> un diseño de recarga que ya no está, y los otros dos usan `Attachment` donde el
> código dice `Accessory`.
>
> Un contrato que lista nombres que no existen es peor que uno que no lista: el que
> lo lee cree que hay un evento dondeablemente escrito, lo implementa, y no pasa
> nada. **La fuente de verdad es `core\gsis_EventNames.js`**; si esta lista y el
> archivo discrepan, el archivo gana.

Un evento que solo escucha su dueno se declara en el archivo del dueno
(`weapons/events.js`, `inventory/events.js`) y **no** aparece aca.

La unica pregunta en sentido inverso, `weapons:capacityOfItem`, es la que existia
como import directo y por eso esta. Responde la **capacidad declarada** de un
item, que el modulo de inventario necesita para fabricar filas. `0` significa
"no se pudo preguntar" y no "no tiene capacidad", y esa distincion esta escrita en
el log del modulo de inventario.

### La propiedad que se verifica sola

Que `weapons/` no nombre a `inventory/` ni al reves **es un assert**, no una
convencion. Vive en `check-ui-flow.mjs` y lee los archivos:

```
ok   modules/weapons/events.js no importa a inventory/
ok   modules/inventory/state.js no importa a weapons/
```

Un modulo nuevo que rompa la regla rompe el test, no la proxima sesion de juego.

---

## 5. El contrato del snapshot

`ui/views/inventory.js` arma lo que la pagina dibuja. Un snapshot de inventario son
dos claves: `{ weight, rows }`.

### La fila de un item normal

```js
{ id, cat, name, qty, ammo, salud, weight, value, tip }
```

`cat`, `name`, `weight` y `tip` salen del catalogo y los arma el mod. **La pagina
no consulta el catalogo**: no tiene ITEMS ni WEAPON_DATA.

### La fila de un arma equipada

Lo de mas, y es lo que la Fase 5 agrego:

```js
{
  id, cat, name, qty, ammo, salud, weight, value, tip,
  equipado: true,      // sale del mod
  ranura: "arma",      // "arma" | "cinturon"
  slot: 2,             // el slot de GTA, o la casilla del cinturon
  family: "colt45",    // <-- la familia
  attachments: ["suppressor"],   // <-- la configuracion COMPLETA
  otros: ["suppressor"],         // solo los que NO son cargadores
  hasMag: true                  // derivado de attachments
}
```

**El `weaponType` no viaja, en ninguna clave y disfrazado.** Es la representacion
que ejecuta el motor; la configuracion es lo que se guarda. Si el tipo viajara, la
pagina podria guardarlo y mandarlo de vuelta por un lado que no es el del
registro — y un numero que vuelve al mod por ahi es como vuelve el segundo modelo.

Hay un assert que lo verifica sobre el JSON serializado del snapshot completo, no
sobre el codigo.

### `otros`, y por que existe

`otros` es la lista de accesorios que **no son cargadores** (hoy, el silenciador).
Es la cuarta clave derivada y existe por una razon concreta: la pagina necesita
saber si puede ofrecer "Quitar accesorio", y no puede deducirlo.

Sin `otros`, tendria que mirar el prefijo `mag_` de cada id, que es una
convencion de nombres del catalogo. Con `otros`, la pregunta la contesta el modulo
que tiene el catalogo. `hasMag` ya es un derivado con el mismo proposito.

---

## 6. Los dos namespaces de los accesorios

El mismo cargador de 15 balas tiene dos nombres, y **en ningun lado es el mismo**:

| Namespace | Nombre | Donde vive | Quien lo usa |
|---|---|---|---|
| **Canonico** | `mag_colt45_15` | `WEAPON_ATTACHMENTS` y `WEAPON_VARIANTS` | `resolveWeaponType`, `equipped[].attachments` |
| **De inventario** | `mag_colt45_extended` | `ITEMS` | `items[]`, el dealer, la pagina |

Las conversiones:

```js
canonicalAttachmentId("mag_colt45_extended") -> "mag_colt45_15"   // hacia el canonico
inventoryAttachmentId("mag_colt45_15")       -> "mag_colt45_extended"
```

### Por que `mag_colt45_extended` NO esta en `ITEM_RENAMES`

`ITEM_RENAMES` (en `core/gsis_SaveMigration.js`) renombra **`item.id`**, que es
el namespace de inventario. Y `mag_colt45_extended` es **hoy un itemId valido**:
esta en `ITEMS`. Renombrarlo a `mag_colt45_15` produciria un id que no existe, y
el cargador **desapareceria del inventario en cada carga**.

Peor: la entrada existente `"mag_9mm_extended": "mag_colt45_extended"` encadenaria
y aterrizaria en `mag_colt45_15`. Por eso los renombres se resuelven con **un solo
salto**, nunca encadenados.

La conversion que si hace falta —el save viejo escribio `mag_colt45_extended`
dentro de `attachments`, donde el nombre bueno es el canonico— la hace la
migracion de weapons (`modules/weapons/migrate.js`), que si conoce los dos
namespaces.

**La regla que sale de ahi:** todo destino de `ITEM_RENAMES` tiene que existir en
`ITEMS`. Si un dia hay que renombrar un accesorio, el rename va en el modulo que
lo usa, no ahi.

---

## 7. Como agregar un comando

Cuatro lugares, en este orden. Los tres primeros son del lado del mod y el cuarto
de la pagina.

**1. El verbo, en `ui/commands.js`.** Un `case` dentro del `switch` de
`handleCommand`, que mira el retorno antes de loguear:

```js
case "inv:algo":
    if (!id) return false;
    var r = algo(id);
    if (!r.ok) { log("[UI] inv:algo fallo: " + r.motivo); return false; }
    log("[UI] inv:algo: " + id);
    return true;
```

**2. Si necesita un evento nuevo, el nombre en `core/gsis_EventNames.js`** — y
solo si lo atiende **otro** modulo. Si es del mismo dominio, que se llame
directo.

**3. La validacion, en el modulo dueno.** Nunca en `commands.js`. La pagina ve un
snapshot de hasta 400 ms; el modulo ve el estado real.

**4. La accion, en `UI\app.js`.** Dos lugares, porque el archivo esta designed para
eso:

```js
// en ACCIONES: una entrada mas
{ id: "algo", label: "Hacer algo", aplica: (r) => !!actionFor(r, "algo") }

// en actionFor: el payload
if (what === "algo") return { cmd: "inv:algo", id: r.id };
```

`actionFor` recibe **una sola fila**. Si el comando necesita saber de otra fila
—por ejemplo el slot del arma equipada— se busca en `stateMap`, que ya es la lista
vigente: duplicarla es duplicar la verdad.

---

## 8. Como agregar un evento

**1. El nombre, en `core/gsis_EventNames.js`**, si lo atienden dos modulos.

**2. El handler, en el modulo dueno**, con `on(NOMBRE, function (e) { e.respond(x); })`.
Un evento sin `respond` es una notificacion, no una pregunta.

**3. La respuesta tiene que poder ser `null`.** `query` devuelve `undefined` cuando
nadie responde y `null` cuando alguien contesta que no. La diferencia importa: si
el codigo del que llama usa `if (!resp)` no lo va a notar, y si usa `if (resp === null)`
tampoco va a notar la diferencia. Lo que hay que hacer es **no depender de esa
diferencia**, y por eso todos los handlers responden `null` explicito.

**4. El assert de no-importar**, si el evento cruza modulos. La forma de verificarlo
esta en `check-ui-flow.mjs` seccion 7 y es un `readdirSync` + una regex por archivo.

---

## Lo que este documento no cubre

- **Que los payloads tengan el shape correcto.** Nada verifica que `inv:mount` Reciba
  un `slot` numerico. Un `slot` ausente produce `NaN` y el handler devuelve `false`,
  con un log que dice "no hay arma equipada en el slot NaN" — que es un sintoma
  legible pero no localized.
- **La capacidad que el motor le ve al arma.** Va por `Engine.clipCapacityOf(tipo)`,
  y el valor real lo escribe el `.asi` al registrar el tipo. Ver
  [gsis_WEAPONS.md](./gsis_WEAPONS.md).
- **Que la pagina este sincronizada.** El snapshot tiene 400 ms de antiguedad
  maxima a proposito. Un comando que llega con ese desfase es normal, y por eso la
  validacion es del modulo.
