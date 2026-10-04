// check-dat.mjs - cruza el .dat que lee el .asi contra las tablas de JS.
//
//   node .IronSyndicate/tools/check-dat.mjs
//
// QUE RESUELVE ESTO
// -----------------
// Son DOS copias del mismo numero en DOS lugares, y esa duplicacion es la
// clase de bug que produjo el cargador de 15 que terminaba en 8:
//
//   gsis_weapons.dat          la fila que el .asi registra en su DllMain
//   data/gsis_weapons.js      FAMILIAS[].variantes (weaponType + clip) y
//                             CARGADORES (clipSize)
//
// El .dat lo lee el .asi antes de que exista un solo script de CLEO, y el mod
// no abre archivos, asi que la fila no se puede leer desde JS: tiene que estar
// duplicada. Duplicada y sin red, el error se ve en pantalla y no en el log.
//
// LAS TRES MITADES, Y POR QUE LA TERCERA ESTA
// ------------------------------------------
// El `weaponType` de una variante sale de `tipoDe()`, y `tipoDe()` COMPARA contra
// una lista. Eso agrega una forma de fallar que no existia con el tipo declarado:
// dos variantes pueden declarar el mismo par (clip, silenciador), y el comparador
// devuelve la primera. El arma no se rompe: se convierte en la otra sin que nadie
// lo pida. Este check recorre las combinaciones y avisa.
//
// Y la cuarta mitad es el ICONO, que se agrego el 03/10/2026 por un fallo real:
// `WEB_ICONS` tenia la clave `mag_colt45_15`, el nombre viejo del cargador de 15.
// Una linea con un id que no esta en ITEMS no da error en ninguna parte: la pagina
// pide el icono, no lo encuentra, y `iconCell` pinta un slot VACIO. Sin excepcion,
// sin imagen rota, sin una linea de log. Solo una celda en blanco.
//
// QUE CHEQUEA
// -----------
//   el .dat         una fila por tipo, tipo en 60..79, padre vanilla 22..32,
//                   padre != tipo, cargador > 0, slot > 0, modelId >= 0
//   las variantes   cada FAMILIAS[].variantes tiene fila en el .dat, el clip
//                   coincide, el nombre existe y el tipo no esta repetido
//   la derivacion   tipoDe() con los datos de la variante devuelve esa variante,
//                   y toda combinacion de (clip, silenciador) tiene variante
//   los cargadores  todo CARGADORES[].familias existe, clipSize > 0, y toda
//                   familia tiene al menos un cargador
//   los silenciadores  esta en ITEMS con type "weapon_attachment"
//   el catalogo     todo FAMILIAS, CARGADORES y SILENCIADORES estan en ITEMS, y
//                   ningun item de esos tipos queda fuera del catalogo
//   los iconos      todo item tiene linea en WEB_ICONS y el PNG existe en image/
//
// QUE NO CHEQUEA, Y POR QUE
// ------------------------
// Que el modelo exista en memoria. Eso es de runtime y lo dice el log:
// gsis_limiter.txt. Un .dat impecable con un modelId que no carga da un arma
// INVISIBLE, y el unico lugar donde se ve es el log. Lo resuelve
// `PedirModelosVanilla()` en limiter.cpp, que pide el modelo de cada tipo
// registrado mientras no este cargado. Ver "COMO SE COMPRUEBA QUE UNA FILA NUEVA
// SIRVE" en el header del .dat.
//
// QUE NO HACE, Y POR QUE
// ----------------------
// No importa nada del mod. Las tablas son datos puros y no tienen imports, asi que
// se leen como texto y se evaluan solas: importar el mod entero necesita el motor
// de CLEO, y este check tiene que correr sin juego.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const JUEGO = join(aqui, "..", "..");                       // .IronSyndicate/tools -> raiz
const MODLOADER = join(JUEGO, "modloader", "IronSyndicate");
const DAT = join(MODLOADER, "gsis_weapons.dat");
const DATA = join(MODLOADER, "cleo", "IronSyndicate", "data");
const IMAGE = join(MODLOADER, "image");

const GSIS_MIN = 60, GSIS_MAX = 79;
const PADRE_MIN = 22, PADRE_MAX = 32;

let fallos = 0;
const mal = (m) => { fallos++; console.log("FALLO  " + m); };
const bien = (m) => console.log("ok     " + m);

// Las tablas del mod, evaluadas sin imports: se saca el `export` y se devuelven
// por nombre. Un SyntaxError sale con el nombre del archivo, que es justo lo que
// un SyntaxError de CLEO NO da.
function cargar(ruta, nombres) {
    let src = readFileSync(ruta, "utf8");
    src = src.replace(/^export\s+/gm, "");
    return new Function(src + "\nreturn { " + nombres.join(", ") + " };")();
}

const { FAMILIAS, CARGADORES, SILENCIADORES, tipoDe, varianteDeTipo } =
    cargar(join(DATA, "gsis_weapons.js"),
        ["FAMILIAS", "CARGADORES", "SILENCIADORES", "tipoDe", "varianteDeTipo"]);
const { ITEMS } = cargar(join(DATA, "gsis_item_data.js"), ["ITEMS"]);
const { WEB_ICONS } = cargar(join(DATA, "gsis_web_data.js"), ["WEB_ICONS"]);

// --- el .dat, fila por fila -------------------------------------------------
const filas = new Map();
const lineas = readFileSync(DAT, "utf8").split(/\r?\n/);
lineas.forEach((linea, i) => {
    if (!/^\s*\d/.test(linea)) return;
    const c = linea.trim().split(/\s+/).map(Number);
    if (c.length !== 6 || c.some(Number.isNaN)) {
        mal(`.dat:${i + 1} fila mal formada: "${linea.trim()}"`);
        return;
    }
    const [tipo, padre, modelId, slot, cargador, damage] = c;
    if (filas.has(tipo)) {
        mal(`.dat:${i + 1} el tipo ${tipo} ya estaba en la linea ${filas.get(tipo).linea}`);
        return;
    }
    filas.set(tipo, { tipo, padre, modelId, slot, cargador, damage, linea: i + 1 });

    if (tipo < GSIS_MIN || tipo > GSIS_MAX)
        mal(`.dat:${i + 1} tipo ${tipo} fuera de ${GSIS_MIN}..${GSIS_MAX}`);
    if (padre < PADRE_MIN || padre > PADRE_MAX)
        mal(`.dat:${i + 1} tipo ${tipo}: padre ${padre} fuera de ${PADRE_MIN}..${PADRE_MAX}, ` +
            `o es un tipo de GSIS (${GSIS_MIN}..${GSIS_MAX}), y las dos cosas son un rechazo del .asi`);
    if (padre === tipo)
        mal(`.dat:${i + 1} tipo ${tipo}: el padre es el mismo tipo`);
    if (cargador <= 0)
        mal(`.dat:${i + 1} tipo ${tipo}: cargador ${cargador}. El .asi rechaza <= 0, ` +
            `y el mod nunca escribe m_nAmmoClip: sin este numero el arma no tiene cargador`);
    if (slot <= 0)
        mal(`.dat:${i + 1} tipo ${tipo}: slot ${slot}`);
    if (modelId < 0)
        mal(`.dat:${i + 1} tipo ${tipo}: modelId ${modelId}`);
    if (damage < -1)
        mal(`.dat:${i + 1} tipo ${tipo}: damage ${damage}. -1 es "hereda"; 0 es "cero dano"`);
});
bien(`${filas.size} filas en el .dat: tipos ${[...filas.keys()].join(", ")}`);

// --- variantes contra el .dat, en las dos direcciones -----------------------
let nVariantes = 0;
for (const [fid, f] of Object.entries(FAMILIAS)) {
    if (!ITEMS[fid])
        mal(`FAMILIAS["${fid}"] no esta en ITEMS: el inventario no tiene un item con ese nombre`);

    const tiposVistos = new Set();
    for (const v of f.variantes) {
        nVariantes++;
        if (tiposVistos.has(v.weaponType))
            mal(`${fid}: el tipo ${v.weaponType} esta en dos variantes`);
        tiposVistos.add(v.weaponType);

        if (!v.nombre)
            mal(`${fid}: la variante de tipo ${v.weaponType} no tiene nombre, y la UI lo muestra`);
        if (!(v.clip > 0))
            mal(`${fid} variante ${v.weaponType}: clip ${v.clip}. Tiene que ser > 0: ` +
                `es el numero de balas de la fila del .dat`);

        // La derivacion tiene que ser REVERSIBLE. Si tipoDe() con los datos de la
        // variante devuelve otro tipo, es que hay dos variantes peleandose el
        // mismo par (clip, silenciador) y el comparador devuelve la primera.
        const derivado = tipoDe(fid, v.clip, v.silenciador);
        if (derivado !== v.weaponType)
            mal(`${fid}: tipoDe(clip=${v.clip}, silenciador=${v.silenciador}) devuelve ` +
                `${derivado} y la variante declara ${v.weaponType}. Dos variantes con el ` +
                `mismo par: el arma se convierte en la otra sin que nadie la pida`);

        const fila = filas.get(v.weaponType);
        if (!fila) {
            mal(`${fid} variante "${v.nombre}" pide el tipo ${v.weaponType} y el .dat no lo ` +
                `tiene. El .asi no lo registra y el give no da nada`);
            continue;
        }
        if (fila.cargador !== v.clip)
            mal(`${fid} "${v.nombre}": clip ${v.clip} en JS, ${fila.cargador} en el .dat ` +
                `(linea ${fila.linea}). Son dos copias del mismo numero: una de las dos va a mentir`);
        if (fila.slot !== f.slot)
            mal(`${fid} "${v.nombre}": slot ${f.slot} en JS, ${fila.slot} en el .dat ` +
                `(linea ${fila.linea})`);
    }
}
for (const t of filas.keys()) {
    let enAlguien = false;
    for (const fid of Object.keys(FAMILIAS)) {
        if (varianteDeTipo(fid, t)) enAlguien = true;
    }
    if (!enAlguien)
        mal(`el .dat da de alta el tipo ${t} y ninguna variante lo pide: se registra al ` +
            `pedirlo, ocupa un slot del rango ${GSIS_MIN}..${GSIS_MAX} para siempre y nunca se entrega`);
}
bien(`${nVariantes} variantes: cada una con su fila en el .dat, el clip coincide y la ` +
     `derivacion es reversible`);
bien(`las ${filas.size} filas del .dat las pide alguna variante`);

// --- toda combinacion tiene que existir -------------------------------------
for (const fid of Object.keys(FAMILIAS)) {
    const clips = [...new Set(Object.entries(CARGADORES)
        .filter(([, m]) => m.familias.indexOf(fid) !== -1)
        .map(([, m]) => m.clipSize))].sort((a, b) => a - b);

    if (!clips.length) {
        mal(`${fid}: no hay ningun cargador que le sirva. El arma se entrega desnuda y no ` +
            `hay con que recargar`);
        continue;
    }
    for (const clip of clips) {
        for (const sil of [false, true]) {
            const etiqueta = `(${clip} balas, ${sil ? "sil." : "pelada"})`;
            const t = tipoDe(fid, clip, sil);
            if (!t) {
                mal(`${fid}: la combinacion ${etiqueta} no tiene variante. El arma se queda ` +
                    `como esta y el jugador no entiende por que`);
            } else if (!filas.has(t)) {
                mal(`${fid}: la combinacion ${etiqueta} da el tipo ${t} y el .dat no lo tiene`);
            }
        }
    }
}
bien("toda combinacion de (balas, silenciador) tiene variante, y su tipo esta en el .dat");

// --- cargadores -------------------------------------------------------------
for (const [id, m] of Object.entries(CARGADORES)) {
    if (!Array.isArray(m.familias) || !m.familias.length)
        mal(`CARGADORES["${id}"].familias tiene que ser una lista no vacia`);
    for (const fid of m.familias || []) {
        if (!FAMILIAS[fid])
            mal(`CARGADORES["${id}"].familias: "${fid}" no existe en FAMILIAS, y ` +
                `cargadorSirveA() no lo va a encontrar nunca`);
    }
    if (!(m.clipSize > 0))
        mal(`CARGADORES["${id}"]: clipSize ${m.clipSize}. Tiene que ser > 0`);
    if (!ITEMS[id]) mal(`ITEMS["${id}"] no existe: el inventario no conoce el cargador`);
}
bien(`${Object.keys(CARGADORES).length} cargadores: cada uno con clipSize > 0 y familia valida`);

// --- silenciadores ----------------------------------------------------------
for (const [id, s] of Object.entries(SILENCIADORES)) {
    if (!ITEMS[id])
        mal(`SILENCIADORES["${id}"] no esta en ITEMS: el jugador no puede comprarlo`);
    else if (ITEMS[id].type !== "weapon_attachment")
        mal(`SILENCIADORES["${id}"] esta en ITEMS como "${ITEMS[id].type}" y tiene que ser ` +
            `"weapon_attachment": es la categoria "Accesorios" de la UI`);
    if (!(s.peso > 0))
        mal(`SILENCIADORES["${id}"]: peso ${s.peso}. Un item de peso 0 no ocupa espacio`);
}
if (!Object.keys(SILENCIADORES).length)
    mal("SILENCIADORES vacio: la mitad de las variantes no se puede alcanzar");
bien(`${Object.keys(SILENCIADORES).length} silenciadores, en el catalogo y con la categoria correcta`);

// --- catalogo ---------------------------------------------------------------
for (const id of Object.keys(ITEMS)) {
    const t = ITEMS[id].type;
    if (t === "weapon" && !FAMILIAS[id])
        mal(`ITEMS["${id}"] es un arma y no esta en FAMILIAS: el item existe y el motor no`);
    if (t === "magazine" && !CARGADORES[id])
        mal(`ITEMS["${id}"] es un cargador y no esta en CARGADORES`);
    if (t === "weapon_attachment" && !SILENCIADORES[id])
        mal(`ITEMS["${id}"] es un accesorio y no esta en SILENCIADORES`);
}
bien("todo item de tipo arma/cargador/accesorio tiene su entrada en el catalogo");

// --- iconos -----------------------------------------------------------------
// MEDIDO el 03/10/2026: `WEB_ICONS` tenia `mag_colt45_15`, el nombre viejo del
// cargador de 15. No da error en ninguna parte — la pagina pide el icono, no lo
// encuentra, y pinta un slot vacio — y por eso es un FALLO y no una nota.
let sinIcono = 0;
for (const [id] of Object.entries(ITEMS)) {
    const icono = WEB_ICONS[id];
    if (!icono) {
        mal(`ITEMS["${id}"] no tiene linea en WEB_ICONS. La celda del icono sale VACIA, ` +
            `sin error y sin aviso`);
        sinIcono++;
        continue;
    }
    if (!existsSync(join(IMAGE, icono)))
        mal(`WEB_ICONS["${id}"] = "${icono}" y ese PNG no existe en image/`);
}
if (!sinIcono) bien(`los ${Object.keys(ITEMS).length} items tienen icono, y todos los PNG existen`);

// --- recordatorio del alcance ----------------------------------------------
console.log("");
console.log("Recordatorio: esto NO dice si el modelo se ve.");
console.log("Eso lo dice gsis_limiter.txt, y el caso que hay que mirar es el modelo");
console.log("de VANILLA sin cargar (arma invisible). Ver el header del .dat.");

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTODO OK");
process.exit(fallos ? 1 : 0);
