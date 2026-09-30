#!/usr/bin/env node
// GSIS - verificador del contrato ASI <-> .dat
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).
//
// ============================================================================
// QUE HACE
// ============================================================================
// Parsea gsis_weapons.dat con LAS MISMAS REGLAS que CargarArmas() en
// limiter.cpp, y despues responde tres preguntas que solo se pueden responder
// con las dos mitades delante:
//
//   1. Que filas acepta el .asi y cuales rechaza, y por que.
//   2. Que ancestro resuelve Resolver() por tipo, y de que filas de la tabla
//      vanilla clona cada uno.
//   3. Que valores de modelo y cargador sobreescribe HookGetWeaponInfo.
//
// No importa data/weapons.js. Todavia no existe (se crea en la Fase 2), y este
// archivo tiene que poder correr hoy contra el estado real del repo. El
// cross-check contra el catalogo va en la seccion 4, marcada.
//
// ============================================================================
// CUIDADO CON DUPLICAR LA LOGICA
// ============================================================================
// Las reglas de acá son copia de las de limiter.cpp, con el numero de linea al
// lado. Si se cambia una, hay que cambiar la otra: si divergen, este script
// pasa y el juego no. Cada constante de abajo dice de donde sale.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- constantes, con su origen en limiter.cpp -------------------------------
// GSIS_TIPO_MIN / GSIS_TIPO_MAX, linea ~172
const GSIS_TIPO_MIN = 60;
const GSIS_TIPO_MAX = 79;
// PADRE_TIPO_MIN / PADRE_TIPO_MAX, linea ~175
const PADRE_TIPO_MIN = 22;
const PADRE_TIPO_MAX = 32;
// MAX_TIPOS, linea ~143. El limite duro del array g_tipos.
const MAX_TIPOS = 256;
// BASE_AWEAPON_INFO y CWEAPONINFO_SIZE, lineas 30-31
const BASE_AWEAPON_INFO = 0xC8AAB8;
const CWEAPONINFO_SIZE = 0x70;
// Las 4 filas que el juego inicializa en la tabla. Medido.
const FILAS_VANILLA = 80;

// La tabla del .dat. Se busca igual que AbrirConfig(), linea ~628: primero al
// lado del ejecutable, despues en modloader\IronSyndicate\. Con un argumento
// en la linea de comandos se usa ese, que es como se prueban los rechazos.
const CANDIDATOS = [
  join(__dirname, "..", "..", "modloader", "IronSyndicate", "gsis_weapons.dat"),
  join(__dirname, "..", "..", "gsis_weapons.dat")
];
const RUTA_ARG = process.argv[2] ? resolve(process.argv[2]) : null;

// ============================================================================
// 1. PARSEO
// ============================================================================

function parsearDat(ruta) {
  const texto = readFileSync(ruta, "latin1");
  const lineas = texto.split(/\r?\n/);
  const filas = [];
  const rechazadas = [];

  lineas.forEach((bruta, i) => {
    const ln = i + 1;
    if (bruta.startsWith("#")) return;
    if (bruta.trim() === "") return;   // el .asi salta las vacias antes del sscanf

    // sscanf con "%d %d %d %d %d %d" exige 6 enteros. Con menos, el .asi lo
    // rechaza con log (Fase 0). Con MAS, sscanf lee 6 e ignora el resto: la fila
    // se acepta con los 6 primeros. Eso no se rechaza aca, porque si el
    // verificador rechazara algo que el .asi acepta estaria mintiendo; se
    // avisa, que es lo que hace limiter.cpp.
    const campos = bruta.trim().split(/\s+/);
    const nums = [];
    for (const c of campos) {
      if (!/^[+-]?\d+$/.test(c)) break;
      nums.push(parseInt(c, 10));
    }
    if (nums.length < 6) {
      rechazadas.push({ ln, motivo: `lei ${nums.length} campos, se esperan 6`, texto: bruta.trim() });
      return;
    }
    const [tipo, padre, modelId, slot, cargador, damage] = nums;
    const extra = campos.slice(6).filter((c) => c !== "").join(" ");
    filas.push({ ln, tipo, padre, modelId, slot, cargador, damage, extra, texto: bruta.trim() });
  });

  return { filas, rechazadas };
}

// ============================================================================
// 2. VALIDACION, copia de FilaValida() en limiter.cpp
// ============================================================================

function validarFilas(filas) {
  const registradas = {};   // tipo -> fila
  const ok = [];
  const malas = [];

  for (const f of filas) {
    const motivos = [];

    if (f.tipo < GSIS_TIPO_MIN || f.tipo > GSIS_TIPO_MAX) {
      motivos.push(`tipo ${f.tipo} fuera de ${GSIS_TIPO_MIN}..${GSIS_TIPO_MAX}: el motor no lo conoce`);
    }
    if (f.padre < PADRE_TIPO_MIN || f.padre > PADRE_TIPO_MAX) {
      // El orden importa: un padre que es tipo de GSIS esta fuera de 22..32
      // tambien, asi que si se pregunta el rango primero el motivo especifico
      // se pierde detras del generico.
      if (registradas[f.padre]) {
        motivos.push(`padre ${f.padre} es un tipo de GSIS: Resolver() sube al ancestro mas alto y el clon sale del ancestro final, no de el`);
      } else {
        motivos.push(`padre ${f.padre} fuera de ${PADRE_TIPO_MIN}..${PADRE_TIPO_MAX}: GetSkillStatIndex devuelve -1 y no sube de skill`);
      }
    }
    if (f.padre === f.tipo) {
      motivos.push(`padre ${f.padre} es su propio tipo: el clon seria de si mismo`);
    }
    if (registradas[f.tipo]) {
      motivos.push(`el tipo ${f.tipo} ya estaba dado de alta`);
    }
    if (f.cargador <= 0) {
      motivos.push(`cargador ${f.cargador}: es un numero de balas, no un flag`);
    }
    if (f.modelId < 0) {
      motivos.push(`modelId ${f.modelId}: para un modelo propio va el id de arranque (346/347)`);
    }
    if (f.slot <= 0) {
      motivos.push(`slot ${f.slot}`);
    }

    if (motivos.length) { malas.push({ ...f, motivos }); continue; }

    registradas[f.tipo] = f;
    ok.push(f);
  }
  return { ok, malas, registradas };
}

// ============================================================================
// 3. LA MECANICA DEL .asi, replicada para poder mostrarla
// ============================================================================

// Resolver(), linea ~164: sube hasta el ANCESTRO MAS ALTO, no el padre directo.
function resolver(tipo, registradas) {
  if (tipo < 0 || tipo >= MAX_TIPOS) return tipo;
  if (!registradas[tipo]) return tipo;
  let t = tipo;
  for (let n = 0; n < 8 && registradas[t] && registradas[t].padre >= 0; n++) {
    t = registradas[t].padre;
  }
  return t;
}

// FilaVanilla(), linea ~184: la aritmetica de filas del juego.
function filaVanilla(tipo, skill) {
  switch (skill) {
    case 0: return ((tipo + 25) << 16) >> 16;   // el movsx se hace SIEMPRE
    case 1: return tipo;
    case 2: return ((tipo + 36) << 16) >> 16;
    case 3: return ((tipo + 47) << 16) >> 16;
    default: return 0x2F;
  }
}

// La CWeaponInfo vanilla de un padre. Los 5 campos que el .asi toca, con los
// valores MEDIDOS en gsis_WEAPONS_tabla_medida.txt, columna "sk1" (STD).
const VANILLA = {
  22: { modelId: 346, animGroup: 13, clip: 17, damage: 25, slot: 2 },
  23: { modelId: 347, animGroup: 18, clip: 17, damage: 40, slot: 2 }
};

function filaInfo(tipo, skill) {
  const idx = filaVanilla(tipo, skill);
  if (idx < 0 || idx >= FILAS_VANILLA) {
    return { fila: idx, error: `fila ${idx} fuera de la tabla de ${FILAS_VANILLA}` };
  }
  return { fila: idx, dato: VANILLA[tipo] };
}

function clonar(tipo, registradas) {
  const padre = resolver(tipo, registradas);
  const src = VANILLA[padre];
  const f = registradas[tipo];
  if (!src) {
    return { padre, error: `el padre ${padre} no es un tipo de 22..32 con datos medidos: no se puede simular el clon` };
  }
  const damage = f.damage >= 0 ? f.damage : src.damage;
  return {
    padre,
    filas: [0, 1, 2, 3].map((k) => {
      const v = filaInfo(padre, k);
      return {
        skill: ["POOR", "STD", "PRO", "SPECIAL"][k],
        fila: v.fila,
        modelId: f.modelId,
        animGroup: src.animGroup,
        slot: f.slot,
        clip: f.cargador,
        damage,
        error: v.error
      };
    })
  };
}

// Los 4 rangos de los otros parches, con el tipo YA RESUELTO. De los rangos que
// anota gsis_WEAPON_LIMITER.md §4.
const PARCHES = [
  { nombre: "CWeapon::Fire",         addr: "0x74245C", test: (t) => (t - 16) >= 0 && (t - 16) <= 27, rango: "22..43" },
  { nombre: "sonido de disparo",     addr: "0x504F8F", test: (t) => (t - 22) >= 0 && (t - 22) <= 23, rango: "22..45" },
  { nombre: "sonido de recarga",    addr: "0x5036EB", test: (t) => (t - 22) >= 0 && (t - 22) <= 12, rango: "22..34" },
  { nombre: "mira (DrawCrossHairs)", addr: "0x58E1A7", test: (t) => t >= 22 && t <= 31, rango: "22..31" },
  { nombre: "GetSkillStatIndex",    addr: "0x743CD0", test: (t) => t >= 22 && t <= 32, rango: "22..32" }
];

// ============================================================================
// SALIDA
// ============================================================================

const C = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  mal: (s) => `\x1b[31m${s}\x1b[0m`,
  av: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  neg: (s) => `\x1b[7m${s}\x1b[0m`
};

const ruta = RUTA_ARG || CANDIDATOS.find((p) => existsSync(p));
if (!ruta) {
  console.error(C.mal("no encontre gsis_weapons.dat en:"));
  for (const c of CANDIDATOS) console.error("  " + c);
  process.exit(2);
}

const { filas, rechazadas } = parsearDat(ruta);
const { ok, malas, registradas } = validarFilas(filas);

console.log(C.neg(` gsis_weapons.dat `) + C.dim(ruta));
console.log();

console.log("=== 1. PARSEO ===");
console.log(`  filas de datos: ${filas.length}   con ${ok.length} validas`);
if (rechazadas.length) {
  for (const r of rechazadas) console.log("  " + C.mal(`linea ${r.ln} RECHAZADA: ${r.motivo}`) + C.dim(`  [${r.texto}]`));
} else {
  console.log("  " + C.dim("malformadas: ninguna"));
}
if (malas.length) {
  for (const m of malas) {
    for (const motivo of m.motivos) {
      console.log("  " + C.mal(`linea ${m.ln} RECHAZADA: ${motivo}`) + C.dim(`  [${m.texto}]`));
    }
  }
} else {
  console.log("  " + C.dim("rechazadas por validacion: ninguna"));
}
// Los campos sobrantes no se rechazan (sscanf lee 6 e ignora el resto), pero se
// avisan: es el modo de fallo de un typo con un septimo numero.
const conExtra = ok.filter((f) => f.extra !== "");
for (const f of conExtra) {
  console.log("  " + C.av(`linea ${f.ln} AVISO: sobran campos ("${f.extra}"). Se toman los 6 primeros y el resto se ignora`) + C.dim(`  [${f.texto}]`));
}
console.log();

console.log("=== 2. RESOLVER Y CLON ===");
if (!ok.length) console.log("  " + C.av("no hay tipos registrados: el mod corre sin variantes de plugin"));
for (const f of ok.sort((a, b) => a.tipo - b.tipo)) {
  const c = clonar(f.tipo, registradas);
  console.log(`  tipo ${C.ok(f.tipo)}  padre ${f.padre}  ->  Resolver() = ${C.ok(c.padre)}`);
  if (c.error) { console.log("      " + C.av(c.error)); continue; }
  console.log(C.dim("      skill     fila  model  anim  slot  clip  dmg   (model/clip/slot: sobreescritos por el .dat)"));
  for (const r of c.filas) {
    const sobre = r.modelId !== VANILLA[c.padre].modelId ? "*" : " ";
    const marca = r.clip !== VANILLA[c.padre].clip ? "*" : " ";
    console.log(
      "      " + r.skill.padEnd(8) +
      String(r.fila).padStart(4) + "  " +
      String(r.modelId).padStart(5) + sobre + " " +
      String(r.animGroup).padStart(4) + " " +
      String(r.slot).padStart(4) + " " +
      String(r.clip).padStart(4) + marca + " " +
      String(r.damage).padStart(4) +
      (r.error ? "  " + C.mal(r.error) : "")
    );
  }
  const fueraDeRango = c.filas.filter((r) => r.error);
  if (fueraDeRango.length) {
    console.log("      " + C.mal("UNA O MAS FILAS CAEN FUERA DE LA TABLA"));
  }
  console.log(C.dim(`      * = valor propio de la variante (el padre daba ${VANILLA[c.padre].modelId} modelo / ${VANILLA[c.padre].clip} clip)`));
  console.log();
}

console.log("=== 3. LOS 5 PARCHES, CON EL TIPO RESUELTO ===");
if (!ok.length) console.log("  " + C.dim("nada que chequear"));
const tipos = ok.map((f) => f.tipo);
if (tipos.length) {
  console.log(C.dim("  parche                addr      rango     " + tipos.map((t) => String(t).padStart(4)).join("")));
  for (const p of PARCHES) {
    const res = tipos.map((t) => {
      const r = resolver(t, registradas);
      return p.test(r) ? C.ok("  ok") : C.mal(" FALLA");
    });
    const alguno = res.some((x) => x.includes("FALLA"));
    console.log("  " + p.nombre.padEnd(20) + p.addr + C.dim(`  ${p.rango.padEnd(8)} `) + res.map((x) => x.padStart(4)).join(" "));
    if (alguno) console.log("      " + C.mal("un tipo sale del rango de este parche: dispara muda, sin mira o sin skill"));
  }
  console.log();
}

console.log("=== 4. CROSS-CHECK CONTRA weapons.js ===");
// Aca esta el cruce definitivo entre las dos mitades del sistema. Las filas que
// weapons.js DECLARA como variantes de plugin, contra las filas que el .asi
// REALMENTE va a leer en DllMain.
//
// Es el unico lugar donde se ven las dos. El mod no puede: los scripts de CLEO
// no abren archivos, y el .dat lo lee el .asi antes de que exista un solo
// script. Por eso esta seccion necesita Node y por eso es manual: corre
// check-dat.mjs, no el juego.
const W = await import(pathToFileURL(
  join(__dirname, "..", "..", "modloader", "IronSyndicate", "cleo", "IronSyndicate", "data", "gsis_weapons.js")
).href);

const declaradas = W.expectedDatRows();
const problemasDat = W.crossCheckDat(ok);

console.log(`  weapons.js declara ${declaradas.length} variante(s) de plugin:`);
for (const d of declaradas) {
  const enElDat = ok.some(f => f.tipo === d.weaponType);
  console.log(
    "    " + (enElDat ? C.ok("ok ") : C.mal("FALTA ")) +
    " " + d.text + C.dim("   (" + d.family + (d.attachments.length ? " + " + d.attachments.join("+") : "") + ")")
  );
}
if (problemasDat.length) {
  console.log("");
  for (const p of problemasDat) console.log("  " + C.mal(p));
} else {
  console.log("  " + C.ok("las dos mitades coinciden: mismo parent, mismo modelId, mismo cargador, mismo slot"));
}

console.log("");
console.log("=== 4b. LAS DOS MITADES, VISTA DE TABLA ===");
console.log(C.dim("  weapons.js declara      .asi lee        padre  modelo  cargador   configuracion"));
for (const d of declaradas) {
  const real = ok.find(f => f.tipo === d.weaponType);
  const linea = String(real ? real.tipo : "-").padStart(6) + "            ";
  console.log("  " + d.text.replace(/-1$/, "").padEnd(24) + linea +
    String(d.parent).padStart(4) + "  " + String(d.modelId).padStart(5) +
    String(d.clip).padStart(7) + "    " + C.dim(d.family + (d.attachments.length ? " + " + d.attachments.join("+") : "")));
}

console.log("");
console.log("=== 4c. EL CATALOGO QUE weapons.js DECLARA PERO EL .DAT NO TIENE ===");
const falta = declaradas.filter(d => !ok.some(f => f.tipo === d.weaponType));
if (!falta.length) console.log("  " + C.dim("ninguna"));
else {
  for (const d of falta) {
    console.log("  " + C.mal("falta el tipo " + d.weaponType) + C.dim("  " + d.family + " + " + d.attachments.join("+")));
  }
}
console.log("");
console.log("=== 4d. LO QUE weapons.js DICE QUE HAY QUE AGREGAR AL .dat ===");
console.log(C.dim("  Accesorios que cambian lo que el motor ejecuta y todavia no tienen fila."));
console.log(C.dim("  No es un error: es la lista de trabajo del rango 60..79."));
for (const p of W.pendingPluginTypes()) {
  const libre = p.suggestedParent;
  console.log("  " + C.av("nuevo tipo") + " para " + (p.family + " + " + p.attachments[0]).padEnd(30) +
    "cargador " + String(p.clipSize).padStart(3) + "  modelId " + p.suggestedModel +
    "  parent " + libre + C.dim("   (clonar del mismo arma y cambiar solo el cargador)"));
}
const uso = W.pluginSlotUsage();
console.log("  " + C.dim("rango 60..79: " + uso.usados + " usados, " + uso.libres + " libres"));

console.log("");
console.log("=== 4e. TRABAJO PENDIENTE DE OTRAS FASES ===");
const pend = W.pendingDataWork();
console.log(C.dim("  aliases de nombre viejo que el catalogo todavia resuelve:"));
for (const a of pend.aliases) console.log("    " + a);
console.log(C.dim("  accesorios que NO se pueden montar (falta fila en el .dat):"));
if (!pend.accesoriosNoMontables.length) console.log("    ninguno");
for (const a of pend.accesoriosNoMontables) console.log("    " + a.family + " + " + a.attachment);
if (W.liveAttachmentAliases().length) {
  console.log("  " + C.av("el alias sigue vivo: se saca en la fase de saves, junto con ITEM_RENAMES"));
}

console.log("=== 5. PRECONDICIONES ===");
const flaOff = existsSync(join(__dirname, "..", "..", "fastman92limitAdjuster.asi.off"));
const flaOn = existsSync(join(__dirname, "..", "..", "fastman92limitAdjuster.asi"));
const usa = ok.map((f) => f.tipo);
const chocaFla = usa.filter((t) => t === 60 || t === 61 || t >= 70);

if (flaOn) {
  console.log("  " + C.mal("fastman92 limit adjuster esta INSTALADO. Esto rompe el rango:"));
  console.log("      60 y 61 son JETPACK_TYPE y BINOCULARS_TYPE de FLA,");
  console.log("      y 70..79 caen fuera de NumberOfWeaponTypes = 70.");
  if (chocaFla.length) console.log("      " + C.mal(`tipos en conflicto: ${chocaFla.join(", ")}`));
} else if (flaOff) {
  console.log("  " + C.ok("fastman92 limit adjuster esta apagado (.asi.off): 60..79 libre."));
  console.log("  " + C.dim("Con FLA prendido, 60 y 61 pasan a ser JETPACK/BINOCULARS y 70..79"));
  console.log("  " + C.dim("caen fuera de NumberOfWeaponTypes = 70. Es una precondicion."));
} else {
  console.log("  " + C.av("no encontre fastman92limitAdjuster.asi ni .asi.off: el estado de FLA es"));
  console.log("  " + C.av("indeterminado y el rango 60..79 no se puede afirmar."));
}
console.log();

const libre = GSIS_TIPO_MAX - GSIS_TIPO_MIN + 1 - ok.length;
console.log(`=== RESUMEN: ${ok.length} tipos de ${libre} libres (${GSIS_TIPO_MIN}..${GSIS_TIPO_MAX}) ===`);

// El codigo de salida tiene que cubrir las TRES capas: el parseo del .asi, su
// propia validacion, y el cruce contra weapons.js. Un .dat que el .asi acepta
// pero que weapons.js no declara es un arma que el mod pide y el juego no tiene,
// y eso tiene que salir distinto de cero aunque el .asi este conforme.
if (malas.length || rechazadas.length || problemasDat.length) process.exit(1);
