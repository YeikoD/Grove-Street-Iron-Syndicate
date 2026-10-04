# Diferencias: CLEO Redux vs CLEO Clásico (.cs)

## Resumen de Diferencias Fundamentales

| Aspecto | CLEO Clásico (.cs) | CLEO Redux (.js/.ts) |
|---------|-------------------|---------------------|
| **Lenguaje** | SCM (ensamblador/opcode) | JavaScript/TypeScript |
| **Extensión** | `.cs` | `.js` / `.ts` |
| **Sintaxis** | Bajo nivel, opcodes numéricos | Alto nivel, ES2020 |
| **Variables** | Limitadas (tipo específico) | Variables JavaScript normales |
| **Funciones** | No hay funciones reales | Funciones completas de JS |
| **Arrays** | Muy limitados | Arrays completos de JS |
| **Clases** | No existen | Clases ES6 completas |
| **Seguridad** | Acceso irrestricto a memoria | Sistema de permisos |
| **Hot Reloading** | No (requiere reiniciar juego) | Sí (recarga al guardar) |
| **Debugging** | Difícil (log básico) | log() + herramientas JS |

## Ejemplos Comparativos

### 1. Hola Mundo

**CLEO Clásico (.cs):**
```scm
{$CLEO .cs}

:MAIN
wait 0
0AD9: "Hello World"  // Mostrar texto
wait 1000
jump MAIN
```

**CLEO Redux (.js):**
```javascript
log("Hello World");
wait(0);
```

### 2. Establecer Salud del Jugador

**CLEO Clásico (.cs):**
```scm
{$CLEO .cs}

:MAIN
wait 0
0006: 0@ = 100  // Asignar valor a variable local
0223: set_player_health 0 to 0@  // Opcode para salud
wait 100
jump MAIN
```

**CLEO Redux (.js):**
```javascript
const player = new Player(0);
player.setHealth(100);
wait(0);
```

### 3. Bucle con Condición

**CLEO Clásico (.cs):**
```scm
{$CLEO .cs}

:MAIN
wait 0
if
0256:   player 0 defined
jf @EXIT

0006: 0@ = 100
0223: set_player_health 0 to 0@
wait 100
jump MAIN

:EXIT
wait 0
jump MAIN
```

**CLEO Redux (.js):**
```javascript
const player = new Player(0);

while (true) {
    if (player.isDefined()) {
        player.setHealth(100);
    }
    wait(100);
}
```

### 4. Crear Vehículo

**CLEO Clásico (.cs):**
```scm
{$CLEO .cs}

:MAIN
wait 0
00A5: 0@ = create_car #INFERNUS at 0.0 0.0 0.0
wait 100
jump MAIN
```

**CLEO Redux (.js):**
```javascript
const car = Car.Create(411, 0.0, 0.0, 0.0); // 411 = Infernus
wait(0);
```

## Conceptos que NO Existen en CLEO Clásico

### 1. Variables JavaScript Normales
```javascript
// CLEO Redux - Variables normales
let salud = 100;
const nombre = "Jugador";
const coords = { x: 0, y: 0, z: 0 };
const armas = [24, 25, 26]; // Array real
```

### 2. Funciones Reales
```javascript
// CLEO Redux - Funciones con parámetros
function setPlayerHealth(playerId, health) {
    const player = new Player(playerId);
    player.setHealth(health);
}

// Usar la función
setPlayerHealth(0, 100);
```

### 3. Clases y Objetos
```javascript
// CLEO Redux - POO completo
class PlayerManager {
    constructor(playerId) {
        this.player = new Player(playerId);
    }

    heal() {
        this.player.setHealth(100);
    }

    giveWeapon(weaponId, ammo) {
        this.player.giveWeapon(weaponId, ammo);
    }
}

const manager = new PlayerManager(0);
manager.heal();
```

### 4. Async/Await
```javascript
// CLEO Redux - Programación asíncrona
async function delayedAction() {
    log("Iniciando...");
    await asyncWait(1000); // Esperar 1 segundo
    log("Después de 1 segundo");
}
```

### 5. Sistema de Eventos
```javascript
// CLEO Redux - Eventos
addEventListener("eventName", (data) => {
    log("Evento recibido:", data);
});
```

## Errores Comunes de Confusión

### ❌ ERROR: Usar sintaxis .cs en archivos .js
```javascript
// INCORRECTO - Esto es sintaxis vieja
0006: 0@ = 100
0223: set_player_health 0 to 0@

// CORRECTO - Sintaxis JavaScript
const health = 100;
native("SET_PLAYER_HEALTH", 0, health);
// o usando clases
const player = new Player(0);
player.setHealth(health);
```

### ❌ ERROR: Olvidar wait()
```javascript
// INCORRECTO - Bloqueará el juego
while (true) {
    log("Loop infinito sin wait");
}

// CORRECTO - Siempre usar wait()
while (true) {
    log("Loop con wait");
    wait(0);
}
```

### ❌ ERROR: Intentar usar características de Node.js
```javascript
// INCORRECTO - No existe en CLEO Redux
const fs = require('fs');
fs.readFile('archivo.txt', ...);

// CORRECTO - Usar solo APIs de CLEO Redux
log("Mensaje");
// Operaciones de archivo requieren permisos especiales
```

### ❌ ERROR: Usar variables globales tipo SCM
```javascript
// INCORRECTO - No existen variables 0@, 1@, etc.
0@ = 100;
1@ = 200;

// CORRECTO - Variables JavaScript
let var1 = 100;
let var2 = 200;
```

## Ventajas Específicas de CLEO Redux

### 1. Hot Reloading
- **Viejo**: Cambiar código → cerrar juego → reiniciar
- **Redux**: Cambiar código → guardar → funciona inmediatamente

### 2. Debugging
- **Viejo**: Log básico, difícil de seguir
- **Redux**: log() + herramientas de desarrollo JS

### 3. Estructura del Código
- **Viejo**: Código lineal, difícil de organizar
- **Redux**: Módulos, imports, estructura moderna

### 4. Seguridad
- **Viejo**: Acceso total a memoria (peligroso)
- **Redux**: Sistema de permisos controlado

## Migración de Conceptos

### De OpCodes a Nativos
```scm
// Viejo - Opcode numérico
0223: set_player_health 0 to 100

// Nuevo - Nombre descriptivo
native("SET_PLAYER_HEALTH", 0, 100);

// O usando clases (más limpio)
const player = new Player(0);
player.setHealth(100);
```

### De Variables Locales a Variables JS
```scm
// Viejo - Variables limitadas
0006: 0@ = 10
0006: 1@ = 20
006A: 2@ = 0@ + 1@

// Nuevo - Variables JavaScript completas
let a = 10;
let b = 20;
let c = a + b;
```

### De Labels a Funciones
```scm
// Viejo - Labels y jumps
:SUBROUTINE
0006: 0@ = 100
return

:MAIN
call @SUBROUTINE
jump MAIN

// Nuevo - Funciones reales
function subroutine() {
    let value = 100;
}

function main() {
    subroutine();
    wait(0);
}
```

## Reglas de Oro para Evitar Confusión

1. **NUNCA** mezcles sintaxis .cs con .js
2. **SIEMPRE** usa extensiones correctas (.js o .ts)
3. **SIEMPRE** incluye `wait(n)` en loops
4. **OLVIDA** los opcodes numéricos (usa nombres o clases)
5. **APROVECHA** características modernas de JS (arrays, objetos, funciones)
6. **USA** el sistema de clases en lugar de opcodes directos
7. **RECUERDA** que no es Node.js (no esperes APIs de servidor)

## Conclusión

CLEO Redux está diseñado para ser una evolución moderna del CLEO clásico, con:

- ✅ Sintaxis familiar (JavaScript/TypeScript)
- ✅ Mejor seguridad y control
- ✅ Herramientas de desarrollo modernas
- ✅ Compatibilidad parcial con scripts viejos
- ✅ Experiencia de desarrollo mucho mejor

Si vienes del CLEO clásico, **concéntrate en aprender JavaScript/TypeScript** y olvida los patrones antiguos de SCM. La curva de aprendizaje es suave si ya conoces programación moderna.
