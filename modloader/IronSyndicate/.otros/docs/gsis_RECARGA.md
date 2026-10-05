# GSIS: la recarga de las armas del mod

> Como funciona la recarga, por que cambia la variante del arma, de donde sale su
> sonido, y que mirar cuando algo no funciona.
>
> **Actualizado el 03/10/2026** con el sistema de familias: la recarga **cambia el
> arma**, y eso no estaba antes.
>
> **Actualizado el 04/10/2026** con las **balas sueltas**: el cargador ya no se
> llena de otro cargador, se llena de la caja. Ver "De donde salen las balas".

Para que hace el sistema entero: [`gsis_WEAPONS.md`](./gsis_WEAPONS.md).
Para el detalle de la investigacion —como seayo que el sonido de recarga vive en el
motor y no en el mod— esta en el proyecto del `.asi`:
`C:\Dev\gsis-armory\_docs\gsis_SONIDO_RECARGA.md`

## Recargar

Se recarga con **R**, y el cargador tiene que estar **equipado**, no en la mochila.
Hay dos ranuras de cargador (`WEAPONS.CARGADORES_EQUIPADOS = 2`) y se llena con
**Equipar cargador** en la fila del cargador de la mochila.

La recarga tiene dos caminos, y cual de los dos es lo decide el jugador:

| camino | qué pasa |
|---|---|
| **cambio** | hay un cargador equipado con balas: entra ese, y el que estaba puesto sale con lo que le quedaba |
| **descarga** | no hay ninguno equipado, pero hay uno puesto: ese sale y el arma queda desnuda |

Los dos tienen la **misma animación** —es la animación del motor, y la descarga es
la misma con cero balas—, y los dos suenan.

## De donde salen las balas

Esta es la parte que cambió el 04/10/2026, y es la que hace que el sistema cierre.

**Antes**, un cargador vacío se llenaba con las balas de **otro cargador del mismo
tipo**: un trasvase. Con dos cargadores de 8 y una caja de munición en el juego, la
suma de balas del mundo nunca crecía —se movía de una pieza a otra— y un jugador que
había tirado el último cargador se quedaba sin munición y sin forma de conseguirla.

**Ahora** la fuente es la **bala suelta**:

```
Caja de balas  .45   (una fila = hasta 50 balas)
      |
      |  Llenar cargador   — la accion de la fila
      v
Cargador Colt 45   0/8  ->  8/8
      |
      |  R con el cargador EQUIPADO
      v
Arma  8/8   (o 15/15, si el cargador era el de 15)
```

La caja es la **única entrada** de munición al sistema. Todo lo demás mueve balas de
un sitio a otro.

### Llenar

Se llena desde la fila del cargador, en la mochila o en una ranura, con **Llenar
cargador**. El botón **solo aparece si hay hueco y hay balas** de esa familia: con el
rellenado viejo el botón estaba siempre disponible y llevaba a un aviso de "no tenes
otro cargador con balas" cada vez que lo apretabas, que era el caso normal.

El gasto lo hace un solo evento, `items:takeAmmo`, que descuenta **de la fila más
llena** y **borra la fila que llega a cero**. Descontar de la más llena es la misma
regla que usaba el rellenado viejo: con filas de 12, 50 y 3, llenar un cargador de 8
de la de 50 deja 42, 50 y 3 en vez de abrir una fila nueva de 8.

### Las cajas

| | |
|---|---|
| item | `bala_45` — "Balas .45" |
| peso | 0.005 kg cada una, o sea **0.25 kg la caja de 50** |
| tope | **50 por fila**. 100 balas son dos filas de 50 y 50, no una de 100 |
| nombre | **"Balas .45"**, en plural: la fila muestra la cantidad al lado, y un nombre singular con un 37 al lado dice una cosa que la fila no muestra |
| icón | `bullet45.png`, propio y distinto del de los cargadores |

La fila **completa primero y después abre otra**: agregar 30 balas a un stock de 37
da 50 y 17, no una fila de 67. Al revés se desperdiciaría el hueco para siempre.

El tope es **opt-in** por item (`maxStack` en el catálogo). La chatarra no lo declara
y se sigue apilando en una sola fila: es el comportamiento de siempre, y ponerle un
tope general habría roto el árbol entero para acomodar un caso.

### La banda "Municion"

Las balas están en la **misma banda que los cargadores**, que se renombró de
"Cargadores" a **"Municion"**. En el catálogo el item declara `type: "magazine"` —
la banda y el tipo del catálogo no son la misma cosa— y `instanced: false`, que es lo
que hace que se apile. Ver `isInstanced()` en `data\gsis_item_data.js`, que tiene un
opt-out justamente por esto.

Consecuencia en la UI: la acción de una fila la decide `esCargador`, y **no** la
banda. Una fila de balas con una sola unidad —la última de una caja— si se filtrara
por banda recibiría el botón "Equipar cargador", que el módulo rechazaría con un log
y sin nada en pantalla.

## LA RECARGA CAMBIA EL ARMA

Esta es la parte que **no existía antes del 03/10/2026**.

El cargador que entra define la **capacidad**, y la capacidad con el silenciador
define la **variante**. O sea que la `R` no solo mete balas: **convierte el arma**.

```
Colt .45 desnuda                       tipo 63   8 balas
  + cargador de 8                      tipo 63   8/8      (misma variante)
  + cargador de 15                     tipo 62  15/15     Colt .45 C15
  + cargador de 15 y silenciador        tipo 61  15/15     Colt .45 Silenced C15
```

Y al revés: **sacar el cargador con la `R`** deja el arma desnuda, y desnuda es la
capacidad base de la familia. Un `61` con cargador de 15 vuelve a ser el **`60`**, no
el `63`: la descarga conserva el silenciador, porque el silenciador está **montado** en
el arma y el cargador es lo único que sale.

> **CORREGIDO el 04/10/2026.** Este documento decía "un `61` con cargador de 15 vuelve
> a ser el `63`". Es imposible: el `63` es la variante **pelada**, y una arma con el
> silenciador puesto no puede caer en la pelada. El código lo hace bien —
> `tipoDe(familia, clipPelado, silenciadorEnArma(slot))`, con el flag todavía en
> `true` — y el error estaba solo en el ejemplo. Para ver el `63` hay que quitar el
> silenciador, no descargar.

### Por qué NO se pierden balas anymore

La versión anterior de este documento decía:

> Un cargador de 15 en un arma de 8 deja 8 y **las 7 de más se pierden**.

Eso era verdad cuando cada configuración era un item distinto: el cargador de 15
solo le servía a la `C15`, así que en una `Colt .45` no entraba. **Hoy no hay
"un cargador de 15 en un arma de 8"**: el arma se convierte en un arma de 15 y entra
entero.

Lo que **sí** se pierde es lo que no entra en el cargador de destino: si ponés un
cargador con 3 balas en uno de 15, entran 3 y quedan 12 en el cargador, que se
descarta. Eso está escrito en el header de `modules\weapons\gsis_Weapons.js`.

### Qué se ve y cuándo

El cambio de variante es un **`give`**, y el motor reemplaza el slot solo. No hay
animación propia del cambio: se ve el modelo, el sonido y la capacidad nuevos, con la
animación de recarga de la variante nueva.

La fila del inventario cambia de nombre al mismo tiempo:

```
Colt .45              (Colt .45 Silenced C15)
```

Si la fila dice `(desfasada)`, el estado del módulo y el motor no coinciden: el log
tiene el detalle.

## De donde sale el sonido

**Del motor del juego, no del mod.** El sonido es el de la pistola de vanilla, porque
la Colt .45 del mod es una pistola: el `.asi` (`gsisWeaponLimiter.asi`) le pide al
motor el sonido de recarga de la familia del arma.

Eso quiere decir dos cosas practicas:

1. **El sonido depende del `.asi`, no del script.** Si el `.asi` no esta o esta
   desactualizado, las armas recargan igual pero mudas.
2. **Cada familia suena su propia recarga** cuando existan mas armas: el AK suena la
   del AK, la escopeta la de la escopeta. No hay nada que configurar por arma.

Y con el sistema de familias hay una consecuencia que conviene tener presente: **el
sonido cambia con la variante**, porque lo decide el padre. La silenciada (padre 23)
suena distinta de la pelada (padre 22). En el log:

```
FIRE: crudo 61 -> padre 23
```

Esa linea dice que el disparo de la 61 se resolvió por la silenciada de vanilla y
no por una pistola normal. Si saliera `padre 22`, el arma suena mal aunque se vea
bien.

Y una limitacion del juego, no del mod: **el juego tiene un solo sonido de recarga
para pistolas.** El "recargar un arma vacia" y el "recargar un arma con una bala en el
tubo" suenan igual. En el AK y en la escopeta el juego si tiene los dos, asi que con
esas se podria elegir el que corresponde.

## Que archivos tocan esto

| archivo | que hace |
|---|---|
| `C:\Program Files\GTA SA\gsisWeaponLimiter.asi` | el que pide el sonido al motor. Es el **unico** lugar donde el sonido de recarga se decide |
| `modloader\IronSyndicate\gsis_weapons.dat` | los tipos de arma: `<tipo> <padre> <modelId> <slot> <cargador> <damage>`. El **padre** es el que decide qué sonido va a sonar |
| `modloader\IronSyndicate\sounds\dryfire.wav` | el martillo seco del disparo con el arma vacia. Este si es un archivo del mod |
| `modloader\IronSyndicate\sounds\weapons\*.wav` | **no se usan.** Quedaron de una version que no sirvio |

> **El `.asi` va en la RAÍZ del juego**, no en `modloader\IronSyndicate\`. ModLoader
> carga `C:\Program Files\GTA SA\gsisWeaponLimiter.asi`. La copia que hay en
> `modloader\IronSyndicate\` es un resto viejo y no se usa: modificarla no cambia
> nada.

## El martillo seco (este si es nuestro)

Cuando se aprieta el disparo con el arma sin una sola bala, el boton de disparo se
desactiva y suena un clic. Ese sonido **no existe en el juego**: es un archivo del
mod (`sounds\dryfire.wav`), cargado al arrancar con el opcode `0x0AAC`.

Por que es un archivo y el de recarga no: el martillo es un invento del mod, asi que
no hay de donde sacarlo del juego.

## Si no recarga, que mirar

Por este orden, porque cada paso descarta una causa entera.

**1. Que la recarga haya pasado.** `cleo_redux.log`:

```
[Weapons] recargar: CAMBIO | mag_colt45_c15 de la ranura 1 -> tipo 62 | 15/15 | no habia ninguno puesto | Colt .45 -> Colt .45 C15 (tipo 62)
```

Esa linea dice **qué cargador entró, a qué tipo convirtió el arma y qué cargador
salió**. Si no está, el problema es de cargador, no de sonido.

Los motivos por los que no aparece, todos en el mismo log:

| línea | qué pasó |
|---|---|
| `no tiene cargador en el catalogo` | la familia no tiene ningún cargador declarado |
| `no hay ... equipado (N cargadores equipados)` | el cargador está en la mochila, no en una ranura |
| `no tiene anim de recarga` | `Engine.reloadSpec(tipo)` dio null: el `.asi` no tiene animación para ese tipo |
| `no tiene variante para (15, sil.)` | falta la variante en `FAMILIAS`, o falta el cargador / el silenciador |
| `el motor no acepto el tipo N` | la fila del `.dat` no está, o el `.asi` no la registró. **El cargador no se gasta** |
| `WPN_CARGADORES_LLENOS` | las dos ranuras están ocupadas |

### Si no recarga por falta de balas

Un caso distinto, con su propia línea:

```
[Weapons] llenarDesdeCaja: no hay balas para mag_colt45 (familia colt45)
```

O sale junto a un aviso, `WPN_SIN_MUNICION` ("No tenes balas"). Es el único estado
en el que **el botón estaba visible y no se podía usar**, y es raro a propósito: el
botón solo aparece con balas, así que tiene que ser el caso de que se apaguen entre
el snapshot y el click.

Las otras dos líneas del mismo paso:

| línea | qué pasó |
|---|---|
| `llenarDesdeCaja: mag_colt45 ya esta lleno (8/8)` | no había hueco. `WPN_LLENO` |
| `llenarDesdeCaja: en la mochila no hay un cargador en el indice N` | la fila cambió entre el snapshot y el click |

Y si el botón **no aparece**, el problema es de datos, no de lógica: la fila del
cargador tiene `puedeRellenar` en false, y eso pasa si el cargador está lleno **o** si
`balasDeFamilia` no encuentra balas para su familia. Un cargador de otra familia en
esa ranura también lo apaga, con `no es un cargador con familias` en el log.

**2. Que la variante exista.** Si el log dice `no tiene variante para (15, sil.)`,
el problema no es del `.dat`: es que **falta la fila en `variantes`**, o falta el
cargador de 15, o falta el silenciador. La combinación tiene que ser alcanzable.

`node .IronSyndicate\tools\check-dat.mjs` avisa exactamente de eso.

**3. El log del `.asi`.** `C:\Program Files\GTA SA\gsis_limiter.txt`, la linea
`RASTRO AUDIO`:

```
RASTRO AUDIO: ... | RECARGA PEDIDA entradas=N (ultimo crudo=63 padre=22)
```

- `entradas` **no sube** con las recargas: el `.asi` no esta viendo el estado del
  arma. Es un problema de sincronia, no de sonido.
- `crudo` tiene que ser el **tipo resuelto**. Para una variante silenciada va a ser
  `23`, y para una pelada `22`. Cualquier otro numero, los argumentos de la llamada
  van al reves.

**4. Que el `.asi` desplegado sea el del proyecto.** El que se compila es
`C:\Dev\gsis-armory-build\gsisWeaponLimiter.asi`, y el que corre es
`C:\Program Files\GTA SA\gsisWeaponLimiter.asi`. Comparar fecha y tamaño.

**5. El audio del juego.** Si el log dice que la llamada se hizo y no se oye nada,
el problema es del audio: en `CLEO\.cleo_config.ini`, `AudioDevice` tiene que estar en
`-1`. Un valor distinto manda el audio a un dispositivo que puede no existir.

## Resumen para el que solo quiere usar esto

- **R** recarga con un cargador **equipado** (hay dos ranuras), y la pieza se gasta.
- **R también cambia el arma**: la capacidad del cargador que entra decide la
  variante, y sacar el cargador vuelve a la variante base.
- Con un cargador de 15 en la Colt **no se pierde ninguna bala**: el arma se
  convierte en la de 15.
- **Los cargadores se llenan de balas sueltas**, no de otro cargador. La caja es la
  única entrada de munición al sistema.
- El botón **Llenar cargador** solo aparece si el cargador tiene hueco **y** tenés
  balas de esa familia.
- Una caja son **hasta 50 balas por fila**. 100 balas son dos filas.
- El sonido lo pone el `.asi` pidiéndoselo al motor, y **cambia con la variante**
  porque lo decide el padre.
- Con la Colt hay un solo sonido de recarga: no se puede elegir entre "vacía" y
  "una en el tubo".
- Si no recarga: primero `cleo_redux.log`, y después el log del `.asi`.
- Con **G** tenés el arma, los dos cargadores **vacíos** y 100 balas, para probar el
  ciclo entero sin disparar.
