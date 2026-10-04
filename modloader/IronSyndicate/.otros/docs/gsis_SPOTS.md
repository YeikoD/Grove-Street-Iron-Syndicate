# GSIS — Spots (esferas de interacción)

Esferas que **condicionan** los menús de baúl, armería, retiro y trueque. N entradas por tipo — sin tocar Config ni actores.

La diferencia con los actores: una esfera no es un punto que abre algo, es **la condición** para que el menú exista. Si la esfera no está, el menú no se puede abrir (por eso apagarla es una decisión, no un efecto).

Ver: [Actores](./gsis_ACTORS.md) · [Input](./gsis_INPUT.md) · [WebUI](./gsis_WEBUI.md) · [Arquitectura](./gsis_ARCHITECTURE.md) · [Testing](./gsis_TESTING.md) · [L10n](./gsis_L10N.md)

---

## 1. Archivos

| Archivo | Rol |
|---|---|
| `data/gsis_spot_data.js` | Catálogo: `SPOTS.dealer/seller/pickup` + `getSpots(type)` |
| `core/gsis_SpotRuntime.js` | Runtime compartido: gate, ciclo de vida de las esferas, cooldown, `spotCanOpen` / `closeSpotFlow` |
| `modules/gsis_WeaponDealer.js` | Esferas **dealer** → menú carrito (`openDealerMenu`) |
| `modules/gsis_WeaponSeller.js` | Esferas **seller** → menú trueque (`openSellMenu`) |
| `modules/gsis_DealerPickup.js` | Esferas **pickup** + blips → menú retiro (`openPickupMenu`), solo si hay pedido |
| `modules/gsis_Trunk.js` | Esferas propias por vehículo (siguen al auto) + `openTrunkMenu` |
| `core/gsis_Config.js` | Radios: `DIST.SPHERE` (0.75), `DEALER_ACCESS` (1.5), `DEALER_CLOSE` (1.5), `TRUNK_ACCESS` (1.5), `MENU_CLOSE` (1.5) · `KEYS.FLOW` (32) · `TIMERS.SPHERE_COOLDOWN` (6000) |

Los handles de las esferas de los tres módulos con spots viven **en el runtime**, no en el módulo: hay que poder apagarlas y encenderlas en cualquier frame, y que el que decide sea el mismo en los dos caminos. El baúl es la excepción (las suyas cuelgan del auto) y por eso su cooldown se pide de afuera, con `beginSpotCooldown("trunk")`.

---

## 2. Configurar spots

En `gsis_spot_data.js`:

```javascript
export var SPOTS = {
    dealer: [
        { id: "dealer_0", characterId: "dealer_local", x: 2511.8167, y: -1680.8763, z: 13.5086 }
        // , { id: "dealer_1", characterId: "dealer_raul", x: ..., y: ..., z: ... }
    ],
    seller: [
        { id: "seller_0", characterId: "seller_local", x: 2518.0669, y: -1677.9683, z: 14.4207 }
        // 10 sellers → 10 entradas; characterId = NPC propio (budget/intereses)
    ],
    pickup: [
        { id: "dealer_pickup_0", x: 2513.4575, y: -1689.7646, z: 13.5503 }
        // esferas/blips solo si hay pedido pendiente
    ]
};
```

### Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Único dentro de su tipo (`dealer_0`, `seller_1`…) |
| `characterId` | string | **Opcional** — personaje que atiende ESA esfera (→ `CHARACTERS[].id`). Sin él → `seller_local` / `dealer_local` |
| `x` `y` `z` | number | Coords **absolutas** del mundo (dónde se aprieta ESPACIO) |

No hay heading ni modelo — las esferas son solo puntos de interacción.

**Multi-personaje**: `characterId` fija quién abre el menú (estado seller, carrito/precios dealer, título y `characters:say` en UI). Ver [CHARACTERS §2b](./gsis_CHARACTERS.md#2b-config-seller--dealer-multi-personaje).

### Añadir N instancias

| Caso | Acción |
|---|---|
| 5 dealers (mismo menú) | 5 objetos en `SPOTS.dealer` |
| 10 sellers | 10 en `SPOTS.seller` |
| Varios puntos de retiro | N en `SPOTS.pickup` (blip por cada uno) |

**No** hace falta tocar módulos ni Config — los 3 ya iteran `getSpots(...)`.

---

## 3. Cómo se abre y se cierra un menú de esfera

**Una sola tecla para los cuatro: `ESPACIO`**, y solo parada la esfera. Es la `I` del inventario, con la condición de la esfera. `ESC` también cierra.

El dueño de la tecla es **el bridge** (`modules/gsis_WebInterface.js`, `toggleFlow`), no cada módulo. Razón: si los cuatro leyeran la suya, la pulsación que abre un menú sería vista por los cuatro en el mismo frame, y el primero que la consumiera se la sacaría al resto — dos toggles cruzados en un frame, que es el menú que no se abre.

```
ESPACIO (o el comando flow:toggle de la página)
        |
        v
   toggleFlow()                          <- el bridge: una decisión por pulsación
        |
        +-- hay un menú de esfera abierto ------------> closeFlow()   (cierra)
        +-- está el inventario abierto ---------------> nada
        +-- no hay nada abierto ----------------------> openFlow()
                                                          |
                                              openTrunkMenu()   openDealerMenu()
                                              openSellMenu()    openPickupMenu()
                                                          |
                                                          v
                                                spotCanOpen(type, c)   <- el runtime
                                                 1. ¿hay esfera?
                                                 2. ¿en un vehículo?
                                                 3. ¿dentro del radio de acceso?
```

El bridge elige a quién llamar (`openFlow()` en `gsis_FlowSerialization.js`, que prueba los cuatro en orden y gana el primero que puede), y cada módulo aporta su `openXMenu()`: el radio y la esfera se preguntan al runtime, y el estado del menú (NPC del carrito, presupuesto del trueque) lo pone el módulo, porque solo él lo tiene.

| Llave | Menú | Condición |
|---|---|---|
| `I` | Inventario | En cualquier parte |
| `ESPACIO` | Baúl / armería / retiro / trueque | Dentro de la esfera **y** con la esfera prendida |
| `ESPACIO` o `ESC` | Los cinco | Con un menú abierto |

**El bridge no puede abrir un menú de esfera con el inventario abierto**, y el inventario tampoco se abre con un menú de esfera abierto (regla 1: una sola pantalla).

### Lo que NO hace la esfera

- **No auto-abre.** Pararse al lado no abre nada: se abre apretando la tecla. Antes se abría al tocar la esfera y se cerraba alejándose, que con el menú congelando al jugador era un soft-lock (no se podía salir de la esfera caminando, y la tecla que lo abría estaba suprimida con un menú abierto).
- **No cierra.** El cierre es la tecla, `ESC` o el botón de la página. El auto-cierre por distancia queda solo como red de seguridad para cuando algo teletransporta al jugador con el menú abierto.

---

## 4. La cooldown: la esfera se apaga 6 s al cerrar

Al cerrarse un menú, su esfera se **destruye** y vuelve sola `TIMERS.SPHERE_COOLDOWN` ms después (6 s por defecto).

Por qué hace falta si el menú ya no se abre solo: el menú congela al jugador, así que al cerrarlo el ped sigue exactamente donde estaba —dentro de la esfera—. Sin el apagado, cualquier cosa que vuelva a mirar "estoy en la esfera" daría `true` al frame siguiente: menú recién cerrado, jugador inmóvil, condición intacta. Con la esfera apagada, la condición se apaga con ella.

El blip del punto de retiro **no** se apaga con la esfera: sigue al pedido, porque sigue siendo verdad que hay algo para recoger (ver §6).

### La regla de la transición (importante al agregar un módulo)

La cooldown se pide con la **transición de abierto a cerrado, medida contra lo que el módulo publicó en su update anterior** (`_sawOpen`), no contra el flag de visibilidad:

```javascript
function updateWeaponDealerModule(now) {
    updateSpotSpheres("dealer", _gate, true);
    try {
        var c = new Player(0).getChar();
        _showDealerMenu = closeSpotFlow(c, "dealer", _showDealerMenu, spotHas("dealer"));
        if (!_showDealerMenu) _activeCharId = null;
        _trasCerrar();                       // ve la transición
    } catch (e) { }
}

function _trasCerrar() {
    if (_sawOpen && !_showDealerMenu) {
        beginSpotCooldown("dealer");
    }
    _sawOpen = _showDealerMenu;
}
```

No es un detalle: el cierre puede venir de afuera —`ESPACIO`, `ESC`, el comando de la página— y esos corren en el update del bridge, que es **el último** de la lista. Cuando el update del módulo llega al frame siguiente, el flag ya vale `false`. Midiendo contra el flag, cerrar con la tecla no apagaría la esfera: el menú cerraría y el punto quedaría prendido, que es justo lo que la cooldown vino a evitar.

El otro extremo del mismo error: pedir la cooldown "cuando no hay menú". Eso la pide en el frame en que se abre, y el menú no se puede volver a abrir nunca (la esfera no llega a existir).

La cooldown es **del tipo de menú, no del spot**: un jugador parado entre dos esferas del mismo tipo tiene las dos apagadas, que es lo correcto —si no, se apagaría la de al lado cada vez que cierra el menú de la otra—.

---

## 5. Gate interior

Igual que Actores/Spawner: si la partida carga en interior, no se crean esferas hasta `getAreaVisible() === 0`.

El gate vive en **`core/gsis_SpotRuntime.js`** (`createSpotGate` + `updateSpotGate`) y se resuelve **adentro** de `updateSpotSpheres`, no en el módulo: es el mismo para todos los tipos, y en el medio queda el caso difícil —un módulo que crea esferas adentro de un interior porque se olvidó de la línea del gate—.

```
// Carga en interior → logs:
// Al salir a la calle:
[SpotRuntime] 1 esferas de 'dealer' ENCENDIDAS
[SpotRuntime] 1 esferas de 'seller' ENCENDIDAS
[SpotRuntime] 1 esferas de 'pickup' ENCENDIDAS
```

---

## 6. pickup: la esfera y el blip no son lo mismo

| | Depende de | Por qué |
|---|---|---|
| Esfera | Pedido **y** cooldown | Es la puerta del menú. Sin pedido no hay nada que recoger; sin esfera (cooldown) el menú no se puede abrir |
| Blip | Solo del pedido | Es el aviso: "hay algo para recoger". Desaparecer del radar porque el jugador ya estuvo ahí sería un aviso falso |

Los blips se crean y se destruyen en `_syncBlips(pending)` (una línea), sin tocar la cooldown.

El retiro también es el único que **cancela** la cooldown: si el pedido se vació, la esfera se apaga por `want === false` y `endSpotCooldown` limpia el reloj. Si la cooldown quedara armada, la compra siguiente no tendría esfera para el menú y el punto de retiro se quedaría apagado con el pedido ya pagado.

---

## 7. El baúl: esferas que siguen al auto

El baúl no usa el catálogo de spots: su esfera cuelga del vehículo (`_openTrunks[id].pickup`) y **sigue al auto** (se recrea si el vehículo se movió más de 0.5 m). Por eso:

- El módulo crea y destruye las suyas (`_createTrunkPickupForVehicle` / `_dropTrunkSpheres`).
- La cooldown se la da el runtime igual: `beginSpotCooldown("trunk")` + `_dropTrunkSpheres("menu cerrado")`.
- Mientras la cooldown está armada, el seguimiento del auto **no** recrea la esfera: si lo hiciera, un auto en marcha la volvería a prender en medio del apagado.
- Al reencender, `_dropTrunkSpheres` también borra la posición guardada de la esfera, porque el seguimiento solo recrea cuando el auto se movió: con el auto quieto y la posición guardada, la esfera no volvería nunca.

`openTrunkMenu()` no usa `spotCanOpen` (su radio no es el de un spot): busca el vehículo con el baul **abierto** más cercano a `DIST.TRUNK_ACCESS`. Un baúl cerrado no tiene esfera, y al que no tiene esfera no se le abre menú.

---

## 8. Esferas vs actores

| | Spots (esferas) | Actores |
|---|---|---|
| Archivo | `gsis_spot_data.js` | `gsis_actor_data.js` |
| Qué es | Condición de un menú | Ped visual en el mundo |
| Módulo | WeaponDealer / Seller / Pickup (y Trunk, a parte) | `gsis_Actors.js` |
| N | N en `SPOTS.*` | N en `ACTORS` |
| Relación | **Independiente** | **Independiente** |

Coords pueden ser iguales o distintas — se escriben aparte. Mover un ped no mueve su esfera.

---

## 9. Distancias y tecla (Config)

```javascript
DIST = {
    SPHERE: 0.75,        // radio del objeto Sphere.Create (el marcador)
    TRUNK_ACCESS: 1.5,   // apertura con ESPACIO del menú baúl
    DEALER_ACCESS: 1.5,  // apertura con ESPACIO de dealer/seller/pickup
    MENU_CLOSE: 1.5,     // auto-cierre del menú baúl
    DEALER_CLOSE: 1.5    // auto-cierre de dealer/seller/pickup
};
KEYS.FLOW = 32;                        // ESPACIO — abre y cierra los 4
TIMERS.SPHERE_COOLDOWN = 6000;         // apagado tras cerrar
```

Dos reglas que no se ven en los números:

- **El radio de apertura tiene que ser ≤ el de cierre.** Si fuera mayor, el menú se abriría y se cerraría en el mismo frame: se abre porque estás a 2 m, y el auto-cierre ve que ya estás fuera del radio de cierre y lo baja. (El baúl tenía apertura en 3.0 y cierre en 1.5, y por eso la `B` no abría nada.)
- **Abre con el radio de acceso, no con `DIST.SPHERE`.** 0.75 m es el radio del marcador; a 75 cm de un punto nadie se clava a apretar una tecla. La esfera sigue midiendo lo que mide —la cooldown la apaga y la enciende de verdad— pero la puerta de entrada se mide con el radio de acceso.

---

## 10. Verificación

```powershell
node --check "modloader\IronSyndicate\cleo\IronSyndicate\data\gsis_spot_data.js"
node --check "modloader\IronSyndicate\cleo\IronSyndicate\core\gsis_SpotRuntime.js"
node --check "modloader\IronSyndicate\cleo\IronSyndicate\modules\gsis_WeaponDealer.js"
node --check "modloader\IronSyndicate\cleo\IronSyndicate\modules\gsis_WeaponSeller.js"
node --check "modloader\IronSyndicate\cleo\IronSyndicate\modules\gsis_DealerPickup.js"
node --check "modloader\IronSyndicate\cleo\IronSyndicate\modules\gsis_Trunk.js"
```

En juego, el log dice cada transición de la esfera:

```
[SpotRuntime] 1 esferas de 'dealer' ENCENDIDAS
[WebInterface] menu de dealer abierto por tecla ESPACIO
[SpotRuntime] esfera de 'dealer' APAGADA 6 s (menu cerrado)
[SpotRuntime] 1 esferas de 'dealer' apagadas (cooldown de 6 s)
[SpotRuntime] 1 esferas de 'dealer' ENCENDIDAS (fin de la cooldown)
```

Casos manuales: [TESTING §9](./gsis_TESTING.md#9-pruebas-manuales-checklist-en-juego) #40–48.
