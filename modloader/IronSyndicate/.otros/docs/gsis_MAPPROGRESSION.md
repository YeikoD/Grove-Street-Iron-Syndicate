# GSIS — Progresion por Mapa

Desbloqueo de zonas, deteccion de ubicacion y requisitos de progresion.

> **Diseño — no implementado** (Fase 2, roadmap 2.4-2.5, 2.12).
> `GameState.*` en ejemplos es pseudocódigo de diseño; al implementar usar
> `registerModule` + SaveManager y `Config` para umbrales.

---

## 1. Fases del Juego

| Fase | Zona | Tematica | Desbloqueo |
|---|---|---|---|
| 1 | Los Santos | Clandestinidad, armas artesanales | Inicio del juego |
| 2 | San Fierro | Logistica, fabricas, importacion | $50,000 + 10 ventas completadas |
| 3 | Las Venturas | Dominio, grandes almacenes, red bancaria | $500,000 + 30 ventas + todas las propiedades LS/SF |

---

## 2. Contenido por Fase

### Fase 1 - Los Santos

| Contenido | Cantidad |
|---|---|
| Propiedades disponibles | 5 (talleres y almacenes pequenos) |
| Vehiculos | Pony |
| Items de craft | 9mm, Escopeta recortada |
| Empleados maximos por propiedad | 3 |
| Metodos de lavado | ATM, Lavanderia |
| Puntos de entrega | 2 (Commerce, Willowfield) |

### Fase 2 - San Fierro

| Contenido | Cantidad |
|---|---|
| Propiedades adicionales | 4 (fabricas y almacenes medianos) |
| Vehiculos | Pony, Burrito, Rumpo |
| Items de craft | M4, Chaleco, Mira |
| Empleados maximos por propiedad | 5 |
| Metodos de lavado | + Restaurante, Concesionario |
| Puntos de entrega | + 2 (Doherty, Financial) |

### Fase 3 - Las Venturas

| Contenido | Cantidad |
|---|---|
| Propiedades adicionales | 5 (grandes almacenes y fabricas) |
| Vehiculos | Todos + Flatbed |
| Items de craft | Todos + paquetes de transporte |
| Empleados maximos por propiedad | 8 |
| Metodos de lavado | + Banco Privado |
| Puntos de entrega | + 2 (Redsands, Airport) |

---

## 3. Requisitos de Desbloqueo

### Desbloqueo de Fase 2

```javascript
const PHASE_2_REQUIREMENTS = {
    minMoney: 50000,           // $50,000 en cleanMoney
    minDeliveries: 10,         // 10 entregas completadas
    propertiesOwned: 2,        // Al menos 2 propiedades
    requiredZone: "LOS_SANTOS" // Debe estar en LS
};
```

### Desbloqueo de Fase 3

```javascript
const PHASE_3_REQUIREMENTS = {
    minMoney: 500000,          // $500,000 en cleanMoney
    minDeliveries: 30,         // 30 entregas completadas
    propertiesOwned: 6,        // Al menos 6 propiedades
    requiredPhase: 2           // Debe haber completado Fase 2
};
```

### Verificacion de Requisitos

```javascript
function checkPhaseUnlock(currentPhase) {
    const player = GameState.player;
    const prog = GameState.progression;

    if (currentPhase === 1) {
        const req = PHASE_2_REQUIREMENTS;
        return player.cleanMoney >= req.minMoney &&
               prog.totalDeliveries >= req.minDeliveries &&
               Object.keys(GameState.properties).length >= req.propertiesOwned;
    }

    if (currentPhase === 2) {
        const req = PHASE_3_REQUIREMENTS;
        return player.cleanMoney >= req.minMoney &&
               prog.totalDeliveries >= req.minDeliveries &&
               Object.keys(GameState.properties).length >= req.propertiesOwned;
    }

    return false;
}
```

---

## 4. Deteccion de Zona Actual

### Metodo 1: Coordenadas por Bounds

```javascript
const ZONE_BOUNDS = {
    LOS_SANTOS: {
        minX: -2800, maxX: 3000,
        minY: -3000, maxY: 1000,
        minZ: -50, maxZ: 1000
    },
    SAN_FIERRO: {
        minX: -2800, maxX: -1000,
        minY: -1000, maxY: 2000,
        minZ: -50, maxZ: 1000
    },
    LAS_VENTURAS: {
        minX: 1000, maxX: 3200,
        minY: 800, maxY: 3200,
        minZ: -50, maxZ: 1000
    }
};

function detectZone(x, y, z) {
    for (const [zone, bounds] of Object.entries(ZONE_BOUNDS)) {
        if (x >= bounds.minX && x <= bounds.maxX &&
            y >= bounds.minY && y <= bounds.maxY) {
            return zone;
        }
    }
    return "UNKNOWN";
}
```

### Metodo 2: Native del Juego

```javascript
function getCurrentZoneNative() {
    return native("GET_CURRENT_PLAYER_ZONE");
    // Retorna: "LS", "SF", "LV"
}
```

### Deteccion de Cambio de Zona

```javascript
let lastZone = "LOS_SANTOS";

function checkZoneChange() {
    const coords = new Player(0).getCoordinates();
    const newZone = detectZone(coords.x, coords.y, coords.z);

    if (newZone !== lastZone) {
        emit("ZONE_CHANGED", { from: lastZone, to: newZone });
        lastZone = newZone;
        GameState.player.currentZone = newZone;
    }
}
```

---

## 5. Puentes y Barreras Geograficas

En el juego original, los puentes entre zonas estan bloqueados hasta ciertas misiones. Para GSIS:

### Puentes Bloqueados (Opcion: desbloquear por fase)

| Puente | Conexion | Desbloqueo |
|---|---|---|
| Garver Bridge | LS -> SF | Fase 2 |
| Gant Bridge | SF -> LV | Fase 3 |
| Whetstone Bridge | LS sur | Fase 2 |

### Alternativa: Sin Bloqueo de Puentes

Si se prefiere no depender de las misiones del juego base:

```javascript
// Desbloquear puentes al inicio de cada fase
function unlockBridges(phase) {
    if (phase >= 2) {
        // Remover barreras del Garver Bridge
        native("REMOVE_ALL_SCRIPT_BARRIERS");
    }
}
```

---

## 6. Notificacion de Desbloqueo

Cuando el jugador desbloquea una nueva zona:

```javascript
function notifyZoneUnlock(newPhase, newZone) {
    // Diseño — no implementado. En código real usar t("KEY") de gsis_L10N.md
    showTextBox("NUEVA ZONA DESBLOQUEADA: " + newZone);
    // Esperar 3 segundos
    // Mostrar lista de contenido nuevo
    showTextBox("Fabricas, almacenes y vehiculos pesados disponibles");
    // Reproducir sonido de desbloqueo
    native("PLAY_MISSION_PASSED_TUNE", 1);
}
```

---

## 7. Mapa de Progresion Visual

```
PHASE 1: LOS SANTOS
  [Ganton] [Idlewood] [Glen Park] [Compton] [East LS]
      |
      v (50k + 10 entregas)
PHASE 2: SAN FIERRO
  [Doherty] [Easter Basin] [Hashbury] [Whetstone]
      |
      v (500k + 30 entregas)
PHASE 3: LAS VENTURAS
  [Redsands] [Prickle Pine] [Las Brujas] [North LV] [Pilgrim]
```

---

## 8. Variables de Progresion en GameState

```javascript
GameState.progression = {
    phase: 1,                      // Fase actual (1-3)
    unlockedZones: ["LOS_SANTOS"], // Zonas disponibles
    totalDeliveries: 0,            // Entregas totales
    totalLaundered: 0,             // Total lavado
    totalEarned: 0,                // Total ganado
    playTime: 0,                   // Tiempo de juego en minutos
    propertiesUnlocked: 5,         // Propiedades desbloqueadas
    vehiclesUnlocked: 1            // Tipos de vehiculo desbloqueados
};
```
