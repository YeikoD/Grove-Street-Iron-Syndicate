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
//   pagina -> CLEO   emit("ready", { ui: "main" })
//                    emit("cmd",   { cmd: "<nombre>", ...args })
//
//   CLEO -> pagina   receive("input",  { enabled: bool })     cursor + teclado
//                    receive("panels", { menu: bool, ... })  que seccion mostrar
//                    receive("state",  { ... })               datos del panel
//                    receive("toast",  { key | text, params })
//                    receive("l10n",   { es: {...}, en: {...} })
//                    receive("reply",  { cmd, ok, data | error })
//
// ARRANQUE. La pagina arranca VISIBLE a proposito: abierta en un navegador
// normal se puede ver y navegar el panel entero sin el juego. Cuando el CLEO
// levanta el bridge, este manda "panels" y ahi si la visibilidad pasa a ser de
// la pagina. La ausencia de puente es el modo preview, no un error.
// ============================================================================

const INBOUND = ["ready", "input", "panels", "state", "toast", "l10n", "ping", "reply"];
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

// State Map para renderizado
const stateMap = {};

for (const tabKey in TABS) {
  stateMap[tabKey] = TABS[tabKey].rows.map((r) => ({ ...r, el: null, fill: null, input: null }));
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
function setPanelVisible(visible) {
  panelEl.classList.toggle("hidden", !visible);
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

  const track = document.createElement("div");
  track.className = r.readonly ? "meter meter--readonly" : "meter";

  const fill = document.createElement("div");
  fill.className = "meter__fill";
  track.appendChild(fill);
  r.meter = track;
  r.fill = fill;

  el.appendChild(track);

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

function renderTab(tabKey) {
  currentTab = tabKey;
  rowsBox.innerHTML = "";

  const rows = stateMap[tabKey];
  for (const r of rows) {
    rowsBox.appendChild(buildRow(r));
    setBar(r, Number(r.value) || 1);
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
    if (r.el) {
      r.el.classList.toggle("selected", i === selectedIndex);
      r.el.setAttribute("aria-selected", i === selectedIndex ? "true" : "false");
    }
    // El estado de la barra va como clase propia sobre el .meter, no como
    // descendiente (.row.selected .meter__fill). Asi la especificidad es de
    // una sola clase y el orden de la hoja deja de importar.
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

renderTab("inventory");
logState();

// Arranca visible. En el navegador se ve el panel entero para poder revisarlo;
// en el juego el bridge manda "panels" apenas la pagina dice "ready" y la
// apaga hasta que el jugador apriete I.
setPanelVisible(true);

if (bridgeReady) {
  emit("ready", { ui: "main", mode: "gsis_web_ui" });
}
