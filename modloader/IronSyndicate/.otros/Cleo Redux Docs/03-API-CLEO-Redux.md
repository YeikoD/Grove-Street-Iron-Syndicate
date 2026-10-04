# API de CLEO Redux

## Visión General
CLEO Redux proporciona una API JavaScript extensa que incluye funciones nativas del juego y bindings específicos de CLEO.

## Funciones Nativas
CLEO Redux soporta todos los comandos nativos del juego actual. En la serie clásica de GTA 3D también se conocen como opcodes.

### Llamada a Funciones Nativas
```javascript
// Sintaxis básica
native("NOMBRE_FUNCION", arg1, arg2, ...);

// Ejemplo: establecer salud del jugador
native("SET_PLAYER_HEALTH", 0, 100);

// Ejemplo: crear vehículo
native("CREATE_CAR", modelId, x, y, z);
```

### Abstracciones (Clases)
CLEO Redux define abstracciones sobre las funciones nativas llamadas clases:
- `Player`: Comandos relacionados con el jugador
- `Car`: Comandos relacionados con vehículos
- `Char`: Comandos relacionados con personajes/peds
- `Text`: Comandos relacionados con visualización de texto
- `Checkpoint`: Crear y gestionar checkpoints
- `Pad`: Detección de teclas y controles
- `Blip`: Marcadores en el radar/mapa
- `Camera`: Control de la cámara
- `Hud`: Elementos de la interfaz
- `Audio`: Sistema de audio
- `Game`: Funciones generales del juego

## Variables del Sistema

### HOST
Variable que contiene información sobre el host/juego.

### ONMISSION
Estado de misión actual.

### TIMERA, TIMERB
Temporizadores del juego para medir tiempo.

### __dirname
Directorio donde se encuentra el script actual.

### __filename
Ruta completa del archivo del script actual.

## Funciones de CLEO Redux

### log(message)
```javascript
log("Mensaje de depuración");
```
Escribe mensajes en el archivo de log `cleo_redux.log`.

### wait(milliseconds)
```javascript
wait(0);    // Cede control inmediatamente
wait(100);  // Espera 100ms
wait(1000); // Espera 1 segundo
```
Pausa el script actual. Requerido para permitir que otros scripts se ejecuten.

### native(functionName, ...args)
```javascript
native("SET_PLAYER_HEALTH", playerId, health);
```
Llama a una función nativa del juego por nombre.

### asyncWait(milliseconds)
```javascript
await asyncWait(1000);
```
Versión asíncrona de wait para usar en funciones async.

### setTimeout(callback, delay)
```javascript
setTimeout(() => {
    log("Esto se ejecuta después de 1 segundo");
}, 1000);
```
Programa una función para ejecutarse después de un delay.

### setInterval(callback, interval)
```javascript
setInterval(() => {
    log("Esto se ejecuta cada segundo");
}, 1000);
```
Programa una función para ejecutarse repetidamente cada intervalo.

### clearTimeout(timerId)
```javascript
const timerId = setTimeout(() => {}, 1000);
clearTimeout(timerId);
```
Cancela un timer programado.

### clearInterval(intervalId)
```javascript
const intervalId = setInterval(() => {}, 1000);
clearInterval(intervalId);
```
Cancela un intervalo programado.

### addEventListener(eventName, callback)
```javascript
const removeListener = addEventListener("eventName", (data) => {
    log("Evento recibido:", data);
});
```
Registra un listener para eventos del juego. Retorna una función para remover el listener.

### dispatchEvent(eventName, data)
```javascript
dispatchEvent("myEvent", { key: "value" });
```
Dispara un evento personalizado.

### showTextBox(text)
```javascript
showTextBox("Texto en pantalla");
```
Muestra un cuadro de texto en pantalla.

### exit()
```javascript
exit();
```
Termina la ejecución del script actual.

## Objetos Estáticos

### Memory
Objeto para operaciones de memoria (requiere permisos especiales).

### Math
Objeto matemático estándar de JavaScript.

### FxtStore
Almacén de texto para el juego.

### CLEO
Objeto principal de CLEO Redux con propiedades y métodos.

#### CLEO.version
Versión de CLEO Redux.

#### CLEO.apiVersion
Versión de la API.

#### CLEO.hostVersion
Versión del host/juego.

#### CLEO.runScript(scriptName)
```javascript
CLEO.runScript("myscript.js");
```
Ejecuta otro script.

#### CLEO.debug
Modo de depuración.

## Detección de Teclas (Clase Pad)

**IMPORTANTE:** La clase es `Pad`, NO `Key`. No existe `Key.IsKeyDown()`.

```javascript
// Verificar si una tecla está presionada (sostenida)
Pad.IsKeyDown(74)      // J presionada
Pad.IsKeyDown(80)      // P presionada

// Verificar si una tecla fue recién presionada (flanco positivo)
Pad.IsKeyJustPressed(74)  // J recién presionada

// Verificar si una tecla fue liberada
Pad.IsKeyUp(74)           // J liberada

// Verificar si una tecla está presionada (alternativa)
Pad.IsKeyPressed(74)      // J presionada
```

### Códigos de Teclas Comunes (KeyCode)

| Tecla | Código | Tecla | Código |
|-------|--------|-------|--------|
| A | 65 | N | 78 |
| B | 66 | O | 79 |
| C | 67 | P | 80 |
| D | 68 | Q | 81 |
| E | 69 | R | 82 |
| F | 70 | S | 83 |
| G | 71 | T | 84 |
| H | 72 | U | 85 |
| I | 73 | W | 87 |
| **J** | **74** | X | 88 |
| K | 75 | Y | 89 |
| L | 76 | Z | 90 |
| M | 77 | Space | 32 |
| Enter | 13 | Shift | 16 |
| Ctrl | 17 | Alt | 18 |
| Tab | 9 | Escape | 27 |

### Ejemplo: Motor on/off con J

```javascript
var _engineState = false;

while (true) {
    wait(0);
    var p = new Player(0);
    var c = p.getChar();

    if (Pad.IsKeyJustPressed(74)) { // J
        if (c.isInAnyCar()) {
            var car = c.getCarIsUsing();
            _engineState = !_engineState;
            car.setEngineOn(_engineState);
            showTextBox(_engineState ? "~g~Motor encendido" : "~r~Motor apagado");
        }
    }
}
```

## Sistema de Eventos
CLEO Redux soporta un sistema de eventos para reaccionar a cambios en el juego.

### Eventos Comunes
- Eventos del juego (cambios de estado, acciones del jugador)
- Eventos personalizados (dispatchEvent)
- Eventos del sistema
