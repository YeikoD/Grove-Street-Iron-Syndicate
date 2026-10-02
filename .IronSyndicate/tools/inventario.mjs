// inventario.mjs - El inventario y la fila de la UI, con el catalogo de una fila
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).
//
//   node .IronSyndicate/tools/inventario.mjs
//
// Que prueba, y por que hace falta con el sistema de armas borrado
// ---------------------------------------------------------------
// Este archivo es el HEREDERO de check-ui-flow.mjs, que verificaba el camino de
// las armas —equipar, montar un accesorio, cambiar el cargador con la R— y que se
// borro junto con el sistema. Con el se fueron las pruebas quePRODUCTO del
// inventario, que es el modulo que mas cambio de los que quedaron.
//
// El cambio fue grande y en una sola direccion: `ITEMS` paso de 47 filas a una,
// y los caminos de "instanciado" —una fila por unidad, con municion propia— de
// addItem/removeItem/addToTrunk pasaron a ser codigo que nunca corre. Un modulo
// donde la mitad de sus ramas estan muertas no se nota en el juego: `addItem`
// sigue agregando chatarra y el inventario sigue andando. Solo se nota cuando un
// item vuelve a ser instanciado y la rama TIENE que funcionar.
//
// Asi que esto prueba las DOS mitades del contrato:
//
//   lo que quedo    apilar, pesar, sacar, no perder, y la fila que ve la pagina
//   lo que quedo muerto   las ramas de instanciado, probandolas con un catalogo
//                        temporal que las hace instanciadas
//
// QUE NO PRUEBA
// -------------
// Que la UI dibuje bien: eso es CEF y no hay DOM en node. Lo que prueba es la
// FORMA de la fila, que es lo que la pagina contractualmente espera.

import "./fake-engine.mjs";

const MOD = "../../modloader/IronSyndicate/cleo/IronSyndicate";

const { setModuleData } = await import(`${MOD}/core/gsis_SaveManager.js`);
const Inv = await import(`${MOD}/modules/inventory/index.js`);
const ItemData = await import(`${MOD}/data/gsis_item_data.js`);
const View = await import(`${MOD}/modules/ui/views/inventory.js`);

let fallos = 0, total = 0;
const ok = (c, m, extra) => {
    total++;
    console.log((c ? "   ok   " : "   FALLA ") + m +
        (extra !== undefined && !c ? "   -> " + JSON.stringify(extra) : ""));
    if (!c) fallos++;
};
const seccion = (t) => console.log("\n=== " + t + " ===");

const ITEMS = ItemData.ITEMS;
const inv = () => Inv.getItems();
const ids = () => inv().map((i) => i.id + "(" + (i.qty === undefined ? "" : i.qty) + ")");

function catalogoLimpio(items) {
    setModuleData("ItemManager", { items: items || [], trunks: {} });
}

// ---------------------------------------------------------------------------
seccion("1. EL CATALOGO");
// El catalogo quedo con una sola fila a proposito. Ver "POR QUE QUEDA UNA FILA"
// en data/gsis_item_data.js: el inventario, el baul, la UI y la economia
// necesitan al menos un item que mover.
ok(Object.keys(ITEMS).length === 1, "ITEMS tiene una sola fila",
    Object.keys(ITEMS));
ok(!!ITEMS.scrap_metal, "y es scrap_metal", Object.keys(ITEMS));
ok(ITEMS.scrap_metal.type === "material", "de tipo material", ITEMS.scrap_metal.type);
// Y lo que se fue: ningun arma, ningun cargador, ningun accesorio, ningun
// material de armeria.
const porTipo = {};
for (const k in ITEMS) porTipo[ITEMS[k].type] = (porTipo[ITEMS[k].type] || 0) + 1;
ok(!porTipo.weapon, "no queda ningun item type weapon", porTipo);
ok(!porTipo.magazine, "ni ninguno type magazine", porTipo);
ok(!porTipo.weapon_attachment, "ni ninguno type weapon_attachment", porTipo);

// Un item que el catalogo no conoce no entra, y eso es lo que evita que un save
// viejo con 4 AK-47 encima los vuelva a meter.
catalogoLimpio();
ok(Inv.addItem("ak47", 1) === false, "un arma del catalogo viejo no entra");
ok(Inv.addItem("colt45", 1) === false, "ni una Colt");
ok(Inv.addItem("mag_colt45", 1) === false, "ni un cargador");
ok(Inv.addItem("suppressor", 1) === false, "ni un accesorio");
ok(inv().length === 0, "y el inventario sigue vacio", ids());

// ---------------------------------------------------------------------------
seccion("2. APILAR");
// Con el catalogo de una fila, todo lo que hay es la rama de apilables. Y esa
// rama tiene que seguir funcionando: es la que usa el 100% de lo que el jugador
// puede tener.
catalogoLimpio();
ok(Inv.addItem("scrap_metal", 5) === true, "agrega 5");
ok(inv().length === 1, "una sola fila", ids());
ok(inv()[0].qty === 5, "con qty 5", inv()[0]);
ok(Inv.addItem("scrap_metal", 3) === true, "agrega 3 mas");
ok(inv()[0].qty === 8, "y se apila a 8 en la misma fila", inv()[0]);
ok(inv().length === 1, "sigue siendo una sola fila", ids());

// ---------------------------------------------------------------------------
seccion("3. SACAR");
// La REGLA 2 del modulo: nada parcial. Pedir mas de lo que hay NO toca nada, y
// esto es lo que evita que el baul y la pagina informen "guardaste 5" con 3.
catalogoLimpio([{ id: "scrap_metal", qty: 6, salud: 100 }]);
ok(Inv.removeItem("scrap_metal", 2) === true, "saca 2");
ok(inv()[0].qty === 4, "quedan 4", inv()[0]);
ok(Inv.removeItem("scrap_metal", 99) === false, "sacar 99 de 4 devuelve false");
ok(inv()[0].qty === 4, "y NO toca nada", inv()[0]);
ok(Inv.removeItem("scrap_metal", 4) === true, "saca justo lo que hay");
ok(inv().length === 0, "y la fila desaparece", ids());
ok(Inv.removeItem("scrap_metal", 1) === false, "sacar de un inventario vacio es false");

// ---------------------------------------------------------------------------
seccion("4. PESO");
// 0.5 kg por unidad. El peso es la unica economia que sobrevive, asi que el
// calculo tiene que seguir dando bien.
catalogoLimpio([{ id: "scrap_metal", qty: 6, salud: 100 }]);
ok(Math.abs(Inv.getTotalWeight() - 3) < 0.001, "6 unidades = 3 kg",
    Inv.getTotalWeight());
catalogoLimpio([]);
ok(Inv.getTotalWeight() === 0, "inventario vacio = 0 kg");
catalogoLimpio([{ id: "ak47", qty: 3 }]);   // id desconocido
ok(Inv.getTotalWeight() === 0, "un id desconocido pesa 0, no rompe", Inv.getTotalWeight());

// ---------------------------------------------------------------------------
seccion("5. LA FILA QUE VE LA PAGINA");
// El contrato entre el mod y la pagina. El cambio grande: `ammo` y `value` salen
// SIEMPRE null, y `family`/`attachments`/`hasMag` ya no viajan nunca.
catalogoLimpio([{ id: "scrap_metal", qty: 4, salud: 80 }]);
const snap = View.snapInventory();
const fila = snap.rows[0];
console.log("   " + JSON.stringify(snap));
ok(snap.rows.length === 1, "una fila", snap.rows.length);
ok(fila.id === "scrap_metal", "con el id", fila.id);
ok(fila.cat === "material", "con el cat", fila.cat);
ok(fila.name === "Chatarra", "con el nombre del catalogo", fila.name);
ok(fila.qty === 4, "con qty", fila.qty);
ok(fila.salud === 80, "con salud", fila.salud);
ok(fila.ammo === null, "ammo null \u2014 no hay municion que medir", fila.ammo);
ok(fila.value === null, "value null \u2014 no hay mercado", fila.value);
ok(typeof fila.tip === "string" && fila.tip.length > 0, "con tooltip", fila.tip);

// Las claves del sistema de armas NO viajan, y eso es lo que el snapshot
// comprueba: el page no debe encontrar ningun rastro de configuracion.
ok(!("weaponType" in fila), "sin weaponType", Object.keys(fila));
ok(!("variantWeaponType" in fila), "sin variantWeaponType");
ok(!("family" in fila), "sin family");
ok(!("attachments" in fila), "sin attachments");
ok(!("hasMag" in fila), "sin hasMag");
ok(!/weaponType|attachments/.test(JSON.stringify(snap)),
    "y el snapshot entero no menciona ninguno");

// Y el snapshot no cambio de forma: la pagina leia { weight, rows } y eso no se
// toco. Si se le agregara una clave, esta linea avisaria.
ok(Object.keys(snap).sort().join(",") === "rows,weight",
    "el snapshot sigue siendo { weight, rows }", Object.keys(snap));

// ---------------------------------------------------------------------------
seccion("6. LAS RAMAS INSTANCIADAS, QUE ESTAN MUERTAS PERO TIENEN QUE ANDAR");
// El motivo de estar este archivo: con `scrap_metal` solo, `isInstanced()` da
// false y las ramas de instanciado de addItem/removeItem NUNCA se ejecutan. Un
// modulo donde la mitad de sus ramas no se ejecutan es un modulo donde la mitad
// de sus reglas se pudren sin que nadie lo note.
//
// La prueba es romper el invariante a proposito: se agrega un item marcado
// `instanced` en el catalogo en memoria, se ejercita el camino, y se revierte. Si
// el item vuelve a ser instanciado manana, esta seccion tiene que seguir verde.
//
// ITEMS es un objeto normal y mutable, asi que el cambio es local al proceso.
const FICTICIO = "instanciado_de_prueba";
const antes = ITEMS[FICTICIO];
ITEMS[FICTICIO] = { name: "Prueba", weight: 2, type: "material", instanced: true };
try {
    ok(ItemData.isInstanced(FICTICIO) === true,
        "un item con instanced:true ES instanciado");

    catalogoLimpio();
    ok(Inv.addItem(FICTICIO, 3) === true, "agrega 3 unidades instanciadas");
    ok(inv().length === 3, "y hacen TRES filas, no una apilada", ids());
    ok(inv().every((i) => i.qty === 1), "cada una con qty 1", inv());
    ok(inv()[0].salud === 100, "y con salud de fabrica", inv()[0].salud);
    ok(!("ammo" in inv()[0]), "y SIN campo ammo (no hay cargador)", inv()[0]);

    ok(Inv.addItem(FICTICIO, 2) === true, "agrega 2 mas");
    ok(inv().length === 5, "y son cinco filas en total", ids());

    ok(Inv.removeItem(FICTICIO, 2) === true, "saca 2");
    ok(inv().length === 3, "y quedan 3", ids());

    // La REGLA 1: un item instanciado se saca UNO por fila, y si no hay
    // suficientes no se saca ninguno.
    ok(Inv.removeItem(FICTICIO, 5) === false, "sacar 5 de 3 devuelve false");
    ok(inv().length === 3, "y NO saca ninguna", ids());

    ok(Inv.removeItem(FICTICIO, 3) === true, "saca las 3");
    ok(inv().length === 0, "y el inventario queda vacio", ids());

    // El peso de un instanciado se cuenta por fila, no por qty: con qty 1 en
    // cada fila, sacar dos filas de 2 kg son 4 kg.
    catalogoLimpio();
    Inv.addItem(FICTICIO, 2);
    ok(Math.abs(Inv.getTotalWeight() - 4) < 0.001,
        "2 filas instanciadas de 2 kg = 4 kg", Inv.getTotalWeight());

    // Y la fila de la UI de un instanciado: dice "instanciado" en vez de "N
    // unidades", y eso lo decide isInstanced() y no it.qty.
    const filaInst = View.snapInventory().rows[0];
    ok(filaInst.tip.indexOf("instanciado") >= 0,
        "el tooltip dice 'instanciado'", filaInst.tip);
    ok(filaInst.tip.indexOf("unidades") < 0,
        "y NO dice 'N unidades'", filaInst.tip);
} finally {
    if (antes === undefined) delete ITEMS[FICTICIO];
    else ITEMS[FICTICIO] = antes;
    catalogoLimpio();
}
ok(ItemData.isInstanced(FICTICIO) === false, "el catalogo quedo como estaba");

// ---------------------------------------------------------------------------
seccion("7. ISINSTANCED CON EL CATALOGO REAL");
// El predicado tiene que ser false para TODO lo que hay, y la razon se escribe
// en data/gsis_item_data.js.
for (const id in ITEMS) {
    ok(ItemData.isInstanced(id) === false, id + " no es instanciado");
}

console.log("\n" + (fallos === 0
    ? "########## INVENTARIO OK: " + total + "/" + total + " ##########"
    : "########## " + fallos + " FALLAS de " + total + " ##########") + "\n");
process.exit(fallos === 0 ? 0 : 1);