# GSIS — Sistema de Propiedades

Diseno de almacenes, fabricas y talleres con gestion de empleados y nomina.

> **Diseño parcial**: compra/listado implementados en `modules/gsis_PropertyModule.js`
> (Fase 1). Empleados, producción y nómina: **no implementado** (Fase 3).
> `GameState.*` en ejemplos es pseudocódigo de diseño.

---

## 1. Tipos de Propiedad

### Almacen
- Funcion: Punto de acopio de mercaderia con alta capacidad
- Capacidad: 500 kg base, expandible a 1000 kg
- Empleados: Guardias (protegen contra robos)
- Produccion: Ninguna (solo almacenamiento)

### Fabrica
- Funcion: Transforma materias primas en componentes/productos
- Capacidad: 200 kg de stock de entrada + 200 kg de salida
- Empleados: Obreros (velocidad de produccion)
- Produccion: Convierte items segun recetas cada tick de tiempo

### Taller
- Funcion: Ensambla componentes en productos finales
- Capacidad: 100 kg de stock
- Empleados: Mecanicos (velocidad de ensamblaje)
- Produccion: Ensambla componentes mas rapido que el jugador solo

---

## 2. Base de Datos de Propiedades

### Fase 1 - Los Santos

| ID | Nombre | Tipo | Coordenadas (x, y, z) | Costo | Nomina/dia | Capacidad |
|---|---|---|---|---|---|---|
| taller_ganton | Taller Ganton | Taller | 2447, -1690, 13.5 | $15,000 | $200 | 100 kg |
| almacen_idlewood | Almacen Idlewood | Almacen | 2232, -1265, 23.8 | $25,000 | $300 | 500 kg |
| taller_glen_park | Taller Glen Park | Taller | 1958, -1200, 18.0 | $20,000 | $250 | 100 kg |
| almacen_compton | Almacen Compton | Almacen | 1480, -1580, 13.5 | $30,000 | $350 | 500 kg |
| taller_east_los_santos | Taller East LS | Taller | 2370, -1350, 24.0 | $18,000 | $220 | 100 kg |

### Fase 2 - San Fierro

| ID | Nombre | Tipo | Coordenadas | Costo | Nomina/dia | Capacidad |
|---|---|---|---|---|---|---|
| fabrica_doherty | Fabrica Doherty | Fabrica | -2060, 150, 35.0 | $75,000 | $800 | 200 kg |
| almacen_easter_basin | Almacen Easter Basin | Almacen | -1660, -630, 15.0 | $100,000 | $1,000 | 500 kg |
| fabrica_hashbury | Fabrica Hashbury | Fabrica | -1900, 750, 45.0 | $85,000 | $900 | 200 kg |
| almacen_whetstone | Almacen Whetstone | Almacen | -2200, -2500, 30.0 | $90,000 | $950 | 500 kg |

### Fase 3 - Las Venturas

| ID | Nombre | Tipo | Coordenadas | Costo | Nomina/dia | Capacidad |
|---|---|---|---|---|---|---|
| almacen_redsands | Almacen Redsands | Almacen | 1400, 1000, 10.0 | $250,000 | $3,000 | 1000 kg |
| fabrica_prickle_pine | Fabrica Prickle Pine | Fabrica | 1550, 2200, 15.0 | $300,000 | $3,500 | 300 kg |
| almacen_las_brujas | Almacen Las Brujas | Almacen | 230, -1800, 5.0 | $200,000 | $2,500 | 1000 kg |
| fabrica_north_las_venturas | Fabrica North LV | Fabrica | 1800, 2100, 10.0 | $275,000 | $3,200 | 300 kg |
| almacen_pilgrim | Almacen Pilgrim | Almacen | 500, 1800, 12.0 | $220,000 | $2,800 | 1000 kg |

---

## 3. Sistema de Empleados

### Niveles de Empleado

| Nivel | Costo/dia | Efeciencia | Bonos |
|---|---|---|---|
| 1 -Novato | $100 | 60% | Ninguno |
| 2 - Experienciado | $200 | 68% | +5% produccion |
| 3 - Veterano | $350 | 76% | +10% produccion, -5% calor |
| 4 - Experto | $500 | 84% | +15% produccion, -10% calor |
| 5 - Maestro | $700 | 92% | +20% produccion, -15% calor |

### Slots de Empleados por Tipo de Propiedad

| Tipo | Max Empleados | Roles Disponibles |
|---|---|---|
| Taller | 3 | Mecanico, Ayudante, Guardia |
| Almacen | 5 | Guardia x2, Operario x2, Supervisor |
| Fabrica | 8 | Obrero x4, Mecanico x2, Supervisor, Guardia |

### Formula de Produccion

```
produccion_efectiva = base_produccion * (0.6 + (nivel_empleado * 0.08)) * cantidad_empleados
```

Ejemplo: Fabrica con 3 empleados nivel 3:
```
base = 1 unidad cada 10 min
efectiva = 1 * (0.6 + (3 * 0.08)) * 3 = 1 * 0.84 * 3 = 2.52 unidades cada 10 min
```

---

## 4. Produccion de Fabricas

### Recetas de Fabrica

| Fabrica | Entrada | Salida | Tiempo |
|---|---|---|---|
| Fabrica Doherty | 2x scrap_metal + 1x spring | 1x pistol_frame | 10 min |
| Fabrica Doherty | 1x barrel_small + 1x gunpowder | 1x pistol_barrel | 10 min |
| Fabrica Hashbury | 3x scrap_metal + 2x spring + 1x gunpowder | 1x rifle_receiver | 15 min |
| Fabrica Hashbury | 2x barrel_small + 1x gunpowder | 1x rifle_barrel | 12 min |
| Fabrica Prickle Pine | 4x scrap_metal | 1x armor_plate | 8 min |
| Fabrica North LV | 1x pistol_frame + 1x pistol_barrel | 1x pistol_assembled | 5 min |
| Fabrica North LV | 1x rifle_receiver + 1x rifle_barrel | 1x m4_assembled | 12 min |

### Tick de Produccion

Cada 10 minutos de juego (600,000 ms), cada fabrica activa procesa una receta si tiene los materiales.

```javascript
function processFactoryProduction(factory) {
    if (factory.employees.length === 0) return;

    const efficiency = calculateEfficiency(factory);
    const recipes = getRecipesForFactory(factory.id);

    for (const recipe of recipes) {
        if (hasIngredients(factory.stock, recipe.input)) {
            removeIngredients(factory.stock, recipe.input);
            const outputQty = Math.ceil(efficiency);
            addItem(factory.output, recipe.output, outputQty);
        }
    }
}
```

---

## 5. Nomina Diaria

### Cobro Automatico

Cada vez que pasa medianoche en el juego:

```javascript
function processPayDay() {
    const totalExpenses = calculateTotalExpenses();
    const playerMoney = GameState.player.cleanMoney;

    if (playerMoney >= totalExpenses) {
        GameState.player.cleanMoney -= totalExpenses;
        GameState.finances.dailyExpenses = totalExpenses;
        emit("PAY_DAY", { total: totalExpenses });
    } else {
        // Fondos insuficientes
        GameState.finances.dailyExpenses = totalExpenses;
        emit("PAY_DAY_FAILED", { deficit: totalExpenses - playerMoney });
        applyNoPayPenalties();
    }
}
```

### Consecuencias de No Pagar Nomina

| Dia sin pagar | Efecto |
|---|---|
| 1 dia | Empleados descontentos, -10% eficiencia |
| 2 dias | Empleados protestan, produccion -30% |
| 3 dias | Empleados se van, produccion 0 |
| 5+ dias | Probabilidad de redada policial +20% |
| 7+ dias | Propiedad abandonada, se puede perder |

---

## 6. Compra de Propiedades

```javascript
function buyProperty(propertyId) {
    const prop = PROPERTIES_DB[propertyId];
    if (!prop) return false;
    if (GameState.properties[propertyId]) return false; // Ya comprada
    if (GameState.player.cleanMoney < prop.costo) return false;

    GameState.player.cleanMoney -= prop.costo;
    GameState.properties[propertyId] = {
        owned: true,
        employees: [],
        stock: [],
        output: [],
        level: 1
    };

    emit("PROPERTY_BOUGHT", { propertyId });
    return true;
}
```

---

## 7. Interaccion con el Jugador

El jugador interactua con propiedades acercandose al punto de entrada y presionando tecla de interaccion. Se muestra un menu con opciones:

### Menu de Propiedad

```
[Propiedad: Almacen Ganton]
- Estado: Operativo
- Empleados: 2/5
- Stock: 150/500 kg

[1] Contratar Empleado ($100/dia)
[2] Despedir Empleado
[3] Ver Inventario
[4] Depositar Materiales
[5] Retirar Productos
[0] Cerrar
```
