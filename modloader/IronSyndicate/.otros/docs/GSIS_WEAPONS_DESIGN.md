# GSIS - Armas: DISEÑO (histórico)

> # HISTÓRICO — y hay que leerlo con una salvedad
>
> Este documento es **arqueología**, y su propio encabezado lo dice. Se agregó una
> capa más el 03/10/2026: el sistema de armas que describe —"variantes, accesorios,
> `resolveWeaponType()`, `WEAPON_VARIANTS`"— **se borró entero**. Después vino un
> modelo de "cada configuración es su propio item", que **también se fue el mismo
> día**. **Hoy hay una familia por item** con el tipo derivado.
>
> O sea: describe **dos** sistemas que ya no están, y el segundo nunca llegó a
> documentarse.
>
> Para lo que hay hoy: [`gsis_WEAPONS.md`](./gsis_WEAPONS.md) y
> [`AGREGAR_ARMAS.md`](./AGREGAR_ARMAS.md).
>
> **Por qué se conserva igual.** El razonamiento de diseño —"por qué el
> `weaponType` es una representación y no la identidad, por qué la capacidad la
> tiene que decir el motor, por qué un id derivado en el save es una bomba"— es la
> parte que todavía sirve, y las mediciones del motor que lo sostienen siguen siendo
> la explicación de por qué el sistema está escrito como está. Lo que **no** se
> conserva es la conclusión: hoy sí hay un tipo derivado, porque lo que se guarda
> son los accesorios y no el tipo.
>
> **Este documento es arqueología, no una especificación.** Describe el sistema de
> armas **antes** del refactor de las fases 0-5 y el razonamiento que llevó al
> modelo de "variantes". Los **nombres** de tabla, de item y de comando no sirven
> para nada.
>
> Para lo que el sistema **hace hoy**: [gsis_WEAPONS.md](./gsis_WEAPONS.md)
> Para **como se comunican las piezas**: [gsis_CONTRATOS.md](./gsis_CONTRATOS.md)
> Para **que se probo contra el motor real**: [gsis_WEAPONS_VERIFICADO.md](./gsis_WEAPONS_VERIFICADO.md)
>
> **Por que se conserva y no se borro.** Dos razones, y las dos son de futuro:
>
> 1. **Las mediciones del §4 son irremplazables.** La base de la tabla de
>    `CWeaponInfo`, su `sizeof`, el reparto de los 80 indices y el desensamblado
>    que confirma la base salieron de una sonda de solo lectura dentro del juego.
>    No estan en ningun SDK, y rehacerlas cuesta una sesion.
> 2. **El descarte esta documentado aca y no en un commit.** Por que no se
>    escribio `m_nAmmoClip`, por que el camino del `.ASI` que agranda la tabla
>    quedo archivado, y por que la alternativa elegida evita depender de
>    fastman92 Limit Adjuster. Sin este documento, quien se pregunte "por que no
>    agrandan la tabla?" no tiene donde leer la respuesta.
>
> **Al leerlo, una advertencia:** el sistema descrito aca **ya no existe**. Los
> nombres de archivo (`gsis_Ballistic.js` (borrado), `gsis_Items`), los campos del save (`magId`,
> `hasMag`, `variantWeaponType`, `weaponId`) y el comportamiento (un cargador que
> no le cambia la capacidad a nadie) **estan todos completos**. Lo que sobrevive es
> el *por que*, no el *que*.

---

---

## 1. El problema que ordena todo

GTA SA tiene **una sola capacidad por tipo de arma**: `CWeaponInfo::m_nAmmoClip`.
No hay "variantes de cargador" en el motor. Un cargador de 33 balas en una 9mm de
17 **no existe** en el motor, y meterlo obliga a parchar `m_nAmmoClip` en runtime
— que es global, afecta a los NPCs, no sobrevive un save/load, y obliga a que el
mod lleve su propio registro de que cargador esta montado.

La salida no es parchar mas fuerte: es **dejar de tratar la variante como un
cargador y tratarla como un arma**.

La idea: un `.ASI` en C++ agranda `CWeaponInfo::aWeaponInfo` (que tiene lugar
cerrado para 70 armas, IDs 0-69) redirigiendo el puntero a un bloque de RAM
propio, y registra ahi un tipo nuevo —por ejemplo el 70 para una "9mm con
cargador extendido"— con su `m_nSlot` (2 = pistolas), su `m_nModelId1` (un `.dff`
registrado aparte en `CModelInfo::ms_modelInfoPtrs`) y su `m_nAmmoAmount` (33).
Desde ahi **el motor ya la trata como una pistola nativa**: si el jugador la
agarra, suelta la que tenia y la acomoda en el slot 2 sola, y desde CLEO se
maneja con un `GiveWeapon(ped, 70, balas)` de lo mas normal.

Ese camino es nativo y por eso es el bueno. Este documento es la preparacion
para que, cuando el `.ASI` exista, el mod no tenga que reescribirse: que ya sepa
**que es una variante, quien es dueño de su capacidad, y que hacer con un arma
que todavia no conoce.**

Lo que el `.ASI` **no** es: no se va a escribir todavia. Este documento y el
refactor son el trabajo previo.

---

---

## 2. COMO ESTABA HOY (ya no — ver §2.4)

> Las subsecciones 2.1 a 2.5 describen el sistema que se eliminó. Se dejan porque
> **el razonamiento sigue siendo válido** —el problema de §1 es real, la
> colisión del `weaponId 22` es real, el bug de §2.5 es real— y porque es la
> explicación de por qué el sistema era como era. Lo que ya no describe el código
> es cómo escribir un cargador.

### 2.1 La tabla `WEAPON_DATA`

`data/gsis_weapon_data.js` es la fuente unica. Tiene 36 entradas: **19 armas**
(18 armas + `body_armor`) y **17 cargadores**. Una entrada de arma:

```js
{
    itemId: "ak47",        // clave del catalogo de ITEMS; estable para los saves
    magId: "mag_ak47",     // que cargador consume
    name: "AK-47",         // nombre HUD
    weaponId: 30,          // tipo de arma del juego (22-38)
    modelId: 355,          // modelo 3D (346-373)
    slot: 5,               // indice en CPed::m_aWeapons
    clipSize: 30,          // capacidad del clip == capacidad del cargador
    damage: 25, fireRate: 20, range: 30, accuracy: 25,
    category: "Fusiles de asalto",
    price: 950, weight: 3.5, isLong: false, ammoType: "9mm Parabellum"
}
```

Una entrada de cargador es mucho mas pobre: no tiene `weaponId`, ni `modelId`, ni
`slot`, ni `clipSize`.

```js
{
    itemId: "mag_ak47",
    magId: null, weaponId: null, slot: null,     // las "tres nulidades"
    category: "Cargadores",
    realWorldName: "AK-47 steel 5.45x39 30 rds",
    price: 300
}
```

Las **tres nulidades** no son descuido: son lo que mantiene los cargadores fuera
de todas las rutas de arma. Sin `weaponId` no matchean las busquedas por
`weaponId` del juego; sin `slot` `_weaponDefByItemId` los rechaza como no
equipables; sin `magId` la relacion va al reves (es el ARMA la que declara que
cargador usa).

### 2.2 La regla de casa: la capacidad sale del nombre

Un cargador **no tiene capacidad propia**. `getClipSizeByItemId("mag_ak47")`
hace strip del prefijo `mag_`, busca `ak47` en la tabla, y lee su `clipSize`.
No es que falte el dato: es una decision deliberada, escrita en el propio
codigo (`gsis_weapon_data.js`, bloque de cargadores):

> la capacidad de un cargador no es una propiedad del cargador, es de la boca
> del arma que alimenta. Copiarla aca crearia un segundo valor que puede divergir
> del arma sin que nada avise.

La regla es buena **para mientras la capacidad es una sola por arma**. Justamente
es lo que hay que relajar cuando aparecen variantes, y por eso el cambio
importa: se toca una regla pensada, no un accidente.

### 2.3 La colision del `weaponId 22`

`9mm` y `pistol_assembled` comparten `weaponId: 22` y `modelId: 346`. Hoy eso
"funciona" porque **las busquedas por `weaponId` toman el primer match**, y
`9mm` esta primero en el array. Si alguien reordena la tabla, el canonico del
22 cambia en silencio. No hay deteccion: el segundo match simplemente nunca se
ve.

No es lo unico. Hay **cuatro** busquedas independientes por `weaponId` en el
codigo, cada una con su propio "primer match":

| Donde | Que busca |
|---|---|
| `getMagIdByWeaponId` (`gsis_weapon_data.js`) | el cargador del arma |
| `getModelIdByWeaponId` (`gsis_weapon_data.js`) | el modelo del arma |
| `_itemIdByWeaponId` (`modules/gsis_Ballistic.js`) | el itemId de un `weaponId` |
| `_weaponDefByItemId` (`modules/gsis_Ballistic.js`) | la ficha, filtrando `!wd.slot` |

Ninguna consulta si el `weaponId` es valido, ni de que rango es, ni detecta
duplicados. Un `weaponId` 70+ que no este en la tabla cae en "fuera de catalogo"
en las cuatro a la vez, y cada una reacciona distinto.

### 2.4 La capacidad la impose el mod, no el motor
### 2.4 La capacidad la imponia el mod, no el motor  (ELIMINADO — ver la [§0 del spec](./gsis_WEAPONS.md))

Al iniciar, `syncClipSizes()` recorria la tabla y **parcheaba el motor**: escribia
`CWeaponInfo::m_nAmmoClip` (offset `0x20`) para cada arma y para los cuatro
niveles de skill. O sea: el mod pisaba la `CWeaponInfo` del juego con su
`clipSize`. La tabla era la verdad; el motor era lo que se acomodaba.

Esto era exactamente al reves de lo que hace el `.asi`, y al reves de lo que hace
hoy: **la `CWeaponInfo` es la verdad y el mod la lee** (`_engineCapacity`).


### 2.5 Que pasa hoy con un arma que el mod no conoce

Este es el punto de peligro. En `modules/gsis_Ballistic.js`, el reconciliador
(que corre cada frame) recorre los slots del ped y, si el slot tiene un arma cuyo
`weaponId` no esta en la tabla, **borra la entrada del save**:

```js
var presentId = _itemIdByWeaponId(type);
if (!presentId) {
    if (entry) { delete data.equipped[i]; changed = true; }   // <-- se come el arma
    continue;
}
```

Es decir: un `.ASI` que registre correctamente una 9mm de 33 balas se la pierde
del save en el **primer frame**, sin error y sin log. Todo lo demas del refactor
es decorativo si esto no se arregla.

---


---

## 3. Las bases del sistema nuevo

Cuatro ideas. Son la base de todo lo demas.

### 3.1 La autoridad se declara, no se asume

Hoy la capacidad la tiene el mod y el modelo tambien, siempre, sin que el dato
lo diga. El sistema nuevo hace que **cada entrada diga de donde sale cada dato**:

| Campo | Valores | Significado |
|---|---|---|
| `clipSource` | `"catalog"` | la capacidad la impone el mod (parchea `CWeaponInfo`) |
| | `"engine"` | la capacidad la tiene el motor; el mod la lee |
| `capacity` | número | la capacidad la declara la entrada misma, en vez de derivarla |
| `modelSource` | `"native"` | `modelId` vanilla (346-373) |
| | `"special"` | `modelId` del rango custom reservado a armas |

`capacity` es lo que hace posible una variante, y esta **acotado a proposito**: los
17 cargadores base no la declaran y siguen derivando la suya del arma (§7). La
relajacion de la regla de casa es solo para las entradas que dicen que la suya es
propia.

El techo de weaponId nativo (`WEAPON_ID_NATIVE_MAX = 69`) y el rango de modelos de
arma (`SPECIAL_MODELS.WEAPON_RANGE = 15025-15099`) son **numeros acordados con el
plugin**, asi que viven en el `Config` y se importan. Dos copias del mismo numero
en dos archivos es la forma de que un dia una diga 69 y la otra 70.

El rango de modelos de armas esta **apartado del de personajes** (15000-15024) a
proposito: un ID de modelo es un puntero a un modelo, no una etiqueta. Si una
variante de arma y un ped tomaran el mismo ID, el segundo que se cargara pisa al
primero. `_validateWeaponModels()` avisa al init si un `modelSource: "special"`
cae en el rango equivocado o se queda sin `modelId`, porque un modelo faltante no
da error: **da un arma invisible**, que es de las cosas que se descubren tarde.

Con eso un arma y un cargador pueden convivir en el mismo catalogo sin importar
de donde vino cada capacidad. Y el caso raro (un arma registrada por el `.ASI`
que el mod todavia no conoce) deja de ser un caso raro: es un `clipSource:
"engine"` mas.

### 3.2 El registro es un indice, no una busqueda

`WEAPON_DATA` pasa a construir indices al cargarse: `byItemId` y `byWeaponId`.
Las cuatro busquedas del punto 2.3 pasan a ser acceso a indice, con una sola
fuente de verdad sobre que itemId es el canonico de cada `weaponId`.

Un `weaponId` duplicado deja de ser algo que se resuelve "por suerte" y pasa a
ser algo que se **declara** (alias) o se **rechaza** con un log. Un `weaponId`
70+ resuelve igual que uno nativo.

### 3.3 "Fuera de catalogo" deja de ser destructivo

El reconciliador deja de borrar. Si el slot tiene un `weaponId` que el mod no
conoce, la entrada se marca:

```js
equipped[slot] = { foreign: { weaponId, slot } }   // conservada, no borrada
```

Una entrada `foreign` no se dibuja como item del mod, no se adopta al inventario
y no se pierde. El dia que la tabla tenga la variante con ese `weaponId`, la
entrada se **promueve** sola a una entrada normal. Ese es el puente entre "el
`.ASI` ya registro el arma" y "el mod todavia no la conoce": en el medio, que es
donde se vive, no se pierde nada.

### 3.4 Una variante es un arma, no un cargador

Hoy el tipo de un item es `material` | `weapon` | `magazine`, y que es cargador
lo define la categoria (`Cargadores`) o el prefijo `mag_`. El sistema nuevo
agrega un tipo `accessory` y un campo `kind` en la tabla, que reemplaza la
convencion de las tres nulidades:

| `kind` | Que es | Ejemplo |
|---|---|---|
| `base` | un arma normal del catalogo | `9mm` |
| `variant` | un arma que existe por combinacion de un base + un accesorio | `9mm_ext` |
| `accessory` | algo que, aplicado a un arma, la convierte en una variant | `mag_9mm_ext`, `silenciador` |
| `magazine` | un cargador de belt, que no cambia el arma | `mag_ak47` |

La pieza que hace el trabajo es una resolucion:

```js
resolveVariant("9mm", "mag_9mm_ext")   // -> la entrada de la variant
```

Es decir: aplicar el accesorio devuelve **otra entrada de arma**, con otro
`weaponId`, otro modelo y otra capacidad. Eso es la transformacion, escrita como
dato y no como caso especial.

**El puente con el `.ASI`:** una `variant` declara su `weaponId` en `null`
mientras el motor no la tenga. Con `null`, el sistema usa el comportamiento de
hoy (arma base + capacidad parcheada). Cuando el `.ASI` registre el tipo 70, la
misma entrada se completa sola. Ese es el motivo de que la fase 5 se pueda
escribir antes de que exista el `.ASI`.

Que un cargador sea `magazine` o `accessory` depende de si cambia el arma o solo
su precio: el cargador del AK de 30 balas es `magazine` (se cambia por precio y
valor, no se ve distinto); el tambor del AK es `accessory` (cambia capacidad y,
con el `.ASI`, se ve distinto).

### 3.5 El manifiesto es la fuente unica (Fase 7)

Si el `.ASI` tiene las variantes escritas en C++, agregar una Glock despues
significa recompilar y redistribuir el binario. En cambio, un manifiesto
(`data/weapon_variants.json`) del que leen las dos mitades:

```json
{ "id": "9mm_ext", "weaponId": 70, "modelId": 15025, "slot": 2, "clip": 33,
  "damage": 25, "fireRate": 20, "range": 30, "accuracy": 25, "ammoType": "9mm Parabellum" }
```

El `.ASI` lo lee al cargar y registra los tipos; la tabla del mod lo lee para sus
entradas `variant`. Como las dos mitades leen el mismo archivo, `itemId ↔
weaponId ↔ modelId` no puede quedar desincronizado entre el C++ y el JS.

---


---

## 4. Los hechos del motor (MEDIDOS, no copiados)

Lo que hay que tener a mano para que el `.ASI` y el mod hablen el mismo idioma.
Todo lo de esta seccion se **midio con una sonda de solo lectura** dentro del
juego, no se copio de ningun SDK. La sonda estaba en
`modloader\IronSyndicate\asi\asiprobe.cpp`.

> **El volcado crudo se perdio.** Existio como
> `research\gsis_WEAPONS_tabla_medida.txt` (299 lineas) y se borro sin querer
> durante el refactor de la documentacion. **No hay copia ni esta en git**, asi que
> no se puede recuperar.
>
> **Lo que se perdio es el volcado, no las conclusiones.** Todo lo que de el se
> dedujo esta transcripto en las tablas de esta seccion, que es lo que importa:
> la base, el `sizeof`, el reparto de los 80 indices, los offsets, el
> desensamblado y la distribucion de los 20 tipos que el `.asi` termina
> registrando. Rehacer el volcado crudo es una sesion de juego; rehacer estas
> tablas no hace falta.

> Una correccion que vale la pena dejar escrita: la primera conclusion sacada de
> estos numeros fue que las direcciones del plugin-sdk estaban malas. **Estaba
> mal la conclusion, no las direcciones.** La tabla se puebla cuando se *carga
> una partida*; los lanzamientos sin partida leen ceros de verdad, y una tabla de
> ceros parece "estas mirando cualquier cosa". La sonda ahora espera a que la 9mm
> traiga su cargador y su modelo antes de volcar, y con eso 20/20 tipos salen
> correctos.

### La tabla

| Dato | Valor |
|---|---|
| Base | `0xC8AAB8` — **array estatico en `.bss`, no un puntero** |
| `sizeof(CWeaponInfo)` | `0x70` (112 bytes) |
| Entradas | **80, y las 80 tienen datos** |
| `m_nModelId` | `+0x0C` |
| `m_nSlot` | `+0x14` |
| `m_nAmmoClip` | `+0x20` (el mismo offset que `_CLIP_OFF` del mod) |
| `GetWeaponInfo` | `0x743C60`, cdecl |

**No se puede redirigir.** Es un array estatico: no hay puntero que apuntar a
otro lado. Y **no hay ni un hueco libre adentro**: los 80 indices tienen datos, e
incluso `WEAPONTYPE_UNUSED` (47) esta ocupado — es la fila de skill 0 de la
9mm.

### El reparto de los 80 indices

| Indices | Que hay |
|---|---|
| 0-21 | tipos 0-21, sin skill |
| 22-32 | **las 11 armas con skill**, fila de skill 1 |
| 33-46 | tipos 33-46, sin skill |
| 47-57 | las 11 armas con skill, fila de skill 0 |
| 58-68 | las 11 armas con skill, fila de skill 2 |
| 69-79 | las 11 armas con skill, fila de skill 3 |

Las 11 con skill son PISTOL, PISTOL_SILENCED, DESERT_EAGLE, SHOTGUN, SAWNOFF,
SPAS12, MICRO_UZI, MP5, AK47, M4 y TEC9 — que es exactamente el
`WEAPONINFO_NUM_WEAPONS_WITH_SKILLS = 11` del SDK, confirmado por medicion.

Ojo con una trampa que la medicion desarma: si se asume la formula
`indice = tipo + offset[skill]`, los pares **(tipo, skill) colisionan** (el tipo
22 en skill 2 cae en el mismo indice que el tipo 33 en skill 0), y la tabla
parece una copia de si misma. Los indices de skill no son un offset del tipo: son
bloques aparte de 11.

### Que implica para el `.ASI`

`GetWeaponInfo` **no valida el rango**: pedido el tipo 95 devuelve el indice 142
sin quejarse. Pero eso no es un hueco: mas alla del indice 79 ya no hay tabla,
hay otra data del juego (los cargadores que salen ahi son 14564, 24642, 30724...).
Escribir ahi corromperia memoria que no es nuestra.

Asi que de las dos opciones que planteaba el plan queda **una sola**:

- ~~escribir en un hueco existente~~ — no hay, medido.
- **enganchar `GetWeaponInfo` (0x743C60)**: para tipos < 48 delegar al original,
  y para tipos >= 48 devolver una `CWeaponInfo` propia. La variante se clona de
  un arma base (asi `m_nAnimToPlay`, `m_nFlags` y la precision quedan bien sin
  entender cada campo) y despues se le cambian `m_nAmmoClip`, `m_nModelId` y
  `m_nSlot`.

El enganche se hace con el `safetyhook` que ya trae el plugin-sdk, en lugar de un
detour a mano.

### Sobre el tipo de arma

El tipo de arma es el **enum del ejecutable**, no el indice de linea del
`weapon.dat` — por eso los `weaponId` del mod (22 = PISTOL … 38 = MINIGUN) son
correctos y el `weapon.dat` de la raiz *parece* no coincidir. El enum real de
armas termina en `WEAPONTYPE_ARMOUR = 0x30` (48); de la 49 en adelante son
pseudo-tipos de "formas de morir". Los tipos que un `.ASI` puede dar de alta
empiezan, entonces, en **49**.

### El enganche, y por que se puede hacer

`GetWeaponInfo` se leyo de memoria con el juego corriendo y se decodifico. No se
puede leer del `.exe` en disco porque **gta_sa.exe esta empaquetado con Hoodlum**
(seccion `.HOODLUM` y `.text` duplicada): la `.text` real se descomprime al
arrancar, y leer el archivo da datos donde deberia haber codigo.

```
0x743C60:  8A 4C 24 08       mov cl, [esp+8]      ; skill
           84 C9             test cl, cl
           E9 5E 39 CC FF    jmp <lejos>          ; skill == 0 -> otra ruta
           ...
           83 C0 19          add eax, 0x19        ; +25
           0F BF C0          movsx eax, ax
           6B C0 70          imul eax, 0x70       ; * 0x70
           05 B8 AA C8 00 00 add eax, 0xC8AAB8    ; <-- LA BASE
           C3                ret
```

Los ultimos `add eax, 0xC8AAB8` son la **confirmacion de la base por lectura de
codigo**: `0xC8AAB8 + (22+25) x 0x70 = 0xC8BF48`, exactamente la direccion que
devolvio el mod para la 9mm. Antes de esto la base estaba medida por correlacion
de direcciones; ahora esta escrita en el binario.

Los 6 primeros bytes son **dos instrucciones completas** (`8A 4C 24 08` y `84 C9`).
Eso define el tamano del trampolin: copiar 5 bytes partiria la instruccion de 4
bytes por la mitad, y ahi el juego arranca usando un registro a medio escrito.

El enganche queda asi:

| Tipo pedido | Que hace |
|---|---|
| 0 a 48 | sigue yendo al juego, byte por byte igual que antes |
| 49 (y los que se agreguen) | devuelve una `CWeaponInfo` propia, clonada de un arma real |

Que sea un no-op para todo lo que el juego ya conoce es lo que lo hace seguro: lo
unico que cambia de verdad es la respuesta para un tipo que nadie mas pide.

El clon **no** se arma escribiendo la aritmetica de indices a mano, sino llamando
al `GetWeaponInfo` original para pedir el arma base. La tabla tiene cuatro filas de
skill que se superponen entre si —pedir el tipo 22 en skill 2 cae en el mismo
indice que el tipo 33 en skill 0—, y reproducir eso a mano seria volver a meter el
error del que salio todo esto. Ademas el clon es **perezoso**: ocurre en el primer
pedido del tipo 49, cuando la tabla ya esta cargada. Clonarla al arrancar
clonaria una tabla de ceros.

### Los modelos

Un modelo se registra en la tabla del motor
(`CModelInfo::ms_modelInfoPtrs`) apuntando a un `.dff`/`.txd`. El mod ya tiene
esta pieza para **personajes**: `SPECIAL_MODELS` (`core/gsis_Config.js`) con el
rango **15000-15024** y carga por `LOAD_SPECIAL_CHARACTER_FOR_ID` +
`GET_MODEL_DOESNT_EXIST_IN_RANGE`. Los modelos de arma custom usan un rango
**aparte** (`SPECIAL_MODELS.WEAPON_RANGE`, 15025-15099) por el motivo del §3.1.

La diferencia de fondo entre los dos casos: el modelo de un personaje lo carga el
mod (`LOAD_SPECIAL_CHARACTER_FOR_ID` lo pide por nombre), y el de una variante lo
carga **el plugin**, que ya lo registro en `CModelInfo` antes de que el mod lo
mire. Por eso `_ensureWeaponModel` no pide con `REQUEST_MODEL` un modelo
`"special"` — no es lo que lo trae — sino que verifica con `HAS_MODEL_LOADED` que
este de verdad, y avisa con el `modelId` si no.

**Un archivo que el mod hoy no toca.** El mod **no** sobreescribe `data/weapon.dat`
— usa los tipos nativos 22-38 y los modelos nativos declarados en JS. Esa es una
decision a favor del camino del `.ASI`: no hay indices que corran, ni un archivo
global que editar.

---


---

## 6. El plan por fases

Cada fase se puede verificar sola contra `check_weapons.mjs` y el resto de los
checks ([gsis_TESTING.md](./gsis_TESTING.md) §2). Son **las dos ultimas las que
importan** de verdad: las demas son estructura.

| Fase | Que hace | Sin esto |
|---|---|---|
| **0** | Congela el comportamiento actual con tests | Un cambio de datos silencioso |
| **1** | Registro unificado: indices `byItemId`/`byWeaponId`, `getWeaponByWeaponId`, las 4 busquedas unificadas | Un `weaponId` 70+ resuelve "a ojo" |
| **1b** | La colision del 22 se declara alias, no accidente | Reordenar la tabla rompe el canonico en silencio |
| **2** | `foreign`: el arma desconocida se conserva | **El `.ASI` pierde el arma del save en el primer frame** |
| **3** | `clipSource`; la capacidad sale del motor cuando es suya | El mod pisa la `CWeaponInfo` del `.ASI` |
| **4** | `modelSource`; rango de modelos custom para armas | No hay como mostrar un `.dff` de variante |
| **5** | `kind` + `accessory` + `resolveVariant` (el nucleo de §3.4) | La transformacion no existe como concepto |
| **6** | Los quirk hardcodeados pasan a ser datos | Un arma nueva rompe en un sitio raro |
| **7** | El manifiesto como fuente unica | Cada variante nueva = recompilar |

Las cinco primeras van aplicadas y verificadas. A partir de la 5 el trabajo es de
modelo de datos: que una variante sea un concepto y no un caso especial.

Los "quirk" de la 6, para tenerlos a mano: `_NO_ANIM = [37, 38]` (weaponIds que
no tienen anim de recarga, en `modules/gsis_Ballistic.js`) es una lista
hardcodeada; el filtro de "equipable" es `!wd.slot` (asi que un `slot: 0` hace
un arma inequipable sin avisar); y `0x743D70` es la direccion vanilla de
`CWeaponInfo::GetWeaponReloadTime`, llamada en cada recarga. Ese ultimo es un
`thiscall` al binario del juego sobre el puntero `CWeaponInfo*`, asi que
funciona con el bloque relocalizado del `.ASI`, pero es memoria ajena y necesita
guarda.

### Lo que el sistema nuevo NO da todavia

Sin el `.ASI` escrito, una `variant` cae al fallback: se **siente** como 33
balas (la capacidad la parchea el mod) pero **se ve** como una 9mm normal. Los
modelos propios llegan con el `.ASI`. Lo que ganan las fases 1-7 es que cuando el
`.ASI` llegue, no haya un solo hardcodeo que lo rompa.

---

## 7. Detalle fino: por que la capacidad de un cargador no es suya

Vale la pena dejarlo escrito porque es el punto que mas se va a discutir.

La regla de casa dice que la capacidad de un cargador sale de su arma
(§2.2), y es correcta **mientras la capacidad es una sola por arma**. En el
momento en que hay un tambor de 75 en un AK de 30, la capacidad **si** es
propiedad del cargador: es lo unico que distingue un cargador de otro, y es lo
que el jugador esta comprando. Dejarlo en el arma seria un dato incompleto, no
un dato duplicado.

La regla no se borra: se **acota**. Los 17 cargadores base siguen derivando
(capacidad = la del arma), porque para ellos la capacidad de verdad si es la del
arma. Solo los `accessory`/`variant` declaran la suya. Asi el caso comun sigue
teniendo una sola fuente, y el caso nuevo tiene la que le corresponde.

Esto tambien es lo que hace que la comprobacion de que un cargador lleno no
supere el precio de su arma siga teniendo sentido con capacidad variable: el
premium de un tambor se paga una vez, no por cada bala que meta despues.

---

## 8. Epilogo: por que el camino del `.ASI` quedo archivado

Se llego a construir `gsisArmory.asi`, que **funciona**: engancha
`GetWeaponInfo` (0x743C60) con trampolin propio, registra el tipo 100 y le
sirve una `CWeaponInfo` clonada de la 9mm con 33 balas. El arma se clona y se
equipa. Todo eso quedo andando.

Falla en lo que viene despues, y no es un bug del enganche:

| Sintoma | Causa |
|---|---|
| No apunta | La tabla de punteria, indexada por tipo, no conoce el 100 |
| Al guardar/cargar vuelve a ser 9mm | El guardado del juego no preserva el tipo 100 |
| Inventario deja de responder | Consecuencia de tener un tipo a medio conocer |

O sea: **servir una `CWeaponInfo` nueva es una de las tablas, no todas.** El
juego indexa por tipo de arma en varias mas — punteria, guardado, municion, HUD —
yarlas todas a mano en C++ sale caro.

### El limite lo resuelve fastman92 Limit Adjuster, pero choca con CLEO+

La conclusion que quedo escrita aca era "hay que hacer Address scouting y
darse un crash por cada tabla que se encuentre tarde". **Eso esta obsoleto.**
La comunidad lo resolvio por la via de la tabla:

- El **Open Limit Adjuster** de ThirteenAg **no sirve**. Se chequeo su codigo:
  `WeaponModels` (`src/limits/ModelInfo/WeaponModels.cpp`) agranda el *pool de
  modelos IDE* (`CWeaponModelInfo`, `0xB1E158`, 51 por defecto, grower
  `0x5B3FE6`). No toca `aWeaponInfo`.
- **fastman92 Limit Adjuster si.** No agranda la tabla en memoria: **reemplaza el
  loader** de `data\weapon.dat` y agrega `data\gtasa_weapon_config.dat`, donde
  cada tipo lleva su **ID explicito** y su **arma padre** (de la que hereda
  animacion, sonido y zoom). Asi construye todas las tablas de una, que es
  justamente lo que al `.ASI` le faltaba.

**Se instalo y se intento. Rompio el arranque del juego.** FLA abre su log
(`fastman92limitAdjuster.log`), se queda en 0 bytes, `data\gtasa_weapon_config.dat`
nunca se genera y ModLoader registra una salida limpia. El conflicto es con
**CLEO+**, que esta activo como `cleo\cleo_plugins\CLEO+.cleo`.

El codigo del mod **no depende de CLEO+**: sus 4 menciones en `cleo\IronSyndicate\`
y `UI\` son comentarios que describen opcodes (`0E83`, `0E84`, `0E9A`), ninguna es
una llamada, y las clases `Weapon` / `WeaponInfo` que usa son de cleo_redux. Aun
asi, **CLEO+ se conserva**: es parte del entorno de trabajo de la maquina, y la
decision de sacrificarlo no es del mod.

Los archivos de FLA quedaron apartados en `%TEMP%\opencode\fla_aplazado\`. Si
alguna vez hay que reabrir el tema, van alli con el `.ini` ya configurado.
Detalle en [gsis_REQUISITOS.md](./gsis_REQUISITOS.md) §3.

Con `number of type IDs = 120` habrian quedado libres los tipos **80 a 119**: los
0 a 79 estan **todos ocupados**, medido sobre el ejecutable, sin huecos internos
donde colar un tipo. Dato util para cualquier intento futuro.

### Estado de las rutas

| Ruta | Estado |
|---|---|
| **Vanilla + `.asi` de variantes** | **Vigente.** La capacidad la tiene `weapon.dat`; el mod no la toca (§0) |
| **B — cargadores con capacidad** | **Eliminada.** Era lo que rompía: parcheo global + `magId` en el save |
| **A — tabla (FLA)** | Descartada: incompatible con CLEO+, que se conserva |
| **`.ASI` a mano** | Vigente, pero solo como `gsisWeaponLimiter.asi`: 2 tipos (60, 61) |

Lo que se conserva de la ruta B es la **economía**: los cargadores siguen siendo
items de inventario con precio, aparecen en el armero y tienen valor de mercado.
Lo que se elimina es el **formateo**: `magId`, `hasMag`, `capacity`, el swap en
`R` y el parcheo de `m_nAmmoClip`. Un cargador pasó de "esto le cambia el clip al
arma" a "esto son X balas de reserva y cuesta $Y".

La capacidad por tipo de arma **no se perdió**: es la de `weapon.dat`, y el
`.asi` ya da de alta dos tipos propios (60 y 61) con la suya en su tabla. Si
alguna vez se destraba el límite de tipos, la capacidad variable se engancha
declarando una fila más en `gsis_weapons.dat` y una más en `WEAPON_VARIANTS`, sin
reescribir el catálogo ni tocar una línea de memoria del juego.

El `.asi` quedo en `C:\Dev\gsis-armory\` (fuente) y `C:\Dev\gsis-armory-build\`
(tres compilados: el que crasheaba por la aritmetica del salto, el del tipo 49 que
usurpaba `RAMMEDBYCAR`, y el del tipo 100 que clonaba bien). Sirven como base si
alguna vez se ataca la parte dura.

### Dos cosas que costaron sangre, para que no se repitan

1. **El `rel32` de un `E9` es relativo a la FIN de la instruccion** (`sitio + 5`),
   no a `sitio`. La primera version hacia `destino - (sitio + 5) - 4` y el
   gancho saltaba 4 bytes antes de la funcion, en basura: el juego se caia en la
   primera llamada a `GetWeaponInfo`. Ahora la cuenta vive aislada en `PonerJmp` y
   **se verifica leyendo los bytes de vuelta antes de parchar nada**.

2. **Los tipos 49 a 58 del enum son pseudo-tipos de "forma de morir"**
   (atropellado, pisado, explosion, ahogado, caida) y el juego los consulta de
   verdad. Ocupar el 49 parece libre porque el enum de armas "termina en 48", y
   no lo es: con una variante ahi, la primera vez que el jugador se atropella el
   motor recibe una pistola donde esperaba la del atropellamiento. Un crash
   diferido, que es el peor tipo. El `.asi` ahora loguea que tipos pide el juego,
   y resulta que pide 0 a 79 y ninguno mas.

---

## Nota de cierre: lo que se perdio en el refactor

**`research\gsis_WEAPONS_tabla_medida.txt` (299 lineas) se borro sin querer**
durante la reescritura de la documentacion, y no era un archivo de git, asi que
**no hay forma de recuperarlo**. Se decidio no reconstruirlo: sus conclusiones ya
estan transcritas en el §4, que es lo que se usa.

**Lo que NO se perdio, y era lo importante:**

- La base `0xC8AAB8` y su confirmacion por lectura de codigo.
- `sizeof(CWeaponInfo) = 0x70` y los tres offsets (`+0x0C`, `+0x14`, `+0x20`).
- El reparto de los 80 indices y la trampa de los bloques de skill.
- Que la tabla es un array estatico sin huecos, y por que eso descarta redirigirla.
- Que `GetWeaponInfo` no valida rango y que escribir pastado el 79 corrompe memoria
  ajena.
- Que el 22 de vanilla trae 17 balas y por eso la Colt de GSIS necesita el 63.

**Lo unico que se perdio de verdad** es el volcado fila por fila de los 80 tipos.
Si alguna vez hace falta volver a medir, la sonda hay que reescribirla; la
conclusion no hay que redescubrirla.

---

### Como se pierde un archivo asi, y por que quedo sin versionar

El volcado estaba **generado por una sonda de lectura**, no editado a mano. Un
archivo generado que no se versiona parece una decision de higiene y no lo es:
es la unica copia de una medicion que no se puede repetir sin el juego delante. Si
esta medicion llegara a importar de nuevo, hay que regenerarla con una sonda nueva
y comparar contra estas tablas antes de tocar el `.asi`.