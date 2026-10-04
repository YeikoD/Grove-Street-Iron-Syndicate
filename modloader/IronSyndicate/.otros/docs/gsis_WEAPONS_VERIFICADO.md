# GSIS - Armas: VERIFICADO contra el motor real

> # HISTÓRICO — las mediciones son de un sistema que ya no existe (03/10/2026)
>
> Este documento registra lo que **se ejecutó de verdad** en el juego el 30/09, con
> el sistema de **variantes y accesorios** (`WEAPON_VARIANTS`, `attachments[]`,
> `resolveWeaponType()`). Ese sistema se borró entero el 03/10/2026, y el modelo
> de "cada configuración es su propio item" que vino después **también**. **Hoy hay
> una familia por item** con el tipo derivado de `tipoDe()`.
>
> Los logs citados —`recarga: monta mag_colt45_15: colt45 -> tipo 61`— **no se
> pueden volver a obtener**: ese código no existe. Y su forma correcta hoy es
> `[Weapons] recargar: CAMBIO | mag_colt45_c15 ... | Colt .45 -> Colt .45 C15 (tipo 62)`.
>
> Lo que **sí** se puede aprovechar: la lección sobre las **cuatro fuentes de
> verdad**, que es lo único de este documento que sigue vigente, resumida en
> [`gsis_WEAPONS.md`](./gsis_WEAPONS.md). Y la lista de lo que hay que mirar en el
> log, que es la parte accionable.
>
> Para el sistema actual: [`AGREGAR_ARMAS.md`](./AGREGAR_ARMAS.md) y
> [`gsis_WEAPONS.md`](./gsis_WEAPONS.md). Para lo que se mide **hoy**, en el log:
> `C:\Dev\gsis-armory\_docs\gsis_TECNICA.md`, `MOD 13.2` (los volcados) y
> `MOD 14` (el modelo de vanilla).

---

> ~~"Este documento es la tercera fuente de verdad, y la única que no se deduce
> del código."~~ **Eso era verdad hasta el 03/10/2026 y ya no**: lo que se
> ejecutaba era el sistema viejo.
>
> **Este documento es la tercera fuente de verdad, y la unica que no se deduce del
> codigo.** Ver [la taxonomia de 4 niveles](#6-los-cuatro-niveles).
>
> Registra **que se ejecuto de verdad en GTA San Andreas y que se vio pasar**. No
> describe lo que el sistema deberia hacer: eso es [gsis_WEAPONS.md](./gsis_WEAPONS.md).
> Y no describe como se comunican las piezas: eso es [gsis_CONTRATOS.md](./gsis_CONTRATOS.md).
>
> **Por que este documento existe.** Durante el refactor aparecieron cuatro
> afirmaciones que son distintas entre si, y que en una sesion de juego se
> confundieron una con otra:
>
> 1. *"esto esta en el codigo"*
> 2. *"el contrato dice que esto pasa"*
> 3. *"GTA lo hizo"*
>
> Un contador de tests verde no dice nada de la tercera. El bug que costo la
> sesion de debugging mas larga estaba en la tercera categoria, y ningun test
> podia verlo. Ver [El fake engine y lo que no puede probar](#2-el-fake-engine-y-lo-que-no-puede-probar).

---

## Indice

1. [La matriz verificada](#1-la-matriz-verificada)
2. [El fake engine y lo que no puede probar](#2-el-fake-engine-y-lo-que-no-puede-probar)
3. [Los bugs reales, por como se encontraron](#3-los-bugs-reales-por-como-se-encontraron)
4. [Lo que NO esta verificado](#4-lo-que-no-esta-verificado)
5. [Como repetir una verificacion](#5-como-repetir-una-verificacion) — y [que evidencia sobrevive](#51-la-evidencia-cruda-y-que-parte-de-ella-sobrevive)
6. [Los cuatro niveles](#6-los-cuatro-niveles)

---

## 1. La matriz verificada

**6 de 7 tipos declarados pasaron por el motor real.** Cada fila se ejecuto en
partida, mirando el log y la pantalla.

| Tipo | Configuracion | Familia + accesorios | Capacidad | Resultado en log |
|---|---|---|---|---|
| **63** | `colt45 []` | colt45 | 8/8 | `equipar: colt45 -> tipo 63 (era 22)` |
| **62** | `colt45 [mag_colt45_15]` | colt45 + cargador 15 | 15/15 | `recarga: monta mag_colt45_15: colt45 -> tipo 62 (era 63) \| 0/15 balas` |
| **30** | `ak47 []` | ak47 | 30 | `equipar: ak47 -> tipo 30 (era 63) \| 0/30 balas` |
| **64** | `ak47 [mag_ak47_drum]` | ak47 + tambor | **75/75** | `recarga: monta mag_ak47_drum: ak47 -> tipo 64 (era 30) \| 0/75 balas`<br>`recarga: tipo 64 con 75/75 balas` |
| **60** | `colt45 [suppressor]` | colt45 + silenciador | 8/8 | `montar Silenciador: colt45 -> tipo 60 (era 63) \| 8/8 balas` |
| **61** | `colt45 [suppressor, mag_colt45_15]` | colt45 + silenciador + cargador 15 | 15 | `recarga: monta mag_colt45_15: colt45 -> tipo 61 (era 60) \| 8/15 balas` |
| ~~65~~ | `m4 [mag_m4_lancer]` | — | 40 | **sin probar** |
| ~~66~~ | `m4 [mag_m4_drum]` | — | 60 | **sin probar** |

### Lo que cada fila demuestra, mas alla del numero

**El 64 es la fila que motivo el refactor entero.** El bug original era que un
tambor de 75 balas se recortaba a 30, porque la capacidad se leia del **itemId**
(`ak47` = 30) en vez de la **variante** (64 = 75). Que dé 75/75 verifica que
el denominador sigue a la configuracion y no al item.

**El 60 es la unica que se verifico a ojo.** Las filas del `.dat` son:

```
63 22 346 2  8 -1      base,      padre 22, modelo 346
60 23 347 2  8 -1      silenciada, padre 23, modelo 347
```

Ver el arma **cambiar de modelo en pantalla** al montar el silenciador es lo unico
que demuestra que el `.asi` clono la `CWeaponInfo` del padre 23 y escribio
`m_modelId = 347` en las cuatro filas de skill. Esa cadena —`.dat` -> `.asi` ->
`CWeaponInfo` -> render— no tiene ninguna linea de log, asi que sin el ojo no
habia forma de verificarla.

**El 61 es la unica con dos accesorios a la vez**, y por lo tanto la unica que
verifica la `variantKey` compuesta. El log la imprime ordenada:

```
[mag_colt45_15, suppressor]
```

`m` antes que `s`. Si el resolver no ordenara, no habria encontrado la fila.

**El `8/15` del 61 no es un error.** Las 8 balas las tenia el 60; el cargador de
15 cambia la **capacidad**, no la municion. El arma conserva su municion y el
accesorio le da el denominador. La linea siguiente pone las 15.

### Transiciones de slot verificadas

Cada una es un REMOVE del tipo viejo y un GIVE del nuevo:

```
22 -> 63    normalizar     (el 22 de vanilla con un colt45 registrado)
63 -> 62    recarga        (montar el cargador de 15)
62 -> 63    descarga       (quitar el cargador, 8/8)
30 -> 64    recarga        (montar el tambor)
63 -> 60    montar         (inv:mount del silenciador)
60 -> 61    recarga        (R con cargador en el cinturon, conserva el silenciador)
```

Y el **reconciliador** verificado: el slot 2 con un 22 de vanilla de 1979 balas y
un `colt45` registrado se normalizo a 63 con 8 balas, avisando las 1971 que no
entran. Es la proteccion de capacidad funcionando y el `TIPOS_VANILLA_NO_ADOPTABLES`
funcionando: el 22 de vanilla no se adopto como arma nueva.

---

## 2. El fake engine y lo que no puede probar

`.IronSyndicate/tools/fake-engine.mjs` corre el flujo real del mod en node, con un
motor de GTA simulado. Cubre la cadena completa:

```
app.js (logica) -> commands -> weapons/logic -> EventBus -> inventory -> motor falso
```

**147 asserts pasan.** Y aun asi, el bug que rompio el armar de armas no estaba
cubierto. La razon es una sola, y conviene tenerla escrita:

> **Un fake engine solo prueba lo que NO comparte fuente con el modulo.**
> Si el fake y el codigo leen del mismo lugar, la coincidencia es por construccion
> y no dice nada.

El caso concreto: el fake implementaba `HAS_CHAR_GOT_WEAPON` leyendo el mismo
objeto de slots que escribia el `give` del fake. **Por lo tanto siempre concordaban
— por construccion, no porque el motor real concordara.** El bug era que en GTA
no concordan. Ningun assert podia verlo, porque el assert y el codigo estaban
leyendo la misma variable.

### La lista de lo que el fake NO prueba

| No prueba | Por que |
|---|---|
| Que un native exista en este runtime | El fake responde lo que el test quiere; GTA responde lo que el opcode hace |
| Que un native no devuelva `undefined` | `_darPorNativo` no declara `return`, y `undefined` es falsy. El fake la llamaba sin consequences |
| Los nombres de los comandos nativos | `GIVE_WEAPON_TO_CHAR` no estaba registrado en este runtime; `p.giveWeapon()` tampoco |
| Que el REMOVE antes del GIVE haga falta | El fake lo modela como "reemplaza el slot", que es la suposicion que hay que probar |
| Que el `.dat` escriba el modelo | El modelo no se renderiza en node |
| La capacidad que el motor le ve al arma | El fake la saca de la tabla, o sea de la misma fuente que el codigo |

### Que hace el fake ademas de testear

Fija la **interfaz** que el mod le pide al motor. Si `gsis_Engine.js` cambia un
offset o pide un native nuevo, el fake no lo implementa y **falla con un mensaje
que lo dice** (`native no simulado: NOMBRE`), en vez de devolver `undefined` y
dejar que se propague hasta el log tres archivos mas alla.

### Una trampa de la toolchain

`node --check` **no alcanza** para verificar estos archivos. Trata los `.js` como
scripts y acepta un `return` fuera de funcion; el loader ESM lo rechaza. Dejo
pasar un `return _darPorNativo(...)` huerfano que rompia `gsis_Engine.js` entero.

La verificacion que sirve es parsear cada archivo como modulo:

```powershell
# PowerShell: copiar a .mjs y pasar por el parser real
[System.IO.File]::WriteAllText("$tmp\f.mjs", [System.IO.File]::ReadAllText($_.FullName))
node --check "$tmp\f.mjs"
```

---

## 3. Los bugs reales, por como se encontraron

Seis bugs en total, y **la agrupacion por metodo de deteccion es la parte
util**: dice donde mirar primero la proxima vez.

### Por el log del juego real — 2 bugs

Ningun test los podia ver: no habia forma de que un contador en verde fallara.

**1. `_darPorNativo` devuelve `undefined`.** La funcion no declara `return`, y
`giveWeapon` hacia `return _darPorNativo(...)`. **`undefined` es falsy.** El
native daba el arma y el modulo reportaba fallo a continuacion. Efecto en cadena:
`equipWeapon` revirtia con `storeWeapon`, el registro nunca se escribia, y al
cerrar el menu el reconciliador encontraba el arma en el ped sin entrada y la
adoptaba: `removeWeapon` + `storeWeapon`, un item mas al inventario, en cada
intento. El modulo se desarmaba solo y duplicaba el arma.

Como se encontro: un log con `motivo` temporal. Ese log fue lo que lo localizo,
y la razon por la que hoy sigue en el codigo.

**2. `cap` no viajaba en el return de `_aplicar`.** `_giveInternal` produce `cap`
y `_aplicar` lo dejaba caer. El recorte `Math.min(resp.ammo, r.cap)` se
convertia en recortar contra si mismo, y el log imprimia `75/undefined balas`.

Como se encontro: el mismo log, leyendo la segunda linea de una recarga que
parecia correcta.

### Leyendo el codigo antes de cablearlo — 1 bug

**3. `attachAccessory` no consumia el accesorio del inventario.** Si se hubiera
conectado el comando tal cual, **montar el silenciador era gratis**: la pieza se
quedaba en la mochila y ademas quedaba en el arma. Duplicacion de objetos, la
misma clase del bug 1, y peor porque no se ve.

Como se encontro: leyendo la funcion antes de cablearla. **Fue el unico de los
seis que no hizo falta romper nada para descubrirlo.**

### Por un assert — 3 bugs

Todos en la suite de flujo con motor falso, y los tres por el mismo tipo de
falla: **el codigo hace algo que el contrato no dice, y el assert solo asertaba
que no estuviera**.

**4. La capacidad de la fila venia del item, no de la variante.** `ammoCell` sacaba
el denominador de `getClipSizeByItemId(it.id)`. Un arma con cargador de 15 es el
item `colt45`, cuya capacidad es 8, asi que la fila de un arma de 15 balas
mostraba `8/8`. Y `ammoCell` ademas recortaba, con lo que se veia **llena**.

**5. El rollback de accesorios guardaba el sobre, no la fila.** El codigo guardaba
la respuesta `{item: fila}` en vez de `fila`, con lo que la vuelta mandaba
`{item: {item: fila}}` y el manejador no encontraba el id. **El accesorio
desaparecia del inventario y no volvia** — y el rollback que existia justamente
para eso no devolvia nada. Invisible, y con perdida de objetos.

**6. `hasMag` estaba documentado y no se entregaba.** `itemRow` lo *usaba* (para el
guion de `ammoCell`) pero no lo copiaba a la fila. El registro de la UI decia
mandarlo y la pagina recibia `undefined`. No habia sintoma porque la UI dibuja el
guion, no el flag. Es la tercera vez que aparecia un campo documentado que no
cruza, y esa clase de defecto no se ve hasta que alguien lo usa.

### Y uno que era mio, el diagnostico

La sonda de diagnostico de `equipWeapon` midio `r.weaponType`, que es `undefined`
en el camino de fallo. Preguntaba por el tipo **0** (desarmado) y reportaba
`native=true, memoria=0` — dos columnas que no eran datos. Un instrumento de
diagnostico que **muestra** lo que se le da, no lo que se quiere medir.

---

## 4. Lo que NO esta verificado

Se declara aca y no en un "pendiente" disperso, porque **un pendiente invisible
es un pendiente que se re-descubre**.

| Sin verificar | Por que no se hizo | Que lo cubriria |
|---|---|---|
| **65 y 66** (M4) | Requerian comprar `m4_assembled` (1.100) + cargadores. Es el mismo camino que 62 y 64, ya probado 4 veces, con otra familia | Compra y `inv:belt` + R. Y copiar el log a un archivo con fecha (§5.1) |
| **`give-only` vs `remove+give`** | `REMOVE_ANTES_DE_GIVE = true`. No se probó si el GIVE solo alcanzaria | Sacar el REMOVE de `internal.js` y ver si quedan dos armas en el slot |
| **Municion suelta** | El sistema no tiene balas sueltas: todo esta en cargadores instanciados. El "caso 3" del header de `tryReload` (rellenar el cargador montado) **no esta implementado y no es implementable** sin decidir de donde salen las balas | Decision de diseno |
| **Acentos de codigo en la pagina** | `app.js` tiene labels hardcodeados sin tildes, mientras el mod usa `t()` | Excepcion ya documentada en MAINTENANCE §2.2 |

### Un dato que conviene no olvidar

El **tambor y el Lancer son de 75 y 40, y los cargadores de 30 no gastan tipo
propio.** `resolveWeaponType` tiene una regla de *accesorio neutro*: si ningun
accesorio de la lista necesita tipo propio, resuelve a la variante base. Un
cargador de 30 sobre un AK de 30 deja un AK de 30 - el mismo arma - y
por lo tanto no merece un numero del rango 60..79.

Eso **parece un bug y no lo es**: en el log se lee `ak47 -> tipo 30 | 0/30` al
montar un cargador de 30, y es la respuesta correcta. Los 13 numeros libres del
rango existen exactamente para los accesorios que si cambian el tipo.

**Y el 30/09 se limpiaron los que no hacian nada.** Habia cinco cargadores mas que
eran un segundo cargador de la MISMA capacidad que el arma de base, y por lo tanto
tampoco cambiaban el tipo: `mag_colt45_replica`, `mag_mp5_replica`,
`mag_ak47_polymer`, `mag_ak47_bulgarian` y `mag_m4_polymer`. Montar cualquiera de
ellos no movia ni el arma ni la capacidad, asi que eran articulos que se podian
comprar y no hacer nada.

Se quitaron del catalogo, cada uno redimido a su equivalente que sobrevive. El
detalle de por que la redencion necesita **dos** tablas, y no una, esta en
`ACCESORIOS_RETIRADOS` en `core/gsis_SaveMigration.js`: los `attachments` de un
arma son strings sueltos y el recorrido que renombra items no los alcanza.

---

## 5. Como repetir una verificacion

### 5.1 La evidencia cruda, y que parte de ella sobrevive

Este doc **transcribe** lineas de log que no estan en el repo. Que las afirme
y que sean releibles son dos cosas distintas, asi que va el mapa de cual es cual.
Los tres archivos viven en la **raiz del juego** y **no estan en git** (los cubre
el `*` del `.gitignore`), por decision: son salidas de instrumentacion, no codigo.

| Que afirma este doc | Evidencia cruda | Sobrevive |
|---|---|---|
| El `.asi` carga **7 tipos** y los **7 parches** están en su sitio | `gsis_limiter.txt`, **ultima corrida** (L995-1056) | **Si.** Y es la corrida vigente: los 7 tipos con los valores del `.dat` de hoy |
| Los **modelos** de las variantes (346, 347, 355, 356) | `gsis_modelprobe.txt` (10.417 lineas, FASE 6) | **Si.** Corrida de solo observacion: "ESTA CORRIDA NO ESCRIBE NADA" |
| Las **7 filas del `.dat`** y que el clon del padre sale bien | `check-dat.mjs`, sin necesidad de GTA | **Si, y en git** |
| **La matriz de la §1**: los `-> tipo 63`, el `75/75`, el `[mag_colt45_15, suppressor]` | `cleo_redux.log` | **No.** Ver abajo |

**Lo que hay que saber de `gsis_limiter.txt`:** son **37 corridas pegadas**, no
una. Las primeras 20 cargaban 2 tipos y las siguientes 4; a partir de la corrida 21
(`L606`) son 7. `.fase5` y los `.paso1_*` son de estados intermedios y describen
configuraciones que **ya no son la actual** —el `.fase5`, por ejemplo, registra un
solo tipo, el 60, con `modelId 346` y `clip 30`. **Solo la ultima corrida sirve
como evidencia del estado de hoy.** Un grep al principio del archivo da el
resultado de hace semanas.

**Y la parte que no sobrevive, que es la de la §1:** `cleo_redux.log` se
**sobrescribe en cada arranque**. Quedan 381 lineas de la sesion de hoy, y de las
siete filas de la matriz hay **una**. Las otras seis —el `-> tipo 62`, el
`-> tipo 60`, el `-> tipo 61`, el `75/75`— **ya no estan en ningun lado**.

Eso no invalida la §1: las siete se ejecutaron y se leyeron en su momento, y las
transiciones son coherentes entre si. Pero **hoy la matriz esta respaldada por
transcripcion, no por un artefacto releible**, y quien quiera volver a confirmarla
tiene que repetir las siete pruebas, no abrir un archivo. Por eso la §4 declara
65 y 66 sin probar: una matriz sin evidencia releivable no se agranda con
estimaciones, y menos ahora que 65 y 66 serian las dos primeras filas sin registro.

> **La leccion, porque ya se pago una vez.** La tabla de mediciones se perdio sin
> dejar copia ([GSIS_WEAPONS_DESIGN.md](./GSIS_WEAPONS_DESIGN.md) §4), y ahora
> el log de las pruebas de flujo se perdio de la misma forma: **sobrescrito**, no
> borrado. **Un `.log` que se regenera cada vez que se abre el juego no es un
> archivo, es un temporal.** Si una verificacion tiene que sobrevivir, hay que
> copiarla a un nombre con fecha el mismo dia, no confiar en que el archivo siga
> ahi manana.

### 5.2 Las tres suites

Las tres, en orden. Ninguna necesita GTA:

```powershell
node .IronSyndicate/tools/check-dat.mjs          # .asi <-> weapons.js, 7 filas
node .IronSyndicate/tools/check-migration.mjs     # 104/104  saves v1 -> v2
node .IronSyndicate/tools/check-ui-flow.mjs       # 147/147  flujo con motor falso
```

Y para una verificacion en partida:

1. `cleo_redux.log` es el que tiene `[Weapons]`. `cleo.log` no.
2. **Copiarlo a un nombre con fecha apenas termine la sesion**, por lo de 5.1.
3. `_giveInternal` loguea **una linea por armado exitoso**, con el formato
   `... -> tipo N (era M) | X/Y balas | [accesorios]`. Si esa linea no aparece,
   el armado no paso — y el `motivo` esta en la linea `EQUIP FALLO` que va antes.
4. Las senales de un ciclo roto son: `EQUIP FALLO > 0`, `adoptado > 0`, o
   `normalizado` repetido. En una sesion sana las tres valen 0.

Lo que se busca, por variante:

```
60  montar Silenciador: colt45 -> tipo 60 (era 63) | 8/8 balas | [suppressor]
61  recarga: monta mag_colt45_15: colt45 -> tipo 61 (era 60) | 8/15 | [mag_colt45_15, suppressor]
64  recarga: tipo 64 con 75/75 balas
```

Y el check visual del 60, que no tiene linea de log: **el arma tiene que cambiar
de modelo**. Ese es el unico de los siete que **no** se puede verificar leyendo
un archivo: hay que mirarlo.

---

## 6. Los cuatro niveles

La distincion que organiza toda la documentacion, y la que salio de este trabajo:

| Nivel | Documento | Que afirma | Se desactualiza si |
|---|---|---|---|
| **SPEC** | [gsis_WEAPONS.md](./gsis_WEAPONS.md) | Que hace el sistema **hoy** | Al cambiar el codigo |
| **CONTRACTS** | [gsis_CONTRATOS.md](./gsis_CONTRATOS.md) | Como se comunican las piezas | Al cambiar un nombre de evento o un comando |
| **VERIFIED** | Este documento | **Que hizo GTA de verdad** | Al cambiar el motor, el runtime o el `.asi` |
| **HISTORY** | [GSIS_WEAPONS_DESIGN.md](./GSIS_WEAPONS_DESIGN.md) | Por que se eligio esto y no lo otro | No: es arqueologia y no se actualiza |

Un doc de API que no esta junto al codigo ni al test se desactualiza sin que nada
lo delate — y por eso el doc del runtime (SAWebUI) esta en su propio proyecto.
La misma regla, aplicada a los cuatro niveles.

**La trampa concreta que ordeno esto:** durante el debugging, "el contrato dice que
pasa" y "GTA lo hace" se leyeron como la misma afirmacion, y el codigo cumplia el
contrato a la perfeccion mientras el arma no se equipaba. Un doc que afirma
comportamiento verificado tiene que decir **como** se verifico, o vuelve a ser un
doc que afirma.
