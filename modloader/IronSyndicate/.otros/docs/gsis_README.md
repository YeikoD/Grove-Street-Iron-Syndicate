# Grove Street Iron Syndicate (GSIS)

**Mod para GTA San Andreas — CLEO Redux (JavaScript ES2020)**

---

## Visión General

Grove Street Iron Syndicate es un mod de simulación económica criminal activa para GTA San Andreas. El jugador construye y administra una red de producción, transporte y lavado de dinero desde las calles de Los Santos hasta el dominio territorial de Las Venturas.

### Gameplay Loop Core

```
Recolectar/Producir → Almacenar/Estructurar → Transportar con Riesgo → Lavado/Reinversión → Equipar Banda/Expansión
```

### Evolución del Gameplay

| Fase | Ubicación | Desbloqueo |
|---|---|---|
| **1 — Clandestinidad** | Los Santos | Talleres, armas artesanales, Pony |
| **2 — Logística** | San Fierro | Fábricas, importación, Burrito/Rumpo |
| **3 — Dominio** | Las Venturas | Grandes almacenes, red bancaria completa |

Para development milestones ver [gsis_ROADMAP.md](./gsis_ROADMAP.md).

---

## Requisitos

Ver [gsis_REQUISITOS.md](./gsis_REQUISITOS.md) para la cadena de dependencias completa: que componente hace falta, en que orden se instala y que se rompe si falta cada uno.

Ver [gsis_SETUP.md](./gsis_SETUP.md) para la configuración de CLEO Redux y la lista de plugins.

---

## Estructura del Proyecto

```
modloader/IronSyndicate/
├── cleo/
│   ├── [fs][mem]gsis_index.js                ← Punto de entrada: solo registry + loop
│   ├── cleo_text/                            ← Fallback ES de FXTStore
│   │   ├── gsis.fxt                          ← Mensajes/UI
│   │   └── gsis_dialog.fxt                   ← Diálogos/subtítulos
│   └── IronSyndicate/
│       ├── core/                             ← Infraestructura
│       │   ├── gsis_SaveManager.js           ← Persistencia + cache por frame
│       │   ├── gsis_SaveMigration.js         ← Version del save + migradores registrados
│       │   ├── gsis_Config.js                ← Teclas, distancias, timers, limites
│       │   ├── gsis_EventBus.js              ← Pub/sub + query entre modulos
│       │   ├── gsis_EventNames.js            ← Los nombres de evento que cruzan modulos
│       │   ├── gsis_Input.js                 ← DUENO del teclado: supresion, menus, freeze del player
│       │   ├── gsis_ModuleRegistry.js        ← Init/update automatico
│       │   ├── gsis_SpotRuntime.js           ← Esferas: gate, ciclo de vida, cooldown, spotCanOpen/closeSpotFlow
│       │   ├── gsis_Engine.js                ← El unico camino a la memoria de CWeapon/CWeaponInfo
│       │   ├── gsis_Notice.js                ← El aviso de una accion, que viaja con el snapshot
│       │   └── gsis_L10n.js                  ← t(key), initL10n, FxtStore (es/en)
│       ├── modules/                          ← Logica de negocio (sin imports entre si)
│       │   ├── gsis_Spawner.js               ← Registro O, handles, spawn async
│       │   ├── gsis_EngineLock.js            ← Motor + lock + blips (1, 2)
│       │   ├── gsis_Trunk.js                 ← Baules, spheres, menu (3, ESPACIO)
│       │   ├── gsis_Vehicles.js              ← Save throttle + F5
│       │   ├── gsis_Documents.js             ← Documentos del inventario
│       │   ├── gsis_PropertyModule.js        ← Compra/listado de propiedades
│       │   ├── gsis_Bag.js                   ← Bolso visual (P, requiere arma larga)
│       │   ├── gsis_Actors.js                ← Spawn peds (permanent/descartable/especial)
│       │   ├── gsis_ActorAnims.js            ← Animaciones actores IFP vanilla (anims:*)
│       │   ├── gsis_Dialogue.js              ← Subtitulos 00BB (dialogue:*)
│       │   ├── gsis_Characters.js            ← Personajes: nombre + líneas + actor (characters:*)
│       │   ├── gsis_WeaponDealer.js          ← Dealer: carrito + checkout (ESPACIO)
│       │   ├── gsis_DealerPickup.js          ← Retiro: esfera + blip + pedido (ESPACIO)
│       │   ├── gsis_WeaponSeller.js          ← Trueque NPC: intereses + budget (ESPACIO)
│       │   ├── gsis_FireButton.js            ← Boton disparo con arma vacia + click seco
│       │   │
│       │   ├── inventory/                    ← items[], trunks{}, cinturon, peso
│       │   │   ├── index.js                  ← register("Items") + la superficie publica
│       │   │   ├── state.js                  ← Los contenedores (SAVE_KEY = "ItemManager")
│       │   │   ├── logic.js                  ← add/remove, baul, cinturon
│       │   │   └── events.js                 ← Los handlers items:* que atiende
│       │   │
│       │   ├── weapons/                      ← equipped[slot], equipar, montar, recargar
│       │   │   ├── index.js                  ← register("Weapons") + la tecla R
│       │   │   ├── state.js                  ← La configuracion (SAVE_KEY = "Ballistic")
│       │   │   ├── logic.js                  ← equipar, desequipar, montar, tryReload
│       │   │   ├── internal.js               ← El unico punto que le da un arma al motor
│       │   │   ├── reconcile.js              ← Que el ped y el registro coincidan
│       │   │   ├── models.js                 ← ensureModelForType + cola de modelos propios
│       │   │   ├── migrate.js                ← Migracion v1→v2; se registra al importarse
│       │   │   └── events.js                 ← Los nombres que weapons emite
│       │   │
│       │   └── ui/                           ← La pagina web (CEF/SAWeb)
│       │       ├── index.js                  ← Estado, teclas y los dos pushes
│       │       ├── bridge.js                 ← El cable: send / pushChunked / drainCommands
│       │       ├── commands.js               ← Que significa cada verbo de la pagina
│       │       └── views/
│       │           ├── inventory.js          ← snapInventory()  ("inv")
│       │           ├── catalog.js            ← snapCatalog()    ("catalog")
│       │           ├── flow.js               ← currentFlow / openFlow / closeFlow + snapFlow() ("screen")
│       │           └── itemRow.js            ← La fila de la tabla, compartida por las 5 pantallas
│       │
│       ├── data/                             ← Datos estaticos
│       │   ├── gsis_vehicle_data.js
│       │   ├── gsis_item_data.js
│       │   ├── gsis_weapons.js               ← FAMILIAS + CARGADORES + SILENCIADORES + MUNICION: una familia por item, el tipo se deriva, la bala llena el cargador
│       │   ├── gsis_actor_data.js            ← Modelos/tareas/lifetime/spawn/idleAnim de peds
│       │   ├── gsis_actor_anim_data.js       ← Catalogo anims actores (IFP vanilla)
│       │   ├── gsis_character_data.js        ← Personajes: nameKey, actorId, lines
│       │   ├── gsis_spot_data.js             ← Esferas (dealer/seller/pickup) — independiente
│       │   ├── gsis_web_data.js              ← Iconos y bandas de la tabla web
│       │   ├── gsis_lang_data.js             ← STRINGS es/en (L10n, keys ≤7)
│       │   └── gsis_property_data.js
│       ├── saves/
│       └── mod.json
├── UI/                                      ← Pagina web que dibuja la ASI (HTML/CSS/JS)
│   ├── index.html
│   ├── app.js                                ← Estado + render + contrato del bridge
│   ├── style.css                             ← Tokens de color/tipografía (fuente unica)
│   └── assets/                               ← fonts/ + iconos/ + keys_info/
├── UI/assets/    Iconos PNG: imagenes/, imagenes/weapons/, iconos/categorias/                                   ← Iconos PNG de items
├── models/  sounds/
├── gsis_weapons.dat                          ← Las filas de arma que declara gsis_weapons.js
├── gsisWeaponLimiter.asi                     ← Escribe la CWeaponInfo (la capacidad la lee de aca)
├── KeepNoAmmo.SA.asi
└── AGREGAR_ARMAS.md                          ← Guía completa para crear un arma, de la familia a la bala y sus accesorios

cleo/
└── [fs][mem]gsis_index.js                    ← Shim: el scanner de CLEO solo lee la raiz de cleo\

modloader/IronSyndicate/.otros/docs/            ← Documentacion
    ├── gsis_README.md                        ← Este archivo
    ├── gsis_SETUP.md
    ├── gsis_ARCHITECTURE.md                  ← Arquitectura de codigo
    ├── gsis_MAINTENANCE.md                   ← Reglas, checklists, politica deuda
    ├── gsis_CONTRATOS.md                     ← El bus entre inventory/ y weapons/, evento por evento
    ├── gsis_WEBUI.md                         ← UI web CEF: contrato, troceado, limites
    ├── gsis_INPUT.md                         ← Teclado y menus: supresion, freeze, el dueño del input
    ├── gsis_INVENTORY.md                     ← Inventario, cinturon, baul, recarga, persistencia
    ├── gsis_WEAPONS.md                       ← Familias, accesorios, variantes, y el estado real
    ├── gsis_WEAPONS_VERIFICADO.md            ← Que esta comprobado y que no
    ├── gsis_ROADMAP.md
    ├── gsis_TESTING.md
    ├── gsis_L10N.md                          ← Localizacion es/en (t(), FXT)
    ├── gsis_ACTORS.md
    ├── gsis_ACTORANIMS.md                    ← Animaciones de actores (IFP vanilla)
    ├── gsis_CHARACTERS.md                    ← Personajes (nombre + dialogos + actor)
    ├── gsis_SPOTS.md
    └── ... (docs de diseno: ECONOMY, PROPERTIES, VEHICLES, BANKING, ...)

.IronSyndicate/tools/                          ← Checks del repo (node, antes de commitear)
    ├── check-dat.mjs                        ← Tabla de armas vs .dat vs .asi vs items vs iconos
    ├── inventario.mjs                       ← Reglas del inventario: apilado, instanciado, peso
    └── smoke.mjs                            ← Carga de los modulos sin motor
    └── (fake-engine.mjs, check-ui-flow.mjs, check-migration.mjs: NO existen. El
        motor falso se perdio y nadie reescribio las pruebas que lo usaban.
        `smoke.mjs` es lo que queda y no cubre el flujo de armas.)

C:\Dev\SAWebUI\docs\                         ← Documentacion del RUNTIME (otro proyecto)
    ├── README.md                             ← Indice del runtime
    ├── SAWEB_API.md                          ← API publica congelada (exports, comandos, facade)
    ├── GUIA_WEB_CEF_ASI.md                   ← Como escribir una pagina para que ande en el juego
    ├── ASI.md                                ← La ASI: render, input, contexto
    ├── SAWEB_V2.md                           ← El canal de retorno (pagina → CLEO)
    └── PERF.md                               ← Rendimiento medido
```

**Regla de dependencias:** `ui/ → modules/ → core/ → data/` (nunca al reves).
**Entre modulos:** solo EventBus (`emit`/`on`/`query`), nunca import directo. La
excepcion acotada son `inventory/` y `weapons/`, que se hablan por el bus y cuyos
nombres estan en `core/gsis_EventNames.js`; que no se importen entre si lo
verifica `tools/check-ui-flow.mjs`, no es una convencion.
**UI:** página web en `UI\`, servida por `SAWebUI.SA.asi` (ver [gsis_WEBUI.md](./gsis_WEBUI.md)).

Las dos documentaciones están separadas por proyecto: esta es la del **mod**,
la del **runtime** (SAWebUI) vive con su código, en `C:\Dev\SAWebUI\docs\`. El
motivo es que la API del runtime tiene un test que la congela
(`api_surface.test.js`): un documento de API que no está junto al código ni al
test se desactualiza sin que nada lo delate.

---

## Índice de Documentos

| # | Documento | Contenido |
|---|---|---|
| 1 | [Setup](./gsis_SETUP.md) | Configuración de CLEO Redux, permisos, dependencias |
| 2 | [Arquitectura](./gsis_ARCHITECTURE.md) | Estructura core/modules, EventBus, Registry, Config, Input |
| 3 | [Mantenimiento](./gsis_MAINTENANCE.md) | Checklists, reglas de deuda, guias de refactor |
| 4 | [UI Web](./gsis_WEBUI.md) | **UI del mod**: contrato con la página, troceado, límites |
| 4b | [Input](./gsis_INPUT.md) | **Teclado y menús**: dueño del input, supresión de hotkeys, freeze del player |
| 5 | [Economía](./gsis_ECONOMY.md) | Precios, fórmulas de lavado, balance |
| 6 | [Inventario](./gsis_INVENTORY.md) | Slots, peso, transferencia entre contenedores |
| 7 | [Propiedades](./gsis_PROPERTIES.md) | Almacenes, fábricas, talleres, nómina |
| 8 | [Vehículos](./gsis_VEHICLES.md) | Flota de carga, baúl, persistencia |
| 9 | [Banca](./gsis_BANKING.md) | Cuentas, ATMs, lavado de dinero |
| 10 | [Progresión](./gsis_MAPPROGRESSION.md) | Desbloqueo LS → SF → LV |
| 11 | [Diseño UI](./gsis_UIDESIGN.md) | Menús, notificaciones (HUD descartado) |
| 12 | [Roadmap](./gsis_ROADMAP.md) | Fases de implementación |
| 13 | [Testing](./gsis_TESTING.md) | Debug, pruebas, prevención de crashes |
| 14 | [Actores](./gsis_ACTORS.md) | Spawn de peds, lifetime, tasks, EventBus, **modelos especiales sin reemplazar** |
| 15 | [Anims actores](./gsis_ACTORANIMS.md) | `TASK_PLAY_ANIM`, IFP vanilla, `idleAnim`, `anims:play`/`stop` |
| 16 | [Spots](./gsis_SPOTS.md) | Esferas (dealer/seller/pickup), N por tipo, gate interior, cooldown de 6 s al cerrar |
| 17 | [L10n](./gsis_L10N.md) | Localización es/en, claves GXT/FXT, t(), subtítulos 00BB |
| 18 | [Personajes](./gsis_CHARACTERS.md) | Nombre + diálogos + actor → `characters:say` |
| 19 | [Contratos](./gsis_CONTRATOS.md) | **El bus entre `inventory/` y `weapons/`**: qué evento, qué payload, quién responde |
| 20 | [Inventario (sistema)](./gsis_INVENTORY.md) | El diseño de contenedores, cinturón, baúl, recarga y persistencia |
| 21 | [Armas (sistema)](./gsis_WEAPONS.md) | Una familia por item, cómo se deriva la variante, y qué está comprobado |
| 21b | [Armas (guía de agregado)](./AGREGAR_ARMAS.md) | **Guía completa para crear un arma de punta a punta**: elegir el padre heredando de vanilla, el modelo, la fila del `.dat`, la familia, los cargadores, la bala, los accesorios, el ícono, y la Colt .45 entera como ejemplo |
| 21c | [Recarga](./gsis_RECARGA.md) | La `R`, por qué cambia de variante el arma, de dónde sale el sonido, y **de dónde salen las balas** |
| 22 | [SAWebUI (runtime)](C:\Dev\SAWebUI\docs\README.md) | Documentacion del runtime ** aparte de esta**: API, guia de paginas, ASI, canal de retorno, rendimiento |

---

## Estado del Proyecto

| Fase | Estado |
|---|---|
| 0 — Setup + migración arquitectura | ✅ Hecho |
| 1 — Prototipo (items, propiedades, baúl, UI) | ✅ En juego |
| Dealer mayorista + retiro de pedidos | ✅ En juego |
| Punto de venta / trueque NPC (intereses + budget) | ✅ En juego |
| Actores (dealer + seller peds, EventBus tasks) | ✅ En juego |
| Modelos especiales custom (sin reemplazar vanilla) | ✅ En juego |
| Anims actores (IFP vanilla, idleAnim, `anims:*`) | ✅ En juego |
| Spots / esferas | ✅ En juego |
| Localización es/en (`t()`, FXT/FxtStore) | ✅ En juego · 2 excepciones de datos (ver abajo) |
| Subtítulos / diálogo (00BB, cola) | ✅ En juego |
| Personajes (nombre + líneas + actor) | ✅ En juego |
| Equipo + recarga (armas solo por inventario, cinturón de cargadores) | ✅ En juego · en `modules/weapons/` + `modules/inventory/` |
| UI web CEF (panel de inventario) | ✅ En juego · en `modules/ui/` |
| HUD overlay | ❌ Descartado (solo inventario) |
| Menus de baul / dealer / retiro / trueque | ✅ En juego (los cuatro comparten la tabla de `ui/views/flow.js`) |
| Pestanas Propiedades / Vehiculos (UI web) | ⚠ Estado vacio: faltan sus snapshots |
| Canal de retorno UI → CLEO (acciones) | ✅ **SAWeb v2** - equipar / cinturon / tirar / montar y sacar accesorios |
| 2 — Core (economía, banco, SF) | ⏳ Pendiente |
| 3 — Completo (LV, nómina) | ⏳ Pendiente |
| 4 — Polish | ⏳ Pendiente |
| Deuda técnica (código existente) | ⚠️ No limpia — inventario en [gsis_MAINTENANCE.md §7](./gsis_MAINTENANCE.md) |

### Lo que quedo debiendo el ultimo refactor

Partir `gsis_Items.js`, `gsis_Ballistic.js` y la UI en paquetes salio bien, pero
dejo dos cosas anotadas para que no se pierdan:

| Deuda | Donde | Que falta |
|---|---|---|
| `data/gsis_weapon_variants.js` | `data/` | **Borrado el 03/10/2026**, junto con el sistema de variantes y accesorios. Ver [`gsis_VARIANTES.md`](./gsis_VARIANTES.md) |
| `data/gsis_weapon_data.js` | `data/` | **Borrado el 03/10/2026.** Era un shim de `gsis_weapons.js`; la fuente es `data/gsis_weapons.js` |
| `TIMERS.RELOAD_GRACE` | `core/gsis_Config.js` | No lo lee nadie. Quedo del watchdog de recarga, que ya no existe |
| `isInstanced` reexportado | `modules/inventory/index.js` | Es una pregunta del catalogo que vive en `data/gsis_item_data.js`; `gsis_Trunk.js` y `gsis_WeaponSeller.js` la importan del reexport |
| `updateProximityMove()` | `core/gsis_Input.js` | Sin consumidor desde que todos los menus congelan al jugador. Dormido, no muerto |
| 5 de los 8 checks del temp | `%TEMP%\opencode\` | Apuntan a `gsis_Ballistic.js` / `gsis_WebInterface.js` y no arrancan. Ver [gsis_TESTING.md §2](./gsis_TESTING.md) |

---

## Convenciones

Ver [gsis_ARCHITECTURE.md](./gsis_ARCHITECTURE.md) para:
- Estructura `core/`, `modules/`, `ui/`, `data/`
- Regla de dependencias (`ui → modules → core → data`) y la excepcion de `inventory/` ↔ `weapons/`
- Patrón de módulo: `register({name, init, update})` para uno de una línea, o un paquete con `index.js` + un archivo por responsabilidad
- Eventos EventBus (incl. `actors:*` / `actor:died`) y `core/gsis_EventNames.js`
- Nombrado de archivos e IDs

Ver [gsis_MAINTENANCE.md](./gsis_MAINTENANCE.md) para:
- Checklist pre-commit
- Política de deuda técnica
- Cómo refactorizar sin romper

Ver [gsis_CONTRATOS.md](./gsis_CONTRATOS.md) para:
- Qué evento cruza `inventory/` y `weapons/`, con qué payload, y quién responde
- Por qué los nombres viven en un archivo de core y no en el de la parte que los emite
- Qué lo verifica (`tools/check-ui-flow.mjs`)

Ver [gsis_WEBUI.md](./gsis_WEBUI.md) para:
- Quién es dueño del estado de la UI (el bridge, no la página)
- El contrato `uistate` / `inv` / `catalog` / `screen` y el troceado de 255 chars
- Los 22 comandos de la página y quién valida cada uno
- Por qué la UI es de solo lectura
- Checklist de la página (`UI\app.js`, `UI\style.css`)

Ver [gsis_ACTORS.md](./gsis_ACTORS.md) para:
- Configurar actores (`gsis_actor_data.js`)
- Lifetime permanent/disposable
- Tareas y EventBus `actors:*`
- **Mini-guía: cargar modelos custom SIN reemplazar vanilla** (CLEO+ especial)

Ver [gsis_ACTORANIMS.md](./gsis_ACTORANIMS.md) para:
- Catálogo `gsis_actor_anim_data.js` + `idleAnim` en el def
- EventBus `anims:play` / `anims:stop`
- Natives 04ED/04EE/04EF/0605

Ver [gsis_SPOTS.md](./gsis_SPOTS.md) para:
- Esferas multi-instancia (`gsis_spot_data.js`)
- Gate interior (`_pendingSpheres`)
- dealer / seller / pickup

Ver [gsis_L10N.md](./gsis_L10N.md) para:
- `t(key, params)` y catálogo `gsis_lang_data.js`
- FXT / FxtStore (keys ≤7)
- Subtítulos 00BB (`dialogue:play` / `dialogue:stop`)
- Cómo añadir un string nuevo
