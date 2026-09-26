// GSIS - Documents
// Copyright (C) 2026  YeikoD
// Licencia: GNU GPL v3 o posterior (texto completo en LICENSE).

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
