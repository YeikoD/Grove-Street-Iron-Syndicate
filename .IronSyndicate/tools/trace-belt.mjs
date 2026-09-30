// trace-belt.mjs - La traza de la R, ejecutada de verdad
//
//   node .IronSyndicate/tools/trace-belt.mjs
//
// Que es
// -----
// Corre la secuencia que reporto el jugador:
//
//   cinturon [8, 15]  ->  R  ->  arma 15  ->  R  ->  arma 8  ->  R
//
// con los archivos REALES del mod (inventory/events.js y weapons/logic.js) y un
// motor falso. No es una simulacion del bug: es el codigo que corre en el juego,
// con las mismas llamadas al bus, ejecutandose en otro runtime.
//
// Que prueba
// ---------
// Si el cinturon pasa de [8, 15] a [15, 15], el defecto esta en el handler del
// swap: la linea que devuelve el cargador montado a la casilla del que entra.
//
// Y descarta la otra mitad: cada pulsacion de R es un BEGIN/END. Si un BEGIN
// aparece sin su END antes del siguiente BEGIN, es doble entrada por pulsacion,
// que es un bug distinto y del que no es responsable el handler.

import {
    resetEngine, elMotor, CAPACIDADES, saberFamilias
} from "./fake-engine.mjs";

const MOD = "../../modloader/IronSyndicate/cleo/IronSyndicate";

const W = await import(`${MOD}/data/gsis_weapons.js`);
await import(`${MOD}/modules/inventory/index.js`);
const Inventory = await import(`${MOD}/modules/inventory/index.js`);
await import(`${MOD}/modules/weapons/index.js`);
const Logic = await import(`${MOD}/modules/weapons/logic.js`);
const State = await import(`${MOD}/modules/weapons/state.js`);
const { setModuleData } = await import(`${MOD}/core/gsis_SaveManager.js`);

const famPorTipo = {};
for (const v of W.WEAPON_VARIANTS) famPorTipo[v.weaponType] = v.family;
const SLOT_DE = {};
for (const fam of ["colt45"]) SLOT_DE[fam] = W.getFamilyById(fam).slot;
saberFamilias(famPorTipo, SLOT_DE);

// El log del modulo va a la consola, que es lo que interesa: aca se ve la traza
// en el orden en que la escriben los dos modulos, que es el orden en que ocurre.
function arrancar() {
    resetEngine(CAPACIDADES);
    State.setEquipped({});
    setModuleData("ItemManager", { items: [], trunks: {}, belt: [] });
}

// El log del modulo: el fake engine lo captura en un array en vez de mandarlo a
// la consola, asi que hay que ir a buscarlo ahi.
function volcarLog() {
    for (const l of elMotor().log) console.log("    " + l);
    elMotor().log.length = 0;
}

function cinturon() {
    return Inventory.getBelt().filter(Boolean)
        .map(i => i.id + "(" + i.ammo + ")").join(" ") || "VACIO";
}

function estado(etiqueta) {
    const enMano = elMotor().slots[SLOT_DE.colt45] || 0;
    const e = State.getEntry(SLOT_DE.colt45);
    const att = e ? (e.attachments || []).join("+") : "-";
    console.log("  " + etiqueta + ": arma=" + enMano + " [" + att + "]  cinturon=[" +
        cinturon() + "]");
    volcarLog();
}

console.log("\n################ LA SECUENCIA DEL JUGADOR ################\n");

arrancar();
Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
Inventory.addItem("suppressor", 1);
Logic.equipWeapon("colt45", ["suppressor"]);

// Los dos cargadores: uno de 8 (de fabrica, needsVariant false) y uno de 15.
Inventory.addItem("mag_colt45", 1, Inventory.entregaOpts("mag_colt45"));
Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
const a = Inventory.equipMagToBelt("mag_colt45");
const b = Inventory.equipMagToBelt("mag_colt45_extended");
console.log("  equipMagToBelt: el de 8 -> " + a + ", el de 15 -> " + b);
console.log("  el cinturon mide " + Inventory.getBelt().length + " casillas");
volcarLog();
console.log("");

for (let r = 1; r <= 3; r++) {
    console.log("---------------- R #" + r + " ----------------");
    Logic.tryReload();
    estado("  despues");
    console.log("");
}

// Y una comprobacion que no depende de leer el log: el cinturon NO puede perder un
// cargador. El conteo OSCILA entre 1 y 2 segun haya uno montado en el arma, y eso
// es correcto; lo que nunca puede pasar es que el de 8 deje de estar.
console.log("################ CONTROL FINAL ################\n");
console.log("  El cinturon tiene 2 cargadores fisicos. El conteo de 1 a 2 es normal:");
console.log("  uno esta en el arma. Lo que no puede pasar es que el de 8 desaparezca.\n");
arrancar();
Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
Inventory.addItem("suppressor", 1);
Logic.equipWeapon("colt45", ["suppressor"]);
Inventory.addItem("mag_colt45", 1, Inventory.entregaOpts("mag_colt45"));
Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
Inventory.equipMagToBelt("mag_colt45");
Inventory.equipMagToBelt("mag_colt45_extended");
elMotor().log.length = 0;
let roto = 0;
for (let r = 1; r <= 6; r++) {
    Logic.tryReload();
    const b = Inventory.getBelt().filter(Boolean);
    const de8 = b.filter(i => i.id === "mag_colt45").length;
    const de15 = b.filter(i => i.id === "mag_colt45_extended").length;
    const mal = de8 !== 1 || (de8 + de15 !== b.length) || b.length > 2;
    if (mal) roto++;
    console.log("  tras R #" + r + ": total=" + b.length +
        "  de8=" + de8 + "  de15=" + de15 + (mal ? "   <-- ROTO" : "   ok"));
}
console.log("");
console.log(roto === 0
    ? "  RESULTADO: ningun cargador se perdio en 6 pulsaciones."
    : "  RESULTADO: " + roto + " pulsaciones con el cinturon roto.");
console.log("");

