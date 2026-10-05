# GSIS - Armas

Guía del sistema de armas de GSIS: qué es, cómo se decide qué variante tiene un
arma en la mano, y qué mirar cuando algo no funciona.

**Estado: vigente.** Reescrito el 03/10/2026 con el sistema de familias.

> **Este documento se reescribió DOS veces en un día, y la segunda es la que vale.**
>
> La primera describe un sistema de **variantes y accesorios** con
> `resolveWeaponType()` y las tablas `WEAPON_FAMILIES` / `WEAPON_ATTACHMENTS` /
> `WEAPON_VARIANTS`. Se borró entero el 03/10/2026 y fue reemplazado por un modelo
> de "cada configuración es su propio item".
>
> **Ese modelo tampoco duró.** El 03/10/2026 volvió el sistema de familias, con
> nombres nuevos: `FAMILIAS` en vez de `WEAPON_FAMILIES`, las variantes como datos
> dentro de la familia en vez de una tabla aparte, y `tipoDe()` en vez de
> `resolveWeaponType()`. Los accesorios sueltos volvieron como `suppressor`.
>
> Lo que **no** volvió: la lista de accesorios por instancia en el save. Esa fue
> la parte que ataba el sistema viejo con la mochila, y lo que se hace hoy es otra
> cosa (ver "El estado").

Para **cómo se agrega** un arma, un cargador o un accesorio:
[`AGREGAR_ARMAS.md`](./AGREGAR_ARMAS.md). Para **cómo funciona la recarga**:
[`gsis_RECARGA.md`](./gsis_RECARGA.md). Para el detalle de por qué funciona:
`C:\Dev\gsis-armory\_docs\gsis_TECNICA.md`, secciones `MOD`.

---

## La idea en cinco líneas

1. El jugador tiene **UNA** Colt .45 en la mochila. No cuatro.
2. Lo que determina cómo se ve y cuánto tiene es el **accesorio**: un cargador de 8,
   de 15, y un silenciador que se monta.
3. Cada combinación es una **variante**, y cada variante es un `weaponType` que el
   `.asi` registró de antemano en `gsis_weapons.dat`.
4. El `weaponType` **se deriva** de los accesorios. Nunca se guarda, nunca se elige
   en un menú.
5. Por eso las cuatro variantes se sienten como **la misma arma**: no hay cuatro filas
   en la mochila entre las que chooses, hay una y el cambio pasa en la recarga.

## La tabla

`data/gsis_weapons.js` tiene **cuatro** tablas:

| tabla | qué es |
|---|---|
| `FAMILIAS` | un item de arma por familia, con sus variantes |
| `CARGADORES` | los cargadores sueltos: son de una **capacidad**, no de un arma |
| `SILENCIADORES` | los silenciadores sueltos, que se **montan** en el arma |
| `MUNICION` | las balas sueltas: lo que se **gasta** para llenar un cargador |

Las tres primeras son de enero; `MUNICION` llega con el 04/10/2026.

```js
export var FAMILIAS = {
    "colt45": {
        nombre: "Colt .45",
        slot: 2,
        precio: 550,
        peso: 1.5,
        categoria: "Pistolas",
        variantes: [
            { nombre: "Colt .45",              weaponType: 63, clip: 8,  silenciador: false },
            { nombre: "Colt .45 C15",          weaponType: 62, clip: 15, silenciador: false },
            { nombre: "Colt .45 Silenced",     weaponType: 60, clip: 8,  silenciador: true  },
            { nombre: "Colt .45 Silenced C15", weaponType: 61, clip: 15, silenciador: true  }
        ]
    }
};
```

Y las otras tres:

```js
export var CARGADORES = {
    "mag_colt45":     { nombre: "Cargador Colt 45",         familias: ["colt45"], clipSize: 8,  ... },
    "mag_colt45_c15": { nombre: "Cargador Colt 45 Extended", familias: ["colt45"], clipSize: 15, ... }
};

export var SILENCIADORES = {
    "suppressor": { nombre: "Silenciador", precio: 400, peso: 0.1 }
};

export var MUNICION = {
    "bala_45": { nombre: "Balas .45", familias: ["colt45"] }
};
```

### La misma clave `familias` en las tres

`CARGADORES` y `MUNICION` usan **el mismo campo** para decir a qué familia sirven, y
por eso el casamiento es un solo código: `cargadorSirveA` y `balaSirveA` son la misma
función con otro nombre.

Que sea el mismo campo y no uno de calibre es lo que hace que agregar una familia
oblige a las mitades juntas: un cargador que declara `["ak47"]` sin que haya una bala
que sirva al `ak47` es un cargador que se llena solo de la nada, y
`check-dat.mjs` lo avisa.

El `.45` del id es el calibre **real** de la Colt .45. El motor llama "9mm" a su tipo
de munición interno, y por eso los cargadores se ven con `mag_9mm.png`. El calibre del
mundo es `.45` y las dos cosas viven en capas distintas: `data\` para una,
`UI\assets\imagenes\` para la otra.

## Las cuatro variantes y de dónde sale cada número

| configuración | tipo | modelo | padre | capacidad |
|---|---|---|---|---|
| pelada | 63 | 346 (vanilla) | 22 | 8 |
| cargador de 15 | 62 | 15065 (propio) | 22 | 15 |
| silenciada | 60 | 347 (vanilla) | 23 | 8 |
| silenciada + cargador de 15 | 61 | 15066 (propio) | 23 | 15 |

Esas cuatro filas están en **`gsis_weapons.dat`**, que es un archivo aparte del mod.
El `.dat` lo lee el `.asi` en su `DllMain`, antes de que exista un solo script de
CLEO, y el mod no abre archivos: la fila tiene que estar **duplicada**. Duplicada y
sin red, el error se ve en pantalla y no en el log — por eso existe
`tools/check-dat.mjs`.

**El padre es lo que decide la animación y el sonido**, y no es un detalle:

- Las variantes con modelo **propio** necesitan padre de la **misma clase de arma**.
  El 62 y el 61 usan modelos propios, así que el 62 clona del 22 (pistola) y el 61
  del 23 (silenciada).
- ~~Un modelo propio encima de un padre de otra clase deja la animación del modelo
  que ya no está, y apuntar con esa arma tira el juego. **Medido el 30/09.**~~

> **CORREGIDO el 03/10/2026, y esta corrección importa.** El crash **no era la
> animación**. Con `[SALIMITS] WeaponModels = 200` puesto, `61 23 15066 2 15 -1`
> **funciona**: clona del `23` y conserva su `animGroup 18`, el de la silenciada. Lo
> que se había medido el 30/09 era el **crash del pool de modelos**, que coincidió en
> el tiempo y se confundió con un problema de animación.
>
> La **precondición real es `WeaponModels = 200`**, no el padre. Y la regla de "misma
> clase" que queda en el primer punto es **media verdad**: es cierta para modelos
> propios y falsa para los de vanilla — el `61` estuvo un rato con padre `22` y un
> modelo propio, y lo único que consiguió fue perder la animación y el sonido de la
> silenciada.
>
> La fuente es `AGREGAR_ARMAS.md`, sección "SI EL MODELO ES PROPIO…", que ya lo
> corregía. Este documento era el que quedaba con la versión vieja.

## Cómo se deriva el tipo

Una comparación de datos, no un resolver escrito a mano:

```js
tipoDe("colt45", 15, true)   // -> 61
tipoDe("colt45", 15, false)  // -> 62
tipoDe("colt45", 8,  true)   // -> 60
tipoDe("colt45", 8,  false)  // -> 63
```

`tipoDe()` devuelve **`null`** si la combinación no tiene variante, y el que llama
**loguea y no cambia el tipo**. Esa es la parte importante del contrato: un `null` se
puede distinguir de "la variante es el 62", y un tipo inventado sería un arma que el
motor no tiene.

Agregar una configuración es agregar **una fila** a `variantes`, no tocar una función.

## El estado

Tres registros, y **el `weaponType` no está en ninguno**:

| qué | dónde | quién lo escribe |
|---|---|---|
| qué arma está en cada slot | `GameState.Weapons.equipped[slot]` | `equipar` / `desequipar` |
| qué cargador está en cada arma | `GameState.Weapons.enArma[slot]` | `recargar` |
| qué cargador está en las ranuras | `GameState.Weapons.cargadores[]` | `equiparCargador` |

Y un **campo** del primero, que va en la tabla aparte porque no es un registro:

| qué | dónde | quién lo escribe |
|---|---|---|
| si el silenciador está montado | `equipped[slot].silenciador` | `montarSilenciador` / `quitarSilenciador` |

La fila del silenciador estaba en la tabla de los tres registros, y por eso la cuenta
no cerraba: son cuatro filas y tres registros. `modules\weapons\state.js` lo dice bien
—"lo único que el módulo persiste, y son TRES registros"— y esta tabla era la que no.

> **Corregido el 04/10/2026.** También los nombres: las funciones reales son
> `montarSilenciador` y `quitarSilenciador`, no `montar` y `quitar`.

El `weaponType` **no se guarda** por una razón concreta: es la representación que
ejecuta el motor y sale de los accesorios. Un save que guarda el número queda con un
arma distinta en cuanto la tabla cambie — y la tabla cambió el 03/10/2026, cuando la
silenciada pasó de `347` a `15066`.

**El silenciador vive en la fila del arma**, no en un registro aparte, porque el arma
se va del inventario a la mano y vuelve: un mapa por slot no puede seguirla en el
viaje. El campo viaja en los dos sentidos (`ITEMS_STORE_WEAPON` lo copia de vuelta,
`_sacarUno` lo copia hacia el registro).

## Qué hace que el arma cambie de variante

**Un `give`. Nada más.**

`GIVE_WEAPON_TO_CHAR` da el arma, la pone en el slot del arma y **reemplaza lo que
 hubiera en ese slot**. Las cuatro variantes son slot 2, así que dar la 62 con la 63
en la mano deja la 62 y se lleva la 63. No hay `remove` del tipo viejo, ni rollback,
ni transacción.

El único guard es el **mismo tipo**: un `give` del mismo tipo no reemplaza, **suma**.
Con un arma de 8 y un `give` de 8 el total pasaba a 16. Y la comparación es contra el
tipo **real del ped**, no contra el que el mod cree: si el mod está desfasado,
comparar contra lo que cree dejaría pasar el `give` y el bug seguiría.

| acción | qué cambia |
|---|---|
| **Llenar cargador** en la fila del cargador | se le pasa balas de la caja. La fuente es la **bala suelta**, no otro cargador |
| **R** con un cargador equipado | entra el cargador, y el arma se convierte a la variante de su capacidad |
| **R** sin cargador equipado, con uno puesto | sale el cargador, y el arma vuelve a la variante base |
| montar / quitar el silenciador | el arma se convierte a / desde la variante silenciada |

### La caja de balas

El cargador lleno es lo que hace que disparar tenga sentido, y lo que lo llena es la
**bala suelta**: la única entrada de munición al sistema.

- Item `bala_45`, **apilado de a 50 por fila**. 100 balas son dos filas.
- El botón **Llenar cargador** solo aparece si el cargador tiene hueco **y** hay
  balas de su familia. Con el rellenado viejo el botón estaba siempre y llevaba a un
  aviso, porque no había balas: la fuente era otro cargador.
- El gasto es **un solo evento**, `items:takeAmmo`, que descuenta de la fila más
  llena y borra la que llega a cero. La versión anterior hacía tres escrituras —leer
  la fuente, escribir el destino, escribir la fuente— sin punto de vuelta, y un
  juego cerrando en el medio perdía balas.

En la mochila, balas y cargadores están en la **misma banda, "Municion"**. Ver
[`gsis_RECARGA.md`](./gsis_RECARGA.md) para el ciclo completo.

## La reconciliación

El save del juego y el save del mod son **dos guardados distintos**. El del juego
tiene `m_aWeapons[]` con los tipos; el del modulo tiene `equipped` y `enArma`. Nada
los cruza: cargar el slot 1 del juego con el slot 3 del mod deja un ped con un arma y
un módulo que cree que hay otra.

`reconciliar()` corre en el `init` y **gana el estado del módulo**: deriva el tipo de
los accesorios guardados y, si el ped tiene otro, lo da. Con el tipo *declarado* eso
se resolvía solo — las dos copias eran el mismo número —; con el tipo *derivado* el
desajuste es de tipo, y no se arregla solo.

Un tipo en el slot que **no es del mod** no se toca: puede ser una pistola de vanilla
que el jugador agarró de una misión.

## La animación y el watchdog

> **AGREGADO el 04/10/2026.** Esta sección no estaba en ningún documento de armas, y
> es la que sostiene la recarga: sin el watchdog, el arma nunca termina de recargar.

El motor **no puede** recargar en este mod, y no es una limitación del mod: es la
consecuencia de la regla de "sin reserva". La recarga del juego mueve la **reserva**
del total al clip (`CWeapon::Fire`, `0x73FA20`: dispara, y si el cargador quedó vacío y
hay reserva, se recarga). Como el invariante de `ammo.js` obliga a `total == clip`, la
reserva es **cero**, y la recarga del motor no tiene nada que mover.

Por eso el módulo es dueño de la recarga y no solo de las balas. Son **tres
escrituras** al motor y un pendiente:

```
m_nTimeForNextShot = ahora + GetWeaponReloadTime(del animgroup)
m_nState           = RECARGANDO          (2)
clip = total = 0
```

- **Las balas NO se escriben antes de tiempo.** Si se escribieran, el arma se vería
  llena durante la animación. Se deposits cuando vence el plazo.
- **El plazo es lo único que el motor sí cumple.** El watchdog corre por frame desde
  `updateWeapons()` y, cuando `timerNow() >= hasta`, escribe `clip`, `total` y `READY`.
- **No se espera a que el motor termine**, porque no las pone: cuando el motor cierra la
  recarga mueve el total al clip, y el total está en cero. "Esperar al motor" es
  "esperar a que el arma quede vacía".
- **Si el estado dejó de ser `RELOADING` antes del plazo, el pendiente se descarta** en
  vez de escribir: escribirle encima a un arma que el jugador ya volvió a usar es peor
  que dejar el cargador consumido.

El **sonido** no lo pide el script: el módulo solo pone `RELOCOADING`, y el `.asi` ve
el estado y llama al juego por el lado del padre. Medido el 04/10/2026: `StubSndReload`
aparece en 301 de 779 trazas de audio en `gsis_limiter.txt`.

## Lo que la UI muestra, y por qué

La fila de un arma equipada muestra la configuración que tiene el **ped**, no la que
el módulo derivaría:

```
Colt .45              (Colt .45 Silenced C15)   (desfasada)
```

- **La configuración sale del módulo** y no se compone en la página, para que el
  nombre salga de la misma tabla que eligió el tipo.
- **`(desfasada)`** aparece cuando `tipoEsperado` y `tipo` no coinciden. Es la
  única forma de que el jugador vea el problema en vez de investigarlo.
- Un arma **en la mochila** muestra `(sil.)`, y no el nombre de la variante: en la
  mochila está siempre desnuda, así que su nombre depende de si tiene cargador, y no
  tiene ninguno.

**El HUD del juego no puede mentir**, porque no tiene datos propios: la mira y el
sonido pasan por `Resolver` en el `.asi`, el modelo lo pide `PedirModelosVanilla()`, y
las balas las escribe el módulo por memoria. Todo eso viene del ped.

## Qué NO tiene el sistema

Para que nadie lo busque:

- **La armería no vende.** `getDealerPrice()` devuelve 0 sin `ch.dealer.prices`, así
  que el catálogo se dibuja vacío y `addToCart()` rechaza con `DLR_IVL`. Hoy las armas
  se consiguen por el guardado de partida o por la tecla de debug.
- **La munición tampoco entra por el vendedor.** Las balas están en el catálogo y se
  debuguean con **G** (`_darArmaDePrueba`), pero el camino de un pickup todavía no
  está escrito. El evento `items:storeAmmo` existe y es el que usaría.
- **No hay accesorios con estado.** Un cargador no tiene salud ni calidad; un
  silenciador no tiene munición.
- **No hay reserve.** `clip` es siempre igual a `total`, y eso lo impone el guard de
  `modules/weapons/ammo.js` cada frame.
- **No hay más de una familia.** El código está preparado para varias (`FAMILIAS` es
  un mapa), pero la UI para montar el silenciador elige la primera arma equipada sin
  silenciador, y con dos familias eso hay que cambiarlo.

## Cuando algo no funciona

| síntoma | dónde mirar |
|---|---|
| el arma no aparece en la mochila | la entrada en `ITEMS` existe y es `type: "weapon"` |
| el arma no cambia de variante | `tipoDe()` devolvió `null`; el log dice qué combinación falta |
| el arma se ve **invisible** | modelo no cargado: `gsis_limiter.txt`, buscar `[NN] modelo` |
| el arma no recarga | `Engine.reloadSpec(tipo)` devolvió null: el `.asi` dice `[NN] no tiene anim` |
| el cargador no entra en el arma | no está en una ranura (`inv:equipMag`) o no le sirve a esa familia |
| **el botón Llenar no aparece** | `puedeRellenar` en false: el cargador está lleno, o no hay balas de su familia |
| **Llenar no hace nada y avisa** | `WPN_SIN_MUNICION`; el log dice `llenarDesdeCaja: no hay balas para ...` |
| **las balas están en una sola fila de 100** | le falta `maxStack` a la entrada en `ITEMS` |
| **una fila de balas ofrece "Equipar cargador"** | la fila no tiene `esCargador`: el filtro es `defDeCargador`, no la banda |
| la recarga cambia el arma pero no el HUD | el `ammo.js` está saltando el slot: está `RELOADING` |
| dos cargadores iguales en la mochila | uno tiene 0 balas y el otro no; el que tiene 0 no se monta |

El orden para leer `gsis_limiter.txt`:

```
dado de alta: tipo 61, padre 23, modelId 15066, slot 2, clip 15, damage -1
[61] FUENTE skill 1 <- fila vanilla 23 (STD) ... animGroup 18 | damage 40
[61] clonado de 23 | modelId pedido 15066 / de la tabla 15066 | clip 15
[61] modelo 15066 LISTO: se entrega el tipo. Carga verificada.
FIRE: crudo 61 -> padre 23
```

`clonado de 23` es lo que prueba que el padre se resolvió; `modelo ... LISTO` que el
modelo se ve; `crudo 61 -> padre 23` que el sonido sale por la silenciada y no por
una pistola normal.

## Lo que sedruió el 03/10/2026 y sigue dividida

| doc | qué es |
|---|---|
| [`AGREGAR_ARMAS.md`](./AGREGAR_ARMAS.md) | guía práctica para agregar |
| [`gsis_RECARGA.md`](./gsis_RECARGA.md) | la recarga y su sonido |
| [`gsis_VARIANTES.md`](./gsis_VARIANTES.md) | análisis de por qué el tipo no se guarda |
| [`GSIS_WEAPONS_DESIGN.md`](./GSIS_WEAPONS_DESIGN.md) | diseño del sistema anterior |
| [`gsis_WEAPONS_VERIFICADO.md`](./gsis_WEAPONS_VERIFICADO.md) | mediciones del sistema anterior |
