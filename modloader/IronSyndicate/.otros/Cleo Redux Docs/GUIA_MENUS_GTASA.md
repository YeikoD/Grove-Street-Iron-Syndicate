# Guía Completa de Menús en GTA San Andreas
## Desde Sanny Builder hasta CLEO Redux

---

## 1. Análisis del Sistema de Menús en el Archivo de Referencia

### 1.1 Estructura del Script Analizado

El archivo `cheatsmenu_funcional_prueba.txt` es un script de menú de cheats en formato Sanny Builder (.cs) que implementa un sistema jerárquico de menús con las siguientes características:

**Componentes Principales:**
- **Activación**: Ctrl+Z para abrir el menú
- **Sistema de menús jerárquico**: Menú principal → Submenús → Acciones
- **Navegación**: Botones del gamepad (Triángulo para volver, Cross para seleccionar)
- **Sistema de cheats**: Armas, estadísticas, munición infinita

### 1.2 Opcodes de Menú Utilizados

| Opcode | Función | Parámetros |
|--------|---------|------------|
| **08D4** | `create_menu` | Título, posición X/Y, ancho, columnas, interactivo, fondo, alineación |
| **08DB** | `set_menu_column` | Handle, columna, título, items (hasta 12) |
| **08DA** | `delete_menu` | Handle del menú |
| **08D7** | `get_menu_item_selected` | Handle del menú |
| **08D6** | `set_menu_column_orientation` | Handle, columna, orientación |
| **090E** | `set_panel_active_row` | Handle, número de fila [0-11] |
| **08D9** | `set_panel_row_enable` | Handle, fila, estado (0=disabled, 1=enabled) |
| **08D8** | `get_panel_selected_row` | Handle del menú (después de soltar tecla) |

### 1.2.1 Detalles del Opcode 08D4 (CREATE_MENU)

**Sintaxis completa:**
```
08D4: create_menu 'TITLE' position X Y width WIDTH columns COLS interactive INTERACTIVE background BACKGROUND alignment ALIGNMENT store_to HANDLE
```

**Parámetros detallados:**
1. **TITLE** (String) - Título del menú (referencia GXT)
2. **X** (Float) - Posición horizontal (29.0 = izquierda, 360.0 = derecha)
3. **Y** (Float) - Posición vertical
4. **WIDTH** (Float) - Ancho del panel
5. **COLS** (Int) - Número de columnas (1-3)
6. **INTERACTIVE** (Bool) - 1 = interactivo (se puede seleccionar), 0 = solo lectura
7. **BACKGROUND** (Bool) - 1 = fondo oscuro, 0 = transparente
8. **ALIGNMENT** (Int) - 0 = centro, 1 = izquierda, 2 = derecha
9. **HANDLE** (Int) - Variable donde se guarda el handle del menú

**Ejemplo de uso:**
```
08D4: create_menu 'INVENT' position 29.0 170.0 width 180.0 columns 1 interactive 1 background 1 alignment 0 store_to $my_menu
```

### 1.2.2 Ejemplo Completo de Menú Interactivo

```
// Crear menú
0512: show_permanent_text_box 'INSTRUCT'  // Instrucciones
01B4: set_player $PLAYER_CHAR frozen_state 0  // Congelar jugador
08D4: $menu = create_panel_with_title 'INVENT' position 29.0 170.0 width 180.0 columns 1 interactive 1 background 1 alignment 0
08DB: set_panel $menu column 0 header 'ITEMS' data 'ITEM1' 'ITEM2' 'ITEM3' 'EXIT' 'DUMMY' 'DUMMY' 'DUMMY' 'DUMMY' 'DUMMY' 'DUMMY' 'DUMMY' 'DUMMY'
090E: set_panel $menu active_row 0

:wait_input
wait 0
if 00E1: player $PLAYER_CHAR pressed_key 15  // Cancel (S)
jf @check_select
    // Cancelar - cerrar menú
    08DA: remove_panel $menu
    03E6: remove_text_box
    01B4: set_player $PLAYER_CHAR frozen_state 1
    jump @end

:check_select
if 00E1: player $PLAYER_CHAR pressed_key 16  // Select (Espacio)
jf @wait_input
    // Obtener selección
    08D7: get_menu_item_selected $menu store_to $selected
    08DA: remove_panel $menu
    03E6: remove_text_box
    01B4: set_player $PLAYER_CHAR frozen_state 1
    
    // Procesar selección con jump table
    0871: init_jump_table $selected total_jumps 4 default_jump 0 @exit jumps 0 @item1 1 @item2 2 @item3 3 @exit
    0 -1 0 -1 0 -1 0 -1 0 -1

:item1
    // Código para item 1
    jump @end

:item2
    // Código para item 2
    jump @end

:item3
    // Código para item 3
    jump @end

:exit
:end
```

### 1.3 Flujo de Ejecución Típico

```
1. Detectar tecla de activación (Ctrl+Z)
2. Desactivar control del jugador
3. Crear menú principal con create_menu
4. Configurar columnas con set_menu_column
5. Loop de espera de input:
   - Triángulo: Volver al menú anterior
   - Cross: Obtener item seleccionado y ejecutar acción
6. Ejecutar acción o navegar a submenú
7. Reactivar control del jugador
```

### 1.4 Sistema de Textos (GXT)

El script usa entradas GXT como 'CHT11', 'CHT1', 'CHT2', etc. que se definen en archivos de texto del juego para mostrar nombres legibles en lugar de IDs.

---

## 2. Comparación: Sanny Builder vs CLEO Redux

### 2.1 Sanny Builder (Opcodes Tradicionales)

**Ventajas:**
- ✅ Soporte nativo del juego
- ✅ Compatible con GTA SA original
- ✅ Documentación extensa
- ✅ Herramientas maduras (Sanny Builder IDE)

**Desventajas:**
- ❌ Sintaxis compleja y verbosa
- ❌ Requiere compilación
- ❌ Manejo manual de memoria
- ❌ Depuración difícil

### 2.2 CLEO Redux (JavaScript)

**Ventajas:**
- ✅ Sintaxis JavaScript moderna
- ✅ Sin compilación
- ✅ Mejor manejo de errores
- ✅ API más limpia
- ✅ Modularidad

**Desventajas:**
- ❌ No soporta directamente opcodes de menú
- ❌ Requiere implementación propia de UI
- ❌ Menos documentación específica de menús

---

## 3. Opciones para Crear Menús en CLEO Redux

### 3.1 Opción A: Usar Librería Existente (Recomendado)

**Proyecto: [interactive-menu](https://github.com/emil6strutui/interactive-menu)**

Esta librería proporciona un sistema de menú completo para CLEO Redux:

**Instalación:**
```bash
# Clonar el repositorio
git clone https://github.com/emil6strutui/interactive-menu.git

# Copiar la carpeta menu a tu proyecto CLEO
cp -r interactive-menu/interactive-menu [tu-proyecto-cleo]/menu
```

**Uso Básico:**
```javascript
import { Menu, MenuItem } from "./menu/index.js";

// Crear menú principal
const mainMenu = new Menu("GSIS Main Menu", 200.0, 120.0, 220.0);

// Agregar items
mainMenu.addItem(new MenuItem("Inventory", () => {
    showTextBox("Opening inventory...");
}));

mainMenu.addItem(new MenuItem("Vehicles", () => {
    showTextBox("Opening vehicles...");
}));

// Mostrar menú
mainMenu.show();
```

### 3.2 Opción B: Implementación Propia con showTextBox

Para menús simples se puede usar `showTextBox` del API de CLEO Redux:

```javascript
// Sistema de menú simple basado en texto
let menuState = {
    active: false,
    currentMenu: "main",
    selectedIndex: 0
};

const menus = {
    main: [
        { name: "Inventory", action: () => menuState.currentMenu = "inventory" },
        { name: "Vehicles", action: () => menuState.currentMenu = "vehicles" },
        { name: "Exit", action: () => menuState.active = false }
    ],
    inventory: [
        { name: "View Items", action: () => showTextBox("Items: ...") },
        { name: "Back", action: () => menuState.currentMenu = "main" }
    ]
};

function showMenu() {
    const currentItems = menus[menuState.currentMenu];
    let text = `=== ${menuState.currentMenu.toUpperCase()} ===\n`;
    
    currentItems.forEach((item, index) => {
        const prefix = index === menuState.selectedIndex ? "> " : "  ";
        text += `${prefix}${item.name}\n`;
    });
    
    showTextBox(text);
}

// Loop principal
while (true) {
    wait(0);
    
    // Activar menú con F4
    if (Pad.IsKeyPressed(115)) { // VK_F4
        menuState.active = !menuState.active;
        if (menuState.active) {
            showMenu();
        }
    }
    
    if (menuState.active) {
        // Navegación con flechas
        if (Pad.IsKeyPressed(38)) { // VK_UP
            menuState.selectedIndex = Math.max(0, menuState.selectedIndex - 1);
            showMenu();
        }
        
        if (Pad.IsKeyPressed(40)) { // VK_DOWN
            const currentItems = menus[menuState.currentMenu];
            menuState.selectedIndex = Math.min(currentItems.length - 1, menuState.selectedIndex + 1);
            showMenu();
        }
        
        // Seleccionar con Enter
        if (Pad.IsKeyPressed(13)) { // VK_RETURN
            const currentItems = menus[menuState.currentMenu];
            currentItems[menuState.selectedIndex].action();
            menuState.selectedIndex = 0;
            if (menuState.active) {
                showMenu();
            }
        }
    }
}
```

### 3.3 Opción C: Implementación con Opcodes Nativos

Es posible usar los opcodes de menú originales mediante la función `native()`:

```javascript
// Crear menú usando opcodes nativos
function createMenu(title, x, y, width, columns, interactive, background, alignment) {
    return native("CREATE_MENU", title, x, y, width, columns, interactive, background, alignment);
}

function setMenuColumn(menuHandle, column, title, ...items) {
    // 08DB: set_menu_column handle col title items...
    return native("SET_MENU_COLUMN", menuHandle, column, title, ...items);
}

function deleteMenu(menuHandle) {
    return native("DELETE_MENU", menuHandle);
}

function getMenuItemSelected(menuHandle) {
    return native("GET_MENU_ITEM_SELECTED", menuHandle);
}

// Ejemplo de uso
let menuHandle = null;

function openCheatsMenu() {
    // Crear menú principal
    menuHandle = createMenu('CHT11', 200.0, 120.0, 220.0, 1, true, true, 0);
    
    // Configurar columna con items
    setMenuColumn(menuHandle, 0, 'DUMMY', 'CHT1', 'CHT2', 'CHT3', 'CHT4', 'CHT5', 
                  'CHT6', 'CHT7', 'CHT8', 'CHT9', 'CHT48', 'CHT10', 'DUMMY');
    
    // Loop de procesamiento del menú
    while (true) {
        wait(0);
        
        // Triángulo para cerrar
        if (Pad.IsButtonPressed(0, 12)) { // Button.Triangle
            deleteMenu(menuHandle);
            return;
        }
        
        // Cross para seleccionar
        if (Pad.IsButtonPressed(0, 14)) { // Button.Cross
            const selectedItem = getMenuItemSelected(menuHandle);
            deleteMenu(menuHandle);
            processSelection(selectedItem);
            return;
        }
    }
}

function processSelection(itemIndex) {
    switch(itemIndex) {
        case 0:
            showTextBox("Weapon cheats selected");
            break;
        case 1:
            showTextBox("Stats cheats selected");
            break;
        // ... más casos
        default:
            showTextBox("Invalid selection");
    }
}
```

---

## 4. Implementación Completa para GSIS

### 4.1 Sistema de Menú Modular para GSIS

Basado en el análisis del archivo de cheats, aquí está una implementación adaptada para GSIS:

```javascript
// gsis_MenuSystem.js
// Sistema de menú para Grove Street Iron Syndicate

const VK_F4 = 115; // Tecla F4 para abrir menú
const VK_UP = 38;
const VK_DOWN = 40;
const VK_RETURN = 13;
const VK_ESCAPE = 27;

class GSISMenu {
    constructor(title, x, y, width) {
        this.title = title;
        this.x = x;
        this.y = y;
        this.width = width;
        this.items = [];
        this.selectedIndex = 0;
        this.visible = false;
        this.parentMenu = null;
    }
    
    addItem(text, callback, submenu = null) {
        this.items.push({
            text: text,
            callback: callback,
            submenu: submenu
        });
    }
    
    show() {
        this.visible = true;
        this.selectedIndex = 0;
        this.render();
    }
    
    hide() {
        this.visible = false;
    }
    
    render() {
        if (!this.visible) return;
        
        let text = `=== ${this.title} ===\n`;
        
        this.items.forEach((item, index) => {
            const prefix = index === this.selectedIndex ? "> " : "  ";
            const suffix = item.submenu ? " →" : "";
            text += `${prefix}${item.text}${suffix}\n`;
        });
        
        showTextBox(text);
    }
    
    handleInput() {
        if (!this.visible) return false;
        
        // Navegación
        if (Pad.IsKeyPressed(VK_UP)) {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.render();
            return true;
        }
        
        if (Pad.IsKeyPressed(VK_DOWN)) {
            this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
            this.render();
            return true;
        }
        
        // Selección
        if (Pad.IsKeyPressed(VK_RETURN)) {
            const selectedItem = this.items[this.selectedIndex];
            
            if (selectedItem.submenu) {
                this.hide();
                selectedItem.submenu.parentMenu = this;
                selectedItem.submenu.show();
            } else if (selectedItem.callback) {
                selectedItem.callback();
            }
            
            return true;
        }
        
        // Volver
        if (Pad.IsKeyPressed(VK_ESCAPE)) {
            if (this.parentMenu) {
                this.hide();
                this.parentMenu.show();
            } else {
                this.hide();
            }
            return true;
        }
        
        return false;
    }
}

// Menús específicos de GSIS
const gsisMenus = {
    main: new GSISMenu("GSIS Main Menu", 200.0, 120.0, 220.0),
    inventory: new GSISMenu("Inventory", 200.0, 120.0, 220.0),
    vehicles: new GSISMenu("Vehicles", 200.0, 120.0, 220.0),
    properties: new GSISMenu("Properties", 200.0, 120.0, 220.0),
    banking: new GSISMenu("Banking", 200.0, 120.0, 220.0)
};

// Configurar menú principal
gsisMenus.main.addItem("Inventory", null, gsisMenus.inventory);
gsisMenus.main.addItem("Vehicles", null, gsisMenus.vehicles);
gsisMenus.main.addItem("Properties", null, gsisMenus.properties);
gsisMenus.main.addItem("Banking", null, gsisMenus.banking);
gsisMenus.main.addItem("Save Game", () => {
    showTextBox("Game saved!");
});
gsisMenus.main.addItem("Exit", () => {
    gsisMenus.main.hide();
});

// Configurar menú de inventario
gsisMenus.inventory.addItem("View Items", () => {
    showTextBox("Inventory items...");
});
gsisMenus.inventory.addItem("Craft Weapons", () => {
    showTextBox("Crafting menu...");
});
gsisMenus.inventory.addItem("Back", null, gsisMenus.main);

// Exportar sistema de menú
export { gsisMenus, GSISMenu };
```

### 4.2 Integración con GSIS

```javascript
// gsis_index.js (actualizado)
import { initSaveManager } from "./IronSyndicate/gsis_SaveManager.js";
import { initVehicleModule, updateVehicleModule } from "./IronSyndicate/gsis_VehicleModule.js";
import { gsisMenus } from "./IronSyndicate/gsis_MenuSystem.js";

// Inicializar sistema de guardado primero
initSaveManager();

// Inicializadores de modulos
initVehicleModule();

// Loop principal: wait(0) cede control al juego, sin el juego crashea
while (true) {
    wait(0);
    
    // Actualizar módulos del juego
    updateVehicleModule();
    
    // Manejar input del menú GSIS
    if (Pad.IsKeyPressed(VK_F4)) {
        if (!gsisMenus.main.visible) {
            gsisMenus.main.show();
        } else {
            gsisMenus.main.hide();
        }
        wait(200); // Debounce
    }
    
    // Procesar input del menú si está visible
    if (gsisMenus.main.visible || gsisMenus.inventory.visible || 
        gsisMenus.vehicles.visible || gsisMenus.properties.visible || 
        gsisMenus.banking.visible) {
        
        gsisMenus.main.handleInput();
        gsisMenus.inventory.handleInput();
        gsisMenus.vehicles.handleInput();
        gsisMenus.properties.handleInput();
        gsisMenus.banking.handleInput();
    }
}
```

---

## 5. Comparación de Métodos

| Método | Complejidad | Flexibilidad | Rendimiento | Recomendado |
|--------|-------------|--------------|-------------|-------------|
| **Librería interactive-menu** | Baja | Alta | Alto | ✅ Sí |
| **showTextBox personalizado** | Media | Media | Medio | ⚠️ Para menús simples |
| **Opcodes nativos** | Alta | Baja | Alto | ❌ No recomendado |
| **Implementación propia** | Alta | Alta | Medio | ⚠️ Solo si necesitas control total |

---

## 6. Recursos Adicionales

### 6.1 Documentación Oficial
- **CLEO Redux Docs**: https://re.cleo.li/docs/en/
- **Sanny Builder Library**: https://library.sannybuilder.com/#/sa
- **Opcode Database**: https://www.gtag.sannybuilder.com/opcode-database/

### 6.2 Proyectos de Referencia
- **interactive-menu**: https://github.com/emil6strutui/interactive-menu
- **CLEO Redux Missions Framework**: https://github.com/wmysterio/CLEO-Redux-Missions-Framework

### 6.3 Comunidades
- **GTAG Modding**: https://www.gtagmodding.com/
- **CLEO Redux Discord**: (buscar en documentación oficial)

---

## 7. Conclusión

Para el proyecto GSIS, **recomiendo usar la librería interactive-menu** porque:

1. **Ahorra tiempo de desarrollo**: Sistema ya probado
2. **Mantenibilidad**: Código limpio y modular
3. **Compatibilidad**: Diseñado específicamente para CLEO Redux
4. **Flexibilidad**: Permite personalización avanzada

Si prefieres control total o el sistema es muy simple, la **opción B (showTextBox)** es viable para prototipos rápidos.

Los **opcodes nativos** no se recomiendan porque CLEO Redux no tiene soporte oficial para ellos y pueden ser inestables.

---

## 8. Próximos Pasos para GSIS

1. **Elegir método**: Recomiendo interactive-menu
2. **Implementar menú principal**: Con las categorías principales del mod
3. **Conectar con SaveManager**: Para funciones de guardado/carga
4. **Agregar submenús**: Para cada sistema (inventario, vehículos, etc.)
5. **Testing**: Verificar navegación y responsividad
6. **Integración con HUD**: Si necesitas overlays permanentes

Esta guía proporciona una base sólida para implementar el sistema de menús de GSIS de manera efectiva y mantenible.
