# GSIS — Sistema Economico

Diseno del sistema economico, precios, formulas de lavado y balance de progresion.

> **Diseño — no implementado** (Fase 2, roadmap 2.1).
> `core/gsis_EconomyUtils.js` y `modules/gsis_BankModule.js` estan planificados;
> no crear hasta que el roadmap lo indique. Ver `gsis_MAINTENANCE.md` §5.

---

## 1. Loop Economico Core

```
RECOLECTAR/PRODUCIR -> ALMACENAR -> TRANSPORTAR -> LAVAR -> REINVERTIR
       ^                                                    |
       +----------------------------------------------------+
```

Dinero Limpio (cleanMoney): Se usa para comprar propiedades, vehiculos y pagar nomina.
Dinero Sucio (dirtyMoney): Debe ser lavado para usarse en compras grandes.

---

## 2. Items y Precios

### Materias Primas (Se recolectan en el mapa)

| ID | Nombre | Peso kg | Compra | Venta | Fase |
|---|---|---|---|---|---|
| scrap_metal | Chatarra | 0.5 | $50 | $80 | 1 |
| gunpowder | Polvora | 0.2 | $100 | $150 | 1 |
| spring | Resorte | 0.1 | $75 | $120 | 1 |
| barrel_small | Canon Corto | 0.8 | $200 | $350 | 1 |

### Componentes Intermedios (Se fabrican en fabricas)

| ID | Nombre | Peso kg | Receta | Fase |
|---|---|---|---|---|
| pistol_frame | Chasis Pistola | 0.6 | 2x scrap_metal + 1x spring | 1 |
| pistol_barrel | Canon Pistola | 0.4 | 1x barrel_small + 1x gunpowder | 1 |
| rifle_receiver | Cuerpo Rifl | 1.2 | 3x scrap_metal + 2x spring + 1x gunpowder | 2 |
| rifle_barrel | Canon Rifl | 1.0 | 2x barrel_small + 1x gunpowder | 2 |
| armor_plate | Placa Chaleco | 1.5 | 4x scrap_metal | 2 |

### Productos Terminados

| ID | Nombre | Peso kg | Receta | Venta | Fase |
|---|---|---|---|---|---|
| pistol_assembled | Pistola Ensamblada | 1.2 | 1x pistol_frame + 1x pistol_barrel | $2,500 | 1 |
| sawed_off | Recortada | 1.0 | 1x pistol_frame + 1x gunpowder | $3,000 | 1 |
| m4_assembled | M4 Ensamblada | 3.5 | 1x rifle_receiver + 1x rifle_barrel | $15,000 | 2 |
| body_armor | Chaleco Balistico | 2.0 | 1x armor_plate + 1x spring | $8,000 | 2 |
| scope | Mira | 0.3 | 1x barrel_small + 1x spring | $4,000 | 2 |

> **La columna "Venta" de acá NO es `WEAPON_DATA.price`.** Son dos canales
> distintos y no se tocan entre sí:
>
> | Canal | Qué es | Dónde vive | Rango |
> |---|---|---|---|
> | **Venta callejera** (esta tabla) | el loop de dinero del crafteo: comprar materiales, fabricar, vender el producto en la calle | este doc (y el sistema de calle, que todavía no está implementado) | $2.500-$15.000 por producto |
> | **`WEAPON_DATA.price`** | precio de catálogo: lo que paga el jugador en el **dealer** (`price × markup`) y la base de la **columna "Valor"** / del trueque (`price × 0.6`) | `data/gsis_weapons.js` | 550-700 por arma |
>
> Por eso los cuatro productos terminados que además son armas del catálogo
> tienen dos números que no coinciden, y está bien que no coincidan:
> `pistol_assembled` (Venta $2.500 / price 0), `sawed_off` ($3.000 / 500),
> `m4_assembled` ($15.000 / 1.100), `body_armor` ($8.000 / 1.200). El margen
> del crafteo vive en la primera columna; la segunda es la contraparte del
> dealer.
>
> `pistol_assembled` está en **0** a propósito: comparte `weaponId` con el `9mm`,
> así que con precio el jugador podría comprar y revender la misma pistola dos
> veces, y `getDealerPrice` devuelve 0 para precio 0 (no aparece en el catálogo).
>
> La calibración de `price` (orden y magnitud relativos del mercado real, no el
> dólar 1:1) está documentada al pie de `data/gsis_weapons.js` y resumida en
> `gsis_INVENTORY.md` §7.

> **Los cargadores son un tercer uso de `price`, y no es la venta callejera.**
> Un cargador vale `price + balas × PRECIO_BALA` (ver `getMagValue` en
> `gsis_weapons.js`): son 220-260 por cargador, y son el gasto RECURRENTE
> del juego, porque el arma se compra una vez y el cargador se vuelve a comprar
> hasta que se queda sin balas. Un 9mm lleno son $254 y la pistola $550, así que
> la primera vez la munición es la mitad de la inversión.
>
> No entra en el margen de crafteo de esta sección (el cargador no se fabrica: se
> compra al dealer) ni en el trueque (el NPC solo compra armas, filtrado por type).

### Paquetes de Transporte

| ID | Contenido | Peso Total | Venta |
|---|---|---|---|
| package_pistol_small | 5x Pistol | 6.0 kg | $12,500 |
| package_pistol_large | 15x Pistol | 18.0 kg | $35,000 |
| package_rifle_small | 3x M4 | 10.5 kg | $45,000 |
| package_rifle_large | 10x M4 | 35.0 kg | $140,000 |
| package_armor | 5x Chaleco | 10.0 kg | $40,000 |
| package_mixed | 5 Pistol + 2 M4 + 3 Chaleco | 25.0 kg | $83,500 |

---

## 3. Formula de Lavado de Dinero

### Formula Base

```
dinero_limpio = dinero_sucio * tasa_lavado
perdida = dinero_sucio - dinero_limpio
```

### Tasa de Lavado por Metodo

| Metodo | Tasa | Riesgo | Cooldown | Fase |
|---|---|---|---|---|
| Cajero Automatico ATM | 0.60 | Alto | 24h juego | 1 |
| Lavanderia de Fachada | 0.70 | Medio | 12h juego | 1 |
| Restaurante de Fachada | 0.75 | Bajo | 12h juego | 2 |
| Concesionario de Autos | 0.80 | Bajo | 8h juego | 2 |
| Banco Privado | 0.90 | Minimo | 4h juego | 3 |

### Modificadores

| Factor | Efecto |
|---|---|
| Calor Policial Alto (>70) | Tasa * 0.7 |
| Calor Policial Medio (30-70) | Tasa * 0.9 |
| Calor Policial Bajo (<30) | Sin modificacion |
| Propiedad de Fachada Nivel 3 | Tasa * 1.1 (bonus 10%) |
| Sin propiedades en zona | Tasa * 0.8 (penalizacion 20%) |

### Ejemplo de Lavado

```
Jugador lleva $50,000 sucios a Lavanderia de Fachada (tasa 0.70)
Calor Policial: 50 (Medio) -> modificador 0.9
Tasa efectiva: 0.70 * 0.9 = 0.63

dinero_limpio = 50,000 * 0.63 = $31,500
perdida = $18,500
Cooldown: 12 horas de juego
```

---

## 4. Curva de Progresion Economica

### Fase 1 - Los Santos (Clandestinidad)

| Concepto | Valor |
|---|---|
| Ingreso promedio por venta callejera | $500 - $2,500 |
| Costo de materia prima por arma | $350 - $500 |
| Ganancia neta por arma ensamblada | $2,000 - $2,500 |
| Propiedad mas barata | $15,000 (Taller Ganton) |
| Vehiculo mas barato | $8,000 (Pony) |
| Nomina diaria minima | $200 (1 empleado) |
| Meta de esta fase | $50,000 acumulados |

### Fase 2 - San Fierro (Logistica)

| Concepto | Valor |
|---|---|
| Ingreso por entrega de paquete | $12,500 - $45,000 |
| Costo de produccion por paquete | $3,000 - $15,000 |
| Propiedad mas barata | $75,000 (Fabrica Doherty) |
| Vehiculo mas barato | $25,000 (Burrito) |
| Nomina diaria minima | $800 (3 empleados) |
| Meta de esta fase | $500,000 acumulados |

### Fase 3 - Las Venturas (Dominio)

| Concepto | Valor |
|---|---|
| Ingreso por entrega grande | $45,000 - $140,000 |
| Propiedad mas barata | $250,000 (Almacen LV) |
| Nomina diaria minima | $3,000 (5+ empleados) |
| Meta final | $2,000,000 + control territorial |

---

## 5. Ecuaciones de Balance

### Inflacion por Fase

```
precio_fase2 = precio_fase1 * 1.5
precio_fase3 = precio_fase2 * 2.0
```

### Calor Policial por Actividad

| Actividad | Calor Generado |
|---|---|
| Recoleccion de chatarra | +1 por recoleccion |
| Venta en esquina | +5 por venta |
| Transporte con furgon | +2 por minuto de viaje |
| Entrega completada | -10 (se alivia) |
| Redada policial | +30 de golpe |
| Decaimiento natural | -1 cada 5 minutos |

### Umbral de Redada

```
Si zoneHeat >= 100 en cualquier zona:
  -> Redada policial activada
  -> Probabilidad de perdida: 30% del inventario del furgon
  -> Multa: 10% del saldo bancario
  -> zoneHeat se resetea a 30
```

---

## 6. Codigo Base de Economia

```javascript
// gsis_EconomyUtils.js

export const ECONOMY = {
    LAUNDERING_RATES: {
        atm: 0.60,
        laundromat: 0.70,
        restaurant: 0.75,
        dealership: 0.80,
        private_bank: 0.90
    },
    HEAT_MODIFIERS: {
        high: 0.7,   // heat > 70
        medium: 0.9,  // heat 30-70
        low: 1.0      // heat < 30
    },
    RAID_THRESHOLD: 100,
    RAID_INVENTORY_LOSS: 0.30,
    RAID_MONEY_FINE: 0.10,
    HEAT_DECAY_RATE: 1,
    HEAT_DECAY_INTERVAL: 300000 // 5 min en ms
};

export function calculateLaundering(amount, method, zoneHeat) {
    const baseRate = ECONOMY.LAUNDERING_RATES[method] || 0.60;
    let heatMod = ECONOMY.HEAT_MODIFIERS.low;
    if (zoneHeat > 70) heatMod = ECONOMY.HEAT_MODIFIERS.high;
    else if (zoneHeat > 30) heatMod = ECONOMY.HEAT_MODIFIERS.medium;

    const effectiveRate = baseRate * heatMod;
    return Math.floor(amount * effectiveRate);
}
```
