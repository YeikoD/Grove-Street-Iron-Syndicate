# GSIS — Sistema Bancario

Cuentas, cajeros automaticos, lavado de dinero y nomina diaria.

> **Diseño — no implementado** (Fase 2, roadmap 2.2-2.3).
> `GameState.*` en ejemplos es pseudocódigo de diseño; al implementar usar
> SaveManager + `Config` y EventBus.

---

## 1. Estructura del Sistema

El sistema bancario gestiona todo el flujo financiero del mod:

```
Dinero Sucio (dirtyMoney)
    |
    +--> [Lavado] --> Cajero/Lavanderia/Banco
    |
    v
Dinero Limpio (cleanMoney)
    |
    +--> Comprar Propiedades
    +--> Comprar Vehiculos
    +--> Pagar Nomina Diaria
    +--> Comprar Materiales
    +--> Sobornos
```

---

## 2. Cuentas del Jugador

```javascript
// En GameState.player
{
    cleanMoney: 0,     // Dinero en cuenta bancaria (se usa para todo)
    dirtyMoney: 0      // Efectivo sucio en mochila (solo se obtiene de venta ilegal)
}
```

### Fuentes de Dinero Sucio

| Actividad | Monto |
|---|---|
| Venta callejera de armas | $500 - $3,000 por arma |
| Venta a dealer local | $2,000 - $5,000 por paquete |
| Misiones de transporte | Segun punto de entrega |
| Robos a comercios | $1,000 - $5,000 (con wanted level) |

### Fuentes de Dinero Limpio

| Actividad | Monto |
|---|---|
| Lavado de dinero | Ver tasa en gsis_ECONOMY.md |
| Ventas legales (taller) | 50% del precio de mercado |
| Recompensas de misiones | Variable |

---

## 3. Cajeros Automaticos (ATMs)

### Ubicaciones en el Mapa

| ATM | Zona | Coordenadas |
|---|---|---|
| ATM Ganton | LS | 2430, -1670, 13.5 |
| ATM Commerce | LS | 1480, -1030, 23.5 |
| ATM Doherty | SF | -2030, 160, 35.0 |
| ATM Financial | SF | -1700, 780, 25.0 |
| ATM Redsands | LV | 1380, 1010, 10.0 |
| ATM Strip | LV | 2200, 1350, 10.0 |

### Interaccion con ATM

```javascript
function interactWithATM(atmId) {
    const atm = ATM_LOCATIONS[atmId];
    const playerPos = getPlayerPosition();
    const distance = getDistance(playerPos, atm);

    if (distance > 3.0) return false;

    // Abrir menu de ATM
    openATMMenu();
    return true;
}
```

### Menu de ATM

```
[CAJERO AUTOMATICO - Banco de Los Santos]

Saldo Actual: $45,000
Dinero Sucio: $12,500

[1] Depositar Sucio -> Limpio (Tasa: 0.60)
[2] Consultar Saldo
[3] Retirar Efectivo
[0] Cerrar
```

---

## 4. Proceso de Lavado via ATM

### Funcion de Lavado

```javascript
function launderMoney(amount, method) {
    if (amount <= 0) return false;
    if (GameState.player.dirtyMoney < amount) return false;

    const rate = ECONOMY.LAUNDERING_RATES[method];
    const heat = GameState.player.zoneHeat;
    const heatMod = getHeatModifier(heat);
    const effectiveRate = rate * heatMod;

    const cleanAmount = Math.floor(amount * effectiveRate);
    const lost = amount - cleanAmount;

    GameState.player.dirtyMoney -= amount;
    GameState.player.cleanMoney += cleanAmount;

    emit("MONEY_LAUNDERED", { dirty: amount, clean: cleanAmount, lost });
    return cleanAmount;
}
```

### Cooldown por Metodo

| Metodo | Cooldown | Almacena en |
|---|---|---|
| ATM | 24h juego (1,440 min) | GameState.player.atmCooldown |
| Lavanderia | 12h juego | GameState.player.laundryCooldown |
| Restaurante | 12h juego | GameState.player.restaurantCooldown |
| Concesionario | 8h juego | GameState.player.dealershipCooldown |
| Banco Privado | 4h juego | GameState.player.bankCooldown |

```javascript
function canUseLaunderingMethod(method) {
    const cooldownKey = method + "Cooldown";
    const lastUsed = GameState.player[cooldownKey] || 0;
    const cooldowns = { atm: 1440, laundromat: 720, restaurant: 720, dealership: 480, private_bank: 240 };
    const currentGameTime = getCurrentGameMinutes();
    return (currentGameTime - lastUsed) >= cooldowns[method];
}
```

---

## 5. Nomina Diaria

### Calculo de Gastos Totales

```javascript
function calculateTotalExpenses() {
    let total = 0;
    for (const propId in GameState.properties) {
        const prop = GameState.properties[propId];
        for (const emp of prop.employees) {
            total += emp.salary;
        }
    }
    return total;
}
```

### Ejecucion a Medianoche

```javascript
function processPayDay() {
    const total = calculateTotalExpenses();
    const balance = GameState.player.cleanMoney;

    if (balance >= total) {
        GameState.player.cleanMoney -= total;
        emit("PAY_DAY", { total });
    } else {
        emit("PAY_DAY_FAILED", { deficit: total - balance });
        applyNoPayPenalty();
    }
}
```

### Consecuencias de No Pagar

```javascript
function applyNoPayPenalty() {
    GameState.finances.missedPayments = (GameState.finances.missedPayments || 0) + 1;
    const missed = GameState.finances.missedPayments;

    if (missed >= 1) {
        // -10% eficiencia de produccion
        applyEfficiencyPenalty(0.9);
    }
    if (missed >= 3) {
        // -30% eficiencia
        applyEfficiencyPenalty(0.7);
    }
    if (missed >= 5) {
        // Empleados se van, produccion 0
        fireAllEmployees();
        emit("RAID_TRIGGERED", { zone: GameState.player.currentZone, severity: "low" });
    }
    if (missed >= 7) {
        // Propiedad abandonada
        abandonOldestProperty();
    }
}
```

---

## 6. Sobornos

El jugador puede sobornar policias para reducir wanted level o evitar retenciones.

### Costo de Soborno

```
costo_soborno = 500 * wanted_level_actual
```

| Wanted Level | Costo |
|---|---|
| 1 estrella | $500 |
| 2 estrellas | $1,000 |
| 3 estrellas | $1,500 |
| 4 estrellas | $2,000 |
| 5 estrellas | $2,500 |

### Limitaciones

- Solo funciona si wanted level <= 3
- A wanted level 4+, el soborno no funciona
- Cada soborno genera +15 de calor policial
- Cooldown de 10 minutos entre sobornos

---

## 7. Registro de Transacciones

Cada transaccion se registra en el GameState para auditoria:

```javascript
GameState.finances.transactionLog = [
    {
        type: "laundering",
        amount: 5000,
        method: "atm",
        cleanReceived: 3000,
        timestamp: 1234567890
    },
    {
        type: "payday",
        amount: -800,
        timestamp: 1234567900
    }
];
```

El log se mantiene en memoria y se serializa con el save. Maximo 100 transacciones (las mas viejas se descartan).
