// GSIS - Engine
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Lo que le queda de hablar con el motor de armas de GTA, y es una capa fina:
// los offsets del ped y de su CWeapon, y los natives que leen su estado.
//
// Antes este archivo eran 677 lineas y la razon de todas: el UNICO lugar del mod
// que hablaba con el motor de armas. Todo native de arma, todo offset de CWeapon
// y de CWeaponInfo, y toda direccion cruda vivian aca —dar armas, quitar armas,
// leer la municion de un slot, escribir el reloj de la recarga, cargar los .dff
// propios—.
//
// Se borro esa mitad con el sistema de armas. Lo que sobrevive es lo que
// gsis_FireButton.js necesita para manejar el boton de disparo del JUEGO:
//
//   el ped del jugador y su puntero      playerChar, pedPointer
//   sus tres guards                     isCharDead, isCharInAnyCar,
//                                        isPlayerControlOn
//   el slot de arma                      selectedSlot, slotAddress
//   la ficha del arma en la mano         currentWeaponInfoAddress, infoFireType
//   su municion                          slotClip, slotTotal
//
// Que es lo que FireButton ya usaba antes de que existiera el sistema de armas.
// El mod no le da armas; le deja disparar las que el jugador ya tiene.
//
// ============================================================================
// POR QUE SE CONSERVA ESTE ARCHIVO Y NO SE MUEVE EL CODIGO A FIREBUTTON
// ============================================================================
// Por la regla que FireButton ya seguia: los offsets del juego no se escriben
// dos veces. FireButton leeria un +0x8 de CWeapon y este archivo leeria el mismo
// +0x8, y dos copias de un numero magico divergen sin avisar.
//
// Y el riesgo no es teorico: el layout de CWeapon lo define WeaponLimits.h y no
// cambia solo. Pero la regla no es "riesgo grande": es "el offset vive en un
// lugar y ese lugar se llama".
//
// ============================================================================
// LO QUE HABIA ACA Y YA NO ESTA
// ============================================================================
// Para que el que vuelva a necesitarlo sepa que existed y de donde salia, y no
// tenga que buscarlo en un commit:
//
//   dar y sacar armas       giveWeapon() y su fallback por native, que existia
//                           porque el API de objeto de CLEO tira con los tipos
//                           que registro un .asi: el arma entra en el slot y la
//                           validacion que viene despues revienta
//   la recarga              reloadSpec(), con sus TRES guardas —la lista de tipos
//                           sin anim, WEAPON_RELOAD (0x1000) en m_nFlags, y
//                           m_nAmmo > 1— y el plazo de GetWeaponReloadTime en
//                           0x743D70, verificado contra gta_sa.exe
//   escribir el CWeapon     setSlotClip, setSlotTotal, setSlotState,
//                           setSlotNextShotTime, unloadSlot
//   leer el tipo de un slot slotType, addressOfType
//   la ficha por (tipo, skill)  weaponInfoAddress(), y con ella clipCapacityOf
//   los modelos propios      requestModel, loadModelsNow, loadSpecialModel,
//                            hasModelLoaded, isModelAvailableByName,
//                            writeModelId. El rango 15025..15099 que los
//                            alimentaba estaba en el Config y se borro con esto
//
// Los offsets salen de WeaponLimits.h y de una sonda contra el binario, no de un
// SDK. Cada uno decia de donde venia, y esa es la parte que no se tira.
// ---------------------------------------------------------------------------

// ============================================================================
// ESTRUCTURAS DE GTA
// ============================================================================
// Los offsets salen de la cabecera de FLA (WeaponLimits.h) y de una sonda contra
// gta_sa.exe, no de un SDK. Cada uno dice de donde, porque un numero sin
// procedencia es un numero que no se puede revisar cuando algo no funciona.

// CPed::m_aWeapons: el array de 13 CWeapon, uno por slot.
export var PED_WEAPONS_OFF = 0x5A0;
export var PED_SELECTED_SLOT_OFF = 0x718;  // CPed::m_nSelectedWepSlot (uint8)
export var WEAPON_SLOT_COUNT = 13;         // sizeof(m_aWeapons) / sizeof(CWeapon)
export var WEAPON_SIZE = 28;               // sizeof(CWeapon)

// El layout de CWeapon. 28 bytes, en este orden.
export var W_TYPE = 0x0;                  // m_nWeaponType: la IDENTIDAD de la entrada
export var W_CLIP = 0x8;                  // m_nAmmoInClip: los tiros en el cargador
export var W_AMMO = 0xC;                  // m_nAmmoTotal: el total, clip incluido

// El offset de m_eWeaponFire dentro de CWeaponInfo.
//
// MEDIDO: WeaponLimits.h y verificado leyendo la ficha de un arma de vanilla.
// eWeaponFire: 1 = disparo directo, 2 = Throw, 3 = los demas.
var INFO_FIRE_TYPE = 0x1C;

// Toda lectura de memoria cruda pasa por un try/catch.
//
// Un try/catch por llamada escrito en cada consumidor son 30 try/catch identicos
// que se leen como 30 riesgos distintos; uno solo se lee como lo que es: "la
// memoria puede no estar".
function readI32(addr) {
    try { return Memory.ReadI32(addr, false); } catch (e) { return 0; }
}
function readU8(addr) {
    try { return Memory.ReadU8(addr, false); } catch (e) { return 0; }
}

// ============================================================================
// EL PED
// ============================================================================
// El char del jugador 0, o null. Todo el mod es de un jugador, y las funciones
// que reciben un char lo reciben de aca.
export function playerChar() {
    try { return new Player(0).getChar(); } catch (e) { return null; }
}

// El puntero del ped (CPed*), o 0. Lo necesitan las funciones que leen memoria
// de su CWeapon, porque la direccion se calcula desde el ped y no desde el char.
export function pedPointer(char) {
    try { return new Player(0).getPointer(char); } catch (e) { return 0; }
}

// Los tres guards de FireButton, y los tres son natives sin excepcion: el juego
// los responde siempre, y un null aca es un fallo de runtime, no un estado.
export function isCharDead(char) {
    try { return native("IS_CHAR_DEAD", char) === true; } catch (e) { return false; }
}

export function isCharInAnyCar(char) {
    try { return native("IS_CHAR_IN_ANY_CAR", char) === true; } catch (e) { return false; }
}

export function isPlayerControlOn() {
    try { return native("IS_PLAYER_CONTROL_ON", char0()) === true; } catch (e) { return false; }
}

function char0() {
    var c = playerChar();
    return c === null ? 0 : c;
}

// ============================================================================
// LOS SLOTS DEL PED
// ============================================================================
// El motor tiene UN CWeapon por slot (CPed::m_aWeapons[13]). El tipo es parte de
// la identidad de esa entrada, y por eso cambiar de configuracion era un REMOVE +
// GIVE y no un campo que se escribiera: en GTA no hay un "cambiar el tipo".

// Que slot esta seleccionado. 0 = sin arma.
export function selectedSlot(ped) {
    if (!ped) return 0;
    return readU8(ped + PED_SELECTED_SLOT_OFF) || 0;
}

// La direccion del CWeapon de un slot, o 0 si el puntero no sirve.
export function slotAddress(ped, slot) {
    if (!ped || !slot) return 0;
    return ped + PED_WEAPONS_OFF + slot * WEAPON_SIZE;
}

// Los tiros en el cargador, y el total. Son DOS numeros y no uno: el motor
// reparte el total en el clip cuando recarga, asi que en mitad de una recarga
// clip y total dicen cosas distintas y un boton que solo mire uno de los dos
// decide mal.
export function slotClip(slotAddr) { return slotAddr ? readI32(slotAddr + W_CLIP) : 0; }
export function slotTotal(slotAddr) { return slotAddr ? readI32(slotAddr + W_AMMO) : 0; }

// ============================================================================
// LA CWeaponInfo DEL ARMA QUE EL JUGADOR TIENE EN LA MANO
// ============================================================================
// La ficha del arma. Para un tipo de vanilla esta en la tabla global del juego.
//
// ESTA CONVERSION ESTABA COPIADA TRES VECES EN EL CODIGO —dos en el modulo de
// armas y una en FireButton— y las tres eran iguales. Ver el header: dos copias de
// un numero magico divergen sin avisar.
//
// GET_CURRENT_CHAR_WEAPONINFO devuelve un HANDLE, no un puntero, y no todos los
// caminos lo dan igual: en unos es number, en otros un objeto con .address, en
// otros algo que solo responde a valueOf(). Por eso estan los tres intentos.
function infoAddress(handle) {
    if (handle === null || handle === undefined) return 0;
    if (typeof handle === "number") return handle;
    if (handle.address) return handle.address;
    if (typeof handle.valueOf === "function") {
        var v = handle.valueOf();
        if (typeof v === "number") return v;
    }
    return 0;
}

export function currentWeaponInfoAddress(char) {
    try {
        return infoAddress(native("GET_CURRENT_CHAR_WEAPONINFO", char));
    } catch (e) {
        return 0;
    }
}

// m_eWeaponFire de una ficha. 1 = disparo directo. Lo usa FireButton para
// decidir si toca el boton con este arma: un arma que no dispara directo —un
// lanzallamas, un spray— no pasa por el boton, y un arma normal si.
export function infoFireType(infoAddr) {
    if (!infoAddr) return 0;
    return readI32(infoAddr + INFO_FIRE_TYPE);
}