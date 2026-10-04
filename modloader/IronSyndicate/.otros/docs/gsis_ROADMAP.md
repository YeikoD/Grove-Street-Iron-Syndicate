# GSIS — Roadmap de Implementacion

Fases de desarrollo, milestones y entregables concretos.

---

## 1. Vista General

| Fase | Nombre | Duracion Est. | Objetivo |
|---|---|---|---|
| 0 | Setup | 1-2 dias | Entorno funcional, boilerplate |
| 1 | Prototipo | 2-3 semanas | Inventario + 1 propiedad + 1 vehiculo |
| 2 | Core | 3-4 semanas | Economia + banco + 2 zonas |
| 3 | Completo | 4-6 semanas | 3 zonas + nomina + progresion |
| 4 | Polish | 2-3 semanas | Balance, testing, edge cases |

---

## 2. Fase 0 — Setup

### Objetivo
Entorno de desarrollo funcionando con hot reload y boilerplate de arquitectura.

### Entregables

| # | Tarea | Estado |
|---|---|---|
| 0.1 | Verificar cleo.ini con permisos [fs] | ✅ Hecho |
| 0.2 | Crear estructura de carpetas | ✅ Hecho |
| 0.3 | Crear mod.json con permisos | ✅ Hecho |
| 0.4 | Crear index.js con boilerplate basico | ✅ Hecho |
| 0.5 | Crear gsis_SaveManager.js (hub de estado) | ✅ Hecho |
| 0.6 | Crear gsis_VehicleModule.js | ✅ Hecho |
| 0.7 | Probar hot reload (log + wait(0)) | ✅ Hecho |
| 0.8 | Verificar que CLEO carga sin errores | ✅ Hecho |
| 0.9 | Instalar el plugin de UI de la etapa anterior | ✓ Hecho, y **desinstalado** al migrar a SAWeb |
| 0.10 | Prototipo de menu (TestMenu) | ✓ Hecho, y **borrado** al migrar a SAWeb |

### Migracion a Arquitectura Escalable

Estructura `core/modules/ui/data` antes de agregar mas modulos.
Ver [gsis_ARCHITECTURE.md](./gsis_ARCHITECTURE.md#9-roadmap-de-migracion) para detalles.

| # | Tarea | Estado |
|---|---|---|
| 0.11 | Crear `core/gsis_Config.js` (teclas/distancias/timers) | ✅ Hecho |
| 0.12 | Crear `core/gsis_EventBus.js` (pub/sub + query) | ✅ Hecho (en uso) |
| 0.13 | Crear `core/gsis_ModuleRegistry.js` (init/update auto) | ✅ Hecho (en uso) |
| 0.14 | Renombrar `GSIS_ItemsModule` → `modules/gsis_Items.js` + `data/gsis_item_data.js` | ✅ Hecho |
| 0.15 | Dividir `gsis_VehicleModule` en Vehicles/Engine/Locks/Trunk/Spawner | ✅ Hecho |
| 0.16 | Mover InventoryModule → `modules/gsis_Documents.js` + `gsis_Bag.js` | ✅ Hecho |
| 0.17 | Mover menus a `ui/` | ✅ Hecho |
| 0.18 | Reescribir index.js solo con registry | ✅ Hecho |
| 0.19 | Probar todo (registro, motor, lock, baul, items, guardado) | ✅ Hecho |
| 0.20 | Localización es/en: `gsis_L10n.js` + `gsis_lang_data.js` + FXT | ✅ Hecho |

### Criterio de Aceptacion
- ✅ Ejecutar GTA SA, ver "GSIS loaded" en cleo_redux.log
- ✅ Modificar index.js, guardar, ver cambio en el log sin reiniciar
- ✓ Presionar I, ver el panel con info del estado

---

## 3. Fase 1 — Prototipo

### Objetivo
Inventario funcional, una propiedad comprable, un vehiculo con baul, panel de UI.

### Entregables

| # | Tarea | Dependencia | Estado |
|---|---|---|---|
| 1.1 | `modules/gsis_Items.js`: addItem, removeItem, ~~transferItem~~ | 0.14 | ✅ Hecho (`transferItem` **borrado**: sin consumidores; el baul va por `addToTrunk`/`removeFromTrunk`) |
| 1.2 | `modules/gsis_Items.js`: calculo de peso total | 1.1 | ✅ Hecho |
| 1.3 | `data/gsis_item_data.js`: datos de materias primas | - | ✅ Hecho |
| 1.4 | `modules/gsis_PropertyModule.js`: buyProperty, getOwnProperty | 0.5 | ✅ Hecho |
| 1.5 | `data/gsis_property_data.js`: datos de 3 propiedades LS | - | ✅ Hecho (5 propiedades) |
| 1.6 | `data/gsis_vehicle_data.js`: datos de Pony | - | ✅ Hecho |
| 1.7 | Panel de inventario (etapa anterior) | 1.1, 0.10 | ✓ Hecho y **borrado**: la UI paso a ser web (ver 1.10) |
| 1.8 | Overlay de HUD | 0.5, 0.10 | ✘ Descartado (solo inventario) |
| 1.9 | Script de prueba: spawnear items, probar baul | Todos | ✅ Hecho (en juego) |
| 1.10 | UI web CEF/SAWeb: `modloader\IronSyndicate\UI\` + `modules/gsis_WebInterface.js` | 1.7 | ✅ Hecho (commit `13588b1`)
| 1.11 | SAWeb v2: canal de retorno UI → CLEO (`SAWeb_PollCommand` + prefijo `cmd:`) | 1.10 | ✅ Hecho - equipar / cinturon / tirar
| 1.12 | Pestanas Propiedades / Vehiculos en la UI web (`snapProperties` / `snapVehicles`) | 1.10 | ⚠ Pendiente
| 1.13 | Overlays de baul / dealer / retiro / trueque en la UI web | 1.10, 0.17 | ⚠ Pendiente: los flags existen, no hay renderer |

### Criterio de Aceptacion
- ✅ Puedo agregar items (tecla L) y verlos en el inventario
- ✅ Puedo comprar un taller con cleanMoney
- ✅ Puedo cargar items en el baul (tecla 3 / sphere / B)
- ✅ El baul persiste al guardar y cargar partida
- ⏳ Recoger items del suelo (pickup) — pendiente futuro

---

## 4. Fase 2 — Core

### Objetivo
Sistema economico completo, lavado de dinero, transporte con riesgo, desbloqueo SF.

### Entregables

| # | Tarea | Dependencia | Estado |
|---|---|---|---|
| 2.1 | `core/gsis_EconomyUtils.js`: precios, formulas de lavado | 1.4 | Pendiente |
| 2.2 | `modules/gsis_BankModule.js`: cajeros, lavado, transacciones | 2.1 | Pendiente |
| 2.3 | `modules/gsis_BankModule.js`: cooldowns por metodo | 2.2 | Pendiente |
| 2.4 | `modules/gsis_MapProgressModule.js`: deteccion de zona | - | Pendiente |
| 2.5 | `modules/gsis_MapProgressModule.js`: requisitos de fase 2 | 2.4 | Pendiente |
| 2.6 | `modules/gsis_Items.js`: modificador de velocidad | 1.2 | Pendiente |
| 2.7 | `modules/gsis_Vehicles.js`: efecto de carga en handling | 1.7 | Pendiente |
| 2.8 | `modules/gsis_Vehicles.js`: puntos de entrega | 2.7 | Pendiente |
| 2.9 | `modules/gsis_Vehicles.js`: eventos de riesgo (emboscada/retencion) | 2.8 | Pendiente |
| 2.10 | `data/gsis_property_data.js`: propiedades SF | 2.5 | Pendiente |
| 2.11 | `data/gsis_vehicle_data.js`: Burrito y Rumpo | 2.5 | Pendiente |
| 2.12 | `modules/gsis_MapProgressModule.js`: notificacion de desbloqueo | 2.5 | Pendiente |
| 2.13 | `modules/gsis_MenuSystem.js`: submenu de ATM | 2.2 | Pendiente (no existe aun) |
| 2.14 | `modules/gsis_MenuSystem.js`: submenu de entrega | 2.8 | Pendiente (no existe aun) |

### Criterio de Aceptacion
- Puedo recoger materia prima, ensamblar un arma en un taller
- Puedo cargar el arma en un Pony y entregarla en un punto de venta
- El dinero sucio se puede lavar via ATM con la tasa correcta
- Al acumular $50k y 10 entregas, se desbloquea San Fierro
- Puedo comprar propiedades y vehiculos en SF

---

## 5. Fase 3 — Completo

### Objetivo
Las Venturas, nomina diaria, produccion de fabricas, todas las fases desbloqueadas.

### Entregables

| # | Tarea | Dependencia |
|---|---|---|
| 3.1 | `modules/gsis_PropertyModule.js`: fabricas con recetas | 1.5 |
| 3.2 | `modules/gsis_PropertyModule.js`: tick de produccion | 3.1 |
| 3.3 | `modules/gsis_PropertyModule.js`: sistema de empleados | 3.1 |
| 3.4 | `modules/gsis_BankModule.js`: nomina diaria | 3.3 |
| 3.5 | `modules/gsis_BankModule.js`: consecuencias de no pagar | 3.4 |
| 3.6 | `modules/gsis_MapProgressModule.js`: fase 3 desbloqueo | 2.5 |
| 3.7 | `data/gsis_property_data.js`: propiedades LV | 3.6 |
| 3.8 | `data/gsis_vehicle_data.js`: Flatbed | 3.6 |
| 3.9 | `modules/gsis_EconomyUtils.js`: inflacion por fase | 2.1 |
| 3.10 | `modules/gsis_Items.js`: paquetes de transporte | 2.1 |
| 3.11 | Overlay de HUD: actualizaciones completas | Todos | ✘ Descartado (solo inventario) |
| 3.12 | `modules/gsis_MenuSystem.js`: todos los submenus | Todos |

### Criterio de Aceptacion
- Las fabricas producen items automaticamente segun las recetas
- Los empleados trabajan y cobran nomina a medianoche
- No pagar nomina tiene consecuencias progresivas
- Las 3 fases se desbloquean correctamente
- Se puede jugar de LS a LV con progresion completa

---

## 6. Fase 4 — Polish

### Objetivo
Balance final, testing completo, prevencion de bugs y crashes.

### Entregables

| # | Tarea | Dependencia |
|---|---|---|
| 4.1 | Balance de precios (ajustar segun testing) | 3.1 |
| 4.2 | Balance de lavado (tasas, cooldowns) | 3.4 |
| 4.3 | Testing de memoria (verificar fugas) | 3.1 |
| 4.4 | Testing de handles (vehiculos, peds) | 3.7 |
| 4.5 | Edge cases: baul lleno, sin dinero, sin empleados | 3.5 |
| 4.6 | Error handling en todos los modulos | 3.1 |
| 4.7 | gsis_TESTING.md: guias completas de debug | 4.1 |
| 4.8 | Documentacion final actualizada | Todos |
| 4.9 | Prueba de 1 hora continua sin crashes | Todos |

### Criterio de Aceptacion
- Jugar 1 hora continua sin crashes ni memory leaks
- Todas las mecánicas probadas y balanceadas
- Errores manejados graceful (sin crashes al jugador)
- Documentacion actualizada y completa

---

## 7. Dependencias entre Fases

```
Fase 0 (Setup)
    |
    v
Fase 1 (Prototipo) -----> Fase 2 (Core) -----> Fase 3 (Completo) -----> Fase 4 (Polish)
```

### Ruta Critica

```
0.4 index.js
-> 0.5 SaveManager
-> 0.6 VehicleModule
-> 0.10 Prototipo de menu
-> 0.11-0.19 Migracion arquitectura (core/modules/ui)
-> 1.1 Items
-> 1.4 PropertyModule
-> 1.7 Panel de inventario
-> 2.1 EconomyUtils
-> 2.2 BankModule
-> 3.1 Fabricas
-> 3.4 Nomina
```

---

## 8. Hitos Clave (Milestones)

| Hito | Fase | Entregable |
|---|---|---|
| "Primer Log" | 0 | index.js carga y muestra mensaje |
| "Primer panel" | 0 | TestMenu muestra el panel con tecla I |
| "Arquitectura Escalable" | 0 | Estructura core/modules/ui + registry funcional |
| "Primer Item" | 1 | Puedo recoger chatarra del suelo |
| "Primer Baul" | 1 | Cargar/unload items en Pony |
| "Primera Compra" | 1 | Comprar taller Ganton |
| "Recarga con cargadores" | 1 | R cambia el cargador montado por uno del inventario; sin recambio lo descarga al inventario; arma nueva sale con cargador lleno |
| "Primera Entrega" | 2 | Vender arma en punto de entrega |
| "Primer Lavado" | 2 | Convertir dinero sucio en limpio |
| "Segunda Ciudad" | 2 | Desbloquear SF |
| "Primera Fabrica" | 3 | Fabrica produce items automaticamente |
| "Primera Nomina" | 3 | Cobro automatico a medianoche |
| "Tercera Ciudad" | 3 | Desbloquear LV |
| "Juego Completo" | 4 | 1 hora sin crashes, todo funcional |
