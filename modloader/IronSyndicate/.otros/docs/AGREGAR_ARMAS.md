# Agregar un arma al mod

Guía completa, **verificada contra el código el 04/10/2026**.

> **Esta guía se reescribió DOS veces en un día, y la tercera es la que vale.**
>
> La versión de la mañana del 03/10 describía un sistema de "cada **configuración**
> es su propio item", con el `weaponType` **declarado** en una tabla `ARMAS`. Ese
> modelo **también se fue** el 03/10.
>
> **Hoy hay una FAMILIA por item, las configuraciones son `variantes` dentro de ella,
> y el tipo se DERIVA con `tipoDe()`.** Los accesorios sueltos volvieron
> (`suppressor`) y el 04/10 volvieron las balas sueltas.
>
> Lo que **no** volvió y no hay que buscar: `WEAPON_FAMILIES`, `WEAPON_ATTACHMENTS`,
> `WEAPON_VARIANTS`, `resolveWeaponType()`, `gsis_weapon_data.js` y
> `gsis_weapon_variants.js`. Esos nombres no existen.

## Índice

| si querés… | andá a |
|---|---|
| entender qué archivo va en qué proyecto | [Los dos proyectos](#los-dos-proyectos) |
| elegir el **padre** y no romper nada | [Paso 0 — Elegir el padre](#paso-0--elegir-el-padre-la-parte-que-mas-danos-hace) |
| saber si el modelo es de vanilla o propio | [Paso 1 — El modelo](#paso-1--el-modelo) |
| **solo** registrar un `.dff` propio | [Paso 1](#paso-1--el-modelo), es el paso que casi siempre falta |
| copiar un ejemplo completo ya funcionando | [La Colt .45, archivo por archivo](#la-colt-45-archivo-por-archivo) |

---

## Los dos proyectos

Un arma vive en **dos** proyectos y se editan los dos. El error más común es tocar
uno y no el otro, y el síntoma es siempre el mismo: el item existe y el motor no lo
conoce, o al revés.

| qué | dónde |
|---|---|
| **Los tipos que ejecuta el motor** — padre, modelo, slot, capacidad, daño | `C:\Program Files\GTA SA\modloader\IronSyndicate\gsis_weapons.dat` |
| **La identidad** — la familia, las variantes, los cargadores, las balas, los accesorios | `...\cleo\IronSyndicate\data\gsis_weapons.js` |
| **Los items** — nombre, peso, tipo, si se apila | `...\cleo\IronSyndicate\data\gsis_item_data.js` |
| **Los iconos** | `...\cleo\IronSyndicate\data\gsis_web_data.js` + `...\UI\assets\**` |...\cleo\IronSyndicate\data\gsis_web_data.js` + `...\image\*.png` |
| **Los modelos propios** — la tabla `g_modelos[]` | `C:\Dev\gsis-armory\limiter.cpp` |
| **Los `.dff` / `.txd`** | `...\modloader\IronSyndicate\models\weapons\<arma>\` |
| **El `.asi` compilado** | `C:\Program Files\GTA SA\gsisWeaponLimiter.asi` — **en la RAÍZ del juego** |

Y para leer el porqué de cualquier cosa:

| qué | dónde |
|---|---|
| por qué funciona, medido | `C:\Dev\gsis-armory\_docs\gsis_TECNICA.md`, secciones `MOD` y `MOD 14` |
| la arquitectura del `.asi` | `C:\Dev\gsis-armory\_docs\gsis_ARQUITECTURA.md` |
| los bugs y sus causas | `C:\Dev\gsis-armory\_docs\gsis_BUGS.md` |
| para qué hace el sistema | [`gsis_WEAPONS.md`](./gsis_WEAPONS.md) |
| el ciclo de munición | [`gsis_RECARGA.md`](./gsis_RECARGA.md) |
| las reglas del inventario | [`gsis_INVENTORY.md`](./gsis_INVENTORY.md) |

> **El `.asi` va en la RAÍZ del juego.** ModLoader carga
> `C:\Program Files\GTA SA\gsisWeaponLimiter.asi`. La copia que hay en
> `modloader\IronSyndicate\` es un resto viejo: modificarla no cambia nada.

## La cadena completa

Una familia nueva toca **nueve** lugares. Los tres primeros son la mitad que no puede
crecer de a una.

| # | archivo | qué se agrega | ¿suele hacer falta? |
|---|---|---|---|
| 1 | `gsis_weapons.dat` | una fila de 6 campos por variante | siempre |
| 2 | `data\gsis_weapons.js` → `FAMILIAS[].variantes` | `{ nombre, weaponType, clip, silenciador }` | siempre |
| 3 | `data\gsis_item_data.js` → `ITEMS` | el item de la familia | siempre |
| 4 | `data\gsis_weapons.js` → `CARGADORES` | un cargador por capacidad | casi siempre |
| 5 | `data\gsis_weapons.js` → `MUNICION` | la bala de su calibre | **desde el 04/10, siempre** |
| 6 | `data\gsis_weapons.js` → `SILENCIADORES` | el silenciador | solo si el arma lo lleva |
| 7 | `data\gsis_item_data.js` → `ITEMS` | los items de 4, 5 y 6 | con cada accesorio |
| 8 | `data\gsis_web_data.js` → `WEB_ICONS` | el PNG de cada item nuevo | siempre |
| 9 | `limiter.cpp` → `g_modelos[]` | el `.dff` propio | solo si el modelo es propio |

> **Las mitades 1-2 no pueden crecer de a una.**
>
> - variante sin fila → el `.asi` no registra el tipo; el `give` no da nada y el arma
>   se queda como estaba.
> - fila sin variante → el `.asi` registra el tipo al pedirlo y **nadie lo pide
>   nunca**: ocupa un slot del rango `60..79` para siempre.

`node .IronSyndicate\tools\check-dat.mjs` cruza las nueve y sale distinto de cero si
algo no cierra. **Corrélo antes de arrancar el juego.**

---

## Paso 0 — Elegir el padre

> El titulo va sin acentos a proposito: los enlaces internos de este documento
> apuntan a `#paso-0--elegir-el-padre`, y un slug con acentos depende de como el
> renderer los normalice. Es el unico titulo con esta regla.

El padre es el tipo **de vanilla** del que el `.asi` copia todo lo que no le
pisas. Elegirlo mal no da error: da un arma muda, sin mira, sin skill, o un crash.

### De dónde sale el número

De **`data\weapon.dat`** del juego, que es la tabla de armas reales. Las columnas
que importan son las que declara el propio archivo:

```
#	A:		string weaponType
#	B:		string eFireType
#	C,D:	float targetRange, weaponRange
#	E,F:	int modelId1, modelId2
#	I:		int weaponslot
```

Los bloques `$` van **en orden de tipo**, arrancando en `PISTOL = 22`. Eso se puede
verificar con las dos filas que el mod ya usa: `PISTOL` tiene `modelId1 = 346` y
`PISTOL_SILENCED` tiene `347`, que son exactamente los `modelId` de las filas `63` y
`60`.

| tipo | bloque de `weapon.dat` | línea | modelId | slot | sirve para |
|---|---|---|---|---|---|
| 22 | `PISTOL` | 77 | **346** | 2 | pistola normal |
| 23 | `PISTOL_SILENCED` | 82 | **347** | 2 | pistola silenciada |
| 24 | `DESERT_EAGLE` | 86 | **348** | 2 | pistola grande |
| 25 | `SHOTGUN` | 90 | **349** | 3 | escopeta |
| 26 | `SAWNOFF` | 94 | **350** | 3 | escopeta recortada |
| 27 | `SPAS12` | 98 | **351** | 3 | escopeta |
| 28 | `MICRO_UZI` | 102 | **352** | 4 | subfusil |
| 29 | `TEC9` | 106 | **372** | 4 | subfusil |
| 30 | `MP5` | 110 | **353** | 4 | subfusil |
| 31 | `AK47` | 114 | **355** | 5 | fusil |
| 32 | `M4` | 118 | **356** | 5 | fusil |

**Ahí termina el rango: `22..32`.** Que el `.asi` exija exactamente ese rango no es
casual — es la cantidad de bloques desde `PISTOL` hasta `M4`. Si tu arma es una
pistola, el padre es `22`; si querés que suene y se vea como la silenciada, `23`.

### Las cuatro reglas del padre

Las tres primeras están medidas y son de correctness; la cuarta es la que costó un
crash.

1. **Debe ser de vanilla, en `22..32`.** `GetSkillStatIndex(0x743CD0)` devuelve `-1`
   para lo que esté fuera, y un `-1` ahí es un arma que no sube de skill nunca.

2. **No puede ser un tipo del mod.** `Resolver()` sube hasta el **ancestro más alto**,
   no el padre inmediato. Si el padre fuera un `60..79`, el clon saldría del
   ancestro final y perdería lo que el padre intermedio había heredado.

   > **No hay cadenas.** "el 61 hereda del 60" no es una configuración, es un
   > **rechazo del parser**. Lo que hace que "el 61 sea hijo del 60" funcione es la
   > **derivación** —que las dos variantes salgan del mismo `tipoDe()`—, que es
   > otra cosa.

3. **Los otros cuatro parches comparan el tipo resuelto contra rangos que arrancan en
   22**: `22..43` (disparo), `22..45` (sonido de disparo), `22..34` (sonido de
   recarga), `22..31` (mira). Un padre fuera de ahí significa que el arma dispara
   **muda**, o **sin mira**, o **sin skill** — y ninguno de los tres da error.

4. **El padre tiene que traer la animación de un modelo de la misma clase.** El
   `.asi` sobreescribe cuatro campos del padre (`m_modelId`, `m_nWeaponSlot`,
   `m_nAmmo`, `m_nDamage` si es `>= 0`) y **nunca** `m_animGroup`. La animación
   siempre es la del padre.

   > La regla se leía como "un modelo propio obliga a cambiar el padre", y es
   > **media verdad**. Es cierta para modelos **propios** y falsa para los de
   > **vanilla**: el `61` estuvo un rato con padre `22` y un modelo propio, y lo
   > único que consiguió fue perder la animación y el sonido de la silenciada.
   > El crash que motivó esa conclusión **no era de animación**: ver
   > [Paso 1](#paso-1--el-modelo).

### La trampa de cambiar de padre: el daño

`damage = -1` significa "hereda del padre", así que **al cambiar de padre el daño
heredado cambia solo**. El `61` pasó de heredar `40` (del `23`) a heredar `25` (del
`22`) sin que nadie lo pidiera.

> **Si el padre no es el de siempre, el `damage` va explícito.** Siempre.

---

## Paso 1 — El modelo

Dos clases, y se portan distinto en todo.

| | **vanilla** (346, 347, 348…) | **propio** (`>= 15025`) |
|---|---|---|
| quién lo crea | el juego, ya existe | **nadie**: lo crea el `.asi` en su primer `CStreaming::Update` |
| qué hay que hacer | escribir el `modelId`, y **asegurarse de que esté cargado** | escribir el `modelId` **y agregarlo a `g_modelos[]`** |
| qué pasa si te olvidás | el arma sale **invisible** | sale invisible, y el log dice qué id pidió el `.dat` |
| regla del padre | **clonar sin pisar**: mismo `modelId` que el padre | el padre tiene que ser **de la misma clase** |

### Si el modelo es de vanilla

No hay nada que registrar **en el `.asi`**. Pero eso no es "escribir y listo":

> **Un `modelId` de vanilla no es "escribir y listo". Es "escribir, y asegurar que el
> modelo esté en memoria".**

El motor pide el modelo de un arma vanilla cuando el arma llega a la mano por su
camino normal. Un tipo `60`–`79` **no llega por ese camino**, así que hay que pedirlo
aparte — y eso lo hace `PedirModelosVanilla()` en `limiter.cpp`, desde el hook de
`CStreaming::Update`, con `CStreaming::RequestModel (0x4087E0)`.

**Medido el 03/10:** el tipo `60` (Colt silenciada, modelo `347`) salía **invisible**.
Estaba en el slot, con el cargador correcto, la animación 18 y el sonido de la 23.
Solo faltaba el modelo en pantalla:

```
[60] MODELO 347 ahora: loadState 0 | cdSize 6 | rwObject NULL
```

Y no lo pedía nadie. La `346` (la Colt pelada) **sí** estaba en memoria —el juego la
pide al arrancar—, y por eso el `63` nunca falló. La `347` solo se carga si algo la
usó antes en la partida.

En el log, las dos líneas y en ese orden:

```
[60] el modelo de vanilla 347 NO ESTA CARGADO (loadState 0, rwObject NULL). Se pide. Sin esto el arma sale INVISIBLE.
[60] modelo de vanilla 347 CARGADO: el arma se ve.
```

**Si aparece la primera y NO la segunda, el modelo no está entrando** y el arma sigue
invisible: eso ya es un bug del `.asi`, no de tu fila.

> Y no lo delata ni el HUD ni el log de un `give`. El único lugar donde está el dato
> es el volcado `MODELO` del log.

### Si el modelo es propio

Dos cosas, y las dos hacen falta.

**1. El `.dff` y el `.txd`** en `modloader\IronSyndicate\models\weapons\<arma>\`, con
el mismo nombre base (`colt45_c15.dff` / `colt45_c15.txd`). ModLoader los indexa
solo; lo que **no** hace es crear el `CModelInfo`.

**2. La entrada en `g_modelos[]`** de `C:\Dev\gsis-armory\limiter.cpp`, con el nombre
**exacto** del `.dff`:

```cpp
static ModeloPropio g_modelos[] = {
    { 15065, "colt45_c15",          NULL, false, false, 0, 0 },
    { 15066, "colt45_c15_silenced", NULL, false, false, 0, 0 }
};
```

Hoy hay **dos**. Los índices empiezan en `15025` y el primero libre se prueba: si
aparece `*** NO ESTA LIBRE`, el índice ya lo ocupa otra cosa.

Y hace falta el pool:

```
modloader\Open Limit Adjuster\III.VC.SA.LimitAdjuster.ini
[SALIMITS] WeaponModels = 200
```

> **Con el pool de vanilla (51 slots) cabe UN modelo propio: el segundo no entra y
> CRASHEA el juego**, no falla en silencio. El crash no es del `.asi`, es del pool
> lleno. `AddWeaponModel` calcula la ranura con un bump allocator sobre el contador,
> y al no haber slot 51 leía memoria de otro pool.
>
> `WeaponModels = unlimited` **no agranda nada**: `unlimited` no es un número y el
> `.asi` lo ignora en silencio. `200` **sí** reasigna el array completo —y también
> mueve los modelos de vanilla.
>
> `200` es el valor **validado** con los dos modelos que hay hoy. No es un mínimo
> teórico: es lo que se probó. **Si agregás un tercero, subilo y volvé a probar.**
>
> Y lo que GSIS **no** hace, que es lo importante: no lee ninguna dirección de ese
> pool. Toma la ranura del retorno de `AddWeaponModel()` y la verifica contra
> `ms_modelInfoPtrs`, que es estructura del juego. Por eso actualizar el Limit
> Adjuster no lo rompe.

#### La corrección del crash, y por qué importa

El 30/09 se midió esto y se concluyo que el padre tenía que ser de la misma clase:

```
61 23 15066 2 15  -1   ->  animGroup 18 (la de la 347)   CRASH
61 22 15066 2 15  40   ->  animGroup 13 (la de pistola)   funciona
```

> **CORRECCIÓN del 03/10: ese crash NO era la animación.** Con
> `WeaponModels = 200` puesto, `61 23 15066 2 15 -1` **funciona**: clona del `23`,
> conserva `animGroup 18`, el sonido sale por la silenciada
> (`FIRE: crudo 61 -> padre 23`) y apuntar no tira.
>
> Lo que se había medido el 30/09 era el crash del **pool**, que coincidía en el
> tiempo y se confundió con un problema de animación. **La precondición real es
> `WeaponModels = 200`, no el padre.**
>
> La regla del padre de la misma clase **sigue valiendo** para cualquier
> `modelId >= 15025` —el `62` la cumple— y lo que no vale es aplicarla a un modelo de
> vanilla.

### Verificar un modelo propio

En `gsis_limiter.txt`:

```
modelos propios declarados: 2 (15025+)
  15065 -> "colt45_c15"
  15066 -> "colt45_c15_silenced"
[15066] RequestSpecialModel(15066, "colt45_c15_silenced", 0xC)
[15066] LISTO en frame 3: loadState 1 | cdSize 0x7 | txdIndex 3610 | m_pRwObject ...
```

Las dos líneas que importan: la del **registro** y la del **`LISTO`**. Si aparece
`SE ENTREGA CON EL MODELO DEL PADRE`, el `.asi` lo está degradando y hay que buscar
el `***` de arriba.

> ### 🚨 ESTO HOY NO PASA. LOS DOS MODELOS PROPIOS NO CARGAN.
>
> **Medido el 04/10/2026 sobre `gsis_limiter.txt`.** El bloque de arriba describe lo
> que habría que ver, y lo que hay es otra cosa:
>
> ```
> [15065] loadState 0 con cdSize 0x6 y txdIndex 3609: streaming solto la peticion.
>          Reintento 1 en el frame 31.
> [62] SE ENTREGA CON EL MODELO DEL PADRE (22): el modelo propio 15065 no esta cargado.
> ```
>
> - **52 líneas** de `streaming solto la peticion` en 779 tramas.
> - `m_pRwObject` con puntero distinto de cero **2 veces** en 779.
> - El `LISTO en frame N` que dice este documento **no aparece ni una vez**.
>
> O sea que **hoy los tipos 62 y 61 se ven como una pistola normal**: el arma aparece,
> dispara, tiene las 15 balas y suena bien, pero no tiene la forma de la C15. Y como
> no hay error en ningún log, el jugador ve una pistola y cree que tiene la C15.
>
> **Lo que NO es el culpable**, para no perder tiempo:
>
> - No es la precondición del pool. `[SALIMITS] WeaponModels = 200` **está puesto**.
> - No es la tabla `g_modelos[]`. Las dos entradas están y el chequeo cruzado da OK.
> - No es el hook de `AddWeaponModel`. Los 8 parches dan el patrón esperado.
> - No es el fallback: el fallback es lo que **tapa** el fallo.
>
> Lo que sí funciona y lo demuestra: el modelo **de vanilla** 347 del tipo 60 entra sin
> problema, y el log lo cuenta con sus dos líneas —`[60] el modelo de vanilla 347 NO
> ESTA CARGADO ... Se pide.` y `[60] modelo de vanilla 347 CARGADO: el arma se ve.`—.
> O sea que la machinery anda, y lo que no entra es un `RequestSpecialModel` de un
> `.dff` propio.
>
> **Dónde se arregla:** en el `.asi`, y el `.asi` **no está en este repositorio** — su
> fuente es `C:\Dev\gsis-armory\limiter.cpp`. Desde acá no se puede tocar. Lo que se
> puede es no dar por hecho que el paso 1 está hecho: por eso la sección de
> verificación del `.dat` (§"COMO SE COMPRUEBA QUE UNA FILA NUEVA SIRVE") pide las
> líneas del modelo y no solo el `dado de alta`.
>
> **Y si se agrega un tercer modelo propio**, la precondición del pool vuelve a
> aplicar y hay que volver a probar: con el pool de vanilla (51 slots) el segundo
> modelo **crasha**. Ese límite es real y sigue valiendo, es independiente de este
> fallo.

---

## Paso 2 — La fila del `.dat`

`modloader\IronSyndicate\gsis_weapons.dat`. Seis campos:

```
# <tipo> <padre> <modelId> <slot> <cargador> <damage>
60 23   347 2  8 -1     colt45 + silenciador
61 23 15066 2 15 -1     colt45 + silenciador + cargador 15   <- modelId PROPIO
62 22 15065 2 15 -1     colt45 + cargador 15                 <- modelId PROPIO
63 22   346 2  8 -1     colt45 pelada
```

| campo | regla |
|---|---|
| `tipo` | 60-79, sin repetir. Hoy: `60`, `61`, `62`, `63`. Quedan 16 |
| `padre` | 22-32, de vanilla, distinto del tipo. Ver [Paso 0](#paso-0--elegir-el-padre-la-parte-que-mas-danos-hace) |
| `modelId` | de vanilla (columna E de `weapon.dat`) o `>= 15025` propio |
| `slot` | 1 melee, 2 pistola, 3 escopeta, 4 subfusil, 5 MG, 6 fusil, 7 pesado, 8 lanzado, 9 especial |
| `cargador` | la capacidad, **un número > 0**. El `.asi` rechaza `<= 0` |
| `damage` | `-1` = heredar del padre. **`0` = cero daño**, no "no tocar" |

**Por qué `cargador` es obligatorio:** el mod **no** escribe `m_nAmmoClip` en ningún
momento, así que el único lugar del sistema donde existe una capacidad es esta línea.
Si acá no hay número, el arma no tiene cargador. No existe el `-1 = hereda` que decía
una versión anterior de este comentario.

**Por qué `modelId` va explícito siempre:** `HookGetWeaponInfo` lo sobreescribe en las
cuatro filas de skill **sin condiciones**, así que va escrito aunque sea el mismo que
el del padre.

El `cargador` de la fila es **la copia del `clip` de la variante** ([Paso 3](#paso-3--la-familia-y-las-variantes)).
Son el mismo número en dos lugares, y `check-dat.mjs` los cruza.

> **Precondición, no observación:** el rango `60..79` está libre **solo si fastman92
> Limit Adjuster está apagado** (`fastman92limitAdjuster.asi.off`). Con FLA prendido,
> 60 y 61 pasan a ser `JETPACK_TYPE` y `BINOCULARS_TYPE`, y 70-79 caen fuera de
> `NumberOfWeaponTypes = 70`. El `.asi` lo exige al arrancar y **no confía en el
> archivo**.

El **header del `.dat`** explica todo esto con más detalle y está al día. **Leelo.**

---

## Paso 3 — La familia y las variantes

En `cleo\IronSyndicate\data\gsis_weapons.js`, dentro de `FAMILIAS`:

```js
export var FAMILIAS = {
    "colt45": {
        nombre: "Colt .45",
        slot: 2,
        precio: 550,
        peso: 1.5,
        categoria: "Pistolas",
        variantes: [
            // .dat: 63 22 346 2  8 -1
            { nombre: "Colt .45",              weaponType: 63, clip: 8,  silenciador: false },
            // .dat: 60 23 347 2  8 -1
            { nombre: "Colt .45 Silenced",     weaponType: 60, clip: 8,  silenciador: true  },
            // .dat: 62 22 15065 2 15 -1
            { nombre: "Colt .45 C15",          weaponType: 62, clip: 15, silenciador: false },
            // .dat: 61 23 15066 2 15 -1
            { nombre: "Colt .45 Silenced C15", weaponType: 61, clip: 15, silenciador: true  }
        ]
    }
};
```

Cuatro cosas:

- **`clip` y `silenciador` son la CONDICIÓN que elige la variante**, no una
  descripción. Son los dos datos que el save guarda del arma, y nada más. El
  `weaponType` **se deriva** de ellos con `tipoDe()` y no se guarda nunca.

- **No puede haber dos variantes con el mismo par.** `tipoDe()` devuelve la primera
  que encuentra, así que la segunda es inalcanzable y el arma se convierte en la otra
  sin que nadie la pida. `check-dat.mjs` lo avisa probando que la derivación sea
  **reversible**.

- **Todas las combinaciones tienen que existir.** Si declarás `(8, sil.)` pero no
  `(8, pelada)`, esa combinación da `null` y el arma **no cambia de variante** —con
  log, no en silencio—. Lo mismo al revés: el silenciador no se puede montar en un
  arma cuya variante silenciada no existe.

- **`clip` tiene que ser el `cargador` de la fila del `.dat`.** `check-dat.mjs` los
  cruza.

### Un cargador es de una CAPACIDAD, no de un arma

El cargador de 8 le sirve a la pelada y a la silenciada; el de 15 a la C15 y a la C15
silenciada. Es lo que hace que una familia con cuatro variantes necesite **dos**
cargadores y no cuatro.

```js
export var CARGADORES = {
    "mag_colt45":     { nombre: "Cargador Colt 45",         familias: ["colt45"], clipSize: 8,  precio: 220, peso: 0.2  },
    "mag_colt45_c15": { nombre: "Cargador Colt 45 Extended", familias: ["colt45"], clipSize: 15, precio: 250, peso: 0.25 }
};
```

> `familias` es la lista de **familias** a las que le sirve, no de items. Y "cada
> cargador en su arma" no necesita regla aparte: la recarga elige entre los
> cargadores **equipados** cuyo `familias` incluye la familia del arma.
>
> El `clipSize` tiene que ser **el mismo número** que el `clip` de las variantes que
> activa y que el `cargador` de la fila del `.dat`. Son la tercera copia del número,
> y es la que `check-dat.mjs` cruza con las otras dos.

---

## Paso 4 — La munición

**Obligatoria desde el 04/10/2026.** Antes el cargador se llenaba con las balas de
otro cargador del mismo tipo, y eso cerraba el círculo **sin munición nueva**: con dos
cargadores y ocho balas, la suma de balas del mundo nunca crecía. Hoy la caja es la
**única entrada**, así que una familia sin bala tiene cargadores que no tienen forma
de llenarse.

```js
export var MUNICION = {
    "bala_45": { nombre: "Balas .45", familias: ["colt45"] }
};
```

Y en `data\gsis_item_data.js`, `ITEMS`:

```js
"bala_45": { name: "Balas .45", weight: 0.005, type: "magazine", instanced: false,
             familias: ["colt45"], maxStack: 50 },
```

Cuatro cosas, y las cuatro importan:

- **`type: "magazine"`** para salir en la banda **"Municion"** al lado de los
  cargadores. La banda y el tipo del catálogo **no son la misma cosa**: la banda dice
  cómo se dibuja la fila.

- **`instanced: false`** es lo que hace que se **apile**, y es la excepción que rompe
  el contrato de `isInstanced()` —"magazine = una unidad con SUS balas"—, porque la
  bala **es** un número de unidades. Sin el opt-out, 50 balas serían 50 filas de una
  y la celda de munición pintaría "0" en cada una.

- **`maxStack: 50`** es el tope por fila, y es **opt-in**. Sin él la bala se apila en
  una sola fila: 100 balas en una fila. La chatarra no lo declara y se sigue apilando
  sin tope, que es el comportamiento de siempre.

- **`familias`** es la **misma clave que usan los cargadores**. El casamiento bala ↔
  cargador sale de ahí y de ningún otro lado.

Para una familia nueva hay dos caminos:

| caso | qué hacer |
|---|---|
| usa **el mismo calibre** que otra | agregar la familia a la `familias` de la bala que ya existe. Una `bala_45` puede servir a un `ak47` |
| usa **otro calibre** | una bala nueva, con su `familias`, su `ITEMS`, su icono y su `maxStack` |

---

## Paso 5 — Los accesorios

Un accesorio es una de dos cosas, y son estructuras distintas.

### El silenciador: se MONTA

No es una variante: es la pieza que convierte una variante en la de al lado. Por eso
es un item suelto y por eso el flag `silenciador` vive **en la fila del arma**.

```js
export var SILENCIADORES = {
    "suppressor": { nombre: "Silenciador", precio: 400, peso: 0.1 }
};
```

```js
"suppressor": { name: "Silenciador", weight: 0.1, type: "weapon_attachment", instanced: true },
```

> **`instanced: true` en el silenciador.** Sin eso es un item apilable, y
> `ITEMS_TAKE_ACCESSORY` saca la fila **entera** del id que se le pide: un
> silenciador con cantidad 2 se llevaría los dos de un montaje. Con una fila por
> unidad, sacar uno y devolver uno son simétricos.

**Para qué sirve:** la existencia de la variante silenciada en `FAMILIAS[].variantes`.
No hay un "el silenciador hace X": lo que hace es **seleccionar la mitad de las
variantes**. Su `slot` sale del arma a la que está montado, y mientras está en la
mochila no está en ninguna.

### El cargador: se EQUIPA en una ranura

Va a una de las dos ranuras (`WEAPONS.CARGADORES_EQUIPADOS = 2`) y lo gasta la `R`. Ver
[Paso 3](#un-cargador-es-de-una-capacidad-no-de-un-arma).

### Agregar un accesorio nuevo

Si es del mismo tipo —una pieza que se monta o se equipa y **selecciona una
combinación**—, el trabajo es:

1. La entrada en `SILENCIADORES` o `CARGADORES`.
2. Las **variantes** que ese accesorio hace alcanzables en `FAMILIAS[].variantes`.
3. Las filas del `.dat` para esas variantes.
4. La entrada en `ITEMS` con el `type` que corresponda.
5. El icono.
6. Si es munición, también `MUNICION`.

> **Y el campo de la variante tiene que crecer.** Hoy la condición es
> `(clip, silenciador)`, un par. Un tercer tipo de accesorio —una linterna, una
> correa, una mira— hace que la condición sea una terna, y eso toca `variantes`,
> `tipoDe()`, el `if (it.silenciador)` que decide la fila del arma, y el estado que
> el save guarda. **No es agregar una fila: es cambiar la tupla.** Es el cambio más
> caro del sistema y conviene pensarlo antes de escribirlo.

---

## Paso 6 — El ícono

En `cleo\IronSyndicate\data\gsis_web_data.js`, `WEB_ICONS`, y el PNG en
`modloader\IronSyndicate\UI\assets\`.cate\image\`.

**No es opcional en la práctica:** sin la entrada la celda del icono sale **vacía**, y
no da ningún error —ni excepción, ni imagen rota, ni una línea de log— porque
`iconCell` solo hace `if (!r.icon)` y pinta el hueco. Es el fallo más barato de ver y
el más difícil de causalizar. `check-dat.mjs` lo avisa.

> **La clave es el `itemId` exacto de `ITEMS`.** El 03/10 `WEB_ICONS` tenía
> `mag_colt45_15`, el nombre viejo del cargador de 15, y su icono faltaba sin que nada
> lo dijera. Una línea con un id que no existe es una fila de icono vacía en
> pantalla y ningún error.

Los PNG que existen y sirven de punto de partida:

| para qué | PNG |
|---|---|
| pistola | `imagenes/weapons/Pistol.png` |
| pistola silenciada | `imagenes/weapons/Silenced Pistol.png` |
| cargador de pistola | `imagenes/mag_9mm.png` |
| cargador de subfusil | `imagenes/mag_SMG.png` |
| cargador del resto | `imagenes/mag_fusil.png` |
| bala | `imagenes/bullet45.png` |

> **El valor de `WEB_ICONS` es una RUTA dentro de `UI\assets\`, no un nombre de
> archivo.** Antes era el nombre pelado y la pagina prependia `../image/`. Los PNG se
> repartieron en `imagenes/`, `imagenes/weapons/` e `iconos/categorias/`, y el
> nombre pelado dejo de alcanzar. La base de la pagina es `assets/` —no
> `assets/imagenes/`— justamente para que las tres convivan sin un `../` por item.
>
> Y los espacios en los nombres (`Silenced Pistol.png`) **no se normalizan**:
> `img.src` los resuelve solo y el archivo se llama asi.

---

## La Colt .45, archivo por archivo

El ejemplo completo y **verificado**: esta es la implementación de referencia. Para
agregar un arma, copiala y cambiá los números.

### `modloader\IronSyndicate\gsis_weapons.dat`

```
60 23   347 2  8 -1     colt45 + silenciador
61 23 15066 2 15 -1     colt45 + silenciador + cargador 15   <- modelId PROPIO
62 22 15065 2 15 -1     colt45 + cargador 15                 <- modelId PROPIO
63 22   346 2  8 -1     colt45 pelada
```

Los cuatro padres son `22` o `23` — pistolas — porque es una pistola. Los dos modelos
de vanilla (`346`, `347`) son los de esos mismos padres, o sea **clonar sin pisar**.

### `cleo\IronSyndicate\data\gsis_weapons.js`

```js
export var FAMILIAS = {
    "colt45": { nombre: "Colt .45", slot: 2, precio: 550, peso: 1.5, categoria: "Pistolas",
        variantes: [
            { nombre: "Colt .45",              weaponType: 63, clip: 8,  silenciador: false },
            { nombre: "Colt .45 Silenced",     weaponType: 60, clip: 8,  silenciador: true  },
            { nombre: "Colt .45 C15",          weaponType: 62, clip: 15, silenciador: false },
            { nombre: "Colt .45 Silenced C15", weaponType: 61, clip: 15, silenciador: true  }
        ]}
};

export var CARGADORES = {
    "mag_colt45":     { nombre: "Cargador Colt 45",         familias: ["colt45"], clipSize: 8,  precio: 220, peso: 0.2  },
    "mag_colt45_c15": { nombre: "Cargador Colt 45 Extended", familias: ["colt45"], clipSize: 15, precio: 250, peso: 0.25 }
};

export var SILENCIADORES = { "suppressor": { nombre: "Silenciador", precio: 400, peso: 0.1 } };

export var MUNICION = { "bala_45": { nombre: "Balas .45", familias: ["colt45"] } };
```

### `cleo\IronSyndicate\data\gsis_item_data.js`

```js
"colt45":         { name: "Colt .45",           weight: 1.5,   type: "weapon" },
"mag_colt45":     { name: "Cargador Colt 45",   weight: 0.2,   type: "magazine" },
"mag_colt45_c15": { name: "Cargador Colt 45 Extended", weight: 0.25, type: "magazine" },
"suppressor":     { name: "Silenciador",       weight: 0.1,   type: "weapon_attachment", instanced: true },
"bala_45":        { name: "Balas .45",          weight: 0.005, type: "magazine", instanced: false,
                    familias: ["colt45"], maxStack: 50 },
```

### `cleo\IronSyndicate\data\gsis_web_data.js`

```js
WEB_ICONS = {
    "colt45":         "colt45.png",
    "mag_colt45":     "mag_9mm.png",
    "mag_colt45_c15": "mag_9mm.png",
    "suppressor":     "silenced9mm.png",
    "bala_45":        "bullet45.png"
};
```

### `C:\Dev\gsis-armory\limiter.cpp`

```cpp
static ModeloPropio g_modelos[] = {
    { 15065, "colt45_c15",          NULL, false, false, 0, 0 },
    { 15066, "colt45_c15_silenced", NULL, false, false, 0, 0 }
};
```

### Archivos de modelo

```
modloader\IronSyndicate\models\weapons\colt45\colt45_c15.dff
modloader\IronSyndicate\models\weapons\colt45\colt45_c15.txd
modloader\IronSyndicate\models\weapons\colt45\colt45_c15_silenced.dff
modloader\IronSyndicate\models\weapons\colt45\colt45_c15_silenced.txd
```

### Las nueve cosas, en una línea cada una

```
.dat          4 filas, padres 22 y 23, modelos 346/347 de vanilla y 15065/15066 propios
FAMILIAS      1 familia, 4 variantes = las 4 combinaciones de (8|15, sil.|pelada)
ITEMS         5 items: el arma, 2 cargadores, el silenciador, la bala
CARGADORES    2, por capacidad (8 y 15), no por variante
SILENCIADORES 1
MUNICION      1 bala, .45, que sirve a la familia
WEB_ICONS     5 líneas, 4 PNG distintos
g_modelos[]   2 entradas, 15065 y 15066
pool          WeaponModels = 200
```

---

## Checklist

- [ ] Elegí el **padre** con la tabla del [Paso 0](#paso-0--elegir-el-padre-la-parte-que-mas-danos-hace), y anoté de qué línea de `weapon.dat` sale
- [ ] El padre está en `22..32`, es de vanilla, y es **de la misma clase** que el modelo si el modelo es propio
- [ ] El `damage` va **explícito** si el padre no es el de siempre
- [ ] Hay una variante en `FAMILIAS` con ese `weaponType`, con `clip` igual al `cargador` de la fila
- [ ] **Todas** las combinaciones de `(clip, silenciador)` tienen variante
- [ ] Ninguna otra variante tiene el mismo par
- [ ] La combinación es alcanzable: existe el cargador con ese `clipSize` en `CARGADORES`, y el `SILENCIADORES` si lleva silenciador
- [ ] **La familia tiene balas**: hay una entrada en `MUNICION` cuyo `familias` la incluye, o se le agregó la familia a una bala que ya existía
- [ ] La bala nueva tiene `maxStack > 0`, `instanced: false` y `type: "magazine"`
- [ ] Hay entradas en `ITEMS` para la familia y para cada accesorio nuevo
- [ ] Hay línea en `WEB_ICONS` para cada item nuevo, y el PNG existe
- [ ] Si el modelo es propio: el `.dff` y el `.txd` están en `models\weapons\<arma>\` con el mismo nombre base, y hay línea en `g_modelos[]`
- [ ] `modloader\Open Limit Adjuster\III.VC.SA.LimitAdjuster.ini` tiene `WeaponModels = 200`
- [ ] `fastman92limitAdjuster.asi.off` — FLA apagado
- [ ] `node .IronSyndicate\tools\check-dat.mjs` dice **TODO OK**
- [ ] El `.asi` compilado está en `C:\Program Files\GTA SA\gsisWeaponLimiter.asi`, **no** en `modloader\IronSyndicate\`
- [ ] **En `gsis_limiter.txt` el modelo de la variante nueva aparece `LISTO`**, y **no** aparece `SE ENTREGA CON EL MODELO DEL PADRE`

> **Corregido el 04/10/2026. La última línea del checklist es la que importa, y hoy
> no se puede marcar.**
>
> Este checklist termina en `check-dat.mjs` dice TODO OK, y eso da la impresión de que
> el paso quedó verificado. **No.** El check no mira el `.asi`: cruza `.dat ↔ variantes
> ↔ ITEMS ↔ WEB_ICONS ↔ PNG` y su propio recordatorio lo dice —"esto NO dice si el
> modelo se ve"—.
>
> El estado real: `check-dat.mjs` pasa, el `.asi` da de alta los 4 tipos, los clones
> salen bien, **y los dos modelos propios no cargan**. O sea que la mitad del checklist
> es verificable a maquina y la otra mitad es manual, y la parte manual es la que
> falla hoy.
>
> También: de las herramientas de `tools/`, **solo `check-dat.mjs` corre**.
> `inventario.mjs` y `smoke.mjs` existen pero mueren con `ERR_MODULE_NOT_FOUND` porque
> hacen `import "./fake-engine.mjs"` y ese archivo no está; `check-migration.mjs` y
> `check-ui-flow.mjs` no existen. No cuentes con ellos para verificar nada.

---

## Probar

1. `node .IronSyndicate\tools\check-dat.mjs` — antes de nada.
2. Arrancá el juego y abrí `gsis_limiter.txt`.
3. Buscá, en este orden:

```
config leida de ...\gsis_weapons.dat
dado de alta: tipo 61, padre 23, modelId 15066, slot 2, clip 15, damage -1
[15066] LISTO en frame 3: loadState 1 | ...
[60] el modelo de vanilla 347 NO ESTA CARGADO ... Se pide.
[60] modelo de vanilla 347 CARGADO: el arma se ve.
[60] clonado de 23 | modelId pedido 347 / de la tabla 347 | clip 8 | damage -1
```

4. `dado de alta` **sin** un `RECHAZADA` al lado es lo mínimo.
5. Las dos líneas del modelo son las que dicen si el arma **se ve**.
6. Apretá `G`. Deja el arma desnuda, los dos cargadores **vacíos**, el silenciador y
   **100 balas** —dos filas de 50, para que se vea el tope—.
7. En la mochila, apretá **Llenar cargador**. Pasa de `0/8` a `8/8` y las balas bajan.
8. Equipá el cargador en una ranura y apretá `R`: el arma se convierte a la variante
   de su capacidad.

Con el debug no hace falta pasar por la armería —que hoy **no tiene catálogo**:
`getDealerPrice()` devuelve 0 para todo y el carrito queda vacío.

---

## Si algo falla

En `gsis_limiter.txt`:

| línea | qué significa |
|---|---|
| `linea N RECHAZADA: ...` | la fila no se registró. El mensaje dice cuál de las seis reglas falló |
| `el modelo de vanilla N NO ESTA CARGADO ... Se pide.` **sin** `CARGADO` | el modelo no entró: bug del `.asi`, o el `.img` no está |
| `*** NO ESTA LIBRE` | el `modelId` propio ya lo ocupa otra cosa |
| `SE ENTREGA CON EL MODELO DEL PADRE` | el modelo propio no está listo; el `***` de arriba dice por qué |
| `ATENCION: ... Queda en ceros` | el padre no tiene fila de skill y no hay anterior válida |
| `ATENCION: la fila del padre estaba en cero` | el `.dat` se leyó antes de tiempo |

Y en `cleo_redux.log`:

| línea | qué significa |
|---|---|
| `la familia X no tiene variante para (N, sil./pelada)` | falta la fila en `variantes`, o falta el cargador / el silenciador |
| `el motor no acepto el tipo N` | la fila del `.dat` no está, o el `.asi` no la registró. **El cargador no se gasta** |
| `llenarDesdeCaja: no hay balas para mag_X` | la familia no tiene bala en `MUNICION`, o el jugador se quedó sin balas |
| `reconciliar: slot N \| ... tipo A -> B` | el tipo del ped no era el que decían los accesorios, y se corrigió al cargar |
| `desfasada` en la fila de la UI | el estado del mod y el motor no coinciden |

Y por síntoma, en pantalla:

| síntoma | qué falta |
|---|---|
| el item no aparece en la mochila | falta en `ITEMS` |
| aparece pero no se puede equipar | falta `type: "weapon"`, o la fila del `.dat` no existe |
| el arma no cambia de variante | `tipoDe()` devolvió `null`: falta la variante para esa combinación |
| se equipa y no dispara | el padre está fuera de los rangos del parche de `Fire` |
| se equipa, no dispara y es muda | el padre está fuera del rango del sonido |
| se equipa y **no se ve** | el modelo no está cargado. Vanilla: nadie lo pidió. Propio: falta en `g_modelos[]` |
| apunta y **crashea** | modelo propio con `WeaponModels` en 51 |
| tiene el cargador de 8 en vez del que pediste | `clip` de la variante distinto del `cargador` de la fila |
| el cargador lleno no tiene botón para llenar | no hay balas de esa familia, o el cargador está lleno |
| una fila de balas ofrece "Equipar cargador" | la vista no marca `esCargador`: el filtro es `defDeCargador`, no la banda |
| el icono sale en blanco | falta la línea en `WEB_ICONS` |

---

## Lo que este sistema no da

- **La armería no vende.** `getDealerPrice()` devuelve 0 sin `ch.dealer.prices`, así
  que el carrito queda vacío. Un arma nueva se obtiene por save o con la tecla de
  debug.
- **Las balas tampoco tienen camino de entrada al juego.** Existen, se apilan y se
  gastan, y el evento `items:storeAmmo` está listo para un pickup, pero **nadie lo
  llama** salvo el debug.
- **No hay más de una familia en la UI.** El código está preparado —`FAMILIAS` es un
  mapa y `CARGADORES[].familias` es una lista—, pero el botón de montar el
  silenciador elige la **primera** arma equipada sin silenciador.
- **Un cargador por calibre, en la práctica.** `MUNICION[].familias` admite varias
  familias, así que dos familias del mismo calibre comparten caja. Lo que **no** está
  resuelto: un cargador no declara su calibre, así que si una familia declarara
  cargadores de dos calibres habría que decidir cuál bala llena cuál. Hoy `tipoDe()`
  solo ve la **capacidad**.
- **La condición de la variante es un par.** Un tercer tipo de accesorio hace que
  sea una terna, y eso toca `variantes`, `tipoDe()`, la fila del arma y el estado del
  save. Es el cambio más caro del sistema.
- **No hay accesorios con estado.** Un cargador no tiene salud ni calidad; un
  silenciador no tiene munición.
- **No hay reserva.** `clip` es siempre igual a `total`, y eso lo impone
  `modules\weapons\ammo.js` cada frame.
- **No hay asignador de `modelId`.** El número va escrito en la fila y en
  `g_modelos[]`, en dos lugares.
- **Un cargador por capacidad.** El día que haya dos con la misma capacidad para la
  misma familia, la recarga elige el primero de las ranuras y el segundo queda
  esperando.
