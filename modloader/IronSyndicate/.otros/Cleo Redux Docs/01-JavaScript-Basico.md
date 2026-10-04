# JavaScript en CLEO Redux

## Visión General
CLEO Redux utiliza JavaScript como lenguaje principal para scripts personalizados. Soporta el estándar ECMAScript 2020, lo que permite usar características modernas de JavaScript.

## Características Soportadas
- Soporte completo de ECMAScript 2020
- Imports (importaciones)
- Clases
- Arrow functions (funciones flecha)
- Async/await
- Modules

## Diferencias Importantes
- **No es Node.js**: No esperes features de Node.js como sockets, operaciones de sistema de archivos, etc.
- Entorno específico para juegos, no un entorno web general

## Estructura Básica de un Script

### Creación de Archivo
- Extensión: `.js`
- Ubicación: Carpeta CLEO del juego
- Editor recomendado: VS Code

### Ejemplo Básico
```javascript
// intro.js
log("Hello world");
wait(0);
```

## Ciclo de Vida del Script
1. CLEO Redux carga el script al iniciar el juego
2. El script se ejecuta en cada iteración del loop del juego
3. El script debe llamar a `wait(n)` para ceder control
4. Soporta hot reloading (recarga en caliente al guardar cambios)

## Concurrencia
- CLEO Redux puede cargar y ejecutar múltiples scripts concurrentemente
- No se ejecutan en paralelo, sino secuencialmente en una cola
- El loop principal del juego se bloquea mientras se procesan los scripts CLEO
- `wait(n)` es crucial para permitir que otros scripts se ejecuten

## Funciones Principales

### log()
```javascript
log("Mensaje en el log");
```
Escribe mensajes en el archivo `cleo_redux.log`

### wait(n)
```javascript
wait(0); // Espera 0 milisegundos
wait(100); // Espera 100 milisegundos
```
Pausa el script actual. Requerido para ceder control a otros scripts.

### native()
```javascript
native("SET_PLAYER_HEALTH", 0, 100);
```
Llama a funciones nativas del juego.

## Variables Especiales
- `__dirname`: Directorio del script actual
- `__filename`: Ruta completa del script actual
- `TIMERA`, `TIMERB`: Temporizadores del juego
