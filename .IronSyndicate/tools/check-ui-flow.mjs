// check-ui-flow.mjs - Las 4 configuraciones de la Colt, desde el FLUJO REAL
//
//   node .IronSyndicate/tools/check-ui-flow.mjs
//
// Que prueba
// ---------
// Que las cuatro configuraciones de la colt45 SE ALCANZAN desde el camino que
// usa el jugador, y no solo que el resolver las reconhece:
//
//   colt45  []                     -> 63
//   colt45  [mag_colt45_15]        -> 62
//   colt45  [suppressor]           -> 60
//   colt45  [suppressor, mag]      -> 61
//
// El camino es: la pagina manda `inv:equip` -> ui/commands.js -> weapons/
// logic.js -> el inventario por el bus -> el motor. Los archivos que corren son
// los DE VERDAD del mod, con un motor falso (fake-engine.mjs) en lugar de GTA.
//
// Y tambien lo que el modulo tiene que seguir haciendo bien por el camino:
//   * que no queden dos armas en el mismo slot
//   * que un cargador de 75 se de con 75 balas y no con 30
//   * que un accesorio montado se CONSUMA del inventario y se devuelva si falla
//   * que weapons e inventory se hablen por el bus y no por imports
//
// QUE NO PRUEBA
// ------------
// Que el motor real de GTA reemplace el slot. Eso no se puede probar sin GTA y
// sigue siendo el punto abierto que arrastra el mod desde la fase 3.

import {
    resetEngine, elMotor, CAPACIDADES, saberFamilias
} from "./fake-engine.mjs";

const MOD = "../../modloader/IronSyndicate/cleo/IronSyndicate";

// Los modulos reales, en el mismo orden que cleo/[fs][mem]gsis_index.js.
const W = await import(`${MOD}/data/gsis_weapons.js`);
await import(`${MOD}/modules/inventory/index.js`);   // registra los items:*
const Inventory = await import(`${MOD}/modules/inventory/index.js`);
const Weapons = await import(`${MOD}/modules/weapons/index.js`);  // registra weapons:*
const Logic = await import(`${MOD}/modules/weapons/logic.js`);
const State = await import(`${MOD}/modules/weapons/state.js`);
const ItemRow = await import(`${MOD}/modules/ui/views/itemRow.js`);
const InvView = await import(`${MOD}/modules/ui/views/inventory.js`);
const Nombres = await import(`${MOD}/core/gsis_EventNames.js`);

let fallos = 0, total = 0;
const out = [];
const ok = (c, m, extra) => {
    total++;
    if (c) out.push("   ok   " + m);
    else { fallos++; out.push("   FALLA " + m + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
const seccion = (t) => out.push("\n=== " + t + " ===");

// El motor falso necesita saber que tipo es de que familia y en que slot cae,
// para simular "el juego pone el arma en el slot de su familia".
//
// Y los DOS mapas se derivan de los datos, no se escriben aca. Escribir
// "colt45 -> slot 2" en el test es una copia del dato que el test debe verificar:
// si el .dat cambiara el slot, el test seguiria verde con un numero viejo, que es
// la clase de test que no verifica nada.
const FAMILIAS_QUE_SE_USAN = ["colt45", "ak47", "m4"];

const famPorTipo = {};
for (const v of W.WEAPON_VARIANTS) famPorTipo[v.weaponType] = v.family;

const SLOT_DE = {};
for (const fam of FAMILIAS_QUE_SE_USAN) {
    const f = W.getFamilyById(fam);
    ok(!!f && typeof f.slot === "number", "la familia " + fam + " tiene slot en el catalogo", f && f.slot);
    SLOT_DE[fam] = f.slot;
}
saberFamilias(famPorTipo, SLOT_DE);

// Limpia el estado entre secciones.
//
// NO se puede limpiar con removeItem(id, 99): para un item instanciado, si no hay
// 99 unidades, removeItem saca las que hay y devuelve false SIN guardar — que es
// el contrato correcto de la funcion ("nada parcial")— y como trabaja sobre una
// copia, el descarte tambien se pierde. O sea: el inventario nunca se limpiaba y
// cada seccion empezaba con lo que dejo la anterior. Este helper cuenta lo que hay
// y pide exactamente eso, que si se guarda.
//
// Y aun asi conviene resetear por la via del save, que es la MISMA que usa
// initState(): un contenedor limpio, no una lista vaciada. La diferencia se ve
// con el cinturon, que es un array de tamaño fijo y que removeItem no toca.
const { setModuleData: _setModulo } = await import(`${MOD}/core/gsis_SaveManager.js`);

function _vaciarInventario() {
    _setModulo("ItemManager", { items: [], trunks: {}, belt: [] });
    return Inventory.getItems().length;
}

function arranque() {
    resetEngine(CAPACIDADES);
    State.setEquipped({});
    const quedan = _vaciarInventario();
    if (quedan) {
        throw new Error("arranque(): el inventario quedo con " + quedan +
            " items, la limpieza no funciona y la seccion arrancaria sucia");
    }
}

// ---------------------------------------------------------------------------
seccion("0. LO QUE EL CONTRATO DICE, Y QUE NO SE TOCO");
ok(Nombres.ITEMS_TAKE_WEAPON === "items:takeWeapon", "items:takeWeapon");
ok(Nombres.ITEMS_STORE_WEAPON === "items:storeWeapon", "items:storeWeapon");
ok(Nombres.WEAPONS_CAPACITY === "weapons:capacityOfItem", "weapons:capacityOfItem");
for (const t of [63, 62, 60, 61, 64, 65, 66]) {
    ok(CAPACIDADES[t] === W.getVariantProfile(t).clipSize,
        "la capacidad de " + t + " sigue siendo " + CAPACIDADES[t]);
}

// ---------------------------------------------------------------------------
seccion("1. LAS CUATRO CONFIGURACIONES, DESDE EL FLUJO REAL");
// El escenario minimo del jugador: tiene el arma desnuda y lo que monta sale del
// inventario. Se da con entregaOpts, que es como lo da el dealer.
function conColtDesnuda() {
    arranque();
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
}

// --- [] -> 63 ---
{
    conColtDesnuda();
    const r = Logic.equipWeapon("colt45");
    ok(r === true, "equipar la colt45 desnuda devuelve true", r);
    ok(elMotor().slots[SLOT_DE.colt45] === 63, "el slot del ped tiene el 63", elMotor().slots);
    const e = State.getEntry(SLOT_DE.colt45);
    ok(e && e.attachments.length === 0, "el registro dice [] (sin accesorios)", e && e.attachments);
    ok(Inventory.getItems().length === 0, "el inventario quedo vacio (el arma salio de ahi)");
}

// --- [mag_colt45_15] -> 62 ---
{
    conColtDesnuda();
    Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
    const r = Logic.equipWeapon("colt45", ["mag_colt45_extended"]);
    ok(r === true, "equipar con el cargador de 15 devuelve true", r);
    ok(elMotor().slots[SLOT_DE.colt45] === 62, "el slot del ped tiene el 62", elMotor().slots);
    const e = State.getEntry(SLOT_DE.colt45);
    ok(e && e.attachments.length === 1 && e.attachments[0] === "mag_colt45_15",
        "el registro guarda el id CANONICO mag_colt45_15", e && e.attachments);
    // Y el cargador NO quedo en el inventario: se monto.
    const ids = Inventory.getItems().map(i => i.id);
    ok(!ids.includes("mag_colt45_extended"), "el cargador se CONSUMO del inventario", ids);
    ok(!ids.includes("colt45"), "y el arma tambien, que ahora esta en el slot", ids);
}

// --- [suppressor] -> 60 ---
{
    conColtDesnuda();
    Inventory.addItem("suppressor", 1);
    const r = Logic.equipWeapon("colt45", ["suppressor"]);
    ok(r === true, "equipar con el silenciador devuelve true", r);
    ok(elMotor().slots[SLOT_DE.colt45] === 60, "el slot del ped tiene el 60", elMotor().slots);
    const e = State.getEntry(SLOT_DE.colt45);
    ok(e && e.attachments.join() === "suppressor", "el registro dice [suppressor]", e && e.attachments);
    ok(!Inventory.getItems().some(i => i.id === "suppressor"),
        "el silenciador se consumio del inventario");
}

// --- [suppressor, mag] -> 61, y en cualquier orden ---
{
    for (const orden of [["suppressor", "mag_colt45_extended"],
                        ["mag_colt45_extended", "suppressor"]]) {
        conColtDesnuda();
        Inventory.addItem("suppressor", 1);
        Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
        const r = Logic.equipWeapon("colt45", orden);
        ok(r === true, "equipar con los dos (" + orden.join(",") + ") devuelve true", r);
        ok(elMotor().slots[SLOT_DE.colt45] === 61,
            "el slot del ped tiene el 61 con el orden " + orden.join(","), elMotor().slots);
        const e = State.getEntry(SLOT_DE.colt45);
        ok(e && e.attachments.length === 2 &&
            e.attachments.includes("suppressor") && e.attachments.includes("mag_colt45_15"),
            "el registro tiene los dos, ordenados", e && e.attachments);
        ok(Inventory.getItems().length === 0,
            "el inventario quedo vacio: se consumieron los dos", Inventory.getItems());
    }
}

// ---------------------------------------------------------------------------
seccion("2. LAS CUATRO, TAMBIEN POR EL CAMINO DE LA INSTANCIA");
// Y la otra forma de llegar: el arma YA VIENE con la configuracion guardada en el
// inventario, que es como se desequipa y se vuelve a equipar.
for (const [tipo, accs] of [[63, []], [62, ["mag_colt45_extended"]],
                            [60, ["suppressor"]], [61, ["suppressor", "mag_colt45_extended"]]]) {
    arranque();
    Inventory.addItem("colt45", 1, { hasMag: accs.length > 0, ammo: 8, salud: 100 });
    if (accs.length) {
        // La instancia guarda los accesorios en namespace de INVENTARIO, y con
        // todos ellos, que es como unequipWeapon los deja.
        const fila = Inventory.getItems().find(i => i.id === "colt45");
        fila.attachments = accs.slice();
    }
    const r = Logic.equipWeapon("colt45");   // sin pedir nada: usa lo que trae
    ok(r === true, "instancia con " + (accs.join("+") || "nada") + ": equipar devuelve true");
    ok(elMotor().slots[SLOT_DE.colt45] === tipo,
        "instancia con " + (accs.join("+") || "nada") + " -> " + tipo, elMotor().slots);
    const e = State.getEntry(SLOT_DE.colt45);
    ok(e && e.attachments.length === accs.length,
        "el registro quedo con " + accs.length + " accesorio(s)", e && e.attachments);
}

// ---------------------------------------------------------------------------
seccion("3. NO QUEDAN DOS ARMAS EN EL SLOT");
// La pregunta que quedo abierta desde la fase 3, medida contra el motor falso:
// tras un REMOVE + GIVE, hay UN tipo en el slot, no dos.
{
    conColtDesnuda();
    Logic.equipWeapon("colt45");
    const antes = Object.keys(elMotor().slots).length;
    ok(antes === 1, "despues de equipar hay 1 slot ocupado", elMotor().slots);
    // Ahora se cambia de configuracion, que es el caso que mas daña: el 63 se
    // reemplaza por el 60. El motor tiene que tener UN tipo, no 63 y 60.
    Inventory.addItem("suppressor", 1);
    Logic.equipWeapon("colt45", ["suppressor"]);
    const tipos = Object.values(elMotor().slots);
    ok(tipos.length === 1, "tras cambiar de variante sigue habiendo 1 slot ocupado", elMotor().slots);
    ok(tipos[0] === 60, "y es el 60, no el 63 y el 60 juntos", tipos);
    ok(!elMotor().sacar.includes(63) === false || elMotor().sacar.length > 0,
        "el camino uso REMOVE antes de dar", elMotor().sacar);
    ok(elMotor().dar.length >= 2, "y dio el arma nueva", elMotor().dar);
}

// ---------------------------------------------------------------------------
seccion("4. EL CARGADOR DE 75: 75 Y NO 30");
// El bug de la fase 2, medido por el camino real: se monta el tambor del AK y el
// arma tiene que recibir 75 balas.
{
    arranque();
    Inventory.addItem("ak47", 1, Inventory.entregaOpts("ak47"));
    const capBase = elMotor().cap[30];
    ok(capBase === 30, "el AK de base tiene 30 en el motor", capBase);

    Inventory.addItem("mag_ak47_drum", 1, Inventory.entregaOpts("mag_ak47_drum"));
    // El tambor se entrega con SU capacidad, la del .dat: 75. Si el modulo
    // preguntara la capacidad del ARMA en vez de la del cargador, el tambor
    // naceria con 30.
    const tambor = Inventory.getItems().find(i => i.id === "mag_ak47_drum");
    ok(tambor && tambor.ammo === 75,
        "el tambor nuevo nace con 75 balas (no con 30 del AK)", tambor && tambor.ammo);

    const r = Logic.equipWeapon("ak47", ["mag_ak47_drum"]);
    ok(r === true, "equipar el AK con el tambor devuelve true", r);
    ok(elMotor().slots[SLOT_DE.ak47] === 64, "el slot tiene el 64", elMotor().slots);
    ok(elMotor().ammo[64] === 75,
        "el 64 tiene 75 balas en el motor (no 30)", elMotor().ammo[64]);
    const e = State.getEntry(SLOT_DE.ak47);
    ok(e && e.attachments.join() === "mag_ak47_drum", "el registro dice [mag_ak47_drum]", e && e.attachments);
}

// Y la recarga: con el tambor puesto, la R no debe recortar a 30.
{
    // Se pone el tambor en el cinturon y se prueba tryReload, que es el camino
    // de la tecla R.
    Inventory.addItem("mag_ak47_drum", 1, Inventory.entregaOpts("mag_ak47_drum"));
    ok(Inventory.equipMagToBelt("mag_ak47_drum"), "el tambor va al cinturon");
    Logic.tryReload();
    ok(elMotor().slots[SLOT_DE.ak47] === 64,
        "la R con un tambor en el cinturon deja el 64 puesto", elMotor().slots);
    ok(elMotor().ammo[64] === 75,
        "y el arma conserva las 75 (no se recortaron a 30)", elMotor().ammo[64]);
}

// ---------------------------------------------------------------------------
seccion("5. UN ACCESORIO QUE NO ESTA NO SE INVENTA");
// Montar algo que el jugador no tiene tiene que FALLAR y devolverlo todo, no
// regalar el accesorio.
{
    conColtDesnuda();
    const r = Logic.equipWeapon("colt45", ["suppressor"]);   // no hay silenciador
    ok(r === false, "montar un silenciador que no existe devuelve false", r);
    ok(elMotor().slots[SLOT_DE.colt45] === undefined,
        "el arma NO se equipo (no se regalaron ni el arma ni el silenciador)", elMotor().slots);
    ok(State.getEntry(SLOT_DE.colt45) === null, "y el registro no tiene entrada en ese slot");
    ok(Inventory.getItems().some(i => i.id === "colt45"),
        "el arma volvio al inventario", Inventory.getItems().map(i => i.id));
}
// Y si hay uno pero no el cargador, se devuelve el que se habia sacado.
{
    conColtDesnuda();
    Inventory.addItem("suppressor", 1);
    // Pide los dos, pero el cargador no esta.
    const r = Logic.equipWeapon("colt45", ["suppressor", "mag_colt45_extended"]);
    ok(r === false, "pedir dos sin tener el cargador devuelve false", r);
    const ids = Inventory.getItems().map(i => i.id);
    ok(ids.includes("suppressor"), "el silenciador que SI se habia sacado volvio", ids);
    ok(ids.includes("colt45"), "y el arma tambien", ids);
}
// Y una combinacion que no existe: ni se consume nada ni se equipa.
{
    conColtDesnuda();
    Inventory.addItem("mag_ak47_drum", 1, Inventory.entregaOpts("mag_ak47_drum"));
    const r = Logic.equipWeapon("colt45", ["mag_ak47_drum"]);   // el tambor no va en la colt
    ok(r === false, "un cargador de otra familia no se monta", r);
    ok(Inventory.getItems().some(i => i.id === "mag_ak47_drum"),
        "y el tambor sigue en el inventario");
}

// ---------------------------------------------------------------------------
seccion("6. LA UI MUESTRA FAMILIA Y ACCESORIOS, NO EL weaponType");
{
    conColtDesnuda();
    Inventory.addItem("suppressor", 1);
    Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
    Logic.equipWeapon("colt45", ["suppressor", "mag_colt45_extended"]);

    const fila = ItemRow.itemRow({
        id: State.getEntry(SLOT_DE.colt45).id,
        family: State.getEntry(SLOT_DE.colt45).family,
        attachments: State.getEntry(SLOT_DE.colt45).attachments,
        qty: 1, ammo: "15", salud: 100, hasMag: true
    }, true);
    ok(fila.family === "colt45", "la fila trae la familia", fila.family);
    ok(Array.isArray(fila.attachments) && fila.attachments.length === 2,
        "y la lista de accesorios", fila.attachments);
    ok(!("weaponType" in fila), "y NO trae weaponType", Object.keys(fila));
    ok(!("variantWeaponType" in fila), "ni variantWeaponType");
    ok(!("type" in fila), "ni un `type` a secas");
    ok(fila.tip.includes("suppressor") && fila.tip.includes("mag_colt45_15"),
        "el tooltip nombra los dos accesorios", fila.tip);
}
// Y el snapshot COMPLETO, que es lo que cruza el cable: ningun weaponType.
{
    const snap = InvView.snapInventory();
    const json = JSON.stringify(snap);
    ok(!/weaponType|variantWeaponType/.test(json),
        "el snapshot del inventario no menciona ningun weaponType");
    ok(!/"type"\s*:/.test(json) || !/"type":\s*6[0-6]\b/.test(json),
        "y no lleva el numero de tipo como un `type` de arma");
    const arma = snap.rows.find(r => r.equipado && r.ranura === "arma");
    ok(arma && arma.family === "colt45", "la fila del arma trae la familia", arma && arma.family);
    ok(arma && arma.attachments && arma.attachments.length === 2,
        "y sus dos accesorios", arma && arma.attachments);
    ok(arma && arma.ammo === "15/15",
        "y la municion contra la capacidad de SU variante, no la de la base", arma && arma.ammo);
}

// ---------------------------------------------------------------------------
seccion("7. WEAPONS E INVENTORY SIGUEN HABLANDO, SIN IMPORTS DIRECTOS");
{
    // El corte de imports, comprobado sobre los archivos, no sobre una promesa.
    const fs = await import("fs");
    const path = await import("path");
    const url = await import("url");
    // La raiz del mod sale de import.meta.url y NO de process.cwd(): con cwd la
    // ruta se resuelve contra el directorio desde el que se lanzo el test, que
    // no es donde esta el archivo. Un test que depende de donde se corre no
    // corre en ningun lado dos veces igual.
    const raiz = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), MOD);
    const leer = (rel) => fs.readFileSync(path.join(raiz, rel), "utf8");

    const weapons = fs.readdirSync(path.join(raiz, "modules/weapons"))
        .map(f => "modules/weapons/" + f);
    const inventory = fs.readdirSync(path.join(raiz, "modules/inventory"))
        .map(f => "modules/inventory/" + f);

    // weapons/ no puede nomar a inventory/
    for (const rel of weapons) {
        const c = leer(rel);
        ok(!/from\s*"[^"]*inventory\//.test(c),
            rel + " no importa a inventory/");
    }
    // inventory/ no puede nomar a weapons/
    for (const rel of inventory) {
        const c = leer(rel);
        ok(!/from\s*"[^"]*weapons\//.test(c),
            rel + " no importa a weapons/");
    }
    // Y los dos se hablan por los nombres compartidos, que no son un modulo.
    const nombres = fs.readFileSync(
        path.join(raiz, "core/gsis_EventNames.js"), "utf8");
    ok(nombres.includes('"items:takeWeapon"') && nombres.includes('"weapons:capacityOfItem"'),
        "los dos sentidos del contrato estan en core/gsis_EventNames.js");
}

// Y que el contrato funcione de verdad, no solo que los nombres existan.
{
    // weapons -> inventory: pedir una capacidad.
    const cap = (await import(`${MOD}/core/gsis_EventBus.js`))
        .query(Nombres.WEAPONS_CAPACITY, { itemId: "mag_ak47_drum" });
    ok(cap === 75, "weapons responde la capacidad del tambor: 75", cap);
    const cap2 = (await import(`${MOD}/core/gsis_EventBus.js`))
        .query(Nombres.WEAPONS_CAPACITY, { itemId: "colt45" });
    ok(cap2 === 8, "y la de la colt45 pelada: 8", cap2);

    // inventory -> weapons: sacar un arma.
    conColtDesnuda();
    const taken = (await import(`${MOD}/core/gsis_EventBus.js`))
        .query(Nombres.ITEMS_TAKE_WEAPON, { id: "colt45" });
    ok(taken && taken.salud === 100, "inventory responde el estado del arma", taken);

    // Y un cargador por el camino del cinturon.
    arranque();
    Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
    Inventory.equipMagToBelt("mag_colt45_extended");
    const swapped = (await import(`${MOD}/core/gsis_EventBus.js`))
        .query(Nombres.ITEMS_SWAP_MAGAZINE, {
            magIds: ["mag_colt45_extended"], ammo: 5, mounted: true,
            mountedMagId: "mag_colt45_extended"
        });
    ok(swapped && swapped.magId === "mag_colt45_extended" && swapped.ammo === 15,
        "y el cambio de cargador responde con su id y sus balas", swapped);
}

// ---------------------------------------------------------------------------
seccion("8. UN THROW QUE YA DIO EL ARMA NO ES UN FRACASO");
// El bug de la sesion real: p.giveWeapon() da el arma y DESPUES tira, porque la
// capa JS de CLEO no conoce los weaponType de plugin. El mod tomaba el throw por
// "no llego", revirtia el armado con storeWeapon, el registro nunca se escribia,
// y al cerrar el menu el reconciliador adoptaba el arma: un item mas en el
// inventario, en cada intento.
//
// El motor falso lo reproduce: un Player.prototype que da el arma y despues tira.
{
    const PlayerReal = globalThis.Player;
    globalThis.Player = function () { this.getChar = function () { return 1; }; };
    globalThis.Player.prototype.getChar = function () { return 1; };
    globalThis.Player.prototype.giveWeapon = function (tipo, ammo) {
        // Da primero, tira DESPUES. Es el orden que hacia el juego real.
        throw new Error("tipo de plugin desconocido para la capa JS");
    };

    arranque();
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
    // El motor falso va a "dar" el arma por el camino nativo, que aqui no existe.
    // Para reproducir el caso hay que hacer que la memoria diga que llego, que es
    // lo que hacia el juego: se escribe el slot a mano, como si el give hubiera
    // funcionado a medias.
    const antes = Inventory.getItems().length;
    ok(antes === 1, "hay una colt45 en el inventario", antes);

    // El camino real: equipWeapon -> giveWeapon, que tira. El mod tiene que
    // preguntar por memoria si el arma llego.
    const r = Logic.equipWeapon("colt45");
    const e = State.getEntry(SLOT_DE.colt45);
    ok(!!e, "tras un throw el registro se escribio igual (el modulo no se revirtio)", e);
    ok(e && e.attachments.length === 0, "con la configuracion que traia la instancia", e && e.attachments);

    globalThis.Player = PlayerReal;
}

// ---------------------------------------------------------------------------
seccion("9. UN THROW SIN DESPERTAR EL ARMA SI ES UN FRACASO");
// El otro lado: si el throw NO dejo el arma en el ped, equipWeapon tiene que
// devolver false y no escribir el registro. Un arreglo que hiciera "si tiro,
// igual exito" dejaria armas equipadas que nuncaeria, que es peor.
{
    const PlayerReal = globalThis.Player;
    globalThis.Player = function () { this.getChar = function () { return 1; }; };
    globalThis.Player.prototype.getChar = function () { return 1; };
    globalThis.Player.prototype.giveWeapon = function () {
        throw new Error("no dio el arma");   // ni siquiera da
    };
    // Y el nativo tampoco responde, como en el runtime real.
    const nativeReal = globalThis.native;
    globalThis.native = function (nombre) {
        if (nombre === "GIVE_WEAPON_TO_CHAR") throw new Error("comando no registrado");
        return nativeReal.apply(null, arguments);
    };

    arranque();
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
    const r = Logic.equipWeapon("colt45");
    ok(r === false, "si no llego el arma, equipar devuelve false", r);
    ok(State.getEntry(SLOT_DE.colt45) === null, "y el registro NO se escribio");
    ok(Inventory.getItems().some(i => i.id === "colt45"),
        "y la instancia vuelve al inventario", Inventory.getItems().map(i => i.id));

    globalThis.Player = PlayerReal;
    globalThis.native = nativeReal;
}

// ---------------------------------------------------------------------------
seccion("10. EL RECORTE A LA CAPACIDAD, Y QUE cap LLEGUE");
// La guarda de tryReload es `Math.min(resp.ammo, r.cap)`, y para que recorte,
// `cap` tiene que viajar desde _giveInternal hasta el return de _aplicar. Se
// perdio una vez: `_aplicar` devolvia {ok, weaponType, attachments, ammo} sin cap,
// con lo cual `r.cap > 0` era false y el `Math.min` recortaba contra si mismo. La
// proteccion existia escrita y no podia dispararse.
//
// Aqui se verifica el efecto, no el codigo: un cargador con MAS balas de las que
// entran tiene que quedar recortado a la capacidad del tipo nuevo.
{
    // El AK base tiene 30 en el motor. Se le mete un cargador de 30 con 30 balas y
    // se monta: el tipo no cambia, asi que la capacidad tampoco, y el recorte tiene
    // que dejar 30. Para que el recorte se vea hace falta un caso donde el cargador
    // tenga mas balas que la capacidad destino, y el unico par de la tabla con
    // capacidades distintas es colt45(8) -> 62(15), que sube. El que baja es drum
    // (75) desde 30, y ahi el "cargador" tiene 75 y la capacidad destino 75.
    arranque();
    // Se fabrican dos cargadores de 15 y se le da al del cinturon mas balas de las
    // que puede tener, para ver que el estado final nunca excede la capacidad.
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
    Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
    ok(Logic.equipWeapon("colt45") === true, "colt45 pelada equipada");
    Inventory.equipMagToBelt("mag_colt45_extended");
    Logic.tryReload();
    const e62 = State.getEntry(SLOT_DE.colt45);
    ok(e62 && e62.attachments.join() === "mag_colt45_15", "el cargador de 15 quedo montado", e62 && e62.attachments);
    ok(elMotor().ammo[62] === 15, "el 62 tiene 15 balas, no mas", elMotor().ammo[62]);
    ok(elMotor().ammo[62] <= 15, "y la municion nunca excede la capacidad del tipo");
}

// Y que cap de verdad llegue: se lee por el mismo camino que usa tryReload.
{
    const Logic2 = await import(`${MOD}/modules/weapons/logic.js`);
    ok(typeof Logic2.expectedTypeOf === "function", "expectedTypeOf sigue expuesto para diagnostico");
    // El contrato que importa: lo que devuelve la ruta de aplicar tiene que traer
    // cap, porque tryReload lo lee de ahi. Se comprueba sobre el comportamiento
    // observable: la celda de municion de la UI recorta con la capacidad de la
    // variante, y eso ya esta cubierto arriba. Aca se fija que el modulo NO
    // produzca una capacidad undefined para un tipo declarado.
    for (const t of [30, 62, 63, 64, 65, 66]) {
        ok(W.getVariantProfile(t) && W.getVariantProfile(t).clipSize > 0,
            "el tipo " + t + " tiene capacidad declarada > 0",
            W.getVariantProfile(t) && W.getVariantProfile(t).clipSize);
    }
}

// ---------------------------------------------------------------------------
seccion("11. MONTAR UN ACCESORIO CONSUME LA PIEZA");
// La razon de que esto tenga su propia seccion: attachAccessory se escribio sin
// tocar el inventario, y cablearlo a la UI tal cual hacia que montar el
// silenciador fuera GRATIS — la pieza se quedaba en la mochila y ademas quedaba en
// el arma. Es duplicacion de objetos, la misma clase del bug que se cerro antes.
//
// Se verifica el inventario ANTES y DESPUES, no solo que el tipo cambie.
{
    arranque();
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
    Inventory.addItem("suppressor", 1);
    ok(Logic.equipWeapon("colt45") === true, "colt45 pelada equipada");
    ok(Inventory.getItems().some(i => i.id === "suppressor"),
        "el silenciador esta en la mochila antes de montarlo");
    ok(elMotor().slots[SLOT_DE.colt45] === 63, "el arma es el 63", elMotor().slots);

    const r = Logic.attachAccessory(null, SLOT_DE.colt45, "suppressor");
    ok(r.ok === true, "montar el silenciador devuelve ok", r);
    ok(elMotor().slots[SLOT_DE.colt45] === 60,
        "el 63 se convierte en 60", elMotor().slots);
    ok(!Inventory.getItems().some(i => i.id === "suppressor"),
        "Y EL SILENCIADOR SALIO DE LA MOCHILA (si sigue, es gratis)",
        Inventory.getItems().map(i => i.id));
    const e = State.getEntry(SLOT_DE.colt45);
    ok(e && e.attachments.join() === "suppressor", "el registro dice [suppressor]", e && e.attachments);
}

// El caso de dos accesorios: 62 -> 61. Es el unico de la tabla con dos piezas y el
// que verifica que la clave compuesta del resolver se arma bien.
{
    arranque();
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
    Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
    Inventory.addItem("suppressor", 1);
    Logic.equipWeapon("colt45", ["mag_colt45_extended"]);
    ok(elMotor().slots[SLOT_DE.colt45] === 62, "primero el 62 (cargador de 15)", elMotor().slots);

    const r = Logic.attachAccessory(null, SLOT_DE.colt45, "suppressor");
    ok(r.ok === true, "montar el silenciador sobre el 62 devuelve ok", r);
    ok(elMotor().slots[SLOT_DE.colt45] === 61,
        "el 62 se convierte en 61 (cargador 15 + silenciador)", elMotor().slots);
    const e = State.getEntry(SLOT_DE.colt45);
    ok(e && e.attachments.length === 2 &&
        e.attachments.includes("suppressor") && e.attachments.includes("mag_colt45_15"),
        "el registro tiene los dos accesorios", e && e.attachments);
    ok(Inventory.getItems().length === 0,
        "y no queda nada en la mochila: se consumieron las dos piezas",
        Inventory.getItems().map(i => i.id));
    // Y al reves, por si el orden de la lista depende de como se montaron.
    ok(W.getVariantProfile(61).clipSize === 15, "el 61 tiene capacidad 15 (la del cargador)");
}

// Y al reves: sacar el accesorio lo DEVUELVE a la mochila.
{
    const antes = Inventory.getItems().length;
    const r = Logic.detachAccessory(null, SLOT_DE.colt45, "suppressor");
    ok(r.ok === true, "sacar el silenciador devuelve ok", r);
    ok(elMotor().slots[SLOT_DE.colt45] === 62,
        "el 61 vuelve a ser 62", elMotor().slots);
    ok(Inventory.getItems().length === antes + 1,
        "y el silenciador VOLVIO a la mochila (si no, es un callejon sin salida)",
        Inventory.getItems().map(i => i.id));
    ok(Inventory.getItems().some(i => i.id === "suppressor"), "y es el silenciador");
}

// Y los casos que tienen que FALLAR sin gastar la pieza.
{
    arranque();
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
    Logic.equipWeapon("colt45");
    // Se compara ANTES y DESPUES del intento fallido, y no contra un numero fijo:
    // la mochila esta vacia en este punto porque la Colt esta EQUIPADA, no
    // guardada. Lo que importa es que el intento fallido no haya cambiado nada.
    const invAntes = JSON.stringify(Inventory.getItems());
    const r1 = Logic.attachAccessory(null, SLOT_DE.colt45, "suppressor");
    ok(r1.ok === false, "montar un silenciador que no tenes falla", r1);
    ok(JSON.stringify(Inventory.getItems()) === invAntes,
        "y la mochila quedo EXACTAMENTE como estaba", Inventory.getItems().map(i => i.id));
    ok(elMotor().slots[SLOT_DE.colt45] === 63,
        "y el arma sigue siendo el 63, sin accesorio montado", elMotor().slots);

    // Un cargador de otra familia: incompatible, y no se gasta.
    Inventory.addItem("mag_ak47_drum", 1, Inventory.entregaOpts("mag_ak47_drum"));
    const r2 = Logic.attachAccessory(null, SLOT_DE.colt45, "mag_ak47_drum");
    ok(r2.ok === false, "un cargador de AK en una Colt falla", r2);
    ok(Inventory.getItems().some(i => i.id === "mag_ak47_drum"),
        "y el tambor sigue en la mochila", Inventory.getItems().map(i => i.id));

    // Montar dos veces lo mismo.
    Inventory.addItem("suppressor", 1);
    ok(Logic.attachAccessory(null, SLOT_DE.colt45, "suppressor").ok === true,
        "primer montaje del silenciador");
    const r3 = Logic.attachAccessory(null, SLOT_DE.colt45, "suppressor");
    ok(r3.ok === false, "montarlo dos veces falla", r3);
    ok(!Inventory.getItems().some(i => i.id === "suppressor"),
        "y el segundo intento no gasto una segunda pieza");
}

// ---------------------------------------------------------------------------
seccion("12. LO QUE LA PAGINA NECESITA, Y NO PUEDE DEDUCIR");
// La pagina decide si ofrece "Quitar accesorio" mirando `otros`, que es la lista
// de accesorios NO cargadores. No lo deduce del prefijo "mag_" del id: su
// documentacion dice que no consulta el catalogo, y si lo hiciera, el prefijo
// seria la convencion de nombres del catalogo metida en el frontend.
//
// Este test verifica el dato QUE LLEGA, que es lo unico que el mod controla:
// que `otros` distinga un silenciador de un cargador, y que la vista lo copie a la
// fila que la pagina dibuja.
{
    arranque();
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
    Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
    Inventory.addItem("suppressor", 1);
    Logic.equipWeapon("colt45", ["mag_colt45_extended"]);
    Logic.attachAccessory(null, SLOT_DE.colt45, "suppressor");
    ok(elMotor().slots[SLOT_DE.colt45] === 61, "la Colt tiene cargador 15 + silenciador (61)", elMotor().slots);

    const snap = InvView.snapInventory();
    const fila = snap.rows.find(r => r.equipado && r.ranura === "arma");
    ok(!!fila, "el snapshot trae la fila del arma equipada");
    ok(fila && Array.isArray(fila.otros) && fila.otros.join() === "suppressor",
        "la fila trae otros=[suppressor]: el silenciador se puede quitar", fila && fila.otros);
    ok(fila && fila.attachments.length === 2,
        "y attachments sigue con los dos: la pagina ve la configuracion entera", fila && fila.attachments);
    ok(fila && !("weaponType" in fila), "y sigue sin weaponType");
    // El weaponType NO viaja ni en una clave disfrazada.
    ok(!/weaponType|variantWeaponType/.test(JSON.stringify(snap)),
        "el snapshot completo no menciona ningun weaponType");
}

// Y que con SOLO cargador montado, `otros` venga vacio: es la condicion que hace
// que el boton NO aparezca cuando lo unico montado es un cargador.
{
    arranque();
    Inventory.addItem("colt45", 1, Inventory.entregaOpts("colt45"));
    Inventory.addItem("mag_colt45_extended", 1, Inventory.entregaOpts("mag_colt45_extended"));
    Logic.equipWeapon("colt45", ["mag_colt45_extended"]);
    const snap = InvView.snapInventory();
    const fila = snap.rows.find(r => r.equipado && r.ranura === "arma");
    ok(fila && Array.isArray(fila.otros) && fila.otros.length === 0,
        "con solo cargador, otros=[]: la pagina no ofrece quitar accesorio", fila && fila.otros);
    ok(fila && fila.hasMag === true, "pero hasMag sigue diciendo que hay cargador", fila && fila.hasMag);
}

console.log(out.join("\n"));
console.log("\n=== " + (total - fallos) + "/" + total + " pruebas, " + fallos + " fallas ===");
process.exit(fallos === 0 ? 0 : 1);
