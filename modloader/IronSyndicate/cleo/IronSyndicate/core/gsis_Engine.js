// GSIS - Engine
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El UNICO lugar del mod que habla con el motor de armas de GTA: los offsets del
// ped y de su CWeapon, y los natives que leen o escriben su estado.
//
// Antes este archivo eran 677 lineas. Cuando el sistema de armas se borro se
// quedo con una capa fina —lo que FireButton necesita para manejar el boton de
// disparo del JUEGO— y el resto quedo anotado en el pie de este header, en
// "LO QUE HABIA ACA Y YA NO ESTA".
//
// Volvio parte de eso con el paso 1 del sistema de armas nuevo, que es una sola
// regla: el arma no tiene reserva. Y esa regla se escribe en memoria cruda sobre
// el CWeapon del ped, asi que el pie de este archivo vuelve a ser la capa
// completa. Lo que se agrega ahora es lo minimo que la regla necesita y nada mas:
//
//   el ped del jugador y su puntero      playerChar, pedPointer
//   sus tres guards                     isCharDead, isCharInAnyCar,
//                                        isPlayerControlOn
//   el slot de arma                      selectedSlot, slotAddress, slotType,
//                                        addressOfType
//   el CWeapon de un slot                slotClip, slotTotal, slotState,
//                                        setSlotClip, setSlotTotal, setSlotState
//   dar, sacar y elegir                   giveWeapon, removeWeapon,
//                                        setCurrentWeapon
//   la capacidad que dice el motor        clipCapacityOf
//   la ficha del arma en la mano         currentWeaponInfoAddress, infoFireType
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
// LO QUE SE FUE Y NO VOLVIO
// ============================================================================
// Para que el que vuelva a necesitarlo sepa que existia y de donde salia, y no
// tenga que buscarlo en un commit.
//
// CORREGIDO el 04/10/2026: esta lista declaraba AUSENTES cinco cosas que estan en
// este mismo archivo, y las declaraba ausentes dos veces —una aca y otra en el
// bloque de arriba, que las daba por DEVUELTAS—. Con las dos listas en el mismo
// header, la pregunta "¿existe reloadSpec?" tenia dos respuestas y las dos
// embrace:
//
//   la recarga              reloadSpec() y reloadTimeOf() SIGUEN ACA, lineas
//                           558 y 575. Con sus TRES guardas —la lista de tipos
//                           sin anim, WEAPON_RELOAD (0x1000) en m_nFlags, y el
//                           clip > 1— y el plazo de GetWeaponReloadTime en
//                           0x743D70, verificado contra gta_sa.exe
//   el reloj del motor      timerNow() SIGUE ACA, linea 314, con
//                           CTimer::m_snTimeInMilliseconds en 0xB7CB84
//   el final de la recarga  setSlotNextShotTime() SIGUE ACA, linea 307
//
// Y lo que si se fue, y que sigue sin volver:
//
//   unloadSlot              no quedo nadie que lo quitara: el modulo no descarga
//                           slots, el motor lo hace con su propia recarga
//   la ficha por (tipo, skill)  weaponInfoAddress(), que solo haria falta si
//                           alguien leyera flags de anim de una skill que no sea
//                           STD. Hoy se pide la STD y solo, via infoDeTipo()
//   los modelos propios      requestModel, loadModelsNow, loadSpecialModel,
//                            hasModelLoaded, isModelAvailableByName,
//                            writeModelId. No los necesita el mod: los modelos
//                            propios de arma los carga el .asi, con
//                            AddWeaponModel + RequestSpecialModel. El rango
//                            15025..15099 que los alimentaba estaba en el Config
//                            y se borro con esto
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
export var W_STATE = 0x4;                 // m_nState: 2 = RELOADING, 3 = OUT_OF_AMMO
export var W_CLIP = 0x8;                  // m_nAmmoInClip: los tiros en el cargador
export var W_AMMO = 0xC;                  // m_nAmmoTotal: el total, clip incluido
export var W_TIME = 0x10;                 // m_nTimeForNextShot: el reloj de la recarga

// CWeaponInfo. De los offsets que el mod lee, m_nFlags es el flag WEAPON_RELOAD y
// m_nAmmo es el TAMANO DEL CARGADOR.
//
// m_nFlags en 0x18 es el unico de los dos con la procedencia DURA, y no por
// opinion: los bytes de GetWeaponReloadTime en 0x743D70 son `mov eax,[ecx+18h]`,
// o sea que el propio motor lee m_nFlags en 0x18 sobre ESTA ficha. Ver RELOAD_TIME_FN.
//
// m_nAmmo NO es lo que el mod le pone al arma: es la capacidad que escribio el
// .asi. Por eso la capacidad se LEE (clipCapacityOf) y no se escribe.
export var INFO_FLAGS = 0x18;             // m_nFlags

// m_nAmmo: el tamaño del cargador, en 0x20.
//
// ESTE OFFSET NO ESTA VERIFICADO, y por eso NO es la fuente de la capacidad. La
// fuente es clipCapacityOf(), que va por el native GET_WEAPONINFO_TOTAL_CLIP
// sobre la MISMA ficha. Ver "LA DUALIDAD DE LA CAPACIDAD" mas abajo, que explica
// por que las dos conviven sin que sea un error, y por que esta no puede pasar a
// ser la autoridad.
export var INFO_AMMO = 0x20;              // m_nAmmo: el tamaño del cargador

// WEAPON_RELOAD de m_nFlags. Es la forma de saber si el motor tiene anim de
// recarga para un arma: el grupo de animacion puede existir y no tener el anim.
export var WEAPON_FLAG_RELOAD = 0x1000;

// Globales sueltas.
export var TIMER_ADDR = 0xB7CB84;          // CTimer::m_snTimeInMilliseconds

// CWeaponInfo::GetWeaponReloadTime (thiscall, uint32) -> 0x743D70.
//
// VERIFICADO contra gta_sa.exe y contra el .cs de "Reload Mod" que lo usa:
// los bytes en 0x743D70 son `mov eax,[ecx+18h]` (lee m_nFlags) y devuelve una
// DURACION en ms segun si el arma recarga rapido o lento.
var RELOAD_TIME_FN = 0x743D70;

// Armas sin anim de recarga, por weaponType de vanilla.
//
// VERIFICADO contra el enum eWeaponType de WeaponLimits.h:
//   37 WEAPONTYPE_FTHROWER     41 WEAPONTYPE_SPRAYCAN
//   38 WEAPONTYPE_MINIGUN      42 WEAPONTYPE_EXTINGUISHER
//                              43 WEAPONTYPE_CAMERA
//
// Es la MISMA lista que usa "Reload Mod", que es el mod del que sale la
// secuencia de recarga. Y es una red de seguridad, no la guarda de verdad: la
// guarda de verdad es WEAPON_RELOAD, que el motor mismo usa.
export var NO_RELOAD_ANIM = [37, 38, 41, 42, 43];

// W_CLIP Y W_AMMO SON DOS NUMEROS, Y LA DIFERENCIA ENTRE LOS DOS ES LA RESERVA.
//
// El total INCLUYE el clip: con clip 7 y total 12 hay 5 balas de reserva, y al
// recargar el motor pasa esas 5 al cargador. Por eso "sin reserva" se escribe
// como una sola igualdad y no como un numero:
//
//     sin reserva  ==  m_nAmmoTotal == m_nAmmoInClip
//
// Y por eso el que las escribe tiene que saber que el motor tambien las escribe:
// un pickup de municion suma al total, el save de GTA restaura el par entero, y
// un native de mision puede volver a dar balas. Ver modules/weapons/ammo.js.
//
// ESTADOS DE CWEAPON
// El +0x4 importa por una sola razon: durante una recarga el motor reparte el
// total en el clip, y hay un tramo en el que los dos numeros dicen cosas
// distintas a proposito. Quien normaliza la municion tiene que saltarse ese
// estado, y no se puede saber que esta recargando sin leer este campo.
export var WEAPONSTATE_READY = 0;
export var WEAPONSTATE_RELOADING = 2;
// OUT_OF_AMMO (3) tambien bloquea CWeapon::Fire, que hace return false. No lo
// limpia este archivo: es estado del arma, y limpiarlo de otra cosa que no sea
// un disparo es escribir un campo del motor que el mod todavia no administra.
export var WEAPONSTATE_OUT_OF_AMMO = 3;

// La skill que representa al arma "normal". weapon.dat repite el mismo cargador
// en las cuatro filas de un arma con skills, asi que las cuatro dan el mismo
// numero. Se escribe el numero y no el enum para que quien recorra las cuatro
// filas no tenga que saber el nombre.
var SKILL_STD = 1;

// m_eWeaponFire dentro de CWeaponInfo. 0x00.
//
// MEDIDO: el struct de CWeaponInfo que usa el .asi (limiter.cpp, y el volcado
// del probe) tiene m_eFireType en 0x00 y m_animGroup en 0x1C.
//
// ESTE OFFSET ESTUVO MAL Y POR ESO EL MARTILLO SECO NO SONABA NUNCA: leia
// 0x1C, o sea el grupo de animacion, y una pistola tiene 13 o 18 ahi. Como
// ningun arma de disparo directo tiene m_eFireType == 1 salvo por casualidad,
// la comparacion de FireButton daba falsa siempre y el modulo se volvia antes de
// llegar al chequeo de municion. Sin sonido y sin log, porque el return temprano
// no loguea nada.
//
// El .cs de "Mantener armas sin balas" lo lee en info + 0 y compara con 1.
//
// CERRADO CONTRA EL LOG el 04/10/2026, y era la duda que quedaba: si 0x00 fuese
// m_nWeaponType, el valor seria el numero del arma y la comparacion con 1 daria
// falsa en todas, o sea el mismo fallo invisible del 0x1C. NO es asi, y el log lo
// descarta en una linea. gsis_limiter.txt, en las filas que el .asi imprime al
// clonar cada tipo:
//
//   [63] FUENTE skill 1 <- fila vanilla 22 (STD) = fireType 1 | ...
//   [60] FUENTE skill 1 <- fila vanilla 23 (STD) = fireType 1 | ...
//   [60] FUENTE skill 3 <- fila vanilla 70 (SPECIAL) = fireType 0 | ...
//
// Si 0x00 fuera el tipo, esas filas dirian 22, 23 y 70. Dicen 1, 1 y 0, que es
// justo lo que distinguisha un arma de disparo directo de una que no lo tiene. Y
// el 70 (LAUNCHER, sin anim de disparo) en 0 es el contraejemplo limpio: un
// m_nWeaponType nunca seria 0.
//
// La misma linea confirma ademas el 0x1C, porque 23 tiene animGroup 18 y 22
// animGroup 13, que son los grupos de animacion conocidos de esa pistola y esa
// silenciada.
var INFO_FIRE_TYPE = 0x00;

// Toda lectura de memoria cruda pasa por un try/catch, y TODA escritura tambien.
//
// Un try/catch por llamada escrito en cada consumidor son 30 try/catch identicos
// que se leen como 30 riesgos distintos; uno solo se lee como lo que es: "la
// memoria puede no estar". Y el segundo dice lo mismo de las escrituras: una
// escritura a una direccion invalida revienta el modulo entero, y el modulo que
// se cae es el quenormalizea la municion del arma del jugador.
//
// Las escrituras devuelven si se pudieron hacer. No es informacion que hoy
//ograma: es para que un dia haya un consumidor que necesite saberlo sin tener
// que cambiar la firma.
function readI32(addr) {
    try { return Memory.ReadI32(addr, false); } catch (e) { return 0; }
}
function readU8(addr) {
    try { return Memory.ReadU8(addr, false); } catch (e) { return 0; }
}
function readI16(addr) {
    try { return Memory.ReadI16(addr, false); } catch (e) { return 0; }
}
function writeI32(addr, valor) {
    try { Memory.WriteI32(addr, valor, false); return true; } catch (e) { return false; }
}

// ============================================================================
// EL PED
// ============================================================================
// El char del jugador 0, o null. Todo el mod es de un jugador, y las funciones
// que reciben un char lo reciben de aca.
export function playerChar() {
    try { return new Player(0).getChar(); } catch (e) { return null; }
}

// El puntero del ped (CPed*), o 0.
//
// Va por el NATIVE GET_PED_POINTER y no por `new Player(0).getPointer(char)`,
// que es lo que estaba y es lo que hay que no volver a escribir: getPointer() no
// recibe argumentos y devuelve el puntero del objeto sobre el que se lo llama —
// o sea, el del Player, no el de CJ—. Con esa llamada esta funcion devolvia 0 en
// una sesion real, y todo lo que depende del puntero —el guard de la municion y
// el give del arma de pruebas— se iba sin log y sin correccion.
//
// Que fallara sin logs es lo que lo hizo pasar: un `if (!ped) return;` aguas
// arriba convierte "el runtime no me dio el puntero" en "el modulo no hace
// nada". Ver modules/weapons/gsis_Weapons.js.
export function pedPointer(char) {
    if (!char) return 0;
    try {
        var p = native("GET_PED_POINTER", char);
        if (p) return p;
    } catch (e) { /* el native no esta: se prueba el camino de objeto */ }
    try {
        // El char como objeto. Un char de CLEO puede ser un GameObject o un
        // handle numerico, y un numero no tiene getPointer: por eso el typeof.
        if (typeof char === "object" && typeof char.getPointer === "function") {
            return char.getPointer();
        }
    } catch (e) { return 0; }
    return 0;
}

// Los tres guards de FireButton, y los tres son natives sin excepcion: el juego
// los responde siempre, y un null aca es un fallo de runtime, no un estado.
export function isCharDead(char) {
    try { return native("IS_CHAR_DEAD", char) === true; } catch (e) { return false; }
}

export function isCharInAnyCar(char) {
    try { return native("IS_CHAR_IN_ANY_CAR", char) === true; } catch (e) { return false; }
}

// El jugador 0 tiene el control del personaje.
//
// OJO CON EL ARGUMENTO, que no es el que parece: IS_PLAYER_CONTROL_ON (0x01F3)
// toma el INDICE del jugador, no un char. Pasarle el char del jugador 0 hace que
// el motor lea un numero de jugador que no existe y conteste false, siempre,
// sin tirar — o sea, un false que parece un estado del juego y es un argumento
// equivocado. Por eso va el 0 literal, y no char0().
//
// Se nota en que FireButton no lo notaba: usaba el false como "no hay control"
// y seguia al chequeo de municion, que es justo lo que tiene que hacer con el
// boton en el juego. Un guard que devuelve false de mas no rompe nada visible.
export function isPlayerControlOn() {
    try { return native("IS_PLAYER_CONTROL_ON", 0) === true; } catch (e) { return false; }
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
// decide mal. Y son los dos que define la reserva: ver el bloque de offsets.
export function slotClip(slotAddr) { return slotAddr ? readI32(slotAddr + W_CLIP) : 0; }
export function slotTotal(slotAddr) { return slotAddr ? readI32(slotAddr + W_AMMO) : 0; }

// El estado del arma del slot. Sale del MISMO CWeapon que el clip, y no de un
// native: los tres campos se leen de la misma direccion y por la misma razon.
export function slotState(slotAddr) { return slotAddr ? readI32(slotAddr + W_STATE) : -1; }

// El tipo que hay en un slot, leido del +0. 0 = slot vacio.
//
// Por memoria y no con HAS_CHAR_GOT_WEAPON: en el runtime donde se desarrollo, el
// native miente y la memoria no. Y se lee directo del +0 porque el consumidor
// recorre los 13 slots por frame y son 13 direcciones, no 13 natives.
export function slotType(slotAddr) { return slotAddr ? readI32(slotAddr + W_TYPE) : 0; }

// Los tres escritores de un CWeapon.
//
// Son los unicos del mod que escriben en un arma del ped, y estan juntos para
// que quede a la vista que escribir en un CWeapon es lo que hace este archivo.
// El estado se escribe por separado del clip y del total porque los tres cosas
// NO se cambian siempre juntas: la recarga cambia el estado y nada mas.
export function setSlotClip(slotAddr, n) { return slotAddr ? writeI32(slotAddr + W_CLIP, n) : false; }
export function setSlotTotal(slotAddr, n) { return slotAddr ? writeI32(slotAddr + W_AMMO, n) : false; }
export function setSlotState(slotAddr, n) { return slotAddr ? writeI32(slotAddr + W_STATE, n) : false; }

// El reloj del arma: cuando puede volver a disparar. La recarga lo escribe con
// "ahora + el plazo que dice la ficha", y eso es lo que hace que el motor mueva
// las balas despues.
export function setSlotNextShotTime(slotAddr, ms) {
    return slotAddr ? writeI32(slotAddr + W_TIME, ms) : false;
}

// El reloj del JUEGO, en milisegundos. Es un instante absoluto, no un contador del
// mod: con un contador propio el plazo de la recarga venceria antes o despues y la
// recarga se cortaria o se quedaria colgada.
export function timerNow() {
    return readI32(TIMER_ADDR);
}

// En que slot esta ESTE weaponType, o 0. Recorre desde el slot 1 porque el 0 es
// melee y el mod no lo maneja.
//
// No exportada: lo que los llamadores necesitan es la DIRECCION del arma, que es
// addressOfType. El numero de slot no tiene consumidor y por eso no sale.
function findSlotOfType(ped, weaponType) {
    if (!ped || !weaponType) return 0;
    for (var i = 1; i < WEAPON_SLOT_COUNT; i++) {
        if (readI32(slotAddress(ped, i) + W_TYPE) === weaponType) return i;
    }
    return 0;
}

// La direccion del CWeapon que tiene este weaponType, o 0.
//
// Es la forma de preguntar "el arma llego al ped?" que el mod usa: por memoria,
// nunca por native. Un give que tira puede haber dado el arma igual, y un
// HAS_CHAR_GOT_WEAPON que dice false no sirve para deshacer un give que si
// funciono.
export function addressOfType(ped, weaponType) {
    var slot = findSlotOfType(ped, weaponType);
    return slot ? slotAddress(ped, slot) : 0;
}

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

// ============================================================================
// DAR Y SACAR ARMAS
// ============================================================================
// Esto volvio en el paso 1 del sistema de armas nuevo, y vuelve UNico y pequeno:
// dar un arma, sacar un arma y decir cual es la que esta en la mano.
//
// NO hay ni una linea mas que la que hace falta. Lo que no vuelve todavia es lo
// grande del sistema viejo: el registro de equipadas, los accesorios, la
// recarga, la animacion de recarga, los modelos propios. Todo eso son pasos
// siguientes, y no se escribe antes de necesitarlo.

// El arma llego al ped? Se contesta por MEMORIA y no por
// HAS_CHAR_GOT_WEAPON: el native miente en este runtime, y la memoria no.
function _llegoElArma(char, weaponType) {
    var ped = pedPointer(char);
    if (!ped || !weaponType) return false;
    return addressOfType(ped, weaponType) !== 0;
}

// Que camino de give se esta usando, para avisar una sola vez si hay que cambiar.
var _givePorNativo = false;

// Dar un arma al ped. Devuelve true si el tipo quedo en el ped, y NO "si el
// native no tiro".
//
// Que no sean lo mismo es todo el motivo de que esta funcion exista:
//
//   p.giveWeapon() DA el arma y DESPUES tira, cuando el weaponType es uno que
//   registro el .asi en la memoria del juego. La capa JS de CLEO no conoce esos
//   tipos —el .asi los metio en la tabla del juego, no en la del script—, asi
//   que la llamada se ejecuta, el arma entra al slot, y lo que falla es la
//   validacion que viene despues.
//
//   De un log de una sesion real:
//     06:24:48  p.giveWeapon() tira  ->  este catch
//     06:24:50  el slot 2 tiene el tipo 63     <-- EL ARMA SI LLEGO
//
// Volver false a ciegas en ese caso es lo que desarmaba el modulo entero: el
// que daba tomaba eso por un armado fallido y deshacia un give que si habia
// funcionado. Por eso el catch NO devuelve false: primero pregunta por memoria.
//
// `ammo` es lo que se le pasa al camino que toque. NO es la fuente de verdad del
// clip ni del total: quien da el arma escribe los dos campos por memoria
// DESPUES, con setSlotClip y setSlotTotal, y esa es la unica via que el mod
// controla de verdad. El parametro existe porque el camino de objeto lo pide.
//
// OJO con el char: el API de objeto va sobre el JUGADOR, no sobre el char. Este
// mod es de un jugador, asi que el char que llega es siempre el del jugador 0.
// Si algun dia hay un segundo jugador con armas, esta funcion tiene que recibir
// el Player y no el char.
export function giveWeapon(char, weaponType, ammo) {
    if (_givePorNativo) {
        try {
            native("GIVE_WEAPON_TO_CHAR", char, weaponType, ammo);
            return true;
        } catch (e) {
            // El fallback tambien puede tirar, y tambien puede haber dado el arma
            // antes de tirar. Mismo criterio que el camino de objeto.
            return _llegoElArma(char, weaponType);
        }
    }

    try {
        new Player(0).giveWeapon(weaponType, ammo);
        return true;
    } catch (e) {
        if (_llegoElArma(char, weaponType)) {
            log("[Engine] p.giveWeapon() tiro pero el tipo " + weaponType +
                " SI quedo en el ped; se toma como dado. Es lo esperable con un " +
                "tipo de plugin: la capa JS no lo conoce, la llamada se ejecuta " +
                "igual y lo que falla es la validacion posterior.");
            return true;
        }
        // No llego: se cambia de camino PARA SIEMPRE, avisando una sola vez. No
        // hace falta seguir probando el camino de objeto en cada give si ya se
        // sabe que no responde.
        _givePorNativo = true;
        log("[Engine] WARN: p.giveWeapon() no respondio, uso GIVE_WEAPON_TO_CHAR (0x01B2).");
        try {
            native("GIVE_WEAPON_TO_CHAR", char, weaponType, ammo);
            return true;
        } catch (e2) {
            return _llegoElArma(char, weaponType);
        }
    }
}

// Sacar un arma del ped.
//
// SIEMPRE REMOVE antes de GIVE, incluso cuando el tipo no cambia: el GIVE del
// mismo tipo NO reemplaza, SUMA, y con un arma de 8 balas y un give de 8 el
// total pasaba a 16. Quitar y dar es lo unico que es "dar este arma con esta
// configuracion" sin letra chica.
export function removeWeapon(char, weaponType) {
    if (!weaponType) return false;
    try {
        native("REMOVE_WEAPON_FROM_CHAR", char, weaponType);
        return true;
    } catch (e) {
        return false;
    }
}

// Dejar este tipo en la mano. Sin esto el arma queda en el ped y el jugador
// sigue con la que tenia: el give es del slot, no de la mano.
export function setCurrentWeapon(char, weaponType) {
    if (!weaponType) return false;
    try {
        native("SET_CURRENT_CHAR_WEAPON", char, weaponType);
        return true;
    } catch (e) {
        return false;
    }
}

// La capacidad de la fila STD de ese tipo: cuantos tiros LE ENTRAN al cargador.
//
// Que sea una LECTURA y no una escritura es una regla del acuerdo con el .asi:
// la capacidad de un tipo la escribio el .asi al registrarlo en
// gsis_weapons.dat, y el mod no escribe m_nAmmoClip nunca. Antes habia dos
// fuentes —el catalogo y el motor— y la reconciliacion recortaba un tambor de 75
// a 30 en el frame siguiente. Ahora hay una y es la del motor.
//
// Que responda tambien para un tipo de plugin es justamente lo que lo hace
// util: GET_WEAPONINFO pasa por el hook del .asi, que devuelve su fila propia.
//
// 0 significa "no se pudo preguntar", y NO "no tiene cargador": la distincion
// importa porque quien la lee tiene que avisar en un caso y seguir en el otro.
// Ver modules/weapons/gsis_Weapons.js.
//
// ============================================================================
// LA DUALIDAD DE LA CAPACIDAD, Y CUAL DE LAS DOS ES LA REAL
// ============================================================================
// Hay dos caminos para preguntarle a una ficha el tamaño del cargador, y durante
// un tiempo se leyeron como una contradiccion. NO lo son: uno es la autoridad y el
// otro es una guarda. Decidido el 04/10/2026, con el sistema funcionando.
//
//   LA AUTORIDAD   clipCapacityOf() — native GET_WEAPONINFO_TOTAL_CLIP sobre la
//                  ficha. Es la que usa el resto del mod: el guard de
//                  modules/weapons/ammo.js, el recorte de la recarga
//                  (n = Math.min(capNuevo, mag.ammo)) y el `cap` de las filas
//                  de la UI. El valor que sale de aca es el que ve el jugador.
//
//   LA GUARDA      reloadSpec() — readI16(info + INFO_AMMO). No devuelve un
//                  numero a nadie: solo contesta `> 1`, o sea "esta ficha tiene
//                  un cargador de mas de un tiro". Es el TERCER chequeo del .cs de
//                  referencia, y por eso esta copiado tal cual.
//
// POR QUE NO ES UNA SEGUNDA FUENTE DE VERDAD
// ---------------------------------------------------------------------------
// Las dos reciben EXACTAMENTE la misma ficha: las dos piden GET_WEAPONINFO con la
// skill STD, y las dos pasan por infoAddress(). No son dosObjetos ni dos vistas
// del mismo dato: son el mismo objeto, ibo por dos verbs distintos. Por eso no
// pueden divergir sobre una capacidad distinta, y por eso el invariante de
// modules/weapons/ammo.js y la guarda de la recarga nunca se contradicen.
//
// Y ADEMAS la guarda no PODRIA ser la autoridad, por dos razones que la hacen
// insustituible como lo que es:
//
//   1. Solo devuelve un booleano, no el numero. El `cap` de la UI, el recorte
//      `Math.min(capNuevo, mag.ammo)` y el "N/cap" de la fila necesitan el numero,
//      y none lo sacaria de un `<= 1`.
//   2. INFO_AMMO = 0x20 no esta verificado. La procedencia que se le conoce es
//      "WeaponLimits.h", que describe la ficha de vanilla, y la ficha que
//      contesta GET_WEAPONINFO con un tipo 60..79 es la fila propia que escribio el
//      .asi. Que el campo caiga en el mismo sitio en las dos cosas es lo que hace
//      que la guarda sea correcta, y no esta medido.
//
// O sea: la guarda es correcta por copia de una referencia que se medicionara una
// vez, y la autoridad es correcta porque es la que usa todo lo demas y sus valores
// son los que el HUD del juego y la mochila dan.
//
// ASI QUE NO SE TOCA, Y ESTO SE ESCRIBE PARA QUE NO SE TOQUE
// ---------------------------------------------------------------------------
// La tentacion de borrar la linea 566 —"que sobran dos fuentes"— es lo que NO hay
// que hacer: dejaria una recarga sin el tercer chequeo del .cs, y ese chequeo
// tiene un motivo documentado (una arma de un tiro no tiene nada que recargar).
// Lo que hay que hacer es no promotionarla a autoridad, y es lo que dice el
// comentario de INFO_AMMO.
//
// Y si algun dia INFO_AMMO se verifica contra el volcado que el .asi ya escribe en
// el log, la guarda se puede quedar como esta. Si se verifica que esta MAL, la
// linea 566 se borra y no se toca clipCapacityOf: el orden de esos dos cambios es
// La DIRECCION de la ficha de un tipo (CWeaponInfo*), o 0.
//
// Pasa por infoAddress() y no por el HANDLE crudo que devuelve el native, porque
// el native no siempre da un numero: en unos es number, en otros un objeto con
// .address, en otros algo que solo responde a valueOf(). Y lo que necesita
// _memory_ es un numero: un handle, sumarle INFO_FLAGS da "[object Object]24", que
// es una direccion invalida, y el 0 que vuelve de una lectura fallida se parece
// muchisimo a "el arma no tiene anim de recarga".
//
// Y es la MISMA ficha que recibe clipCapacityOf(): las dos piden GET_WEAPONINFO
// con la STD y las dos pasan por aca. Ver "LA DUALIDAD DE LA CAPACIDAD".
function infoDeTipo(weaponType) {
    if (!weaponType) return 0;
    try {
        return infoAddress(native("GET_WEAPONINFO", weaponType, SKILL_STD));
    } catch (e) {
        return 0;
    }
}

// La capacidad que ve el resto del mod. LA AUTORIDAD. Ver arriba.
export function clipCapacityOf(weaponType) {
    if (!weaponType) return 0;
    try {
        var info = native("GET_WEAPONINFO", weaponType, SKILL_STD);
        if (!info) return 0;
        return native("GET_WEAPONINFO_TOTAL_CLIP", info) || 0;
    } catch (e) {
        return 0;
    }
}

// ============================================================================
// LA RECARGA: LO QUE HACE FALTA PARA ANIMARLA
// ============================================================================
// Devuelve { info, ms } si a este tipo se lo puede recargar, o null.
//
// LAS TRES GUARDAS, en orden de coste. Las tres existen porque el motor NO puede
// con una sola, y es un error de los tres tipos:
//
//   1. la lista de tipos sin anim    una red de seguridad, del .cs de referencia.
//   2. WEAPON_RELOAD en m_nFlags     la guarda de verdad. El grupo de animacion
//                                    puede existir sin el anim de recarga, y ahi
//                                    escribir m_nState = 2 deja el arma muda: con
//                                    balas y sin recarga, y sin error.
//   3. el cargador de mas de una bala  un arma de un tiro no tiene nada que
//                                    recargar. Es el mismo chequeo del .cs.
//
// Y una cuarta, que no es una guarda sino la razon de leer la ficha: el PLAZO.
// GetWeaponReloadTime dice cuantos ms tarda, y sin el no hay animacion: el arma
// pasa de RECARGANDO a READY en un frame y no se ve nada.
//
// LA TERCERA GUARDA NO ES UNA FUENTE DE LA CAPACIDAD, Y NO DEBE CONVERTIRSE EN UNA
// ---------------------------------------------------------------------------
// `readI16(info + INFO_AMMO) <= 1` lee el mismo dato que clipCapacityOf() —la
// ficha es la misma— pero por un offset sin verificar y devolviendo un booleano en
// vez del numero. Quien necesite el NUMERO de balas, va a clipCapacityOf: este
// returns no lo tiene y no puede tenerlo.
//
// O sea que esto no es una segunda fuente de verdad: es el tercer chequeo del .cs
// de referencia, que se copio tal cual, y cumple lo que cumple. Ver "LA DUALIDAD
// DE LA CAPACIDAD" arriba. La linea no se borra.
export function reloadSpec(weaponType) {
    if (!weaponType) return null;
    if (NO_RELOAD_ANIM.indexOf(weaponType) >= 0) return null;

    var info = infoDeTipo(weaponType);
    if (!info) return null;

    if (!(readI32(info + INFO_FLAGS) & WEAPON_FLAG_RELOAD)) return null;
    if (readI16(info + INFO_AMMO) <= 1) return null;

    var ms = reloadTimeOf(info);
    if (!ms || ms <= 0) return null;

    return { info: info, ms: ms };
}

// El plazo de recarga de una ficha, en ms. 0 si no se pudo preguntar.
function reloadTimeOf(info) {
    try {
        return Memory.CallMethodReturn(RELOAD_TIME_FN, info, 0, 0) || 0;
    } catch (e) {
        return 0;
    }
}