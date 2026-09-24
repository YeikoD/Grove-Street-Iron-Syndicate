// ============================================================================
// GSIS Lang Data - Catalogo de textos (es / en)
// ============================================================================
// Fuente de verdad de localizacion. Claves GXT/FXT: maximo 7 caracteres.
// Uso: t("INV_FUL") o t("MON_LOW", { n: 500 }) via core/gsis_L10n.js
// Placeholders: {n} {free} {need} {name} {qty} {id} {slot} {model} {order}
// Sin imports (data/ puro).
// ============================================================================

export var STRINGS = {
    // --- Guardado ---
    SAVEINT: {
        es: "~g~GSIS: Interior detectado - guardado",
        en: "~g~GSIS: Interior detected - saved"
    },
    SAVEAUT: {
        es: "~g~GSIS: Auto-save",
        en: "~g~GSIS: Auto-save"
    },
    SAVE_OK: {
        es: "~g~Partida guardada (Slot {slot})",
        en: "~g~Game saved (Slot {slot})"
    },
    SAVE_ER: {
        es: "~r~Error al guardar",
        en: "~r~Save error"
    },

    // --- Dialogue (subtitulos 00BB → gsis_dialog.fxt) ---
    // Sin codigo ~x~ → Dialogue aplica DIALOGUE.DEFAULT_COLOR (blanco)
    DLG_T01: {
        es: "Bienvenido a Grove Street.",
        en: "Welcome to Grove Street."
    },
    DLG_T02: {
        es: "Habla con el dealer si necesitas equipo.",
        en: "Talk to the dealer if you need gear."
    },

    // --- Characters (nombres de personaje → prefijo dialogo) ---
    CH_SEL: {
        es: "Vendedor local",
        en: "Local seller"
    },
    CH_EMM: {
        es: "Emmet",
        en: "Emmet"
    },

    // --- Inventario ---
    INV_FUL: {
        es: "~r~Inventario lleno",
        en: "~r~Inventory full"
    },
    INV_FR: {
        es: "~r~Inventario lleno (libre {free} kg, necesitas {need} kg)",
        en: "~r~Inventory full ({free} kg free, need {need} kg)"
    },
    DBG_ITM: {
        es: "~g~+1 9mm, +5 chatarra, +1 cargador",
        en: "~g~+1 9mm, +5 scrap, +1 magazine"
    },

    // --- Baul ---
    TRK_FUL: {
        es: "~r~Baul lleno (libre {free} kg, necesitas {need} kg)",
        en: "~r~Trunk full ({free} kg free, need {need} kg)"
    },
    TRK_NOG: {
        es: "~r~No se pudo guardar",
        en: "~r~Could not store"
    },
    TRK_PUT: {
        es: "~g~Guardaste {qty}x {name}",
        en: "~g~Stored {qty}x {name}"
    },
    TRK_NON: {
        es: "~r~No se pudo sacar",
        en: "~r~Could not take"
    },
    TRK_TAK: {
        es: "~g~Sacaste {qty}x {name}",
        en: "~g~Took {qty}x {name}"
    },

    // --- Vehiculos / motor / lock ---
    VHC_NON: {
        es: "~r~No hay vehiculo registrado cercano",
        en: "~r~No registered vehicle nearby"
    },
    VHC_DUP: {
        es: "~r~Vehiculo ya registrado (#{id})",
        en: "~r~Vehicle already registered (#{id})"
    },
    VHC_REG: {
        es: "~g~Vehiculo registrado (#{id})",
        en: "~g~Vehicle registered (#{id})"
    },
    VHC_DST: {
        es: "~r~Vehiculo destruido/perdido - eliminado del registro",
        en: "~r~Vehicle destroyed/lost - removed from registry"
    },
    VHC_LD: {
        es: "~y~Cargando modelo {model}...",
        en: "~y~Loading model {model}..."
    },
    ENG_ON: {
        es: "~g~Motor encendido",
        en: "~g~Engine on"
    },
    ENG_OFF: {
        es: "~r~Motor apagado",
        en: "~r~Engine off"
    },
    LCK_CLS: {
        es: "~r~Puertas cerradas",
        en: "~r~Doors locked"
    },
    LCK_OPN: {
        es: "~g~Puertas abiertas",
        en: "~g~Doors unlocked"
    },
    PKPNEAR: {
        es: "~y~Estas cerca del pickup",
        en: "~y~You are near the pickup"
    },
    PKP_FAR: {
        es: "~b~Te alejaste del pickup",
        en: "~b~You left the pickup"
    },

    // --- Propiedades / dinero ---
    PROP_UN: {
        es: "~r~Propiedad desconocida",
        en: "~r~Unknown property"
    },
    PROP_OW: {
        es: "~r~Ya es tuya: {name}",
        en: "~r~Already yours: {name}"
    },
    PROP_BY: {
        es: "~g~Compraste: {name} (-${n})",
        en: "~g~Bought: {name} (-${n})"
    },
    MON_LOW: {
        es: "~r~Dinero insuficiente (falta ${n})",
        en: "~r~Not enough money (missing ${n})"
    },

    // --- Dealer (carrito / pedido) ---
    CRT_EMP: {
        es: "~r~Carrito vacio",
        en: "~r~Cart empty"
    },
    ORD_OK: {
        es: "~g~Pedido confirmado (-${n})",
        en: "~g~Order confirmed (-${n})"
    },

    // --- Retiro (pickup) ---
    PKC_IVL: {
        es: "~r~Cantidad invalida en el pedido",
        en: "~r~Invalid quantity in order"
    },
    PKC_ERR: {
        es: "~r~Error al agregar al inventario: {name}",
        en: "~r~Could not add to inventory: {name}"
    },
    PKC_TAK: {
        es: "~g~Recogiste {qty}x {name}",
        en: "~g~Picked up {qty}x {name}"
    },
    PKC_NOC: {
        es: "~r~No cabe todo: libre {free} kg, pedido {order} kg. Recoge de a poco.",
        en: "~r~Does not fit: {free} kg free, order {order} kg. Pick up in stages."
    },
    PKC_ALL: {
        es: "~g~Pedido recogido completo",
        en: "~g~Order collected in full"
    },

    // --- Trueque NPC → dialogo (gsis_dialog.fxt); status con ~r~/~g~/~y~ ---
    SEL_NOQ: {
        es: "~r~No tienes esa cantidad",
        en: "~r~You do not have that quantity"
    },
    SEL_ERR: {
        es: "~r~Error al quitar items",
        en: "~r~Error removing items"
    },
    SEL_IVL: {
        es: "~r~Oferta invalida",
        en: "~r~Invalid offer"
    },
    SEL_NOB: {
        es: "~r~Eso no se compra hoy",
        en: "~r~Not buying that today"
    },
    SEL_R1: {
        es: "~r~¡Ni loco! Eso vale mucho menos.",
        en: "~r~No way! That is worth much less."
    },
    SEL_R2: {
        es: "~r~Hoy no me alcanza la plata.",
        en: "~r~I cannot afford that today."
    },
    SEL_R3: {
        es: "~y~Uff, te estiraste mucho, dejalo para la proxima.",
        en: "~y~Oof, you stretched too far, leave it for next time."
    },
    SEL_A2: {
        es: "~g~Mmm, esta un poco caro pero te lo llevo igual... (+${n})",
        en: "~g~Mmm, a bit pricey but I will take it anyway... (+${n})"
    },
    SEL_A1: {
        es: "~g~¡De una, me sirve el precio! (+${n})",
        en: "~g~Deal, that price works for me! (+${n})"
    },

    // --- UI comun (ImGui, sin codigos ~) ---
    BTN_CLS: { es: "Cerrar", en: "Close" },
    BTN_BUY: { es: "Comprar", en: "Buy" },
    BTN_RST: { es: "RESETEAR", en: "RESET" },
    BTN_ADD: { es: "Agregar", en: "Add" },
    BTN_PUT: { es: "Guardar", en: "Store" },
    BTN_TK: { es: "Sacar", en: "Take" },
    BTN_PCK: { es: "Recoger", en: "Pick up" },
    BTN_OPN: { es: "Abrir", en: "Open" },
    BTN_ALL: { es: "RECOGER TODO", en: "PICK UP ALL" },
    BTN_OFF: { es: "Ofrecer", en: "Offer" },
    BTN_CTB: { es: "Cerrar Baul", en: "Close Trunk" },
    MONEY: { es: "Dinero: ${n}", en: "Money: ${n}" },
    MONEY2: { es: "Dinero: $?", en: "Money: $?" },
    FRE_L: { es: "Libre: {n} kg", en: "Free: {n} kg" },
    INV_L: { es: "Inventario: {w}/{max} kg", en: "Inventory: {w}/{max} kg" },
    CAT_WPN: { es: "Armas", en: "Weapons" },
    CAT_MAT: { es: "Materiales", en: "Materials" },
    CAT_MAG: { es: "Cargadores", en: "Magazines" },

    // --- UI Inventario ---
    GSIS_MENU: { es: "Grove Street Iron Syndicate", en: "Grove Street Iron Syndicate" },
    INV_TTL: { es: "Inventario", en: "Inventory" },
    INV_HDR: { es: "INVENTARIO", en: "INVENTORY" },
    INV_WGT: { es: "Peso: {n} kg", en: "Weight: {n} kg" },
    INV_EMP: { es: "(inventario vacio)", en: "(inventory empty)" },
    MAG_AMM: { es: "{a}/{b} balas", en: "{a}/{b} rounds" },
    WPN_DMG: { es: "Daño: {n}", en: "Damage: {n}" },
    DOC_HDR: { es: "DOCUMENTOS", en: "DOCUMENTS" },
    DOC_CNT: { es: "Documentos: {n}", en: "Documents: {n}" },
    DOC_NON: { es: "No tienes documentos", en: "No documents" },
    DOC_NRV: { es: "No tienes vehiculos registrados", en: "No registered vehicles" },
    ARM_HDR: { es: "ARMAMENTO", en: "WEAPONS" },
    MAT_HDR: { es: "MATERIALES", en: "MATERIALS" },
    PRP_HDR: { es: "PROPIEDADES", en: "Properties" },
    VEH_HDR: { es: "VEHICULOS", en: "Vehicles" },
    NO_MAG: { es: "No tienes cargadores", en: "No magazines" },
    MAG_OUT: { es: "~g~Cargador extraido", en: "~g~Magazine removed" },
    V_MODL: { es: "Modelo: {name}", en: "Model: {name}" },
    V_ID: { es: "ID: {n}", en: "ID: {n}" },
    V_COL: { es: "Color: {a} / {b}", en: "Color: {a} / {b}" },
    V_HLTH: { es: "Salud: {n}%", en: "Health: {n}%" },
    V_ENG1: { es: "Motor: ON", en: "Engine: ON" },
    V_ENG0: { es: "Motor: OFF", en: "Engine: OFF" },
    V_LCK1: { es: "Puertas: Cerradas", en: "Doors: Locked" },
    V_LCK0: { es: "Puertas: Abiertas", en: "Doors: Unlocked" },
    V_POS: { es: "Pos: {x}, {y}", en: "Pos: {x}, {y}" },
    PRP_CST: { es: "Costo: ${n} | Nomina: ${w}/dia", en: "Cost: ${n} | Wage: ${w}/day" },
    PRP_OWN: { es: "PROPIA", en: "OWNED" },
    TY_TALL: { es: "taller", en: "workshop" },
    TY_ALM: { es: "almacen", en: "warehouse" },

    // --- UI Dealer ---
    DLR_TTL: { es: "Armeria Mayorista", en: "Wholesale Arms" },
    DLR_TOT: { es: "Total carrito: ${n}", en: "Cart total: ${n}" },
    CRT_UI: { es: "Carrito vacio", en: "Cart empty" },

    // --- UI Baul ---
    TRK_TTL: { es: "Baul - {name} ({model})", en: "Trunk - {name} ({model})" },
    TRK_L: { es: "Baul: {w}/{max} kg", en: "Trunk: {w}/{max} kg" },
    TRK_H: { es: "BAUL", en: "TRUNK" },
    TRK_EMI: { es: "(inventario vacio)", en: "(inventory empty)" },
    TRK_EMB: { es: "(baul vacio)", en: "(trunk empty)" },
    TRK_HNT: { es: "B: menu | 3: cerrar baul | Alejarse cierra el menu", en: "B: menu | 3: close trunk | Moving away closes menu" },

    // --- UI Retiro ---
    PKC_TTL: { es: "Retiro de pedido", en: "Order pickup" },
    PKC_ORD: { es: "Pedido: ${n}  |  Peso: {w} kg", en: "Order: ${n}  |  Weight: {w} kg" },

    // --- UI Trueque ---
    SEL_TTL: { es: "Trueque — Cliente local", en: "Trade — Local client" },
    SEL_BUS: { es: "Busca hoy: {list}", en: "Looking for today: {list}" },
    SEL_BUD: { es: "Presupuesto: ${n}", en: "Budget: ${n}" },
    SEL_NON: { es: "(no tienes armas para vender)", en: "(no weapons to sell)" }
};
