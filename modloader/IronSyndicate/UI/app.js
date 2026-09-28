// IronSyndicate — Interfaz web
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// IronSyndicate Web UI - Cliente del panel
//
// Estructura calcada de modloader\SAWebUI\web\app.js para que el panel se vea
// igual que el ejemplo. Lo que cambia es el contenido (las 3 pestañas son los
// paneles del mod) y el final del archivo, donde vive el puente con CLEO.
//
// Contrato con modloader\IronSyndicate\cleo\IronSyndicate\modules\gsis_WebInterface.js:
//
//   LA PAGINA NO MANDA EVENTOS. En CLEO Redux 1.5.0 los scripts JS no reciben
//   eventos: asyncWait no reanuda, setTimeout/setInterval no disparan y
//   addEventListener nunca entrega (probado el 26/09 con cleo\zz_sonda.js).
//
//   Lo que si funciona es el otro extremo del mismo transporte: la pagina
//   escribe en la cola de la ASI con emit() y el mod la lee con
//   SAWeb_PollCommand. Eso es el canal de las acciones, y tambien de
//   ui:close / ui:toggle / flow:toggle — que existen porque el teclado, cuando lo
//   tiene la pagina, ya no lo tiene el juego.
//
//   CLEO -> pagina   receive("uistate",  { read, menu, anyMenu, keys, mode,
//                                        focus, openUis })  estado del input
//                    receive("inv",      { i, n, d })       inventario troceado
//                    receive("catalog",  { ... })           datos estaticos
//
//   El "inv" llega partido porque el dataJson de SAWEB_SEND_EVENT tiene 255
//   caracteres de tope duro (GetStringParam con maxlen unsigned char) y el
//   snapshot ronda los 800. La pagina lo arma sola en armarInventario().
//
//   "catalog" no se trocea: son datos estaticos que se mandan una sola vez al
//   abrir el menu (iconos, bandas de grupo, peso maximo). Ver gsis_WEBUI.md.
//
// ARRANQUE. Sin puente (abierto en un navegador normal) la pagina arranca
// VISIBLE y con el mock de diseño, para poder revisarla a ojo. Con puente
// arranca CERRADA y vacía, esperando que el mod le empuje el inventario.
// ============================================================================

// Canales que el bridge manda de verdad. Si se agrega uno aca, tiene que
// existir como send() en modules/gsis_WebInterface.js: al reves se declara un
// listener que nunca se dispara.
//
// "uistate" reemplaza a los dos que estaban antes ("input" y "panels"). Antes la
// pagina recibia "el menu esta visible" y armaba sola las otras dos banderas —
// si el teclado estaba prendido, y si tenia el foco — y las dos veces se
// equivocaba: no hay forma de que la pagina sepa si el WndProc le esta
// mandando las teclas. Ese dato llega, con la fuente etiquetada.
const INBOUND = ["uistate", "inv", "catalog", "screen"];

const bridgeReady = !!(window.SAWeb && window.SAWeb.hasBridge);

const panelEl = document.getElementById("panel");
const rowsBox = document.getElementById("rows");
const tabsBox = document.getElementById("tabs");
const titleEl = document.getElementById("title");
// No hay botones de navegacion: el pie es del peso y de la guia de teclas. El
// cambio de pestana sigue vivo por teclado — flechas y Q/E (abajo) — y por las
// pestañas de arriba, que son botones de verdad.

let selectedIndex = 0;

// El estado del input lo declara el mod y llega con "uistate". No se deduce aca.
//
// Antes esta paginaellia con `focused`, que se ponia true en un mousedown y no
// se revertia nunca, y con un aviso que le pedia al jugador apretar F12 para
// prender el teclado. F12 no existia en ningun handler del proyecto: el aviso
// describia una tecla que nadie habia implementado. Y `focused` era peor, porque
// la condicion real —que el WndProc este mandando las teclas a la pagina— no la
// conoce el navegador: la tiene el plugin, ahora consultable.
//
// `read` distingue "no se pudo leer" de "teclado apagado". Con una ASI vieja
// read es false y no se afirma nada: antes eso no se podia expresar, y por eso
// aparecian los avisos inventados.
let uiState = {
  read: false,
  menu: false,
  anyMenu: false,
  keys: false,
  mode: 0,
  focus: "",
  openUis: 0,
  // Que menu de proximidad esta abierto: "", "trunk", "dealer", "seller",
  // "pickup". Lo declara el mod, igual que el resto del estado de aca: la
  // pagina no puede deducirlo (no sabe donde esta el jugador) y no debe.
  flow: ""
};

// ---------------------------------------------------------------- TAB DATA --
//
// Los cuatro menus de proximidad (Baul, Armeria, Retiro, Trueque) NO van como
// filtro ni como pestana del inventario: son ventanas propias que se abren por
// proximidad (la esfera, el baul abierto). Si entraran en FILTROS, cambiarFiltro()
// las recorreria con las flechas y aterrizaria en una ventana que no existe.
//
// Van por su propio camino: un panel por menu (crearPanel), con su entrada en
// PANTALLAS. La razon de que sean paneles y no pestanas del inventario es que no
// se abren con una tecla del panel: el inventario se abre con I y se apaga
// mientras hay un flujo abierto. Ver la seccion "PANTALLAS DE FLUJO".
//
// Lo que se gasto de cada uno, para que quede anotado donde buscar:
//
//   Baul    getTrunkItems / getTrunkWeight / getTrunkMaxCapacity  (mod)
//           addToTrunk / removeFromTrunk  + el prechequeo de peso
//   Armeria getDealerPrice(id, charId) / getCart() / getCartTotal()
//           addToCart / checkout() -> emit dealer:orderReady
//   Retiro  getOrder() / removeFromOrder() + addItem() del modulo
//           "recoger todo" valida el peso ANTES de mutar
//   Trueque getSellState() / offerWeapon() + removeItem() + addScore()
//           el presupuesto del comprador se oculta hasta la 1ra oferta
//
// Esa coreografia vivia en los ui/gsis_*Menu.js que se borraron, y ahora esta en
// los modulos duenos: putInTrunk, collectItem, doOffer. Es su casa porque el peso
// y el precio los sabe el juego, no un snapshot de la pagina.
//
// Lo que necesitan las dos pestanas que se fueron, cuando les toque:
//   Propiedades  snapProperties() en gsis_InventorySerialization.js, con getDirtyMoney() y
//                listProperties() de gsis_PropertyModule.js
//   Vehiculos     snapVehicles() con getModuleData("VehicleModule")
//
// Los placeholders que las mostraban se fueron con el cambio a filtros
// (ver FILTROS). Cuando PropertyModule tenga datos, vuelven como fila del
// inventario o como overlay de proximidad, no como pestaña.

// ------------------------------------------------------------------ MOCK --
//
// Datos de EJEMPLO para revisar el diseño en el navegador. No son del juego y
// no se mandan nunca por el puente: en el juego lo que dibuja las filas son
// los datos que mande el mod. Se cae solo apenas el puente se conecta
// (ver dropMock).
//
// El mock trae su propio catalogo chico —bandas, iconos y capacidad— en vez de
// usar el de la pagina a proposito: antes el mapa de iconos vivia en app.js y
// era la fuente, o sea que el catalogo real y el de la pagina podian divergir
// sin que nada lo dijera. Ahora el unico mapa es data\gsis_web_data.js, y lo de
// abajo es una copia de diseño que existe solo sin puente y se borra con el
// resto del mock. Cuando el puente esta, esto no se lee.

const MOCK_CATALOG = {
  maxWeight: 12, // = MISC.MAX_INVENTORY_WEIGHT del mod
  cats: [
    { key: "weapon", label: "Armas" },
    { key: "magazine", label: "Cargadores" },
    { key: "material", label: "Materiales" }
  ],
  icons: {
    "9mm": "9mm.png",
    "pistol_assembled": "9mm.png",
    "silenced_9mm": "silenced9mm.png",
    "desert_eagle": "desertEagle.png",
    "shotgun": "shotgun.png",
    "sawed_off": "sawnoffShotgun.png",
    "combat_shotgun": "combatShotgun.png",
    "micro_uzi": "microSMG-Uzi.png",
    "mp5": "mp5.png",
    "tec9": "tec9.png",
    "ak47": "ak47.png",
    "m4_assembled": "m4.png",
    "country_rifle": "countryRifle.png",
    "sniper_rifle": "sniperRifle.png",
    "rpg": "rpg.png",
    "heat_seeker": "hsRocket.png",
    "flamethrower": "flame-Thrower.png",
    "minigun": "minigun.png",
    // Cargadores: los 17 de data\gsis_web_data.js. Pistolas con el cargador
    // recto (mag_9mm.png), subfusiles con el largo (mag_SMG.png) y el resto con
    // el curvo (mag_fusil.png). Es una copia del mapa real, no una seleccion: si
    // divergiera, el preview mostraria una columna distinta de la del juego.
    "mag_9mm": "mag_9mm.png",
    "mag_silenced_9mm": "mag_9mm.png",
    "mag_desert_eagle": "mag_9mm.png",
    "mag_shotgun": "mag_fusil.png",
    "mag_sawed_off": "mag_fusil.png",
    "mag_combat_shotgun": "mag_fusil.png",
    "mag_micro_uzi": "mag_SMG.png",
    "mag_mp5": "mag_SMG.png",
    "mag_tec9": "mag_SMG.png",
    "mag_ak47": "mag_fusil.png",
    "mag_m4_assembled": "mag_fusil.png",
    "mag_country_rifle": "mag_fusil.png",
    "mag_sniper_rifle": "mag_fusil.png",
    "mag_rpg": "mag_fusil.png",
    "mag_heat_seeker": "mag_fusil.png",
    "mag_flamethrower": "mag_fusil.png",
    "mag_minigun": "mag_fusil.png",
    // Materiales: los 10 de data\gsis_web_data.js (chatarra incluida). Todos al
    // mismo PNG salvo muelle y mira, que tienen el suyo de piezas de arma.
    "scrap_metal": "material.png",
    "gunpowder": "material.png",
    "spring": "weapons_report.png",
    "barrel_small": "material.png",
    "scope": "weapons_report.png",
    "armor_plate": "material.png",
    "pistol_frame": "material.png",
    "pistol_barrel": "material.png",
    "rifle_receiver": "material.png",
    "rifle_barrel": "material.png"
  }
};

const ICON_DIR = "../image/";

// Fila CRUDA del mock, con la misma forma que manda el mod (gsis_ItemRow.js):
// nombre pelado, sin icono y sin "x5". Lo que se dibuja se agrega despues, en
// snapRow() y nameCell(), que es el camino por el que pasan las filas reales.
// Si el mock agregara un campo que el mod no manda, el preview mostraria una
// tabla distinta de la del juego.
//
// Las columnas numericas van con numero o null; null se dibuja como guion para
// que la columna se siga leyendo como columna.
function itemRow(o) {
  return {
    id: o.id,
    cat: o.cat,
    name: o.name,
    qty: o.qty,
    ammo: o.ammo || null,
    weight: o.weight,
    value: o.value || null,
    tip: o.tipExtra || ""
  };
}

const MOCK = {
  inventory: [
    // Armas: instanciadas, una fila por unidad, con su propia municion
    itemRow({ id: "ak47", name: "AK-47", cat: "weapon", qty: 1, weight: 3.5, ammo: "30/30", value: 1500, tipExtra: "Fusil de asalto" }),
    itemRow({ id: "silenced_9mm", name: "Pistola con silenciador", cat: "weapon", qty: 1, weight: 1.5, ammo: "9/17", value: 360, tipExtra: "Pistola" }),
    itemRow({ id: "desert_eagle", name: "Desert Eagle", cat: "weapon", qty: 1, weight: 1.8, ammo: "3/7", value: 540, tipExtra: "Pistola" }),
    // Cargadores: tambien instanciados, uno por unidad
    itemRow({ id: "mag_ak47", name: "Cargador AK-47", cat: "magazine", qty: 1, weight: 0.2, ammo: "30/30", tipExtra: "Calidad 1" }),
    itemRow({ id: "mag_9mm", name: "Cargador 9mm", cat: "magazine", qty: 1, weight: 0.2, ammo: "17/17", tipExtra: "Calidad 2" }),
    itemRow({ id: "mag_desert_eagle", name: "Cargador Desert Eagle", cat: "magazine", qty: 1, weight: 0.2, ammo: "0/7", tipExtra: "Vacío" }),
    // Materiales: SI se apilan, una sola fila con la cantidad
    itemRow({ id: "scrap_metal", name: "Chatarra", cat: "material", qty: 5, weight: 2.5, tipExtra: "Material de fundición" }),
    itemRow({ id: "gunpowder", name: "Pólvora", cat: "material", qty: 12, weight: 2.4, tipExtra: "Material de fundición" }),
    itemRow({ id: "spring", name: "Muelle", cat: "material", qty: 8, weight: 0.8, tipExtra: "Componente" }),
    itemRow({ id: "scope", name: "Mira", cat: "material", qty: 1, weight: 0.3, tipExtra: "Componente" })
  ]
};

// REGISTRO DE LOS MENUS DEL PREVIEW. La clave es el id de la pantalla, el mismo
// que usa PANTALLAS: por eso agregar un menu aqui es agregar una entrada alla y
// el recorrido de pantallas (PREVIEW_CICLO) lo toma solo, sin tocar ningun
// switch. Ver previewVer().
//
//   titulo/subtitulo  lo que se ve en el encabezado.
//   panes             las listas.
//   notice            opcional. Sale debajo de las tablas, encima del pie, como
//                     aviso, y es el estado que hay que mirar que se lea.
//
// En el navegador no hay proximidad que abra nada, asi que el menu que se mira lo
// elige el que revisa: con Ctrl+flecha se recorre, o con ?flujo=<id> en la barra
// de direcciones se abre uno puntual y queda fijo.
const MOCK_FLUJOS = {
  trunk: {
    titulo: "Maletero Vehiculo - Infernus (411)",
    subtitulo: "ESPACIO: menu | 3: cerrar maletero | ESPACIO o ESC para cerrar el menu",
    // Con aviso, para que se vea como se ven los errores de peso. Es el estado
    // que mas se repite en el juego y el que hay que mirar que se lea.
    notice: "~r~Maletero lleno (libre 1.3 kg, necesitas 2.5 kg)",
    panes: [
      {
        key: "mochila",
        titulo: "MOCHILA",
        vacio: "(inventario vacio)",
        weight: 6.2,
        max: 12,
        // Las filas se arman en applyMock(), no aca: snapRow() lee catalog.icons
        // y el catalogo se aplica despues, en el mismo applyMock. Escribirlo
        // aca seria ejecutar snapRow antes de que exista catalog.
        rows: []
      },
      {
        key: "baul",
        titulo: "MALETERO",
        vacio: "(maletero vacio)",
        weight: 3.5,
        max: 150,
        rows: []
      }
    ],
    pie: null
  },
  dealer: {
    titulo: "Armero ilegal",
    subtitulo: "Emmet",
    panes: [
      {
        key: "catalogo",
        titulo: "Catalogo",
        vacio: "Este vendedor no tiene nada en el catalogo",
        weight: 0,
        max: 0,
        rows: [
          { id: "9mm", cat: "Pistolas", name: "9mm", qty: 1, ammo: "17/17", weight: 1.5, value: 400, precio: 480, enCarrito: 2, tip: "" },
          { id: "desert_eagle", cat: "Pistolas", name: "Desert Eagle", qty: 1, ammo: "7/7", weight: 1.8, value: 540, precio: 900, enCarrito: 0, tip: "" },
          { id: "shotgun", cat: "Escopetas", name: "Escopeta", qty: 1, ammo: "1/1", weight: 3.5, value: 700, precio: 1050, enCarrito: 0, tip: "" },
          { id: "ak47", cat: "Fusiles de asalto", name: "AK-47", qty: 1, ammo: "30/30", weight: 3.5, value: 1500, precio: 1800, enCarrito: 1, tip: "" }
        ]
      },
      {
        // Lo que ya esta en el carrito: mismo shape que las filas del catalogo
        // (mismas columnas) mas maxQty, el tope de cuanto se puede sacar. En el
        // juego lo arma _snapDealer a partir del cart; aca se escribe a mano
        // para ver el layout de las dos listas.
        key: "carrito",
        titulo: "Carrito",
        vacio: "(carrito vacio)",
        weight: 0,
        max: 0,
        rows: [
          { id: "9mm", cat: "Pistolas", name: "9mm", qty: 1, ammo: "17/17", weight: 1.5, value: 400, precio: 480, enCarrito: 2, maxQty: 2, tip: "" },
          { id: "ak47", cat: "Fusiles de asalto", name: "AK-47", qty: 1, ammo: "30/30", weight: 3.5, value: 1500, precio: 1800, enCarrito: 1, maxQty: 1, tip: "" }
        ]
      }
    ],
    // El total del carrito es el de las filas de arriba: 2x480 + 1x1800.
    // renderPie parsea este texto para el "falta $X" y los botones del pie,
    // asi que el mock tiene que cuadrar con sus propias filas.
    pie: { izq: "Tu dinero: $4.200", der: "Total carrito: $2.760" }
  },
  seller: {
    titulo: "Trueque — Cliente local",
    subtitulo: "Busca hoy: Fusiles de asalto, Escopetas",
    panes: [
      {
        key: "venta",
        titulo: "Tus armas",
        vacio: "(no tienes armas para vender)",
        weight: 0,
        max: 0,
        rows: [
          { id: "ak47", cat: "weapon", name: "AK-47", qty: 1, ammo: "30/30", weight: 3.5, value: 900, base: 900, oferta: 900, tip: "" },
          { id: "9mm", cat: "weapon", name: "9mm", qty: 1, ammo: "9/17", weight: 1.5, value: 240, base: 240, oferta: 240, tip: "" }
        ]
      }
    ],
    pie: { izq: "Presupuesto: (no te lo dijo)", der: "" }
  },
  pickup: {
    titulo: "Retiro de pedido",
    subtitulo: "Pedido: $1.440  |  Peso: 5.0 kg",
    panes: [
      {
        key: "pedido",
        titulo: "Lineas del pedido",
        vacio: "No hay pedido para recoger",
        weight: 0,
        max: 0,
        rows: [
          { id: "ak47", cat: "weapon", name: "AK-47", qty: 1, ammo: "30/30", weight: 3.5, value: 1500, disponible: 1, tip: "" },
          { id: "9mm", cat: "weapon", name: "9mm", qty: 1, ammo: "17/17", weight: 1.5, value: 400, disponible: 1, tip: "" }
        ]
      }
    ],
    pie: { izq: "Libre en mochila: 5.8 kg", der: "" }
  }
};

let mockActive = false;

// Que pantalla del mock se mira al abrir la pagina. Sin parametro, el
// INVENTARIO: es la pantalla principal y la que esta en pantalla casi siempre, y
// antes el preview arrancaba en un menu de proximidad, o sea que para revisar el
// panel que mas se usa habia que pasar por otro. Antes era el primero de la
// lista, que es el baul.
//
//   (nada)      inventario
//   inv         inventario, escrito de las dos formas que se ocurren
//   trunk       maletero
//   dealer      armeria
//   seller      trueque
//   pickup      retiro
//
// Un id que no existe cae en el inventario en vez de romperse: es un parametro de
// la barra de direcciones, no parte del contrato, y un typo tiene que verse como
// "no se encontro ese menu" y no como una pagina en blanco.
function mockFlowId() {
  const q = String(new URLSearchParams(window.location.search).get("flujo") || "").toLowerCase();
  if (!q || q === "inv" || q === "inventario" || q === "0") return "";
  if (MOCK_FLUJOS[q]) return q;
  _diag("?flujo=" + q + " no existe — se abre el inventario");
  return "";
}

// Lo que manda el mod en "catalog": peso maximo, bandas de grupo e iconos. Sin
// esto la pagina no puede dibujar la tabla completa, asi que arranca vacio y se
// llena al abrir el menu. El mock siembra esta misma variable, por eso el
// preview en navegador funciona sin puente.
let catalog = { maxWeight: 0, cats: [], icons: {} };

function applyCatalog(c) {
  if (!c) return;
  if (c.maxWeight !== undefined) maxWeight = Number(c.maxWeight) || 0;
  if (Array.isArray(c.cats)) catalog.cats = c.cats;
  if (c.icons) catalog.icons = c.icons;
}

// El id de la UI que la pagina usa para los mensajes del log. En el juego lo
// decide el mod; en el preview no hay ninguno, asi que se pone uno cualquiera
// para que los textos se lean igual.
const UI_ID_PREVIEW = "preview";

function applyMock() {
  mockActive = true;
  applyCatalog(MOCK_CATALOG);
  // Mismo camino que las filas del mod: crudas y normalizadas por snapRow().
  // Si el mock las dibujara directas, el preview no probaria el normalizador,
  // que es justamente la parte que se rompe silenciosamente.
  stateMap = buildStateMap(MOCK.inventory.map(snapRow));
  // Las filas del baul salen del MISMO inventario, en crudo: crearPane() las
  // normaliza al dibujarlas, igual que a las que manda el mod. Ver MOCK_FLUJOS.
  MOCK_FLUJOS.trunk.panes[0].rows = MOCK.inventory.filter((r) => r.cat !== "material");
  MOCK_FLUJOS.trunk.panes[1].rows = [
    // Sin value: los materiales no tienen precio de reventa (valueCell lee
    // getSellPrice, que es de WEAPON_DATA). Con value:2 el baul le ponia a la
    // chatarra un valor que la mochila no le pone, y las dos listas —que son el
    // mismo item— dejaban de decir lo mismo.
    itemRow({ id: "scrap_metal", name: "Chatarra", cat: "material", qty: 5, weight: 2.5 })
  ];
  // La pantalla que se mira NO se decide aca: la elige previewVer() en el
  // arranque, y despues el que revisa con Ctrl+flecha. Antes este bloque armaba
  // el payload del primer menu y dejaba uiState.flow en ese id, o sea que la
  // eleccion vivia en el generador de datos y en el que la muestra: cambiar el
  // menu inicial era cambiar dos lugares.
  uiState = { read: true, menu: true, anyMenu: true, keys: true, mode: 1, focus: UI_ID_PREVIEW, openUis: 1, flow: "" };
}

// El recorrido de pantallas del preview: el inventario primero y despues los
// menus de proximidad, en el orden en que estan declarados en MOCK_FLUJOS.
//
// Se arma SOLO desde el registro del mock. Agregar un menu es agregar una clave a
// MOCK_FLUJOS (con su entrada en PANTALLAS) y el recorrido lo agarra sin tocar el
// teclado ni ningun switch. Por eso aca no hay una lista de menus escrita a mano:
// seria una segunda lista que se desincroniza de la primera el dia que falte una
// entrada en alguna de las dos.
//
// OJO con el lugar donde se llama. PANTALLAS es un const declarado mas abajo en
// este archivo, asi que recorrer el registro NO se puede hacer en el punto donde
// vive MOCK_FLUJOS: se leeria antes de inicializarse y el script entero moriria
// con "Cannot access 'PANTALLAS' before initialization". Se arma en el INIT, abajo
// de todo. Ver el mismo caso en FILTRO_INICIAL.
function cicloPreview() {
  const ids = Object.keys(MOCK_FLUJOS);
  for (const id of ids) {
    // Un id sin PANTALLAS no rompe nada —la pagina dibuja el esqueleto sin
    // datos, que es justo para lo que esta el esqueleto— pero es un error al
    // registrar el menu, asi que se avisa por consola en vez de dejar que el que
    // revisa lo descubra viendo un panel vacio.
    if (!PANTALLAS[id]) {
      _diag("preview: '" + id + "' esta en MOCK_FLUJOS pero no en PANTALLAS — se vera el esqueleto sin datos");
    }
  }
  // "" primero: el inventario es la pantalla principal, asi que es la que esta
  // abierta y la primera a la que vuelve el recorrido.
  return [""].concat(ids);
}

// El recorrido, armado en el INIT (ver cicloPreview). Vive en una variable de
// modulo y no se calcula al vuelo porque armarlo lee PANTALLAS, que se declara
// mas abajo en el archivo.
let CICLO_PREVIEW = null;

// Cambiar de pantalla en el PREVIEW. Sin puente y solo sin puente: la unica
// llamada es la del arranque y la de Ctrl+flecha, y las dos estan en ramas
// !bridgeReady, asi que en el juego esta funcion no existe para nadie.
function previewVer(id) {
  const inv = !id;
  if (!inv) {
    const payload = MOCK_FLUJOS[id];
    if (!payload) {
      _diag("preview: no hay mock para '" + id + "'");
      return;
    }
    // El id va en el payload porque renderFlujo() lo usa para saber si el
    // snapshot que tiene es de la pantalla que esta abierta (flowData.id !== id).
    payload.id = id;
    uiState = Object.assign({}, uiState, { flow: id });
    flowData = payload;
  } else {
    uiState = Object.assign({}, uiState, { flow: "" });
    flowData = null;
  }

  // REGLA 1, igual que en el juego: la visibilidad de #panel la decide
  // setPanelVisible() y no la toca nadie mas. En el preview siempre se muestra,
  // asi que el destino es el mismo para las cinco pantallas — con un flujo
  // abierto la ultima lo apagaria y sin flujo la primera no lo destaparia.
  setPanelVisible(true);
  setPantalla(id);
  if (inv) renderFiltro(filtroActualKey);
  else renderFlujo();

  _diag("preview: " + (inv ? "inventario" : id));
}

// Un paso del recorrido, con la vuelta por el final. El indice sale de
// pantallaActual() —que es uiState.flow, con "" para el inventario— y no de una
// variable propia: si el recorrido y la pantalla se desincronizan, la flecha
// saltaria a un menu en vez de moverse al vecino.
function previewSaltar(dir) {
  const ciclo = CICLO_PREVIEW || [];
  if (ciclo.length < 2) return;
  const i = ciclo.indexOf(pantallaActual());
  previewVer(ciclo[(i + dir + ciclo.length) % ciclo.length]);
}

// En el juego el mock no debe aparecer ni un frame. Se cae en cuanto el puente
// se anuncia, no cuando la pagina decide: si la pagina esta viva, el puente
// ya esta inyectado.
function dropMock() {
  if (!mockActive) return false;
  mockActive = false;
  // El catalogo tambien es del mock. Si no se limpia, las filas reales que
  // llegan despues se dibujan con los iconos de ejemplo hasta que llegue el
  // "catalog" de verdad.
  catalog = { maxWeight: 0, cats: [], icons: {} };
  stateMap = buildStateMap([]);
  // El menu simulado tambien se cae. Si no, el preview se queda con el panel de
  // flujo en pantalla mientras el inventario se dibuja abajo, que es el estado
  // que nunca existe en el juego.
  flowData = null;
  console.log("[GSIS] mock de diseño eliminado — ahora las filas vienen del mod");
  return true;
}

// -------------------------------------------------- FILTROS DE CATEGORIA --
//
// Los botones de arriba ya no son pestañas de tres paneles: son cinco filtros
// del MISMO listado, el inventario. Las dos pestañas que no eran inventario
// (Propiedades y Vehiculos) eran placeholders —decían "Este panel todavia no
// esta implementado"— y se fueron con el cambio.
//
//   key    el cat de la fila. null = sin filtro (todos). "otros" no es un cat:
//          es la negation de los tres conocidos, para que un tipo de item nuevo
//          caiga en algun lado y no desaparezca.
//   icon   el archivo dentro de assets/iconos/categorias. Los botones son
//          imagenes, no texto: el nombre de la categoria lo sigue diciendo la
//          banda de grupo de la tabla, asi que el boton no lo repite.
//
// La lista es estatica a proposito: los iconos son archivos fijos. Si el mod
// agrega un cat, se agrega una linea aca con su icono.
const FILTROS = [
  { key: null, icon: "todos", label: "Todos", empty: "No tenes nada encima." },
  { key: "weapon", icon: "9mm", label: "Armas", empty: "No tenes armas." },
  { key: "magazine", icon: "cargador", label: "Cargadores", empty: "No tenes cargadores." },
  { key: "material", icon: "materiales", label: "Materiales", empty: "No tenes materiales." },
  { key: "otros", icon: "otros", label: "Otros", empty: "Nada en otras categorias." }
];

// Los cats que tienen boton propio, derivado de FILTROS y no escrito aparte:
// si las dos listas vivieran separadas, agregar un filtro sin tocar este Set
// dejaria el item en "todos" y en "otros" a la vez.
//
// "otros" se define como la negation de este set, asi que agregar una linea a
// FILTROS alcanza para que el filtro "otros" se adjusts solo.
const CATS_CON_BOTON = new Set(
  FILTROS.map((f) => f.key).filter((k) => k && k !== "otros")
);

// data-filter del boton activo. "all" es el sin filtro: null en FILTROS no
// serviria como atributo HTML.
//
// Este let va ACA y no arriba con el resto del estado: usa FILTRO_INICIAL, que
// se declara mas abajo. Declarado antes, el script entero moria con
// "Cannot access 'FILTRO_INICIAL' before initialization" y no se dibujaba
// nada — la tabla, el titulo y el pie. El vocabulario del filtro vive junto,
// en una sola parte.
const FILTRO_INICIAL = "all";
let filtroActualKey = FILTRO_INICIAL;

function filtroActual() {
  return FILTROS.find((f) => filtroKeyDe(f) === filtroActualKey) || FILTROS[0];
}

// El key del boton es la cadena del atributo; el de la fila es el cat. El
// "todos" no tiene cat asi que se traduce a null.
function filtroKeyDe(f) {
  return f.key === null ? "all" : f.key;
}

// Un filtro mas o menos el cat de la fila.
function pasaFiltro(r, f) {
  if (f.key === null) return true;
  if (f.key === "otros") return !CATS_CON_BOTON.has(r.cat);
  return r.cat === f.key;
}

// Un solo listado. Antes stateMap tenia una entrada por pestana; con filtros
// no hay varias vistas almacenadas: el inventario entero es la fuente y el
// filtro es una proyeccion que se arma en cada render.
function buildStateMap(rows) {
  return rows.map((r) => ({ ...r, el: null }));
}

let stateMap = buildStateMap([]);

// Lo que se ve con el filtro activo: la proyeccion de stateMap. La guarda
// renderFiltro y la recorre selectRow, asi que el teclado navega dentro de lo
// visible y no por filas que el filtro escondio. Es un alias del subarray que
// filter devuelve, no una copia: las filas son los mismos objetos de stateMap
// y el .el se escribe una sola vez.
let viewFiltrada = [];

// -------------------------------------------------- INVENTARIO REAL DEL MOD --
//
// El mock de arriba es solo de diseño. Cuando hay puente, las filas son las que
// manda gsis_InventorySerialization.js con snapInventory(), empujadas por el mod en "inv" y
// armadas aca. snapRow() es el normalizador: convierte la fila cruda del mod en
// la fila que dibuja la tabla (icono, campos opcionales en null, marca de
// equipado), y lo mismo hace con las de los cuatro menus de proximidad en
// crearPane(). Un solo camino para las dos fuentes, asi que no pueden divergir.
//
// El snapshot ya trae los textos en español y el tip armado: la pagina no
// consulta ITEMS ni WEAPON_DATA, no los tiene.

// Idempotente a proposito: dos puntos del render la pueden aplicar sobre la
// misma fila (setInventory y crearPane) sin arruinarla, y una fuente que un dia
// pase por los dos caminos no se escribe dos veces encima. Se verifico con la
// fila del mock pasada dos veces.
//
// El ...o delante conserva las claves propias de cada pantalla —precio,
// enCarrito, base, oferta, disponible— que este normalizador no conoce ni debe
// conocer: son del modulo que las manda.
function snapRow(o) {
  return {
    ...o,
    kind: "table",
    // El nombre va pelado: el "x5" lo agrega nameCell() al dibujar, que es lo
    // que hace que inventario y menus de proximidad lo escriban igual sin que
    // el emisor se acuerde. Antes se horneaba aca y las filas que no pasaban
    // por aca (los cuatro menus) salian sin la cantidad.
    ammo: o.ammo === undefined ? null : o.ammo,
    value: o.value === undefined ? null : o.value,
    icon: catalog.icons[o.id] || o.icon || null,
    tip: o.tip || "",
    // equipado / ranura / slot vienen del mod SOLO en las filas de lo que esta
    // en un slot del ped o en el cinturon. En una fila normal valen false /
    // null / undefined y no se usan. Ver equipadasSnap() en gsis_InventorySerialization.js.
    equipado: o.equipado === true,
    ranura: o.ranura || null,
    slot: o.slot === undefined ? null : o.slot
  };
}

const weightEl = document.getElementById("weight");

// Peso y capacidad viven aca, fuera del estado de la pestana: el pie los dibuja
// sin importar que pestana este abierta.
let invWeight = 0;
let maxWeight = 0;

// El peso lo escribe el mod, no la pagina: es el unico que sabe cuanto entra y
// cuanto pesa. El snapshot ya no trae maxWeight - es estatico y viene en el
// catalogo, que se manda una sola vez al abrir el menu.
// El peso lo escribe el mod, no la pagina: es el unico que sabe cuanto entra y
// cuanto pesa. El snapshot ya no trae maxWeight — es estatico y viene en el
// catalogo, que se manda una sola vez al abrir el menu.
function setInventory(inv) {
  if (!inv) return;
  stateMap = buildStateMap((inv.rows || []).map(snapRow));
  invWeight = Number(inv.weight || 0);
  // El filtro activo se mantiene: si estabas en Materiales, un snapshot nuevo
  // no te saca de Materiales.
  renderFiltro(filtroActualKey);
}

// ------------------------------------------------- ARMADO DE TROZOS --
//
// El mod no puede mandarme un evento: en CLEO Redux 1.5.0 los scripts JS no
// reciben eventos (probado el 26/09, ver gsis_WebInterface.js). La unica direccion
// que funciona es mod -> pagina, asi que el mod empuja el snapshot.
//
// Y no lo manda entero: el dataJson de SAWEB_SEND_EVENT viaja como string de
// parametro de comando CLEO y el tope duro son 255 chars (GetStringParam con
// maxlen unsigned char). Todo lo que pase eso llega partido en {i, n, d} y hay
// que armarlo aca. El limite es del comando, no de la frecuencia: el catalogo
// son ~700 chars y tambien llega troceado, aunque se mande una sola vez.
//
// El buffer es por canal, asi que "inv" y "catalog" no se pisan entre si. Cada
// parte reinicia el de su canal porque el payload es siempre entero: si llegara
// una tanda incompleta (el juego cerrado a mitad), al proximo payload completo el
// buffer se pisa solo igual.
const _trozos = {
  inv: { partes: [], esperadas: 0 },
  catalog: { partes: [], esperadas: 0 },
  screen: { partes: [], esperadas: 0 }
};

// Diagnostico del transporte. Antes vivia en el DOM (#diag) y se leia abajo del
// panel, encimandose con los botones de navegacion. Se saco de la pantalla: lo
// que queda va a console, que es donde ya mandaba el resto del debugging de
// este puente.
function _diag(text) {
  console.log("[GSIS] " + text);
}

// Reensambla un canal troceado. Devuelve el objeto, o null si la tanda esta
// incompleta todavia, tiene un hueco, o el JSON no parsea (en cuyo caso avisa).
function ensamblar(name, data) {
  const buf = _trozos[name];
  if (!buf) {
    _diag("canal troceado desconocido: " + name);
    return null;
  }
  if (!data || typeof data.i !== "number" || typeof data.n !== "number") {
    _diag("llegó '" + name + "' con forma rara: " + JSON.stringify(data).slice(0, 60));
    return null;
  }
  if (data.i === 0) {
    buf.partes = [];
    buf.esperadas = data.n;
  }
  if (data.n !== buf.esperadas) {
    _diag("tanda inconsistente en '" + name + "': n=" + data.n + " esperaba " + buf.esperadas);
    return null;
  }
  buf.partes[data.i] = data.d || "";

  if (buf.partes.length < buf.esperadas) {
    _diag("recibiendo '" + name + "': " + buf.partes.length + "/" + buf.esperadas + " trozos");
    return null;
  }
  for (let k = 0; k < buf.esperadas; k++) {
    if (typeof buf.partes[k] !== "string") {
      _diag("falta el trozo " + k + " de " + buf.esperadas + " en '" + name + "'");
      return null;
    }
  }

  const json = buf.partes.join("");
  buf.partes = [];
  buf.esperadas = 0;
  try {
    return JSON.parse(json);
  } catch (e) {
    // OJO: esto es lo que pasaba en silencio. Un dataJson truncado arma una
    // string rota aqui adentro y el menu queda vacio sin decir nada.
    _diag("JSON invalido en '" + name + "' (" + json.length + " chars): " + e.message);
    return null;
  }
}

function armarInventario(data) {
  const inv = ensamblar("inv", data);
  if (!inv) return;
  setInventory(inv);
  _diag("inventario: " + (inv.rows ? inv.rows.length : 0) + " items, " +
    invWeight.toFixed(1) + "/" + maxWeight + " kg");
}
// ---------------------------------------------------------------- HELPERS --

function jsonable(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return null;
  }
}

function fmt(v) {
  if (typeof v === "string") return '"' + (v.length > 16 ? v.slice(0, 16) + "…" : v) + '"';
  return JSON.stringify(v);
}

// El log del puente y del input va a la consola: la pagina no tiene devtools en
// el juego, asi que es la unica forma de ver el ida y vuelta del bridge. Solo
// hay una direccion (lo que llega del mod), asi que no hace falta marcar "out".
//
// Cada rama dice lo que el mod(reporto, y nada mas. No hay forma de que aca se
// afirme algo que el mod no dijo: el que sabe si el WndProc esta mandando las
// teclas a la pagina es el plugin, y su respuesta llega en uiState.
function logState() {
  if (!bridgeReady) {
    console.log("[GSIS] preview (sin puente)");
    return;
  }
  if (!uiState.read) {
    // El getter no se pudo leer. No es lo mismo que "el teclado esta apagado", y
    // decir que lo esta seria inventar. Casi siempre es la ASI y el SAWeb.cleo
    // de versiones distintas.
    console.log("[GSIS] estado de input no leido: el mod no pudo preguntar a la ASI");
    return;
  }
  if (!uiState.keys) {
    // El juego tiene el teclado. La razon es siempre una de estas dos, y ninguna
    // se arregla apretando una tecla: o el puntero no esta sobre la UI, o el
    // modo del cursor es HIDDEN. Mover el puntero encima es lo que lo prende.
    console.log("[GSIS] teclado del juego (menu " + (uiState.anyMenu ? "abierto" : "cerrado") +
      ", focus " + (uiState.focus || "ninguno") + ", modo " + uiState.mode +
      ") — mové el puntero sobre el panel");
    return;
  }
  console.log("[GSIS] listo — la pagina tiene el teclado (focus " + (uiState.focus || "?") + ")");
}

// --------------------------------------------------- CANAL DE ACCIONES --
//
// Aca SI hay un camino de vuelta: emit() llega a la cola de la ASI y el mod lo
// pulla con SAWeb.takeCommand() una vez por frame (SAWeb v2). Lo que no funciona
// es el otro sentido —que el script JS RECIBA un evento—, y no hace falta para
// esto.
//
// El prefijo "cmd:" no es decorativo: es el contrato. La cola guarda el nombre
// entero como "saweb:main:cmd:<lo que sea>", y el runtime solo le da al mod los
// que arrancan asi. Sin el prefijo, el comando se perderia en el camino del
// TriggerEvent, que es el que no llega.

function emitCommand(payload) {
  if (!bridgeReady) {
    _diag("preview: comando no enviado (sin puente)");
    return false;
  }
  try {
    const ok = window.SAWeb.emit("cmd:" + payload.cmd, payload) !== false;
    _diag("cmd " + payload.cmd + (ok ? " enviado" : " (el router lo rechazó)"));
    return ok;
  } catch (e) {
    _diag("cmd " + payload.cmd + " fallo: " + e.message);
    return false;
  }
}

// Que accion corresponde lo decide la pagina segun el tipo de item. El modulo
// es el que valida: si el item no existe o no se puede equipar, equipWeapon lo
// dice por su cuenta y la pagina se entera porque el snapshot vuelve sin el.
//
// Un cargador no se equipa: su accion es al cinturon. Un material no tiene
// ninguna. Devuelve null cuando la fila no admite la accion pedida, para que
// el keycap no tenga que inventar un resultado.
function actionFor(r, what) {
  if (!r) return null;

  // Una fila equipada esta FUERA de items[] —el mod la saco al equipar—, asi que
  // "tirar" no puede funcionar: removeItem la buscaria ahi y no la encontraria,
  // y el comando se perderia en silencio. "Equipar" tampoco, ya esta equipada.
  // Lo unico que corresponde es devolverla a donde estaba, y cada ranura tiene su
  // comando: el arma por su slot de GTA, el cargador por su casilla de cinturon
  // (por casilla y no por id, porque en el cinturon puede haber dos cargadores
  // del mismo tipo y la casilla es lo unico que los distingue).
  if (r.equipado) {
    if (what !== "unequip") return null;
    if (r.ranura === "arma") return { cmd: "inv:unequip", slot: r.slot };
    if (r.ranura === "cinturon") return { cmd: "inv:belt:off", slot: r.slot };
    return null;
  }

  if ((r.qty || 1) > 1) {
    // Apilado: no hay una unidad sola que equipar ni que tirar por id.
    return what === "drop" ? { cmd: "inv:drop", id: r.id, qty: r.qty || 1 } : null;
  }
  if (what === "equip") {
    if (r.cat === "weapon") return { cmd: "inv:equip", id: r.id };
    if (r.cat === "magazine") return { cmd: "inv:belt", id: r.id };
    return null;
  }
  if (what === "drop") {
    return { cmd: "inv:drop", id: r.id, qty: 1 };
  }
  return null;
}

// ---------------------------------------------------- REGISTRO DE ACCIONES --
//
// Un solo lugar donde viven las acciones de un item. Lo leen los tres caminos
// que hay para dispararlas —el menu contextual del click derecho, la tecla X y
// los dos keycaps del pie— asi que agregar una accion nueva es UNA linea aca y
// nada mas: el menu se arma solo, la tecla la prueba sola, y el pie ya no la
// tiene que hardcodear.
//
//   id      lo que se pasa a runAccion(); no sale de la pagina
//   label   el texto del menu. String, o funcion de la fila cuando el verbo
//           depende del item ("Cinturon" para un cargador, "Equipar" para un arma)
//   sep     true pone un separador antes de este item
//   aplica  si la accion tiene sentido para esta fila. Se consulta antes de
//           mostrarla: un material no tiene acción de equipar y no deberia
//           aparecer un boton que no hace nada.
//
// El orden del menu es el orden de este array. "Tirar" va primero porque es la
// accion destructiva y la que se usa en el juego: la que borra algo no
// conviene que sea el segundo click de una lista de dos. "Equipar" queda
// debajo, separado, para que un click de mas no borre.
//
// "Quitar" esta antes de las dos y es la unica que le aparece a una fila
// equipada: como esa fila no esta en items[], no puede tirar ni volver a
// equiparse (ver actionFor). El nombre del item sigue siendo el mismo en los
// dos menus —la lista no cambia, cambia que comandos tiene— asi que no hace
// falta un menu distinto para equipped.
//
// El comando de cada accion lo decide actionFor(), que ya estaba: la pagina no
// inventa el payload, arma el que el modulo valida. Agregar una accion que no
// pase por actionFor es posible —basta un run() propio— pero entonces el
// modulo tiene que saber leerla del otro lado.
const ACCIONES = [
  {
    id: "unequip",
    label: (r) => (r.ranura === "cinturon" ? "Quitar del cinturón" : "Quitar"),
    aplica: (r) => !!actionFor(r, "unequip")
  },
  {
    id: "drop",
    label: "Tirar",
    sep: true,
    aplica: (r) => !!actionFor(r, "drop")
  },
  {
    id: "equip",
    label: (r) => (r.cat === "magazine" ? "Cinturón" : "Equipar"),
    sep: true,
    aplica: (r) => !!actionFor(r, "equip")
  }
];

// Dispara una accion sobre una fila. Devuelve true si llego a mandarse.
// Las acciones con id propio (las que no pasan por actionFor) se enchufan aca.
//
// El feedback del exito es el item que desaparece de la lista: el snapshot
// vuelve sin el y la tabla se redibuja sola. No hay aviso en pantalla —no quedo
// ningun toast en el DOM— y el resultado va a _diag, que es console.
function runAccion(id, r) {
  if (!r) {
    _diag(id + ": no hay fila");
    return false;
  }
  const payload = actionFor(r, id);
  if (!payload) {
    _diag(id + ": " + r.name + " no admite esa accion");
    return false;
  }
  const ok = emitCommand(payload);
  _diag(
    ok
      ? etiquetaDe(id, r) + ": " + r.name + " — enviada"
      : etiquetaDe(id, r) + ": " + r.name + " — el mod no la tomó"
  );
  return ok;
}

function etiquetaDe(id, r) {
  const a = ACCIONES.find((x) => x.id === id);
  if (!a) return id;
  return typeof a.label === "function" ? a.label(r) : a.label;
}

// El browser NUNCA se cierra. La pagina se oculta y se muestra por classe, asi
// que el DOM sigue vivo, los listeners siguen atados y el pump de la ASI sigue
// corriendo aunque no haya nada visible.
//
// Mostrar no necesita nada: el panel sale de display:none y la animacion de
// entrada se re-dispara sola. Ocultar si: .hidden es display:none, asi que si se
// pusiera de una, el panel se borra en un frame y no hay salida que ver. Por eso
// primero se marca .panel--closing, que corre fadeOut, y recien ahi se esconde.
var _closeTimer = null;
// El primer setPanelVisible() es el estado inicial (abajo, al final del script).
// Ese no anima: si animara, el panel se veria aparecer y desvanecerse en los
// primeros frames, que es justo el flash que la llamada inicial evita.
var _panelInit = false;

// La duracion sale de --dur-slow, no escrita aca: si el CSS la cambia, el
// timeout sigue a la animacion sin que haya que tocar los dos.
function panelAnimMs() {
  var raw = getComputedStyle(panelEl).getPropertyValue("--dur-slow");
  var ms = parseFloat(raw) * (raw.indexOf("ms") >= 0 ? 1 : 1000);
  return ms > 0 ? ms : 200;
}

function setPanelVisible(visible) {
  if (_closeTimer !== null) {
    clearTimeout(_closeTimer);
    _closeTimer = null;
  }

  if (!_panelInit) {
    _panelInit = true;
    panelEl.classList.toggle("hidden", !visible);
    return;
  }

  if (visible) {
    // Las dos clases en un solo remove: el panel vuelve a ser visible en un
    // paso, asi que la entrada arranca en el frame mismo. Si se sacara
    // .hidden primero y .panel--closing despues, la de salida corria un frame
    // en el aire y el panel titilaba al abrir.
    panelEl.classList.remove("hidden", "panel--closing");
    return;
  }

  // Si ya esta cerrandose o ya esta oculto no hay nada que hacer: reiniciar el
  // timeout en cada llamada solo alargaria la espera.
  if (panelEl.classList.contains("hidden") || panelEl.classList.contains("panel--closing")) {
    return;
  }

  panelEl.classList.add("panel--closing");
  _closeTimer = setTimeout(function () {
    _closeTimer = null;
    panelEl.classList.remove("panel--closing");
    panelEl.classList.add("hidden");
  }, panelAnimMs());
}

// ------------------------------------------------------------------ RENDER --
//
// Un solo sistema de fila: la tabla. El que existedia para listas con barra
// (.row + .meter) se fue con los placeholders de Propiedades/Vehiculos, que
// eran su unico consumidor. Si esos paneles vuelven y necesitan una barra, el
// patron a copiar es renderTable() + buildTableRow().

// Celda numerica. Un dato ausente se dibuja como guion y no como celda vacia:
// si la celda desapareciera, la columna dejaria de leerse como columna.
function cell(text) {
  const c = document.createElement("span");
  c.className = text == null ? "table__num table__num--none" : "table__num";
  c.textContent = text == null ? "—" : text;
  return c;
}

// La columna Cantidad es "cuanto hay", no "municion". Un cargador y un arma
// muestran sus balas —14/17, 18/30— y un material apilado muestra el apilado:
// 5 en "Chatarra x5". Lo que no tiene ninguna de las dos cosas muestra guion.
//
// Municion va primera a proposito: si un cargador llegara con qty>1 por lo que
// sea, sus balas siguen siendo el dato mas util de esa fila y el apilado es
// secundario.
//
// El "14/17" sale de ammoCell() en gsis_InventorySerialization.js, que para un cargador usa el
// cargador del arma equivalente (getClipSizeByItemId saca el prefijo mag_) y
// para un arma usa su cargador contra el tope del arma. O sea que la columna no
// arma nada: solo muestra el dato que ya viene.
function celdaCantidad(r) {
  if (r.ammo != null) return r.ammo;
  const q = Number(r.qty) > 1 ? Number(r.qty) : null;
  return q;
}

// Salud 0..100. La manda el mod en cada fila (`salud` en itemRow,
// modules/gsis_ItemRow.js) y la celda no inventa nada: sin dato, 100.
//
// El fallback a 100 no es un placeholder, es el default del dato: TODO item
// nace a SALUD_MAX (data/gsis_item_data.js), y una fila sin `salud` es una fila
// vieja o un contenedor que todavia no la trae, no un item sin salud. Por eso
// el clamp va en la celda igual —una fila con 130 o con -4 de un save editado se
// pinta como 100% o 0% y no rompe la columna— y no solo en el mod: la celda es
// el ultimo lugar por el que pasa el dato y el que ve el jugador.
//
// La firma es (fila) como el resto de las celdas: la grilla pasa la fila, y una
// celda que espera un numero recibe el objeto entero y sale "NaN%".
const SALUD_MAX = 100;
function celdaSalud(r) {
  const v = r.salud == null ? SALUD_MAX : r.salud;
  return Math.max(0, Math.min(SALUD_MAX, v)) + "%";
}

function celdaPeso(r) {
  return r.weight != null ? r.weight.toFixed(1) : null;
}

// Dinero con el formato del juego: $ y punto de miles, sin decimales — "$1.500".
// Es la MISMA regla con la que el mod arma el pie (DLR_DIN/DLR_TOT en
// gsis_FlowSerialization.js), asi que una cifra de la tabla y la del pie se
// leen como el mismo numero y no como dos sistemas distintos ($1500 contra
// $1.440, que era como quedaban antes).
//
// No va por toLocaleString: la pagina corre en Chrome (preview) y en el CEF del
// juego, y si cada runtime resolviera una cultura distinta, las dos mitades del
// menu podrian divergir un dia sin codigo nuevo en el medio.
function fmtDinero(n) {
  if (n == null) return null;
  return "$" + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Saldo de CJ tal como lo escribio el mod en el pie ("Tu dinero: $4.200"), o
// null si no hay pie o no trae cifra. El parseo va por el TEXTO y no por un
// campo aparte del snapshot porque el pie ya ES el contrato: si un dia cambia
// la frase, lo unico que tiene que seguir cierto es la cifra con $, y esta
// regex es la que la busca. La usa el estado del pie del carrito (renderPie):
// saldo contra total para pintar el total en rojo.
//
// Toda cifra que salga del pie pasa por aca: izq (saldo), der (total) o lo que
// se agregue despues.
function parseDinero(texto) {
  const m = /\$\s*([\d.]+)/.exec(texto || "");
  if (!m) return null;
  const n = parseInt(m[1].replace(/\./g, ""), 10);
  return isNaN(n) ? null : n;
}

function celdaValor(r) {
  return r.value != null ? fmtDinero(r.value) : null;
}

// Las dos primeras columnas de toda tabla son estructurales y el resto son
// datos, asi que se arman aparte: el recorrido de buildTableRow es generico y lo
// que cambia por pantalla es la lista de columnas, no el codigo de la fila.
//
// El slot vacio mantiene la columna alineada cuando el item no tiene icono
// (body_armor es el unico hoy) en vez de correr todo a la izquierda.
function iconCell(r) {
  if (!r.icon) {
    const slot = document.createElement("div");
    slot.className = "table__icon-slot";
    return slot;
  }
  const img = document.createElement("img");
  img.className = "table__icon";
  img.src = ICON_DIR + r.icon;
  img.alt = "";
  return img;
}

// El nombre va dentro de un wrapper porque le agregamos la marca de
// "Equipado" al lado. Si los dos estuvieran en la misma celda con ellipsis, el
// nombre largo se comeria la marca o la marca quedaria cortada; con el
// wrapper el nombre es lo que se encoge y la marca nunca se recorta.
function nameCell(r) {
  const nameWrap = document.createElement("span");
  nameWrap.className = "table__namewrap";

  const name = document.createElement("span");
  name.className = "table__name";
  // La cantidad apilada se escribe aca y no en la fila que manda el mod: es
  // presentacion, y decidirla en el render es lo que hace que el inventario y
  // los cuatro menus de proximidad la escriban igual aunque el emisor no se
  // acuerde. Antes se horneaba en snapRow(), que es el camino del inventario
  // nomas, y en el baul un "Chatarra" salia sin el x5 de la mochila.
  name.textContent = (r.qty || 1) > 1 ? r.name + " x" + r.qty : r.name;
  nameWrap.appendChild(name);

  if (r.equipado) {
    const tag = document.createElement("span");
    tag.className = "table__equipped";
    tag.textContent = r.ranura === "cinturon" ? "(Cinturón)" : "(Equipado)";
    nameWrap.appendChild(tag);
  }
  return nameWrap;
}

// Una fila. cols es la lista de columnas de la pantalla: cada entrada dice si es
// la del icono (kind "icon"), la del nombre (kind "name") o una celda de dato
// (cell). Las tres cosas mantienen el mismo orden que el DOM y que
// --table-cols en el CSS, asi que la grilla no puede descuadrarse.
//
// paneIdx viaja hasta el click para que seleccionar sepa de que lista viene la
// fila: con el baul hay dos en pantalla.
function buildTableRow(r, cols, vista, paneIdx) {
  const el = document.createElement("div");
  el.className = "table__row";
  el.setAttribute("role", "option");
  el.dataset.id = r.id;

  // Fila del catalogo que ya tiene unidades en el carrito: tinte de color
  // distinto al de la seleccion (ver .table__row--carrito) para que en la lista
  // larga se vea de un vistazo lo que ya esta elegido sin mirar el pane
  // derecho. Solo pane 0 —en el pane del carrito la fila YA es el carrito— y
  // solo con enCarrito > 0, que es el campo que el mod manda en el snapshot.
  if (paneIdx === 0 && r.enCarrito > 0) {
    el.classList.add("table__row--carrito");
  }

  for (const col of cols) {
    if (col.kind === "icon") {
      el.appendChild(iconCell(r));
    } else if (col.kind === "name") {
      const wrap = nameCell(r);
      // El chip "(2 en carrito)" va en el mismo wrapper que la marca de
      // equipado: flex, no se corta con ellipsis (recorta solo .table__name) y
      // el parentesis va en el texto para que se lea pegado a la palabra.
      if (paneIdx === 0 && r.enCarrito > 0) {
        const chip = document.createElement("span");
        chip.className = "table__carrito";
        chip.textContent = "(" + r.enCarrito + " en carrito)";
        wrap.appendChild(chip);
      }
      el.appendChild(wrap);
    } else {
      const c = cell(col.cell(r));
      // Jerarquia entre columnas de la misma fila: "suave" baja la cifra de
      // referencia (lo que vale despues) y "fuerte" sube la que decide la
      // compra (lo que se paga). Sin esto las dos van juntas del mismo peso y
      // el jugador tiene que adivinar cual es el precio.
      if (col.suave) c.classList.add("table__num--suave");
      if (col.fuerte) c.classList.add("table__num--fuerte");
      el.appendChild(c);
    }
  }

  if (r.tip) {
    el.title = r.tip;
  }

  el.addEventListener("click", () => {
    // El indice se busca en la vista que se esta mostrando, no en el estado
    // entero: es lo que el jugador esta viendo. Con el filtro en "todos"
    // coinciden; con un filtro puesto, buscar en el estado daria un numero que no
    // corresponde a lo que toco, y la seleccion caeria en otra fila.
    const idx = vista.indexOf(r);
    if (idx !== -1) {
      selectRow(idx, paneIdx);
    }
  });

  // Doble click = la accion principal, con cantidad 1. Es el gesto con que se
  // mueve un archivo de una carpeta a otra, y hasta ahora no existia: mover algo
  // con el mouse obligaba a buscar un boton del pie.
  //
  // El click simple de antes ya selecciono la fila, asi que si era otra el
  // doble click mueve UNA unidad de lo que acaba de elegir. Para mandar la pila
  // entera esta Mayús+Enter.
  //
  // Sin flujo abierto no hay accion principal (es el inventario), y ahi el doble
  // click no hace nada, igual que hoy.
  el.addEventListener("dblclick", () => {
    const idx = vista.indexOf(r);
    if (idx === -1) return;
    selectRow(idx, paneIdx);
    const cfg = cfgDe(pantallaActual());
    if (cfg) correrPrincipal(cfg);
  });

  r.el = el;
  return el;
}

// Una columna de la tabla. El orden de la lista tiene que calcar el de
// --table-cols en el CSS, porque las dos cosas definen la misma grilla.
//
//   kind      "icon" o "name": las dos columnas estructurales, las arma
//             iconCell() / nameCell(). Sin kind, es una celda de dato.
//   text/icon lo que dice la cabecera. La regla de la casa: las columnas que
//             vienen del inventario van con icono —el nombre viaja en el
//             <title> y el aria-label del SVG— y las propias de una pantalla
//             van con PALABRA, porque los cuatro iconos ya estan ocupados.
//             Una palabra en columna de datos lleva .table__headtext.
//   cell      (fila) => texto, o null si la celda va vacia (sale como guion).
//   suave     la cifra de referencia baja a muted (ver buildTableRow).
//   fuerte    la cifra que decide la compra va en bold. Las dos son opcionales
//             y van juntas en las filas donde hay DOS precios que comparar
//             (armeria: reventa contra precio de compra).
//
// El inventario es una lista de 6 y es la BASE de las otras: armeria, trueque y
// retiro declaran las mismas celdas con el mismo cell() y le suman o le quitan
// lo suyo, y el render es el mismo para las cuatro. Por eso esta lista es un
// dato y no un switch. Ver cada pantalla en PANTALLAS.
const COLS_INVENTARIO = [
  { kind: "icon" },
  { kind: "name", text: "Objeto" },
  { text: "Cant", icon: "cant", cell: celdaCantidad },
  { text: "Salud", icon: "salud", cell: celdaSalud },
  { text: "Peso", icon: "peso", cell: celdaPeso },
  { text: "Valor", icon: "valor", cell: celdaValor }
];

// Iconos de la cabecera. Van INLINE, no como <img>, por dos razones que en este
// runtime se aprendieron a la fuerza:
//
//   1. Un <img> de .svg no se puede colorear con CSS: el fill esta escrito
//      adentro del archivo y los cuatro venían en #e3e3e3, un gris que no es
//      ninguno de los tokens. Arreglarlo con mask-image funcionaba, pero la
//      mascara mete al elemento en su propia capa de compositing y el runtime
//      de SAWebUI repinta por rectas sucias (SAWebUICef.log: "rects=1.0"): a la
//      primera repintada parcial la capa dejaba de pintarse y los cuatro
//      iconos desaparecian. Inline no tiene capa propia.
//
//   2. Inline el color lo hereda del encabezado (fill: currentColor) y no
//      depende de que un archivo externo llegue a cargar.
//
// El costo es que el path vive tambien en assets/iconos/*.svg. Ese .svg es la
// fuente del dibujo y el ICONS de aca es la copia que se dibuja: si cambias un
// icono, cambias los dos. Todos comparten el mismo viewBox, la grilla de 24px
// de Material Symbols con el eje y corrido.
const HEAD_ICONS = {
  cant: "M440-91v-366L120-642v321q0 22 10.5 40t29.5 29L440-91Zm80 0 280-161q19-11 29.5-29t10.5-40v-321L520-457v366Zm159-550 118-69-277-159q-19-11-40-11t-40 11l-79 45 318 183ZM480-526l119-68-317-184-120 69 318 183Z",
  salud: "M481-83Q347-218 267.5-301t-121-138q-41.5-55-54-94T80-620q0-92 64-156t156-64q45 0 87 16.5t75 47.5l-62 216h120l-34 335 114-375H480l71-212q25-14 52.5-21t56.5-7q92 0 156 64t64 156q0 48-13 88t-55 95.5q-42 55.5-121 138T481-83Z",
  peso: "M480-680q17 0 28.5-11.5T520-720q0-17-11.5-28.5T480-760q-17 0-28.5 11.5T440-720q0 17 11.5 28.5T480-680Zm113 0h70q30 0 52 20t27 49l57 400q5 36-18.5 63.5T720-120H240q-37 0-60.5-27.5T161-211l57-400q5-29 27-49t52-20h70q-3-10-5-19.5t-2-20.5q0-50 35-85t85-35q50 0 85 35t35 85q0 11-2 20.5t-5 19.5Z",
  valor: "M120-160q-33 0-56.5-23.5T40-240v-440h80v440h680v80H120Zm160-160q-33 0-56.5-23.5T200-400v-320q0-33 23.5-56.5T280-800h560q33 0 56.5 23.5T920-720v320q0 33-23.5 56.5T840-320H280Zm80-80q0-33-23.5-56.5T280-480v80h80Zm400 0h80v-80q-33 0-56.5 23.5T760-400Zm-200-40q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35ZM280-640q33 0 56.5-23.5T360-720h-80v80Zm560 0v-80h-80q0 33 23.5 56.5T840-640Z"
};

const SVG_NS = "http://www.w3.org/2000/svg";

// createElementNS y no createElement: sin el namespace SVG el <path> no se
// dibuja. El <title> es el tooltip — aria-label no lo da — y aria-label es lo
// que lee el lector de pantalla, porque el nombre de la columna ya no esta
// escrito en ningun lado de la celda.
function headIcon(name, label) {
  const svg = document.createElementNS(SVG_NS, "svg");
  // className en un elemento de SVG es SVGAnimatedString, no una string: hay
  // que pasarlo por setAttribute o el selector .table__headicon no matchea.
  svg.setAttribute("class", "table__headicon");
  svg.setAttribute("viewBox", "0 -960 960 960");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = label;
  svg.appendChild(title);

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", HEAD_ICONS[name]);
  svg.appendChild(path);

  return svg;
}

// Las bandas salen de una lista: la del catalogo mas, al final, los cats que
// tengan filas y no esten en ella. Catalogo primero porque es el que trae el
// orden y el nombre—"Armas" sale de ahi, no del cat— y despues la cola, que se
// sola se completa si el catalogo no cubrio algo.
function bandasDe(rows) {
  const cats = catalog.cats.slice();
  const vistos = new Set(cats.map((c) => c.key));
  for (const r of rows) {
    if (vistos.has(r.cat)) continue;
    vistos.add(r.cat);
    cats.push({ key: r.cat, label: r.cat || "Sin categoría" });
  }
  return cats;
}

// El teclado navega por la vista, y la vista tiene que estar en el mismo orden
// en que se dibujan las filas. Sin esto la seleccion va a saltos: el mod manda
// las filas en el orden del snapshot y la tabla las reagrupa por banda, asi que
// viewFiltrada[2] podia ser la tercera fila dibujada o la ultima de la pantalla.
//
// El desempate es la posicion original, asi que dentro de una banda el orden es el
// que mando el mod y no el que impone el sort. Las bandas vacias no entran en el
// mapa y caen al final: no se dibujan, asi que tampoco hay que recorrerlas.
function ordenarPorBanda(rows) {
  const orden = new Map();
  bandasDe(rows).forEach((c, i) => orden.set(c.key, i));
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ba = orden.has(a.r.cat) ? orden.get(a.r.cat) : 999;
      const bb = orden.has(b.r.cat) ? orden.get(b.r.cat) : 999;
      return ba !== bb ? ba - bb : a.i - b.i;
    })
    .map((x) => x.r);
}

// Tabla KCD: cabecera, y despues una banda por categoria con sus filas debajo.
// El orden de las bandas sale de bandasDe(), no del orden del array, asi las
// filas quedan agrupadas aunque el mod las mande mezcladas.
//
// El modificador .table--N sale del numero de columnas: es el mismo numero que
// --table-cols declara en el CSS, asi que la variante y la grilla no pueden
// desincronizarse. El .table pelado deja la de 6, que es la del inventario.
//
// El render vive en renderTablaEn(), que dibuja en cualquier caja. Aca solo se
// pasa la del inventario: las pantallas de flujo pasan la de su pane.
function renderTable(rows, cols) {
  renderTablaEn(rowsBox, cols, rows, undefined);
}

// Estado vacio de una pestana. No es lo mismo "no hay nada" que "todavia no
// esta implementado": el primero se resuelve solo, el segundo hay que decirlo,
// o el jugador cree que perdio sus cosas.
function renderEmpty(text) {
  const el = document.createElement("p");
  el.className = "empty";
  el.textContent = text;
  rowsBox.appendChild(el);
}

// El peso es el dato del pie. Antes solo se dibujaba en la pestana de inventario
// y se vaciaba en las otras dos; con filtros hay un solo listado, asi que el
// peso esta siempre. No cambia al cambiar de filtro: el filtro recorta que filas
// se ven, no cuanto pesa el inventario entero.
function renderWeight() {
  if (!weightEl) return;
  weightEl.textContent = "Peso: " + invWeight.toFixed(1) + "kg/" + maxWeight + "kg";
}

function renderFiltro(filterKey) {
  filtroActualKey = filtroKeyDe(
    FILTROS.find((f) => filtroKeyDe(f) === filterKey) || FILTROS[0]
  );
  const filtro = filtroActual();

  rowsBox.innerHTML = "";

  // El menu se cierra antes de rearmaar. Guardaba una referencia a una fila, y
  // un snapshot del mod cada 400ms rearma la tabla entera: si el menu quedara
  // abierto apuntando a una fila que ya no esta en el DOM, la accion caeria
  // sobre un objeto que nadie ve. Un renglon de "Sin acciones" tampoco: la
  // fila sigue existiendo en el estado, solo se dibudo distinto.
  cerrarCtxMenu();

  // El filtro no borra filas de stateMap: es una proyeccion. Asi el .el de cada
  // fila sigue siendo el mismo objeto y cambiar de filtro y volver no pierde
  // nada. Se ordena por banda para que la vista siga el orden dibujado (ver
  // ordenarPorBanda).
  const rows = ordenarPorBanda(stateMap.filter((r) => pasaFiltro(r, filtro)));
  viewFiltrada = rows;

  // El titulo quedo fijo en Inventario: antes seguia a la pestana y con filtros
  // no hay a que seguir. El filtro activo ya se ve en el boton marcado.
  if (titleEl) titleEl.textContent = "Inventario";
  renderWeight();

  if (rows.length === 0) {
    renderEmpty(filtro.empty);
  } else {
    renderTable(rows, COLS_INVENTARIO);
  }

  // Por data-filter y no por la classe: el selector queda estable aunque la
  // receta .btn cambie de nombre o las variantes se reorganicen.
  const btns = tabsBox.querySelectorAll("[data-filter]");
  btns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filtroActualKey);
  });

  selectRow(0);
}

// La seleccion vive UNA: es un indice sobre la vista que se esta mirando. Con el
// baul hay dos listas en pantalla, asi que "la vista" es la del pane activo y la
// otra se dibuja sin marcar. Sin esto habria que tener un selectedIndex por
// lista y dos clases de seleccion traveling por el DOM.
//
// paneIdx: undefined = el inventario, 0/1 = el pane de un flujo. Se pasa en vez
// de deducirse porque el click puede venir de cualquiera de las dos tablas.
function vistaDe(paneIdx) {
  const p = paneIdx === undefined ? _selPane : paneIdx;
  return p === null ? viewFiltrada : _vistasPane[p] || [];
}

// Que pane tiene la seleccion, o null si es la del inventario. Lo usa el teclado
// para no tener que acordarse de en que pantalla estamos.
let _selPane = null;
// Las filas de cada pane del flujo, en orden de dibujo (ver ordenarPorBanda).
const _vistasPane = [[], []];

// La clase de seleccion se borra de las tres listas antes de_apply_: si no, al
// cambiar de pane el elegido del otro lado se queda marcado y hay dos filas
// iluminadas en dos tablas distintas.
function limpiarSeleccion() {
  for (const v of [viewFiltrada, _vistasPane[0], _vistasPane[1]]) {
    for (const r of v) {
      if (!r.el) continue;
      r.el.classList.remove("table__row--selected");
      r.el.setAttribute("aria-selected", "false");
    }
  }
}

function selectRow(index, paneIdx) {
  const p = paneIdx === undefined ? _selPane : paneIdx;
  const vista = vistaDe(p);
  if (vista.length === 0) return;

  limpiarSeleccion();
  _selPane = p;
  selectedIndex = (index + vista.length) % vista.length;
  for (const [i, r] of vista.entries()) {
    if (!r.el) continue;
    // El estado de seleccion va como clase propia y no como descendiente, asi
    // la especificidad queda en una sola clase y el orden de la hoja deja de
    // importar.
    r.el.classList.toggle("table__row--selected", i === selectedIndex);
    r.el.setAttribute("aria-selected", i === selectedIndex ? "true" : "false");
  }

  // La fila seleccionada tiene que estar a la vista. #rows y .pane__rows son las
  // cajas con scroll (overflow-y: auto) y cambiar la clase no las mueve: con mas
  // items de los que entran, las flechas bajaban la seleccion fuera de la
  // pantalla sin que nada se enterara, y el jugador perdia de vista que fila
  // era. Con el mouse el scroll venia del evento wheel, pero el teclado no lo
  // acompanaba.
  const sel = vista[selectedIndex];
  if (sel && sel.el) {
    sel.el.scrollIntoView({ block: "nearest" });
  }

  trasSeleccionar(sel);
}

// Todo lo que tiene que cambiar cuando cambia la fila elegida, en un solo lado.
// Antes vivia repartido: la marca se ponia en selectRow() y cada camino
// redibujaba una parte, asi que un click en la otra lista cambiaba la fila sin
// cambiar de lista - el canal decia "Guardar en maletero" sobre un item que ya
// estaba en el maletero y el mod lo rechazaba.
//
// selectRow() es el unico camino a esto, asi que las tres cosas (fila, lista,
// pie) no pueden desincronizarse: las flechas, el Home/End, el PageDown, el
// click y el cambio de lista pasan por aca.
function trasSeleccionar(r) {
  const id = pantallaActual();
  if (!id) return;                        // inventario: no hay panes
  const cfg = cfgDe(id);
  if (!cfg) return;
  const p = panelDe(id);
  const panes = (flowData && flowData.panes) || [];

  // La lista activa ES la de la seleccion. Antes las dos se manejaban por
  // separado (paneActual solo con las flechas, _selPane con el click) y con el
  // click en la otra lista quedaban apuntando a lados distintos: el boton y el
  // comando leen paneActual, o sea que mentian. Aqui _selPane manda y
  // paneActual lo sigue.
  if (panes.length > 1 && paneActual !== _selPane && _selPane !== null) {
    paneActual = _selPane;
    marcarPaneActivo(p);
    // El pie declara verbos por lista (Enter: Agregar/Quitar) y mas adelante
    // estados por lista (botones del carrito): se redibuja con cada lista.
    renderPie(p, cfg, flowData);
  }

  renderPeso(p);
  sincronizarCanal(p);
}

// El pane que esta mirando se marca con el mismo criterio que la fila: estado en
// el elemento, sin volver a dibujar las listas (redibujar en cada click tiraria
// el scroll y re-renderizaria las dos tablas por un cambio de color).
function marcarPaneActivo(p) {
  const cajas = (p.paneEls || []).length
    ? p.paneEls
    : Array.prototype.slice.call(p.panes.children);
  for (let i = 0; i < cajas.length; i++) {
    if (cajas[i] && cajas[i].classList) {
      cajas[i].classList.toggle("pane--activo", i === paneActual);
    }
  }
}

function stepRow(dir) {
  selectRow(selectedIndex + dir);
}

function cambiarFiltro(dir) {
  const curIdx = FILTROS.findIndex((f) => filtroKeyDe(f) === filtroActualKey);
  const nextIdx = (curIdx + dir + FILTROS.length) % FILTROS.length;
  renderFiltro(filtroKeyDe(FILTROS[nextIdx]));
}

// ============================================================================
// PANTALLAS DE FLUJO - baul, armeria, retiro, trueque
// ============================================================================
//
// Los cuatro menus de proximidad son el mismo panel con otra funcion: la misma
// tabla, el mismo pie, la misma navegacion. Lo que cambia es QUE muestran, y eso
// esta entero en PANTALLAS, abajo. Esta seccion es el machinery: un panel por
// pantalla y un render generico.
//
// Por que un panel por pantalla y no uno que cambia de contenido: cada uno es
// una ventana propia con su propio ciclo de vida, y separarlos hace que un
// error en uno no pueda dejar en blanco al otro. Los cuatro se arman con la misma
// fabrica (crearPanel), asi que el esqueleto esta escrito una sola vez.
//
// El panel del inventario (#panel) no entra en este sistema: tiene filtros de
// categoria y su propio canal. Lo que comparte con estos es la tabla, y esa ya
// era generica antes de que existiera ninguno.

let flowData = null;
let paneActual = 0;
// Los paneles se arman una vez y se muestran y ocultan por clase, igual que
// #panel. El mapa es la unica forma de llegar a ellos.
const _paneles = {};

// Que pantalla se esta mostrando ahora: "" es el inventario, o el id del flujo.
function pantallaActual() {
  return uiState.flow || "";
}

function cfgDe(id) {
  return PANTALLAS[id] || null;
}

function panelDe(id) {
  if (!_paneles[id]) {
    _paneles[id] = crearPanel(id);
  }
  return _paneles[id];
}

// El esqueleto de un panel de flujo. Se arma con createElement y no en el
// index.html por la misma razon que las filas: si el esqueleto viviera en el
// HTML habria que escribirlo cuatro veces y las cuatro copias divergen — que es
// lo que le paso al mapa de iconos cuando vivia en app.js.
function crearPanel(id) {
  const cfg = PANTALLAS[id] || {};
  const sec = document.createElement("section");
  sec.className = "panel panel--flujo hidden";
  // El ancho central es declarativo: PANTALLAS.<id>.centro. Hoy lo pide el
  // baul, por sus dos listas a lo ancho; la armeria tambien es de a dos listas
  // pero va apilada al borde izquierdo (flag apilado, ver renderPanes) porque en
  // un panel angosto las columnas dejaban los nombres sin lugar. La clase
  // decide tamano y posicion (style.css) y la regla sigue siendo una sola.
  if (cfg.centro) sec.classList.add("panel--centro");
  // El titulo de cada lista vive en la cabecera de la tabla (crearPane) y el
  // acento de la lista activa va a esa celda: la clase es lo que le dice el CSS
  // a quien teñir, misma idea que panel--centro.
  if (cfg.tituloEnCabecera) sec.classList.add("panel--titcab");
  sec.id = "pnl-" + id;

  const head = document.createElement("div");
  // El subtitulo central —el nombre del auto, "CJ", "Emmet"— va en la linea del
  // titulo cuando es un dato que identifica, y en su propia linea cuando es una
  // frase larga (trueque, retiro).
  //
  // La condicion se lee de los FLAGS de PANTALLAS (centro, linea) y no se
  // repite como `id === "trunk"`: la clase nace de ahi, y con dos comparaciones
  // separadas el dia que una pantalla se sume a una de las dos se puede sumar a
  // una y no a la otra.
  const enLinea = sec.classList.contains("panel--centro") || !!cfg.linea;
  head.className = "panel-header" + (enLinea ? " panel-header--linea" : "");
  const titulo = document.createElement("h1");
  titulo.className = "panel__title";
  const subtitulo = document.createElement("p");
  subtitulo.className = "panel__subtitle";
  head.appendChild(titulo);
  head.appendChild(subtitulo);

  // Donde van los panes. La clase --2 no se pone aca: renderPanes() la decide
  // con el largo del snapshot, que es el unico lugar que sabe cuantas listas
  // trae esta vez (y la cambia si el mod manda otra cantidad).
  const panes = document.createElement("div");
  panes.className = "flow__panes";

  const aviso = document.createElement("p");
  aviso.className = "aviso hidden";

  const foot = document.createElement("div");
  foot.className = "panel-foot";
  const pieIzq = document.createElement("span");
  pieIzq.className = "panel-foot__txt";
  const pieDer = document.createElement("span");
  pieDer.className = "panel-foot__txt";
  const footBtns = document.createElement("div");
  footBtns.className = "panel-foot__btns";
  foot.appendChild(pieIzq);
  foot.appendChild(pieDer);
  foot.appendChild(footBtns);

  sec.appendChild(head);
  sec.appendChild(panes);
  sec.appendChild(aviso);
  sec.appendChild(foot);
  document.body.appendChild(sec);

  return { sec, titulo, subtitulo, panes, aviso, pieIzq, pieDer, footBtns, _avisoTimer: null };
}

// Muestra una pantalla y oculta la otra. El inventario se apaga cuando hay un
// flujo: son dos paneles compitiendo por el mismo lugar y el flujo manda,
// porque se abrio por proximidad y el inventario por una tecla.
//
// REGLA 1: aca NO se decide la visibilidad de #panel. Ese cambio es de
// setPanelVisible(), que la hace con setPanelVisible(uiState.menu) en este mismo
// handler y es la unica que puede apagarlo.
//
// Antes esta funcion hacia las dos cosas, con panelEl.classList.toggle("hidden",
// !!id). Con id "" eso es toggle("hidden", false), que es QUITAR la clase: al
// cerrarse un menu de proximidad encendia el panel del inventario. Y no lo
// tapaba nadie despues, porque setPanelVisible(false) sale temprano sin programar
// temporizador cuando el panel ya estaba oculto — que es justo el estado en que
// estaba. El sintoma era el inventario abierto solo al alejarse de una esfera, con
// los datos viejos o sin datos, y para cerrarlo habia que apretar I.
//
// Ahora: con flujo se apaga #panel (el flujo es un HERMANO suyo, no un hijo, asi
// que hay que apagarlo explicitamente) y sin flujo no se toca, porque su
// visibilidad ya la decidio setPanelVisible con el menu.
function setPantalla(id) {
  // El panel se arma antes del loop que muestra y oculta: si se creara despues,
  // el loop no lo veria y el panel nuevo se quedaria con el "hidden" con que
  // nacio, invisible aunque le tocara estar en pantalla.
  if (id) panelDe(id);

  if (id) {
    panelEl.classList.add("hidden");
  }
  for (const otro of Object.keys(_paneles)) {
    _paneles[otro].sec.classList.toggle("hidden", otro !== id);
  }
  if (id) {
    panelDe(id).sec.classList.remove("panel--closing");
    // Las vistas de los panes se vacian al entrar. Sin esto, la seleccion del
    // inventario queda viva adentro del flujo y el Enter manda un comando de
    // flujo para una fila que no se esta viendo: el snapshot del flujo todavia
    // no llego y ya se puede actuar sobre el.
    _vistasPane[0] = [];
    _vistasPane[1] = [];
    _selPane = 0;
    // La lista activa tambien arranca en la primera. paneActual sobrevive
    // entre flujos (se declara una sola vez) y el reset implicito era el clamp
    // de renderFlujo — paneActual >= panes.length—, que con listas de una sola
    // columna siempre cumplia. Con DOS pantallas de dos listas dejaba al
    // jugador entrando a la armeria parado en el carrito por haber salido del
    // baul en el maletero.
    paneActual = 0;
  }
  if (!id) {
    // La seleccion vuelve a ser la del inventario. Sin esto, al cerrarse un
    // flujo el teclado moveria el indice de una lista que ya no esta en pantalla
    // y la primera flecha saltaria a una fila rara.
    _selPane = null;
  }
}

// El baul trae el titulo ya armado por el mod (TRK_TTL): "Maletero Vehiculo -
// Infernus (411)" en español y "Trunk - Infernus (411)" en ingles. Se parte en
// dos para que el titulo diga SOLO el menu y el subtitulo el nombre del auto.
//
// El modelo se descarta entre parentesis a proposito: "411" es el id interno del
// vehículo, no algo que el jugador tenga que leer, y el nombre solo ("Infernus")
// es lo que sirve para reconocer el auto. Ver renderFlujo().
function partirTituloBaul(titulo) {
  const t = String(titulo || "");
  const corte = t.indexOf(" - ");
  if (corte < 0) return { menu: t, auto: "" };
  return {
    menu: t.slice(0, corte).trim(),
    auto: t.slice(corte + 3).replace(/\s*\(\d+\)\s*$/, "").trim()
  };
}

// El render del flujo. Se llama cuando llega "screen" y no en cada frame, porque
// la pagina no tiene loop: no hay RAF ni setInterval en el juego.
function renderFlujo() {
  const id = pantallaActual();
  if (!id) return;
  const cfg = cfgDe(id);
  const p = panelDe(id);
  if (!cfg || !flowData || flowData.id !== id) {
    // Todavia no llego el snapshot del flujo. Se dibuja el esqueleto sin datos
    // en vez de nada: un panel vacio se lee como "cargando", uno que no aparece
    // se lee como broken.
    p.titulo.textContent = cfg ? cfg.titulo : id;
    p.subtitulo.textContent = "";
    return;
  }

  const bruto = flowData.titulo || cfg.titulo;
  if (id === "trunk") {
    // El baul es el unico menu que trae un vehiculo en el titulo, y es el unico
    // que se parte: el resto de las pantallas mandan el menu arriba y la segunda
    // linea (el vendedor, lo que busca el cliente, el pedido) abajo, tal cual
    // llego. La guia de teclas del baul ("3: cerrar | ESC...") ya no se muestra
    // en ninguna parte: el pie no anuncia teclas desde que se fueron los
    // keyhints.
    const { menu, auto } = partirTituloBaul(bruto);
    p.titulo.textContent = menu || cfg.titulo;
    p.subtitulo.textContent = auto;
  } else {
    p.titulo.textContent = bruto;
    p.subtitulo.textContent = flowData.subtitulo || "";
  }

  const panes = flowData.panes || [];
  if (paneActual >= panes.length) paneActual = 0;

  renderPanes(p, cfg);
  renderPie(p, cfg, flowData);

  // La seleccion arranca en la primera fila del pane activo. Sin esto, abrir el
  // baul dejaria las dos listas sin marcar.
  //
  // _selPane se fuerza al pane activo porque es el dueño de la seleccion: si
  // quedara apuntando al pane anterior, el Enter mandaria el comando sobre una
  // fila de la lista que el jugador ya no esta mirando.
  _selPane = paneActual;
  selectRow(selectedIndex);
  // selectRow() no hace nada si la lista activa esta vacia (caso: baul vacio),
  // y ahi el pie y los pesos tienen que redibujarse igual. Es idempotente,
  // doble llamada no importa.
  trasSeleccionar(selectedRow());

  if (flowData.notice) {
    mostrarAviso(p, flowData.notice);
  }
}

// Los panes de una pantalla. Con dos (el baul) se dibujan dos y, entre los dos,
// el canal con los botones de traslado; con uno, solo ese.
//
// Los elementos se guardan en p.paneEls: con el canal en el medio, los hijos de
// .flow__panes dejan de ser solo pane y cualquier "hijo numero i" leeria el
// boton. Ver cajaDeScroll().
function renderPanes(p, cfg) {
  p.panes.innerHTML = "";
  p.paneEls = [];
  const todos = (flowData && flowData.panes) || [];
  const conDos = todos.length > 1;
  for (let i = 0; i < todos.length; i++) {
    const box = crearPane(p, cfg, todos[i], i, i === paneActual);
    p.paneEls.push(box);
    p.panes.appendChild(box);
    if (conDos && i === 0) p.panes.appendChild(crearCanal(p, cfg));
  }
  p.panes.classList.toggle("flow__panes--2", conDos);
  // Apilado (armeria): las dos listas una debajo de la otra en un panel angosto
  // en vez de dos columnas en uno ancho. Sin apilado, --2 solo.
  p.panes.classList.toggle("flow__panes--apilado", conDos && !!cfg.apilado);
}

// El canal entre las dos listas del baul: los dos botones de traslado.
//
// El mouse tenia un solo objetivo - el boton de la barra, abajo a la derecha, al
// final de un panel de 100vh, lejos de la fila que se esta eligiendo-. Aca el
// control queda fisicamente entre las dos listas, que es por donde viaja el item.
//
// El boton que corresponde al lado que se esta mirando queda habilitado y el otro
// apagado (disabled): el sentido lo define la lista activa, no el boton, y dos
// botones vivos en los dos sentidos pedirian adivinar sobre que fila caeria cada
// uno. Para cambiar de lado esta la tecla ←→ o el click en la otra lista.
function crearCanal(p, cfg) {
  const box = document.createElement("div");
  box.className = "flow__xfer";
  for (const dir of [1, -1]) {
    const b = document.createElement("button");
    b.className = "flow__xfer-btn";
    b.type = "button";
    // La flecha sigue el layout: horizontal con las listas lado a lado (baul),
    // vertical con las apiladas (armeria), donde el segundo pane queda abajo.
    b.textContent = cfg.apilado
      ? (dir > 0 ? "↓" : "↑")
      : (dir > 0 ? "→" : "←");
    b.dataset.dir = String(dir);
    b.addEventListener("click", () => {
      const acc = (cfg.acciones || []).find((x) => x.principal);
      if (acc) correrAccion(acc, selectedRow());
    });
    box.appendChild(b);
  }
  p.canal = box;
  sincronizarCanal(p);
  return box;
}

// El estado de los dos botones: cual esta habilitado y que dice su title. Se
// re-evalua con cada cambio de seleccion (trasSeleccionar), porque el title sale
// del label de la accion, que depende del lado y de la fila.
function sincronizarCanal(p) {
  if (!p || !p.canal) return;
  const cfg = cfgDe(pantallaActual());
  const r = selectedRow();
  const acc = ((cfg && cfg.acciones) || []).find((x) => x.principal);
  const btns = p.canal.children;
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i];
    const dir = Number(b.dataset.dir);
    // dir es +1 para el boton que apunta a la derecha: le corresponde cuando la
    // lista activa es la izquierda (pane 0). Y al reves para el izquierdo.
    const activo = r && (dir > 0) === (paneActual === 0);
    b.disabled = !activo;
    // El title solo en el que se puede apretar: los dos comparten accion, y el
    // apagado diciendo "Guardar en maletero" mientras apunta para el otro lado es
    // un tooltip que miente.
    b.title = activo && acc && r ? String(acc.label(r, paneActual)) : "";
  }
}

// El peso de cada lista, con lo que va a quedar si se hace la transferencia que
// esta elegida. Los dos encabezados dicen lo mismo que antes y le agregan la
// proyeccion: "6.2/12 → 3.7kg" de un lado y "3.5/150 → 6.0kg" del otro.
//
// Es la respuesta a la pregunta que el panel no contestaba: mover esto, ¿entra?
// El lado que recibe se pone rojo con cuanto se pasa, y ahi el jugador decide
// antes de apretar y de leer el aviso rojo que llega despues.
//
// Es una estimacion de la pagina y no un chequeo: el snapshot tiene hasta 400ms
// y el que valida el peso es el mod (putInTrunk / takeFromTrunk). Por eso nunca
// se deshabilita el boton por este calculo, solo se pinta.
function renderPeso(p) {
  const panes = (flowData && flowData.panes) || [];
  if (panes.length < 2) return;          // sin traslado no hay "despues"
  const cajas = p.paneEls || [];
  const r = selectedRow();
  const delta = r && r.weight ? r.weight * qtyDe() : 0;

  for (let i = 0; i < cajas.length; i++) {
    const w = cajas[i].querySelector(".pane__peso");
    const pane = panes[i];
    if (!w || !pane || !pane.max) continue;

    // textContent limpia los hijos, asi la proyeccion no se acumula encima de la
    // de la seleccion anterior. La clase --bad va en el padre (es el estado de
    // la lista, no del texto) para que .pane__peso siga siendo uno por lista.
    w.textContent = pane.weight + "/" + pane.max + "kg";
    w.classList.remove("pane__peso--bad");
    if (!r || !(delta > 0)) continue;

    // El lado que se vacia nunca baja de 0: el snapshot puede ser inconsistente
    // (una fila que pesa mas que el total que declaro el mod) o tener hasta 400ms
    // de atraso, y "−1kg" en el encabezado se lee como un error de la UI.
    const despues = Math.max(0, i === _selPane ? pane.weight - delta : pane.weight + delta);
    const excede = pane.weight + delta - pane.max;
    const choca = i !== _selPane && excede > 0;

    const sig = document.createElement("span");
    sig.className = "pane__sig";
    sig.textContent = choca
      ? " → ✗ +" + redondear1(excede) + "kg"
      : " → " + redondear1(despues) + "kg";
    w.appendChild(sig);
    if (choca) w.classList.add("pane__peso--bad");
  }
}

function redondear1(n) {
  return Math.round(n * 10) / 10;
}

// Un pane: su encabezado (titulo, peso y de que lado viene) y la tabla.
//
// El titulo puede ir EN la cabecera de la tabla en vez de arriba en su propia
// linea (cfg.tituloEnCabecera): la celda del nombre dice CATALOGO/CARRITO y no
// "Arma", y la linea de mas deja de existir. Con eso no se dibuja .pane__head
// —que en esas pantallas no tiene mas nada, el peso no existe—. Es la armeria,
// donde las dos listas estan apiladas y cada linea de aire vale.
function crearPane(p, cfg, pane, idx, activo) {
  const box = document.createElement("div");
  box.className = "pane" + (activo ? " pane--activo" : "");

  const enCab = !!cfg.tituloEnCabecera;
  if (!enCab) {
    const head = document.createElement("div");
    head.className = "pane__head";
    const t = document.createElement("span");
    t.className = "pane__title";
    t.textContent = pane ? pane.titulo : "";
    head.appendChild(t);
    if (pane && pane.max) {
      const w = document.createElement("span");
      w.className = "pane__peso";
      w.textContent = pane.weight + "/" + pane.max + "kg";
      head.appendChild(w);
    }
    box.appendChild(head);
  }

  const body = document.createElement("div");
  body.className = "pane__rows";
  box.appendChild(body);

  const rows = pane ? pane.rows || [] : [];
  // La fila cruda pasa por el MISMO normalizador que las del inventario
  // (setInventory), y aca es donde se paga: el id se convierte en icono con
  // catalog.icons, y los campos opcionales quedan en null. Sin esta linea los
  // cuatro menus dibujaban las mismas columnas que el inventario —la de icono
  // esta declarada en las cuatro— pero con un slot vacio, porque el mod no manda
  // icono: lo resuelve la pagina, y hasta ahora solo el inventario lo hacia.
  //
  // La vista se ordena por banda y se guarda: la seleccion la recorre
  // desde ahi, asi que tiene que estar en el mismo orden en que se dibuja.
  _vistasPane[idx] = ordenarPorBanda(rows.map(snapRow));

  // Con el titulo en la cabecera la tabla se dibuja SIEMPRE: es donde vive el
  // titulo, y con la lista vacia la cabecera queda sola sobre el mensaje.
  if (rows.length === 0 && !enCab) {
    const vacio = document.createElement("p");
    vacio.className = "empty";
    vacio.textContent = (pane && pane.vacio) || "No hay nada.";
    body.appendChild(vacio);
    return box;
  }

  let cols = cfg.cols;
  if (enCab && pane && pane.titulo) {
    cols = cols.map((c) => (c.kind === "name" ? { kind: c.kind, text: pane.titulo } : c));
  }
  renderTablaEn(body, cols, _vistasPane[idx], idx);
  if (rows.length === 0) {
    const vacio = document.createElement("p");
    vacio.className = "empty";
    vacio.textContent = (pane && pane.vacio) || "No hay nada.";
    body.appendChild(vacio);
  }
  return box;
}

// renderTable() dibujaba siempre en rowsBox, que es el contenedor del
// inventario. Esta es la misma tabla en cualquier caja: el unico cambio es que la
// caja se pasa por parametro. Sin esto habria dos copias del render de la tabla,
// que es exactamente el tipo de duplicado que diverge.
function renderTablaEn(box, cols, rows, paneIdx) {
  const wrap = document.createElement("div");
  wrap.className = "table table--" + cols.length;

  const head = document.createElement("div");
  head.className = "table__head";
  for (const col of cols) {
    const c = document.createElement("span");
    if (col.kind !== "name") c.className = "table__num";
    if (col.icon) {
      c.appendChild(headIcon(col.icon, col.text));
    } else {
      // Encabezado de texto. En una columna de datos va con la clase compacta:
      // una palabra con el tracking de la cabecera no entra en 2.9-3.2vw. En la
      // del nombre no, que es 1fr y no tiene ese techo; y la del icono no va
      // tampoco —es la primera columna y no tiene texto—.
      if (col.kind !== "name" && col.text) c.classList.add("table__headtext");
      c.textContent = col.text || "";
    }
    head.appendChild(c);
  }
  wrap.appendChild(head);

  for (const cat of bandasDe(rows)) {
    const items = rows.filter((r) => r.cat === cat.key);
    if (items.length === 0) continue;
    const band = document.createElement("div");
    band.className = "table__group";
    band.appendChild(document.createTextNode(cat.label));
    const cnt = document.createElement("span");
    cnt.className = "table__group-count";
    cnt.textContent = items.length;
    band.appendChild(cnt);
    wrap.appendChild(band);
    for (const r of items) {
      wrap.appendChild(buildTableRow(r, cols, rows, paneIdx));
    }
  }

  box.appendChild(wrap);
}

// ---------------------------------------------------------------- AVISO --
//
// El feedback de una accion de estos menus. Antes no habia ninguno: el mod
// escribia con showTextBox, que dibuja abajo a la izquierda, DETRAS del panel.
//
// El texto llega con los codigos de color del juego (~r~ rojo, ~g~ verde) porque
// es el mismo showTextBox de siempre, y el tono sale del prefijo: el mod no tiene
// que decidir como se ve, lo decide la hoja de estilo. Un codigo suelto en el
// medio del texto se ve como basura, asi que se sacan todos.
function tonoDe(text) {
  if (/^~r~/.test(text)) return "bad";
  if (/^~g~/.test(text)) return "ok";
  return "info";
}

function sinCodigos(text) {
  return String(text).replace(/~[a-zA-Z]~/g, "").trim();
}

let _avisoTimer = null;
function mostrarAviso(p, texto) {
  p.aviso.textContent = sinCodigos(texto);
  p.aviso.className = "aviso aviso--" + tonoDe(texto);
  if (_avisoTimer !== null) clearTimeout(_avisoTimer);
  // El aviso se va solo: el siguiente push trae los datos nuevos, y un mensaje
  // que no se va tapa la lista.
  _avisoTimer = setTimeout(function () {
    _avisoTimer = null;
    p.aviso.classList.add("hidden");
  }, 3800);
}

// ----------------------------------------------------------------- PIE --

// El pie de un menu de proximidad: los numeros del snapshot a un lado, los
// botones del menu al otro.
//
// Los botones del pie son para lo que no es una accion sobre la fila elegida:
// pagar el carrito, vaciarlo. Las de la fila (agregar, quitar, ofrecer,
// recoger) corren con Enter sobre la fila elegida, doble click o el canal, y
// meter estas dos ahi seria mentir sobre a que fila se aplican.
function renderPie(p, cfg, data) {
  const pie = data.pie || {};
  p.pieIzq.textContent = pie.izq || "";
  p.pieDer.textContent = pie.der || "";

  // Estado del carrito (solo si la pantalla declara pieCarrito). Los items se
  // suman de las filas del catalogo —enCarrito, el campo que el mod escribe en
  // el snapshot— y no del dinero parseado: el total puede no haber llegado
  // todavia o venir mal parseado, y "¿hay algo adentro?" tiene que responderlo
  // la estructura, no la cifra. De aca salen las dos decisiones de abajo.
  let items = null;
  if (cfg.pieCarrito) {
    items = 0;
    const filas = ((data.panes || [])[0] || {}).rows || [];
    for (const fila of filas) items += fila.enCarrito || 0;

    // Total rojo si no alcanza el saldo. Es pintura, no un chequeo: el que
    // valida la plata es el mod en checkout() — igual que la proyeccion de
    // peso del baul, que tambien avisa sin bloquear.
    const saldo = parseDinero(pie.izq);
    const total = parseDinero(pie.der);
    if (saldo != null && total != null && saldo < total) {
      p.pieDer.classList.add("panel-foot__txt--mal");
    } else {
      p.pieDer.classList.remove("panel-foot__txt--mal");
    }
  }

  p.footBtns.innerHTML = "";
  for (const a of cfg.pieAcciones || []) {
    const b = document.createElement("button");
    b.className = "btn panel-foot__btn" + (a.principal ? " btn--primary" : "");
    b.type = "button";
    b.textContent = a.label;
    // Vaciar o pagar un carrito vacio no es una accion, es un error esperando
    // pasar: los dos botones se apagan solos con el carrito sin items. El mod
    // igual responde con "Carrito vacio" si algun camino (el teclado, un
    // estado viejo) los llega a apretar — esto es la capa que se ve.
    if (cfg.pieCarrito && items === 0) b.disabled = true;
    b.addEventListener("click", () => correrAccion(a, null));
    p.footBtns.appendChild(b);
  }
}

// ============================================================================
// CANTIDAD DE LA ACCION
// ============================================================================
//
// Sin barra de accion el jugador no elige cantidad: Enter siempre manda 1. La
// excepcion es Mayús+Enter (moverTodo), que manda la pila entera de la fila —
// el atajo invisible del ex-chip "Todo"— y vive una sola vez, hasta que el
// comando se arma: no queda estado que un Enter comun pueda heredar.
//
// Los valores del mod llegan escritos en el payload y el es el que valida
// (ver putInTrunk, doOffer, collectItem). El tope de la pila sale de
// cfg.barra.max, que es el unico pedazo de la barra que sigue vivo: lee claves
// de la fila (r.qty, r.disponible) y check_pantallas la chequea contra el
// snapshot.

// La pila que pidio moverTodo y que qtyDe() entrega UNA vez.
let _qtyUnica = null;

function maxDe(campo, r) {
  return campo.max ? campo.max(r) : 99;
}

// El campo con esa key en la pantalla abierta, o null. La cantidad se lee por
// nombre porque el comando dice "qty" y no le importa el orden de los campos.
function campoDe(key) {
  const cfg = cfgDe(pantallaActual());
  return ((cfg && cfg.barra) || []).find((c) => c.key === key) || null;
}

// Cambia de lista en las pantallas de dos panes. La nueva lista arranca con la
// primera fila elegida: si no, la seleccion queda apuntando al indice que
// tenia en la otra y el Enter actua sobre una fila que el jugador no ve.
//
// NO se redibuja la pantalla para esto. Las dos listas ya estan dibujadas (las
// arma renderPanes), y un render completo aca tiraba el scroll de las dos y
// remontaba la fila de arriba cada vez que se cruzaba el canal. Lo que cambia es
// quien tiene la seleccion, que es selectRow(), y el color del titulo, que es
// marcarPaneActivo().
function cambiarPane(dir) {
  const panes = (flowData && flowData.panes) || [];
  if (panes.length < 2) return;
  paneActual = (paneActual + dir + panes.length) % panes.length;
  const id = pantallaActual();
  marcarPaneActivo(panelDe(id));
  selectRow(0, paneActual);
  // Mismo motivo que en trasSeleccionar: el pie depende de la lista activa.
  renderPie(panelDe(id), cfgDe(id), flowData);
}

// Timer del flash del total del carrito (ver correrAccion, mas abajo).
let _flashTimer = null;

// Corre una accion. El comando lo arma la pantalla, con la cantidad que dicta
// qtyDe(): la pagina compone el payload y el mod lo valida.
//
// sobreFila marca las acciones que son de UNA fila (guardar, sacar, agregar,
// ofrecer, recoger). Las del pie no lo son: pagan el carrito entero, que no es
// ninguna fila, y llegan con r = null. Sin el flag, el que las escribe tendria
// que acordarse de que esas no usan fila, y un dia alguien manda una de pie con
// r = null y el comando sale con id undefined.
function correrAccion(a, r) {
  if (a.sobreFila && !r) {
    _diag((typeof a.label === "function" ? a.label(r) : a.label) + ": no hay fila seleccionada");
    return;
  }
  const payload = a.cmd(r, paneActual);
  if (!payload) {
    _diag((typeof a.label === "function" ? a.label(r) : a.label) + ": " + (r ? r.name : "") + " no se puede hacer");
    return;
  }
  const ok = emitCommand(payload);
  _diag("cmd " + payload.cmd + (ok ? " enviado" : " rechazado"));
  // Flash del total del carrito. El comando de la armeria recien CONFIRMADO
  // pega el destello en el total (pie derecho) mientras el snapshot con los
  // datos nuevos tarda hasta 400ms: es el "se envio, mira el total" que falta
  // entre el Enter y la respuesta. Solo dealer: en las demas pantallas el pie
  // no es un total que cambia.
  if (ok && String(payload.cmd).indexOf("dealer:") === 0) {
    const p = panelDe(pantallaActual());
    if (p && p.pieDer) {
      if (_flashTimer !== null) clearTimeout(_flashTimer);
      // Sacar y volver a poner la clase reinicia la animacion: sin el reflow
      // del medio el navegador agrupa los dos cambios y un segundo Enter
      // rapido no volveria a destellar.
      p.pieDer.classList.remove("panel-foot__txt--flash");
      void p.pieDer.offsetWidth;
      p.pieDer.classList.add("panel-foot__txt--flash");
      _flashTimer = setTimeout(function () {
        _flashTimer = null;
        p.pieDer.classList.remove("panel-foot__txt--flash");
      }, 650);
    }
  }
}

// ============================================================================
// PANTALLAS - el registro de los cuatro menus de proximidad
// ============================================================================
//
// Una entrada por menu. Todo lo que cambia entre ellos esta aca: que columnas
// tiene la tabla, que tope de pila lee Mayús+Enter, que comando dispara cada
// accion y que botones pone el pie. El render es el mismo de siempre.
//
// Que no esta aca, y por que:
//   - las filas: las arma el mod (gsis_FlowSerialization.js). La pagina no
//     consulta WEAPON_DATA ni el save, no los tiene.
//   - los precios y los pesos: tambien son del mod, y el precio depende del
//     markup de cada NPC.
//   - los textos de vacio: tambien, porque son frases traducidas del juego.
//
//   titulo            el fallback si el snapshot no trajo titulo (todavia no llego)
//   cols              las columnas, en el mismo formato que COLS_INVENTARIO
//   barra             el tope de cantidad (r.qty y demas) que lee Mayús+Enter
//   acciones          las que dispara Enter / el canal / la X
//   pieAcciones       las del pie (Vaciar, Pagar, Recoger todo), con su tecla
//   tituloEnCabecera  el titulo de cada lista en la celda de su tabla (armeria)
//   linea             el subtitulo en la MISMA linea que el titulo (armeria)
//   apilado / centro  la forma de las listas (ver .flow__panes y .panel--centro)
//   pieCarrito        estados del pie del carrito (renderPie)
//
// Los comandos van con prefijo del menu ("trunk:", "dealer:") y se despachan en
// handleCommand() de gsis_WebInterface.js. La lista de un lado y del otro se
// chequea con check_pantallas.mjs: es el contrato que mas se rompe en silencio.
const PANTALLAS = {
  // ---------------------------------------------------------------- BAUL --
  // Las dos listas son los mismos items, asi que las columnas son las del
  // inventario. Lo unico que cambia es el sentido del boton: guardar sale de la
  // mochila y sacar sale del baul, y depende de que lista estas mirando.
  trunk: {
    titulo: "Maletero Vehiculo",
    centro: true,
    cols: COLS_INVENTARIO,
    // Sin barra, Enter manda 1 y lo unico que queda de la cantidad es el tope
    // de Mayús+Enter: la pila de la fila (r.qty). En las armas ese tope es 1 —
    // son instanciales, una fila es un objeto— y ahi Mayús no cambia nada.
    barra: [{ key: "qty", min: 1, max: (r) => r.qty || 1 }],
    acciones: [
      {
        principal: true,
        sobreFila: true,
        label: (r, pane) => (pane === 0 ? "Guardar en maletero" : "Sacar a mochila"),
        cmd: (r, pane) => (pane === 0
          ? { cmd: "trunk:put", id: r.id, qty: qtyDe() }
          : { cmd: "trunk:take", id: r.id, qty: qtyDe() })
      }
    ]
  },

  // ------------------------------------------------------------- ARMERIA --
  // Catalogo con precio de compra. Las columnas son las del inventario MAS la
  // propia: lo que el jugador compara al comprar es lo mismo que compara en su
  // mochila —cuanto pesa, cuantas balas trae, en que estado viene— y sacarlo
  // para que entre el precio seria perder la mitad de la fila.
  //
  // La banda de grupo sigue siendo la CATEGORIA del arma (Pistolas, Escopetas),
  // no el type del item: en la armeria todas las filas son type weapon, y con
  // el type quedaria una sola banda, que es el inventario con otros numeros.
  //
  // Salud se queda y ahora es real: la manda el mod en cada fila del catalogo
  // (`salud` en itemRow). En la armeria sale siempre a 100% porque lo que se
  // compra es nuevo, y eso es correcto — no es un dato de mentira.
  //
  // Precio va con encabezado de TEXTO y no de icono: los cuatro iconos de
  // cabecera ya estan ocupados por las columnas del inventario, y pintar uno
  // nuevo seria un dibujo nuevo para una sola palabra. Ver .table__headtext y
  // .table--7 en style.css.
  //
  // Valor (lo que vale despues de vender) va suave y Precio (lo que se paga)
  // va fuerte: son DOS precios a comparar en la misma celda visual, y con el
  // mismo peso el jugador tenia que adivinar cual era el de compra — en la
  // captura $400 $480 se leian como dos numeros intercambiables.
  //
  // La columna Carrito ya no esta: cuanto se lleve de cada arma lo dice el
  // panel del carrito (segunda lista) y, en la propia fila, el chip
  // "(2 en carrito)" con la fila resaltada. Ocupaba ancho que las dos
  // cifras de precio no tenian.
  //
  // Pagar el carrito va en el pie: pagar no es una accion sobre la fila
  // elegida sino sobre el carrito entero, que no es ninguna fila. Por eso
  // pieAcciones vive aparte de acciones.
  dealer: {
    titulo: "Armero ilegal",
    // Lista apilada y panel al borde izquierdo, como el inventario: el carrito
    // va DEBAJO del catalogo y no a su derecha. En un panel angosto (~30vw) dos
    // columnas dejaban cada tabla de 13vw y los nombres no entraban; apiladas
    // cada lista mide el ancho entero del panel. El canal sigue en el medio y
    // con el apilado sus botones son ↓ y ↑ (crearCanal).
    //
    // La columna Carrito de la tabla se reemplazo por esto — el canal hace lo
    // que la columna solo contaba, y en dos listas el carrito se ve entero en
    // vez de un numero suelto por fila. Con un solo pane el jugador tenia que
    // acordarse lo que fue agregando.
    apilado: true,
    // "Armero ilegal / Emmet" es un nombre y un nombre: la segunda linea es un
    // dato que identifica, no una frase, asi que va en la MISMA linea que el
    // titulo, igual que "Inventario / CJ" (ver .panel-header--linea). Los otros
    // dos (trueque y retiro) traen frases largas y siguen abajo del titulo.
    linea: true,
    // El titulo de cada lista vive en la celda del nombre de SU tabla
    // (CATALOGO / CARRITO) y no en una linea propia arriba: ver
    // crearPane(). Sin barra de accion cada linea de aire cuenta.
    tituloEnCabecera: true,
    cols: [
      { kind: "icon" },
      { kind: "name", text: "Arma" },
      { text: "Munición", icon: "cant", cell: celdaCantidad },
      { text: "Salud", icon: "salud", cell: celdaSalud },
      { text: "Peso", icon: "peso", cell: celdaPeso },
      { text: "Valor", icon: "valor", cell: celdaValor, suave: true },
      { text: "Precio", cell: (r) => fmtDinero(r.precio), fuerte: true }
    ],
    // La cantidad sin barra: Enter agrega de a 1 y Mayús+Enter podria agregar
    // la pila — el tope del arma la decide el mod (el mod apila). El campo no
    // pregunta por el pane: r.maxQty lo escribe el mod SOLO en las filas del
    // carrito (_snapDealer), y ahi Mayús+Enter quita la pila entera.
    barra: [{ key: "qty", min: 1, max: (r) => (r.maxQty != null ? r.maxQty : 99) }],
    acciones: [
      {
        principal: true,
        sobreFila: true,
        // Mismo esquema que el baul: el sentido depende de la lista que se esta
        // mirando. El canal (crearCanal) y el Enter llaman con el pane activo,
        // asi que los dos botones del canal apuntan a la accion correcta sin
        // conocer el carrito.
        //
        // El test es `pane === 1` y no `pane === 0`: correrAccion arma el
        // diagnostico con label(r) sin pane, y ahi caer en "Agregar" es el
        // default correcto (la accion de la lista por defecto).
        label: (r, pane) => (pane === 1 ? "Quitar del carrito" : "Agregar al carrito"),
        cmd: (r, pane) => (pane === 1
          ? { cmd: "dealer:cart:remove", id: r.id, qty: qtyDe() }
          : { cmd: "dealer:add", id: r.id, qty: qtyDe() })
      }
    ],
    // El pie del menu. Sin este bloque el carrito se llenaba y no habia forma de
    // cobrarlo desde la pagina: checkout() existia en el mod y nadie lo llamaba.
    // pieCarrito enciende el estado del pie en renderPie: apaga Vaciar/Pagar
    // con el carrito vacio y pone el total en rojo si no alcanza el saldo.
    pieCarrito: true,
    pieAcciones: [
      { label: "Vaciar", cmd: () => ({ cmd: "dealer:cart:clear" }), tecla: "V" },
      { label: "Pagar", cmd: () => ({ cmd: "dealer:checkout" }), tecla: "P", principal: true }
    ]
  },

  // ------------------------------------------------------------- TRUEQUE --
  // La oferta por unidad. Sin barra de accion no hay stepper de precio: la
  // oferta es la que trae la fila (oferta = base, la escribio el mod en
  // _snapSeller) y Enter la manda tal cual. Subirla —el trueque— era lo que
  // hacia el stepper de la barra, que ya no existe.
  //
  // Las columnas son las del inventario MENOS valor, y no es un descuido: base
  // sale de getSellPrice(id), que es EXACTAMENTE lo que valueCell() pone en la
  // columna valor (ver gsis_ItemRow.js). Las dos juntas darian la misma cifra
  // dos veces al lado de la oferta. Salud, peso y cant quedan tal cual.
  //
  // Base y Oferta van con encabezado de texto: los iconos de cabecera ya estan
  // ocupados por las columnas que vienen del inventario. Ver .table--7.
  seller: {
    titulo: "Trueque",
    cols: [
      { kind: "icon" },
      { kind: "name", text: "Arma" },
      { text: "Cant", icon: "cant", cell: celdaCantidad },
      { text: "Salud", icon: "salud", cell: celdaSalud },
      { text: "Peso", icon: "peso", cell: celdaPeso },
      { text: "Base", cell: (r) => fmtDinero(r.base) },
      { text: "Oferta", cell: (r) => fmtDinero(r.oferta) }
    ],
    // El tope de Mayús+Enter, mismos $ de siempre. No hay campo price: la
    // oferta sale de la fila (ver el cmd).
    barra: [{ key: "qty", min: 1, max: (r) => r.qty || 1 }],
    acciones: [
      {
        principal: true,
        sobreFila: true,
        label: () => "Ofrecer",
        cmd: (r) => ({ cmd: "seller:offer", id: r.id, qty: qtyDe(), price: r.oferta || r.base || 0 })
      }
    ]
  },

  // -------------------------------------------------------------- RETIRO --
  // Las lineas del pedido con lo que queda de cada una. El boton de segunda es
  // "recoger todo", que es la unica accion que en el mod valida el peso ANTES de
  // tocar nada (ver collectAll).
  //
  // Las columnas son las del inventario, con la de cantidad rotulada "Queda":
  // el mod manda disponible = linea.qty (_snapPickup), o sea que es el mismo
  // numero que cant y las dos columnas serian un espejo. Se lee disponible y no
  // cant a proposito —el dia que el pedido se parcialize, la que importa es la
  // que queda— y cant es el fallback mientras no haya dato propio.
  pickup: {
    titulo: "Retiro",
    cols: [
      { kind: "icon" },
      { kind: "name", text: "Pedido" },
      { text: "Queda", icon: "cant", cell: (r) => (r.disponible != null ? r.disponible : celdaCantidad(r)) },
      { text: "Salud", icon: "salud", cell: celdaSalud },
      { text: "Peso", icon: "peso", cell: celdaPeso },
      { text: "Valor", icon: "valor", cell: celdaValor }
    ],
    barra: [{ key: "qty", min: 1, max: (r) => r.disponible || r.qty || 1 }],
    acciones: [
      {
        principal: true,
        sobreFila: true,
        label: () => "Recoger",
        cmd: (r) => ({ cmd: "pickup:take", id: r.id, qty: qtyDe() })
      }
    ],
    // "Recoger todo" no es de una fila: es del pedido entero, asi que va en el
    // pie. Es la unica accion del mod que valida el peso del pedido COMPLETO
    // antes de tocar nada (ver collectAll), asi que tiene que estar a un clic,
    // no escondida en el menu de una fila.
    //
    // "Cancelar pedido" va al lado por la misma razon: el peso del pedido NO se
    // reserva al comprar, se valida al recoger, asi que un pedido puede no caber
    // jamas (2x RPG = 14 kg contra un tope de 12) y sin esto el jugador pago por
    // algo que no puede recoger ni deshacer. El mod lo reembolsa (cancelOrder).
    //
    // Sin `tecla` a proposito: la A ya es de "Recoger todo" y una tecla nueva
    // por boton es un mapa de atajos que hay que mantener. Y sin `principal`,
    // porque el Enter del teclado tiene que seguir siendo "Recoger".
    pieAcciones: [
      { label: "Recoger todo", cmd: () => ({ cmd: "pickup:takeAll" }), tecla: "A", principal: true },
      { label: "Cancelar pedido", cmd: () => ({ cmd: "pickup:cancel" }) }
    ]
  }
};

// La cantidad que manda el comando: 1 siempre, salvo que moverTodo
// (Mayús+Enter) haya pedido la pila entera — esa la entrega mientras dura el
// bloque de moverTodo y ahi se apaga, para que el Enter siguiente no herede un
// numero que el jugador no ve.
function qtyDe() {
  if (_qtyUnica != null) return _qtyUnica >= 1 ? Math.floor(_qtyUnica) : 1;
  return 1;
}

// ----------------------------------------------------------- TECLADO & EVENTOS --

tabsBox.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (btn && btn.dataset.filter) {
    renderFiltro(btn.dataset.filter);
  }
});

// X: la tecla que el pie anuncia. Apretar equipa la fila elegida, mantener
// apretado tira una unidad. El umbral decide al soltar, no al apretar, para no
// tirar un item porque el click se lingerio un frame.
//
// Los dos keycaps del pie hacen lo mismo con un click: son la misma accion
// escrita de dos formas, y el keycap es el que el jugador ve.
const HOLD_MS = 600;
let _xDownAt = 0;
let _xFired = false;

// La fila elegida es la de la vista que se esta mirando: con un flujo abierto
// es la del pane activo, y sin flujo la del inventario filtrado. selectedRow() no
// sabe de donde sale, usa vistaDe().
function selectedRow() {
  const vista = vistaDe();
  if (vista.length === 0) return null;
  return vista[selectedIndex] || null;
}

function doAction(what) {
  const r = selectedRow();
  if (!r) {
    _diag(what + ": no hay fila seleccionada");
    return false;
  }
  const payload = actionFor(r, what);
  if (!payload) {
    _diag(what + ": " + r.name + " no admite esa accion");
    return false;
  }
  return emitCommand(payload);
}

function wireKeycaps() {
  const equip = document.querySelector('[data-action="equip"]');
  const drop = document.querySelector('[data-action="drop"]');
  if (equip) {
    equip.addEventListener("click", () => doAction("equip"));
  }
  if (drop) {
    drop.addEventListener("click", () => doAction("drop"));
  }
}

// ------------------------------------------------------- MENU CONTEXTUAL --
//
// El click derecho sobre una fila abre el menu en el cursor. Es la MISMA accion
// que la tecla X y los keycaps: las tres caminos llaman a runAccion() con el id
// del registro ACCIONES, asi que este bloque no sabe que existe "Tirar" ni
// "Equipar" — arma lo que el registro diga que aplica a esa fila.
//
// Delegado sobre #rows y no por fila: la tabla se rearma en cada cambio de
// filtro y en cada snapshot del mod, asi que un listener por fila habria que
// rebatirlo en cada render. Con delegacion el listener se ata una vez.
const ctxEl = document.getElementById("ctxmenu");
let _ctxRow = null;

// Busca la fila a la que pertenece un elemento del DOM. La tabla se rearma
// seguido, asi que no conviene guardar el elemento: se sube hasta el
// .table__row del evento y se lo localiza dentro de la vista filtrada por
// identidad de elemento.
function filaDe(target) {
  const el = target && target.closest ? target.closest(".table__row") : null;
  if (!el) return null;
  return viewFiltrada.find((r) => r.el === el) || null;
}

function cerrarCtxMenu() {
  if (!ctxEl || ctxEl.hidden) return;
  ctxEl.hidden = true;
  ctxEl.innerHTML = "";
  _ctxRow = null;
}

function abrirCtxMenu(x, y, r) {
  if (!ctxEl) return;
  const items = ACCIONES.filter((a) => a.aplica(r));

  // Sin acciones para esta fila no se abre nada. Un menu con un solo renglon
  // "-- Sin acciones --" es ruido: la X tampoco hace nada en ese caso.
  if (items.length === 0) {
    _diag(r.name + ": no tiene acciones");
    return;
  }

  ctxEl.innerHTML = "";

  const head = document.createElement("div");
  head.className = "ctxmenu__head";
  head.textContent = r.name;
  ctxEl.appendChild(head);

  for (const a of items) {
    if (a.sep) {
      const sep = document.createElement("div");
      sep.className = "ctxmenu__sep";
      ctxEl.appendChild(sep);
    }
    const b = document.createElement("button");
    b.className = "ctxmenu__item";
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.textContent = typeof a.label === "function" ? a.label(r) : a.label;
    b.addEventListener("click", () => {
      const fila = _ctxRow;
      cerrarCtxMenu();
      if (fila) runAccion(a.id, fila);
    });
    ctxEl.appendChild(b);
  }

  _ctxRow = r;
  // hidden=false ANTES de medir: offsetWidth es 0 con el menu oculto, y sin las
  // medidas no se puede saber si hay que corrido.
  ctxEl.hidden = false;

  // Ajuste al borde. Se mide recien insertado y se corre lo que sobre, primero
  // en horizontal y despues en vertical. El menu pegado al borde se ve mejor que
  // cortado: la fila esta siempre en el mismo lugar, el menu es lo que cede.
  const mw = ctxEl.offsetWidth;
  const mh = ctxEl.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let px = x;
  let py = y;
  if (px + mw > vw) px = Math.max(0, x - mw);
  if (py + mh > vh) py = Math.max(0, y - mh);
  ctxEl.style.left = px + "px";
  ctxEl.style.top = py + "px";
}

if (rowsBox) {
  rowsBox.addEventListener("contextmenu", (e) => {
    const r = filaDe(e.target);
    if (!r) return;
    // preventDefault antes de cualquier cosa: sin esto CEF saca su menu propio
    // y se ven los dos.
    e.preventDefault();
    // El click derecho tambien selecciona: la accion es sobre la fila que se
    // toco, no sobre la que estaba elegida de antes.
    const idx = viewFiltrada.indexOf(r);
    if (idx !== -1) selectRow(idx);
    abrirCtxMenu(e.clientX, e.clientY, r);
  });

  // Click en cualquier otro lado cierra. Va en document y no en #rows a
  // proposito: el menu vive en body, asi que un listener en #rows no lo veria.
  // No hace falta la fase de captura: los items del menu cierran solos en su
  // click, y el mousedown de document corre antes del click, no despues.
  document.addEventListener("mousedown", (e) => {
    if (ctxEl && !ctxEl.hidden && !ctxEl.contains(e.target)) {
      cerrarCtxMenu();
    }
  });
}

// Sin puente (preview en un navegador) el teclado tiene que andar igual, asi que
// el bail-out de abajo solo corta cuando hay puente y el mod dijo que la pagina
// NO esta recibiendo teclas.
function tecladoEnLaPagina() {
  if (!bridgeReady) return true;
  return uiState.keys;
}

document.addEventListener("keydown", (e) => {
  // Si el WndProc no esta mandando las teclas aca, este keydown no vino de una
  // pulsacion del jugador: es un evento del navegador sin contraparte. Antes el
  // handler corria igual y, con el panel oculto, cambiaba la seleccion y
  // disparaba acciones en silencio.
  if (!tecladoEnLaPagina()) {
    return;
  }

  // PREVIEW: Ctrl+flecha recorre las pantallas del ejemplo. Va primero y con su
  // propio return a proposito, por las dos razones que lo sostienen:
  //
  //   1. No existe en el juego. La rama entera esta detrás de !bridgeReady, asi
  //      que no es un atajo que en el juego no hace nada: es codigo que en el
  //      juego no esta. Ctrl+flecha con puente cae al handler de siempre y no
  //      encuentra nada que hacer con ella.
  //   2. No puede caer en la navegacion de la tabla. ↑↓ mueven la fila y ←→ cambian
  //      de lista en el baul; por eso el cambio de pantalla necesita el
  //      modificador, y por eso esta rama no se puede escribir mas abajo, donde
  //      esas dos leen la misma tecla.
  if (!bridgeReady && e.ctrlKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    previewSaltar(e.key === "ArrowRight" ? 1 : -1);
    return;
  }

  // Escape cierra el menu. Con el menu contextual abierto se queda el y lo
  // cierra; si no, pide el cierre.
  //
  // El cierre lo pide la pagina con "ui:close" y no lo hace el mod detectando la
  // tecla, porque cuando la pagina se queda con el teclado el WndProc la
  // consume (hace return 0) y el juego nunca la ve. Ese camino de vuelta no
  // depende del input, asi que anda siempre. Ver gsis_Input.js.
  //
  // "ui:close" es un solo comando para las dos cosas: el mod cierra el flujo
  // si hay uno y, si no, el panel. La pagina no tiene que saber cual era.
  if (e.key === "Escape") {
    e.preventDefault();
    if (ctxEl && !ctxEl.hidden) {
      e.stopPropagation();
      cerrarCtxMenu();
    } else {
      emitCommand({ cmd: "ui:close" });
    }
    return;
  }

  // La I abre y cierra. Mismo camino que el Escape, mismo motivo: con el teclado
  // en la pagina, el mod no puede ver la tecla. Con un flujo abierto el mod la
  // ignora: el menu de esfera tiene la pantalla.
  if (e.key.toLowerCase() === "i") {
    e.preventDefault();
    emitCommand({ cmd: "ui:toggle" });
    return;
  }

  // El ESPACIO abre y cierra los menus de esfera (baul, armeria, retiro, trueque).
  // Mismo camino que la I, mismo motivo: con el teclado en la pagina el mod no ve
  // la tecla, y sin esto la tecla solo serviria con el puntero afuera del panel.
  //
  // El preventDefault no es cosmetico: sin el, el navegador scrollea la caja de
  // scroll con el ESPACIO. Y el comando va con el debounce de toggleFlow del lado
  // del mod, que es lo que evita que esta pulsacion y la que leyo el mod por
  // GetAsyncKeyState se cancelen entre si.
  if (e.key === " ") {
    e.preventDefault();
    emitCommand({ cmd: "flow:toggle" });
    return;
  }

  // Con el menu abierto el teclado de fila no corre: se eligio una accion
  // apuntando, no moviendo la seleccion. Sin este return, abrir el menu con el
  // click derecho y despues mover las flechas cambiaba la fila escondida detras
  // del menu y la accion iba a caer sobre otra.
  if (ctxEl && !ctxEl.hidden) return;

  // Que pantalla es la que esta tomando las teclas. Aca se decide todo lo que
  // sigue: con un flujo abierto las flechas horizontales cambian de lista y la
  // barra de accion manda; sin flujo, los filtros y equipar/tirar.
  const flow = pantallaActual();
  const cfg = flow ? cfgDe(flow) : null;
  const vista = vistaDe();

  // WASD como alias de las flechas. El jugador trae la mano en WASD -asi se
  // mueve en el juego- y hacerlo buscar las flechas para recorrer una lista
  // rompe el gesto. Vale en las dos pantallas: arriba/abajo mueven la fila y
  // izquierda/derecha cambian de lista (flujos) o de filtro (inventario), que es
  // exactamente lo que hacen las flechas de arriba.
  //
  // La A es la unica de las cuatro que una pantalla tiene asignada (pickup:
  // "Recoger todo", letra anunciada en el pie), y ahi manda la accion: el alias
  // no se come una tecla que el pie promete. No se pierde navegacion por eso,
  // porque las flechas horizontales en ese flujo no mueven nada -tiene un solo
  // pane- y la fila si sigue moviendose con la W y la S.
  //
  // Con modificador no hay alias: Ctrl+A es del navegador y las flechas con
  // Ctrl son el recorrido de pantallas del preview.
  const k = e.key.toLowerCase();
  const libreDeAccion = !cfg ||
    !(cfg.pieAcciones || []).some((x) => String(x.tecla || "").toLowerCase() === k);
  const nav = (!e.ctrlKey && !e.metaKey && !e.altKey && libreDeAccion)
    ? ({ w: "ArrowUp", a: "ArrowLeft", s: "ArrowDown", d: "ArrowRight" }[k] || e.key)
    : e.key;

  if (nav === "ArrowDown") {
    e.preventDefault();
    stepRow(1);
  } else if (nav === "ArrowUp") {
    e.preventDefault();
    stepRow(-1);
  } else if (nav === "ArrowLeft" || nav === "ArrowRight") {
    e.preventDefault();
    const dir = nav === "ArrowRight" ? 1 : -1;
    // Con dos listas, izquierda y derecha cambian de lista; es el mismo gesto
    // horizontal del inventario (donde cambian de filtro) para el mismo
    // proposito. Con un solo pane no hay a que moverse y la tecla no hace nada.
    if (cfg) cambiarPane(dir);
    else cambiarFiltro(dir);
  } else if (e.key === "Home") {
    e.preventDefault();
    selectRow(0);
  } else if (e.key === "End") {
    e.preventDefault();
    selectRow(vista.length - 1);
  } else if (e.key === "PageDown" || e.key === "PageUp") {
    // Una "pagina" es lo que entra en la caja, no el alto entero: scrollear
    // media pantalla de golpe es lo que hace el navegador con la rueda, y es lo
    // unico que el jugador ya conoce.
    e.preventDefault();
    const alto = cajaDeScroll() ? cajaDeScroll().clientHeight : 300;
    const paso = Math.max(1, Math.floor(alto / 48));
    selectRow(selectedIndex + (e.key === "PageDown" ? paso : -paso));
  } else if (e.key === "Enter") {
    // Con un flujo, Enter es la accion principal sobre la fila elegida. Mayús+Enter
    // es la misma accion con la pila entera de la fila (ver moverTodo): es el
    // atajo con el que se fue el chip "Todo". Sin flujo, confirma
    // con la misma regla que la X: si el item tiene accion de equipar, esa; si
    // no, nada. Tirar sigue siendo solo con mantener la X, para que un Enter de
    // confirmacion no borre nada por sorpresa.
    e.preventDefault();
    if (cfg) {
      if (e.shiftKey) moverTodo(cfg);
      else correrPrincipal(cfg);
    } else {
      const r = selectedRow();
      if (r && actionFor(r, "equip")) {
        doAction("equip");
      } else if (r) {
        _diag("Enter: " + r.name + " no tiene accion de equipar");
      }
    }
  } else if (!cfg && (e.key.toLowerCase() === "q" || e.key.toLowerCase() === "e")) {
    e.preventDefault();
    cambiarFiltro(e.key.toLowerCase() === "e" ? 1 : -1);
  } else if (cfg && (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "v" || e.key.toLowerCase() === "p")) {
    // Las letras de las acciones del pie. Cada pantalla declara las suyas en
    // pieAcciones, y aca no hay una tecla fija por accion: se busca la que
    // coincide y, si la pantalla no la tiene, no pasa nada. Con eso, agregar una
    // accion al carrito no obliga a tocar el teclado.
    const letra = e.key.toLowerCase();
    const a = (cfg.pieAcciones || []).find((x) => (x.tecla || "").toLowerCase() === letra);
    if (a) {
      e.preventDefault();
      correrAccion(a, null);
    } else {
      _diag("letra " + letra + ": " + flow + " no la tiene asignada");
    }
  } else if (e.key.toLowerCase() === "x" && !e.repeat) {
    // La X es la accion principal en las dos familias. En el inventario tiene
    // ademas el "tirar al soltar", que aca no existe: ninguno de los cuatro menus
    // borra nada, asi que no hay nada que decidir al soltar.
    if (cfg) {
      e.preventDefault();
      correrPrincipal(cfg);
      return;
    }
    const r = selectedRow();
    if (!r) return;
    e.preventDefault();
    _xDownAt = performance.now();
    _xFired = false;

    // Que la X haga algo al apretar depende del item: un cargador va al
    // cinturon, un arma se equipa, un material no tiene accion. Si no hay
    // accion al apretar, la X queda reservada para "tirar" al soltar.
    if (actionFor(r, "equip")) {
      _xFired = true;
      doAction("equip");
    } else {
      _diag("X: " + r.name + " no tiene accion de equipar");
    }
  }
});

// La caja con scroll de lo que se esta mirando. El PageUp/Down mide esta, y con
// un flujo abierto no es #rows sino el pane activo.
function cajaDeScroll() {
  if (!pantallaActual()) return rowsBox;
  const p = _paneles[pantallaActual()];
  if (!p) return rowsBox;
  // paneEls y no p.panes.children: con el canal de traslado en el medio, el hijo
  // numero 1 de .flow__panes es el boton y no la segunda lista. Ver renderPanes().
  const cajas = p.paneEls || [];
  const activa = cajas[paneActual] || p.panes.children[paneActual];
  return activa ? activa.querySelector(".pane__rows") : rowsBox;
}

// La rueda del raton sobre una lista. El scroll nativo va con la sensibilidad
// de una pagina web y estas listas (filas chicas, cajas de ~460px) recorren
// apenas unas filas por muesca: el jugador se queda picando la rueda. La
// pagina toma el wheel, busca la caja debajo del puntero y la scrollea ELLA,
// con su propio multiplicador, cancelando el nativo — si no lo cancelara, los
// dos scrolleos se sumarian y la lista saltaria doble.
//
// Es UNA regla para el inventario (#rows) y para los paneles del flujo
// (.pane__rows): las dos listas se sienten igual y RUEDA_MULT —el unico
// numero a tocar si se quiere mas o menos vueltas por muesca— vive en un solo
// lugar.
//
// El { passive: false } de abajo tambien es obligatorio: Chrome declara
// passive por defecto el wheel del documento, y ahi preventDefault() no hace
// nada (el scroll nativo correria igual, despues del nuestro).
const RUEDA_MULT = 6;

document.addEventListener("wheel", (e) => {
  const alvo = e.target || null;
  if (!alvo || !alvo.closest) return;
  const caja = alvo.closest(".pane__rows, #rows");
  if (!caja) return;
  e.preventDefault();
  // deltaMode del estandar: 0 pixel, 1 linea, 2 pagina. Los tres se pasan a
  // pixeles antes de multiplicar, para que la sensibilidad no dependa del modo
  // en que el motor mande la rueda.
  const px = e.deltaMode === 1 ? e.deltaY * 16
    : e.deltaMode === 2 ? e.deltaY * (caja.clientHeight || 400)
    : e.deltaY;
  caja.scrollTop = (caja.scrollTop || 0) + px * RUEDA_MULT;
}, { passive: false });

function correrPrincipal(cfg) {
  const r = selectedRow();
  const a = (cfg.acciones || []).find((x) => x.principal);
  if (!a) {
    _diag("pantalla sin accion principal");
    return;
  }
  correrAccion(a, r);
}

// La accion principal con la cantidad completa de la pila: el mismo camino que
// Enter, con _qtyUnica cargada antes. El cmd se arma y se manda DENTRO de
// correrPrincipal (sincrono), y al salir se borra: no queda cantidad fantasma
// para el Enter siguiente.
//
// Si la pantalla no tiene campo qty no hay pila que mover y se comporta como
// Enter normal: Mayús no deberia romper una accion que no usa cantidad.
function moverTodo(cfg) {
  const campo = campoDe("qty");
  const r = selectedRow();
  _qtyUnica = campo && r ? maxDe(campo, r) : null;
  correrPrincipal(cfg);
  _qtyUnica = null;
}

document.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() !== "x" || _xFired) {
    return;
  }
  // Con un flujo abierto, la X ya fired al apretar (la accion principal) y no hay
  // nada que decidir al soltar. Sin este return, un keyup suelto caeria en el
  // "tirar" del inventario con el panel de flujo abierto.
  if (pantallaActual()) {
    return;
  }
  // Si el menu se abrio entre el apretar y el soltar, la X ya no esta deciding
  // nada: se cancela el "tirar por mantener" para que no caiga una accion que
  // el jugador ya no esta pidiendo.
  if (ctxEl && !ctxEl.hidden) {
    _xFired = true;
    return;
  }
  // Solo hay que decidir tirar si la X se mantuvo y todavia no se uso.
  //
  // La guarda de _xDownAt es lo que evita que un keyup sin keydown borre un item.
  // El que decide tirar es el keyup, asi que si llega uno solo, no hay nada que
  // decidir. Sin guarda, el 0 inicial de _xDownAt hacia que la cuenta fuera
  // "ahora menos 0" — el tiempo de vida de la pagina, siempre mayor que
  // HOLD_MS. Con la X ya mantenida al abrir el menu, todos los keydown llegan con
  // repeat y el !e.repeat del keydown los descarta, con lo que _xDownAt queda en
  // ese 0 y al soltar la X se borraba un item. Es la unica accion del panel que
  // no se puede deshacer.
  if (_xDownAt === 0) {
    return;
  }
  if (performance.now() - _xDownAt >= HOLD_MS) {
    _xFired = true;
    _xDownAt = 0;
    doAction("drop");
  }
});

// El click ya no marca foco: no hay nada que marcar. Antes ponia `focused = true`
// y eso alimentaba un aviso que pedia hacer click, sobre una bandera que la
// pagina no puede leer. El WndProc ya toma el foco de CEF solo cuando el puntero
// pasa por encima de la UI (Main.cpp, SendMouseToUi), asi que el click no cambia
// nada del lado del input. Se deja el listener solo para que el estado se
// re-loguee cuando el jugador interactua, que es cuando el diagnostico sirve.
document.addEventListener("mousedown", () => {
  if (!bridgeReady) {
    return;
  }
  logState();
});

// ------------------------------------------------------------- ENTRADA CLEO --

if (window.SAWeb) {
  for (const name of INBOUND) {
    window.SAWeb.on(name, (data) => {
      // Red de seguridad del mock. Si la pagina arranco sin puente pero
      // aparece uno despues, el mock cae igual y la lista queda vacia
      // esperando los datos del mod. Nunca deberia pasar — el shim se inyecta
      // antes de los scripts de la pagina — pero si pasa, que no queden items
      // falsos en pantalla.
      if (dropMock()) {
        renderFiltro(filtroActualKey);
      }

      // "uistate" reemplaza a "input" y "panels". Trae las tres cosas que antes
      // la pagina armaba sola —menu visible, teclado en la pagina, foco— con la
      // diferencia que importa: "menu visible" y "la pagina tiene el teclado" son
      // cosas distintas, y la segunda es la que decide si el keydown de abajo
      // representa algo.
      if (name === "uistate" && data) {
        uiState = {
          read: data.read === true,
          menu: data.menu === true,
          anyMenu: data.anyMenu === true,
          keys: data.keys === true,
          mode: typeof data.mode === "number" ? data.mode : 0,
          focus: typeof data.focus === "string" ? data.focus : "",
          openUis: typeof data.openUis === "number" ? data.openUis : 0,
          flow: typeof data.flow === "string" ? data.flow : ""
        };
        // El bridge toma el control de la visibilidad. Mientras no llegue un
        // "uistate" la pagina se queda como esta: visible. Por eso el arranque en
        // preview y el apagado son el mismo mecanismo.
        setPanelVisible(uiState.menu);
        // flow decide QUE panel se ve, y hay exactamente uno.
        //
        // REGLA 1 (ver gsis_WebInterface.js): el mod ya garantiza la exclusion, asi
        // que aca no hay nada que decidir — con flow llega el id del menu de
        // proximidad y el inventario se apaga; con flow vacio se ve el inventario.
        // Los dos jamas vienen juntos, y por eso la linea se puede leer como una
        // regla y no como una preferencia: si flow y menu llegan con algo abierto,
        // el mod esta roto y esta pagina no lo puede arreglar.
        setPantalla(uiState.menu ? uiState.flow : "");

        // La pagina reporta su estado al mod, que lo loguea.
        //
        // Sin esto la pagina es ciega para diagnosticar: sus _diag() van a
        // console.log y el runtime NO captura OnConsoleMessage, asi que no quedan
        // en ningun lado. Y lo que hay que ver cuando algo se ve mal es justamente
        // esto: que le llego a la pagina, y que quedo en el DOM despues de
        // procesarlo. Con el mod diciendo "menu=0" y la pagina mostrando un panel,
        // los dos lados tienen que estar en el MISMO log, o la contradiccion se
        // busca a ciegas.
        //
        // "hidden" va porque es la verdad del DOM, no la del intention: el bug de
        // que el panel quedara prendido era setPantalla quitando el hidden que
        // setPanelVisible todavia no habia puesto, y eso solo se ve mirando la
        // clase que quedo, no la que se pidio.
        emitCommand({
          cmd: "ui:diag",
          dice: (uiState.menu ? (uiState.flow || "inventario") : "nada"),
          flow: uiState.flow,
          hidden: panelEl.classList.contains("hidden"),
          menu: uiState.menu
        });
        if (uiState.menu) {
          _diag(uiState.flow ? ("menú " + uiState.flow + " abierto") : "menú abierto — esperando inventario");
        }
      }

      // El mod empuja el inventario troceado en "inv" (no se puede pedir: los
      // scripts JS no reciben eventos).
      if (name === "inv") {
        armarInventario(data);
      }

      // El panel de flujo llega en "screen", tambien troceado. Va aparte del
      // inventario porque son dos paneles que no se ven al mismo tiempo, y
      // mezclar los dos en un solo canal seria mandar el snapshot de la pantalla
      // que no se esta mirando.
      if (name === "screen") {
        const sc = ensamblar("screen", data);
        if (sc) {
          flowData = sc;
          renderFlujo();
        }
      } else if (name === "catalog") {
        // Los datos estaticos llegan troceados, una sola vez, al abrir el menu.
        // Aplicarlos puede cambiar como se ve la tabla que ya esta en pantalla
        // (iconos que faltaban, el peso maximo del subtitulo), asi que redibuja.
        // Solo se diagnostica el ultimo trozo: loguear los 12 intermedios es ruido.
        const cat = ensamblar("catalog", data);
        if (cat) {
          applyCatalog(cat);
          // El catalogo trae las bandas y los iconos de las filas, asi que
          // hay que redibujar: sin esto las filas ya dibujadas quedan con los
          // iconos del catalogo anterior.
          renderFiltro(filtroActualKey);
          // Lo mismo con un menu de proximidad abierto: sus filas leen el MISMO
          // catalogo (crearPane -> snapRow) y el "screen" puede llegar antes que
          // este "catalog" si la tanda de trozos fallo y se reintentó al frame
          // siguiente. REGLA 1: hay una sola pantalla, asi que es uno o el otro.
          if (pantallaActual()) renderFlujo();
          _diag("catálogo: " + catalog.cats.length + " bandas, " +
            Object.keys(catalog.icons).length + " iconos, max " + maxWeight + " kg");
        }
      } else {
        logState();
        console.log("[GSIS] [in] " + name + " " + fmt(jsonable(data)));
      }
    });
  }
}

// --------------------------------------------------------------------- INIT --

// El mock es solo de diseño: se aplica unicamente si NO hay puente, o sea
// cuando la pagina se abre en un navegador. En el juego lo dibuja el mod.
if (!bridgeReady) {
  applyMock();
}

wireKeycaps();

renderFiltro(FILTRO_INICIAL);
logState();

// Arranca CERRADO si hay puente. Antes arrancaba visible y esperaba al "panels"
// para apagarse, o sea que en el juego se veia el menu entera durante los
// frames entre que la pagina carga y que llega el primer mensaje del bridge.
// Con puente no hay nada que mirar todavia (el inventario llega despues), asi
// que arrancar cerrada no pierde nada y elimina el flash.
//
// Sin puente (preview en un navegador) arranca visible, que es lo unico que
// sirve para revisar el diseno a ojo.
setPanelVisible(!bridgeReady);

// El preview arranca en el INVENTARIO y se recorre con Ctrl+flecha: el inventario
// es la pantalla principal y la que esta en pantalla casi siempre, asi que es la
// primera a la que hay que poder volver. El recorrido sale del registro del mock
// (cicloPreview), asi que un menu nuevo se recorre sin tocar este bloque.
//
// El recorrido se arma ACA y no junto a MOCK_FLUJOS porque PANTALLAS se declara
// mas abajo: leerlo antes de su inicializacion mataria el script entero.
if (!bridgeReady) {
  CICLO_PREVIEW = cicloPreview();
  previewVer(mockFlowId());
  _diag("preview: pantallas = " +
    CICLO_PREVIEW.map((id) => id || "inventario").join(", ") +
    " — Ctrl+←/→ para recorrerlas, ?flujo=<id> para abrir una puntual");
}

if (bridgeReady) {
  _diag("conectado al mod — apretá I");
}

// El mod NO puede recibir EVENTOS de CLEO, asi que no hay "ready" ni listeners
// del lado del script. Lo que si hay es el otro extremo del transporte: la
// pagina escribe en la cola de la ASI con emit("cmd:<algo>") y el mod la lee con
// SAWeb_PollCommand una vez por frame. Ver "ACCIONES" en gsis_WebInterface.js.
//
// Por ahi van las acciones (equipar, cinturon, tirar) y tambien ui:close y
// ui:toggle. Los ultimos dos estan ahi por una razon concreta: cuando la pagina
// se queda con el teclado, el WndProc la consume y el juego no ve la tecla, con
// lo que el mod no puede cerrar su propio menu detectando ESC o la I. Ese canal
// no depende del input, asi que funciona siempre.

