# GSIS — Requisitos y dependencias

Cadena de dependencias del mod: que hace falta, donde va, en que orden se instala y que se rompe si falta algo.

Este es el documento canonico de dependencias. La configuracion de CLEO Redux y la lista de plugins viven en
[gsis_SETUP.md](./gsis_SETUP.md). El estado de las variantes de arma vive en
[gsis_WEAPONS.md](./gsis_WEAPONS.md).

---

## 1. Como verificar el estado actual

Desde la raiz del juego, en PowerShell:

```powershell
$gta = "C:\Program Files\GTA SA"

# ASI en la raiz (los carga Silent's ModLoader)
Get-ChildItem -LiteralPath $gta -File -Filter *.asi | Select-Object -ExpandProperty Name

# ASI en modloader\
Get-ChildItem -LiteralPath "$gta\modloader" -File -Filter *.asi | Select-Object -ExpandProperty Name

# Piezas de SAWebUI
Get-ChildItem -LiteralPath "$gta\modloader\SAWebUI" -File -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Name

# fastman92 LA: el INI y el archivo de tabla
Test-Path -LiteralPath "$gta\fastman92limitAdjuster_GTASA.ini"
Test-Path -LiteralPath "$gta\data\gtasa_weapon_config.dat"

# CLEO+ vive como plugin .cleo, NO como .asi (ver seccion 4)
Test-Path -LiteralPath "$gta\cleo\cleo_plugins\CLEO+.cleo"
```

---

## 2. Dependencias obligatorias

| Componente | Ubicacion | Estado | Para que lo necesita GSIS |
|---|---|---|---|
| GTA San Andreas 1.0 US | raiz | instalado | Base. Con version Steam hace falta Ultimate ASI Loader |
| `modloader.asi` | raiz | instalado | **Silent's ModLoader + ASI Loader en uno.** Escanea `modloader\**\*.asi`, carga los scripts CLEO de cada mod y resuelve permisos `fs` / `mem` |
| `SilentPatchSA.asi` | raiz | instalado | Fixes del juego base que el mod da porsentados |
| `CLEO.asi` | raiz | instalado | CLEO 5. Corre los opcodes `.cleo` y el entry `[fs][mem]gsis_index.js` |
| `cleo_redux.asi` | raiz | instalado | Runtime de JavaScript (ES2020). **No es opcional**: todo el logica de negocio del mod es `.js` |
| `modloader\SAWebUI\` | modloader | instalado | Panel web del mod. Sin el, la UI no se dibuja |
| `modloader\IronSyndicate\KeepNoAmmo.SA.asi` | mod | instalado | Impide que el motor consuma la municion de las armas del mod al dispararlas |

### Piezas de SAWebUI (todas necesarias)

| Archivo | Para que |
|---|---|
| `SAWebUI.SA.asi` | Dibuja la pagina del panel. Sin el no se ve la UI |
| `SAWebUICefHelper.exe` | Proceso renderer de CEF |
| `libcef.dll` (raiz) | Runtime de CEF |
| `cleo\cleo_plugins\SAWeb.cleo` | Registra los 8 comandos `SAWEB_*`. Sin el `native()` tira |
| Seccion `saweb` en `cleo\.config\sa.json` | Declara los comandos. No es decorativa: sin ella no se registran |

---

## 3. fastman92 Limit Adjuster — DESCARTADO

**Estado: no se usa. Desinstalado de la maquina.** Archivos apartados en
`%TEMP%\opencode\fla_aplazado\` por si algun dia se retoma.

GSIS crearia variantes de arma como tipos de arma reales del juego, no como objetos con estadisticas
paralelas. En GTA San Andreas la tabla de tipos esta cableada en el ejecutable, sin margen para crecer: los
tipos 0-79 estan **todos ocupados**, medido sobre `gta_sa.exe` (ver `gsis_WEAPONS_tabla_medida.txt`). El
limite lo levanta **fastman92 Limit Adjuster**, que no agranda la tabla en memoria sino que **reemplaza el
loader** de `data\weapon.dat` y agrega `data\gtasa_weapon_config.dat`, donde cada tipo lleva su ID explicito.

Se intento y **rompio el arranque del juego**. La evidencia de ese intento:

- `fastman92limitAdjuster.log` se creo vacio (0 bytes) en el arranque.
- ModLoader registro `Shutting down Mod Loader...` / `Mod Loader has been shutdown.`, o sea salida limpia, no
  crash de driver.
- `data\gtasa_weapon_config.dat` nunca llego a generarse.
- `cleo_redux.log` corta en `Registering unsafe command FREE_DYNAMIC_LIBRARY`.

El conflicto es con **CLEO+**, que esta instalado y activo como `cleo\cleo_plugins\CLEO+.cleo`.

### Decision

**CLEO+ se queda. FLA no entra.** Son dos piezas que la maquina necesita y no son intercambiables:
CLEO+ es parte del entorno de trabajo; el type loader de FLA es la unica via que se conoce para registrar
tipos de arma nuevos, y es incompatible con CLEO+.

Como el codigo del mod no depende de CLEO+, la pregunta tecnica era si Sacrificearlo. La respuesta fue que no:
se conserva CLEO+ y las variantes siguen por la via de cargadores.

### Si algun dia se retoma

Archivos en `%TEMP%\opencode\fla_aplazado\`: el `.asi` (sin el `$` del empaquetado), `MinHook.x86.dll`,
`DllTricks.dll`, `zlib1.dll` (las tres son obligatorias) y el `.ini` ya configurado:

```ini
[WEAPON LIMITS]
Enable weapon type loader = 1
Weapon type loader, number of type IDs = 120
```

`120` deja 40 tipos libres (80-119). El minimo que acepta FLA es 70. `255` es el maximo pratico: por encima
avisa `Number of weapon types over 255 and requires something more than uint8_t` y aplica parches uint32_t
adicionales. Requiere quitar CLEO+ antes de probar.

### Licencia

FLA es binario cerrado de fastman92 y su descarga esta detras de login en GTAForums. Decidir si viaja dentro del
mod o se documenta como instalacion aparte del usuario es una decision de distribucion, no de codigo.

---

## 4. NO requerido

| Componente | Razon |
|---|---|
| `The-Definitive-UI.SA.asi` | Esta instalado pero **no es dependencia**. El mod no lo lee ni lo invoca |
| `skygfx.asi` | Esta instalado pero **no es dependencia**. Ademas esta en la lista de ignorados de `modloader.ini` |

Los dos estan en la maquina por decision del usuario, no porque GSIS los necesite. Su presencia no se debe
documentar como requisito.

`CLEO+.cleo` **si es parte del entorno** y se conserva. No es dependencia del codigo del mod —sus 4 menciones
en `cleo\IronSyndicate\` y `UI\` son comentarios que describen opcodes (`0E83`, `0E84`, `0E9A`), ninguna es una
llamada, y las clases `Weapon` / `WeaponInfo` que usa el mod son de cleo_redux— pero se queda porque se usa en
el resto del trabajo de la maquina. Lo que si **no** se puede combinar es CLEO+ con el type loader de FLA
(seccion 3).

---

## 5. Orden de instalacion

1. GTA San Andreas 1.0 US limpio
2. `modloader.asi` en la raiz
3. `SilentPatchSA.asi` en la raiz
4. `CLEO.asi` + `cleo_redux.asi` en la raiz
5. `cleo\cleo_plugins\CLEO+.cleo` (parte del entorno, ver seccion 4)
6. Carpeta `cleo\` con `.config\cleo.ini` y `.config\sa.json` (ver `gsis_SETUP.md`)
7. `modloader\SAWebUI\` completa
8. Carpeta `modloader\IronSyndicate\` completa

SAWebUI antes que el mod: el entry del mod registra comandos `SAWEB_*` y la seccion `saweb` del `sa.json` tiene
que existir antes de que corra el entry.

---

## 6. Que se rompe si falta cada pieza

| Falta | Sintoma |
|---|---|
| `modloader.asi` | El mod no se carga. No hay nada de GSIS |
| `CLEO.asi` | No corre el entry `.js`. El mod no aparece |
| `cleo_redux.asi` | El entry `.js` no se ejecuta. Sin logica de negocio |
| `SilentPatchSA.asi` | El mod carga, pero bugs del juego base producen crashes impredecibles |
| `SAWebUI.SA.asi` | El panel no se dibuja. Los comandos `SAWEB_*` no responden |
| `SAWeb.cleo` | `native()` tira al llamar a cualquier comando de la UI |
| Seccion `saweb` del `sa.json` | Los comandos no se registran, mismo sintoma que la fila anterior |
| `FxtLoader.cleo` | Sin `.fxt`: todos los textos salen vacios o con la clave |
| `KeepNoAmmo.SA.asi` | Las armas del mod gastan municion real al disparar |
| `CLEO+.cleo` | El resto del entorno sigue andando. El mod no lo llama |

---

## 7. Declaracion machine-checkable

`modloader\IronSyndicate\cleo\IronSyndicate\mod.json` hoy declara solo permisos y entry:

```json
{
  "name": "IronSyndicate",
  "version": "1.0.0",
  "permissions": ["fs", "mem"],
  "entries": ["../[fs][mem]gsis_index.js"]
}
```

Las dependencias de este documento son de nivel de instalacion, no de mod: las chequea el usuario o un script de
setup, no el loader. Por eso viven en markdown y no en `mod.json`.

---

Ver tambien: [gsis_SETUP.md](./gsis_SETUP.md) — configuracion de CLEO Redux y plugins.
Ver tambien: [gsis_README.md](./gsis_README.md) — vision general del mod.
Ver tambien: [gsis_WEAPONS.md](./gsis_WEAPONS.md) — catalogo de armas y variantes.
