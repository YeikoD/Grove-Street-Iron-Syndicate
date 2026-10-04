# GSIS — Investigación: cómo se le pone un modelo 3D a un arma nueva

Estado de la pregunta: **abierta**. Lo que sigue es lo medido y lo descartado, con
el origen de cada dato. La pregunta de fondo: cómo conseguir un `modelId` válido
que se pueda escribir en `CWeaponInfo::m_modelId` (offset `0x0C`) del tipo 60.

Fecha: 2026-09-29. Fuentes: código de CLEO+ (citado por quien investiga),
`modloader.log` de esta instalación, y el código fuente de modloader 0.3.11 y de
fastman92 Limit Adjuster 7.6.

> **Regla de este documento.** Una hipótesis descartada se escribe con la
> evidencia que la descarta. Un camino que *parece* funcionar se escribe con lo
> que falta probarse. Nada se da por bueno porque suene lógico.

---

## 1. 0F00 (`LOAD_SPECIAL_MODEL`) queda DESCARTADO

**No por sospecha. Por código de CLEO+.**

La cadena real de `0F00` es:

```
0F00
  ↓
CTxdStore
  ↓
lee el DFF con RenderWare
  ↓
RpClump* / RpAtomic*
  ↓
new SpecialModel(...)
  ↓
devuelve SpecialModel*
```

Nunca pasa por `CModelInfo`, ni por `CWeaponModelInfo`, ni por
`CModelInfo::ms_modelInfoPtrs`, ni por `CStreamingInfo`.

**Por qué esto lo descarta de forma definitiva:** `CWeaponInfo::m_modelId` es un
`int` que el motor usa como **índice** en `ms_modelInfoPtrs`. El valor que
devuelve 0F00 es un **puntero** a un objeto que no está en esa tabla. Escribirlos
uno en el otro no es "un id que no funciona": es un índice que apunta a
basura, o sea memoria arbitraria interpretada como `CBaseModelInfo`.

`gsis_Ballistic.js:784` lo usa hoy:

```js
id = native("LOAD_SPECIAL_MODEL", c.nombre, _nombreTxd(c.nombre)) | 0;
```

y guarda ese `id` en `_modelosArma`, que después `_modelIdDeTipo`
(`gsis_Ballistic.js:871`) devuelve como si fuera un modelId, y que
`_escribirModelId` (línea 886) escribe en `m_modelId`. **Ese código está
escrito contra una hipótesis que ya se sabe falsa.** No se ejecutó nunca
(`WEAPON_MODELS_ENABLED = false`, `gsis_Config.js:232`), así que no hubo
síntoma.

`WEAPON_MODELS` en `gsis_Config.js:259` y el bloque `_cargarModelosDeArma` de
`gsis_Ballistic.js:727-842` quedan, para arma, como código muerto a la espera de
decisión. No borrar todavía: son 100 líneas que ya dicen qué ruta se intentó y por
qué falló.

---

## 2. El mapa: dos sistemas que no se tocan

Esto es lo que la investigación tenía que dejar claro.

```
MODELO ESPECIAL DE CLEO+              MODELO DEL JUEGO
───────────────────────              ────────────────
0F00 → SpecialModel*                 .dff → ModLoader → CStreaming
      → RpClump/RpAtomic                           ↓
                                              CModelInfo
NO ModelInfo                                    → modelId
NO modelId                                            ↓
NO CStreaming                                  CWeaponInfo.m_modelId
```

**`fam5.dff` pertenece al segundo, no al primero.** Eso explica por qué el log
tiene:

```
871: Importing model file for index 15000 at "modloader\ironsyndicate\models\fam5.dff"
```

Ese 15000 **no salió de 0F00**. Salió de `LOAD_SPECIAL_CHARACTER_FOR_ID`
(`gsis_Actors.js:302`), que sí entra al sistema que modloader puede interceptar.
Es la evidencia de que el segundo camino existe y anda en esta instalación.

---

## 3. Hechos medidos en esta instalación

De `modloader.log`, con el mod ya instalado y arrancado:

| hecho | línea | qué significa |
|---|---|---|
| `colt45_c15.dff` y `colt45_c15_silenced.dff` **no reciben índice** | — | el rango de DFF (0..0x4E1F) está lleno |
| sus `.txd` **sí** reciben: 23610 y 23611 | 757-758 | el rango de TXD tiene lugar |
| `fam5.dff` recibe 15000 | 871 | el camino de modelo especial funciona |
| 15025 está libre en el log | — | el conflicto con `genmotelfurn_sv` no aparece en esta corrida |
| no hay rastro de fastman92 en el log | — | FLA no está cargado |

**El dato duro que faltaba:** el `.dff` de la colt45 **nunca fue registrado como
modelo del juego**. No es que el modelo esté mal escrito en la `CWeaponInfo`; es
que el modelo no existe para el motor. Eso solo ya descarta toda la ruta de
"cambiar el número y listo".

El rango de DFF es 0..0x4E1F y el de TXD arranca en 0x4E20 (20000), confirmado
en `modloader-master\src\shared\traits\gta3\sa.hpp:21-28`. Los `.txd` entraron en
23610 porque el rango de texturas tiene espacio; los `.dff` no entró en ninguno
porque el suyo está lleno con vanilla.

---

## 4. Lo que falta descubrir

La pregunta abierta, y es la única que importa ahora:

> `LOAD_SPECIAL_CHARACTER_FOR_ID` → ¿qué clase de `CModelInfo` crea y deja en
> `ms_modelInfoPtrs`? ¿Y se puede convertir en, o ser, un `CWeaponModelInfo`?

**No asumir** que `LOAD_SPECIAL_CHARACTER_FOR_ID → 150xx → CWeaponInfo[60].model
= 150xx` funciona. Que haya funcionado para un *ped* no dice nada sobre un
*arma*: el motor elige el tipo de `ModelInfo` según quién lo pide.

> **Actualizado.** Las tres preguntas de esta sección tienen respuesta. Ver
> [§8](#8-el-golpe-de-cledo-0e9a). La 1 y la 2 quedaron cerradas leyendo
> `CLEOPlus\Misc.cpp:780-810`; la 3 se respondió sola al ver que el `ModelInfo`
> que crea 0E9A no se crea nunca cuando el slot ya está ocupado.

Lo que hay que mirar, en orden:

1. Qué función llama el opcode 0E9A por dentro, y si pasa por
   `CModelInfo::AddWeaponModel` (0x4C6710) o por otro `AddXModel`.
2. Qué clase queda en `ms_modelInfoPtrs[15000]` y cuál es su vtable. La
   comprobación barata es `modloader-master\src\shared\traits\gta3\sa.hpp:100-104`,
   que lee el **tipo por vtable+4** y lo mapea a
   `Atomic/DamageAtomic/Time/Lodtime/Weapon/Clump/Vehicle/Ped/LodAtomic`
   (`sa.hpp:36-41`). Si `fam5` da `Clump` (5) y no `Weapon` (4), el camino de
   personajes no sirve tal cual para armas y hay que buscar otro.
3. Si el tipo no es `Weapon`, si al menos es *convertible*: qué campos lee el
   motor de un `CWeaponModelInfo` y cuáles tiene el otro.

Un `.asi` chico que al arrancar vuelque la vtable y el tipo de `ms_modelInfoPtrs`
en 15000 responde las tres preguntas de una. Sale más barato que seguir leyendo
código de terceros.

---

## 5. fastman92 Limit Adjuster 7.6: qué resuelve y qué no

Está el código fuente completo en `C:\Dev\fastman92 limit adjuster 7.6`. Se
leyó. Resultado, corto:

### 5.1 Lo que FLA sí hace, y es exactamente lo que nos falta

**Reloca y agranda `ms_modelInfoPtrs` y `ms_aInfoForModel` al heap.**
`FileIDlimit.cpp:10474-10490`:

```cpp
// DFF
if (GetFileIDcurrentLimit(FILE_TYPE_DFF) > GetFileIDdefaultLimit(FILE_TYPE_DFF))
{
    CModelInfo__ms_modelInfoPtrs.gta_sa = new CBaseModelInfo*[GetBaseID(FILE_TYPE_TXD)];
    memset(CModelInfo__ms_modelInfoPtrs.gta_sa, NULL, GetBaseID(FILE_TYPE_TXD) * sizeof(void**));
    CModelInfo__ms_modelInfoPtrs.bIsAllocated.Set(true);
}
```

y después repunta ~450 direcciones (`:7417` en adelante). El rango de DFF sube de
20000 a 2147483647. Eso **destrabaría el punto 3 de la sección 3**: los `.dff`
dejarían de quedarse sin índice.

**Agranda el pool de modelos de arma** (`0xB1E158` / `0xB1E15C`, stride `0x28`).
`IDEsectionLimits.cpp:742-764` reubica el store a heap si
`iWeaponModels > WeaponModelsLimit`, y repunta las 8 referencias al contador y al
array, **incluida `0x4C6710`**, que es justo `AddWeaponModel`. Límite vanilla:
**51** modelos de arma.

Nuestras direcciones del `modelprobe.cpp` quedan confirmadas por el fuente de
FLA: `0xB1E158` es el contador (`IDEsectionLimits.cpp:1314`), `0xB1E15C` el array,
`0x28` el stride, `0x4C6710` `AddWeaponModel`. El `modelprobe` las dedujo bien.

### 5.2 El camino soportado para un modelo de arma propio: el IDE

**No es un API. Es una sección `weap` en un `.ide`.** Es lo único que FLA
soporta, y ya hay un intento en esta instalación:

`modloader\IronSyndicate\models\weapons\colt45\Weapons.ide.off`:
```
weap
12400, colt45_c15, colt45_c15, python, 1, 30, 0
end
```

Está **desactivado** (`.off`), y `Loader.txt` al lado dice
`IDE DATAMAPS Weapons.ide`. Ojo: `Loader.txt` con `DATAMAPS` **no es de
modloader** — `modloader-master` no lo menciona en ningún lado (0 hits), y FLA
tampoco. Es de otro loader. Ese archivo y ese `Loader.txt` son de una
herramienta que no está en esta instalación.

La cadena de FLA para esa línea:
1. La sección `weap` se carga y `AddWeaponModel` asigna el ID (contiguo, base 0
   del rango DFF — `FileIDlimit.cpp:16516`).
2. El nombre se hashea a la tabla de búsqueda en
   `patch_CFileLoader__LoadWeaponObject_5B3FFE` (`FileIDlimit.cpp:16224-16245`).
3. `weapon.dat` aporta el `modelId` por su columna de modelo, y FLA repunta las
   escrituras de `m_modelId`/`m_modelId2` (`WeaponLimits.cpp:5999-6012`).
4. `m_modelId` (0x0C) queda apuntando al `CBaseModelInfo` correcto.

El ID **lo asigna el loader según el orden del IDE**, no un número arbitrario. Se
controla por posición, no por valor.

### 5.3 FLA no exporta ninguna API para esto

Verificado contra la tabla de exports del binario, no solo los headers. Son 27
símbolos. Los de armas son **solo lectura**:

```cpp
int      GetWeaponHighestParentType(int weaponType);
const char* GetWeaponName(int weaponType);
unsigned int GetCountOfWeaponInfos();
unsigned int GetNumberOfWeaponTypes();
```

`FindModelIDbyModelInfo` existe internamente (`FileIDlimit.h:782`) y es
exactamente lo que se querría, pero **no está exportado**. Y
`ApplyWeaponTypeLoader` (`WeaponLimits.cpp:5660-6565`) es `private:` y se llama
solo desde `CommitChanges()`: **no se puede registrar un tipo de arma desde
otro `.asi`**.

### 5.4 La trampa grande: con FLA, las direcciones viejas mienten

Esto es lo más importante de la sección 5, y aplica a **cualquier `.asi` nuestro**
— el limiter incluido:

| tabla | vanilla | con FLA |
|---|---|---|
| `ms_modelInfoPtrs` | `0xA9B0C8` | heap, dirección en el log de FLA |
| `ms_aInfoForModel` | `0x8E4CC0` | heap |
| `aWeaponInfo` | `0xC8AAB8` | heap **solo si** `CountOfWeaponInfos > 80` |

Un `.asi` que lea `0xA9B0C8` con FLA instalado lee un puntero viejo a un array
estático que FLA ya no usa. El `modelprobe.cpp:101` lee exactamente
`ADDR_MODELINFO_PTRS = 0xA9B0C8` y `ADDR_INFO_FOR_MODEL = 0x8E4CC0`: **con FLA
cargado, esa sonda mide basura**.

`aWeaponInfo` se queda en `0xC8AAB8` mientras haya ≤80 filas
(`WeaponLimits.cpp:5952-5956`), así que el limiter está a salvo con
`NumberOfWeaponTypes = 70`. Y hay un piso duro: FLA tira excepción si el número
de tipos es menor que 70 (`WeaponLimits.cpp:5676-5680`).

### 5.5 La reserva de FLA

`WeaponLimits.h:349-356`:
```cpp
WEAPONTYPE_FASTMAN92_FIRST = 60,
WEAPONTYPE_JETPACK_TYPE = WEAPONTYPE_FASTMAN92_FIRST,
WEAPONTYPE_BINOCULARS_TYPE,
WEAPONTYPE_FASTMAN92_FIRST_NOT_MADE,
WEAPONTYPE_LAST = 69
```

**60 y 61 están dentro de la reserva de FLA.** Con el weapon type loader apagado
(no está en el log, y el default es `0`) no hay conflicto. Si se prende, hay que
saber qué pasa con el 60.

Y el recordatorio de `gsis_WEAPONS.md:544-546`: **ya se instaló FLA una vez y
rompió el arranque del juego.** `fastman92limitAdjuster.log` quedaba en 0 bytes
y `gtasa_weapon_config.dat` nunca se generaba. Eso se atribuyó a CLEO+, pero
FLA 7.6 tiene soporte de CLEO explícito (`IsCLEOloadingImplementedByTheFLA()`,
`Exports.h:143`; y el Readme:551 registra un parche para CLEO 4.3.16). La causa
del arranque roto no quedó aislada. **No dar por hecho que se repite; tampoco
dar por hecho que no.**

---

## 6. Resumen del estado

| camino | estado | evidencia |
|---|---|---|
| 0F00 `LOAD_SPECIAL_MODEL` | **descartado** | código de CLEO+: no pasa por `CModelInfo` |
| `.dff` suelto en `modloader/` | **no alcanza** | `modloader.log`: el `.dff` de la colt45 no recibe índice, rango lleno |
| `LOAD_SPECIAL_CHARACTER_FOR_ID` | **candidato viable** | funcionó con `fam5.dff` → 15000; y 0E9A respeta un `ModelInfo` preexistente ([§8](#8-el-golpe-de-cledo-0e9a)) |
| FLA + sección `weap` de un IDE | **soportado, sin probar** | código de FLA; hay un `Weapons.ide.off` sin activar |
| FLA como API desde otro `.asi` | **imposible** | 27 exports, ninguno de registro; `FindModelIDbyModelInfo` es interno |
| FLA instalado | **rompió el arranque una vez**, causa no aislada | `gsis_WEAPONS.md` §8; log de 0 bytes |

**Próximo paso:** ver [§8](#8-el-golpe-de-cledo-0e9a). El diagnóstico de solo
lectura que se pedía antes ya no es la pregunta: ahora la ruta candidata es
`AddWeaponModel` + 0E9A, y lo que falta es probarla, no medir `fam5`.

---

## 7. Lo que este documento no cubre

- `Documentation.docx` / `.xlsm` de FLA son binarios y no se extrajeron. La
  afirmación de que no hay documentación para asignar un modelId arbitrario sale
  de `Documentation.csv`, los Readmes y el código. Si el docx tiene un capítulo de
  IDE/DATAMAPS, es el lugar más probable para contradecirlo.
- `modloader-master` tiene 0 hits para `Loader.txt` y `DATAMAPS`. La herramienta
  que usaba `Loader.txt` no está en esta máquina y no se investigó.
- ~~No se midió qué clase de `ModelInfo` deja `LOAD_SPECIAL_CHARACTER_FOR_ID`.~~
  Resuelto en [§8](#8-el-golpe-de-cledo-0e9a) leyendo el código de CLEO+, sin
  medir en el juego.

---

## 8. El golpe de CLEO+ 0E9A

Sección complementaria. La investigación de `AddWeaponModel` +
`RequestSpecialModel` **no** se repite acá: lo que se asienta es **por qué esa
combinación es una ruta candidata válida**, y el hecho puntual que la habilita.

> Nota de numeración: el documento va a §7 y no tenía §12. Esta es §8. Si más
> adelante se agrega lo de `AddWeaponModel`, que sea §9 y no se pise.

### 8.1 HECHOS — leídos del código

Fuente: `CLEOPlus\Misc.cpp:780-810`, CLEO+ (copia en
`%TEMP%\opencode\CLEOPlus\CLEOPlus-main`).

```cpp
OpcodeResult WINAPI LOAD_SPECIAL_CHARACTER_FOR_ID(CScriptThread* thread)
{
	int id = CLEO_GetIntOpcodeParam(thread);
	CBaseModelInfo *baseModelInfo = CModelInfo::GetModelInfo(id);
	if (!baseModelInfo) {

		CPedModelInfo *pedModelInfo = ((CPedModelInfo* (__cdecl *)(int))addPedModelAddress)(id);
		//CPedModelInfo *pedModelInfo = CModelInfo::AddPedModel(id);
		pedModelInfo->SetColModel((CColModel*)0x968DF0, 0);
		CPedModelInfo *basePedModelInfo = (CPedModelInfo *)CModelInfo::GetModelInfo(290);
		pedModelInfo->m_nPedType = ePedType::PED_TYPE_CIVMALE;
		... 11 campos copiados del ped 290 ...
	}
	specialCharacterModelsUsed.insert(id);
	LPSTR name = CLEO_ReadStringPointerOpcodeParam(thread, bufferA, 128);
	CStreaming::RequestSpecialModel(id, name, eStreamingFlags::KEEP_IN_MEMORY | eStreamingFlags::MISSION_REQUIRED);
	CTheScripts::ScriptResourceManager.AddToResourceManager(id, 2, ...);
	return OR_CONTINUE;
}
```

De ahí sale, literalmente:

**H1.** La creación del `ModelInfo` — la llamada a `addPedModelAddress` y los 11
campos de `CPedModelInfo` — está **dentro de `if (!baseModelInfo)`**, donde
`baseModelInfo = CModelInfo::GetModelInfo(id)`. Es la primera cosa que hace el
opcode.

**H2.** Por lo tanto, si el slot **ya tiene** un `CBaseModelInfo`, el opcode
**no crea ningún `ModelInfo`** y no escribe ningún campo de él. Entra directo a
`RequestSpecialModel(id, name, flags)`.

**H3.** 0E9A por lo tanto es un **oráculo de disponibilidad**: no pisa lo que
haya. `0xE9E GET_MODEL_DOESNT_EXIST_IN_RANGE` (`Misc.cpp:846-864`) usa la misma
tabla para buscar huecos, así que la zona que declara libre es coherente con la
que 0E9A respeta.

**H4.** `addPedModelAddress` se resuelve en runtime, no está compilado como
`0x4C67A0`. `CLEOPlus.cpp:949`:
```cpp
addPedModelAddress = ReadMemory<uintptr_t>(0x5B74A7 + 1, true) + (0x5B74A7 + 5);
```
O sea: lee el `rel32` de un `call` en `0x5B74A7` y le suma la dirección
siguiente. El opcode usa **esa** función, no la del SDK. No se verificaron los
bytes, así que el destino exacto no está firmado acá.

### 8.2 INFERENCIA — por qué esto habilita la ruta

**I1.** Si nuestro `.asi` llama `CModelInfo::AddWeaponModel(id)` **antes** de que
el script llame 0E9A, entonces `GetModelInfo(id)` devuelve ese
`CWeaponModelInfo`, y por **H2** 0E9A lo respeta y va derecho a
`RequestSpecialModel(id, "colt45_c15", flags)`.

**I2.** `RequestSpecialModel` es exactamente la función que modloader engancha
(`std.stream\backend.cpp:596-641`, hook de `RequestModel` en `0x409FD9`), la
misma que produjo `Importing model file for index 15000` para `fam5.dff`.

**I3.** Encadenando I1 e I2, la ruta candidata es:

```
AddWeaponModel(id)                    ← nuestro .asi, CWeaponModelInfo (tipo 4)
  → ms_modelInfoPtrs[id]

0E9A(id, "colt45_c15")                ← el script, sin tocar
  → GetModelInfo(id) != NULL          (H1/H2)
  → NO crea CPedModelInfo
  → RequestSpecialModel(id, "colt45_c15", flags)
      → modloader: special.find(mhash) → QuickImport(id, dff, isSpecialModel=true)
      → RegisterModelIndex + SetInfoForModel + RequestModel(id)

CWeaponInfo[60].m_modelId = id         ← el mod lo escribe, como ya hace
```

**I4.** Lo bueno de esta ruta: **no requiere FLA, no toca CLEO+, no agranda
`aWeaponInfo`, y no pisa ningún modelo vanilla** — el id elegido está libre.
Cada pieza es código de terceros que ya se sabe que anda; lo único nuevo es el
orden de las dos llamadas.

**I5.** Y responde la pregunta que §4 dejó abierta: 0E9A crea un
`CPedModelInfo` (tipo 7), **pero solo si el slot está vacío**. Con el slot
prellenado por nosotros, la pregunta "¿es un `CPedModelInfo` o un
`CWeaponModelInfo`?" no llega a plantearse.

### 8.3 HECHOS — el relevamiento de IDs

Recorriendo el enum de FLA
(`...\Source files\GameStructures\Rockstar Games\eModelID.h`, 15039 entradas
distintas, máximo 18630) sobre la banda 15000-16790:

| rango | IDs ocupados | nombres |
|---|---|---|
| **15000-15024** | 0 | libre |
| **15025-15064** | **40** | `MODEL_GENMOTELFURN_SV`, `MODEL_IMY_ROOMFURN12_SV`, `MODEL_IMMY_CLOTHES_SV`, `MODEL_GENMOTEL2SH_SV`, … |
| **15065-15999** | 0 | libre |
| **16000-16790** | 791 | vanilla |

**H5.** El rango que GSIS declara hoy,
`SPECIAL_MODELS.WEAPON_RANGE = {START: 15025, END: 15099}`
(`core\gsis_Config.js:215`), **pisa los 40 modelos de 15025-15064**. Empieza
exactamente donde arranca el bloque ocupado.

**H6.** La banda libre contigua más grande antes del siguiente bloque vanilla es
**15065-15999** (935 IDs). La de personajes, 15000-15024 (25), también libre y
más chica.

Esto corrige la fila de §3 que decía *"15025 está libre en el log"*: estaba libre
**en esa corrida**, y el enum dice que no lo está. El log nogba contra el enum
porque modloader no registró ningún archivo ahí — el conflicto es silencioso.

### 8.4 HECHOS — `AddWeaponModel` es un bump allocator

Fuente: `modelprobe.cpp:44-52` y `73-92`, confirmado por
`fastman92\...\Modules\IDEsectionLimits.cpp:742-764` y `:1314`.

| | |
|---|---|
| contador del pool | `0xB1E158` |
| base del array | `0xB1E15C` |
| stride por entrada | `0x28` |
| **límite vanilla** | **51** |

Desensamblado de `AddWeaponModel` (`0x4C6710`), según `modelprobe.cpp:76-84`:

```
004C6710  mov eax,[00B1E158h]      ; contador
004C6716  lea esi,[eax+eax*4]      ; *5
004C671A  lea esi,[esi*8+00B1E15Ch]; *40 → slot = base + cont*0x28
004C6721  mov [00B1E158h],eax
004C6726  mov eax,[esi]            ; LEE LA VTABLE DE LA RANURA
004C672A  call [eax+18h]          ; vtable[6] = constructor
004C6731  mov [ecx*4+00A9B0C8h],esi
```

**H7.** No busca hueco: **toma el siguiente y avanza el contador**. No hay
reserva, no hay reubicación, no hay chequeo de límite.

**H8.** El `modelprobe` lo llamó en el epílogo de `CModelInfo::Initialise`
(`0x4C6A64`) y el log da `contador del pool: 0 -> 1`. O sea que **en ese momento
el pool estaba vacío**: vanilla todavía no había cargado ningún modelo de arma.

**Consecuencia operativa (I6):** llamar `AddWeaponModel` ahí es temprano
—quizá demasiado. Si vanilla carga después, sus 51 `AddWeaponModel` avanzan el
contador desde 1 y **pueden pisar nuestra ranura**; y si vanilla ya cargó y el
contador está en 51, nuestra llamada escribe **fuera del array**. Hay que llamar
**después** de que `weapon.dat` haya cargado, y leer el contador antes de
escribir. Es el mismo criterio perezoso que ya usa el limiter para clonar la
`CWeaponInfo`, y por el mismo motivo: clonar antes de que la tabla esté poblada
clona ceros.

### 8.5 TODAVÍA NO VERIFICADO

- **Que la cadena completa funcione.** Todo lo de arriba sale de leer código de
  CLEO+ y modloader. Ninguna parte se ejecutó. En particular falta ver que
  `RequestSpecialModel` no pise el `CWeaponModelInfo` por su cuenta: modloader
  loguea que guarda la entrada original para restaurarla
  (`backend.cpp:611-627`) pero no se leyó ese camino.
- **El nombre, con o sin extensión.** `IS_MODEL_AVAILABLE_BY_NAME` hace
  `ms_pExtraObjectsDir->FindItem(name)` (`Misc.cpp:841`) y el mod le pasa el
  nombre pelado, mientras la entrada que modloader registra es
  `filename()` = `colt45_c15.dff` (`modloader.log:164`). El emparejamiento de
  modloader es por `mhash` de `m_szFileName` de los dos lados, así que cierra
  igual — pero no se leyó `CDirectory::FindItem` para confirmarlo.
- **Que 15065 esté libre en runtime.** El enum dice que sí; el log de la corrida
  no registra ese ID. Habría que confirmarlo con
  `GET_MODEL_DOESNT_EXIST_IN_RANGE` o leyendo `ms_modelInfoPtrs[15065]`.
- **El límite real del pool en runtime.** 51 viene del default de FLA, no de una
  medición. El contador en el momento correcto es lo que hay que leer.
- **Qué campos necesita un `CWeaponModelInfo` para que el arma se vea.**
  `m_weaponInfo` (offset `0x24`, `plugin_sa\game_sa\CWeaponModelInfo.h:16`) y
  `m_nTxdIndex` (`CBaseModelInfo.h:123`) no se escribieron en este análisis. FLA
  los escribe al cargar `weapon.dat` (`WeaponLimits.cpp:4331-4347`), y ese
  camino no lo recorre un `AddWeaponModel` nuestro.
