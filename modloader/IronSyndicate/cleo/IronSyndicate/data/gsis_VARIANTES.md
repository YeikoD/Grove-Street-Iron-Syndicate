# Familias, accesorios y variantes

Cómo se representa un arma en el mod a partir de la Fase 1 del refactor.

Para el `.asi` ver `gsis_WEAPON_LIMITER.md`. Para agregar un arma ver
`AGREGAR_ARMAS.md`.

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
