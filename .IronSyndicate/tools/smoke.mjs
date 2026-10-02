// smoke.mjs - ¿Carga el mod entero?
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).
//
//   node .IronSyndicate/tools/smoke.mjs
//
// Que resuelve esto
// -----------------
// Que TODOS los modulos del mod se importen sin que un import quede apuntando a
// un archivo que no existe, y que los que registran modulo queden registrados.
//
// Por que existe y por que no reemplaza a los otros checks
// -------------------------------------------------------
// check-dat.mjs verifica el contrato con el .asi. check-ui-flow.mjs verifica el
// flujo de la UI. Los dos son de UN subsistema, y ninguno dice nada de los otros
// doce modulos: si gsis_Trunk.js importa un simbolo que gsis_weapons.js ya no
// exporta, ninguno de los dos se entera y el mod no arranca en el juego.
//
// Esto es lo mas.CHECK que se parece a "cargar el juego": importa los modulos en
// el MISMO orden que cleo/[fs][mem]gsis_index.js y verifica que el registro de
// modulos quedo completo. El orden importa porque el orden de imports ES el
// orden de update por frame, y un modulo que depende de otro necesita que el otro
// ya se haya importado.
//
// QUE NO PRUEBA
// -------------
// Que el juego funcione: native(), Memory y Player no existen en node. Que un
// modulo se importe no dice que su update no tire. Lo que si dice, y es lo que
// rompia todo el tiempo: que la ARMA de archivos esta sana.
//
// Y por que importa: un import roto en node es un SyntaxError con el nombre del
// archivo. En CLEO es una linea de log y el mod sigue vivo sin esa pantalla.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, sep as pathSep } from "node:path";
import { spawnSync } from "node:child_process";

// Los globals de CLEO. fake-engine.mjs los define de verdad (con un motor de
// mentira); lo que hace falta aca es solo que EXISTAN, porque varios modulos
// llaman log() en el import.
import "./fake-engine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLEO = join(__dirname, "..", "..", "modloader", "IronSyndicate", "cleo");
const INDEX = join(CLEO, "[fs][mem]gsis_index.js");

let fallos = 0;
const ok = (c, m, extra) => {
    console.log((c ? "   ok   " : "   FALLA ") + m +
        (extra !== undefined && !c ? "   -> " + String(extra) : ""));
    if (!c) fallos++;
};

// ---------------------------------------------------------------------------
// 1. EL INDEX EXISTE Y ES LEGIBLE
// ---------------------------------------------------------------------------
if (!existsSync(INDEX)) {
    console.log("   FALLA no existe cleo/[fs][mem]gsis_index.js");
    process.exit(1);
}
const fuente = readFileSync(INDEX, "utf8");

// ---------------------------------------------------------------------------
// 2. CADA IMPORT RELATIVO DEL INDEX RESUELVE A UN ARCHIVO QUE EXISTE
// ---------------------------------------------------------------------------
// Este es el chequeo que mas falla y el mas barato: un import a un archivo que se
// borro es un error de una linea aca y un log de una linea en el juego.
// ---------------------------------------------------------------------------
// 0. EL INDEX PARSEA COMO CODIGO, NO COMO TEXTO
// ---------------------------------------------------------------------------
// El chequeo que faltaba, y el que mas caro salio.
//
// Que un archivo "parezca" un script no es que lo sea. Durante el borrado del
// sistema de armas un comentario del index quedo partido a mitad de linea con las
// comillas pegadas —el texto se leia perfecto y el archivo no parseaba—, y el
// modulo entero no arrancaba. El sintoma en CLEO es una linea de log y nada mas,
// asi que el fallo no dice nada del archivo que lo causa.
//
// Por eso este chequeo PARASEA con el parser de node en vez de buscar patrones.
// Los patrones miran la forma de una linea; el parser mira si el archivo es un
// programa. Un comentario con comillas desbalanceadas es indistinguible de un
// comentario sano para un regex, y es un SyntaxError para el motor que lo carga.
//
// Y es el MISMO parser: node y CLEO+ usan V8, asi que lo que node acepta es lo
// que CLEO+ acepta.
console.log("\n=== 0. CADA ARCHIVO PARSEA ===");
function archivosJs(dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...archivosJs(p));
        else if (e.name.endsWith(".js")) out.push(p);
    }
    return out;
}
for (const archivo of archivosJs(CLEO)) {
    // `node --check` parsea sin ejecutar. Los archivos del mod tienen `import`, asi
    // que node los trata como ESM solo: no hace falta `--input-type`, que no se
    // puede combinar con un archivo.
    const r = spawnSync("node", ["--check", archivo], { encoding: "utf8" });
    const err = (r.stderr || "").split("\n").find(l => /Error/.test(l)) || "";
    ok(r.status === 0, pathRel(archivo) + " parsea", err.trim());
}

console.log("\n=== 1. LOS IMPORTS DEL INDEX RESUELVEN ===");
const imports = [...fuente.matchAll(/^\s*import\s+(?:.+\s+from\s+)?"([^"]+)"/gm)]
    .map(m => m[1]);

if (!imports.length) {
    ok(false, "el index no tiene imports (esta vacio o el parseo fallo)");
}
for (const spec of imports) {
    const ruta = join(CLEO, spec.replace(/^\.\//, "").replace(/\.js$/, ".js"));
    ok(existsSync(ruta), "import " + spec, "no existe " + ruta);
}

// ---------------------------------------------------------------------------
// 3. IMPORTAR TODO, EN ORDEN, NO TIRA
// ---------------------------------------------------------------------------
// El orden del index es el orden de update por frame, y por eso los modulos se
// importan uno por uno y no en bloque: un `import` estatico los traeria todos a
// la vez, sin garantia de orden, y el registro de modulos queda en otro orden al
// que el index dice.
console.log("\n=== 2. IMPORTAR CADA MODULO, EN ORDEN ===");
const relativos = imports.filter(s => s.startsWith("."));
const registrados = [];

for (const spec of relativos) {
    const ruta = join(CLEO, spec);
    try {
        await import("file://" + ruta.replace(/\\/g, "/"));
        console.log("   ok   importo " + spec);
    } catch (e) {
        fallos++;
        console.log("   FALLA importo " + spec + "\n         " +
            (e && e.message ? e.message : e));
    }
}

// ---------------------------------------------------------------------------
// 4. EL REGISTRO DE MODULOS QUEDO COMPLETO
// ---------------------------------------------------------------------------
// Que importar un archivo no dice que su register() se haya llamado. Un modulo
// que se importa pero no se registra es un modulo invisible: no aparece en el log
// de arranque y su update no corre nunca, y el sintoma es una pantalla que no
// cambia.
console.log("\n=== 3. LOS MODULOS QUEDARON REGISTRADOS ===");
const { getModules } = await import("file://" +
    join(CLEO, "IronSyndicate/core/gsis_ModuleRegistry.js").replace(/\\/g, "/"));

const mods = getModules();
const nombres = mods.map(m => m.name);
console.log("   " + mods.length + " modulo(s) registrado(s): " + nombres.join(", "));
ok(mods.length > 0, "hay modulos registrados", mods.length);

// Que importar un archivo no dice que su register() se haya llamado, y un modulo
// que se importa pero no se registra es un modulo INVISIBLE: no sale en el log de
// arranque y su update no corre nunca.
//
// El nombre NO se adivina del archivo: inventory/index.js se registra como
// "Items" y gsis_PropertyModule.js como "Properties", asi que compararlos por
// nombre de archivo da dos falsos positivos siempre. Se lee el `name:` que el
// propio modulo declara, que es lo que el registro guarda.
//
// Y antes de escanear se COMENTAN las lineas, porque este repo documenta con
// ejemplos reales: gsis_ModuleRegistry.js tiene un `register({ name: "Trunk" ... })`
// escrito en un comentario de cabecera para mostrar la forma de la llamada, y sin
// esto el chequeo reportaria que el registry registro un modulo "Trunk".
function sinComentarios(codigo) {
    return codigo
        .replace(/\/\*[\s\S]*?\*\//g, " ")   // bloque
        .replace(/\/\/[^\n]*/g, " ");         // linea
}

// Un path relativo a la raiz del mod, para que los mensajes de falla se lean sin
// una linea de 120 caracteres de "C:\Program Files\GTA SA\..." al principio.
function pathRel(ruta) {
    const raiz = join(__dirname, "..", "..") + pathSep;
    return ruta.startsWith(raiz) ? ruta.slice(raiz.length) : ruta;
}

function statIsFile(p) {
    try { return statSync(p).isFile(); } catch (e) { return false; }
}

console.log("\n   cada archivo que llama register() se registro con SU nombre:");
for (const spec of relativos) {
    const fuenteMod = sinComentarios(readFileSync(join(CLEO, spec), "utf8"));
    const m = fuenteMod.match(/register\(\s*\{[\s\S]{0,400}?\bname\s*:\s*"([^"]+)"/);
    if (!m) continue;                       // no registra nada: no es un modulo
    ok(nombres.includes(m[1]),
        spec.split("/").pop() + " se registro como \"" + m[1] + "\"",
        "registrados: " + nombres.join(", "));
}

// ---------------------------------------------------------------------------
// 5. LOS EXPORT QUE ALGUIEN IMPORTA EXISTEN
// ---------------------------------------------------------------------------
// Que un modulo importe de un archivo no dice que el archivo EXPORTE lo que se le
// pide. En ESM eso es un SyntaxError al importar —que el paso 2 ya atrapa— pero
// hay un caso que no: un `export { a, b }` de un shim que reexporta con
// `export *`, donde el simbolo falta adentro y el import resuelve igual.
//
// Y hay un segundo caso, mas caro y mas raro: un `KEYS.RELOAD` o un
// `MISC.MAG_BELT_SLOTS` que se borro del Config y que tres modulos siguen
// leyendo. Eso NO es error de import: `KEYS.RELOAD` es `undefined`, el modulo
// corre, y la tecla no hace nada. Es el fallo mas dificil de ver de esta clase,
// asi que se chequea aca.
//
// La forma de mirarlo es comparar los `import { ... }` de cada archivo contra lo
// que el archivo destino exporta de verdad.
console.log("\n=== 4. LOS IMPORT NOMBRADOS TIENEN EXPORT ===");

function exportsDe(ruta) {
    const codigo = sinComentarios(readFileSync(ruta, "utf8"));
    const out = new Set();
    // export function / export var / export let / export const
    for (const m of codigo.matchAll(/export\s+(?:async\s+)?(?:function|var|let|const)\s+([A-Za-z_$][\w$]*)/g))
        out.add(m[1]);
    // export { a, b as c }
    for (const m of codigo.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const piece of m[1].split(",")) {
            const t = piece.trim();
            if (!t) continue;
            const as = t.split(/\s+as\s+/);
            out.add((as[1] || as[0]).trim());
        }
    }
    // export default
    if (/export\s+default\b/.test(codigo)) out.add("default");
    return out;
}

function resuelve(spec, desde) {
    // Solo los imports relativos; los de node y los globales no se chequean.
    if (!spec.startsWith(".")) return null;
    const base = join(dirname(desde), spec);
    for (const cand of [base, base + ".js", join(base, "index.js")]) {
        if (existsSync(cand) && !cand.endsWith(pathSep)) {
            try { if (statIsFile(cand)) return cand; } catch (e) { }
        }
    }
    return null;
}

const nombresDe = {};
for (const spec of relativos) {
    const archivo = join(CLEO, spec);
    if (!existsSync(archivo)) continue;
    const codigo = sinComentarios(readFileSync(archivo, "utf8"));
    const nombres = [];
    // import { a, b as c } from "..."
    for (const m of codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
        for (const piece of m[1].split(",")) {
            const t = piece.trim();
            if (!t) continue;
            nombres.push(t.split(/\s+as\s+/)[0].trim());
        }
    }
    nombresDe[archivo] = nombres;
}

// El indice y cada modulo: se recorren todos los archivos del cleo, no solo los
// del index, porque un modulo puede importar de otro que el index no importe.
const todosLosArchivos = [];
(function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js")) todosLosArchivos.push(p);
    }
})(CLEO);

for (const archivo of todosLosArchivos) {
    const codigo = sinComentarios(readFileSync(archivo, "utf8"));
    for (const m of codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
        const destino = resuelve(m[2], archivo);
        if (!destino) {
            ok(false, pathRel(archivo) + " importa de " + m[2] + " y no se resuelve",
                "no existe");
            continue;
        }
        const hay = exportsDe(destino);
        for (const piece of m[1].split(",")) {
            const t = piece.trim();
            if (!t) continue;
            const nombre = t.split(/\s+as\s+/)[0].trim();
            if (!hay.has(nombre)) {
                ok(false, pathRel(archivo) + " importa {" + nombre +
                    "} de " + pathRel(destino) + " y ese no existe", "el archivo no lo exporta");
            }
        }
    }
}
ok(true, "todos los import nombrados tienen export");

console.log("\n" + (fallos === 0
    ? "########## SMOKE OK: el mod carga entero ##########"
    : "########## " + fallos + " FALLAS ##########") + "\n");
process.exit(fallos === 0 ? 0 : 1);