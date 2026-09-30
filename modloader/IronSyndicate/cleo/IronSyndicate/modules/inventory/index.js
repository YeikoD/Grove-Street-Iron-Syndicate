// GSIS - Inventory: index
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// La puerta del modulo de inventario: lo registra, lo inicializa, y reexporta la
// superficie que los demas modulos necesitan.
//
// Antes esto era inventory/index.js, un archivo de 783 lineas que mezclaba
// los contenedores, las reglas de mover cosas, los handlers del bus y el
// registro del modulo. La division es por lo que cambia junto:
//
//   state.js   los contenedores y las fabricas de filas. Cambia si cambia el
//              FORMATO del save.
//   logic.js   mover items. Cambia si cambia una REGLA del inventario.
//   events.js  el contrato con el resto del mod. Cambia si cambia lo que otro
//              modulo puede pedir.
//   index.js   esto. Cambia si cambia el nombre o el ciclo de vida.
//
// ============================================================================
// POR QUE ESTE ARCHIVO REEXPORTA
// ============================================================================
// Los otros modulos hacen `import { addItem } from "./inventory/index.js"` y no
// saben de state/logic/events. Es la unica parte de la division que no es una
// decision de diseño: es la que evita tocar cinco archivos de la UI y cuatro
// modulos cada vez que un helper se mueve de archivo.
//
// Y no es un "compat": cada nombre de aca esta USADO por alguien. Los nombres que
// no tienen consumidores NO se reexportan, que es la regla de la casa
// ("Import/export sin uso -> borrar en el mismo cambio que lo deja huerfano").
// Si se agrega algo aca y nadie lo importa, se saca de la lista y del archivo que
// lo define en el mismo commit.
// ============================================================================

import { register } from "../../core/gsis_ModuleRegistry.js";
import { KEYS } from "../../core/gsis_Config.js";
import { keyJustPressed } from "../../core/gsis_Input.js";
import { t } from "../../core/gsis_L10n.js";

// Los handlers del bus se registran al IMPORTAR este archivo, no en init().
// Razon en el init de abajo: initSaveManager() corre loadGame() antes que
// initAll(), y si un modulo de armas preguntara la capacidad durante la carga de
// un save, el handler tiene que existir YA.
import "./events.js";

import { initState } from "./state.js";
import { addItem, entregaOpts } from "./logic.js";

// El nombre del modulo en el registro. No cambia: `getModules()` lo loguea y
// varios logs del juego lo nombran.
var NOMBRE_MODULO = "Items";

register({
    name: NOMBRE_MODULO,
    init: initState,
    update: updateItemManager
});

// Debug: tecla L agrega la Colt .45, chatarra y su cargador (probar inventario/baul)
//
// entregaOpts en los tres, para que el camino de prueba diga lo mismo que el de
// la entrega real: el arma llega sin cargador y el cargador llega lleno. Si el
// debug cuelgue del default de addItem, probar el inventario da un arma con
// municion que en el juego nunca se ve.
function updateItemManager() {
    if (keyJustPressed(KEYS.DEBUG_ITEM)) {  // Detecta tecla L
        // La familia completa: el arma desnuda, el cargador base y el extendido,
        // para poder probar el sistema de variantes sin pasar por el dealer.
        var okArma = addItem("colt45", 1, entregaOpts("colt45"));      // Arma de prueba, DESNUDA
        var okScrap = addItem("scrap_metal", 5);  // Agrega material de prueba
        var okMag = addItem("mag_colt45", 1, entregaOpts("mag_colt45"));  // Cargador nuevo, lleno
        var okExt = addItem("mag_colt45_extended", 1, entregaOpts("mag_colt45_extended"));
        if (okArma || okScrap || okMag || okExt) {
            showTextBox(t("DBG_ITM"));  // Muestra mensaje de exito
        } else {
            showTextBox(t("INV_FUL"));  // Muestra error inventario lleno
        }
    }
}

// ---------------------------------------------------------------------------
// LA SUPERFICIE PUBLICA
// ---------------------------------------------------------------------------
// Cada linea tiene un consumidor. La lista se puede verificar con grep, y esa
// verificacion es la que hace util el reexport: si un dia una de estas lineas no
// la importa nadie, la linea se borra en el mismo cambio.

// Lo usan gsis_DealerPickup.js, ui/views/inventory.js y ui/views/flow.js
export { addItem, entregaOpts } from "./logic.js";
export { removeItem, addToTrunk, removeFromTrunk, equipMagToBelt, unequipBeltMag } from "./logic.js";

// Lo usan ui/views/inventory.js, ui/views/flow.js y gsis_WeaponSeller.js
export { getItems, getTotalWeight, getBelt } from "./state.js";
export {
    getTrunkItems, getTrunkWeight, getTrunkMaxCapacity
} from "./state.js";

// isInstanced se reexporta porque gsis_Trunk.js y gsis_WeaponSeller.js lo
// importan de aca. Es una pregunta del CATALOGO y vive en data/gsis_item_data.js;
// importarla de ahi en los dos seria mas correcto, y no se hace en este cambio
// porque tocaria dos modulos que no cambian por otra razon. La deuda se anota
// para que el proximo que toque Trunk la pague.
export { isInstanced } from "../../data/gsis_item_data.js";
