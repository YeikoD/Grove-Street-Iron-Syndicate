// GSIS - Engine
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).
//
// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El UNICO lugar del mod que habla con el motor de armas de GTA.
//
// Todo native de arma, todo offset de CWeapon y de CWeaponInfo, y toda
// direccion cruda vive aca. Ningun modulo mas los toca. Ballistic y FireButton
// importan de este archivo; este archivo no importa de nadie.
//
// ============================================================================
// POR QUE ESTA SEPARADO
// ============================================================================
// Antes, Ballistic.js tenia 30 llamadas a native() y a Memory.*, con los offsets
// de CWeapon declarados arriba. FireButton.js tenia SUS PROPIAS copias de cinco
// de esos offsets (0x5A0, 0x718, 28, 0x8, 0xC), y el truco de convertir un
// handle de CWeaponInfo en una direccion entera estaba escrito por TRES: dos en
// Ballistic y uno en FireButton. Dos copias de un numero magico divergen sin
// avisar, y el sintoma de que diverge es un arma que no dispara o un click seco
// que no suena.
//
// ============================================================================
// LA REGLA DE ESTE ARCHIVO
// ============================================================================
// Expone INTENCION, no estructura. Nadie fuera de aca escribe
// `Memory.WriteI32(addr + 0x8, ...)`; se pide "escribi el clip de este arma".
//
// La unica excepcion, marcada abajo, es la escritura de m_nAmmoClip: existe
// porque el modulo de armas todavia la usa, y esa escritura es exactamente lo
// que el modelo de 3 capas va a eliminar. Se borra en la fase 3, y por eso esta
// sola en una funcion con su nombre diciendo que es temporal.
//
// ============================================================================
// QUE NO SABE ESTE ARCHIVO
// ============================================================================
// No sabe que es una familia, un accesorio o una variante. No sabe de inventario,
// ni de save, ni de precios. No decide nada: solo traduce "dame el arma" en el
// native que hace falta, y "decime la capacidad" en la lectura que la da.
// ============================================================================

// ============================================================================
// ESTRUCTURAS DE GTA
// ============================================================================
// Los offsets salen de la cabecera de FLA (WeaponLimits.h) y de la sonda, no de
// un SDK. Cada uno dice de donde, porque un numero sin procedencia es un numero
// que no se puede revisar cuando algo no funciona.
//
// ESTOS SE EXPORTAN, aunque ningun modulo los use todavia, y esa es la idea: son
// la tabla del layout del juego, y una tabla que no se puede leer desde afuera no
// es una tabla centralizada, es un detalle escondido. Lo que se centralizo no es
// "el codigo que usa el offset", es el numero. El codigo que lo usa son las
// funciones de abajo, que no lo exponen.

export var PED_WEAPONS_OFF = 0x5A0;        // CPed::m_aWeapons, CWeapon[13]
export var PED_SELECTED_SLOT_OFF = 0x718;  // CPed::m_nSelectedWepSlot (uint8)
export var WEAPON_SLOT_COUNT = 13;         // sizeof(m_aWeapons) / sizeof(CWeapon)
export var WEAPON_SIZE = 28;               // sizeof(CWeapon)

// CWeapon. El +0 es el tipo: los 4 bytes de abajo son el weaponId, y se leen
// directo de memoria en vez de con un native porque el reconciliador recorre los
// 13 slots en cada frame y 13 natives por frame se notan.
export var W_TYPE = 0x0;
export var W_STATE = 0x4;                  // CWeapon::m_nState (2 = RELOADING)
export var W_CLIP = 0x8;                   // CWeapon::m_nAmmoInClip
export var W_AMMO = 0xC;                   // CWeapon::m_nAmmoTotal
export var W_TIME = 0x10;                  // CWeapon::m_nTimeForNextShot

// CWeaponInfo. Solo se tocan dos campos, y los dos estan verificados. Los demas
// offsets de la ficha NO estan: el mod no lee ni escribe m_nFlags ni m_nAmmoClip,
// porque la capacidad la escribio el .asi al registrar el tipo y el mod la lee por
// el native, no por el offset. Ver clipCapacityOf.
export var INFO_FIRE_TYPE = 0x0;           // m_eWeaponFire (1 = INSTANT_HIT)
export var INFO_MODEL = 0x0C;              // m_modelId (WeaponLimits.h:365)

// Globales sueltas.
export var TIMER_ADDR = 0xB7CB84;          // CTimer::m_snTimeInMilliseconds
// CWeaponInfo::GetWeaponReloadTime (thiscall, uint32) vivia en 0x743D70 y se
// llamaba por Memory.CallMethodReturn. SE FUE con la anim de recarga: era la
// duracion de una anim que ya no hay. La direccion queda escrita aca porque es la
// unica forma de volver a encontrarla, y porque si vuelve a hacer falta va a ser
// con un try/catch alrededor, no como un export sin consumidor.
//   0x743D70 = CWeaponInfo::GetWeaponReloadTime(this) -> uint32

// Estados de CWeapon. Queda solo READY.
//
// Los otros dos se van con la anim de recarga. OUT_OF_AMMO (3) lo dejaba un mod de
// arma a cero, y es el estado en el que CWeapon::Fire hace return false: el arma
// tiene balas y no dispara. El codigo nuevo escribe READY explicitamente cada
// vez que da un arma justamente para no heredar ese estado.
export var WEAPONSTATE_READY = 0;

// Las 4 skills de un arma. weapon.dat repite la misma fila en las cuatro.
// SKILL_COUNT si se usa afuera: quien recorre "las cuatro filas de este tipo"
// tiene que escribir el mismo numero que usa el motor, y si lo escribe por su
// cuenta el dia que weapon.dat cambie el conteo quedan tres filas o cinco.
export var SKILL_COUNT = 4;
var SKILL_STD = 1;                  // la que representa al arma "normal"

// ============================================================================
// HELPERS DE BAJO NIVEL
// ============================================================================

// Direccion entera de un CWeaponInfo*.
//
// GET_WEAPONINFO y GET_CURRENT_CHAR_WEAPONINFO devuelven un HANDLE, no un
// puntero, y no todos los caminos lo dan igual: en unos es number, en otros un
// objeto con .address, en otros algo que solo responde a valueOf(). Por eso
// estan los tres intentos.
//
// Esta funcion estaba copiada tres veces en el codigo (Ballistic:987,
// Ballistic:1202 y FireButton:54). Las tres eran iguales, y las tres iban a
  // dejar de estarlo en cuanto una se tocara. Aca esta una sola vez.
function infoAddress(handle) {
    if (!handle) return 0;
    if (typeof handle === "number") return handle;
    if (typeof handle.address === "number") return handle.address;
    var n = +handle;
    if (n) return n;
    if (typeof handle.valueOf === "function") {
        var v = handle.valueOf();
        if (typeof v === "number" && v) return v;
    }
    return 0;
}

// Toda lectura de memoria cruda pasa por aca. Un try/catch por llamada escrito en
// cada consumidor son 30 try/catch identicos que se leen como 30 riesgos
// distintos; uno solo se lee como lo que es: "la memoria puede no estar".
function readI32(addr) { return Memory.ReadI32(addr, false); }
function readU8(addr) { return Memory.ReadU8(addr, false); }
function writeI32(addr, valor) { Memory.WriteI32(addr, valor, false); }

// Un native que tira no puede tumbar un modulo. Se registra UNA vez por nombre
// para que el log diga "este native no esta" sin llenar 3000 lineas por frame.
var _nativeFalla = {};
function nativeSeguro(nombre, fn, porDefecto) {
    try {
        return fn();
    } catch (e) {
        if (!_nativeFalla[nombre]) {
            _nativeFalla[nombre] = true;
            log("[Engine] el native " + nombre + " no respondio: " + (e && e.message ? e.message : e));
        }
        return porDefecto;
    }
}

// Para los casos donde el comportamiento correcto es "no hacer nada" y no hace
// falta que quede registrado: un native opcional que falla es parte del juego.
function nativeOpcional(nombre, fn, porDefecto) {
    try {
        return fn();
    } catch (e) {
        return porDefecto;
    }
}

// Que natives se pidieron para diagnostico y no respondieron.
export function failedNatives() {
    return _nativeFalla;
}

// ============================================================================
// EL PED
// ============================================================================

// El char del jugador 0, o null. Todo el mod es de un jugador: no hay un segundo
// jugador con armas, y las funciones que reciben un char lo reciben de aca.
export function playerChar() {
    try {
        return new Player(0).getChar();
    } catch (e) {
        return null;
    }
}

// Puntero del ped (CPed*), o 0. Las operaciones que escriben en CWeapon lo
// necesitan para calcular direcciones y no reciben un char en todos los caminos.
export function pedPointer(char) {
    var c = (char !== undefined && char !== null) ? char : playerChar();
    if (c === null || c === undefined) return 0;
    return nativeSeguro("GET_PED_POINTER", function () { return native("GET_PED_POINTER", c); }, 0) || 0;
}

export function isCharDead(char) {
    return !!nativeSeguro("IS_CHAR_DEAD", function () { return native("IS_CHAR_DEAD", char); }, false);
}

export function isPlayerControlOn() {
    return !!nativeSeguro("IS_PLAYER_CONTROL_ON", function () {
        return native("IS_PLAYER_CONTROL_ON", new Player(0));
    }, false);
}

export function isCharInAnyCar(char) {
    return !!nativeSeguro("IS_CHAR_IN_ANY_CAR", function () { return native("IS_CHAR_IN_ANY_CAR", char); }, false);
}

// El reloj del juego, en milisegundos.
//
// SE QUITA. Lo usaba la anim de recarga, para medir el deadline de su watchdog.
// Sin anim no hay deadline. Si alguna vez hace falta, es
// `Memory.ReadI32(0xB7CB84, false)` y la direccion esta dos lineas mas abajo.

// ============================================================================
// LOS SLOTS DEL PED
// ============================================================================
// El motor tiene UN CWeapon por slot (CPed::m_aWeapons[13]) y el tipo es parte de
// la identidad de esa entrada. Por eso cambiar de configuracion es un REMOVE +
// GIVE y no un campo que se escriba: no hay un "cambiar el tipo" en el motor.

// La direccion del CWeapon de un slot, o 0 si el puntero no sirve.
export function slotAddress(ped, slot) {
    if (!ped || !slot) return 0;
    return ped + PED_WEAPONS_OFF + slot * WEAPON_SIZE;
}

// Que slot esta seleccionado. 0 = sin arma.
export function selectedSlot(ped) {
    if (!ped) return 0;
    return readU8(ped + PED_SELECTED_SLOT_OFF) || 0;
}

// El weaponId que hay en un slot, leido de memoria. 0 = slot vacio.
export function slotType(slotAddr) {
    if (!slotAddr) return 0;
    return readI32(slotAddr + W_TYPE);
}

// En que slot esta ESTE weaponType, o 0.
//
// Recorre desde el slot 1 porque el 0 es melee y el mod no lo maneja: un arma de
// melee no es un item de inventario con cargador.
//
// No exportada: lo que los llamadores necesitan es la DIRECCION del arma, que es
// addressOfType. La diferencia entre el slot y la direccion la necesita solo
// quien lee el slot, y por ahora nadie.
function findSlotOfType(ped, weaponType) {
    if (!ped || !weaponType) return 0;
    for (var i = 1; i < WEAPON_SLOT_COUNT; i++) {
        if (readI32(slotAddress(ped, i) + W_TYPE) === weaponType) return i;
    }
    return 0;
}

// La direccion del CWeapon que tiene este weaponType, o 0.
export function addressOfType(ped, weaponType) {
    var slot = findSlotOfType(ped, weaponType);
    return slot ? slotAddress(ped, slot) : 0;
}

// --- campos de un CWeapon en memoria ---
//
// SE QUITAN: `slotState`, `setSlotNextShotTime`, `fillMagazine` y `unload`.
//
//   slotState y setSlotNextShotTime eran de la anim de recarga, que ya no existe.
//   Los leia y escribia el watchdog para cerrar a mano una recarga que el motor
//   no cerraba. Sin anim no hay nada que cerrar.
//
//   fillMagazine y unload eran "montar un cargador encima del arma" y "sacarlo",
//   que es exactamente el modelo viejo. Un cargador es un accesorio: montarlo
//   cambia de variante, y eso es un tipo nuevo, no un campo de esta fila.
//
// Lo que QUEDA del CWeapon es lo unico que el motor necesita que se este bien:
// el tipo, el clip, el total y el estado en READY.

export function slotClip(slotAddr) { return slotAddr ? readI32(slotAddr + W_CLIP) : 0; }
export function slotTotal(slotAddr) { return slotAddr ? readI32(slotAddr + W_AMMO) : 0; }

export function setSlotClip(slotAddr, n) { if (slotAddr) writeI32(slotAddr + W_CLIP, n); }
export function setSlotTotal(slotAddr, n) { if (slotAddr) writeI32(slotAddr + W_AMMO, n); }
export function setSlotState(slotAddr, n) { if (slotAddr) writeI32(slotAddr + W_STATE, n); }

// El arma en la mano del jugador, leida con los natives del juego.
// Devuelve { char, slot, type, clip, ammo } o null si un native no responde.
export function readCurrentWeapon() {
    try {
        var c = new Player(0).getChar();
        var weaponInfo = native("GET_CURRENT_CHAR_WEAPONINFO", c);
        if (!weaponInfo) return null;
        var slot = native("GET_WEAPONINFO_SLOT", weaponInfo);
        if (slot === null || slot === undefined) return null;
        var clip = native("GET_WEAPONINFO_TOTAL_CLIP", weaponInfo);
        var weaponType = native("GET_CURRENT_CHAR_WEAPON", c);
        var ammo = native("GET_AMMO_IN_CHAR_WEAPON", c, weaponType);
        return { char: c, slot: slot, type: weaponType, clip: clip, ammo: ammo };
    } catch (e) {
        return null;
    }
}

// ============================================================================
// DAR Y SACAR ARMAS
// ============================================================================

// Que natives usaba el mod antes de este archivo, y si el API de objeto esta.
var _givePorNativo = false;

function _darPorNativo(char, weaponType, ammo) {
    native("GIVE_WEAPON_TO_CHAR", char, weaponType, ammo);
}

// ---------------------------------------------------------------------------
// EL ARMA LLEGO O NO, POR MEMORIA
// ---------------------------------------------------------------------------
// La unica pregunta que este archivo se hace sobre un fallo: despues de un
// throw, esta el arma en el ped o no.
//
// Se contesta por MEMORIA y no por el native HAS_CHAR_GOT_WEAPON, y no es una
// preferencia: la memoria es la fuente que ya se demostro que funciona en este
// runtime. El reconciliador lee los slots con readI32 y ve el arma.
//
// Devuelve true si hay un slot con ESE tipo.
function _llegoElArma(char, weaponType) {
    var ped = pedPointer(char);
    if (!ped || !weaponType) return false;
    return addressOfType(ped, weaponType) !== 0;
}

// Dar un arma al ped.
//
// Se usa el API de objeto, p.giveWeapon(weaponId, ammo), que es el camino que
//CLEO Redux expone y el que corresponde. Detras hay un native 0x01B2 por si el
// API de objeto no estuviera: no es una red por si acaso, es que una regresion
// aqui es un mod que no arma a nadie y no hay forma de que se note sin jugar. Si
// el camino de objeto falla una vez, se avisa una vez y se usa el native de
// siempre, que es lo que hacia el codigo antes de este archivo.
//
// ---------------------------------------------------------------------------
// POR QUE UN THROW NO ES "NO LLEGO" — Y POR QUE ESTO ERA UN BUG GRAVE
// ---------------------------------------------------------------------------
// p.giveWeapon() DA el arma y DESPUES tira, cuando el weaponType es uno que
// registro el .asi en la memoria del juego. La capa JS de CLEO no conoce esos
// tipos: el .asi los metio en la tabla del juego, no en la del script. Asi que la
// llamada se ejecuta, el arma entra al slot, y la validacion que hace despues no
// encuentra el id y tira.
//
// Y aca estaba el bug entero. Del log de una sesion real:
//
//   06:24:27  el slot 2 tiene el tipo 22
//   06:24:48  p.giveWeapon() tira  ->  este catch
//   06:24:50  el slot 2 tiene el tipo 63     <-- EL ARMA SI LLEGO
//
// El mod no lo podia saber. Y `_darPorNativo` tampoco servia: en este runtime el
// nombre "GIVE_WEAPON_TO_CHAR" no esta registrado, asi que el fallback tambien
// tiraba y caia en `return false`.
//
// El efecto en cadena: equipWeapon tomaba eso por un armado fallido y revirtia
// con storeWeapon, el registro nunca se escribia, y al cerrar el menu el
// reconciliador encontraba la Colt en el ped sin entrada y la adoptava
// (removeWeapon + storeWeapon). Un item mas al inventario, y el ciclo entero
// repetido en cada intento. El modulo se desarmaba SOLO y duplicaba el arma cada
// vez que el jugador tocaba equipar.
//
// El arreglo es una VERIFICACION, no un cambio de camino: despues del throw se
// pregunta por memoria si el arma llego, y si llego se devuelve true. La pregunta
// es la misma que hace el reconciliador, con los mismos offsets, asi que si el
// reconciliador ve el arma, esta funcion tambien la ve.
//
// Y por que la memoria y no un native: porque en este runtime el native miente
// y la memoria no. No es que la memoria sea mejor en abstracto; es que es la unica
// de las dos que se demonstro funcionando aca.
//
// OJO con el parametro `char`: el API de objeto va sobre el JUGADOR, no sobre el
// char. Este mod es de un jugador, asi que el char que llega siempre es el del
// jugador 0. Si algun dia hay un segundo jugador con armas, esta funcion tiene
// que recibir el Player y no el char, y no el GameObject que seCerro ni se
// abrio. Esta nota esta aca para que el que lo cambie lo sepa antes de cambiarlo.
export function giveWeapon(char, weaponType, ammo) {
    if (_givePorNativo) {
        try {
            _darPorNativo(char, weaponType, ammo);
            return true;
        } catch (e0) {
            // El fallback tambien puede tirar, y tambien puede haber dado el arma
            // antes de tirar. Mismo criterio que el camino de objeto.
            if (_llegoElArma(char, weaponType)) return true;
            return false;
        }
    }
    try {
        new Player(0).giveWeapon(weaponType, ammo);
        return true;
    } catch (e) {
        if (!_nativeFalla["giveWeapon-objeto"]) {
            _nativeFalla["giveWeapon-objeto"] = true;
            _givePorNativo = true;
            log("[Engine] WARN: p.giveWeapon() no respondio, uso GIVE_WEAPON_TO_CHAR (0x01B2). " +
                "Es el mismo camino que usaba el mod antes de Engine.js.");
        }
        // PRIMERO se pregunta si el arma llego. Es el caso real, y el que estaba
        // desarmando el modulo: entrar por aca con `false` a ciegas hace que
        // equipWeapon revierta un armado que si funciono.
        if (_llegoElArma(char, weaponType)) {
            log("[Engine] p.giveWeapon() tiro pero el tipo " + weaponType +
                " SI quedo en el ped; se toma como dado. Es lo esperable con un " +
                "tipo de plugin: la capa JS no lo conoce, la llamada se ejecuta " +
                "igual y lo que falla es la validacion posterior.");
            return true;
        }
        try {
            _darPorNativo(char, weaponType, ammo);
            return true;
        } catch (e2) {
            return false;
        }
    }
}

// Si el mod esta usando el native en vez del API de objeto. Para diagnostico.
export function giveUsesNative() { return _givePorNativo; }

export function removeWeapon(char, weaponType) {
    return nativeSeguro("REMOVE_WEAPON_FROM_CHAR", function () {
        native("REMOVE_WEAPON_FROM_CHAR", char, weaponType);
        return true;
    }, false);
}

export function hasWeapon(char, weaponType) {
    return !!nativeSeguro("HAS_CHAR_GOT_WEAPON", function () {
        return native("HAS_CHAR_GOT_WEAPON", char, weaponType);
    }, false);
}

export function setCurrentWeapon(char, weaponType) {
    return nativeSeguro("SET_CURRENT_CHAR_WEAPON", function () {
        native("SET_CURRENT_CHAR_WEAPON", char, weaponType);
        return true;
    }, false);
}

// Municion TOTAL del arma de ese tipo. 017B no es el clip: el motor reparte el
// total en el clip cuando recarga. 041A es la que responde por TIPO, no por la
// arma en la mano, asi que anda para cualquier slot que el jugador lleve.
export function getAmmo(char, weaponType) {
    return nativeSeguro("GET_AMMO_IN_CHAR_WEAPON", function () {
        return native("GET_AMMO_IN_CHAR_WEAPON", char, weaponType);
    }, 0) || 0;
}

export function setAmmo(char, weaponType, ammo) {
    return nativeSeguro("SET_CHAR_AMMO", function () {
        native("SET_CHAR_AMMO", char, weaponType, ammo);
        return true;
    }, false);
}

// ============================================================================
// LA CWeaponInfo
// ============================================================================
// La ficha del arma. Para un tipo de vanilla esta en la tabla global del juego; para
// uno que dio de alta un plugin esta en la memoria del .asi. Eso NO es una
// distincion que este archivo pueda hacer: el no sabe que tipo es de quien. Lo
// que si hace es no escribir nunca donde no debe, y para eso esta el unico
// escritor de abajo, con su nombre diciendo que es temporal.

// La direccion de la CWeaponInfo de un (tipo, skill). null si el native no
// responde o no devuelve nada.
function weaponInfoAddress(weaponType, skill) {
    try {
        return infoAddress(native("GET_WEAPONINFO", weaponType, skill));
    } catch (e) {
        return null;
    }
}

export function currentWeaponInfoAddress(char) {
    try {
        return infoAddress(native("GET_CURRENT_CHAR_WEAPONINFO", char));
    } catch (e) {
        return 0;
    }
}

// m_eWeaponFire de una ficha. 1 = disparo directo. Lo usa FireButton para
// decide si toca el boton con este arma.
export function infoFireType(infoAddr) {
    if (!infoAddr) return 0;
    return readI32(infoAddr + INFO_FIRE_TYPE);
}

// -----------------------------------------------------------------------
// LA CAPACIDAD
// -----------------------------------------------------------------------
// SE LEE, NO SE ESCRIBE. Y esta es LA capacidad del sistema.
//
// Donde existe una capacidad en el sistema es en la fila del .dat, que escribe el
// .asi cuando registra el tipo. Aca no hay una segunda: la capacidad se LEE con
// GET_WEAPONINFO_TOTAL_CLIP y se usa para acotar la municion que se le pasa al
// give. Nunca se escribe.
//
// Y se lee por el native, no por el offset de m_nAmmoClip: la fila de un tipo de
// plugin la escribio el .asi, no el juego, asi que el layout es el que el plugin
// uso. GET_WEAPONINFO_TOTAL_CLIP es el unico que responde en los dos casos.
//
// ---------------------------------------------------------------------------
// LO QUE HABIA ACA Y YA NO ESTA
// ---------------------------------------------------------------------------
//   TEMPORAL_writeClipCapacity  escribia m_nAmmoClip en las cuatro filas de
//     skill de la tabla GLOBAL. Eso cambia la capacidad DEL TIPO ENTERO para todos
//     los que lo usen, NPCs incluidos: llevar el tambor le ponia 75 balas a cada
//     AK del juego. Con eso, el reconciliador recortaba un tambor a 30 en el
//     frame siguiente, porque el segundo lugar del que se leia se llenaba con el
//     valor por defecto de la familia. Son las dos mitetas de un mismo error.
//
//   clipCapacityForPed  le preguntaba al PED en que skill tenia el arma, para
//     leer la capacidad. Y GET_CHAR_WEAPON_SKILL no tiene dato para un tipo que
//     dio de alta un .asi, porque el engine no lo conoce: contestaba 0 sin decir
//     nada. Por eso existia tambien la version con la fila STD fija
//     (clipCapacityForPlugin), y por eso `_capacityByType` decidia entre las dos
//     con una cadena de `if`. Las dos contestaban lo mismo. Queda una.
//
//   infoFlags  servia para el flag WEAPON_RELOAD, que era la guarda de la anim de
//     recarga. Sin anim, no hay flag que mirar.
//
//   reloadTimeMs  era GetWeaponReloadTime, que solo se usaba para saber cuanto
//    ibar la anim.
//
// Las dos primeras se fueron con la anim de recarga; la tercera con las dos
// fuentes de capacidad. Nada de eso se reemplaza: son el segundo modelo.

// La capacidad de la fila STD de ese tipo. Que sea la STD y no "la del ped" es
// lo que hace que un tipo de plugin tambien responda: weapon.dat repite el mismo
// m_nAmmoClip en las cuatro filas de un arma con skills, asi que las cuatro dan el
// mismo numero, y la capacidad de un cargador es una propiedad del ARMA y no
// depende de en que punta de la escala este el jugador.
export function clipCapacityOf(weaponType) {
    try {
        var info = native("GET_WEAPONINFO", weaponType, SKILL_STD);
        if (!info) return 0;
        return native("GET_WEAPONINFO_TOTAL_CLIP", info) || 0;
    } catch (e) {
        return 0;
    }
}

// Escribir m_modelId en las cuatro filas de skill. NO es la capacidad: es como el
// mod dice que un tipo dibuja un modelo propio, y existe solo para el camino de
// modelos propios, que hoy esta apagado (WEAPON_MODELS_ENABLED = false).
//
// m_modelId2 (0x10) NO se toca: en weapon.dat es -1 para la pistola y el juego lo
// usa para un segundo modelo en armas de melee combinado. Dejarlo como lo clono
// la tabla es lo que corresponde.
export function writeModelId(weaponType, modelId) {
    if (!modelId) return false;
    var n = 0;
    for (var skill = 0; skill < SKILL_COUNT; skill++) {
        var addr = weaponInfoAddress(weaponType, skill);
        if (!addr) continue;
        try {
            writeI32(addr + INFO_MODEL, modelId);
            n++;
        } catch (e) { /* sin memoria: el modelo no se escribe */ }
    }
    return n > 0;
}

// ============================================================================
// MODELOS
// ============================================================================
// El modelo de un arma es un puntero, no una etiqueta. Por eso los modelos propios
// van en un rango de id reservado, separado del de los personajes: un id
// compartido hace que un arma se dibuje como un ped.

export function requestModel(modelId) {
    return nativeSeguro("REQUEST_MODEL", function () {
        native("REQUEST_MODEL", modelId);
        return true;
    }, false);
}

export function loadModelsNow() {
    return nativeSeguro("LOAD_ALL_MODELS_NOW", function () {
        native("LOAD_ALL_MODELS_NOW");
        return true;
    }, false);
}

// Si el juego puede resolver este nombre de archivo. Con los .dff de ModLoader
// hay que probar varios formatos de nombre (ver gsis_WEAPONS.md), asi que esto se
// consulta por cada candidato.
export function isModelAvailableByName(nombre) {
    return !!nativeSeguro("IS_MODEL_AVAILABLE_BY_NAME", function () {
        return native("IS_MODEL_AVAILABLE_BY_NAME", nombre);
    }, false);
}

// Cargar un .dff con su .txd. Devuelve el modelId que le quedo, que lo ASIGNA el
// juego: no hay forma de escribir ese numero en una tabla estatica.
export function loadSpecialModel(dff, txd) {
    try {
        return native("LOAD_SPECIAL_MODEL", dff, txd) || 0;
    } catch (e) {
        return 0;
    }
}

// Si un modelo esta en memoria. Para uno que registro un plugin, esta es la
// UNICA pregunta util: no se pide, se verifica.
export function hasModelLoaded(modelId) {
    return !!nativeSeguro("HAS_MODEL_LOADED", function () {
        return native("HAS_MODEL_LOADED", modelId);
    }, false);
}
