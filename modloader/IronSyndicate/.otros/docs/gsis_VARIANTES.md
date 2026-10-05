# Familias, accesorios y variantes

> # EL SISTEMA VOLVIÓ — el 03/10/2026, y no es el mismo
>
> La primera vez que se escribió, este documento describía un sistema de **familias
> + accesorios + variantes** con `resolveWeaponType()` y las tablas
> `WEAPON_FAMILIES` / `WEAPON_ATTACHMENTS` / `WEAPON_VARIANTS`. Ese se borró entero
> y fue reemplazado por "cada configuración es su propio item". **Ese también se fue,
> el mismo día.**
>
> **Hoy hay una familia por item**, y es lo que describe este documento: los
> accesorios sueltos volvieron (`suppressor`, `mag_colt45_c15`), y el tipo se deriva
> de ellos.
>
> **Lo que cambió en los nombres, y es lo único:**
>
> | entonces | hoy |
> |---|---|
> | `WEAPON_FAMILIES` | `FAMILIAS` en `data/gsis_weapons.js` |
> | `WEAPON_VARIANTS`, tabla aparte | `variantes`, un array dentro de la familia |
> | `resolveWeaponType(familia, attachments)` | `tipoDe(familia, clip, silenciador)` |
> | `attachments: [...]` en la fila del save | dos datos: el cargador puesto y un booleano |
> | `WEAPON_ATTACHMENTS` | `CARGADORES` + `SILENCIADORES` |
>
> **Lo que NO volvió** es la parte que-ataba el sistema viejo con la mochila, y es
> justamente lo que lo mataba: la lista de accesorios por instancia. Ver
> "POR QUE NO SE VOLVIERON LOS ACCESORIOS POR INSTANCIA" más abajo.
>
> Para lo que hay hoy:
>
> - **Cómo funciona:** [`gsis_WEAPONS.md`](./gsis_WEAPONS.md)
> - **Cómo se agrega:** [`AGREGAR_ARMAS.md`](./AGREGAR_ARMAS.md)
> - **El `.asi`, el `.dat` y el modelo:** `C:\Dev\gsis-armory\_docs\gsis_TECNICA.md`
>
> **Lo que queda abajo es el análisis de la época y sigue siendo válido como
> análisis**: por qué el tipo no se guarda, por qué la capacidad tiene que salir del
> motor, y por qué un `weaponId` derivado en el save es una bomba. Los
> `archivo:línea`, los nombres de tabla y los nombres de item **no aplican**.
>
> **Corregido el 04/10/2026, y estos tres son los que más confondían:**
>
> | en este documento | el valor real | de dónde sale |
> |---|---|---|
> | `mag_colt45_extended` (en 9 lugares) | **`mag_colt45_c15`** | `data/gsis_weapons.js:158` |
> | `suppressor` a `price: 1200` | **`precio: 400`** | `data/gsis_weapons.js:177` |
> | `price: 220` para el cargador de 15 | **`precio: 250`** | `data/gsis_weapons.js:162` |
> | `mag_colt45` a `price: 220` | **`precio: 220`** — este sí coincide | `data/gsis_weapons.js:155` |
>
> Y las **capacidades** de los cargadores sí están bien: el de 8 es `clipSize: 8` y el
> de 15 es `clipSize: 15`. Los ids son los que están viejos.

---

## POR QUÉ NO SE VOLVIERON LOS ACCESORIOS POR INSTANCIA

Este es el punto que **no** se debe repetir, y la razón por la que el sistema se
rompió dos veces.

La versión vieja guardaba en la fila del inventario una **lista** de accesorios
montados:

```js
{ weaponType: 61, family: "colt45", attachments: ["mag_colt45_extended","suppressor"], ... }
```

Suena más simple que lo de hoy, y es la razón de que no funcionara. Un cargador con
esa lista **sabía** qué accesorio era y por lo tanto qué capacidad traía, sin
mirar al motor.

La versión de "un item por configuración" no tenía accesorios, y el cargador
funcionaba porque cada cargador tenía un `clipSize` propio y un `arma` a la que
servía. La de hoy vuelve a ser así, y esa es la parte que se conserva: **el cargador
declara su capacidad, y el silenciador es un booleano en la fila del arma.**

| | lista `attachments` | lo de hoy |
|---|---|---|
| qué guardaba la fila | una lista que hay que mantener sincronizada | dos datos: cargador puesto + flag |
| la capacidad del cargador | se derivaba de la lista | `CARGADORES[].clipSize`, un dato del item |
| qué pasa si la fila y el registro discrepan | dos verdades, y el `weaponType` guardado manda | el save **no guarda** el tipo: se deriva |
| cuántas copias del número hay | dos: la lista y el `weaponType` | dos: el `clipSize` y la fila del `.dat`, y un check las cruza |

O sea: **la lista no se perdió porque fuera mala idea de diseño, sino porque
convivía con un `weaponType` guardado.** Con el tipo guardado, la fila que dice
"sin cargador" y el registro que dice "tipo 62 de 15 balas" son dos verdades, y
gana la que se lea. Hoy el save guarda **los accesorios** y el tipo se deriva, así
que no hay nada que pueda quedar viejo.

---

Cómo se representa un arma en el mod hoy.

Para el `.asi` ver `gsis_WEAPONS.md` y `C:\Dev\gsis-armory\_docs\gsis_TECNICA.md`.
Para agregar una variante ver `AGREGAR_ARMAS.md`.

---

## 1. El problema que resolvió esto

`WEAPON_DATA` ataba dos cosas en una fila: **el item de inventario** y **el
weaponId del motor**. Una fila = un item = un tipo.

Eso obliga a que estas tres cosas sean tres items distintos:

```
Pistola 9mm
Pistola 9mm silenciada
Pistola 9mm de 30 balas
```

Son **el mismo armamento** con distinta configuración encima. El jugador las ve
como tres armas distintas porque el sistema no tenía forma de decir otra cosa.

## 2. El modelo

Tres tablas, en `data/gsis_weapon_variants.js`, más el `WeaponInstance` que las
une:

```
FAMILIA     la identidad. Un item de inventario.     WEAPON_FAMILIES
ACCESORIO   una pieza compatible. Va suelto.        WEAPON_ATTACHMENTS
VARIANTE    la combinación resuelta a un tipo.      WEAPON_VARIANTS

INSTANCE    { id, family, attachments }            estado, va en el save
```

El `weaponType` de GTA deja de ser la identidad y pasa a ser **la representación
que el motor necesita para ejecutar esa configuración**. Por eso hay cuatro
weaponTypes de `colt45` y un solo item.

### La familia

```js
{
    family: "colt45",
    itemId: "colt45",     // UN item, por familia
    parent: -1,            // variante base = tipo 22 de vanilla, no necesita .asi
    baseVariant: 22,
    modelId: 346,
    slot: 2,               // mismo para TODAS las variantes de la familia
    baseClip: 8,
    price: 550
}
```

`slot` es el mismo en todas las variantes a propósito: el motor tiene **una**
`CWeapon` por slot (`CPed.m_aWeapons[13]`) y un accesorio no mueve el arma de
compartment, cambia cómo se ejecuta.

### El accesorio

```js
{ id: "suppressor",           type: "weapon_attachment", compatibleFamilies: ["colt45"], clipSize: null, price: 1200 }
{ id: "mag_colt45_extended",  type: "magazine",          compatibleFamilies: ["colt45"], clipSize: 15,  price: 220  }
```

Un cargador es un accesorio con `clipSize`. Un silenciador es un accesorio sin
`clipSize`. El sistema no los distingue: los dos se montan igual. La única
diferencia es si el accesorio trae capacidad.

**La capacidad vive en el cargador, no en el arma.** Es lo que permite que 8 y 15
coexistan sin el número duplicado en dos lugares que pueden divergir.

### La variante

```js
{ weaponType: 22, family: "colt45", attachments: [],                                     parent: null, clipSize: 8,  modelId: 346 }
{ weaponType: 60, family: "colt45", attachments: ["mag_colt45_extended"],                parent: 22,   clipSize: 15, modelId: 346 }
{ weaponType: 23, family: "colt45", attachments: ["suppressor"],                         parent: null, clipSize: 8,  modelId: 347 }
{ weaponType: 61, family: "colt45", attachments: ["mag_colt45_extended","suppressor"],   parent: 23,   clipSize: 15, modelId: 347 }
```

`attachments` va **ordenado por id**, siempre. No es solo decoración: la clave de
la variante se construye con esos ids, y dos filas con el mismo conjunto en
distinto orden serían dos variantes distintas donde la segunda nunca se resuelve.

`parent` es lo que distingue una variante de plugin: solo lo tienen las que el
`.asi` tuvo que clonar.

## 3. Las 4 configuraciones de la Colt .45

> **⚠ LA TABLA DE ABAJO ESTÁ DESFASADA. La que vale es la del `.dat`.**
>
> **Corregido el 04/10/2026.** Esta tabla asigna el **60** al "+cargador 15" y da el
> **23 de vanilla** al silenciador. **Hoy es al reves**: el 60 es el silenciado —un tipo
> propio que CLONA del 23 sin pisarlo— y el **62** es el "+cargador 15". La tabla real:
>
> | configuración | weaponType | modelo | capacidad | padre | ¿`.asi`? |
> |---|---|---|---|---|---|
> | `colt45` pelada | **63** | 346 | 8 | 22 | **sí** |
> | `colt45` + cargador 15 | **62** | 15065 | 15 | 22 | **sí** |
> | `colt45` + silenciador | **60** | 347 | 8 | 23 | **sí** |
> | `colt45` + silenciador + cargador 15 | **61** | 15066 | 15 | 23 | **sí** |
>
> Las cuatro son tipo propio. Y son **cuatro**, no dos.
>
> Por qué cambió, que es la parte que este documento se equivocó:
>
> - El **22 de vanilla trae 17 balas**, no 8. Sin un tipo propio el mod no puede
>   bajarle el cargador, así que la Colt necesita su 63.
> - El **23 de vanilla ES UN TIPO VIVO**. Registrarlo en el `.dat` haría que
>   `HookGetWeaponInfo(23)` devolviera filas propias para la silenciada de todo el
>   juego, y se vería como los NPC disparando con sonido de pistola normal. Por eso
>   el silenciado de GSIS es un tipo **nuevo** que clona del 23.
>
> La observación de abajo —"un accesorio que no cambia la silueta ni el sonido no
> cuesta ningún `weaponType`"— **sigue siendo el análisis correcto**, y es la razón por
> la que el silenciador no debería haber costado un tipo. Pero costó uno igual, por el
> motivo del punto 2, que es de **colisión con un tipo vivo** y no de diseño.

Lo que sigue es el análisis de la época.

| configuración | weaponType | modelo | capacidad | padre | ¿`.asi`? |
|---|---|---|---|---|---|
| `colt45` | 22 | 346 | 8 | — | no |
| `colt45` + silenciador | 23 | 347 | 8 | — | no |
| `colt45` + cargador 15 | **60** | 346 | 15 | 22 | **sí** |
| `colt45` + silenciador + cargador 15 | **61** | 347 | 15 | 23 | **sí** |

**Solo dos de las cuatro necesitan tipo plugin**, y esa es la observación que
define el costo del sistema:

- El **silenciador no necesita tipo propio**. GTA ya tiene el 23, con su
  animación, su sonido y su modelo 347. Montar el silenciador es usar el 23.
- La **variante de capacidad sí lo necesita**, porque el motor no tiene una
  "Colt .45 con cargador de 15".

Un accesorio que no cambia la silueta ni el sonido **no cuesta ningún
weaponType**. Uno que cambia el modelo, cuesta uno.

Dos tipos plugin de los 20 disponibles en el rango 60-79.

## 4. El resolver

```js
resolveWeaponType("colt45", [])                              -> 22
resolveWeaponType("colt45", ["suppressor"])                   -> 23
resolveWeaponType("colt45", ["mag_colt45_extended"])          -> 60
resolveWeaponType("colt45", ["suppressor","mag_colt45_extended"]) -> 61
resolveWeaponType("colt45", ["suppressor","suppressor"])       -> null
resolveWeaponType("colt45", ["ak47_drum"])                    -> null
resolveWeaponType("ak47",  [])                                -> null
```

La clave es `familia + "|" + ids ordenados`. El orden no importa porque el
conjunto de accesoriosmounted no lo tiene: poner y sacar el silenciador da el
mismo resultado que nunca ponerlo.

**Devuelve `null` y no un tipo inventado.** Si se cayera a la variante base, un
accesor mal declarado sería *indistinguible* de un accesorio que no hace nada, y
ese es el bug que más cuesta ver. Con `null`, quien llama avisa con el contexto
que tiene y el fallo queda en el log.

## 5. Montar y sacar

```js
attachAccessory(charId, slot, "suppressor")
detachAccessory(charId, slot, "suppressor")
```

Ambos devuelven `{ ok, weaponType, instance }` o `{ ok: false, motivo }`.

**Lo que NO cambia**: el inventario sigue teniendo una sola `colt45`. Montar o
sacar no crea ni borra un item, y el `id` del arma no cambia.

**Lo que SÍ cambia**: el weaponType que el ped tiene en la mano. Sacar el
silenciador lleva de 23 a 22, y eso es un `REMOVE_WEAPON_FROM_CHAR` +
`GIVE_WEAPON_TO_CHAR`. No hay forma de evitarlo sin reescribir la `CWeapon` del
ped a mano, que es peor.

El orden dentro de `_aplicarConfiguracion` importa y no es arbitrario:

```
1. resolver la configuracion   (puede fallar -> no se toca nada)
2. leer la municion del TIPO VIEJO
3. quitar el tipo viejo, dar el nuevo
4. escribir clip y reserva en la CWeaponInfo nueva
5. recien ahi guardar attachments y variantWeaponType en el registro
```

Si el registro se escribiera antes de confirmar que el motor aceptó el *give*,
un fallo dejaría el save diciendo que el silenciador está montado y el arma sin
silenciador.

## 6. El puente con el código viejo

~30 lugares del mod llaman `getModelIdByWeaponId(type)` o
`getClipSizeByWeaponId(type)` con el tipo que tiene el ped en la mano. Sin
puente, tres de los cuatro casos de `colt45` devolverían `null`.

`getWeaponByWeaponId` devuelve la fila de `WEAPON_DATA` con los campos que
dependen del tipo sobreescritos por los de la variante:

```
tipo  item      modelo  clip  precio
 22   colt45     346     8     550
 60   colt45     346    15     550
 23   colt45     347     8     550
 61   colt45     347    15     550
```

Mismo item, mismo precio, distinto modelo y distinta capacidad. El resto del
mod no necesita enterarse de que existen las variantes.

**Por qué las variantes no están en `_buildRegistry`**: el registro usa "el
primero con ese weaponId gana", y una variante no es una entrada de
`WEAPON_DATA`. Meterlas obligaría a duplicar precio y categoría en cada
variante, que es justo el dato que tiene que ser uno por arma.

## 7. El reconciliador

Antes:

```js
var registered = !!(wd && wd.weaponId === type);
```

Eso era correcto cuando un item era un weaponId, y es **exactamente el bug que
el refactor arregla**: la `colt45` tiene los tipos 22, 60, 23 y 61, y con la
comparación vieja el ped con la variante 23 en la mano se reconocía como "no
registrada" y el reconciliador le borraba el arma del save en el primer frame.

El síntoma (el arma desaparece del inventario al tocar cualquier tecla) es
indistinguible de "se perdió".

Ahora:

```js
var registered = !!wd && _typeBelongsTo(wd, type);   // ¿pertenece a la familia?
```

Un item sin familia —las armas que todavía no se migraron— cae a su `weaponId`,
o sea el comportamiento de siempre. Por eso el refactor es incremental.

## 8. Qué NO se migra

`weaponType` **no se persiste** y el registro guarda `attachments`.

Un save que guarde el número queda con un arma distinta en cuanto cambia
`WEAPON_VARIANTS`, y esa tabla se va a tocar. La configuración no depende de la
numeración.

Para los saves que ya existían, `resolveAttachmentsOf` deduce los accesorios a
partir del `weaponType` guardado, así que una partida vieja con `colt45` y tipo
23 se lee como "colt45 con silenciador". Sin esa capa, cargar un save anterior
dejaría el silenciador montado para siempre y no habría forma de sacarlo.

## 9. Migración de ids

> ## ⚠ ESTA TABLA NO ESTÁ IMPLEMENTADA. LEER ANTES DE USARLA
>
> **Corregido el 04/10/2026.** Todo lo que hay debajo describe migraciones que
> **no existen en `core/gsis_SaveMigration.js`**. Verificado por grep sobre
> `cleo\IronSyndicate`: los ids `9mm`, `mag_9mm_replica`, `mag_9mm_extended`,
> `pistol_assembled`, `silenced_9mm`, `mag_silenced_9mm`, `gsis_pistol`,
> `mag_gsis_pistol`, `mag_colt45_replica`, `mag_mp5_replica`, `mag_ak47_polymer`,
> `mag_ak47_bulgarian` y `mag_m4_polymer` dan **cero coincidencias** fuera de un
> comentario.
>
> Lo que hay de verdad en `ITEM_RENAMES` (`core/gsis_SaveMigration.js:124-130`) son
> **cinco** entradas, y ninguna es de la era `9mm`:
>
> ```js
> "colt45_c15":        "colt45",
> "colt45_silenced":   "colt45",
> "colt45_c15_silenced": "colt45",
> "mag_colt45_silenced": "mag_colt45",
> "mag_colt45_c15_silenced": "mag_colt45_c15"
> ```
>
> Y la tabla `ACCESORIOS_RETIRADOS` que se describe más abajo **tampoco existe**:
> aparece en un comentario (`:467`) y en este documento, y en ningún otro lugar. El
> propio `gsis_SaveMigration.js:472-474` dice que `_migrarAttachments()` "se fue con
> la tabla de armas" y que el recorrido tambien, porque `attachments` solo existia
> como campo de `GameState.Ballistic.equipped[slot]`, y ese registro ya no lo
> escribe nadie.
>
> ### La consecuencia, y es la parte que importa
>
> **Una partida escrita con cualquiera de los dos sistemas borrados conserva ids que
> el catálogo no reconoce.** Y como dice el propio documento más abajo: "un item con un
> id que el catálogo no reconoce es un item que el jugador tiene y no puede usar, y en
> un inventario eso es la peor clase de pérdida porque no se ve".
>
> O sea: el peligro del que este párrafo mismo advierte está **activo**, porque la
> tabla que lo prevendría no se escribió.
>
> ### Y una contradicción dentro del propio código
>
> `gsis_SaveMigration.js:174` y `:207-208` dicen que el cargador de 15 balas de la
> Colt tiene el id **`mag_colt45_15`**. El id real es **`mag_colt45_c15`**
> (`data/gsis_weapons.js:158`), y no hay ningún rename que vaya de uno al otro. O sea
> que el comentario del código describe un id que el catálogo no tiene.
>
> **Lo que hay que hacer si se quiere recuperar una partida vieja:** escribir los
> renombres en `ITEM_RENAMES` y, si hay accesorios en juego, el recorrido de
> `ACCESORIOS_RETIRADOS`. Y hay que hacerlo con el `SAVE_FORMAT_VERSION` que toque,
> porque hoy es **3** (`SAVE_FORMAT_VERSION = 3`, `core/gsis_SaveMigration.js:267`).

Lo que sigue es el **análisis** de por qué la migración debería existir y con qué
reglas. Es correcto como análisis y **no describe el código**.

`core/gsis_SaveMigration.js` corre dentro de `loadGame`, después de parsear el
JSON y **antes** de que `GameState` reciba nada.

| viejo | nuevo |
|---|---|
| `9mm` | `colt45` |
| `mag_9mm` | `mag_colt45` |
| `silenced_9mm` | `colt45` |
| `mag_silenced_9mm` | `mag_colt45` |
| `pistol_assembled` | `colt45` |
| `gsis_pistol` | `colt45` |
| `mag_gsis_pistol` | `mag_colt45_extended` |
| `mag_9mm_replica` | `mag_colt45` |
| `mag_9mm_extended` | `mag_colt45_extended` |

**Y los que se RETIRARON del catalogo, con su redencion.** El 30/09 se quitaron cinco
cargadores que no hacian nada: eran un segundo cargador con la misma capacidad que el
arma de base, asi que montarlos no cambiaba el `weaponType`. Eran `mag_colt45_replica`,
`mag_mp5_replica`, `mag_ak47_polymer`, `mag_ak47_bulgarian` y `mag_m4_polymer`.

| retirado | redencion |
|---|---|
| `mag_colt45_replica` | `mag_colt45` |
| `mag_mp5_replica` | `mag_mp5` |
| `mag_ak47_polymer` | `mag_ak47` |
| `mag_ak47_bulgarian` | `mag_ak47` |
| `mag_m4_polymer` | `mag_m4_assembled` |

Un id que desaparece del catalogo **no se borra de la migracion**: se redime a su
equivalente. Un item con un id que el catalogo no reconoce es un item que el jugador
tiene y no puede usar, y en un inventario eso es la peor clase de perdida porque no se
ve.

Y hay una segunda tabla, `ACCESORIOS_RETIRADOS`, que es distinta y hace falta por
separado: los `attachments` de un arma son **strings** en un array, y el recorrido que
renombra items solo baja a nodos que tienen `id` propio. Sin esa tabla, un arma con un
cargador retirado en su `attachments` queda **permanentemente inequipable**: no pierde
el cargador, deja de funcionar el arma.

**Regla: renombrar un item se escribe acá primero.** Un `itemId` es clave
primaria y va en los saves; la alternativa —borrar los saves viejos— no es una
opción.

### Un bug que estuvo a punto de ser invisible

La primera versión del recorrido solo buscaba `id` al recorrer **arrays**:

```js
if (Array.isArray(nodo)) { ... buscar nodo[i].id ... }
for (var key in nodo) { ... }        // <- no buscaba id
```

`Ballistic.equipped` es un mapa por número de slot, no una lista. Probando
contra el save real: 32 items renombrados y **uno sin renombrar**, en
`.Ballistic.equipped.2.id`.

Es peor que no migrar nada: dos items con el mismo `id`, uno migrado y otro no.
El arma aparece en el baúl y desaparece del cinturón.

La versión final mira `id` en los dos tipos de nodo. Profundidad máxima de un
`.id` en el save real: 4, contra un tope de 8.

### Dos pérdidas deliberadas

- Un save con `silenced_9mm` **no** se convierte en "colt45 con silenciador". Se
  convierte en una `colt45` pelada. El item viejo valía 1.800 y el silenciador
  1.200, así que dar el arma gratis sería regalar 600.
- Un cargador de 33 (`mag_9mm_extended`, que era una Glock 18 metida en la
  familia de la Colt) se convierte en el de 15. 33 balas en una Colt .45 no
  existen; el número viejo era el error.

## 10. El contrato con el `.asi`

El `.dat` lo lee **solo** el `.asi`, en su `DllMain`. El mod no abre archivos y
no hay forma de que lea el `.dat` desde CLEO.

Así que el contrato se verifica en dos partes:

1. **Lo que se puede verificar desde el mod**: `validateVariants()` — weaponType
   repetido, configuración duplicada, accesorio no declarado, accesorio
   incompatible, item de inventario duplicado entre familias, accesorios sin
   ordenar.

2. **Lo que no**: que el `.asi` haya dado de alta los tipos. Para eso
   `_validateVariantContract()` imprime en el log el `.dat` que el `.asi`
   *debería* tener, línea por línea, en el formato del parser:

```
[Variantes] 2 variante(s) de plugin. El .asi deberia tener estas lineas en gsis_weapons.dat:
[Variantes]   60 22 346 2 15 -1   (colt45+mag_colt45_extended)
[Variantes]   61 23 347 2 15 -1   (colt45+mag_colt45_extended+suppressor)
```

Y hay que compararlo con `gsis_limiter.txt`: si el `.asi` no dice
`dado de alta: tipo 60`, esa variante no existe en el juego.

**Es una verificación manual y se dice.** La forma correcta es un export del
`.asi` al que el mod pueda preguntarle " ¿tenés el 60, con qué padre y qué
clip?" — que es exactamente lo que pide la Fase 2.

## 11. Por qué no hay generación dinámica

Porque el `.asi` no puede. Las variantes son estáticas: están todas declaradas en
el `.dat`, que se lee una vez al arrancar. No hay export, ni pipe, ni memoria
compartida — el `.def` tiene `EXPORTS` vacío.

Eso no invalida el modelo. Lo que cambia es **dónde vive la tabla de
variantes**: en un archivo que se declara una vez, en vez de generarse al
equipar. Y es lo que hace que `+ laser + optic` siga necesitando una fila
declarada.

## 12. Agregar una variante

1. Elegir el `weaponType`. Si el motor ya tiene esa combinación, **usar el de
   vanilla y listo**: no cuesta nada.
2. Declarar la variante en `WEAPON_VARIANTS`, con `attachments` **ordenado por
   id**.
3. Si es de plugin, agregar la línea al `.dat` en el formato
   `<tipo> <padre> <modelId> <slot> <clip> -1`.
4. Arrancar y comparar la línea que imprime `_validateVariantContract()` con la
   que dice `gsis_limiter.txt`.

Si el accesorio es nuevo, también va en `WEAPON_ATTACHMENTS` (con su
`compatibleFamilies`) y en `ITEMS` (con `type: "weapon_attachment"` o
`"magazine"`).
