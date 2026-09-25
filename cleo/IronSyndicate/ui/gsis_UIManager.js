// ============================================================================
// GSIS UIManager - Gestor centralizado de ciclo de vida ImGui
// ============================================================================
// 1. Detección de Teclas: Usamos isKeyPressed(0x49) ['I'] e isKeyPressed(0x1B) ['ESC']
//    para que el menú SIEMPRE responda para abrir/cerrar aunque los controles de CJ
//    estén bloqueados.
// 2. Visibilidad de Cursor: SetCursorVisible(anyVisible) se llama DENTRO de BeginFrame.
// ============================================================================

import { KEYS } from "../core/gsis_Config.js";
import { register } from "../core/gsis_ModuleRegistry.js";
import { t } from "../core/gsis_L10n.js";
import {
    SIZES, COND, COLORS,
    pushMenuStyle, popMenuStyle,
    pushBtn, popBtn,
    pushTabStyle, popTabStyle,
    beginTabBody, endTabBody
} from "./gsis_UIStyle.js";

var _uiState = {
    activeTab: "inventory",
    menuVisible: false,
    keyDebounce: 0
};

var _prevKeyI = false;
var _prevKeyEsc = false;
var _cursorWasVisible = false;

var _components = {
    inventory: null,
    properties: null,
    vehicles: null
};

var _windows = [];
var _rendered = [];

function setPlayerControl(enable) {
    try {
        native("SET_PLAYER_CONTROL", 0, enable ? 1 : 0);
    } catch (e) { }
}

export function registerComponent(tabName, renderFunction) {
    _components[tabName] = renderFunction;
}

export function registerWindow(desc) {
    _windows.push(desc);
}

export function isMenuVisible() {
    return _uiState.menuVisible;
}

export function openMenu() {
    _uiState.menuVisible = true;
    _uiState.keyDebounce = Date.now();
    setPlayerControl(false);
}

export function closeMenu() {
    _uiState.menuVisible = false;
    _uiState.keyDebounce = Date.now();
    setPlayerControl(true);
}

export function switchTab(tabName) {
    if (_components[tabName]) {
        _uiState.activeTab = tabName;
    }
}

function renderTabs() {
    var tabs = [
        { id: "inventory", label: "INVENTARIO" },
        { id: "properties", label: "PROPIEDADES" },
        { id: "vehicles", label: "VEHÍCULOS" }
    ];

    var tabWidth = (SIZES.mainW - 30.0) / tabs.length;

    for (var i = 0; i < tabs.length; i++) {
        var tab = tabs[i];
        var isActive = _uiState.activeTab === tab.id;

        pushTabStyle(isActive);
        if (ImGui.Button(tab.label + "##tab_" + tab.id, tabWidth - 4.0, SIZES.tabH)) {
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

function renderMain() {
    pushMenuStyle();

    ImGui.SetNextWindowSize(SIZES.mainW, SIZES.mainH, COND.Once);
    ImGui.SetNextWindowPos(180.0, 100.0, COND.Once);

    var open = ImGui.Begin("GROVE STREET IRON SYNDICATE##GSIS_MAIN_UI", true, false, false, false, false);

    renderTabs();

    beginTabBody("gsis_tab_body", SIZES.mainW - 30.0, SIZES.listH);
    var component = _components[_uiState.activeTab];
    if (component) {
        try {
            component();
        } catch (e) {
            log("[UIManager] Error renderizando componente " + _uiState.activeTab + ": " + e.message);
            ImGui.TextDisabled(t("CMP_ERR"));
        }
    } else {
        ImGui.TextDisabled(t("CMP_NO"));
    }
    endTabBody();

    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();

    pushBtn(COLORS.danger);
    var clickedClose = ImGui.Button("CERRAR MENÚ (ESC)##btn_close_main", SIZES.mainW - 30.0, SIZES.btnMd);
    popBtn();

    ImGui.End();
    popMenuStyle();

    if (clickedClose || !open) {
        closeMenu();
    }
}

export function initUIManager() {
    log("[GSIS] UIManager inicializado - Tecla I / ESC para controlar menú");
}

export function renderUIManager() {
    var now = Date.now();

    // Detección directa de teclado por VirtualKey (0x49 = 'I', 0x1B = 'ESC') con flanco (justPressed)
    var currentKeyI = false;
    var currentKeyEsc = false;

    try { currentKeyI = isKeyPressed(0x49); } catch (e) { currentKeyI = Pad.IsKeyJustPressed(0x49); }
    try { currentKeyEsc = isKeyPressed(0x1B); } catch (e) { }

    var justPressedI = currentKeyI && !_prevKeyI;
    var justPressedEsc = currentKeyEsc && !_prevKeyEsc;

    _prevKeyI = currentKeyI;
    _prevKeyEsc = currentKeyEsc;

    if (justPressedI) {
        if (now - _uiState.keyDebounce > 200) {
            if (_uiState.menuVisible) {
                closeMenu();
            } else {
                openMenu();
            }
        }
    } else if (justPressedEsc && _uiState.menuVisible) {
        if (now - _uiState.keyDebounce > 200) {
            closeMenu();
        }
    }

    // Comprobar visibilidad de cualquier ventana overlay o menú principal
    var anyVisible = _uiState.menuVisible;
    for (var i = 0; i < _windows.length; i++) {
        if (_windows[i].visible()) {
            anyVisible = true;
            break;
        }
    }

    // Si nada está visible y el cursor ya se ocultó previamente, salir sin arrancar frame ImGui
    if (!anyVisible && !_cursorWasVisible) {
        return;
    }

    // Marco de renderizado de ImGui
    ImGui.BeginFrame("GSIS_UI");
    _rendered.length = 0;

    try {
        // SetCursorVisible DEBE ejecutarse dentro de BeginFrame para actualizar el estado del cursor
        ImGui.SetCursorVisible(anyVisible);
        _cursorWasVisible = anyVisible;

        if (_uiState.menuVisible) {
            renderMain();
        }

        for (var j = 0; j < _windows.length; j++) {
            var w = _windows[j];
            if (!w.visible()) continue;
            try {
                w.render();
                _rendered.push(w);
            } catch (e) {
                log("[UIManager] Error renderizando ventana " + w.id + ": " + e.message);
            }
        }
    } catch (e) {
        log("[UIManager] Error en renderUIManager: " + e.message);
    } finally {
        ImGui.EndFrame();
    }

    for (var k = 0; k < _rendered.length; k++) {
        var rw = _rendered[k];
        if (rw.after) {
            try {
                rw.after();
            } catch (e2) {
                log("[UIManager] Error post-frame de " + rw.id + ": " + e2.message);
            }
        }
    }
}

register({
    name: "UIManager",
    init: initUIManager,
    update: renderUIManager
});
