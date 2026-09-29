# Agregar un arma al mod

Guía práctica. Para el detalle de cómo funciona por adentro, ver
`gsis_WEAPON_LIMITER.md` (fuente del `.asi`, en el repo).

Un arma nueva son **cuatro registros en tres archivos** más un ícono. El
trabajo real es que los cuatro tengan el mismo número.

---

## Antes de nada: elegí el tipo y el padre

**Tipo**: un número en **60-79**, declarado en
`cleo\IronSyndicate\core\gsis_Config.js` como `PLUGIN_WEAPON_RANGE`.

Ese rango está porque:

- `0-46` son las armas reales de vanilla
- `47` libre, `48` ARMOUR
- **`49-59` son pseudo-tipos de muerte** (atropellado, ahogado, explosión) que el
  motor consulta de verdad. No se tocan nunca.
- `60-69` los reserva FLA pero vanilla no los usa
- `70+` los usa el mod para armas de plugin que todavía no conoce

**Padre**: un tipo real de vanilla, y **debe ser 22-32** si querés que el arma
tenga skills. Son las 11 armas con cuatro filas de skill (pistola, subfusil,
ametralladora, fusil). Con un padre fuera de ese rango el arma no sube de skill
nunca: `GetSkillStatIndex` devuelve `-1`.

**El padre decide casi todo.** El arma nueva no tiene animación, ni sonido, ni
mira propias: hereda las del padre. Elegí el padre por la **clase de arma**, no
por lo que se parezca:

| querés… | padre | tipo |
|---|---|---|
| pistola semiautomática | PISTOL | 22 |
| pistola con silenciador | PISTOL_SILENCED | 23 |
| revolver | DESERT_EAGLE | 24 |
| subfusil | MICRO_UZI | 28 |
| escopeta | SHOTGUN | 25 |

---

## Paso 1 — `gsis_weapons.dat`

`modloader\IronSyndicate\gsis_weapons.dat`. Es el lado del `.asi`.

```
<tipo> <padre> <modelId> <slot> <cargador> <damage>
60 22 346 2 30 -1
```

| campo | qué es |
|---|---|
| `tipo` | el weapon type nuevo (60-79) |
| `padre` | tipo vanilla del que se clona |
| `modelId` | id de modelo de arma. `346` = pistola. Un id inexistente no dibuja nada pero no rompe |
| `slot` | 1 melee, 2 pistola, 3 escopeta, 4 subfusil, 5 MG, 6 fusil, 7 pesado, 8 lanzado, 9 especial |
| `cargador` | balas por cargador. **-1 = hereda del padre** |
| `damage` | -1 = hereda. **Un `0` significa cero daño, no "no tocar"** |

El archivo se relee en cada arranque. Comentar con `#`.

> El `.asi` busca primero en la raíz del juego y después en
> `modloader\IronSyndicate\`. Si tenés el `.dat` en otro lado, no lo va a ver.

## Paso 2 — `ITEMS`, el arma

`cleo\IronSyndicate\data\gsis_item_data.js`, en la sección de armas.

```js
"gsis_pistol":   { name: "Pistola GSIS", weight: 1.5, type: "weapon" },
```

`itemId` es la clave: es lo que se usa en el `mag_` de abajo, y lo que se
guarda en los saves. **No lo cambies una vez que haya saves.**

## Paso 3 — `WEAPON_DATA`, el arma

Mismo archivo... no: `cleo\IronSyndicate\data\gsis_weapon_data.js`, al principio
de `WEAPON_DATA`.

```js
{
    itemId: "gsis_pistol",
    magIds: ["mag_gsis_pistol"],
    magId: "mag_gsis_pistol",
    name: "Pistola GSIS",
    weaponId: 60,
    modelId: 346,
    slot: 2,
    clipSize: 30,          // ← el número tiene que coincidir con `cargador` del .dat
    damage: 25,
    fireRate: 20,
    range: 30,
    reloadTime: null,
    accuracy: 25,
    ammoType: "9mm Parabellum",
    category: "Pistolas",
    realWorldName: "Colt M1911A1",
    weight: 1.5,
    isLong: false,
    price: 550
}
```

`clipSize` y `cargador` del paso 1 **tienen que ser el mismo número**. El
`.asi` lo escribe en `m_nAmmoClip` de la fila; el mod lo lee del catálogo y
monta un cargador de ese tamaño. Si divergen, el mod monta un cargador de un
tamaño y el engine recorta al otro.

No pongas `clipSource`. El default es `CLIP_SOURCE_CATALOG`, que es lo
correcto: la capacidad la manda el catálogo.

## Paso 4 — `ITEMS` y `WEAPON_DATA`, el cargador

**Los cargadores están en los dos catálogos.** Esto no es opcional y no es
obvio:

```js
// gsis_item_data.js
"mag_gsis_pistol": { name: "Cargador pistola 30", weight: 0.2, type: "magazine" },

// gsis_weapon_data.js, en WEAPON_DATA
{
    itemId: "mag_gsis_pistol",
    magId: null,
    name: "Cargador pistola 30",
    weaponId: null,
    slot: null,
    category: "Cargadores",    // ← esto es lo que lo hace cargador
    realWorldName: "Colt M1911A1",
    isLong: false,
    price: 220
}
```

**El `category: "Cargadores"` en `WEAPON_DATA` es obligatorio.** `ITEMS_MAG()` lo
busca ahí, no en `ITEMS`. Y `_snapDealer` construye el catálogo del armero
iterando `WEAPON_DATA` y se saltea lo que tiene precio 0. Sin esa entrada, el
cargador:

- no aparece en el armero
- `getMagValue()` le devuelve 0
- `getClipSizeByItemId()` no lo resuelve

La capacidad del cargador sale sola del arma: `getClipSizeByItemId("mag_…")`
parte el prefijo, busca `gsis_pistol` y toma su `clipSize`.

**Precio**: el cargador tiene que ser una fracción del arma. El comentario de
`PRECIO_BALA` en `gsis_weapon_data.js` calibra la banda en 11-57% del par
arma+cargador. Una pistola de 550 con cargador de 30 a 220 es 40%: dentro.

## Paso 5 — el ícono

`modloader\IronSyndicate\image\<itemId>.png`.

Está indexado por `itemId`, así que el archivo se llama `gsis_pistol.png`. Sin
ícono la UI muestra un hueco, no un error.

Los cargadores comparten genérico: `mag_9mm.png`, `mag_SMG.png`, `mag_fusil.png`.
Si el cargador nuevo se parece a alguno, reusalo y listo.

---

## Checklist antes de probar

```
□  tipo en 60-79
□  padre en 22-32 (si querés skills)
□  cargador del .dat == clipSize de WEAPON_DATA
□  ITEMS: el arma, con type "weapon"
□  ITEMS: el cargador, con type "magazine"
□  WEAPON_DATA: el arma, con weaponId y clipSize
□  WEAPON_DATA: el cargador, con category "Cargadores" y price > 0
□  image\<itemId>.png existe
```

## Probar

Levantá el juego. En `gsis_limiter.txt` tiene que aparecer:

```
dado de alta: tipo 60, padre 22, modelId 346, slot 2, clip 30, damage -1
verificacion de 7 parches:   (7 OK)
[60] CWeaponInfo[STD] = ... clip 30 ...
```

Y en `cleo_redux.log`, cuando，取 el arma:

```
[Ballistic] arma de plugin en slot 3 | type 60 | _isCustomWeaponId=true | _capacityByType=30
```

Ese `_capacityByType=30` es la confirmación de que las dos mitades —
el `.asi` y el catálogo — dicen lo mismo. Si dice `0`, el `clipSize` y el
`cargador` no coinciden, o el cargador no tiene su entrada en `WEAPON_DATA`.

Después: comprala en el armero, equipala, dispará, `R` para recargar y `R` otra
vez para sacar el cargador.

## Si algo falla

| síntoma | causa probable |
|---|---|
| el armero no muestra el arma | falta la entrada en `WEAPON_DATA` |
| el armero no muestra el cargador | falta la entrada en `WEAPON_DATA` con `category: "Cargadores"` |
| no tiene skill y no sube | el padre no está en 22-32 |
| el cargador tiene un tamano distinto al del `.dat` | `cargador` != `clipSize` |
| hueco en la UI | falta `image\<itemId>.png` |
| el mod borra el arma del save | el tipo no cae en `PLUGIN_WEAPON_RANGE` |
| dispara sin sonido | el padre está fuera de 22-45 (solo ahí hay tabla de sonidos) |
| no aparece la mira | el padre está fuera de la lista blanca de `DrawCrossHairs` |

## Agregar un segundo cargador (variante de capacidad)

`WEAPON_DATA` admite `magIds` con varios elementos. El arma acepta cualquiera de
ellos y el mod monta el que tengas. La capacidad la saca del cargador que
**entró**, no de la que tenía antes.

```js
magIds: ["mag_gsis_pistol", "mag_gsis_pistol_drum"],
```

Cada variante necesita su entrada en `ITEMS` **y** en `WEAPON_DATA` con
`category: "Cargadores"`.

Y ojo: `expandMagazine` escribe la capacidad en la `CWeaponInfo` del motor para
las cuatro skills, así que **el alcance es GLOBAL por tipo de arma**. Mientras el
jugador lleve el tambor, los enemigos con esa pistola también entran tambor.
Es el costo de ese camino y está asumido en el código.
Y en `cleo_redux.log`, cuando tomes el arma: