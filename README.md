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
- **SAWebUI** (la interfaz es una página web): `modloader\SAWebUI\` con
  `SAWebUI.SA.asi`, `SAWebUICefHelper.exe` y `cleo\cleo_plugins\SAWeb.cleo`.
  Además, la sección `"saweb"` en `cleo\.config\sa.json` — sin ella los 8 comandos
  `SAWEB_*` no se registran y `native()` falla.
- Opcional: `SilentPatchSA.asi`, `GTASA.WidescreenFix.asi`, `FramerateVigilante.SA.asi`,
  `modloader.asi` (Mod Loader)

## Instalación

El código del mod va en la carpeta del mod, y **un shim va en la raíz de `cleo\`**:

```
GTA SA\
├── cleo\
│   ├── .config\cleo.ini
│   ├── .config\sa.json              ← sección "saweb" (8 comandos)
│   ├── cleo_plugins\
│   └── [fs][mem]gsis_index.js        ← shim (obligatorio)
└── modloader\
    ├── SAWebUI\                      ← runtime de la UI web
    └── IronSyndicate\                ← el mod
        ├── KeepNoAmmo.SA.asi
        ├── image\ sounds\
        ├── UI\                       ← index.html + app.js + style.css
        └── cleo\
            ├── [fs][mem]gsis_index.js  ← entry real
            ├── cleo_text\
            └── IronSyndicate\
                ├── mod.json
                ├── core\ data\ modules\ ui\
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
No son nuestros, así que no se versionan en este repo (ver `.gitignore`); se entregan
aparte, en el ZIP de descarga.

### `KeepNoAmmo.SA.asi`

- **Qué es:** la parte de *hooks* (ASI) del mod [KeepNoAmmo][keepnoammo] de
  **Junior_Djjr** (Valdir da Costa Junior). Hace que el arma no desaparezca del
  inventario al quedarse sin munición, e incluye un "click" al intentar disparar vacío.
- **Qué se incluye:** solo el `.asi`, sin el script CLEO del autor, porque GSIS ya
  implementa cargadores, recarga y munición en su propio módulo `Ballistic`.
- **Modificaciones:** ninguna. El archivo va tal cual.
- **Licencia:** el autor no publica una licencia para este mod. La mayoría de sus
  demás mods están bajo MIT. Se le pidió permiso explícito para redistribuirlo;
  hasta que responda, el `.asi` no se incluye en el ZIP de descarga.
- **Nota funcional:** el mod original desactiva la función de soltar armas
  (TAB+N) del mod *Weapon Drop 'N Save*, porque usa el mismo comando.

### `models\fam4.*` y `models\fam5.*`

Modelos de peds de origen desconocido, extraídos del juego. **No se distribuyen**:
no son nuestros ni son de Rockstar. Copialos de tu propia instalación si los
necesitás; el mod funciona sin ellos, solo esos peds salen sin modelo propio.

## Créditos

- **[CLEO Redux][cleoredux]** y el equipo de CLEO
- **SilentPatch**, y **ThirteenAG** por Ultimate ASI Loader y Mod Loader
- **[Junior_Djjr][junior]** (Valdir da Costa Junior) por el mod
  [KeepNoAmmo][keepnoammo], del que GSIS incluye la parte de hooks

[cleoredux]: https://re.cleo.li/
[junior]: https://github.com/JuniorDjjr
[keepnoammo]: https://www.mixmods.com.br/2020/03/keepnoammo-continuar-sem-municao/
