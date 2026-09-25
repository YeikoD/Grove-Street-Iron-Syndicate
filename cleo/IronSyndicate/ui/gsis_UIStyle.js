// ============================================================================
// GSIS UIStyle - Paleta KCD (Kingdom Come: Deliverance) y Helpers
// ============================================================================

export var COLORS = {
    // Ventanas y Fondos
    window: [18, 22, 28, 245],
    child: [12, 15, 20, 220],
    headerBg: [24, 30, 40, 255],
    border: [50, 62, 80, 255],

    // Tipografía
    text: [230, 235, 240, 255],
    textMuted: [125, 135, 150, 255],
    textGold: [220, 175, 60, 255],
    textGreen: [80, 210, 110, 255],
    textDanger: [220, 80, 80, 255],

    // Componentes e Interacción
    btn: [32, 44, 58, 255],
    btnHover: [48, 64, 84, 255],
    accent: [38, 125, 75, 255],       // Verde esmeralda para acciones principales
    accentGold: [180, 135, 40, 255],   // Dorado KCD para categoria activa
    danger: [110, 35, 35, 255],

    // Selección de Filas (KCD Highlight)
    selected: [42, 82, 122, 255],
    selectedHover: [54, 102, 150, 255],
    rowHover: [25, 35, 48, 255],
    separator: [40, 50, 65, 255],

    // Alias de compatibilidad
    textOk: [80, 210, 110, 255],
    textErr: [220, 80, 80, 255],
    textWarn: [220, 175, 60, 255]
};

export var SIZES = {
    mainW: 820.0,      // Ancho amplio para vista 2 columnas estilo KCD
    mainH: 540.0,      // Alto cómodo
    tabH: 28.0,
    listH: 420.0,
    leftColW: 490.0,   // Columna izquierda (Lista de items)
    rightColW: 280.0,  // Columna derecha (Detalles del item seleccionado)
    btnSm: 24.0,
    btnMd: 28.0,
    btnLg: 32.0
};

export var COL = {
    Text: 0,
    TextDisabled: 1,
    WindowBg: 2,
    ChildBg: 3,
    Border: 5,
    TitleBg: 10,
    TitleBgActive: 11,
    Button: 21,
    ButtonHovered: 22,
    ButtonActive: 23,
    Header: 27,
    HeaderHovered: 28,
    HeaderActive: 29,
    Separator: 27,
    Tab: 33,
    TabHovered: 34
};

export var VAR = {
    WindowRounding: 3,
    FrameRounding: 12
};

export var COND = {
    Always: 1,
    Once: 2
};

function clamp255(v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return v;
}

function shift(c, d) {
    return [clamp255(c[0] + d), clamp255(c[1] + d), clamp255(c[2] + d), c[3]];
}

function pushColor(idx, c) {
    ImGui.PushStyleColor(idx, c[0], c[1], c[2], c[3]);
}

export function pushMenuStyle() {
    pushColor(COL.WindowBg, COLORS.window);
    pushColor(COL.ChildBg, COLORS.child);
    pushColor(COL.Border, COLORS.border);
    pushColor(COL.TitleBg, COLORS.headerBg);
    pushColor(COL.TitleBgActive, COLORS.headerBg);
    pushColor(COL.Button, COLORS.btn);
    pushColor(COL.ButtonHovered, COLORS.btnHover);
    pushColor(COL.ButtonActive, shift(COLORS.btn, -15));
    pushColor(COL.Text, COLORS.text);
    pushColor(COL.TextDisabled, COLORS.textMuted);
    pushColor(COL.Separator, COLORS.separator);
    ImGui.PushStyleVar(VAR.FrameRounding, 5);
    ImGui.PushStyleVar(VAR.WindowRounding, 6);
}

export function popMenuStyle() {
    ImGui.PopStyleVar(2);
    ImGui.PopStyleColor(11);
}

export function pushBtn(role) {
    var c = role || COLORS.btn;
    pushColor(COL.Button, c);
    pushColor(COL.ButtonHovered, shift(c, 20));
    pushColor(COL.ButtonActive, shift(c, -15));
}

export function popBtn() {
    ImGui.PopStyleColor(3);
}

export function pushTabStyle(isActive) {
    var c = isActive ? COLORS.accent : COLORS.btn;
    pushColor(COL.Button, c);
    pushColor(COL.ButtonHovered, shift(c, 15));
    pushColor(COL.ButtonActive, shift(c, -10));
}

export function popTabStyle() {
    ImGui.PopStyleColor(3);
}

export function pushSelectedStyle() {
    pushColor(COL.Header, COLORS.selected);
    pushColor(COL.HeaderHovered, COLORS.selectedHover);
    pushColor(COL.HeaderActive, COLORS.selected);
}

export function popSelectedStyle() {
    ImGui.PopStyleColor(3);
}

export function textColored(text, c) {
    var col = c || COLORS.text;
    ImGui.TextColored(text, col[0] / 255, col[1] / 255, col[2] / 255, col[3] / 255);
}

export function sectionTitle(text) {
    textColored(text, COLORS.textGold);
}

export function beginTabBody(id, w, h) {
    ImGui.BeginChild(id, w || 0, h || SIZES.listH, true);
}

export function endTabBody() {
    ImGui.EndChild();
}

// ============================================================================
// WRAPPERS DE ALTO NIVEL (Simplifican componentes a 1 sola linea)
// ============================================================================

// Dibuja un botón estilizado aplicando automáticamene colores de estilo y hover
export function uiButton(label, w, h, role) {
    pushBtn(role || COLORS.btn);
    var clicked = ImGui.Button(label, w || 0.0, h || SIZES.btnMd);
    popBtn();
    return clicked;
}

// Dibuja un botón de pestaña con estado activo/inactivo (Dorado / Azul)
export function uiTabButton(label, isActive, w, h) {
    pushTabStyle(isActive);
    var clicked = ImGui.Button(label, w || 0.0, h || SIZES.tabH);
    popTabStyle();
    return clicked;
}

// Dibuja una fila seleccionable de lista con resalte KCD
export function uiSelectableRow(label, isSelected, h) {
    if (isSelected) pushSelectedStyle();
    var clicked = ImGui.Selectable(label, isSelected, false, 0.0, h || 22.0);
    if (isSelected) popSelectedStyle();
    return clicked;
}

// Dibuja una fila de estadistica con clave y valor coloreado
export function uiStatRow(label, value, valColor) {
    textColored(label, COLORS.textMuted);
    ImGui.SameLine();
    textColored(String(value), valColor || COLORS.text);
}

// Dibuja una cabecera de seccion con titulo dorado y separador
export function uiSectionHeader(title) {
    sectionTitle(title);
    ImGui.Spacing();
    ImGui.Separator();
    ImGui.Spacing();
}

