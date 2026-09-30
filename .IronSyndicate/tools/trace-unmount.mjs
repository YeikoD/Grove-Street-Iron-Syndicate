// trace-unmount.mjs - Quitar el silenciador: que cambia y que NO
//
//   node .IronSyndicate/tools/trace-unmount.mjs
//
// Corre el ciclo real de la pagina: equipar la silenciadora, sacar el
// silenciador, y mirar que pasa con el TIPO del arma, el REGISTRO y el
// RECONCILADOR en el frame siguiente.
//
// No es una simulacion del bug: son los archivos de verdad del mod con un motor
// falso. Lo que no se puede ver aca es la pagina, asi que el estado que la pagina
// lee se imprime aparte.

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
const Bus = await import(`${MOD}/core/gsis_EventBus.js`);
const { setModuleData } = await import(`${MOD}/core/gsis_SaveManager.js`);

const famPorTipo = {};
for (const v of W.WEAPON_VARIANTS) famPorTipo[v.weaponType] = v.family;
const SLOT = W.getFamilyById("colt45").slot;
saberFamilias(famPorTipo, { colt45: SLOT });

function arrancar() {
    resetEngine(CAPACIDADES);
    State.setEquipped({});
    setModuleData("ItemManager", { items: [], trunks: {}, belt: [] });
    elMotor().log.length = 0;
}

function estado(etiqueta) {
    const enMano = elMotor().slots[SLOT] || 0;
    const e = State.getEntry(SLOT);
    const reg = e ? (e.attachments || []).join("+") : "(nada)";
    const esperado = e ? W.resolveWeaponType(e.family, e.attachments) : null;
    // Lo que la pagina lee para dibujar la fila equipada.
    const otros = e ? W.otherAttachmentsOf(e.attachments || []) : [];
    console.log("  " + etiqueta);
    console.log("      motor   : " + enMano);
    console.log("      registro: [" + reg + "]  -> resuelve " + esperado +
        (esperado !== enMano ? "   <-- NO COINCIDE CON EL MOTOR" : "   (acuerda)"));
    console.log("      pagina  : otros=[" + otros.join("+") + "]" +
        (otros.length ? "   <-> la pagina ofrece quitar esto" : "   <-> no hay nada que quitar"));
}

console.log("\n################ SACAR EL SILENCIADOR ################\n");

arrancar();
Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
Inventory.addItem("suppressor", 1);
Logic.equipWeapon("colt45", ["suppressor"]);
estado("1. equipada con silenciador");

console.log("\n  -- se saca el silenciador (inv:unmount) --");
const r = Logic.detachAccessory(null, SLOT, "suppressor");
console.log("      detachAccessory -> ok=" + r.ok + " tipo=" + r.weaponType +
    (r.motivo ? "  motivo=" + r.motivo : ""));
estado("2. justo despues de sacarlo");

console.log("\n  -- un frame del reconciliador --");
reconcile();
estado("3. un frame despues");

console.log("\n  -- otro frame --");
reconcile();
estado("4. dos frames despues");

console.log("\n  -- el silenciador volvio a la mochila? --");
console.log("      inventario: " + JSON.stringify(Inventory.getItems().map(i => i.id)));

console.log("\n################ Y AL REVERSE ################\n");
Logic.attachAccessory(null, SLOT, "suppressor");
estado("5. volver a montar el silenciador");
reconcile();
estado("6. un frame despues");

console.log("\n  -- que eventos se emitieron? --");
for (const l of elMotor().log) console.log("      " + l);
console.log("");
