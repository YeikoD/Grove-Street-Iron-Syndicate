# Grove Street Iron Syndicate (GSIS)

Mod de simulación criminal y económica para **GTA San Andreas**, escrito en JavaScript
para [CLEO Redux](https://re.cleo.li/).

GSIS agrega al juego una capa de economía sucia: dinero limpio y sucio, propiedades,
un arsenal que se administra con inventario, venta de armas, trueque con NPCs,
flotas de vehículos con baúl propio y diálogos propios.

## Módulos

17 módulos registrados en runtime, cada uno con su `init()` y/o `update()` por frame:

| Módulo | Qué hace |
|---|---|
| `Spawner` | Genera NPC, vehículos y puntos de interés |
| `Actors` / `ActorAnims` | Peds del sindicato, sus animaciones y estados |
| `Characters` | Datos de personajes y comportamiento reactivo |
| `Items` / `Bag` | Inventario y objetos del jugador |
| `Trunk` | Baúl de vehículos con persistencia |
| `Ballistic` / `FireButton` | Disparo, daño y retroceso |
| `WeaponDealer` / `WeaponSeller` / `DealerPickup` | Comercio de armas |
| `PropertyModule` / `Documents` | Propiedades y documentación |
| `EngineLock` | Bloqueo y arranque de vehículos |
| `Dialogue` | Diálogos y textos en pantalla |
| `Vehicles` | Utilidades de vehículos |

## Requisitos

- GTA San Andreas **1.0 US**
- [CLEO Redux](https://re.cleo.li/) 32-bit (`cleo_redux.asi` + carpeta `cleo/`)
- Plugins: `SA.GameEntities.cleo`, `SA.MemoryOperations.cleo`, `SA.FileSystemOperations.cleo`,
  `SA.IniFiles.cleo`, `SA.Input.cleo`, `SA.Text.cleo`
- Opcional: `SilentPatchSA.asi`, `GTASA.WidescreenFix.asi`, `FramerateVigilante.SA.asi`,
  `modloader.asi` (Mod Loader)

## Instalación

El código del mod va en la carpeta del mod, y **un shim va en la raíz de `cleo\`**:

```
GTA SA\
├── cleo\
│   ├── .config\cleo.ini
│   ├── cleo_plugins\
│   └── [fs][mem]gsis_index.js        ← shim (obligatorio)
└── modloader\
    └── IronSyndicate\                ← el mod
        ├── KeepNoAmmo.SA.asi
        ├── image\ sounds\
        └── cleo\
            ├── [fs][mem]gsis_index.js  ← entry real
            ├── cleo_text\
            └── IronSyndicate\
                ├── mod.json
                ├── core\ data\ modules\
                └── saves\
```

### Por qué el shim es obligatorio

| Regla | Consecuencia |
|---|---|
| El script loader de CLEO Redux solo escanea el **nivel superior** de `cleo\` | Un `.js` en `cleo\IronSyndicate\` o en `modloader\...` no se auto-carga |
| Mod Loader 0.3.10 (`std.asi`) solo inyecta `asi`, `dll`, `cs3`, `cs4`, `cs5` | Ningún `.js` es inyectado desde `modloader\` |
| Mod Loader ignora scripts CLEO dentro de subcarpetas `cleo\` | `modloader\X\cleo\script.js` está doblemente descartado |

El shim es un `import` de una línea:

```js
// cleo\[fs][mem]gsis_index.js
import "../modloader/IronSyndicate/cleo/[fs][mem]gsis_index.js";
```

**Sin ese archivo el mod no carga**, y no hay error visible: el log simplemente nunca
muestra el banner `========Grove Street Iron Syndicate=========`. Además, su nombre
`[fs][mem]` es lo que concede los permisos de todo el grafo importado.

## Desarrollo

- Se edita directamente en `modloader\IronSyndicate\cleo\IronSyndicate\`.
- El hot reload de CLEO Redux solo vigila `cleo\`: los cambios en `modloader\`
  necesitan **reiniciar el juego**. `F4` refresca Mod Loader, no el grafo JS.
- Los guardados se resuelven con `__dirname` (`core\gsis_SaveManager.js`) y quedan en
  `modloader\IronSyndicate\cleo\IronSyndicate\saves\`.

Verificación rápida sin abrir el juego (resuelve el grafo de imports y corta en el
primer global de CLEO):

```powershell
node -e "import('file:///C:/Program%20Files/GTA%20SA/cleo/%5Bfs%5D%5Bmem%5Dgsis_index.js').catch(e=>console.log(e.name, e.message))"
# ReferenceError log is not defined  → Imports OK, fallo en global de CLEO
```

## Licencia

El código de este proyecto está bajo la **GNU General Public License v3.0** — ver
[`LICENSE`](LICENSE).

Eso significa que podés usar, modificar y redistribuir el mod, siempre que:

- los derivados también se publiquen bajo GPLv3,
- se mantenga esta licencia y los avisos de copyright,
- se marque claramente cuándo una versión fue modificada.

## Assets de terceros

Estos archivos **no forman parte de este proyecto y no están cubiertos por la GPLv3**.
Son de terceros: no son nuestros, así que no se redistribuyen con este repo (están en
`.gitignore`).

| Archivo | Qué es | Si falta |
|---|---|---|
| `models\fam4.dff`, `fam4.txd`, `fam5.dff`, `fam5.txd` | Modelos de peds de origen desconocido | El mod funciona; esos peds salen sin modelo propio |
| `KeepNoAmmo.SA.asi` | ASI de otro autor, conservado para que las armas no pierdan munición al recargar | El módulo `Ballistic` sigue andando, pero el comportamiento de munición cambia |

Si los conseguiste por tu cuenta, ponelos en `modloader\IronSyndicate\`; el juego los
monta desde ahí vía Mod Loader.

Lo que **sí** se distribuye con el mod: el código (`cleo\`, `modloader\...\cleo\`) y
`image\*.png`, `sounds\dryfire.wav`.

## Agradecimientos

- [CLEO Redux](https://re.cleo.li/) y el equipo de CLEO
- SilentPatch, y ThirteenAG por Ultimate ASI Loader y Mod Loader
- El autor de `KeepNoAmmo.SA.asi`
