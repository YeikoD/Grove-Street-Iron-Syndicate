# GSIS — Configuración de CLEO Redux

Guía de configuración del entorno de desarrollo y ejecución para Grove Street Iron Syndicate.

---

## 1. Prerrequisitos

La cadena de dependencias completa (incluyendo fastman92 LA, que hace falta para las variantes de arma) esta en
[gsis_REQUISITOS.md](./gsis_REQUISITOS.md). Esta seccion cubre solo la parte de CLEO Redux.

### GTA San Andreas
- **Versión requerida**: 1.0 US (executable `gta_sa.exe` original)
- **Verificación**: El juego debe cargar sin actualizaciones de Steam/RGL
- Si tenés versión Steam, necesitás [Ultimate ASI Loader](https://github.com/ThirteenAG/Ultimate-ASI-Loader/releases)

### CLEO Redux
- **Última versión estable** desde https://re.cleo.li/
- Archivos necesarios en la raíz del juego:
  - `cleo_redux.asi` (32-bit) o `cleo_redux64.asi` (64-bit)
  - `cleo/` directorio con `.config/` y plugins

### Plugins de CLEO Requeridos

Verificar que estos plugins existan en `cleo/cleo_plugins/`:

| Plugin | Propósito |
|---|---|
| `SA.GameEntities.cleo` | Acceso a entidades (Car, Char, Object) |
| `SA.MemoryOperations.cleo` | Lectura/escritura de memoria del proceso |
| `SA.Math.cleo` | Operaciones matemáticas avanzadas |
| `Events.cleo` / `Events64.cleo` | Sistema de eventos del juego |
| `SA.Input.cleo` / `Input64.cleo` | Detección de teclado |
| `SA.IniFiles.cleo` / `IniFiles64.cleo` | Lectura de archivos INI |
| `FxtLoader.cleo` / `FxtLoader64.cleo` | Carga de archivos FXT (`modloader/IronSyndicate/cleo/cleo_text/*.fxt`: `gsis.fxt` mensajes/UI y `gsis_dialog.fxt` diálogos — ver [gsis_L10N.md](./gsis_L10N.md)) |

### Otros ASI Recomendados

| Plugin | Propósito |
|---|---|
| `SilentPatchSA.asi` | Corrección de bugs del juego base |
| `modloader.asi` | Instalación drag-and-drop de mods |
| `GTASA.WidescreenFix.asi` | Soporte pantallas anchas |
| `FramerateVigilante.SA.asi` | Fix de física a altos FPS |

### Requeridos por la UI (no opcionales)

| Pieza | Dónde | Para qué |
|---|---|---|
| `modloader\SAWebUI\SAWebUI.SA.asi` | `modloader\SAWebUI\` | Dibuja la página del panel. Sin ella no se ve la UI |
| `modloader\SAWebUI\SAWebUICefHelper.exe` | `modloader\SAWebUI\` | Proceso renderer de CEF |
| `modloader\SAWebUI\cleo\cleo_plugins\SAWeb.cleo` | `modloader\SAWebUI\cleo\cleo_plugins\` | Registra los 8 comandos `SAWEB_*`. Sin él `native()` tira |
| Sección `saweb` en `cleo\.config\sa.json` | raíz del juego | Declara los comandos. **No es decorativa**: sin ella no se registran |
| `modloader\SAWebUI\cleo\SAWebUI\SAWeb.js` | `modloader\SAWebUI\cleo\SAWebUI\` | El facade que importa el mod |

Detalle de la API y del canal de retorno: [SAWEB_API.md](C:\Dev\SAWebUI\docs\SAWEB_API.md) y
[gsis_WEBUI.md §3](./gsis_WEBUI.md).

---

## 2. Configuración de `cleo.ini`

El archivo `cleo.ini` está ubicado en `cleo/.config/cleo.ini`. Debe configurarse así para GSIS:

```ini
[General]
AllowCs =1
AllowJs =1
AllowFxt =1
LogOpcodes =0
PermissionLevel =Lax

[Host]
EnableSelfHost=1
SelfHostFps=30

[Permissions]
mem=1
dll=0
fs=1
net=0
```

### Parámetros Críticos

| Parámetro | Valor | Explicación |
|---|---|---|
| `PermissionLevel` | `Lax` | Permite operaciones sensibles si el script las solicita |
| `mem` | `1` | Habilita lectura/escritura de memoria (necesario para detectar zona, calor policial, etc.) |
| `fs` | `1` | **OBLIGATORIO** — Habilita operaciones de archivo (lectura de config JSON, guardado de estado) |
| `dll` | `0` | No se necesita carga de DLLs externas |
| `net` | `0` | No se necesita acceso a red |

### Nota sobre `[fs]`

Sin `fs=1`, el mod NO puede:
- Leer archivos de configuración (`.json` con datos de propiedades, vehículos, etc.)
- Guardar el estado del jugador entre sesiones
- Cargar/permutar datos de progresión

**Si `fs=1` causa problemas**, se puede alternativamente usar variables globales SCM para persistencia básica (ver [Arquitectura](./gsis_ARCHITECTURE.md)).

> **Ojo — `[Permissions]` es inerte salvo en `Strict`.** Con `PermissionLevel=Lax` (el valor
> que usa esta instalación) las reglas de `[Permissions]` se ignoran por completo: lo que
> manda es que el script pida el token en su nombre o en `mod.json`
> (`Cleo Redux Docs\Introduccion.md`, sección de niveles de permiso). Un `fs=0` con
> `Lax` NO bloquea al mod, y por eso el `cleo.ini` de esta instalación puede dejar
> `fs=0` sin consecuencias. Los valores de `[Permissions]` soloFiltran cuando
> `PermissionLevel=Strict`.

---

## 3. Estructura de Permisos en Archivos

CLEO Redux permite declarar permisos de tres formas (en orden de precedencia).
**GSIS usa la opción C**, con una diferencia: el `mod.json` está en
`modloader\IronSyndicate\cleo\IronSyndicate\` y su `entries` apunta al shim con
un `../`, porque lo que CLEO escanea es el shim de la raíz de `cleo\`.

### Opción A: Sufijo en nombre de directorio — no se usa

```text
cleo/IronSyndicate[mem][fs]/index.js
```

Los scripts dentro de `IronSyndicate[mem][fs]/` heredan `mem` y `fs`. GSIS no
lo usa: el mod no vive en `cleo\`, vive en `modloader\`.

### Opción B: Sufijo en nombre de archivo — no se usa

```text
cleo/gsis_index[mem][fs].js
```

### Opción C: Manifiesto `mod.json` — la que usa GSIS

Contenido real de `modloader\IronSyndicate\cleo\IronSyndicate\mod.json`:

```json
{
  "name": "IronSyndicate",
  "version": "1.0.0",
  "description": "Grove Street Iron Syndicate - Mod para GTA San Andreas",
  "permissions": ["fs", "mem"],
  "entries": ["../[fs][mem]gsis_index.js"]
}
```

Los tokens `[fs][mem]` van en el **nombre** del shim (no en la carpeta): son los
que compran permisos, y por eso el shim se llama `[fs][mem]gsis_index.js`.

**Regla**: El sufijo del directorio tiene precedencia sobre `mod.json`.

---

## 4. Verificación de la Instalación

### Paso 1: Verificar archivos críticos

```
C:\Program Files\GTA SA\
├── gta_sa.exe                         ← Versión 1.0 US
├── cleo_redux.asi                     ← CLEO Redux 32-bit
├── SilentPatchSA.asi                  ← SilentPatch
├── modloader.asi                      ← Mod Loader
├── cleo\
│   ├── .config\
│   │   └── cleo.ini                   ← CONFIGURACIÓN (PermissionLevel)
│   ├── cleo_plugins\                  ← Plugins CLEO
│   └── [fs][mem]gsis_index.js         ← SHIM (obligatorio, ver abajo)
└── modloader\
    ├── modloader.ini
    └── IronSyndicate\                 ← El mod, instalado acá
        ├── KeepNoAmmo.SA.asi
        ├── models\ UI\ sounds\s\
        └── cleo\
            ├── [fs][mem]gsis_index.js  ← Entry real
            ├── cleo_text\*.fxt
            └── IronSyndicate\
                ├── mod.json
                ├── core\ data\ modules\
                └── saves\             ← Guardados del mod
```

### El shim: por qué el mod no vive en `cleo\`

El mod **no** puede vivir dentro de `cleo\`, y CLEO tampoco lo baja de `modloader\`:

| Regla | Consecuencia |
|---|---|
| El script loader de CLEO Redux solo escanea el **nivel superior** de `cleo\` | Un `.js` en `modloader\IronSyndicate\cleo\IronSyndicate\` o en `modloader\...` no se auto-carga |
| Mod Loader 0.3.10 (`std.asi`) solo inyecta `asi`, `dll`, `cs3`, `cs4`, `cs5` | Ningún `.js` es inyectado desde `modloader\`, esté donde esté |
| Mod Loader ignora scripts CLEO dentro de subcarpetas `cleo\` | `modloader\X\cleo\script.js` está doblemente descartado |

Por eso el código real se empaqueta en `modloader\IronSyndicate\cleo\` (para que el mod
sea instalable y versionable como una unidad) y queda **un solo archivo** en la raíz de
`cleo\`, el shim, que CLEO sí encuentra:

```js
// cleo\[fs][mem]gsis_index.js
import "../modloader/IronSyndicate/cleo/[fs][mem]gsis_index.js";
```

**Ese archivo es el requisito.** Sin él el mod no carga, y no hay error visible en
pantalla: el log simplemente nunca muestra el banner. Si se reinstala el juego, se
cambia de PC o se borra `cleo\`, hay que volver a ponerlo.

Consecuencias prácticas de trabajar desde `modloader\`:

- Los **guardados** quedan en `modloader\IronSyndicate\cleo\IronSyndicate\saves\`
  (`SaveManager` usa `__dirname`), no en `cleo\`.
- Los **imports** del shim son la ruta al entry real: si el mod se renombra o se mueve de
  carpeta, hay que actualizar **esa única línea**.
- **Editar el mod** se hace directamente en `modloader\IronSyndicate\cleo\IronSyndicate\`.
  El shim no se toca nunca salvo que cambie la ruta.
- **Hot reload** de CLEO Redux solo vigila `cleo\`: los cambios en `modloader\`
  necesitan **reiniciar el juego**. (`F4` refresca Mod Loader, no recarga el grafo JS.)
- Los `.fxt` de `cleo_text\` son **opcionales**: `gsis_L10n.js` puebla `FxtStore` desde
  `gsis_lang_data.js` en runtime.

### Paso 2: Ejecutar el juego y verificar

1. Iniciar GTA San Andreas
2. Iniciar una partida (nueva o cargada)
3. Abrir `cleo_redux.log` en la raíz del juego
4. Verificar que no hay errores de carga de plugins

Mensajes esperados en el log:
```
Found JS script C:\Program Files\GTA SA\CLEO\[fs][mem]gsis_index.js
========Grove Street Iron Syndicate=========
[L10n] Inicializado lang=es
[GSIS] Modulos registrados: 17
```

Si aparece `Found JS script` pero no el banner, el import del shim está roto (ruta
cambiada). Si no aparece `Found JS script`, el shim no está en la raíz de `cleo\`.

### Paso 3: Probar hot reloading

1. Crear `cleo/[fs][mem]gsis_test.js` (en la **raíz** de `cleo\`, no en una subcarpeta):
```javascript
log("GSIS TEST OK");
wait(0);
```
2. Volver al juego, jugar unos segundos
3. Revisar `cleo_redux.log` — debe aparecer "GSIS TEST OK"
4. Editar el mensaje, guardar, verificar que se actualiza sin reiniciar

Esto solo funciona para archivos en `cleo\`. Para probar cambios en el código del mod
(`modloader\...`) hay que reiniciar el juego.

---

## 5. Solución de Problemas

### "El mod no carga" / no aparece el banner
Síntoma: el juego arranca normal, no hay errores, pero GSIS no existe. Es el fallo
típico, y **no** muestra ningún error en pantalla.

1. ¿Está `cleo\[fs][mem]gsis_index.js`? Sin ese archivo el mod no puede cargar.
2. ¿El `import` del shim apunta a la ruta real del entry?
   `Select-String -LiteralPath 'cleo\[fs][mem]gsis_index.js' -Pattern 'import'`
3. ¿Está el entry en `modloader\IronSyndicate\cleo\`? Moviste el mod de carpeta → shim roto.
4. En `cleo.log`, la lista `Listing CLEO scripts:` debe incluir el shim. Si no está,
   CLEO no lo vio.

### "Script no carga"
- Verificar que el archivo tenga extensión `.js`
- Verificar que esté en el **nivel superior** de `cleo\` (no en subcarpetas)
- Revisar `cleo_redux.log` para errores de sintaxis
- Confirmar que `PermissionLevel=Lax` en `cleo.ini`

### "Permiso denegado" / "Unsafe operation blocked"
- Con `PermissionLevel=Strict`: verificar `mem=1` y `fs=1` en `[Permissions]`
- Con `PermissionLevel=Lax`: `[Permissions]` se ignora; el permiso depende solo de los
  tokens `[mem]`/`[fs]` en el nombre del archivo/directorio o de `mod.json`
- Verificar que el shim conserve el nombre `cleo\[fs][mem]gsis_index.js` (es el que
  compra los permisos de todo el grafo importado)

### "No se encuentran archivos de configuración"
- Con `PermissionLevel=Strict`: verificar `fs=1` en `cleo.ini`
- Verificar rutas relativas con `__dirname` (los guardados se resuelven desde el
  archivo que los usa, no desde el shim)

### "Juego crashea al cargar"
- Verificar que la versión de GTA SA sea 1.0 US
- Desactivar temporalmente otros ASI plugins para aislar el problema
- Revisar `cleo.log` (CLEO clásico) y `cleo_redux.log` (CLEO Redux)

### Logs de debug
- `cleo.log` — Log de CLEO clásico
- `cleo_redux.log` — Log de CLEO Redux (aquí van nuestros logs)
- Ubicación: raíz del juego o `C:\Users\acs20\AppData\Roaming\CLEO Redux\`

---

## 6. Comandos Útiles de Desarrollo

### Forzar tiempo del juego
```javascript
native("SET_TIME_OF_DAY", 12, 0); // Mediodía
```

### Dar dinero al jugador para pruebas
```javascript
native("ADD_SCORE", 0, 1000000); // +$1,000,000
```

### Spawnear vehículo de prueba
```javascript
const car = Car.Create(482, 0.0, 0.0, 0.0); // Burrito
```

### Teletransportar a zona de prueba
```javascript
const player = new Player(0);
player.setCoordinates(2495.0, -1690.0, 13.5); // Ganton
```

### Activar trace de opcodes
```javascript
CLEO.debug.trace(true); // Log detallado en cleo_redux.log
CLEO.debug.trace(false); // Desactivar
```
