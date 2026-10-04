# Clases y Abstracciones en CLEO Redux

## Visión General
CLEO Redux define un conjunto de abstracciones sobre las funciones nativas llamadas **clases**. Cada clase representa un grupo de comandos alrededor de un dominio específico.

## Clases Principales

### Player
Clase para interactuar con el jugador.

#### Creación
```javascript
// Usando constructor
var p = new Player(0); // 0 es el ID del jugador

// Usando método estático
var p = Player.Create(0);
```

#### Métodos Comunes
```javascript
// Establecer salud
p.setHealth(100);

// Dar arma
p.giveWeapon(weaponId, ammo);

// Establecer arma actual
p.setCurrentWeapon(weaponId);

// Obtener coordenadas
var coords = p.getCoordinates();
log("X:", coords.x, "Y:", coords.y, "Z:", coords.z);

// Establecer coordenadas
p.setCoordinates(x, y, z);

// Verificar si está vivo
if (p.isAlive()) {
    log("Jugador está vivo");
}
```

### Car
Clase para interactuar con vehículos.

#### Creación
```javascript
// Crear vehículo en coordenadas específicas
var car = new Car(modelId, x, y, z);

// Usando método estático
var car = Car.Create(modelId, x, y, z);
```

#### Métodos de Motor y Puertas
```javascript
// Encender/apagar motor
car.setEngineOn(true);
car.setEngineOn(false);

// Verificar si el motor está encendido
car.isEngineOn(); // true/false

// Trabar/destrabar puertas
car.lockDoors(2);  // 2 = Locked
car.lockDoors(1);  // 1 = Unlocked

// Obtener estado de puertas
car.getDoorLockStatus(); // retorna el estado actual
```

#### Métodos de Posición y Persistencia
```javascript
// Congelar posición (anti-despawn)
car.freezePosition(true);
car.freezePosition(false);

// Marcar como necesario (evita que el juego lo borre)
car.markAsNeeded();

// No borrar por X milisegundos
car.dontDeleteUntilTime(60000); // 60 segundos

// Obtener/establecer coordenadas
var coords = car.getCoordinates();
car.setCoordinates(x, y, z);
```

#### Métodos de Daño y Estado
```javascript
// Establecer salud del vehículo
car.setHealth(1000);

// Hacer vehículo indestructible
car.setProofs(true, true, true, true, true);

// Verificar si está destruido
Car.IsDead(carHandle);

// Verificar si está en agua
car.isInWater();

// Verificar si está en llamas
car.isOnFire();

// Eliminar vehículo
car.delete();
```

### Checkpoint
Clase para crear y gestionar puntos de control en el mapa.

#### Creación
```javascript
// Crear checkpoint visual
// Parámetros: tipo, x, y, z, targetX, targetY, targetZ, radius
var checkpoint = Checkpoint.Create(3, x, y, z, x, y, z, 5.0);
```

#### Tipos de Checkpoint

| Tipo | Nombre | Descripción |
|------|--------|-------------|
| 0 | Cylinder (red) | Cilindro rojo |
| 1 | Cylinder (green) | Cilindro verde |
| 2 | Cylinder (blue) | Cilindro azul |
| 3 | Cylinder (white) | Cilindro blanco/Torus |
| 4 | Cylinder (yellow) | Cilindro amarillo |
| 5 | Cylinder (purple) | Cilindro morado |
| 6 | Cylinder (orange) | Cilindro naranja |
| 7 | Cylinder (unused) | No usado |
| 8 | Cylinder (unused) | No usado |
| 9 | Cylinder (unused) | No usado |

#### Detección de Proximidad
```javascript
// Verificar si el jugador está dentro del checkpoint
var p = new Player(0);
var c = p.getChar();

var isInCheckpoint = c.locateAnyMeans3D(x, y, z, radius, radius, radius, false);
```

#### Ejemplo Completo: Checkpoint Funcional
```javascript
var CHECKPOINT_X = 2528.0168;
var CHECKPOINT_Y = -1715.6896;
var CHECKPOINT_Z = 13.4925;
var CHECKPOINT_RADIUS = 5.0;

var checkpoint = Checkpoint.Create(3, CHECKPOINT_X, CHECKPOINT_Y, CHECKPOINT_Z,
    CHECKPOINT_X, CHECKPOINT_Y, CHECKPOINT_Z, CHECKPOINT_RADIUS);

var _wasInCheckpoint = false;

while (true) {
    wait(0);
    var p = new Player(0);
    var c = p.getChar();

    var isInCheckpoint = c.locateAnyMeans3D(CHECKPOINT_X, CHECKPOINT_Y, CHECKPOINT_Z,
        CHECKPOINT_RADIUS, CHECKPOINT_RADIUS, CHECKPOINT_RADIUS, false);

    if (isInCheckpoint && !_wasInCheckpoint) {
        showTextBox("~y~¡Has entrado al checkpoint!");
    }

    if (!isInCheckpoint && _wasInCheckpoint) {
        showTextBox("~b~Has salido del checkpoint");
    }

    _wasInCheckpoint = isInCheckpoint;
}
```

### Char
Clase para interactuar con personajes (pedestrians, NPCs).

#### Creación
```javascript
// Crear personaje
var char = new Char(modelId, x, y, z);

// Usando método estático
var char = Char.Create(modelId, x, y, z);
```

#### Métodos de Vehículos
```javascript
// Verificar si está en cualquier vehículo
char.isInAnyCar(); // true/false

// Verificar si está sentado en un vehículo
char.isSittingInAnyCar(); // true/false

// Verificar si está en un vehículo específico
char.isInCar(vehicle); // true/false

// Verificar si está sentado en un vehículo específico
char.isSittingInCar(vehicle); // true/false

// Obtener el vehículo que está usando
var car = char.getCarIsUsing(); // retorna handle del Car
```

#### Métodos Comunes
```javascript
// Establecer salud
char.setHealth(100);

// Obtener coordenadas
var coords = char.getCoordinates();

// Establecer coordenadas
char.setCoordinates(x, y, z);

// Eliminar personaje
char.delete();
```

### Text
Clase para mostrar texto en pantalla.

#### Métodos Comunes
```javascript
// Mostrar texto de ayuda
Text.PrintHelp("KEY1");

// Mostrar texto en pantalla
Text.PrintNow("TEXTO", time, style);

// Texto encima de la cabeza
Text.PrintAboveHead("Mensaje", entity);
```

## Fluent Interface (Encadenamiento de Métodos)

Los métodos en entidades construibles (Player, Car, Char, etc.) soportan encadenamiento, permitiendo escribir código más limpio:

```javascript
var p = new Player(0);
p.giveWeapon(2, 100)
  .setHealth(5)
  .setCurrentWeapon(2)
  .getChar()
  .setCoordinates(1144, -600, 14)
  .setBleeding(true);
```

### Importante
Los métodos destructores interrumpen la cadena. Por ejemplo, `delete()` terminará el encadenamiento.

## Ejemplos Prácticos

### Jugador con Armas y Salud
```javascript
var p = new Player(0);

// Dar arma y establecer salud
p.giveWeapon(24, 100)  // Desert Eagle
  .setHealth(200)
  .setArmour(100);

wait(0);
```

### Crear Vehículo cerca del Jugador
```javascript
var p = new Player(0);
var coords = p.getCoordinates();

// Crear Infernus (ID 411) cerca del jugador
var car = Car.Create(411, coords.x + 5, coords.y, coords.z);
car.setHealth(1000);

log("Vehículo creado");
wait(0);
```

### Texto Dinámico
```javascript
// Usando FxtStore para texto dinámico
FxtStore.insert("MY_MSG", "Mensaje personalizado");

Text.PrintHelp("MY_MSG");

wait(5000); // Esperar 5 segundos
FxtStore.delete("MY_MSG");
```

## Referencia Completa

Para la referencia completa de clases y métodos disponibles, consulta:
- **Sanny Builder Library**: https://library.sannybuilder.com/
- **API Reference**: https://re.cleo.li/docs/en/api.html

## Tips de Uso

1. **Usa Fluent Interface** para código más limpio
2. **Verifica IDs** de modelos/vehículos en documentación del juego
3. **Maneja errores** verificando si entidades existen antes de usarlas
4. **Limpia recursos** usando métodos delete() cuando ya no se necesiten
5. **Usa FxtStore** para texto dinámico en lugar de archivos FXT estáticos
