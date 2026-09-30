# Agregar un arma al mod

Guía práctica, verificada contra el código el 30/09/2026.

> **Si lo que querés es solo registrar un `.dff` propio para un tipo que ya
> existe**, andá directo a [Paso 3 — Modelo propio](#paso-3--modelo-propio-el-que-realmente-falta).
> Es el paso que casi siempre falta y el que nadie documentaba.

Para el detalle de por qué funciona: `C:\Dev\gsis-armory\_docs\gsis_TECNICA.md`,
sección **`MOD`**. Para qué hace el sistema de armas:
`.IronSyndicate\docs\gsis_WEAPONS.md`.

---

## La idea en una línea

> **Un arma es una FAMILIA más un MODELO, y el `weaponType` es lo que sale
> derivado de las dos.** La familia es la identidad y va en los saves. El
> `weaponType` es la representación que ejecuta el motor, y **no se guarda**.

Consecuencia práctica: **no existe un "registro de arma" que haya que llenar.**
No hay `weaponId` que asignar, ni `WEAPON_DATA` que completar a mano, ni `magIds`
que sincronizar. Hay **tres** tablas y un `.dat`, y el resto se deriva.

Las tres tablas, todas en `cleo\IronSyndicate\data\gsis_weapons.js`, que es la
**fuente única**:

| tabla | qué declara | cuántas hay hoy |
|---|---|---|
| `WEAPON_FAMILIES` | las clases de arma: identidad, slot, precio, peso | **16** |
| `WEAPON_ATTACHMENTS` | las piezas: cargadores, silenciadores, miras | **26** |
| `WEAPON_VARIANTS` | familia + lista de accesorios → `weaponType` | **22** |

> **`gsis_weapon_data.js` y `gsis_weapon_variants.js` son shims.** Reexportan
> `gsis_weapons.js` y no tienen ninguna tabla propia. Si los estás editando, estás
> editando el archivo equivocado: sus cambios no existen.

---

## Antes de nada: elegí el tipo y el padre

### El tipo

Un número libre en **60-79**, el rango que declara
`core\gsis_Config.js` como `PLUGIN_WEAPON_RANGE`.

| rango | qué hay | ¿se tocan? |
|---|---|---|
| `0-46` | armas reales de vanilla | no |
| `47` | libre | no |
| `48` | `ARMOUR` | no |
| `49-59` | pseudo-tipos de muerte: atropellado, ahogado, explosión, **`56 ANYMELEE`, `57 ANYWEAPON`** | **nunca**, el motor los consulta de verdad |
| `60-79` | **el rango del mod** | sí |

**Precondición, no observación:** el rango 60-79 está libre **solo si
fastman92 Limit Adjuster está apagado** (`fastman92limitAdjuster.asi.off`). Con FLA
prendido, 60 y 61 pasan a ser `JETPACK_TYPE` y `BINOCULARS_TYPE`, y 70-79 caen
fuera de `NumberOfWeaponTypes = 70`. El `.asi` lo exige al arrancar y **no confía
en el archivo**.

Quedan **13 números libres** de los 20.

### El padre

Un tipo real de vanilla, y **debe ser 22-32** si querés skills. Son las 11 armas
con cuatro filas de skill: pistola, pistola silenciada, revolver, escopeta,
escopeta_de_combate, sawed-off, micro uzi, mp5, ak47, m4, tec9.

Con un padre fuera de ese rango, `GetSkillStatIndex` (`0x743CD0`) devuelve `-1` y
el arma **nunca sube de skill**.

**El padre decide casi todo.** El arma nueva no tiene animación, ni sonido, ni
mira propias: hereda las del padre. Elegilo por la **clase de arma**:

| querés… | padre | tipo |
|---|---|---|
| pistola semiautomática | `PISTOL` | 22 |
| pistola con silenciador | `PISTOL_SILENCED` | 23 |
| revolver | `DESERT_EAGLE` | 24 |
| escopeta | `SHOTGUN` | 25 |
| subfusil | `MICRO_UZI` | 28 |
| ametralladora | `AK47` | 30 |
| fusil de assault | `M4` | 31 |

> **El padre tiene que ser de vanilla, y no un tipo del mod.** Tres razones, las
> tres medidas: (1) `GetSkillStatIndex` devuelve `-1` fuera de 22-32; (2)
> `Resolver()` sube hasta el **ancestro más alto**, no el padre inmediato, así que
> un padre que fuera del mod perdería todo lo que el intermedio heredó; (3) los
> otros cuatro parches comparan el tipo **resuelto** contra rangos que arrancan en
> 22. **No hay cadenas de padres.**

---

## Paso 1 — La familia

`cleo\IronSyndicate\data\gsis_weapons.js`, en `WEAPON_FAMILIES`.

```js
{
    family: "gsis_pistol", itemId: "gsis_pistol", name: "Pistola GSIS",
    baseVariant: 60, slot: 2, baseClip: 8,
    damage: 25, fireRate: 20, range: 30, accuracy: 25, ammoType: "9mm Parabellum",
    category: "Pistolas", realWorldName: "Colt M1911A1",
    weight: 1.5, isLong: false, price: 550
}
```

| campo | qué es | nota |
|---|---|---|
| `family` | **id estable. Va en los saves. NO cambiar nunca.** | |
| `itemId` | el item de inventario. **Una familia, un item.** | también va en los saves |
| `baseVariant` | el `weaponType` de la familia pelada | **siempre de plugin**, ver abajo |
| `slot` | `WEAPONSLOT`, el mismo para todas las variantes de la familia | 1 melee, 2 pistola, 3 escopeta, 4 subfusil, 5 MG, 6 fusil, 7 pesado, 8 lanzado, 9 especial |
| `baseClip` | capacidad de la variante base | **declarativo**: lo que muestra la UI |
| `damage`, `fireRate`, `range`, `accuracy` | lo que muestra el dealer y la UI | **NO son entradas de runtime.** El motor tiene su propio `damage` en la `CWeaponInfo` y el mod no lo escribe |
| `price`, `weight`, `isLong`, `category`, `realWorldName` | dealer, inventario, UI | |

> **Una familia NO tiene `weaponType`.** El tipo se deriva, y por eso ningún módulo
> lo persiste.

> **Por qué `baseVariant` tiene que ser de plugin, siempre.** El tipo de vanilla
> trae la capacidad **del juego**, que no es la de este mod: el 22 trae 17 balas y
> una Colt de GSIS con 8 necesita su propio tipo. Por eso existe el 63.

**Además, el item en `ITEMS`** (`data\gsis_item_data.js`):

```js
"gsis_pistol": { name: "Pistola GSIS", weight: 1.5, type: "weapon" },
```

`itemId` es la clave, y es lo que va en los saves. No la cambies una vez que haya
partidas guardadas.

---

## Paso 2 — La variante

Mismo archivo, en `WEAPON_VARIANTS`.

```js
{ weaponType: 60, family: "gsis_pistol", attachments: [],
  parent: 22, clipSize: 8, modelId: 346 }
```

| campo | qué es |
|---|---|
| `weaponType` | 60-79, y su fila tiene que estar en el `.dat` |
| `attachments` | **los ids ordenados.** El orden no importa para el resolver, pero la lista se ordena antes de persistir |
| `parent` | el tipo de vanilla del que clona. **`null` en las variantes que ya son de vanilla** |
| `clipSize` | la capacidad. **Tiene que coincidir con el `cargador` del `.dat`** |
| `modelId` | ver [Paso 3](#paso-3--modelo-propio-el-que-realmente-falta) |

### Las cinco salidas de `resolveWeaponType`

Es una cascada y **el orden es el contrato**. Devuelve un `weaponType` o `null`,
nunca uno inventado.

| # | condición | devuelve |
|---|---|---|
| 1 | hay un **accesorio repetido** | `null` |
| 2 | algún accesorio **no es compatible** con la familia | `null` |
| 3 | la combinación está **declarada** | su `weaponType` |
| 4 | **sin accesorios** | el `baseVariant` |
| 5 | todos los accesorios son **neutros** | el `baseVariant` |
| 6 | cualquier otro caso | `null` |

**El accesorio neutro** (paso 5) es la regla que más confunde: si **ningún**
accesorio de la lista necesita tipo propio, resuelve a la variante base. Montar un
cargador de 30 sobre un AK de 30 deja un AK de 30 — el mismo arma, y por eso no
merece un número del rango. En el log se lee `ak47 -> tipo 30 | 0/30` y **parece
un bug y no lo es**.

De los 26 accesorios, **21 son neutros**. Los que no lo son son los que cambian
la capacidad: el tambor del AK (75), el Lancer (40), el D-60 (60) y el cargador
largo de la Colt (15).

**Por qué `null` y no la variante base.** Es lo que mantiene honesta la tabla: con
una caída a la base, un accesorio mal declarado sería **indistinguible** de uno que
no hace nada, y ese es el bug que más cuesta ver. Con `null`, quien llama avisa con
el contexto y el fallo queda en el log con nombre.

---

## Paso 3 — Modelo propio: el que realmente falta

Este es el paso que casi siempre falta, y el que hace que un arma se vea **normal
en vez de la que debería**.

### La distincion que hay que tener clara

Un `modelId` es **una sola cosa**, y hay dos clases:

| clase | ejemplos | qué hay que hacer |
|---|---|---|
| **de vanilla** | 346, 347, 355, 356 | nada. el modelo ya existe |
| **propio** | ≥ 15025 | **registrarlo primero.** si no, el arma sale **invisible** |

Que el `weaponType` sea correcto **no** demuestra que el modelo sea el correcto.
Son dos capas, y confundirlas es exactamente el bug que había con el tipo 62: era
el 62, con sus 15 balas, y **mostraba la Colt de la 63** porque declaraba
`modelId 346`.

### Si el modelo es de vanilla

Poné el número y listo. Los de vanilla están en `data\weapon.dat`:

```
$ PISTOL   ... 346 -1  2 colt45 ...
$ PISTOL_SILENCED ... 347 -1  2 silenced ...
$ AK47     ... 355 -1  5 riflebad ...
$ M4       ... 356 -1  5 riflebad ...
```

> **Poner un número de vanilla que no existe** no rompe nada, pero se ve la
> pistola de siempre: es un fallo que se nota, y un fallo que se nota se arregla.

### Si el modelo es propio

> ### ⚠️ LA REGLA, y cuesta un crash si no la seguís
>
> **Un modelo propio obliga a cambiar el `parent`.**
>
> El padre trae la **animación**. El `.asi` sobreescribe cuatro campos del padre
> —`m_modelId`, `m_nWeaponSlot`, `m_nAmmo` y `m_nDamage` si es `>= 0`— y
> **`m_animGroup` nunca**. Así que la animación siempre es la del padre.
>
> Si ponés un `modelId` propio encima sin cambiar el padre, queda la animación
> del modelo que ya no está, y **apuntar con esa arma crashea el juego.**
>
> ```
> 61 23 15066 2 15  -1   →  animGroup 18 (la de la 347)   CRASH
> 61 22 15066 2 15  40   →  animGroup 13 (la de pistola)   funciona
> ```
>
> Y la mitad que casi se pasa por alto: **`damage: -1` significa "hereda del
> padre"**. Al cambiar de padre el damage heredado cambia solo — el 61 pasó de
> heredar 40 a heredar 25 sin que nadie lo pidiera. Cuando cambies el padre,
> poné el `damage` explícito.
>
> El padre tiene que ser **de la misma clase de arma** que tu modelo. Por eso el
> 62 nunca tuvo el problema: su padre es el 22 (la pistola) y `colt45_c15` **es**
> una pistola.
>
> **Si no tenés asset propio, cloná y no pises nada.** El 60 sigue con `modelId 347`
> y padre 23, que es la configuración original y no tiene este problema.

**Paso 3a — el asset va en `modloader\IronSyndicate\models\`.**

ModLoader indexa solo los `.dff`/`.txd` sueltos. El `.ide` **no sirve para nada
acá**: la sección `weap` de un IDE es de modelos *streamed* y su primer campo es
un model index, no un weapon type.

**Paso 3b — agregá el asset a la tabla del `.asi`.** `limiter.cpp`, array
`g_modelos`:

```cpp
static ModeloPropio g_modelos[] = {
    { 15065, "colt45_c15",       false, false, 0, 0 },
    { 15066, "colt45_c15_silenced", false, false, 0, 0 }
};
```

El `modelId` tiene que estar **libre**: `GetModelInfo(id) == NULL` **y** la celda
de streaming entera en cero. **15025 no sirve**, es `genmotelfurn_sv`, un mueble
de vanilla. El rango arranca en **15065**.

> ### 🧩 Precondición del pool: `WeaponModels = 200`
>
> `AddWeaponModel` **no crea** el pool: escribe en una celda que vanilla ya
> llenó. El pool de vanilla tiene **51 slots** (`push 33h` en `0x4C5E9B`) y
> están casi todos ocupados, así que **entra un solo modelo propio** y al segundo
> `AddWeaponModel` escribe encima de un arma de vanilla.
>
> Tenés que ampliarlo en
> `modloader\Open Limit Adjuster\III.VC.SA.LimitAdjuster.ini`, sección
> `[SALIMITS]`:
>
> ```ini
> [SALIMITS]
> WeaponModels = 200
> ```
>
> `WeaponModels = unlimited` **no** amplía el pool. Y `fastman92limitAdjuster.asi`
> tiene que seguir **apagado** (`.asi.off`): los dos proyectos agrupan el pool y
> si trabajan los dos a la vez no se lleva bien.
>
> Sin esto, el modelo se registra, el log dice que el slot es `-1` y el arma sale
> **invisible**.

**Paso 3c — poné ese `modelId` en el `.dat` y en la variante.** Los dos lados, o
el cross-check de `check-dat.mjs` falla.

### Lo que hace el `.asi`, y cuándo

Nada de esto pasa en `DllMain`. El `.asi` espera al **primer
`CStreaming::Update`**, porque el pool de `CWeaponModelInfo` lo llena **vanilla** y
no el `.asi`: en `DllMain` vale 0 y no hay dónde escribir.

```
primer CStreaming::Update
  ├─ pool > 0?
  │    ├─ celda y ModelInfo vacíos?  (los 4 chequeos)
  │    ├─ AddWeaponModel(id)          crea el CWeaponModelInfo
  │    └─ RequestSpecialModel(id, nombre, 0x0C)   registra y pide la carga
  └─ cada frame: ¿loadState == 1?  →  LISTO
```

`0x0C` es `MISSION_REQUIRED | KEEP_IN_MEMORY`. **Sin `KEEP_IN_MEMORY` el modelo se
descarga cuando CJ se aleja y el arma se vuelve invisible al volver** — un fallo
que depende de dónde estés parado.

### Si te olvidaste de un paso

El `.asi` **no da el arma**, y el log lo dice:

```
[62] *** ERROR DE CONFIGURACION: el .dat pide el modelId 15070, que es un modelo
     propio, y el .asi NO lo tiene en su tabla. ***
    El asset no se registro, asi que este arma saldria INVISIBLE. No se da el tipo.
```

Y si está en la tabla pero todavía no cargó, avisa sin bloquear:

```
[62] modelId 15065 esta en la tabla del .asi pero todavia no esta CARGADO (fase 1).
```

> **Ese segundo aviso aparece durante el arranque y no siempre es un problema:**
> el juego puede clonar el tipo antes de que el modelo termine de cargar. Por eso no
> bloquea.

### Verificar un modelo propio

En `gsis_limiter.txt`, después de `=== MODELOS PROPIOS ===`:

```
[15065] libre: GetModelInfo = NULL y celda en cero
[15065] AddWeaponModel = 00B1E92C | pool 50 -> 51 (delta 1)
[15065] RequestSpecialModel(15065, "colt45_c15", 0xC)
[15065] LISTO en frame 3: loadState 1 | cdSize 0x7 | txdIndex 3609 | m_pRwObject 12018508
```

**Los cuatro criterios del `LISTO`:**

| criterio | valor esperado | si falla |
|---|---|---|
| `cdSize` | `!= 0` | **`0` = ModLoader no encontró el `.dff` por nombre.** El modelo se registra y nunca carga |
| `txdIndex` | `!= -1` | el TXD no se registró; el arma sale sin textura |
| `loadState` | `1` | no llegó a cargar en el tiempo dado |
| `m_pRwObject` | `!= NULL` | no hay modelo en memoria |

El `cdSize == 0` es **el más silencioso** y el más probable: el modelo queda
registrado, el log no se queja, y el arma sale invisible. El `.asi` avisa
justo después de pedirlo, pero conviene mirarlo.

---

## Paso 4 — `gsis_weapons.dat`

`modloader\IronSyndicate\gsis_weapons.dat`. Es el lado del `.asi`.

```
<tipo> <padre> <modelId> <slot> <cargador> <damage>
62 22 15065 2 15 -1
```

| campo | qué es |
|---|---|
| `tipo` | 60-79 |
| `padre` | tipo de vanilla del que se clona, **siempre 22-32** |
| `modelId` | de vanilla o propio. Ver [Paso 3](#paso-3--modelo-propio-el-que-realmente-falta) |
| `slot` | `WEAPONSLOT` |
| `cargador` | balas. **Un número, no un flag: no existe el "-1 = hereda".** El `.asi` rechaza un `cargador <= 0` en vez de inventarse un valor |
| `damage` | `-1` = hereda del padre. **Un `0` significa cero daño, no "no tocar"** |

Se relee en cada arranque. Comentá con `#`.

**Las dos mitades tienen que coincidir.** El `.dat` y `WEAPON_VARIANTS` declaran
parent, `modelId`, `cargador`, `clipSize` y `damage` por separado, y si divergen
el arma funciona con un número y muestra otro. `check-dat.mjs` cruza las dos
mitades —**incluido el `damage`**:

```powershell
node .IronSyndicate\tools\check-dat.mjs
```

> **El `damage` en la variante, no en el `.dat` solamente.** `expectedDatRows()`
> lee `damage` de la variante, y `crossCheckDat()` lo contrasta con la fila real.
> Antes `expectedDatRows` traía `-1` hardcodeado y nadie comparaba el campo: el
> check pasaba con el damage desincronizado. Una guarda que no guarda es el mismo
> defecto que validar la vtable en la ranura equivocada.
>
> Y `-1` en la variante quiere decir literalmente "declaro que se hereda". Si
> querés que herede, escribí `damage: -1`. Si querés un número, escribilo — y
> acordate de que cambiar el padre cambia el heredado.

> **El `.dat` no lleva BOM.** UTF-8 con BOM hace que el parser lea la primera línea
> de comentario como una fila malformada y el check salga distinto de cero.

---

## Paso 5 — Los accesorios

En `WEAPON_ATTACHMENTS`, mismo archivo.

```js
{
    id: "mag_colt45_15", type: "magazine", name: "Cargador Colt .45 extendido",
    realWorldName: "Colt .45 extended magazine 15 rds",
    compatibleFamilies: ["colt45"],
    clipSize: 15, needsVariant: true, weight: 0.2, price: 45
}
```

| campo | qué es |
|---|---|
| `type` | `"magazine"` marca un cargador. El resto son accesorios que **conservan** el cargador al cambiarlo |
| `compatibleFamilies` | dónde entra. Una combinación que no existe no es un error: el resolver devuelve `null` y **la acción se rechaza antes de gastar la pieza** |
| `needsVariant` | **`false` = neutro**: al montarlo el motor no tiene que ejecutar nada distinto, y no cuesta un número del rango. `true` = necesita tipo propio |
| `clipSize` | capacidad del cargador |

> **`needsVariant` es el campo que decide el costo en tipos.** De los 26
> accesorios, 21 son `false`. Los 4 que cambian la capacidad son `true` y sí
> necesitan fila en el `.dat`.

**En `ITEMS`** (`gsis_item_data.js`), el accesorio también:

```js
"suppressor": { name: "Silenciador", weight: 0.3, type: "weapon_attachment" }
```

> **Antes de la refactorización los cargadores iban en `WEAPON_DATA` con
> `category: "Cargadores"`. Ya no.** `WEAPON_DATA` se **deriva** de
> `WEAPON_FAMILIES` + `WEAPON_ATTACHMENTS`; agregar un cargador ahí es imposible
> porque no se edita a mano.

---

## Paso 6 — El ícono

`modloader\IronSyndicate\image\<itemId>.png`.

Sin ícono la UI muestra un hueco, no un error. Los cargadores comparten genéricos:
`mag_9mm.png`, `mag_SMG.png`, `mag_fusil.png`.

---

## Checklist

```
□  tipo en 60-79, y FLA apagado (precondición, no observación)
□  padre de VANILLA, en 22-32
□  WEAPON_FAMILIES: la familia, con family e itemId que no van a cambiar más
□  ITEMS: el item de la familia, type "weapon"
□  WEAPON_VARIANTS: la fila, con parent y clipSize
□  gsis_weapons.dat: la fila, con el MISMO parent, modelId, cargador y slot
□  □ si el modelId es propio (>= 15025): el .dff/.txd en modloader\IronSyndicate\models\
□  □ si es propio: la entrada en g_modelos[] de limiter.cpp, con un id libre (15065+)
□  ITEMS: cada accesorio nuevo
□  WEAPON_ATTACHMENTS: cada accesorio nuevo, con compatibleFamilies y needsVariant
□  □ needsVariant: true ⇒ necesita fila en el .dat con su propio tipo
□  image\<itemId>.png existe
□  node .IronSyndicate\tools\check-dat.mjs     ⇒ exit 0
□  node .IronSyndicate\tools\check-ui-flow.mjs ⇒ exit 0
```

---

## Probar

Levantá el juego. En **`gsis_limiter.txt`** tiene que aparecer:

```
dado de alta: tipo 60, padre 22, modelId 346, slot 2, clip 8, damage -1
verificacion de 8 parches:      (8 OK, el último es 0x40E670)
[60] CWeaponInfo[STD] = ... clip 8 ...
```

`verificacion de 8 parches` y no 7: el octavo es `CStreaming::Update`, y sin él
ningún modelo propio carga.

En **`cleo_redux.log`** (`cleo.log` no tiene `[Weapons]`):

```
[Weapons] equipar: gsis_pistol -> tipo 60 (era 22) | 0/8 balas
```

Ese `-> tipo 60` es la confirmación de que las dos mitades dicen lo mismo.

**Y la prueba que no se puede leer de ningún archivo:** el arma tiene que verse.
El log prueba que la `CWeaponInfo` está bien, no que GTA renderice ese `m_pRwObject`.
Es el mismo criterio que se usó para el silenciador del tipo 60.

> **El log se sobrescribe en cada arranque.** Si una verificación tiene que
> sobrevivir, copialo a un nombre con fecha el mismo día. Un `.log` que se
> regenera no es un archivo, es un temporal.

---

## Si algo falla

| síntoma | causa probable |
|---|---|
| **el arma se ve pero es la de vanilla** | `modelId` de vanilla en vez de propio, o el asset no está en `g_modelos[]` |
| **el arma es invisible** | `modelId >= 15025` no registrado, o registrado-pero-no-cargado. **El log dice cuál de las dos** |
| el `.asi` no registra el modelo | `cdSize == 0`: ModLoader no encontró el `.dff` por nombre |
| **el slot da `-1` en el log** | falta `WeaponModels = 200` en Open Limit Adjuster. El pool de vanilla entra **un** modelo propio y el segundo pisa un arma real |
| **crashea al apuntar, y solo al apuntar** | modelo propio sobre un padre de otra clase: la animación es la del modelo que ya no está. Cambiá el `parent` y poné el `damage` explícito |
| el arma cambió de daño sola | `damage: -1` con el padre cambiado: heredás el del padre nuevo |
| el arma no tiene skill | el padre no está en 22-32 |
| dispara sin sonido | el padre resuelto está fuera de 22-45 |
| no aparece la mira | el padre resuelto no está en la lista blanca de `DrawCrossHairs` |
| el armero no muestra el accesorio | falta la entrada en `WEAPON_ATTACHMENTS` |
| montar un accesorio no cuesta tipo | correcto si `needsVariant: false`; ver el caso neutro |
| `check-dat` sale con error de parseo | **BOM en el `.dat`** |
| hueco en la UI | falta `image\<itemId>.png` |
| el mod borra el arma del save | el tipo no cae en `PLUGIN_WEAPON_RANGE` |

---

## Una variante más (segundo cargador)

Agregá el cargador en `WEAPON_ATTACHMENTS` con `needsVariant: true` y su fila en
`WEAPON_VARIANTS` con el `weaponType` nuevo. El `.dat` también.

**El orden de los accesorios no importa** para el resolver: la lista se ordena
antes de comparar, así que `["suppressor","mag"]` y `["mag","suppressor"]` dan la
misma clave y encuentran la misma fila.

**Montar un cargador conserva los otros accesorios.** Poner el tambor del AK no le
quita el silenciador.

**Montar un accesorio lo consume.** `attachAccessory` saca la pieza del inventario
*antes* de dar el arma, y la devuelve intacta si el motor rechaza la
configuración. Sin ese consumo, montar sería gratis y duplicaría el objeto.

---

## Lo que este sistema no da

- **Munición suelta.** Todo está en cargadores instanciados. Rellenar el cargador
  ya montado **no está implementado y no es implementable** sin decidir de dónde
  salen las balas.
- **Accesorios apilables.** Montar uno lo consume; no se puede montar de a dos sin
  volverlo a comprar.
- **Variantes con capacidad que no venga del cargador.** No hay ninguna.
- **Dos manos con el mismo tipo.** El `slot` del `.dat` decide, y las dos familias
  de pistola comparten el 2: se sustituyen, no conviven.
- **Recargar sin cargador en el cinturón.** La R nunca mira el inventario completo.
