// IronSyndicate — Interfaz web
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// IronSyndicate Web UI - Cliente del panel
//
// Estructura calcada de modloader\SAWebUI\web\app.js para que el panel se vea
// igual que el ejemplo. Lo que cambia es el contenido (las 7 pestañas son los
// paneles del mod) y el final del archivo, donde vive el puente con CLEO.
//
// Contrato con cleo\IronSyndicate\ui\gsis_WebBridge.js:
//
//   LA PAGINA NO MANDA NADA. En CLEO Redux 1.5.0 los scripts JS no reciben
//   eventos: asyncWait no reanuda, setTimeout/setInterval no disparan y
//   addEventListener nunca entrega (probado el 26/09 con cleo\zz_sonda.js). O
//   sea que la pagina -> CLEO esta muerta y no hay nada que عليها inventar.
//
//   CLEO -> pagina   receive("input",  { enabled: bool })     cursor + teclado
//                    receive("panels", { menu: bool })       que seccion mostrar
//                    receive("inv",    { i, n, d })          inventario troceado
//                    receive("toast",  { text, tone })
//                    receive("ping",   {})                    una vez por segundo
//
//   El "inv" llega partido porque el dataJson de SAWEB_SEND_EVENT tiene ~255
//   caracteres utiles y el snapshot ronda los 1700. La pagina lo arma sola en
//   armarInventario().
//
// ARRANQUE. Sin puente (abierto en un navegador normal) la pagina arranca
// VISIBLE y con el mock de diseño, para poder revisarla a ojo. Con puente
// arranca CERRADA y vacía, esperando que el mod le empuje el inventario.
// ============================================================================

const INBOUND = ["input", "panels", "inv", "toast", "ping"];
const EMIT_THROTTLE_MS = 100;

const bridgeReady = !!(window.SAWeb && window.SAWeb.hasBridge);

const panelEl = document.getElementById("panel");
const rowsBox = document.getElementById("rows");
const tabsBox = document.getElementById("tabs");
const tutBox = document.getElementById("tutorial-box");
const tutTitle = document.getElementById("tut-title");
const tutContent = document.getElementById("tut-content");
const tutClose = document.getElementById("tut-close");
const tutAction = document.getElementById("tut-action");
const navPrev = document.getElementById("nav-prev");
const navNext = document.getElementById("nav-next");

let currentTab = "inventory";
let selectedIndex = 0;
let lastEmitAt = 0;
let focused = false;

// La pagina NO puede saber si el teclado le llega. En la ASI el teclado cuelga
// del mismo modo que el cursor (SAWEB_SET_CURSOR) y ese comando no se puede
// llamar desde aca: solo el script lo maneja. Por eso arranca en false, que es
// el default de la ASI, y el bridge le manda el estado con el evento "input".
let inputOn = false;

// ---------------------------------------------------------------- TAB DATA --
//
// Cada fila es un item pendiente de la v2: "que lee" y "que hace". Sirven de
// checklist del port y de placeholder con la misma caja que usaran los datos.

function row(id, label, info) {
  return {
    id,
    label,
    kind: "fixed",
    value: 1,
    readonly: true,
    text: () => info,
    tutorial: {
      title: label,
      html: `<p><span class="badge badge--warn">Fase 2</span> Esta fila todavia no lee nada del juego. Es el placeholder con la caja definitiva.</p>
             <p>El texto de la derecha dice que tiene que mostrar cuando la fila este viva.</p>`
    }
  };
}

// Solo las 3 pestañas del menu principal. Baul / Armeria / Retiro / Trueque no
// entran aca: son ventanas flotantes que se abren por proximidad (esfera del
// baul, tecla F en el dealer), no pestanas. Por eso no tienen boton. Si
// estuvieran aca, switchTab() las recorreria con las flechas y aterrizaria en
// una pestana inexistente.
//
// Lo que va a necesitar cada overlay, para cuando se armen:
//   Baul    getTrunkItems / getTrunkWeight / getTrunkMaxCapacity
//           addToTrunk / removeFromTrunk, Transferencia en dos pasos
//   Armeria getDealerPrice(id, charId) / getCart() / getCartTotal()
//           addToCart / checkout() -> emit dealer:orderReady
//   Retiro  getOrder() / removeFromOrder() + addItem() del modulo
//           "recoger todo" valida el peso ANTES de mutar
//   Trueque getSellState() / offerWeapon() + removeItem() + addScore()
//           el presupuesto del comprador se oculta hasta la 1ra oferta
const TABS = {
  inventory: {
    label: "Inventario",
    // Vacio por ahora. Lo que va a mostrar, cuando se arme:
    //   getDirtyMoney() / getTotalWeight() contra MISC.MAX_INVENTORY_WEIGHT
    //   getItems() con ITEMS[id] para nombre, peso y tipo
    //   master-detail con la lista a la izquierda y el inspector a la derecha
    //   getEquipped() y getBelt() como tira de equipo arriba
    // Ojo: los items instanciados (cargadores, armas con cargador) son un
    // elemento del array por unidad, con {id, qty:1, ammo, quality}. Los
    // materiales si se apilan como {id, qty:N}.
    rows: []
  },
  properties: {
    label: "Propiedades",
    rows: [
      row("prp_money", "Dinero sucio", "$0 — getDirtyMoney()"),
      row("prp_list", "Catalogo", "listProperties()"),
      row("prp_buy", "Comprar", "buyProperty(id) — cleanMoney")
    ]
  },
  vehicles: {
    label: "Vehiculos",
    rows: [
      row("veh_list", "Flota registrada", "getModuleData('VehicleModule')"),
      row("veh_detail", "Detalle", "modelo, salud, motor, lock, color"),
      row("veh_gps", "Ubicar en mapa", "SIN IMPLEMENTAR en el ImGui viejo")
    ]
  }
};

// ------------------------------------------------------------------ MOCK --
//
// Datos de EJEMPLO para revisar el diseño en el navegador. No son del juego y
// no se mandan nunca por el puente: en el juego lo que dibuja las filas son
// los datos que mande el mod. Se cae solo apenas el puente se conecta
// (ver dropMock).

const MOCK_MAX_WEIGHT = 12; // MISC.MAX_INVENTORY_WEIGHT del mod

// Orden de las bandas de grupo. Es el mismo orden que usaba el menu de baul
// del ImGui viejo, y el que corresponde a weapon > magazine > material.
const CATS = [
  { key: "weapon", label: "Armas" },
  { key: "magazine", label: "Cargadores" },
  { key: "material", label: "Materiales" }
];

// Imagenes de modloader\IronSyndicate\image\. Son 18 PNG y TODAS de armas:
// materiales y cargadores no tienen. WEAPON_DATA no tiene campo "icon", asi
// que el mapa es a mano y hay que mantenerlo en sync con el catalogo.
const ICONS = {
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
  "minigun": "minigun.png"
  // body_armor no tiene icono, y satchelCharge.png no corresponde a ningun
  // item del catalogo: son los dos huecosknown del set.
};

const ICON_DIR = "../image/";

// Fila de la tabla de inventario. Todo lo que KCD pone en columnas numericas va
// como numero o null; null se dibuja como guion para que la columna se siga
// leyendo como columna.
function itemRow(o) {
  return {
    id: o.id,
    kind: "table",
    cat: o.cat,
    name: o.qty > 1 ? o.name + " x" + o.qty : o.name,
    qty: o.qty,
    ammo: o.ammo || null,
    weight: o.weight,
    value: o.value || null,
    icon: ICONS[o.id] || null,
    tip: o.tipExtra || "",
    tutorial: {
      title: o.name,
      html: `<p><span class="badge badge-warn">Mock</span> Fila de ejemplo, no viene del juego.</p>
             <p>Peso: <b>${o.weight.toFixed(1)} kg</b> de ${MOCK_MAX_WEIGHT} kg de capacidad.</p>
             <p>${o.qty > 1 ? "Apilado: " + o.qty + " unidades en una fila." : "Instanciado: una fila por unidad."}</p>`
    }
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

let mockActive = false;

function applyMock() {
  mockActive = true;
  for (const tab of Object.keys(MOCK)) {
    TABS[tab].rows = MOCK[tab];
  }
  stateMap = buildStateMap();
}

// En el juego el mock no debe aparecer ni un frame. Se cae en cuanto el puente
// se anuncia, no cuando la pagina decide: si la pagina esta viva, el puente
// ya esta inyectado.
function dropMock() {
  if (!mockActive) return false;
  mockActive = false;
  for (const tab of Object.keys(MOCK)) {
    TABS[tab].rows = [];
  }
  stateMap = buildStateMap();
  console.log("[GSIS] mock de diseño eliminado — ahora las filas vienen del mod");
  return true;
}

// State Map para renderizado
function buildStateMap() {
  const m = {};
  for (const tabKey in TABS) {
    m[tabKey] = TABS[tabKey].rows.map((r) => ({ ...r, el: null, fill: null, meter: null }));
  }
  return m;
}

let stateMap = buildStateMap();

// -------------------------------------------------- INVENTARIO REAL DEL MOD --
//
// El mock de arriba es solo de diseño. Cuando hay puente, las filas son las que
// manda gsis_WebData.js con snapInventory(), empujadas por el mod en "inv" y
// armadas aca. snapRow() convierte la fila del snapshot a la misma forma que
// produce itemRow(), asi el render es uno solo para las dos fuentes.
//
// El snapshot ya trae los textos en español y el tip armado: la pagina no
// consulta ITEMS ni WEAPON_DATA, no los tiene.

function snapRow(o) {
  const instanciado = o.qty <= 1;
  return {
    id: o.id,
    kind: "table",
    cat: o.cat,
    name: o.qty > 1 ? o.name + " x" + o.qty : o.name,
    qty: o.qty,
    ammo: o.ammo === undefined ? null : o.ammo,
    weight: o.weight,
    value: o.value === undefined ? null : o.value,
    icon: ICONS[o.id] || null,
    tip: o.tip || "",
    tutorial: {
      title: o.name,
      html:
        `<p>${o.tip || "Sin detalle."}</p>` +
        `<p>Peso: <b>${Number(o.weight).toFixed(1)} kg</b> — ${instanciado ? "una fila por unidad." : "apilado: " + o.qty + " unidades."}</p>` +
        (o.ammo !== null && o.ammo !== undefined ? `<p>Municion: <b>${o.ammo}</b></p>` : "") +
        (o.value ? `<p>Valor: <b>$${o.value}</b></p>` : ""),
      actionLabel: instanciado && o.cat === "weapon" ? "Equipar" : null,
      action: instanciado && o.cat === "weapon" ? () => emit("cmd", { cmd: "inv:equip", id: o.id }) : null
    }
  };
}

const subtitleEl = document.getElementById("subtitle");
const toastEl = document.getElementById("toast");
let toastTimer = null;

// El peso del subtitulo lo escribe el mod, no la pagina: es el unico que sabe
// cuanto entra y cuanto pesa.
function setInventory(inv) {
  if (!inv) return;
  TABS.inventory.rows = (inv.rows || []).map(snapRow);
  if (subtitleEl) {
    subtitleEl.textContent =
      "Peso: " + Number(inv.weight || 0).toFixed(1) + "kg/" + Number(inv.maxWeight || 0) + "kg";
  }
  stateMap = buildStateMap();
  if (currentTab === "inventory") {
    renderTab("inventory");
  }
}

// ------------------------------------------------- ARMADO DE TROZOS --
//
// El mod no puede mandarme un evento: en CLEO Redux 1.5.0 los scripts JS no
// reciben eventos (probado el 26/09, ver gsis_WebBridge.js). La unica direccion
// que funciona es mod -> pagina, asi que el mod empuja el snapshot.
//
// Y no lo manda entero: el dataJson de SAWEB_SEND_EVENT viaja como string de
// parametro de comando CLEO y el tope duro son 255 chars (GetStringParam con
// maxlen unsigned char). El snapshot ronda los 3000, asi que llega partido en
// "inv" con {i, n, d} y hay que armarlo aca.
//
// Cada parte reinicia el buffer porque el snapshot es siempre entero: si llegara
// una tanda incompleta (el juego cerrado a mitad), al proximo snapshot completo
// el buffer se pisa solo igual.
let _invPartes = [];
let _invEsperadas = 0;

// Diagnostico del transporte. Antes vivia en el DOM (#diag) y se leia abajo del
// panel, encimandose con los botones de navegacion. Se saco de la pantalla: lo
// que queda va a console, que es donde ya mandaba el resto del debugging de
// este puente.
function _diag(text) {
  console.log("[GSIS] " + text);
}

function armarInventario(data) {
  if (!data || typeof data.i !== "number" || typeof data.n !== "number") {
    _diag("llegó 'inv' con forma rara: " + JSON.stringify(data).slice(0, 60));
    return;
  }
  if (data.i === 0) {
    _invPartes = [];
    _invEsperadas = data.n;
  }
  if (data.n !== _invEsperadas) {
    _diag("tanda inconsistente: n=" + data.n + " esperaba " + _invEsperadas);
    return;
  }
  _invPartes[data.i] = data.d || "";

  if (_invPartes.length < _invEsperadas) {
    _diag("recibiendo inventario: " + _invPartes.length + "/" + _invEsperadas + " trozos");
    return;
  }
  for (let k = 0; k < _invEsperadas; k++) {
    if (typeof _invPartes[k] !== "string") {
      _diag("falta el trozo " + k + " de " + _invEsperadas);
      return;
    }
  }

  const json = _invPartes.join("");
  _invPartes = [];
  _invEsperadas = 0;
  try {
    const inv = JSON.parse(json);
    setInventory(inv);
    _diag("inventario: " + (inv.rows ? inv.rows.length : 0) + " items, " +
      (inv.weight || 0).toFixed(1) + "/" + (inv.maxWeight || 0) + " kg");
  } catch (e) {
    // OJO: esto es lo que pasaba en silencio. Un dataJson truncado arma una
    // string rota aqui adentro y el menu queda vacio sin decir nada.
    _diag("JSON inválido (" + json.length + " chars): " + e.message);
  }
}

// El toast es la unica superficie para texto que viene del mod sin abrir un
// panel encima del panel.
function showToast(text, tone) {
  if (!toastEl || !text) return;
  toastEl.className = "toast toast--" + (tone || "info");
  toastEl.textContent = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2600);
}

// ---------------------------------------------------------------- HELPERS --

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

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

function setBar(r, ratio) {
  if (r.fill) {
    r.fill.style.width = (clamp01(ratio) * 100).toFixed(2) + "%";
  }
}

function getRowState(id) {
  for (const tabKey in stateMap) {
    const found = stateMap[tabKey].find((r) => r.id === id);
    if (found) return found;
  }
  return null;
}

// Sin la franja inferior no hay donde dibujar el estado, asi que el log del
// puente y del input va a la consola. Es la unica forma de ver el ida y vuelta
// del bridge con el puente puesto.
function logEvent(label, incoming) {
  console.log((incoming ? "[IN ] " : "[OUT] ") + label);
}

function logState() {
  if (!bridgeReady) {
    console.log("[GSIS] preview (sin puente)");
    return;
  }
  if (!inputOn) {
    // Con el teclado apagado el juego se lo quedo. F12 lo prende.
    console.log("[GSIS] input OFF — F12 lo prende");
    return;
  }
  if (!focused) {
    console.log("[GSIS] input ON — falta click para tomar el foco");
    return;
  }
  console.log("[GSIS] listo");
}

function emit(name, data) {
  if (!bridgeReady) {
    logEvent(name + " (preview)", false);
    return false;
  }
  const ok = window.SAWeb.emit(name, data) !== false;
  logEvent(name + " " + fmt(jsonable(data)), !ok);
  return ok;
}

// El browser NUNCA se cierra. La pagina se oculta y se muestra por classe, asi
// que el DOM sigue vivo, los listeners siguen_atados y el tick() sigue corriendo
// a 60fps aunque no haya nada visible.
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

// ---------------------------------------------------------------- TUTORIAL --

function showTutorial(r) {
  if (!r || !r.tutorial) return;

  tutTitle.textContent = r.tutorial.title;
  tutContent.innerHTML = r.tutorial.html;

  if (r.tutorial.actionLabel && r.tutorial.action) {
    tutAction.style.display = "inline-block";
    tutAction.textContent = r.tutorial.actionLabel;
    tutAction.onclick = () => r.tutorial.action();
  } else {
    tutAction.style.display = "none";
  }

  tutBox.classList.remove("hidden");
}

function hideTutorial() {
  tutBox.classList.add("hidden");
}

tutClose.addEventListener("click", hideTutorial);

// ------------------------------------------------------------------ RENDER --

function buildRow(r) {
  const el = document.createElement("div");
  el.className = "row";
  el.setAttribute("role", "option");
  el.dataset.id = r.id;

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = r.label;
  el.appendChild(label);

  // El estado del meter es una clase propia sobre el .meter, no un
  // descendiente: la especificidad queda en una sola clase y el orden de la
  // hoja deja de importar. Un mock o una fila real pueden pedir un estado
  // semantico; si no lo piden, cae en el gris de solo lectura.
  const track = document.createElement("div");
  if (r.meterState) {
    track.className = "meter meter--" + r.meterState;
  } else {
    track.className = r.readonly ? "meter meter--readonly" : "meter";
  }

  const fill = document.createElement("div");
  fill.className = "meter__fill";
  track.appendChild(fill);
  r.meter = track;
  r.fill = fill;

  el.appendChild(track);

  if (r.tip) {
    el.title = r.tip;
  }

  el.addEventListener("click", () => {
    const rows = stateMap[currentTab];
    const idx = rows.indexOf(r);
    if (idx !== -1) {
      selectRow(idx);
      showTutorial(r);
    }
  });

  r.el = el;
  return el;
}

// Celda numerica. Un dato ausente se dibuja como guion y no como celda vacia:
// si la celda desapareciera, la columna dejaria de leerse como columna.
function cell(text) {
  const c = document.createElement("span");
  c.className = text == null ? "table__num table__num--none" : "table__num";
  c.textContent = text == null ? "—" : text;
  return c;
}

function buildTableRow(r) {
  const el = document.createElement("div");
  el.className = "table__row";
  el.setAttribute("role", "option");
  el.dataset.id = r.id;

  // El slot vacio mantiene la columna alineada cuando el item no tiene icono
  // (materiales y cargadores no tienen) en vez de correr todo a la izquierda.
  if (r.icon) {
    const img = document.createElement("img");
    img.className = "table__icon";
    img.src = ICON_DIR + r.icon;
    img.alt = "";
    el.appendChild(img);
  } else {
    const slot = document.createElement("div");
    slot.className = "table__icon-slot";
    el.appendChild(slot);
  }

  const name = document.createElement("span");
  name.className = "table__name";
  name.textContent = r.name;
  el.appendChild(name);

  el.appendChild(cell(r.qty != null ? String(r.qty) : null));
  el.appendChild(cell(r.ammo));
  el.appendChild(cell(r.weight != null ? r.weight.toFixed(1) : null));
  el.appendChild(cell(r.value != null ? "$" + r.value : null));

  if (r.tip) {
    el.title = r.tip;
  }

  el.addEventListener("click", () => {
    const rows = stateMap[currentTab];
    const idx = rows.indexOf(r);
    if (idx !== -1) {
      selectRow(idx);
      showTutorial(r);
    }
  });

  r.el = el;
  return el;
}

// Tabla KCD: cabecera, y despues una banda por categoria con sus filas debajo.
// El orden de las bandas sale de CATS, no del orden del array, asi las filas
// quedan agrupadas aunque el mod las mande mezcladas.
function renderTable(rows) {
  const wrap = document.createElement("div");
  wrap.className = "table";

  const head = document.createElement("div");
  head.className = "table__head";
  for (const h of ["", "Objeto", "Cant", "Balas", "Peso", "Valor"]) {
    const c = document.createElement("span");
    if (h !== "Objeto") {
      c.className = "table__num";
    }
    c.textContent = h;
    head.appendChild(c);
  }
  wrap.appendChild(head);

  for (const cat of CATS) {
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
      wrap.appendChild(buildTableRow(r));
    }
  }

  rowsBox.appendChild(wrap);
}

function renderTab(tabKey) {
  currentTab = tabKey;
  rowsBox.innerHTML = "";

  const rows = stateMap[tabKey];

  // Cada pestana elige su renderer por la forma de sus filas. El inventario es
  // tabla; propiedades y vehiculos son listas simples con barra.
  if (rows.length > 0 && rows[0].kind === "table") {
    renderTable(rows);
  } else {
    for (const r of rows) {
      rowsBox.appendChild(buildRow(r));
      setBar(r, Number(r.value) || 1);
    }
  }

  // Por data-tab y no por la classe: el selector queda estable aunque la
  // receta .btn cambie de nombre o las variantes se reorganicen.
  const tabBtns = tabsBox.querySelectorAll("[data-tab]");
  tabBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabKey);
  });

  selectRow(0);
}

function selectRow(index) {
  const rows = stateMap[currentTab];
  if (!rows || rows.length === 0) return;

  selectedIndex = (index + rows.length) % rows.length;
  for (const [i, r] of rows.entries()) {
    if (!r.el) continue;
    // Cada sistema de fila tiene su clase de seleccion. El estado va como
    // clase propia y no como descendiente, asi la especificidad queda en una
    // sola clase y el orden de la hoja deja de importar.
    const isTable = r.kind === "table";
    r.el.classList.toggle(isTable ? "table__row--selected" : "selected", i === selectedIndex);
    r.el.setAttribute("aria-selected", i === selectedIndex ? "true" : "false");
    if (r.meter) {
      r.meter.classList.toggle("meter--selected", i === selectedIndex);
    }
  }
}

function stepRow(dir) {
  selectRow(selectedIndex + dir);
}

function switchTab(dir) {
  const tabKeys = Object.keys(TABS);
  const curIdx = tabKeys.indexOf(currentTab);
  const nextIdx = (curIdx + dir + tabKeys.length) % tabKeys.length;
  renderTab(tabKeys[nextIdx]);
}

// ----------------------------------------------------------- TECLADO & EVENTOS --

tabsBox.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (btn && btn.dataset.tab) {
    renderTab(btn.dataset.tab);
  }
});

navPrev.addEventListener("click", () => switchTab(-1));
navNext.addEventListener("click", () => switchTab(1));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideTutorial();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    stepRow(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    stepRow(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const rows = stateMap[currentTab];
    if (rows && rows[selectedIndex]) {
      showTutorial(rows[selectedIndex]);
    }
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    switchTab(e.key === "ArrowRight" ? 1 : -1);
  } else if (e.key.toLowerCase() === "q" || e.key.toLowerCase() === "e") {
    e.preventDefault();
    switchTab(e.key.toLowerCase() === "e" ? 1 : -1);
  }
});

// Con el teclado apagado el click NO marca foco: mostrar "HACE CLICK" mientras
// el teclado sigue OFF seria mentira, porque el click no cambia nada del lado
// del input. El aviso de F12 tiene que seguir ahi.
document.addEventListener("mousedown", () => {
  if (!bridgeReady || !inputOn) {
    return;
  }
  focused = true;
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
        renderTab(currentTab);
      }

      // El script avisa si el input de la UI quedo prendido o apagado (prende lo
      // mismo que el cursor, con F12). Es la unica fuente de verdad aca.
      if (name === "input" && data && typeof data.enabled === "boolean") {
        inputOn = data.enabled;
        // Al prender el teclado hay que volver a pedir foco con un click: el
        // click anterior pudo haber ocurrido con el teclado apagado.
        if (inputOn) {
          focused = false;
        }
      }

      // Aca el bridge toma el control de la visibilidad. Mientras no llegue un
      // "panels" la pagina se queda como esta: visible. Por eso el arranque en
      // preview y el apagado son el mismo mecanismo.
      if (name === "panels" && data && typeof data.menu === "boolean") {
        setPanelVisible(data.menu);
        if (data.menu) {
          _diag("menú abierto — esperando inventario");
        }
      }

      // El mod empuja el inventario troceado en "inv" (no se puede pedir: los
      // scripts JS no reciben eventos).
      if (name === "inv") {
        armarInventario(data);
      }

      if (name === "ping") {
        window.SAWeb.emit("pong", { at: Date.now() });
      }

      logState();
      logEvent(name + " " + fmt(jsonable(data)), true);
    });
  }
}

// -------------------------------------------------------------------- FRAME --

let frames = 0;
let fpsAt = performance.now();

function tick() {
  frames++;

  const now = performance.now();
  if (now - fpsAt >= 1000) {
    lastEmitAt = now;
    frames = 0;
    fpsAt = now;
  }
}

if (window.SAWeb) {
  window.SAWeb.tick = tick;
}

// --------------------------------------------------------------------- INIT --

// El mock es solo de diseño: se aplica unicamente si NO hay puente, o sea
// cuando la pagina se abre en un navegador. En el juego lo dibuja el mod.
if (!bridgeReady) {
  applyMock();
}

renderTab("inventory");
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

if (bridgeReady) {
  _diag("conectado al mod — apretá I");
}

// El mod NO puede recibir eventos, asi que la pagina no manda nada: no hay
// "ready", no hay "cmd", no hay "inv:get". Todo es de una sola via: el mod
// empuja "panels" e "inv" y la pagina reacciona. Ver gsis_WebBridge.js.
//
// Las acciones (equipar, cinturon) NO funcionan: no hay canal de vuelta de la
// pagina al mod. El inventario es de solo lectura. Ver "ACCIONES" en
// gsis_WebBridge.js.
