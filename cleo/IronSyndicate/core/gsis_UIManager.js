// ============================================================================
// GSIS UIManager - Gestor centralizado de UI para ImGui Redux
// ============================================================================
// Coordina todos los menús desde un solo BeginFrame/EndFrame global.
// Implementa sistema de pestañas para navegación fluida.
// ============================================================================

import { KEYS } from "./gsis_Config.js";
import { register } from "./gsis_ModuleRegistry.js";
import { t } from "./gsis_L10n.js";

// Estado global de la UI
var _uiState = {
    activeTab: "inventory",  // "inventory", "properties", "vehicles"
    menuVisible: false
};

// Configuración de dimensiones
var _config = {
    menuWidth: 560.0,
    menuHeight: 640.0,
    tabHeight: 30.0,
    listHeight: 460.0
};

// Funciones de renderizado de componentes (se asignan dinámicamente)
var _components = {
    inventory: null,
    properties: null,
    vehicles: null
};

// Registrar componente de renderizado
export function registerComponent(tabName, renderFunction) {
    try {
        _components[tabName] = renderFunction;
        log("[UIManager] Componente registrado: " + tabName);
    } catch (e) {
        log("[UIManager] Error registrando componente " + tabName + ": " + e.message);
    }
}

// Verificar si el menú principal está visible
export function isMenuVisible() {
    return _uiState.menuVisible;
}

// Abrir menú principal
export function openMenu() {
    _uiState.menuVisible = true;
}

// Cerrar menú principal
export function closeMenu() {
    _uiState.menuVisible = false;
}

// Cambiar pestaña activa
export function switchTab(tabName) {
    if (_components[tabName]) {
        _uiState.activeTab = tabName;
    }
}

// Obtener estado actual
export function getActiveTab() {
    return _uiState.activeTab;
}

export function getConfig() {
    return _config;
}

// ============================================================================
// Estilos globales de UI
// ============================================================================

function pushGlobalStyle() {
    ImGui.PushStyleColor(2, 15, 15, 20, 230);      // WindowBg
    ImGui.PushStyleColor(3, 12, 12, 16, 200);      // ChildBg
    ImGui.PushStyleColor(10, 20, 20, 28, 255);     // Border
    ImGui.PushStyleColor(11, 25, 25, 35, 255);     // BorderShadow
    ImGui.PushStyleColor(21, 30, 55, 80, 255);      // Button
    ImGui.PushStyleColor(22, 40, 75, 110, 255);     // ButtonHovered
    ImGui.PushStyleColor(23, 20, 45, 65, 255);      // ButtonActive
    ImGui.PushStyleColor(0, 200, 200, 200, 255);    // Text
    ImGui.PushStyleColor(1, 100, 100, 110, 255);    // TextDisabled
    ImGui.PushStyleColor(27, 50, 60, 75, 255);      // Header
    ImGui.PushStyleColor(33, 25, 40, 60, 255);      // Selection
    ImGui.PushStyleColor(34, 40, 65, 95, 255);      // NavWindowingHighlight
    ImGui.PushStyleVar(12, 6);                      // WindowPadding
    ImGui.PushStyleVar(3, 4);                       // ItemSpacing
}

function popGlobalStyle() {
    ImGui.PopStyleVar(2);
    ImGui.PopStyleColor(12);
}

function pushTabStyle(isActive) {
    if (isActive) {
        ImGui.PushStyleColor(21, 35, 70, 35, 255);
        ImGui.PushStyleColor(22, 50, 95, 50, 255);
        ImGui.PushStyleColor(23, 28, 55, 28, 255);
    } else {
        ImGui.PushStyleColor(21, 25, 40, 60, 255);
        ImGui.PushStyleColor(22, 35, 55, 80, 255);
        ImGui.PushStyleColor(23, 20, 35, 50, 255);
    }
}

function popTabStyle() {
    ImGui.PopStyleColor(3);
}

function pushCloseStyle() {
    ImGui.PushStyleColor(21, 60, 25, 25, 255);
    ImGui.PushStyleColor(22, 85, 30, 30, 255);
    ImGui.PushStyleColor(23, 45, 18, 18, 255);
}

function popCloseStyle() {
    ImGui.PopStyleColor(3);
}

// ============================================================================
// Renderizado de pestañas
// ============================================================================

function renderTabs() {
    var tabs = [
        { id: "inventory", label: t("INV_TTL") },
        { id: "properties", label: t("PRP_HDR") },
        { id: "vehicles", label: t("VEH_HDR") }
    ];

    var tabWidth = (_config.menuWidth - 20) / tabs.length;

    for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i];
        var isActive = _uiState.activeTab === tab.id;

        pushTabStyle(isActive);
        if (ImGui.Button(tab.label + "##tab_" + tab.id, tabWidth - 4, _config.tabHeight)) {
            switchTab(tab.id);
        }
        popTabStyle();

        if (i < tabs.length - 1) {
            ImGui.SameLine();
        }
    }

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();
}

// ============================================================================
// Renderizado principal
// ============================================================================

export function initUIManager() {
    log("[GSIS] UIManager inicializado - tecla I para abrir menú");
    log("[UIManager] Componentes disponibles: " + Object.keys(_components).join(", "));
}

export function renderUIManager() {
    try {
        // Manejar tecla I para toggle del menú
        if (Pad.IsKeyJustPressed(KEYS.INVENTORY)) {
            if (_uiState.menuVisible) {
                closeMenu();
            } else {
                openMenu();
            }
        }

        ImGui.BeginFrame("GSIS_UI");

        if (!_uiState.menuVisible) {
            ImGui.EndFrame();
            return;
        }

        pushGlobalStyle();
        ImGui.SetNextWindowSize(_config.menuWidth, _config.menuHeight, 2);
        ImGui.SetNextWindowPos(50.0, 60.0, 2);
        var open = ImGui.Begin(t("GSIS_MENU"), true, false, false, false, false);

        // Renderizar pestañas
        renderTabs();

        // Renderizar componente activo
        var activeComponent = _components[_uiState.activeTab];
        if (activeComponent) {
            try {
                activeComponent();
            } catch (e) {
                log("[UIManager] Error renderizando componente " + _uiState.activeTab + ": " + e.message);
                ImGui.TextDisabled("Error loading component");
            }
        } else {
            ImGui.TextDisabled("Component not loaded - Make sure all components are imported in index.js");
        }

        ImGui.Spacing();
        ImGui.Separator();
        ImGui.Spacing();

        pushCloseStyle();
        var clickedClose = ImGui.Button(t("BTN_CLS"), _config.menuWidth - 20, 32);
        popCloseStyle();

        ImGui.End();
        popGlobalStyle();
        ImGui.EndFrame();

        if (clickedClose || !open) {
            closeMenu();
        }
    } catch (e) {
        log("[UIManager] Error en renderUIManager: " + e.message);
        log("[UIManager] Stack: " + e.stack);
    }
}

register({
    name: "UIManager",
    init: initUIManager,
    update: renderUIManager
});
