# Primeros Pasos en CLEO Redux

## Instalación y Verificación

### 1. Instalación
1. Instala CLEO Redux en tu juego
2. Ejecuta el juego una vez para verificar que CLEO se carga correctamente
3. Verifica que se haya creado el archivo `cleo_redux.log` en la carpeta raíz del juego

### 2. Verificación
Si no hay errores en el log, puedes empezar a agregar scripts.

## Tu Primer Script

### Creación del Archivo
1. Ve a la carpeta CLEO del juego
2. Crea un nuevo archivo llamado `intro.js`
3. Edítalo con tu editor de texto preferido (VS Code recomendado)

### Código Básico
```javascript
// intro.js
log("Hello world");
wait(0);
```

### Ejecución
1. Guarda el archivo
2. Ejecuta el juego
3. Inicia una nueva partida o carga un guardado
4. Juega unos segundos
5. Ve a `cleo_redux.log` (no salgas del juego todavía)

Deberías ver una línea nueva como:
```
Hello world
```

### Hot Reloading
Una de las características más útiles de CLEO Redux es el hot reloading:

1. Abre `intro.js` nuevamente
2. Cambia "Hello world" por otro texto
3. Guarda el archivo
4. Vuelve al juego y juega unos segundos
5. Revisa `cleo_redux.log` nuevamente

Verás que el log ahora contiene el nuevo mensaje. El script se recargó automáticamente al guardar el archivo.

## Script Más Complejo

### Ejemplo con Funciones Nativas
```javascript
// salud.js
// Establecer salud del jugador
const playerId = 0;
const maxHealth = 100;

// Establecer salud máxima
native("SET_PLAYER_HEALTH", playerId, maxHealth);

log("Salud del jugador establecida a:", maxHealth);
wait(0);
```

### Ejemplo con Temporizadores
```javascript
// timer.js
// Usar TIMERA para medir tiempo
TIMERA = 0;

while (true) {
    // TIMERA incrementa automáticamente cada milisegundo
    if (TIMERA > 1000) { // 1 segundo
        log("Ha pasado 1 segundo");
        TIMERA = 0; // Reiniciar timer
    }
    wait(0);
}
```

## Concurrencia Múltiple

CLEO Redux puede cargar y ejecutar múltiples scripts concurrentemente.

### Ejemplo de Múltiples Scripts
```javascript
// script1.js
log("Script 1 iniciado");
wait(0);
```

```javascript
// script2.js
log("Script 2 iniciado");
wait(0);
```

Ambos scripts se ejecutarán en cada iteración del loop del juego, pero secuencialmente (no en paralelo).

## Importante: wait(n)

**Siempre debes llamar a `wait(n)` en tus scripts:**

- `wait(0)`: Cede control inmediatamente, permite que otros scripts se ejecuten
- `wait(n)`: Espera n milisegundos antes de continuar

Sin `wait()`, el script bloqueará la ejecución de otros scripts y potentially el juego.

## Organización de Scripts

### Estructura de Carpetas Sugerida
```
CLEO/
├── intro.js           # Script de prueba
├── player/
│   ├── health.js      # Scripts relacionados con jugador
│   └── movement.js
├── vehicles/
│   ├── spawn.js       # Scripts de vehículos
│   └── mods.js
└── utils/
    └── helpers.js     # Funciones auxiliares
```

## Debugging

### Uso del Log
```javascript
log("Variable x:", x);
log("Estado:", state);
log("Coordenadas:", x, y, z);
```

### Archivo de Log
- Ubicación: `cleo_redux.log` en la carpeta raíz del juego
- Se actualiza en tiempo real
- Útil para depuración

## Recursos Adicionales
- Documentación oficial: https://re.cleo.li/docs/en/
- API Reference: https://re.cleo.li/docs/en/api.html
- Ejemplos de scripts: https://re.cleo.li/docs/en/examples.html
