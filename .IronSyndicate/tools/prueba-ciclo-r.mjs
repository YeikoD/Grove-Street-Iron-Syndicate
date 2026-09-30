// prueba-ciclo-r.mjs - La prueba manual del ciclo, automatizada
//
//   node .IronSyndicate/tools/prueba-ciclo-r.mjs
//
// La secuencia que hay que hacer a mano en el juego, con el motor falso:
//
//   cinturon [8, 15], silenciadora  ->  R  ->  15  ->  R  ->  8  ->  R  ->  15
//
// Y en cada paso, lo que un jugador mira: el arma en la mano, las balas, y quantos
// cargadores fisicos quedan. Porque un ciclo que "anda" y un ciclo que CONSERVA los
// cargadores son dos cosas distintas, y la segunda es la que se rompio.

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
const { reconcile } = await import(`${MOD}/modules/weapons/reconcile.js`);
const { setModuleData } = await import(`${MOD}/core/gsis_SaveManager.js`);

const famPorTipo = {};
for (const v of W.WEAPON_VARIANTS) famPorTipo[v.weaponType] = v.family;
const SLOT = W.getFamilyById("colt45").slot;
saberFamilias(famPorTipo, { colt45: SLOT });

const NOMBRE = { 60: "silenciadora 8", 61: "silenciadora 15", 62: "Colt 15", 63: "Colt 8" };
let fallos = 0;

function ok(cond, msg, extra) {
    console.log("   " + (cond ? "ok  " : "FALLA") + " " + msg +
        (extra !== undefined ? "   -> " + JSON.stringify(extra) : ""));
    if (!cond) fallos++;
}

function escenario() {
    resetEngine(CAPACIDADES);
    State.setEquipped({});
    setModuleData("ItemManager", { items: [], trunks: {}, belt: [] });
    elMotor().log.length = 0;
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
    Inventory.addItem("suppressor", 1);
    Logic.equipWeapon("colt45", ["suppressor"]);
    Inventory.addItem("mag_colt45", 1, Inventory.entregaOpts("mag_colt45"));
    Inventory.addItem("mag_colt45_extended", 1,
        Inventory.entregaOpts("mag_colt45_extended"));
    Inventory.equipMagToBelt("mag_colt45");
    Inventory.equipMagToBelt("mag_colt45_extended");
}

// Lo que ve el jugador: el arma, las balas, y los cargadores que le quedan.
function mirar() {
    const arma = elMotor().slots[SLOT] || 0;
    const e = State.getEntry(SLOT);
    const b = Inventory.getBelt().filter(Boolean);
    return {
        arma: arma,
        nombre: NOMBRE[arma] || String(arma),
        ammo: elMotor().ammo[arma] || 0,
        cargador: e ? (e.attachments || []).filter(a => a.indexOf("mag_") === 0).join("+") : "-",
        cinturon: b.map(i => i.id + "(" + i.ammo + ")"),
        total: b.length,
        de8: b.filter(i => i.id === "mag_colt45").length,
        de15: b.filter(i => i.id === "mag_colt45_extended").length
    };
}

function R() {
    Logic.tryReload();
    reconcile();   // un frame, como en el juego
    return mirar();
}

console.log("\n########## LA PRUEBA DEL CICLO, PASO A PASO ##########\n");

escenario();
let s = mirar();
console.log("  INICIAL");
console.log("      arma " + s.arma + " (" + s.nombre + ")  " + s.ammo + " balas  " +
    "cargador=[" + s.cargador + "]  cinturon=[" + s.cinturon.join(" ") + "]");
ok(s.arma === 60, "arranca en la silenciadora de 8", s.arma);
ok(s.total === 2, "con los dos cargadores en el cinturon", s.total);
console.log("");

const esperado = [
    { paso: "R #1", arma: 61, total: 1, de8: 1, de15: 0 },
    { paso: "R #2", arma: 60, total: 2, de8: 1, de15: 1 },
    { paso: "R #3", arma: 61, total: 1, de8: 1, de15: 0 }
];

for (const e of esperado) {
    s = R();
    console.log("  " + e.paso);
    console.log("      arma " + s.arma + " (" + s.nombre + ")  " + s.ammo + " balas  " +
        "cargador=[" + s.cargador + "]  cinturon=[" + s.cinturon.join(" ") + "]");
    ok(s.arma === e.arma, "el arma es la " + e.arma + " (" + e.paso + ")", s.arma);
    ok(s.total === e.total, "el cinturon tiene " + e.total, s.total);
    ok(s.de8 === e.de8, "el cargador de 8 no desaparece", s.de8);
    ok(s.de15 === e.de15, "los de 15 son " + e.de15, s.de15);
    console.log("");
}

// Y el invariante que importa mas que todo: en N pulsaciones no se pierde NADA.
console.log("  12 PULSACIONES MAS, buscando una perdida");
escenario();
for (let i = 0; i < 12; i++) R();
s = mirar();
ok(s.de8 === 1, "el cargador de 8 sigue en el cinturon", s.de8);
ok(s.total === 1 || s.total === 2, "el cinturon tiene 1 o 2 (uno puede estar en el arma)", s.total);
ok(s.arma === 60 || s.arma === 61, "y el arma es siempre de la familia silenciada", s.arma);

console.log("\n########## RESULTADO: " +
    (fallos === 0 ? "el ciclo funciona y no pierde nada" : fallos + " FALLAS") + " ##########\n");
process.exit(fallos === 0 ? 0 : 1);
