# TypeScript en CLEO Redux

## Visión General
CLEO Redux tiene soporte de primera clase para TypeScript. TypeScript es un superconjunto de JavaScript con tipos estáticos y características adicionales.

## Ventajas de Usar TypeScript
- Tipado estático para detectar errores en tiempo de desarrollo
- Autocompletado en IDEs
- Refactorizado más seguro
- Mejor soporte para proyectos a gran escala

## Configuración
- Extensión de archivos: `.ts`
- Pueden usarse donde se admiten scripts JS
- Pueden importarse tanto en scripts JS como TS usando `import`

## tsconfig.json
CLEO Redux crea automáticamente un archivo `tsconfig.json` en el directorio CLEO al ejecutarse por primera vez.

### Configuración Predeterminada
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "esnext",
    "noEmit": true,
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "allowImportingTsExtensions": true,
    "allowArbitraryExtensions": true,
    "allowJs": true,
    "checkJs": true,
    "lib": ["ES2020"],
    "types": []
  },
  "include": ["**/*.ts", "**/*.mts", ".config/*.d.ts"]
}
```

## Ejemplo de Script TypeScript
```typescript
// script.ts
interface Player {
    id: number;
    health: number;
}

function setPlayerHealth(player: Player, health: number): void {
    native("SET_PLAYER_HEALTH", player.id, health);
}

const player: Player = {
    id: 0,
    health: 100
};

setPlayerHealth(player, 100);
wait(0);
```

## Importaciones
```typescript
// Importar desde otro archivo TypeScript
import { myFunction } from './utils';

// Importar desde JavaScript
import { jsFunction } from './javascriptFile';
```

## Compilación
CLEO Redux compila TypeScript a JavaScript automáticamente. No necesitas un proceso de compilación separado.
