// GSIS - Lang Data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

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

    // --- Maletero ---
    TRK_FUL: {
        es: "~r~Maletero lleno (libre {free} kg, necesitas {need} kg)",
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
    // Feedback del carrito: el modulo lo escribe con setNotice() y viaja en el
    // campo notice del proximo snapshot (ver gsis_Notice.js). El tono va en el
    // texto (~g~ ok, ~r~ rojo) y lo decide la hoja de estilo de la pagina.
    DLR_ADD: {
        es: "~g~Agregaste {qty}x {name} al carrito",
        en: "~g~Added {qty}x {name} to cart"
    },
    DLR_REM: {
        es: "~g~Quitaste {qty}x {name} del carrito",
        en: "~g~Removed {qty}x {name} from cart"
    },
    DLR_CLR: {
        es: "~g~Carrito vaciado",
        en: "~g~Cart cleared"
    },
    DLR_IVL: {
        es: "~r~Accion invalida en el carrito",
        en: "~r~Invalid action on cart"
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
    PKC_CNC: {
        es: "~g~Pedido cancelado, devueltos ${n}",
        en: "~g~Order cancelled, ${n} refunded"
    },
    PKC_SIN: {
        es: "~r~No hay pedido que cancelar",
        en: "~r~No order to cancel"
    },
    PKC_NRF: {
        es: "~r~No se pudo devolver ${n}. El pedido sigue pendiente.",
        en: "~r~Could not refund ${n}. The order is still pending."
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
    // El {n} de los rechazos es el TECHO del NPC (techo en offerWeapon). Sin
    // el numero el rechazo no es informacion: el jugador recibe un "no" que no
    // puede responder con ninguna oferta, porque solo le queda adivinar. Con el
    // techo a la vista el trueque tiene un limite al que apuntar.
    SEL_R1: {
        es: "~r~¡Ni loco! Te pago hasta ${n}.",
        en: "~r~No way! I'll pay up to ${n}."
    },
    SEL_R2: {
        es: "~r~Hoy no me alcanza la plata.",
        en: "~r~I cannot afford that today."
    },
    SEL_R3: {
        es: "~y~Uff, te estiraste mucho: hasta ${n} dejo.",
        en: "~y~Oof, you stretched too far: up to ${n} for me."
    },
    SEL_A2: {
        es: "~g~Mmm, esta un poco caro pero te lo llevo igual... (+${n})",
        en: "~g~Mmm, a bit pricey but I will take it anyway... (+${n})"
    },
    SEL_A1: {
        es: "~g~¡De una, me sirve el precio! (+${n})",
        en: "~g~Deal, that price works for me! (+${n})"
    },

    // --- UI comun (sin codigos ~) ---
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
    BTN_CTB: { es: "Cerrar Maletero", en: "Close Trunk" },
    MONEY: { es: "Dinero: ${n}", en: "Money: ${n}" },
    MONEY2: { es: "Dinero: $?", en: "Money: $?" },
    FRE_L: { es: "Libre: {n} kg", en: "Free: {n} kg" },
    INV_L: { es: "Inventario: {w}/{max} kg", en: "Inventory: {w}/{max} kg" },
    CAT_WPN: { es: "Armas", en: "Weapons" },
    CAT_MAT: { es: "Materiales", en: "Materials" },
    CAT_MAG: { es: "Cargadores", en: "Magazines" },

    // Como se cierra un menu con esfera. Va en el subtitulo de los cuatro, y no es
    // opcional: el menu congela al jugador, asi que no hay forma de deducirlo, y el
    // panel aparece en el medio de la pantalla con el pointer capaz de haber quedado
    // encima — con el pointer encima las teclas son de la pagina.
    //
    // Dice la tecla y no solo "cerralo": la ESPACIO abre y cierra, y con el pointer
    // encima de la UI es la pagina la que la translate, asi que las dos salidas
    // (la tecla y el boton de cerrar) tienen que estar a mano.
    //
    // Ya no dice "alejate": los menus se abren apretando ESPACIO parado en la
    // esfera y se cierran con la misma tecla o con ESC, como el inventario. Lo que
    // queda del contrato de proximidad es lo de despues: cerrada la esfera, el
    // punto queda apagado un rato (TIMERS.SPHERE_COOLDOWN), asi que conviene que el
    // jugador sepa que el menu se cerro y la esfera se va a volver sola.
    MENU_HNT: { es: "ESPACIO o ESC para cerrar el menu", en: "SPACE or ESC to close the menu" },

    // --- UI Inventario ---
    GSIS_MENU: { es: "Grove Street Iron Syndicate", en: "Grove Street Iron Syndicate" },
    INV_TTL: { es: "Inventario", en: "Inventory" },
    INV_HDR: { es: "INVENTARIO", en: "INVENTORY" },
    INV_WGT: { es: "Peso: {n} kg", en: "Weight: {n} kg" },
    INV_EMP: { es: "(inventario vacio)", en: "(inventory empty)" },
    CMP_ERR: { es: "(error cargando componente)", en: "(error loading component)" },
    CMP_NO: { es: "(componente no cargado - revisa los imports de index)", en: "(component not loaded - check index imports)" },
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
    NO_MAG: { es: "No tienes cargadores equipados", en: "No equipped magazines" },
    MAG_OUT: { es: "~g~Cargador extraido", en: "~g~Magazine removed" },
    BELTFUL: { es: "~r~Cinturon de cargadores lleno", en: "~r~Magazine belt full" },
    EQP_OK: { es: "~g~Arma equipada", en: "~g~Weapon equipped" },
    EQP_OUT: { es: "~g~Arma guardada en el inventario", en: "~g~Weapon stored in inventory" },
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
    DLR_TTL: { es: "Armero ilegal", en: "Illegal Gunsmith" },
    DLR_TOT: { es: "Total carrito: ${n}", en: "Cart total: ${n}" },
    DLR_CAT: { es: "Catalogo", en: "Catalog" },
    DLR_CRT: { es: "Carrito", en: "Cart" },
    CRT_NON: { es: "(carrito vacio)", en: "(cart empty)" },
    DLR_DIN: { es: "Tu dinero: ${n}", en: "Your money: ${n}" },
    DLR_NON: { es: "Este vendedor no tiene nada en el catalogo", en: "This seller has nothing in the catalog" },
    CRT_UI: { es: "Carrito vacio", en: "Cart empty" },

    // --- UI Maletero ---
    TRK_TTL: { es: "Maletero Vehiculo - {name} ({model})", en: "Trunk - {name} ({model})" },
    TRK_L: { es: "Maletero: {w}/{max} kg", en: "Trunk: {w}/{max} kg" },
    TRK_H: { es: "MALETERO", en: "TRUNK" },
    TRK_MOC: { es: "MOCHILA", en: "BACKPACK" },
    TRK_EMI: { es: "(inventario vacio)", en: "(inventory empty)" },
    TRK_EMB: { es: "(maletero vacio)", en: "(trunk empty)" },
    TRK_HNT: { es: "ESPACIO: menu | 3: cerrar maletero", en: "SPACE: menu | 3: close trunk" },

    // --- UI Retiro ---
    PKC_TTL: { es: "Retiro de pedido", en: "Order pickup" },
    PKC_ORD: { es: "Pedido: ${n}  |  Peso: {w} kg", en: "Order: ${n}  |  Weight: {w} kg" },
   // La caja de control pide el total por separado (sin el peso: la pagina lo
   // suma sola fila por fila), por eso es clave propia y no PKC_ORD.
   PKC_TOT: { es: "Pedido: ${n}", en: "Order: ${n}" },
    PKC_LIN: { es: "Lineas del pedido", en: "Order lines" },
    PKC_LIB: { es: "Libre en mochila: {free} kg", en: "Backpack free: {free} kg" },
    PKC_NON: { es: "No hay pedido para recoger", en: "No order to collect" },

    // --- UI Trueque ---
    // Titulo y subtitulo van en UNA linea (.panel-header--linea), como en la
    // armeria: el titulo dice que se hace y el segundo dato identifica a quien
    // lo atiende. "Busca hoy: ..." es una frase y no cabe ahi — se fue al pie
    // izquierdo (ver _snapSeller).
    SEL_TTL: { es: "Vender Armas", en: "Sell Weapons" },
    SEL_NPC: { es: "Cliente", en: "Client" },
    SEL_BUS: { es: "Busca hoy: {list}", en: "Looking for today: {list}" },
    SEL_BUD: { es: "Presupuesto: ${n}", en: "Budget: ${n}" },
    SEL_BUDH: { es: "Presupuesto: (no te lo dijo)", en: "Budget: (not told)" },
    SEL_ARMAS: { es: "Tus armas", en: "Your weapons" },
    SEL_OK: { es: "Se cumplio lo que buscaba", en: "He got what he wanted" },
    SEL_NON: { es: "(no tienes armas para vender)", en: "(no weapons to sell)" }
};
