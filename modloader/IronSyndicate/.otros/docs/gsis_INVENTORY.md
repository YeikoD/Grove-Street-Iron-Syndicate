# GSIS — Sistema de Inventario

Diseno del sistema de inventario con slots, peso y transferencia entre contenedores.

> **Estado**: implementado en `modules/inventory/` (peso, add/remove/transfer,
> baúl, cinturon de cargadores) y en `modules/weapons/` (equipo: armas en slot,
> adopcion, montaje de accesorios, recarga por cinturon).
>
> `modules/gsis_Items.js` y `modules/gsis_Ballistic.js` **ya no existen**: el
> refactor los partio en modulos con una frontera cada uno, y ahora inventory y
> weapons se hablan por el bus en vez de importarse. Este documento es el
> **diseno**; el codigo real manda en firmas y limites.
>
> Ver [gsis_CONTRATOS.md](./gsis_CONTRATOS.md) para como se hablan, y
> [gsis_MAINTENANCE.md](./gsis_MAINTENANCE.md) para reglas al tocar este flujo.

---

## 1. Estructura de Datos (implementada)

```javascript
// Item apilable en inventario — la salud es del STACK
{ id: "scrap_metal", qty: 5, salud: 100 }

// Bala suelta (type magazine + instanced:false) — STACK con tope de fila
// Es la excepcion del contrato de instanciado: la banda es la de los cargadores,
// pero el item es un numero de unidades. `qty` va de 1 a `maxStack` (50).
{ id: "bala_45", qty: 37, salud: 100 }

// Cargador (type magazine) — instancia, no stack
// `ammo` = balas que le quedan. No hay capacidad: el tope del clip lo escribe
// el .asi en su CWeaponInfo y el mod no lo toca (ver gsis_WEAPONS.md §0).
{ id: "mag_colt45", qty: 1, ammo: 8, salud: 100 }

// Arma (type weapon con weaponId) — instancia, no stack, guarda su estado
// `ammo` = RESERVA (CWeapon::m_nAmmoTotal). Sin `hasMag`: el arma no esta ni
// con cargador ni sin cargador.
{ id: "colt45", qty: 1, ammo: 8, salud: 100 }

// Arma EQUIPADA (no esta en items[]): GameState.Ballistic.equipped
{ 5: { id: "ak47", salud: 100, attachments: [], variantWeaponType: 30 } }
   // key = slot de GTA

// ItemManager (SaveManager module)
{
    items: [{ id, qty, salud }],
    trunks: { [vehicleId]: [{ id, qty, salud }] },
    belt: [instanciaCargador | null, ...]   // MISC.MAG_BELT_SLOTS casillas
}
```

- `salud` esta en **las tres clases**, siempre. Entero `0..100` (`SALUD_MAX` en
  `data/gsis_item_data.js`), 0 = roto. La tiene cada fila y cada unidad.
- El **catalogo no lleva salud**: `ITEMS[id]` es `name`/`weight`/`type` y nada
  mas. La salud es estado de una instancia, no de un tipo — dos chatarras con
  distinta salud son el mismo `ITEMS["scrap_metal"]`.
- Un **stack de material tiene una sola salud** para todas sus unidades. Los
  cargadores y las armas nunca se apilan, asi que cada uno tiene la suya.
- Al crear una instancia: `salud` = `SALUD_MAX`. Al **unir a un stack que ya
  esta**, su salud no se toca: agregar no cambia la unidad que ya estaba ahi.
- Al mover entre mochila y baul la salud **viaja con la fila**: sale de la fila
  que se saca, no de un default.
- **Arma equipada**: su salud vive en `equipped[slot].salud`, no en `items[]`
  (alli no esta). Sin ese campo se perderia al desequipar.
- `salud` todavia **no se desgasta**: no hay ninguna regla que la baje. El
  campo, la columna y la migracion estan; la mecanica se decide aparte.
- `ammo` solo en armas y cargadores. **La bala NO lleva `ammo`**: lleva `qty`. Es el
  unico item de la banda "Municion" que se apila, y por eso la celda de munición de
  su fila sale vacía en vez de decir "0".
- `ammo` al nacer = `getRoundsByItemId(itemId)`: el `rounds` que declara la
  entrada, o el `clipSize` del arma tras quitar el prefijo `mag_`. Es CONTENIDO,
  no capacidad, y no se guarda en el item. Nombre visible: `getItemName(id)`,
  sin sufijo (la salud tiene columna propia, no va pegada al nombre).
- **NO existen** `hasMag` ni `magId` en ningun lado. Se eliminaron junto con el
  sistema de capacidad por cargador; si un save viejo los trae, los borra la
  migracion v1 -> v2 (`modules/weapons/migrate.js`, `migrateWeaponsToV2`).
  `salud` si se migra, con `_migrateSalud` en `modules/inventory/state.js`.
- Cargadores **y armas no se apilan**: cada unidad es una entrada suelta
  (`isInstanced(id)`).
- **`instanced: false` gana contra el `type`** (`isInstanced()`). Existe por un solo
  item, la bala: declara `type: "magazine"` para salir en la banda "Municion" al
  lado de los cargadores, y rompe el contrato "magazine = una unidad con SUS balas"
  porque la bala **es** un numero de unidades. Sin el opt-out, 50 balas serían 50
  filas de una y la celda de munición pintaría "0" en cada una.
  `_sacarUno()` (los eventos `takeWeapon` / `takeMagazine` / `takeAccessory`) rechaza
  lo no instanciado con un log: son caminos de unidades, y un stack no es una unidad
  con estado.
- **Arma equipada** (slot de GTA) y **cargador del cinturon** salen de
  `items[]` (estan en `Ballistic.equipped` / `belt[]`), por lo que **no pesan**
  en `getTotalWeight()`.
- La **municion de un arma equipada no esta en ningun lado del mod**: vive en la
  `CWeapon` del ped y sale del save del juego. Por eso `getEquippedAmmo(slot)` la
  lee con `GET_AMMO_IN_CHAR_WEAPON` en vez de sacarla del registro.
- Saves viejos con `quality` (1..N, "Cal: N") → `salud` = `SALUD_MAX`, en
  `_normalizeInstances`. La conversion es exacta: `quality` solo valía 1
  (nadie pasaba `opts.quality`), o sea "como nuevo". La migración recorre
  `items[]`, **todos** los baules y `belt[]`.
- **Contrato de cantidad** (`removeItem`, `addToTrunk`, `removeFromTrunk`): si
  no hay `qty` unidades disponibles, **no se mueve nada y se devuelve `false`**.
  Nunca "mover lo que haya y decir que salió". Dos bugs salieron de lo contrario:
  la fila de origen se borraba entera (`qty - n <= 0`) y el destino recibía `qty`
  completo, o sea **material creado de la nada**; y `removeItem`ava solo la
  primera fila coincidente, así que un id apilable repartido en varias filas se
  cobraba de más. Quien llama avisa del fallo (`putInTrunk` → `TRK_NOG`).
- `removeItem` con un `qty` mayor que el stock **no borra de más y devuelve
  `false`**: antes quitaba la fila entera y decía que había salido (perdía
  3 unidades y reportaba éxito).
- **`addItem` con `maxStack` parte filas, y el tope es opt-in.** Un item que declara
  `maxStack` se reparte en filas de a `maxStack`: **completa la fila existente antes
  de abrir una nueva**, así que agregar 30 a un stock de 37 da 50 y 17, no una de 67.
  Un item que **no** lo declara se apila en una sola fila como siempre —la chatarra
  con 400 unidades es una fila—, y por eso el tope no se puso general: habría roto
  el árbol entero para acomodar un caso, con un número que no existe todavía.
  El chequeo de peso sigue siendo sobre el `qty` total, una sola vez.
- **`addItem` es atómico con `qty > 1`**: valida el peso de las N unidades de una
  vez (`weight * qty`) y las mete todas. Por eso los llamadores entregan de a uno
  (`addItem(id, 1)` en un bucle) era un bug, no una costumbre: el precheque
  (`w*qty` de una vez) y el `addItem` de a uno (suma acumulada) divergen en punto
  flotante, y con esa divergencia el retiro dejaba items entregados **con la
  línea del pedido intacta** — duplication ilimitada, reintentando el click.

### Capacidad (codigo real)

| Contenedor | Peso Max | Donde |
|---|---|---|
| Inventario jugador | 12 kg (`MISC.MAX_INVENTORY_WEIGHT`) | `Config.js` |
| Baul por vehiculo | `getVehicleTrunkCapacity(model)` (default 150) | `data/gsis_vehicle_data.js` |

Slots: no implementados (solo peso).

---

## 2. Pesos por Item (kg por unidad)

| Item | Peso |
|---|---|
| scrap_metal | 0.5 |
| gunpowder | 0.2 |
| spring | 0.1 |
| barrel_small | 0.8 |
| pistol_frame | 0.6 |
| pistol_barrel | 0.4 |
| rifle_receiver | 1.2 |
| rifle_barrel | 1.0 |
| armor_plate | 1.5 |
| scope | 0.3 |
| 9mm | 1.5 |
| pistol_assembled | 1.2 |
| silenced_9mm | 1.5 |
| desert_eagle | 1.8 |
| shotgun | 3.0 |
| sawed_off | 1.0 |
| combat_shotgun | 3.5 |
| micro_uzi | 1.5 |
| mp5 | 2.5 |
| tec9 | 1.4 |
| ak47 | 3.5 |
| m4_assembled | 3.5 |
| country_rifle | 2.5 |
| sniper_rifle | 4.0 |
| rpg | 7.0 |
| heat_seeker | 6.0 |
| flamethrower | 5.0 |
| minigun | 10.0 |
| body_armor | 2.0 |
| mag_* (17 cargadores) | 0.2 (cohete/deposito/minigun: 0.5) |

---

## 3. Operaciones (API real)

El inventario vive en `modules/inventory/` (4 archivos) y el equipo en
`modules/weapons/`. `modules/gsis_Items.js` y `modules/gsis_Ballistic.js` ya no
existen: el refactor los partio en modulos con una frontera cada uno.

```javascript
import {
    addItem, removeItem, entregaOpts, isInstanced,     // desde index.js -> logic.js
    getItems, getTotalWeight,                          // desde index.js -> state.js
    addToTrunk, removeFromTrunk, equipMagToBelt, unequipBeltMag,
    getTrunkItems, getTrunkWeight, getTrunkMaxCapacity,
    getBelt
} from "../modules/inventory/index.js";
import {
    equipWeapon, unequipWeapon, attachAccessory, detachAccessory, tryReload
} from "../modules/weapons/logic.js";
import { getEquipped, getEquippedForUI } from "../modules/weapons/state.js";
```

Los dos modulos **no se importan entre si**. Se hablan por el bus, y los nombres
de los eventos estan en `core/gsis_EventNames.js`. Esa propiedad es un assert,
no una convencion: vive en `check-ui-flow.mjs`. Ver
[gsis_CONTRATOS.md](./gsis_CONTRATOS.md).

### Lo que hace cada modulo

| Modulo | Es responsable de | NO es responsable de |
|---|---|---|
| `modules/inventory/` | `items[]`, `trunks{}`, el cinturon, peso, precio de entrega | De que arma es, ni de si esta equipada |
| `modules/weapons/` | El registro `equipped[slot]`, equipar, montar, recargar | De guardar el peso, ni de.Instancear cargadores |

`isInstanced` se reexporta desde `inventory/index.js` pero **es una pregunta del
catalogo** y vive en `data/gsis_item_data.js`. Queda asi porque
`gsis_Trunk.js` y `gsis_WeaponSeller.js` lo importan de ahi, y moverlo
tocaria dos modulos que no cambian por otra razon. La deuda esta anotada en el
propio archivo.

### Como se usan

```javascript
addItem("scrap_metal", 5);           // valida peso max
removeItem("scrap_metal", 2);
getTotalWeight();                    // kg totales

addItem("mag_9mm", 1);               // cargador: 1 instancia, ammo segun el .dat
addItem("mag_9mm", 1, { ammo: 3 });  // opcional: municion parcial

addItem("9mm", 1);                   // arma: 1 instancia
addItem("9mm", 1, { force: true });  // ignora peso (adopcion del ped)

addToTrunk(vehicleId, "colt45", 1);    // inv -> baul (valida cap baul)
removeFromTrunk(vehicleId, "colt45", 1);// baul -> inv (valida peso max)
```

Y en `modules/weapons/` — **el cinturon de cargadores y el slot del arma**, que ya
no son `getBelt()` / `equipWeapon()`:

```javascript
// Los cargadores van a DOS ranuras, no a un cinturon
equiparCargador("mag_colt45_c15");       // inv -> ranura 1
guardarCargador(0);                      // ranura -> inv, con lo que le queda
llenarDesdeCaja(true, 0);                // la caja de balas -> esta ranura
getCargadoresEquipados();                // [{ id, indice, ammo, cap }]

// El arma: un item de FAMILIA, y la variante sale de los accesorios
equipar("colt45");                       // inv -> slot del motor, DESNUDA
desequipar(2);                           // slot -> inv, con su cargador puesto
montarSilenciador(2, "suppressor");      // silencia el arma y cambia de variante
quitarSilenciador(2);                    // lo saca y vuelve a la mochila
recargar();                              // R: monta el cargador y cambia de variante

getEquipadas();                          // [{ id, slot, ammo, cap, cargador,
                                         //    silenciador, configuracion, ... }]
reconciliar();                           // el tipo del ped = el de los accesorios
```

> **Ojo, esto cambió el 03/10/2026.** Antes eran `getBelt()` / `equipMagToBelt()` /
> `equipWeapon(id, attachments)` / `attachAccessory()` / `detachAccessory()` /
> `tryReload()`, con el cinturon como contenedor y los accesorios como una **lista en
> la fila**. **Ninguna de esas seis existe hoy.** Lo que hay son dos ranuras de
> cargador (`WEAPONS.CARGADORES_EQUIPADOS`, en `core/gsis_Config.js` — no era
> `MISC.CARGADORES_EQUIPADOS`), un item por familia, y el silenciador como
> **booleano en la fila del arma** — ver [`gsis_WEAPONS.md`](./gsis_WEAPONS.md) y
> la sección "POR QUÉ NO SE VOLVIERON LOS ACCESORIOS POR INSTANCIA" de
> [`gsis_VARIANTES.md`](./gsis_VARIANTES.md).

### Firmas de diseno (referencia)

Los ejemplos con `container`/`source`/`target` de las secciones siguientes son
**diseno historico**; la implementacion usa `ItemManager` unico con
`items[]` + `trunks{}` y `getModuleData`/`setModuleData`.

### Equipo — solo entra en el slot de GTA si se equipa

Regla base: **ningun arma esta en un slot de GTA salvo que el jugador la haya
equipado desde el inventario**, y su estado viaja en el registro
`GameState.Ballistic.equipped[slot] = { id, family, attachments, salud }`.
**Cuatro campos, ni uno mas**: el `weaponType` se deriva y no se persiste, y
`hasMag` y `otros` se derivan de `attachments` en `getEquippedForUI()`.

- `equipWeapon(itemId, attachments)`: saca el arma de `items[]` por el bus
  (`ITEMS_TAKE_WEAPON`) → `_aplicar()` en `weapons/logic.js`. Si el slot ya
  estaba ocupado por otra arma se desequipa antes (**auto-swap**); si la otra no
  cabe en el inventario, no se equipa la nueva.
- **`_giveInternal()`** (`modules/weapons/internal.js`) es el **único** punto del
  mod que da un arma, y lo usan los tres caminos: equipar, el restore de
  desequipar y el restore de la adopcion. Existe en un archivo aparte para que
  `logic.js` y `reconcile.js` puedan compartirlo **sin importarse entre si**.
  Su orden, en 7 pasos:

  1. **Ordena** la lista de accesorios, una sola vez y aqui. Es el punto de paso
     de todas las armas del mod, y por eso la canonizacion va aca y no en cada
     llamador: la identidad de una configuracion es un **conjunto**, y si la lista
     dependiera del orden de montaje, el mismo arma se guardaria de dos formas.
  2. **Resuelve** con `resolveWeaponType(family, lista)`. Si da `null`, **no da
     ninguna arma** y devuelve el motivo: no hay caida silenciosa a la base.
  3. **Lee** la capacidad con `Engine.clipCapacityOf(tipo)` y recorta la reserva.
  4. `ensureModelForType(tipo)` — el modelo antes del give, o el arma puede no
     verse en la mano del ped.
  5. `REMOVE_ANTES_DE_GIVE`: si el slot tenia otro tipo, lo saca antes. Es
     `true` y **no esta probado si el GIVE solo alcanzaria** — ver
     [gsis_WEAPONS_VERIFICADO.md §4](./gsis_WEAPONS_VERIFICADO.md).
  6. `Engine.giveWeapon()` y despues **verificacion por memoria**
     (`Engine.hasWeapon`): el native puede mentir. Sin ese paso, un `throw` que
     habia dado el arma desarmaba al jugador.
  7. Clip, reserva y estado `READY` en memoria. El estado importa: si el motor
     deja el arma en `OUT_OF_AMMO`, `CWeapon::Fire` hace `return false` y no
     dispara aunque tenga balas.

- `unequipWeapon(slot)`: lee la munición viva del ped → saca el tipo →
  `ITEMS_STORE_WEAPON` (vuelve a `items[]` con su cargador, balas y salud). Si no
  cabe (`INV_FUL`) el arma sigue equipada y se recupera.
- `_reconcileLoadout()` (cada frame, solo con control de jugador):
  - arma de catalogo en el ped **sin registro** (mision, cheat, save viejo) →
    se **adopta** al inventario como instancia con su estado (`force: true`,
    asi que no bloquea el peso) y se quita del ped;
  - registro cuyo arma ya no esta en el ped → se limpia la entrada;
  - coincidencia → **normaliza la munición**: jamás mas de un cargador montado
    y, si `hasMag === false`, el arma queda en 0/0.
  - Melee, granadas, cámara, paracaidas (fuera de catalogo) → no se tocan.
- Peso: lo equipado (arma en slot o cargador en el cinturon) **no cuenta**.
- Duplicado de variantes: `weaponId` repetido en el catalogo (p.ej. `9mm` y
  `pistol_assembled`, ambos `weaponId: 22`) → la adopcion usa el primer itemId
  de `WEAPON_DATA` para ese `weaponId`.

### Cinturon de cargadores

Tres casillas ficticias (`MISC.MAG_BELT_SLOTS`, ampliables con stats a
futuro) en `ItemManager.belt`, cada una con una instancia de cargador o
`null`. Solo cargadores **equipados** estan ahi: salen de `items[]` y no
pesan.

- `equipMagToBelt(id)` (detalle del item → boton EQUIPAR) ocupa la primera
  casilla libre con la instancia de ese tipo **con mas balas**; si no queda
  casilla → `BELTFUL`.
- `unequipBeltMag(index)` (chip en la franja EQUIPO) lo devuelve a `items[]`
  respetando el peso maximo.
- El cinturon es **la unica fuente de recarga**: la tecla R nunca mira el
  inventario completo.

### Recarga — por el bus, no nativa

Tecla **R** (`KEYS.RELOAD`) → `modules/weapons/logic.js` → `tryReload()`.

**El cambio de fondo:** la recarga ya no programa una animacion ni espia al motor.
Cambiar de cargador **es cambiar de `weaponType`**, y eso es dar y quitar, no
mover balas. La animacion de recarga, el estado `RELOADING` y el watchdog que
existian para "poner un cargador encima de un arma que ya estaba ahi" se fueron
enteros: con el cambio de tipo no hay estado que dejar colgado.

Lo que hace ahora, en orden:

1. Lee el arma de la mano (`Engine.readCurrentWeapon()`) → slot, tipo, munición.
   Si el slot no tiene entrada en el registro, sale: el arma no es nuestra y eso
   no es un error.
2. Si la familia no tiene cargadores en el catalogo, lo avisa y sale.
3. **Caso 1 — hay cargador en el cinturon que le sirve:** pregunta por el bus con
   `ITEMS_SWAP_MAGAZINE`. Si inventory acepta, cambia la variante: saca el
   cargador viejo de la lista y mete el nuevo, **conservando los otros accesorios**
   (montar el tambor del AK no le quita el silenciador). Después
   `Engine.setAmmo()` con el **cargador del cinturon recortado a la capacidad del
   tipo NUEVO**, no a la anterior.
4. **Caso 2 — no hay recambio y hay cargador montado con balas:** lo saca
   (`ITEMS_EXTRACT_MAGAZINE`), vuelve a la variante base y deja el arma
   descargada. El cero va al **tipo nuevo**; ponerlo en el viejo deja al arma base
   con la munición que `_aplicar` le acaba de dar.
5. **Ninguno de los dos:** avisa `NO_MAG`.

**El caso 3 — rellenar el cargador ya montado — no existe y no es implementable**
sin decidir de donde salen las balas: el sistema no tiene municion suelta, todo
esta en cargadores instanciados. No es un bug, es una decision de diseno que
falta tomar. Ver [gsis_WEAPONS_VERIFICADO.md §4](./gsis_WEAPONS_VERIFICADO.md).

El cinturon es **la unica fuente de recarga**: la R nunca mira el inventario
completo, y `ITEMS_SWAP_MAGAZINE` es lo que hace esa busqueda.

Reglas:

| Regla | Detalle |
|---|---|
| Capacidad | **la del motor**, leída con `Engine.clipCapacityOf()`. El mod no la escribe nunca |
| Munición | se escribe con `Engine.setAmmo()` al cambiar de tipo. Sin animacion de recarga propia |
| Peso | nada entra ni sale de `items[]` al recargar: el cambio es de configuracion |
| Guardado | las balas del arma equipada no están en el save del mod: viven en la memoria del juego |
| Entrega | un **arma comprada llega con la reserva de su cargador base** (`entregaOpts`). Un cargador se entrega nuevo y **lleno**. Materiales y `body_armor` usan el default de `addItem` |
| Municion en la tabla | `"<balas que quedan>/<rounds que trae>"`. El denominador es el `rounds` del item, **no** la capacidad del motor: son dos números distintos y confundirlos hacía que la misma fila valiera distinto según el cargador montado |
| `getEquippedAmmo` | devuelve `0` si no hay cargador montado, y **`null` si no se pudo leer**. Un `0` ahi seria mentira: diria que el cargador esta vacio cuando en realidad no se sabe |
| Arma fuera del registro | el reconcile la adopta al `items[]`; mientras tanto la recarga sale, porque sin entrada no hay familia |
| Instanciado vs apilado | "instanciado" / "N unidades" sale de **`isInstanced(id)`** (`modules/ui/views/itemRow.js`). La bala dice "N unidades" por el `instanced: false` |
| salud | todavia no se desgasta → vuelve con `salud: SALUD_MAX` (0..100) |
| Balas de mas | el reconcile recorta el `m_nAmmoInClip` al tope del motor; la **reserva no se toca** |
### Los cargadores tienen precio (parcialmente resuelto)

**Lo que un cargador es ahora:** un item de inventario con precio, que trae N
balas de reserva y no le cambia la capacidad a nadie. Ver
[gsis_WEAPONS.md](./gsis_WEAPONS.md) §0.

- **Precio y canal**: los 25 cargadores (`mag_*` + `suppressor`) son entradas de
  `WEAPON_DATA` con `category: "Cargadores"` y `price > 0`, así que el dealer los
  lista (`_snapDealer` itera `WEAPON_DATA`) y la columna Valor los lee.
  Antes `mag_*` no estaba en `WEAPON_DATA`, así que `getWeaponPrice` daba 0 y no
  aparecían en el armero.
- **Fuera de las rutas de arma**: `weaponId: null` (no matchean un tipo de arma)
  y `slot: null` (`_weaponDefByItemId` los rechaza, o sea que no son equipables).
  No tienen `clipSize` porque no tienen capacidad.
- **Cuántas balas traen**: `rounds` declarado, o el `clipSize` del arma tras
  quitar el prefijo `mag_` (`getRoundsByItemId`). Un tambor declara `rounds: 75`
  porque `"mag_ak47_drum"` no resuelve a ningún arma.
- **Valor con municion** (`getMagValue`): precio del cargador + `PRECIO_BALA x
  balas`, con `PRECIO_BALA = 2`. Un cargador lleno vale más que uno vacío y nunca
  supera el precio del arma. `getSellPrice` sigue siendo la base de trueque (sin
  municion). La calibración de precio histórica está más abajo; la fuente de
  precios de hoy es `CARGADORES.precio` en `data/gsis_weapons.js`.
- **Fuera del trueque**: los cargadores tienen precio pero no son `type "weapon"`, y
  el seller y `_snapSeller` filtran por type, así que un NPC no los compra. El
  precio es para el dealer y el Valor, no una invitación a la reventa.

**LO QUE FALTA, y es una decisión de diseño abierta:** el cargador ya no le
cambia nada al arma, así que **no hay ningún canal de municion** entre el
cargador del inventario y la reserva del arma equipada. Hoy el arma llega con su
reserva de fábrica y se recarga sola hasta quedarse seca; comprar cargadores da
balas que no van a ninguna parte.

Opciones, para cuando se decida:

1. **R consume un cargador del cinturón** y suma su `rounds` a la reserva del arma
   (`SET_CHAR_AMMO`). Toca la `CWeapon` del ped, **nunca** `m_nAmmoClip`. Es el
   camino más corto y el más fiel a lo que hace el juego.
2. **El cargador desaparece al usarse** (es munición, no una pieza). El `ammo` de
   la instancia pasa a la reserva y la fila se borra.
3. **Volver al modelo de "cargador montado"**, pero solo como estado de la
   instancia y sin tocar la capacidad: `equipped[slot].magId` vuelve a existir y
   R cambia cuál está montado. Es lo que había, sin la parte que rompía.

La opción 1 es la que el diseño de "el cargador es un accesorio con `rounds`"
sugiere, y es la que no contradice §0. Pero es diseño de juego, no una decisión
de refactor: por eso no se hizo ahora.

---

## 4. Modificador de Velocidad por Peso

> **Diseño — no implementado** (Fase 2, roadmap 2.6). Ejemplos con `GameState.*`
> son pseudocódigo de diseño; el código real usa `getModuleData("ItemManager")`.

Si el peso de la mochila supera el 80% de su capacidad, CJ se mueve mas lento.

```javascript
function getWeightSpeedModifier(currentWeight, maxWeight) {
    const ratio = maxWeight > 0 ? currentWeight / maxWeight : 0;
    if (ratio <= 0.8) return 1.0;      // Sin penalizacion
    if (ratio <= 0.9) return 0.85;     // -15% velocidad
    if (ratio <= 1.0) return 0.70;     // -30% velocidad
    return 0.50;                        // -50% (sobrecarga maxima)
}
```

### Aplicacion al Jugador (diseno)

```javascript
function applyWeightPenalty(player) {
    const currentWeight = getTotalWeight();  // API real, sin argumentos
    const modifier = getWeightSpeedModifier(currentWeight, MISC.MAX_INVENTORY_WEIGHT);
    // native("SET_PLAYER_MAX_SPEED", 0, modifier);  // pendiente
}
```

---

## 5. Interaccion con Vehiculos

> **Diseño obsoleto.** `loadVehicle`/`unloadVehicle`/`isTrunkOpen` nunca se
> escribieron: el baul real es `addToTrunk(vehicleId, id, qty)` y
> `removeFromTrunk(vehicleId, id, qty)` (los de arriba), y la "deteccion" es una
> esfera que crea `gsis_Trunk` + `DIST.TRUNK_ACCESS`, no el angulo de una puerta.
> Los tres se quedan como ejemplo de la API que **no** existe.

### Cargar Vehiculo (desde mochila al baul)

```javascript
function loadVehicle(vehicleId, itemId, qty) {
    return addToTrunk(vehicleId, itemId, qty);
}
```

### Descargar Vehiculo (desde baul a mochila)

```javascript
function unloadVehicle(vehicleId, itemId, qty) {
    return removeFromTrunk(vehicleId, itemId, qty);
}
```

### Deteccion de Baul Abierto

```javascript
function isTrunkOpen(carHandle) {
    // Verificar angulo de la puerta trasera
    const trunkAngle = native("GET_DOOR_ANGLE_RATIO", carHandle, 1);
    return trunkAngle > 0.5;
}
```

---

## 6. Persistencia del Inventario

Implementado via **SaveManager** (no variables SCM), en dos modulos de save:

- `ItemManager` → `{ items, trunks, belt }`. La clave vive en
  `modules/inventory/state.js` como `SAVE_KEY`.
- `Ballistic` → `{ equipped }` (armas en slot de GTA). Idem en
  `modules/weapons/state.js`.
- Leer: `getModuleData(SAVE_KEY)`
- Escribir: `setModuleData(SAVE_KEY, data)`
- Auto-save / F5 serializa todo el `GameState` a INI chunked (`saveGame`)

Los dos modulos se registran con `registerModule()` desde su `index.js`, y ambos
usan `getModuleData`/`setModuleData`. Lo que **no** comparten es el acceso: el de
inventario no importa nada de weapons y al reves, y se hablan por el bus.

```javascript
// modules/inventory/index.js
import { registerModule, getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
registerModule(SAVE_KEY, { items: [], trunks: {}, belt: [] });

// Tras mutar:
setModuleData(SAVE_KEY, data);
```

### El save se versiona, y el registro se migra

`SAVE_FORMAT_VERSION = 2`, en `core/gsis_SaveMigration.js`.

- **v1**: `equipped[slot]` con 7 campos, incluido `weaponType` y
  `variantWeaponType`
- **v2**: `equipped[slot]` con 4 campos

El migrador esta en `modules/weapons/migrate.js` y **se registra al importarse**
(`registerSaveMigrator(1, "weapons-v2", ...)` en el cuerpo del modulo, no dentro
de una funcion). Eso importa: `weapons/index.js` lo importa con
`import "./migrate.js"`, y los imports del entry se evaluan **antes** de que corra
`initSaveManager()`, que es quien dispara `loadGame`. Registrarse en el `init()`
llegaria tarde y la primera carga de un save viejo pasaria sin migrar.

Borra **`hasMag` y `magId`** de cada `equipped[slot]` — los dos campos con los que
el registro guardaba el cargador montado, que ya no es un concepto — y degrada a
la variante base las entradas sin familia reconocible. El registro queda
`GameState.Ballistic.equipped[slot] = { id, family, attachments, salud }`.

La `Instance` de arma en `items[]` tampoco lleva `hasMag`, y su `ammo` es la
reserva.

---

## 7. Item Definitions (fuente real: `data/gsis_item_data.js`)

```javascript
export var ITEMS = {
    "scrap_metal":   { name: "Chatarra",        weight: 0.5, type: "material" },
    "gunpowder":     { name: "Polvora",         weight: 0.2, type: "material" },
    "spring":        { name: "Muelle",          weight: 0.1, type: "material" },
    "barrel_small":  { name: "Canon corto",     weight: 0.8, type: "material" },
    "pistol_frame":  { name: "Chasis pistola",  weight: 0.6, type: "material" },
    "pistol_barrel": { name: "Canon pistola",   weight: 0.4, type: "material" },
    "rifle_receiver":{ name: "Culata rifle",    weight: 1.2, type: "material" },
    "rifle_barrel":  { name: "Canon rifle",     weight: 1.0, type: "material" },
    "armor_plate":   { name: "Placa blindada",  weight: 1.5, type: "material" },
    "scope":         { name: "Mira",            weight: 0.3, type: "material" },
    "9mm":           { name: "9mm",             weight: 1.5, type: "weapon" },
    "pistol_assembled": { name: "9mm",          weight: 1.2, type: "weapon" },
    "silenced_9mm":  { name: "Pistola con silenciador", weight: 1.5, type: "weapon" },
    "desert_eagle":  { name: "Desert Eagle",    weight: 1.8, type: "weapon" },
    "shotgun":       { name: "Escopeta",        weight: 3.0, type: "weapon" },
    "sawed_off":     { name: "Escopeta recortada", weight: 1.0, type: "weapon" },
    "combat_shotgun":{ name: "SPAS 12",         weight: 3.5, type: "weapon" },
    "micro_uzi":     { name: "Micro Uzi",       weight: 1.5, type: "weapon" },
    "mp5":           { name: "MP5",             weight: 2.5, type: "weapon" },
    "tec9":          { name: "Tec9",            weight: 1.4, type: "weapon" },
    "ak47":          { name: "AK-47",           weight: 3.5, type: "weapon" },
    "m4_assembled":  { name: "M4",              weight: 3.5, type: "weapon" },
    "country_rifle": { name: "Rifle",           weight: 2.5, type: "weapon" },
    "sniper_rifle":  { name: "Rifle de francotirador", weight: 4.0, type: "weapon" },
    "rpg":           { name: "Lanzacohetes",    weight: 7.0, type: "weapon" },
    "heat_seeker":   { name: "Lanzacohetes con atraccion al calor", weight: 6.0, type: "weapon" },
    "flamethrower":  { name: "Lanzallamas",     weight: 5.0, type: "weapon" },
    "minigun":       { name: "Minigun",         weight: 10.0, type: "weapon" },
    "body_armor":    { name: "Chaleco antibalas", weight: 2.0, type: "weapon" },
    // Cargadores (type magazine) — capacity via getClipSizeByItemId, no en el item
    "mag_9mm":       { name: "Cargador 9mm",    weight: 0.2, type: "magazine" }
    // ... +16 mags (silenced, DE, shotgun, sawed_off, spas12, uzi, mp5, tec9,
    //     ak47, m4, rifle, sniper, rpg, heat, flamethrower, minigun)
};
```

`type` es `"weapon"`, `"material"`, `"magazine"` o `"weapon_attachment"` (UI filtra por esto).
Cargadores: instancia `{ id, qty:1, ammo, salud }` (ver §1); el `clipSize` que
trae es el de `CARGADORES` en `data/gsis_weapons.js`.
Silenciadores: instancia `{ id, qty:1 }` con `instanced: true` en `ITEMS`. **Sin
`instanced` sería apilable**, y `ITEMS_TAKE_ACCESSORY` saca la fila **entera** del
id pedido: un silenciador con cantidad 2 se llevaría los dos de un montaje.

Armas: **una familia por item**, con sus variantes como datos en
`FAMILIAS[].variantes` (`data/gsis_weapons.js`). El `weaponType` **no está en el
item ni en el save**: se deriva de los accesorios con `tipoDe()`, y la capacidad la
dice el **motor** (`Engine.clipCapacityOf`), nunca el catálogo. El item de la
mochila es siempre el mismo `colt45`, estén o no los accesorios montados.

> **El silenciador viaja en la fila del arma**, no en un registro aparte: el campo
> `silenciador` va en el `id` de la fila de `items[]` y en
> `GameState.Weapons.equipped[slot]`, y `ITEMS_STORE_WEAPON` / `_sacarUno` lo copian
> en los dos sentidos. Es un dato más de la fila, no una tabla aparte, y es lo que
> permite que el arma vaya a la mochila y vuelva con el silenciador puesto.

Precios: `FAMILIAS.precio` / `CARGADORES.precio` / `SILENCIADORES.precio`
(`data/gsis_weapons.js`) · `getDealerPrice(itemId)` (lo que cobra el dealer, con `ch.dealer.prices`) · `getSellPrice(itemId)` (trueque NPC).

> **Ojo, esto cambió DOS veces el 03/10/2026.** Antes había una tabla `WEAPON_DATA`
> con `weaponId`, `modelId`, `damage` e `isLong` en `data/gsis_weapon_data.js`, y un
> `getWeaponPrice()`. Ese archivo ya no existe, y con él `isLong`,
> `getWeaponPrice()` y el modelo de variantes. Después de eso vino un modelo de "cada
> configuración es su propio item" con una tabla `ARMAS`, que **también se fue**: hoy
> hay una familia por item. Ver [`gsis_VARIANTES.md`](./gsis_VARIANTES.md) y
> [`AGREGAR_ARMAS.md`](./AGREGAR_ARMAS.md).

**Calibración de precio (histórico).** La tabla `WEAPON_DATA.price` que se calibró
el 30/09 vivía en `data/gsis_weapon_data.js`, **un archivo que ya no existe**. La
idea que había detrás sigue siendo la que aplica: el precio representa el **orden
y la magnitud relativa** del mercado real, no el dólar 1:1. Los valores concretos
de esa tabla tampoco aplican —hoy un arma va de `FAMILIAS.precio` 550 y un
cargador de 220-250—, pero el criterio de "precio como posición relativa, no como
cambio exacto" sigue siendo el correcto. Ver `FAMILIAS.precio` en
`data/gsis_weapons.js`.

| | antes | ahora |
|---|---|---|
| Escopeta Remington 870 | 1.000 | **450** — el arma más barata |
| 9mm | 400 | 550 — ancla |
| AK-47 | 2.500 | **950** — deja de ser la recompensa cara |
| M4 | 3.000 | **1.100** |
| 9mm silenciada | 600 | **1.800** — ahora sí es de las caras |
| Micro Uzi | 700 | **1.900** |
| Desert Eagle | 900 | 1.950 |
| Minigun | 15.000 | 15.000 — sigue arriba de todo |

`price` alimenta **dos** cosas: lo que paga el jugador en el dealer, y la columna "Valor" / la base del trueque. **No** es la "Venta" de la calle de `gsis_ECONOMY.md` §2, que es otro canal (productos de crafteo vendidos 5x-29x sobre materiales de $50-$200) y no lee estos números — por eso se pudo mover la base sin romper los márgenes del crafteo.

`dealer_local` **no** tiene `prices` fijos: usa `markup: 1.2` sobre la base. Antes fijaba 3 armas a 100/300/200, y como `prices` gana sobre la base en `getDealerPrice`, el precio base no participaba en ninguna compra.

---
## Variantes de cargador (tambor de AK, D-60, Lancer) — ELIMINADAS

> **Esta sección describe un sistema que ya no existe.** Se conserva la tabla
> porque los cargadores premium **siguen en el catálogo** (con `rounds`, con
> precio, y con valor de mercado). Lo que se eliminó fue lo que el párrafo
> siguiente proponía: hacer que un cargador le cambiara la capacidad al arma.
>
> El problema era el del §1 de [gsis_WEAPONS.md](./gsis_WEAPONS.md): el motor
> tiene UNA capacidad por tipo de arma, y "cambiarla" significaba reescribir
> `m_nAmmoClip` de la `CWeaponInfo` **global de ese tipo**. Mientras el jugador
> llevara el tambor, todos los NPC con AK del mundo entraban 75 balas. No
> sobrevivía a un guardar/cargar, y obligaba al mod a llevar `magId` en el save
> solo para poder deshacerlo. Ver `gsis_WEAPONS.md` §0.
>
> **Lo que quedó:** el tambor de 75 son 75 balas de **reserva**, y el AK sigue
> entrando de a 30 como siempre. La diferencia entre el cargador base y el
> premium es de precio y de valor, no de capacidad.

> ### Histórico: el modelo de datos que se Creeó y después se retiró (03/10/2026)
>
> El modelo que quedó en su momento era el de `gsis_weapon_variants.js`:
> **familia / accesorio / variante**. Un accesorio con `rounds` es un cargador; un
> accesorio con `model` es un silenciador. Montarlos resolvía a un `weaponType` que
> el motor ejecuta, y la capacidad de ese `weaponType` la tenía el `.asi` en **su
> propia** `CWeaponInfo` — no la del juego.
>
> **Ese modelo se borró entero el 03/10/2026**, junto con `resolveWeaponType()` y
> `WEAPON_VARIANTS`. Lo que vino después —"cada configuración es su propio item", con
> el `weaponType` declarado en `ARMAS`— **también se fue el mismo día**. Hoy hay
> **una familia por item** y el tipo se deriva con `tipoDe()`. La parte que sigue
> cierta es la última: la capacidad de un tipo de plugin la tiene el `.asi` en su
> propia `CWeaponInfo`, y por eso no hace falta parchar la tabla global.

| Arma | Cargadores | `rounds` (balas que traen) |
|---|---|---|
| Colt .45 | OEM, replica, extendido | 8, 8, 15 |
| MP5 | original, replica | 30, 30 |
| AK | acero, polímero, búlgaro, tambor | 30, 30, 30, 75 |
| M4 | STANAG, polímero, Lancer, D-60 | 30, 30, 40, 60 |

El M4 bajo de 50 a 30 balas: el STANAG real son 30, y con 50 el "extendido" de 40
seria PEOR que el estandar.

> **Esta tabla es historica.** El sistema de cargadores por familia ya no es como
> esta. Lo vigente: [gsis_WEAPONS.md](./gsis_WEAPONS.md) §0 para la regla de
> capacidad, y `data/gsis_weapons.js` para las cifras de verdad. Notablemente, los
> cargadores de 30 sobre un arma de 30 **no gastan tipo propio**: resuelven a la
> variante base, porque al montarlos el motor no tiene que ejecutar nada distinto.
> Solo lo gastan los que cambian la capacidad —el tambor del AK (75), el Lancer
> (40) y el D-60 (60)— y esos tres si tienen fila en el `.dat`.
>
> Ver [gsis_CONTRATOS.md](./gsis_CONTRATOS.md) para como se hablan las piezas, y
> [gsis_TESTING.md](./gsis_TESTING.md) para los checks.