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
//   data/gsis_weapons.js      ARMAS (itemId -> weaponType) y CARGADORES
//
// El .dat lo lee el .asi antes de que exista un solo script de CLEO, y el mod
// no abre archivos, asi que la fila no se puede leer desde JS: tiene que estar
// duplicada. Duplicada y sin red, el error se ve en pantalla y no en el log.
//
// QUE CHEQUEA
// -----------
//   el .dat        una fila por tipo, tipo en 60..79, padre vanilla 22..32,
//                  padre != tipo, cargador > 0, slot > 0, modelId >= 0
//   las dos mitades  todo ARMAS[].weaponType tiene fila en el .dat, y al
//                  reves: todo tipo del .dat tiene item
//   los cargadores  todo CARGADORES[].arma existe, clipSize == clip de la fila,
//                  y ningun arma se queda sin cargador
//   el catalogo     todo ARMAS y CARGADORES estan en ITEMS
//
// QUE NO CHEQUEA, Y POR QUE
// ------------------------
// Que el modelo exista en memoria. Eso es de runtime y lo dice el log:
// gsis_limiter.txt. Un .dat impecable con un modelId que no carga da un arma
// INVISIBLE, y el unico lugar donde se ve es el log. Ver "COMO SE COMPRUEBA
// QUE UNA FILA NUEVA SIRVE" en el header del .dat.
//
// QUE NO HACE, Y POR QUE
// ----------------------
// No importa nada del mod. Las dos tablas son datos puros y no tienen imports,
// asi que se leen como texto y se evaluan solas:Importar el mod entero necesita
// el motor de CLEO, y este check tiene que correr sin juego.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const JUEGO = join(aqui, "..", "..");                       // .IronSyndicate/tools -> raiz
const DAT = join(JUEGO, "modloader", "IronSyndicate", "gsis_weapons.dat");
const DATA = join(JUEGO, "modloader", "IronSyndicate", "cleo", "IronSyndicate", "data");

const GSIS_MIN = 60, GSIS_MAX = 79;
const PADRE_MIN = 22, PADRE_MAX = 32;
const MODELO_PROPIO_MIN = 15025;

let fallos = 0;
const mal = (m) => { fallos++; console.log("FALLO  " + m); };
const bien = (m) => console.log("ok     " + m);

// Las dos tablas del mod, evaluadas sin imports: se saca el `export` y se
// devuelven por nombre. Un SyntaxError sale con el nombre del archivo, que es
// justo lo que un SyntaxError de CLEO NO da.
function cargar(ruta, nombres) {
    let src = readFileSync(ruta, "utf8");
    src = src.replace(/^export\s+/gm, "");
    return new Function(src + "\nreturn { " + nombres.join(", ") + " };")();
}

const { ARMAS, CARGADORES } = cargar(join(DATA, "gsis_weapons.js"), ["ARMAS", "CARGADORES"]);
const { ITEMS } = cargar(join(DATA, "gsis_item_data.js"), ["ITEMS"]);

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

// --- ARMAS contra el .dat, en las dos direcciones ---------------------------
const porTipo = new Map();
for (const [id, def] of Object.entries(ARMAS)) {
    const t = def.weaponType;
    if (porTipo.has(t))
        mal(`ARMAS.${id}: el tipo ${t} ya es de ${porTipo.get(t)}. Un tipo, un item: ` +
            `armaDeTipo() devuelve el primero y el que pregunta no puede elegir`);
    porTipo.set(t, id);

    const f = filas.get(t);
    if (!f) {
        mal(`ARMAS.${id} -> tipo ${t}: NO hay fila para ese tipo en el .dat. ` +
            `El .asi no lo registra y el backend nunca llama a GiveWeapon(${t})`);
        continue;
    }
    if (def.slot !== f.slot)
        mal(`ARMAS.${id}: slot ${def.slot} en JS, ${f.slot} en el .dat (linea ${f.linea})`);
}
for (const t of filas.keys()) {
    if (!porTipo.has(t))
        mal(`el .dat da de alta el tipo ${t} y no hay ningun item que lo use: ` +
            `se registra al pedirlo y nunca se entrega`);
}
if (!fallos) bien(`${Object.keys(ARMAS).length} armas: cada una con su fila en el .dat y con item`);

// --- cargadores -------------------------------------------------------------
for (const [id, m] of Object.entries(CARGADORES)) {
    const def = ARMAS[m.arma];
    if (!def) {
        mal(`CARGADORES.${id}.arma = "${m.arma}": no existe en ARMAS, ` +
            `y cargadorDe() no lo encuentra`);
        continue;
    }
    const f = filas.get(def.weaponType);
    if (f && m.clipSize !== f.cargador)
        mal(`CARGADORES.${id}: clipSize ${m.clipSize} en JS, ${f.cargador} en el .dat ` +
            `(linea ${f.linea}). Son dos copias del mismo numero: una de las dos va a mentir`);
}
for (const id of Object.keys(ARMAS)) {
    if (!Object.values(CARGADORES).some(m => m.arma === id))
        mal(`${id} no tiene ningun cargador: se entrega desnuda y no hay con que recargar`);
}
if (!fallos) bien(`${Object.keys(CARGADORES).length} cargadores: clipSize igual al clip del .dat`);

// --- catalogo ---------------------------------------------------------------
for (const id of [...Object.keys(ARMAS), ...Object.keys(CARGADORES)]) {
    if (!ITEMS[id]) mal(`ITEMS["${id}"] no existe: el inventario no conoce el item`);
}
for (const id of Object.keys(ITEMS)) {
    if (!ARMAS[id] && !CARGADORES[id] && ITEMS[id].type !== "material")
        mal(`ITEMS["${id}"] no es un arma, ni un cargador, ni un material`);
}
if (!fallos) bien("ITEMS: el catalogo cubre todas las armas y todos los cargadores");

// --- recordatorio del alcance ----------------------------------------------
console.log("");
console.log("Recordatorio: esto NO dice si el modelo se ve.");
console.log("Eso lo dice gsis_limiter.txt, y el caso que hay que mirar es el modelo");
console.log("de VANILLA sin cargar (arma invisible). Ver el header del .dat.");

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTODO OK");
process.exit(fallos ? 1 : 0);
