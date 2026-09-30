// check-migration.mjs - Prueba de la migracion de saves v1 -> v2
// Corre con node, sin GTA: importa los mismos archivos que el mod.
//
//   node .IronSyndicate/tools/check-migration.mjs
//
// Que prueba, y por que con node y no jugando:
//   * las 4 cosetras que el formato nuevo no puede tener (magId, hasMag,
//     weaponType, variantWeaponType)
//   * que weaponType viejo -> attachments, con la evidencia que sea
//   * que NO se inventan accesorios
//   * que una configuracion irresoluble degrada a la base y avisa
//   * que la salud sobrevive
//   * que el ciclo viejo -> nuevo -> RECARGA es idempotente
//
// El ultimo punto es el que importa de verdad: si la migracion no es
// idempotente, la segunda carga de la partida pierde algo, y eso no se ve hasta
// que el jugador guardo otra vez.

import {
    migrateSave, SAVE_FORMAT_VERSION, versionDe, renameItemId,
    registeredMigrators, ITEM_RENAMES
} from "../../modloader/IronSyndicate/cleo/IronSyndicate/core/gsis_SaveMigration.js";

// Esto es lo que hace el mod: el modulo de armas se importa y se registra solo.
import "../../modloader/IronSyndicate/cleo/IronSyndicate/modules/weapons/migrate.js";

import {
    resolveWeaponType, canonicalAttachmentId, getFamilyByItemId
} from "../../modloader/IronSyndicate/cleo/IronSyndicate/data/gsis_weapons.js";
import { ITEMS, SALUD_MAX } from "../../modloader/IronSyndicate/cleo/IronSyndicate/data/gsis_item_data.js";

let fallos = 0;
let total = 0;
const log = [];

function ok(cond, msg, extra) {
    total++;
    if (cond) {
        log.push("   ok   " + msg);
    } else {
        fallos++;
        log.push("   FALLA " + msg + (extra !== undefined ? "  -> " + JSON.stringify(extra) : ""));
    }
}

// `log()` es global de CLEO. En node no existe, y las migraciones loguean, asi que
// se define antes de importar nada que loguee.
globalThis.log = function (msg) { log.push("   [log] " + msg); };

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
// El save viejo, en la forma que escribia el Ballistic de antes.
function saveViejo(equipped, extra) {
    const s = {
        version: "1.0",
        ts: 1000,
        player: { model: 0, cleanMoney: 500, dirtyMoney: 100 }
    };
    if (equipped) s.Ballistic = { equipped };
    if (extra) Object.assign(s, extra);
    return s;
}

// Las 4 letras que el formato nuevo prohibe. Si una aparece, el segundo modelo
// volvio a meterse por la puerta de atras.
const CAMPOS_PROHIBIDOS = ["magId", "hasMag", "weaponType", "variantWeaponType"];

function assertSinCamposProhibidos(save, etiqueta) {
    const eq = save.Ballistic && save.Ballistic.equipped;
    if (!eq) return;
    for (const slot of Object.keys(eq)) {
        const e = eq[slot];
        if (!e) continue;
        for (const c of CAMPOS_PROHIBIDOS) {
            ok(!(c in e), etiqueta + ": slot " + slot + " sin `" + c + "`", e);
        }
        ok(Object.keys(e).length === 4,
            etiqueta + ": slot " + slot + " tiene exactamente 4 campos", Object.keys(e));
    }
}

// ---------------------------------------------------------------------------
// 0. LAS PREMISAS
// ---------------------------------------------------------------------------
log.push("=== 0. LAS PREMISAS DEL CONTRATO ===");
ok(SAVE_FORMAT_VERSION === 2, "SAVE_FORMAT_VERSION es 2", SAVE_FORMAT_VERSION);
ok(versionDe("1.0") === 1, 'versionDe("1.0") -> 1 (el string de los saves viejos)');
ok(versionDe(2) === 2, "versionDe(2) -> 2");
ok(versionDe(undefined) === 1, "versionDe(undefined) -> 1 (asume la mas baja migrable)");
ok(versionDe(1.9) === 1, "versionDe(1.9) -> 1 (parseInt, no round)");
ok(versionDe(99) === 99, "versionDe(99) -> 99 (save del futuro se reconoce)");

const regs = registeredMigrators();
ok(regs.length >= 1, "hay al menos un migrador registrado", regs);
ok(regs.some(r => r.version === 1 && r.nombre === "weapons-v2"),
    "el migrador de weapons esta registrado para 1 -> 2", regs);

log.push("");
log.push("=== 1. LOS DOS NAMESPACES (por que el rename NO va en ITEM_RENAMES) ===");
ok(!!ITEMS["mag_colt45_extended"],
    "`mag_colt45_extended` es un itemId VALIDO hoy (esta en ITEMS)");
ok(!ITEMS["mag_colt45_15"],
    "`mag_colt45_15` NO es un itemId (no esta en ITEMS)");
ok(canonicalAttachmentId("mag_colt45_extended") === "mag_colt45_15",
    "pero SI es el nombre canonico de la lista de accesorios");
ok(!("mag_colt45_extended" in ITEM_RENAMES),
    "ITEM_RENAMES NO renombra mag_colt45_extended (lo dejaria sin catalogar)");
ok(renameItemId("mag_9mm_extended") === "mag_colt45_extended",
    "mag_9mm_extended -> mag_colt45_extended, y PARA ahi (un solo salto)");
ok(renameItemId("9mm") === "colt45", "9mm -> colt45");

log.push("");
log.push("=== 2. weaponType viejo -> attachments ===");
// El caso central: attachments ausente, weaponType presente. La lista sale del
// numero guardado, que es la evidencia.
{
    const s = saveViejo({
        2: { id: "colt45", hasMag: true, salud: 80, magId: "mag_colt45_extended",
             attachments: null, variantWeaponType: 60 }
    });
    migrateSave(s);
    const e = s.Ballistic.equipped[2];
    ok(e.attachments.length === 1 && e.attachments[0] === "suppressor",
        "variantWeaponType 60 -> attachments [suppressor]", e.attachments);
    ok(e.family === "colt45", "family derivada del id");
    assertSinCamposProhibidos(s, "60");
}
// `weaponType` (nombre viejo del campo) tambien cuenta, y el orden de preferencia.
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100, weaponType: 61 } });
    migrateSave(s);
    const e = s.Ballistic.equipped[2];
    ok(e.attachments.includes("suppressor") && e.attachments.includes("mag_colt45_15"),
        "weaponType 61 -> [suppressor, mag_colt45_15]", e.attachments);
}
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100,
        variantWeaponType: 63, weaponType: 60 } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].attachments.length === 0,
        "si variantWeaponType y weaponType NO coinciden, gana variantWeaponType",
        s.Ballistic.equipped[2].attachments);
}
// El nombre viejo del cargador DENTRO de attachments -> canonico.
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100,
        attachments: ["mag_colt45_extended"], variantWeaponType: 62 } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].attachments[0] === "mag_colt45_15",
        "attachments [mag_colt45_extended] -> [mag_colt45_15]",
        s.Ballistic.equipped[2].attachments);
}
// El nombre de la epoca 9mm DENTRO de attachments.
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100,
        attachments: ["mag_9mm_extended"] } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].attachments[0] === "mag_colt45_15",
        "attachments [mag_9mm_extended] -> [mag_colt45_15]",
        s.Ballistic.equipped[2].attachments);
}
// Las tres variantes pendientes del .dat tambien salen del weaponType.
{
    const s = saveViejo({
        1: { id: "ak47", salud: 100, variantWeaponType: 64 },
        2: { id: "m4_assembled", salud: 100, variantWeaponType: 65 },
        3: { id: "m4_assembled", salud: 100, variantWeaponType: 66 }
    });
    migrateSave(s);
    ok(s.Ballistic.equipped[1].attachments[0] === "mag_ak47_drum", "64 -> [mag_ak47_drum]");
    ok(s.Ballistic.equipped[2].attachments[0] === "mag_m4_lancer", "65 -> [mag_m4_lancer]");
    ok(s.Ballistic.equipped[3].attachments[0] === "mag_m4_drum", "66 -> [mag_m4_drum]");
}

log.push("");
log.push("=== 3. NO SE INVENTAN ACCESORIOS ===");
// Una lista vacia explicita significa "sin accesorios", no "buscale uno".
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100, attachments: [],
        magId: "mag_colt45_extended", hasMag: true, variantWeaponType: 63 } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].attachments.length === 0,
        "attachments [] explicito + magId presente: NO rearma el cargador desde magId",
        s.Ballistic.equipped[2].attachments);
}
// Un 22 de vanilla: no hay variante, no hay con que inventar, base.
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100, variantWeaponType: 22 } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].attachments.length === 0,
        "weaponType 22 (vanilla) degrada a la base, sin inventar");
}
// magId que apunta a un cargador que ya no existe: no rompe nada.
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100, attachments: [],
        magId: "mag_9mm_extended" } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].attachments.length === 0,
        "magId con id inexistente se dilata sin tocar la lista");
}
// Un type de OTRA familia no puede traer accesorios ajenos.
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100, variantWeaponType: 64 } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].attachments.length === 0,
        "un weaponType de otra familia (64, ak47) NO importa sus accesorios",
        s.Ballistic.equipped[2].attachments);
}

log.push("");
log.push("=== 4. DEGRADACION EXPLICITA ===");
// Un accesorio que no existe: degrada a la base y avisa.
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100,
        attachments: ["suppressor", "inventado_xyz"] } });
    const antes = log.length;
    migrateSave(s);
    const e = s.Ballistic.equipped[2];
    ok(e.attachments.length === 0, "configuracion irresoluble -> base", e.attachments);
    ok(e.family === "colt45", "la familia sobrevive a la degradacion");
    ok(e.salud === 100, "la salud sobrevive a la degradacion");
    ok(log.slice(antes).some(l => l.includes("no resuelve")),
        "degradar deja log con el motivo", log.slice(antes));
    ok(!!s.Ballistic.equipped[2], "la entrada NO se borra del slot (degradar, no perder)");
}
// Un id que no es de ninguna familia: ahi si se borra, y se dice.
{
    const s = saveViejo({ 2: { id: "no_es_un_arma", salud: 100, variantWeaponType: 60 } });
    const antes = log.length;
    migrateSave(s);
    ok(!s.Ballistic.equipped[2], "id sin familia: la entrada se quita del registro");
    ok(log.slice(antes).some(l => l.includes("no es de ninguna familia")),
        "y deja log diciendo por que");
}

log.push("");
log.push("=== 5. LA SALUD SE PRESERVA ===");
for (const salud of [0, 37, 100]) {
    const s = saveViejo({ 2: { id: "colt45", salud, variantWeaponType: 60 } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].salud === salud, "salud " + salud + " sobrevive",
        s.Ballistic.equipped[2].salud);
}
{
    const s = saveViejo({ 2: { id: "colt45", variantWeaponType: 60 } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].salud === SALUD_MAX,
        "sin salud -> SALUD_MAX (" + SALUD_MAX + ")");
}
{
    const s = saveViejo({ 2: { id: "colt45", salud: 9999, variantWeaponType: 60 } });
    migrateSave(s);
    ok(s.Ballistic.equipped[2].salud === 100, "salud fuera de rango se recorta a 100");
}

log.push("");
log.push("=== 6. LAS 4 LETRAS PROHIBIDAS, EN UN SAVE REALISTA ===");
{
    const s = saveViejo({
        1: { id: "colt45", hasMag: true, salud: 100, magId: "mag_colt45_extended",
             attachments: ["mag_colt45_extended"], variantWeaponType: 62 },
        2: { id: "ak47", hasMag: false, salud: 55, magId: null,
             attachments: null, variantWeaponType: 64 },
        3: { id: "colt45", hasMag: true, salud: 0, magId: "mag_9mm_extended",
             attachments: null, variantWeaponType: 61 },
        7: { id: "m4_assembled", hasMag: true, salud: 90, magId: "mag_m4_drum",
             attachments: null, variantWeaponType: 66 }
    });
    migrateSave(s);
    assertSinCamposProhibidos(s, "realista");
    const eq = s.Ballistic.equipped;
    ok(eq[1].attachments[0] === "mag_colt45_15", "slot 1: cargador canonico");
    ok(eq[2].attachments[0] === "mag_ak47_drum", "slot 2: tambor de 75");
    ok(eq[3].attachments.length === 2, "slot 3: silenciador + cargador de 15", eq[3].attachments);
    ok(eq[7].attachments[0] === "mag_m4_drum", "slot 7: tambor de la m4");
    // Y TODAS las configuraciones migradas resuelven de verdad.
    for (const slot of Object.keys(eq)) {
        const e = eq[slot];
        const t = resolveWeaponType(e.family, e.attachments);
        ok(t !== null, "slot " + slot + " resuelve con resolveWeaponType (" +
            e.family + " + [" + e.attachments + "])");
    }
}

log.push("");
log.push("=== 7. LA MIGRACION NO TOCA LOS OTROS MODULOS ===");
{
    const s = saveViejo(
        { 2: { id: "colt45", salud: 100, variantWeaponType: 60 } },
        {
            ItemsManager: {
                inventory: [
                    { id: "colt45", qty: 1, ammo: 30, hasMag: true, salud: 100 },
                    { id: "mag_colt45_extended", qty: 2 },
                    { id: "9mm", qty: 1, ammo: 50 },
                    { id: "silenced_9mm", qty: 1 }
                ],
                belt: [{ id: "9mm", qty: 4, ammo: 17 }],
                trunks: { 1: [{ id: "mag_9mm_extended", qty: 1 }] }
            },
            VehicleModule: { vehicles: [{ id: 411, x: 1, y: 2, z: 3 }] }
        });
    migrateSave(s);
    const inv = s.ItemsManager.inventory;
    const ids = inv.map(i => i.id);
    ok(ids.includes("mag_colt45_extended"),
        "el item de inventario mag_colt45_extended SIGUE con ese id (no se rompe)", ids);
    ok(!ids.includes("mag_colt45_15"),
        "y no se renombro a mag_colt45_15, que no existe en ITEMS", ids);
    ok(!ids.includes("9mm") && !ids.includes("silenced_9mm"),
        "los ids viejos del inventario SI se renombraron (eso si es su namespace)", ids);
    ok(s.ItemsManager.belt[0].id === "colt45", "el cinturon tambien");
    ok(s.ItemsManager.trunks["1"][0].id === "mag_colt45_extended",
        "y el baul, que es un mapa por clave y no una lista");
    // Y lo que NO se renombro sigue siendo un id que Items reconoce.
    for (const it of inv) {
        ok(!!ITEMS[it.id], "el item renombrado \"" + it.id + "\" existe en ITEMS");
    }
    ok(JSON.stringify(s.VehicleModule) === JSON.stringify({ vehicles: [{ id: 411, x: 1, y: 2, z: 3 }] }),
        "VehicleModule intacto byte a byte");
}

log.push("");
log.push("=== 8. IDEMPOTENCIA: viejo -> nuevo -> RECARGA ===");
// El ciclo completo: migrar, guardar (JSON), y cargar de nuevo.
{
    const viejo = saveViejo({
        1: { id: "colt45", hasMag: true, salud: 100, magId: "mag_colt45_extended",
             attachments: ["mag_colt45_extended"], variantWeaponType: 62 },
        2: { id: "ak47", hasMag: true, salud: 42, magId: "mag_ak47_drum",
             attachments: null, variantWeaponType: 64 },
        3: { id: "colt45", salud: 77, attachments: ["suppressor"], variantWeaponType: 60 },
        4: { id: "m4_assembled", salud: 100, attachments: null, variantWeaponType: 65 }
    });

    // --- carga 1: save viejo ---
    migrateSave(viejo);
    ok(viejo.version === SAVE_FORMAT_VERSION, "carga 1: el save queda en la version nueva", viejo.version);
    const despues1 = JSON.stringify(viejo);

    // --- guardar ---
    const enDisco = JSON.parse(JSON.stringify(viejo));

    // --- carga 2: el save recien guardado, con TODOS los modulos ya cargados ---
    const info = migrateSave(enDisco);
    ok(info.versionAntes === SAVE_FORMAT_VERSION && info.versionDespues === SAVE_FORMAT_VERSION,
        "carga 2: entra y sale en la version nueva (las migraciones no se re-corren)", info);
    ok(JSON.stringify(enDisco) === despues1,
        "carga 2: el save es IDENTICO byte a byte (idempotente)");

    // --- carga 3: por si acaso ---
    migrateSave(enDisco);
    ok(JSON.stringify(enDisco) === despues1, "carga 3: sigue identico");

    // Y la salud de la partida no se perdio en ninguno de los tres viajes.
    ok(enDisco.Ballistic.equipped[1].salud === 100 &&
       enDisco.Ballistic.equipped[2].salud === 42 &&
       enDisco.Ballistic.equipped[3].salud === 77,
        "la salud de los 3 slots con dano sobrevive al ciclo");
}

log.push("");
log.push("=== 9. CASOS BORDEOS DEL CICLO DE VIDA DEL SAVE ===");
// Un save que ya es nuevo (arranca en una partida nueva).
{
    const s = saveViejo({ 2: { id: "colt45", family: "colt45", attachments: ["suppressor"], salud: 90 } });
    s.version = 2;
    const antes = JSON.stringify(s.Ballistic);
    const info = migrateSave(s);
    ok(JSON.stringify(s.Ballistic) === antes,
        "un save ya en v2 con la forma nueva no se toca", s.Ballistic.equipped[2]);
    ok(info.pasos.length === 0, "y no corre ningun migrador", info.pasos);
}
// Save sin modulo de armas.
{
    const s = saveViejo(null);
    const info = migrateSave(s);
    ok(s.version === 2, "un save sin Ballistic se migra sin romperse");
    ok(info.pasos.length === 0 || info.pasos.every(p => p.ok), "sin errores");
}
// Save del futuro: no se toca, y se avisa.
{
    const s = saveViejo({ 2: { id: "colt45", salud: 1, variantWeaponType: 60 } });
    s.version = 99;
    const antes = JSON.stringify(s.Ballistic);
    const info = migrateSave(s);
    ok(JSON.stringify(s.Ballistic) === antes, "un save de version 99 NO se toca");
    ok(info.versionAntes === 99 && info.versionDespues === 99, "y conserva su version", info);
    ok(info.pasos.some(p => p.nombre === "futuro" && !p.ok),
        "y el log dice que es un save posterior");
}
// Sin argumentos: no explota.
{
    ok(migrateSave(null).versionDespues === SAVE_FORMAT_VERSION, "migrateSave(null) no explota");
    ok(migrateSave(undefined).renombrados === 0, "migrateSave(undefined) no explota");
    ok(migrateSave("texto").renombrados === 0, "migrateSave(\"texto\") no explota");
    ok(migrateSave([]).renombrados === 0, "migrateSave([]) no explota");
}
// equipped que no es un objeto, o slots basura.
{
    const s = saveViejo({ 2: "no soy un objeto", 3: null, 4: { id: "colt45", salud: 5, variantWeaponType: 60 } });
    migrateSave(s);
    const eq = s.Ballistic.equipped;
    ok(!eq[2] && !eq[3], "los slots basura se descartan");
    ok(!!eq[4] && eq[4].attachments.includes("suppressor"), "el slot bueno se migra igual");
}
{
    const s = saveViejo({ 2: { id: "colt45", salud: 100, variantWeaponType: 60 } });
    s.Ballistic.equipped = "no soy un mapa";
    const info = migrateSave(s);
    ok(info.pasos.every(p => p.ok), "equipped que no es un mapa no rompe la carga");
}

log.push("");
log.push("=== 10. UN MIGRADOR QUE LANZA ===");
// ESTE CASO VA ULTIMO DE TODOS, Y NO POR ORDEN ESTETICO: el registro de
// migradores es GLOBAL y no hay como dar de baja uno. En cuanto se registra este
// que lanza, TODA llamada posterior a migrateSave lo corre y falla. Si se deja en
// el medio, ensucia los casos que vienen despues y el fallo aparece donde no es.
{
    const { registerSaveMigrator } = await import(
        "../../modloader/IronSyndicate/cleo/IronSyndicate/core/gsis_SaveMigration.js");
    registerSaveMigrator(1, "rompe-a-proposito", function () { throw new Error("boom"); });
    const s = saveViejo({ 2: { id: "colt45", salud: 100, variantWeaponType: 60 } });
    const info = migrateSave(s);
    ok(info.pasos.some(p => p.nombre === "rompe-a-proposito" && !p.ok),
        "un migrador que lanza se reporta y no se detiene la carga", info.pasos);
    ok(s.Ballistic.equipped[2].attachments.includes("suppressor"),
        "y el otro migrador igual hizo su trabajo");
    ok(info.versionDespues === SAVE_FORMAT_VERSION,
        "y el save queda en la version nueva igual", info);
}

// ---------------------------------------------------------------------------
console.log(log.join("\n"));
console.log("");
console.log("=== " + (total - fallos) + "/" + total + " pruebas, " + fallos + " fallas ===");
process.exit(fallos === 0 ? 0 : 1);
