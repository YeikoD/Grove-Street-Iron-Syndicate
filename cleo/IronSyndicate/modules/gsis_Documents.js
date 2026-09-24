// ============================================================================
// GSIS Documents - Documentos/propiedades del inventario
// ============================================================================
// Depende de: SaveManager, ModuleRegistry
// Usado por: ui/ (getDocuments)
// ============================================================================

import { getModuleData, registerModule } from "../core/gsis_SaveManager.js";
import { register } from "../core/gsis_ModuleRegistry.js";

export function initDocuments() {
    log("[GSIS] Documents inicializado");
    registerModule("Inventory", { documents: [] });
}

export function getDocuments() {
    var data = getModuleData("Inventory");
    return data.documents || [];
}

register({
    name: "Documents",
    init: initDocuments
});
