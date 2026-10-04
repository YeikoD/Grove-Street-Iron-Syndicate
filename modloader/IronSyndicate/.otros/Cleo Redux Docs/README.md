# Documentación de CLEO Redux

Esta carpeta contiene documentación esencial de CLEO Redux (JavaScript/TypeScript) para desarrollo de scripts para GTA SA y otros juegos soportados.

## Índice de Documentación

### Fundamentos
1. **[01-JavaScript-Basico.md](./01-JavaScript-Basico.md)** - Fundamentos de JavaScript en CLEO Redux, características soportadas y diferencias con Node.js

2. **[02-TypeScript.md](./02-TypeScript.md)** - Soporte de TypeScript, configuración y ejemplos

3. **[03-API-CLEO-Redux.md](./03-API-CLEO-Redux.md)** - API completa de CLEO Redux, funciones nativas, variables del sistema y eventos

4. **[04-Primeros-Pasos.md](./04-Primeros-Pasos.md)** - Guía de inicio, instalación, primer script y hot reloading

### Clases y Abstracciones
5. **[05-Clases-y-Abstracciones.md](./05-Clases-y-Abstracciones.md)** - Clases principales (Player, Car, Char, Text), Fluent Interface y ejemplos prácticos

### Migración desde CLEO Clásico
6. **[06-Diferencias-Viejo-CLEO.md](./06-Diferencias-Viejo-CLEO.md)** - ⭐ GUÍA CRÍTICA: Comparación detallada entre CLEO Redux (.js/.ts) y CLEO clásico (.cs), ejemplos comparativos y errores comunes a evitar

### Seguridad y Permisos
7. **[Introduccion.md](./Introduccion.md)** - Arquitectura de seguridad, sistema de permisos y control de acceso

## Recursos en Línea

- **Documentación Oficial**: https://re.cleo.li/docs/en/
- **API Reference**: https://re.cleo.li/docs/en/api.html
- **Sanny Builder Library**: https://library.sannybuilder.com/
- **YouTube Tutorials**: Playlist oficial de CLEO Redux

## Características Clave de CLEO Redux

- **Lenguajes**: JavaScript y TypeScript (ES2020)
- **Hot Reloading**: Los scripts se recargan automáticamente al guardar
- **Concurrencia**: Múltiples scripts ejecutándose secuencialmente
- **Seguridad**: Sistema de permisos para operaciones sensibles
- **Compatibilidad**: Inspirado en CLEO Library pero con mejor experiencia de desarrollo

## Estructura de Scripts

- JavaScript: `.js`
- TypeScript: `.ts`
- Ubicación: Carpeta CLEO del juego
- Recomendación: Usar VS Code para mejor experiencia

## Conceptos Fundamentales

### wait(n)
- **Crucial**: Siempre llama a `wait(n)` para ceder control
- `wait(0)`: Cede control inmediatamente
- Sin `wait()`, el script bloqueará otros scripts y el juego

### native()
- Llama a funciones nativas del juego
- Sintaxis: `native("NOMBRE_FUNCION", arg1, arg2, ...)`
- Revisa Sanny Builder Library para nombres de funciones

### Sistema de Eventos
- `addEventListener()` para escuchar eventos
- `dispatchEvent()` para disparar eventos personalizados
- Reacción a cambios en el juego

## Tips de Desarrollo

1. **Usa log() extensivamente** para debugging
2. **Revisa cleo_redux.log** en tiempo real
3. **Organiza scripts** en carpetas por funcionalidad
4. **Aprovecha hot reloading** para desarrollo rápido
5. **Considera TypeScript** para proyectos grandes

## Próximos Temas a Documentar

- Clases de abstracción (Player, Car, Text, etc.)
- Sistema de eventos específicos del juego
- Operaciones de memoria (con permisos)
- Integración con mods existentes
- Ejemplos de scripts prácticos
