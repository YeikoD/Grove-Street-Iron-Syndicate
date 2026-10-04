# GSIS — Sistema de Vehiculos

Vehiculos de carga, sistema de baul, persistencia y compra.

> **Diseño parcial**: registro/spawn/baúl/motor lock en `modules/gsis_Spawner.js`,
> `gsis_EngineLock.js`, `gsis_Trunk.js`, `gsis_Vehicles.js` (en juego).
> Compra de vehículos, handling por carga y puntos de entrega: **no implementado**.
> `GameState.*` en ejemplos es pseudocódigo de diseño.

---

## 1. Vehiculos Soportados

| Modelo | ID GTA | Peso Max Baul | Slots | Velocidad Max | Costo | Fase |
|---|---|---|---|---|---|---|
| Pony | 413 | 50 kg | 40 | 140 km/h | $8,000 | 1 |
| Burrito | 482 | 80 kg | 50 | 150 km/h | $25,000 | 2 |
| Rumpo | 440 | 70 kg | 45 | 145 km/h | $20,000 | 2 |
| Flatbed | 455 | 200 kg | 60 | 120 km/h | $60,000 | 3 |

### Carga Maxima por Zona

| Zona | Vehiculos Disponibles |
|---|---|
| Los Santos | Pony |
| San Fierro | Pony, Burrito, Rumpo |
| Las Venturas | Todos |

---

## 2. Estructura de Datos de Vehiculo

```javascript
{
    plate: "GSIS001",           // Patente unica (ID del vehiculo)
    model: 482,                 // ID del modelo GTA
    handle: -1,                 // Handle del vehiculo en el juego
    trunk: {                    // Contenido del baul
        items: [],
        maxWeight: 80.0,
        maxSlots: 50
    },
    position: { x: 0, y: 0, z: 0 },
    owned: true,
    lastUsed: 0                 // Timestamp del ultimo uso
}
```

---

## 3. Concesionarios

### Ubicaciones de Compra

| Concesionario | Zona | Vehiculo | Coordenadas | Desbloqueo |
|---|---|---|---|---|
| Willies Auto | LS East | Pony | 2500, -1500, 13 | Fase 1 |
| Wang Cars | SF Doherty | Burrito | -1980, 250, 35 | Fase 2 |
| Wheel Arch Angels | SF Foster | Rumpo | -1900, 600, 35 | Fase 2 |
| Auto Salvage | LV Redsands | Flatbed | 1600, 1200, 10 | Fase 3 |

### Proveedor Clandestino (Precios 30% menor pero sin garantia)

| Proveedor | Zona | Coordenadas |
|---|---|---|
| Los Santos Docks | LS | 2600, -2300, 13 |
| San Fierro Bay | SF | -1700, -1700, 8 |
| LV Airport Back | LV | 1800, -1800, 13 |

---

## 4. Sistema de Baul Persistente

### Deteccion de Estacionamiento en Almacen

```javascript
function isNearOwnedProperty(carHandle, propertyId) {
    const propCoords = getPropertyCoords(propertyId);
    const carCoords = new Car(carHandle).getCoordinates();
    const distance = getDistance(carCoords, propCoords);
    return distance < 15.0; // 15 metros
}
```

### Guardado Automatico

Cuando el vehiculo esta estacionado dentro del radio de una propiedad propia, el baul se sincroniza con el deposito de la propiedad:

```javascript
function syncTrunkToProperty(vehicle, property) {
    // Mover items del baul del vehiculo al deposito
    for (const item of vehicle.trunk.items) {
        addItem(property.stock, item.id, item.qty);
    }
    vehicle.trunk.items = [];
}
```

### Persistencia al Guardar Partida

Los vehiculos propios se serializan en el GameState:

```javascript
GameState.vehicles = {
    "GSIS001": {
        model: 482,
        trunk: { items: [{ id: "pistol_assembled", qty: 10, weight: 1.2 }] },
        position: { x: 2447, y: -1690, z: 13.5 }
    }
};
```

Al cargar la partida, se recrean los vehiculos con `Car.Create()` y se repuebla el baul.

---

## 5. Compra de Vehiculo

```javascript
function buyVehicle(modelId, propertyId) {
    const vehicleDef = getVehicleDef(modelId);
    if (!vehicleDef) return false;
    if (!isZoneUnlocked(vehicleDef.requiredPhase)) return false;
    if (GameState.player.cleanMoney < vehicleDef.cost) return false;

    GameState.player.cleanMoney -= vehicleDef.cost;

    const prop = getPropertyCoords(propertyId);
    const car = Car.Create(modelId, prop.x + 5, prop.y, prop.z);

    const plate = generatePlate();
    GameState.vehicles[plate] = {
        model: modelId,
        handle: car,
        trunk: { items: [], maxWeight: vehicleDef.trunkWeight, maxSlots: vehicleDef.trunkSlots },
        position: { x: prop.x + 5, y: prop.y, z: prop.z },
        owned: true,
        lastUsed: Date.now()
    };

    emit("VEHICLE_BOUGHT", { plate, model: modelId });
    return plate;
}
```

---

## 6. Efecto de Carga en el Manejo

El peso en el baul afecta la fisica del vehiculo.

### Modificadores de Handling

| Peso Ocupado | Efecto |
|---|---|
| 0-50% | Sin cambios |
| 50-75% | Velocidad max -10%, aceleracion -15% |
| 75-100% | Velocidad max -20%, aceleracion -30%, frenado -15% |

### Aplicacion via Native

```javascript
function applyLoadHandling(vehicle, trunkWeight, maxWeight) {
    const ratio = trunkWeight / maxWeight;
    const handlingMod = 1.0 - (ratio * 0.3);

    native("SET_CAR_HEAVY", vehicle.handle, trunkWeight > maxWeight * 0.75);
    // Ajustar velocidad maxima via handling multiplier
}
```

---

## 7. Menu del Vehiculo

```
[Burrito - Patente: GSIS001]
- Baul: 45/80 kg (56%)

[1] Cargar Item
[2] Descargar Item
[3] Ver Contenido del Baul
[4] Estacionar aqui (Guardar en almacen)
[0] Cerrar
```

---

## 8. Rutas de Transporte

### Puntos de Entrega

| Punto | Zona | Coordenadas | Comprador | Precio Bonus |
|---|---|---|---|---|
| Commerce Drop | LS | 1500, -1200, 20 | Dealer Local | x1.0 |
| Willowfield Drop | LS | 2400, -1900, 13 | Gang Contact | x1.1 |
| Doherty Drop | SF | -2050, 200, 35 | Importer | x1.2 |
| Financial Drop | SF | -1700, 800, 25 | VIP Buyer | x1.3 |
| Redsands Drop | LV | 1500, 1100, 10 | Casino Owner | x1.4 |
| Airport Drop | LV | 1700, -2200, 13 | Arms Dealer | x1.5 |

### Evento de Riesgo durante Transporte

Cada 2 minutos de viaje, se verifica si hay un evento de riesgo:

```javascript
function checkTransportRisk() {
    const heat = GameState.player.zoneHeat;
    const baseChance = 5 + (heat * 0.3); // 5% base + 0.3% por punto de calor

    if (Math.random() * 100 < baseChance) {
        // Evento de riesgo: emboscada o retencion policial
        const eventType = Math.random() > 0.5 ? "ambush" : "checkpoint";
        emit("TRANSPORT_RISK", { type: eventType });
    }
}
```

### Emboscada

- Bandas rivales atacan el vehiculo
- Si el jugador sobrevive: +10 de calor, conserva la carga
- Si el vehiculo es destruido: pierde 50% de la carga

### Retencion Policial

- Los policias detienen el vehiculo
- Si tiene cargo ilegal: pierde 30% de la carga + multa
- Si no tiene cargo: pasa sin problemas
- Posibilidad de soborno: $500 * nivel de wanted
