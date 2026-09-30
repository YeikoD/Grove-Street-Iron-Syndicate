// fake-engine.mjs - El motor de GTA falso para correr el flujo real en node
//
// Que resuelve esto, y por que hace falta
// ----------------------------------------
// weapons/logic.js y weapons/reconcile.js hablan con el motor a traves de
// core/gsis_Engine.js, que usa native(), Memory.*, Player y log(). En node nada
// de eso existe, asi que importar weapons/logic.js tal cual revienta en la
// PRIMERA llamada, no en el import.
//
// Este archivo define esos globales con un motor de mentira que modela lo UNICO
// que el mod le pide al juego:
//
//   * los 13 slots del ped, con un weaponType por slot
//   * la municion por TIPO (que es como responden los natives)
//   * la capacidad por TIPO, que sale de la fila del .dat
//
// Y el resto de los globals de CLEO (log, showTextBox, native, Memory, Player,
// Pad, Game, Fs) como no-ops que contestan algo plausible.
//
// QUE PRUEBA Y QUE NO
// -------------------
// Prueba la LOGICA DEL MOD: que la configuracion que pide la UI termine siendo el
// weaponType correcto, que no queden dos armas en el slot, que un tambor de 75 se
// de con 75 y no con 30, y que el redondeo al .
//
// NO prueba GTA. Que p.giveWeapon() con REMOVE antes sea necesario o no, y si el
// motor de verdad reemplaza el slot o deja dos armas, es cosa del juego. Este
// archivo puede modelar "el juego reemplaza el slot" y no puede probarlo. Los
// tres puntos sin prueba runtime siguen sin prueba, y este archivo no los cambia.
//
// Lo que SI hace es fijar la INTERFAZ que el mod le pide al motor: si manana
// Engine.js pide una capacidad por otro camino, este archivo no compila y se
// nota en el test, no en el juego.

const REGISTRO = {};

// ---------------------------------------------------------------------------
// EL MOTOR
// ---------------------------------------------------------------------------
export function resetEngine(capacidades) {
    REGISTRO.slots = {};       // slot -> weaponType
    REGISTRO.ammo = {};        // weaponType -> balas
    REGISTRO.cap = {};         // weaponType -> capacidad
    REGISTRO.char = 1;
    REGISTRO.slotSeleccionado = 0;
    REGISTRO.log = [];
    REGISTRO.dar = [];         // [tipo, ammo] de cada GIVE, en orden
    REGISTRO.sacar = [];       // tipos de cada REMOVE, en orden
    for (let s = 0; s < 13; s++) _borrarSlot(REGISTRO.char, s);
    MEM.set(REGISTRO.char + PED_SELECTED_SLOT_OFF, 0);
    for (const k in capacidades) REGISTRO.cap[k] = capacidades[k];
}

export function elMotor() { return REGISTRO; }

// Las capacidades del .dat, tal como las declara gsis_weapons.dat. Se hardcodean
// aca A PROPOSITO y no se leen del archivo: si el test leyera el .dat, cambiar el
// .dat cambiaria el test, y un test que se mueve con el dato que verifica no
// verifica nada. La fuente de verdad de estas capacidades es el .dat, y el
// cross-check de ese archivo contra weapons.js es check-dat.mjs, que corre aparte.
export const CAPACIDADES = {
    60: 8,    // colt45 + suppressor
    61: 15,   // colt45 + suppressor + cargador de 15
    62: 15,   // colt45 + cargador de 15
    63: 8,    // colt45
    64: 75,   // ak47 + tambor
    65: 40,   // m4 + lancer
    66: 60,   // m4 + tambor
    30: 30    // ak47 base (vanilla)
};

// ---------------------------------------------------------------------------
// LO QUE EL MOTOR NO SABE, Y SE LE DICE
// ---------------------------------------------------------------------------
// El motor de GTA no sabe de familias ni de accesorios: el es un `giveWeapon(tipo)`
// y punto. Para simular "el juego pone el arma en el slot que le corresponde" este
// archivo necesita el mapa tipo -> familia -> slot, y ese mapa se lo da el test.
//
// Y sale de los DATOS DEL MOD, no de aca. La version anterior de este archivo
// tenia `{ colt45: 2, ak47: 1, m4: 1 }` escrito a mano, y el slot del AK estaba
// mal (el .dat dice 5). Un numero copiado en el test que verifica el dato es un
// numero que puede quedar viejo sin que nadie lo note: el test sigue verde
// mirando un mundo que ya no existe.
let _famPorTipo = {};
let _slotPorFam = {};

export function saberFamilias(famPorTipo, slotPorFamilia) {
    _famPorTipo = famPorTipo || {};
    _slotPorFam = slotPorFamilia || {};
}

function _familiaDe(tipo) { return _famPorTipo[tipo] || null; }

// ---------------------------------------------------------------------------
// LOS GLOBALS DE CLEO
// ---------------------------------------------------------------------------

// El ped. Un numero: lo unico que el mod hace con el es pasarlo a un native y
// sacar direcciones, y aca las direcciones las genera el motor de mentira.
globalThis.Player = function () {
    this.getChar = function () { return REGISTRO.char; };
    this.giveWeapon = function (tipo, ammo) {
        REGISTRO.dar.push([tipo, ammo]);
        _ponerEnElSlotDe(tipo, ammo);
        return true;
    };
};
globalThis.Player.prototype.getChar = function () { return REGISTRO.char; };
globalThis.Player.prototype.giveWeapon = function (tipo, ammo) {
    REGISTRO.dar.push([tipo, ammo]);
    _ponerEnElSlotDe(tipo, ammo);
    return true;
};

// Donde cae un tipo. El motor real lo decide el juego segun el slot del weapon.dat;
// aca se usa la tabla que weapons/state.js ya calculo, que es la misma que usa el
// mod para decidir a que slot pertenece el arma.
function _ponerEnElSlotDe(tipo, ammo) {
    const fam = _familiaDe(tipo);
    const slot = fam ? _slotPorFam[fam] : 0;
    REGISTRO.slots[slot] = tipo;
    REGISTRO.ammo[tipo] = ammo;
    // El motor real reparte el total en el clip al dar el arma. Sin esto, el
    // modulo veria un arma con el total puesto y el clip en 0.
    _escribirSlot(REGISTRO.char, slot, tipo, ammo, ammo);
}

globalThis.log = function (msg) {
    REGISTRO.log.push(String(msg));
};
globalThis.showTextBox = function (msg) {
    REGISTRO.log.push("[textbox] " + msg);
};
globalThis.Hud = { DisplayRadar: function () {} };
globalThis.Pad = { IsKeyJustPressed: function () { return false; } };
globalThis.Game = {
    GetCurrentSaveSlot: function () { return 0; },
    GetPlayerName: function () { return "test"; }
};
globalThis.Fs = { DoesFileExist: function () { return false; } };

// Los natives que el mod llama de verdad. Cada uno con la respuesta que hace que
// el flujo siga, y con un `throw` en los que NO estan implementados: asi, si
// Engine.js empieza a pedir algo nuevo, el test falla con "este native no esta
// simulado" en vez de devolver un undefined que se propaga hasta el log.
const NATIVES = {
    GIVE_WEAPON_TO_CHAR: (c, tipo, ammo) => {
        REGISTRO.dar.push([tipo, ammo]);
        _ponerEnElSlotDe(tipo, ammo);
        return true;
    },
    REMOVE_WEAPON_FROM_CHAR: (c, tipo) => {
        REGISTRO.sacar.push(tipo);
        for (const s in REGISTRO.slots) {
            if (REGISTRO.slots[s] === tipo) {
                delete REGISTRO.slots[s];
                _borrarSlot(REGISTRO.char, Number(s));
                return true;
            }
        }
        return true;
    },
    HAS_CHAR_GOT_WEAPON: (c, tipo) => {
        for (const s in REGISTRO.slots) if (REGISTRO.slots[s] === tipo) return true;
        return false;
    },
    GET_AMMO_IN_CHAR_WEAPON: (c, tipo) => REGISTRO.ammo[tipo] || 0,
    SET_CHAR_AMMO: (c, tipo, ammo) => {
        REGISTRO.ammo[tipo] = ammo;
        // El total del TIPO, y el de CUALQUIER slot que lo tenga. SET_CHAR_AMMO
        // responde por tipo, no por el arma en la mano.
        for (const s in REGISTRO.slots) {
            if (REGISTRO.slots[s] === tipo) {
                _escribirSlot(REGISTRO.char, Number(s),
                    MEM.get(slotAddr(REGISTRO.char, Number(s)) + W_CLIP) || 0, ammo);
            }
        }
        return true;
    },
    SET_CURRENT_CHAR_WEAPON: (c, tipo) => {
        const fam = _familiaDe(tipo);
        const slot = fam ? _slotPorFam[fam] : 0;
        REGISTRO.slotSeleccionado = slot;
        MEM.set(REGISTRO.char + PED_SELECTED_SLOT_OFF, slot);
        return true;
    },
    GET_CURRENT_CHAR_WEAPON: () => {
        return REGISTRO.slots[REGISTRO.slotSeleccionado] || 0;
    },
    GET_CURRENT_CHAR_WEAPONINFO: () => ({ __info: true }),
    GET_WEAPONINFO_SLOT: () => MEM.get(REGISTRO.char + PED_SELECTED_SLOT_OFF) || 0,
    GET_WEAPONINFO_TOTAL_CLIP: (info) => {
        // La capacidad de la ficha. El .asi la escribe en m_nAmmoClip de las
        // cuatro filas, asi que las cuatro dan el mismo numero; aca se responde
        // por el tipo que se esta preguntando, que es lo que hace el native real
        // cuando la fila es de un tipo de plugin.
        const t = _tipoPreguntado;
        return REGISTRO.cap[t] || 0;
    },
    GET_WEAPONINFO: (tipo) => ({ __info: true, __tipo: tipo }),
    // La MISMA direccion que usa la memoria de arriba. Antes devolvia 0x1000 y
    // la memoria se escribia en REGISTRO.char, asi que el modulo leia un ped
    // vacio: `_giveInternal` respondia "el tipo no quedo en el ped" con el arma
    // visiblemente en el slot, y el motivo del error no tenia nada que ver con la
    // causa. Un motor falso con dos direcciones para el mismo ped es peor que
    // uno sin memoria.
    GET_PED_POINTER: () => REGISTRO.char,
    IS_CHAR_DEAD: () => false,
    IS_PLAYER_CONTROL_ON: () => true,
    IS_CHAR_IN_ANY_CAR: () => false,
    REQUEST_MODEL: () => true,
    LOAD_ALL_MODELS_NOW: () => true,
    IS_MODEL_AVAILABLE_BY_NAME: () => true,
    HAS_MODEL_LOADED: () => true
};

let _tipoPreguntado = 0;
globalThis.native = function (nombre) {
    const fn = NATIVES[nombre];
    if (!fn) {
        throw new Error("native no simulado: " + nombre +
            " (el mod pidio algo que el motor falso no conoce; hay que agregarlo)");
    }
    // GET_WEAPONINFO_TOTAL_CLIP responde por el tipo del GET_WEAPONINFO anterior.
    // Se resuelve guardando el tipo en la ultima ficha entregada.
    if (nombre === "GET_WEAPONINFO") {
        const tipo = arguments[1];
        _tipoPreguntado = tipo;
        return { __info: true, __tipo: tipo };
    }
    // arguments CORTA por el nombre, y esto no es cosmetico: con
    // `fn.apply(null, arguments)` el handler recibe (nombre, ...losRestos) y TODOS
    // los argumentos van corridos uno. El sintoma es que hasWeapon contestaba
    // false con el arma visiblemente en el ped, y que el motor "no aceptaba" tipos
    // que si aceptaba: un error que parece del codigo y no lo es.
    const args = [];
    for (let i = 1; i < arguments.length; i++) args.push(arguments[i]);
    return fn.apply(null, args);
};

// Memory.* — el mod leeoffsets de CWeapon con estos. El motor falso no tiene
// memoria, y weapons/reconcile.js lo lee con try/catch y sigue. Se devuelven
// ceros, que es lo que daria una memoria sin inicializar.X
// ---------------------------------------------------------------------------
// ESTO ES LO QUE FALTABA LA PRIMERA VEZ, Y POR QUE EL TEST NO PODIA PASAR.
//
// weapons/reconcile.js y weapons/logic.js NO leen los slots por una API: los leen
// con Memory.ReadI32 sobre los offsets de CWeapon, que exported Engine. El objeto
// `slots` de arriba no lo ve nadie. Un motor falso que solo tenga ese objeto
// parece funcionar y en realidad no: `addressOfType` devuelve 0 siempre, el
// `_giveInternal` responde "el tipo no quedo en el ped" y todas las)
//aciones fallan con un motivo que no es el del codigo.
//
// Asi que los offsets se simulan de verdad. Salen de los MISMOS numeros que
// declara core/gsis_Engine.js, y estan a mano porque el motor de GTA los tiene en
// un binario y no hay de donde sacarlos: si Engine.js cambia un offset, este
// archivo tiene que cambiar con el, y por eso estan aca y no escondidos en una
// constante sin nombre.
const PED_WEAPONS_OFF = 0x5A0;
const PED_SELECTED_SLOT_OFF = 0x718;
const WEAPON_SIZE = 28;
const W_TYPE = 0x0;
const W_STATE = 0x4;
const W_CLIP = 0x8;
const W_AMMO = 0xC;
const WEAPON_SLOT_COUNT = 13;

const MEM = new Map();   // direccion -> entero

function slotAddr(ped, slot) { return ped + PED_WEAPONS_OFF + slot * WEAPON_SIZE; }

function _escribirSlot(ped, slot, tipo, clip, total) {
    const b = slotAddr(ped, slot);
    MEM.set(b + W_TYPE, tipo || 0);
    MEM.set(b + W_STATE, 0);
    MEM.set(b + W_CLIP, clip || 0);
    MEM.set(b + W_AMMO, total || 0);
}

function _tipoDelSlot(ped, slot) {
    return MEM.get(slotAddr(ped, slot) + W_TYPE) || 0;
}

function _borrarSlot(ped, slot) {
    const b = slotAddr(ped, slot);
    MEM.set(b + W_TYPE, 0);
    MEM.set(b + W_STATE, 0);
    MEM.set(b + W_CLIP, 0);
    MEM.set(b + W_AMMO, 0);
}

globalThis.Memory = {
    ReadI32: (addr) => MEM.get(addr) || 0,
    ReadU8: (addr) => MEM.get(addr) || 0,
    ReadU16: (addr) => MEM.get(addr) || 0,
    WriteI32: (addr, v) => { MEM.set(addr, v); return true; },
    WriteU8: (addr, v) => { MEM.set(addr, v); return true; },
    CallMethodReturn: () => 0
};

// Un volcado de la memoria del ped, para que el test pueda MIRAR los slots sin
// tener que saber los offsets desde afuera.
export function verPed() {
    const out = {};
    for (let s = 0; s < WEAPON_SLOT_COUNT; s++) {
        const t = _tipoDelSlot(REGISTRO.char, s);
        if (t) {
            out[s] = {
                tipo: t,
                clip: MEM.get(slotAddr(REGISTRO.char, s) + W_CLIP) || 0,
                total: MEM.get(slotAddr(REGISTRO.char, s) + W_AMMO) || 0
            };
        }
    }
    return out;
}
