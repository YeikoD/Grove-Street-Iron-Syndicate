// GSIS - Weapons: gsis_Weapons
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// La puerta del modulo de armas: lo registra, y las TRES operaciones que el
// jugador puede hacer con un arma.
//
//   equipar(itemId)   sacar el arma del inventario y ponerla en la mano
//   desequipar(slot)  sacarla de la mano y devolverla al inventario
//   recargar()        meterle un cargador del inventario, con animacion
//
// Y una cuarta que no es una operacion sino una lectura para la UI:
// `getEquipadas()`, que devuelve el registro de equipadas para el snapshot.
//
// ============================================================================
// EL CICLO COMPLETO
// ============================================================================
//   inventario: colt45 desnuda, mag_colt45 con 8 balas
//        |  equipar
//        v
//   la 63 en el ped, con clip 0 | registro: equipped[2] = { id, salud }
//        |  R
//        v
//   el cargador sale del inventario, sus 8 balas pasan al arma, y la fila desaparece
//        |  desequipar
//        v
//   la 63 sale del ped y vuelve al inventario CON SUS BALAS
//
// La pieza se saca del inventario ANTES de gastarla y se devuelve si el motor la
// rechaza, y el registro se escribe DESPUES de que el motor acepto el arma. Ese
// orden es el que hace que un fallo no duplique ni pierda: sin registro, el
// reconciliador encuentra el arma en el ped sin fila y la adopta.
//
// ============================================================================
// LOS TRES ARCHIVOS DEL MODULO
// ============================================================================
//   ammo.js           EL INVARIANTE. Un recorrido por frame que aplica
//                     clip = min(clip, capacidad) y total = clip. Sin estado.
//   state.js          Lo que se persiste: que arma esta equipada en cada slot.
//   gsis_Weapons.js   esto. Las operaciones y el camino al motor.
//
// ============================================================================
// LA RECARGA: DE DONDE SALE LA SECUENCIA
// ============================================================================
// La animacion es la del .cs de "Reload Mod" (Junior_Djjr), que es el mod del que
// sale el reloj de la recarga: escribir `m_nTimeForNextShot` con "ahora + el plazo
// que dice la ficha", pasar el estado a RECARGANDO, y esperar. Los offsets y la
// funcion del plazo estan en core/gsis_Engine.js, con su procedencia.
//
// LO QUE ES DISTINTO, Y ES TODO EL MOTIVO DEL MOD
// ---------------------------------------------------------------------------
// "Reload Mod" recarga moviendo la RESERVA del total al clip. Este mod no tiene
// reserva —el invariante de ammo.js lo prohibe—, asi que la recarga es NUESTRA: se
// saca un cargador del inventario y se escriben sus balas en el clip.
//
// Y el motor no puede hacerlo por su cuenta: con `total == clip` su recarga no
// tiene nada que mover. Esa es la razon de que el modulo sea dueno de la recarga y
// no solo de las balas.
//
// LA FILA DEL CARGADOR SE CONSUME ENTERA
// ---------------------------------------------------------------------------
// Las balas del cargador pasan al arma y la fila desaparece del inventario. Un
// cargador con 3 balas monta 3. La parte que no entra en el arma NO vuelve al
// cargador: con una capacidad de 8 y un cargador de 15, las 7 de mas se pierden. Es
// una decision de este paso y esta escrita en ammo.js tambien, donde el pickup es
// el otro caso de municion que se descarta.
// ============================================================================

import { register } from "../../core/gsis_ModuleRegistry.js";
import { KEYS, WEAPONS, AUDIO } from "../../core/gsis_Config.js";
import { keyJustPressed } from "../../core/gsis_Input.js";
import { t } from "../../core/gsis_L10n.js";
import { query } from "../../core/gsis_EventBus.js";
import {
    ITEMS_TAKE_WEAPON, ITEMS_STORE_WEAPON, ITEMS_TAKE_MAGAZINE, ITEMS_STORE_MAGAZINE,
    ITEMS_TAKE_ACCESSORY, ITEMS_STORE_ACCESSORY,
    ITEMS_MAG_AMMO, ITEMS_SET_MAG_AMMO,
    ITEMS_TAKE_AMMO, ITEMS_STORE_AMMO
} from "../../core/gsis_EventNames.js";
import {
    defDeFamilia, defDeCargador, defDeSilenciador, cargadorSirveA, cargadoresDe,
    balaSirveA, balasDe, tipoDe, varianteDeTipo, familiaDeTipo, nombreDeConfiguracion,
    CARGADORES, SILENCIADORES
} from "../../data/gsis_weapons.js";
import * as Engine from "../../core/gsis_Engine.js";
import { normalizarSinReserva } from "./ammo.js";
import {
    initState, getEntry, getEntries, setEntry, silenciadorEnArma,
    getCargadores, setCargador, ranuraLibre, maxCargadores,
    getCargadorEnArma, setCargadorEnArma
} from "./state.js";

var NOMBRE_MODULO = "Weapons";

// Importar el modulo lo REGISTRA. Un modulo que se importa sin registrarse es un
// modulo invisible: no sale en el log de arranque, su update no corre nunca, y el
// sintoma no es un error sino una pantalla que no cambia.
register({
    name: NOMBRE_MODULO,
    init: initWeapons,
    update: updateWeapons
});

// ---------------------------------------------------------------------------
// EL CICLO DE VIDA
// ---------------------------------------------------------------------------
function initWeapons() {
    initState();
    _pendiente = null;

    var char = Engine.playerChar();
    var corregidas = char ? normalizarSinReserva(char) : 0;

    // RECONCILIAR, antes de contar los huerfanos.
    //
    // El save del juego y el del mod son dos guardados y el del juego se carga
    // antes: el ped puede traer un arma de la familia con un tipo que no es el que
    // dicen los accesorios del modulo. Se corrige antes de seguir, y el conteo de
    // huerfanos que viene abajo ya ve el estado como quedo.
    //
    // Y por que va en el init y no en cada frame: el desajuste no se produce solo,
    // se produce al CARGAR. Un give por frame Costaria un remove+give por frame en
    // el peor caso, y el modulo no tiene forma de saber si ya esta arreglado sin
    // volver a mirar. Ver "QUE GANA Y POR QUE" en reconciliar().
    var reconciliadas = char ? reconciliar() : 0;

    // Lo que quedo registrado de la partida anterior y el motor no tiene. Pasa
    // cuando el save del juego no nos guardo un arma que el mod si.
    var huerfanos = _entradasHuerfanas(char);

    log("[Weapons] Sin reserva. Tipos " + WEAPONS.PLUGIN_TYPE_MIN + ".." +
        WEAPONS.PLUGIN_TYPE_MAX + " | normalizadas al arrancar: " + corregidas +
        " | equipadas registradas: " + getEntries().length +
        (reconciliadas ? " | reconciliadas al cargar: " + reconciliadas : "") +
        (huerfanos ? " | sin arma en el ped: " + huerfanos : ""));
}

function updateWeapons() {
    var char = Engine.playerChar();
    if (!char) return;

    if (keyJustPressed(KEYS.DEBUG_WEAPON)) _darArmaDePrueba();
    if (keyJustPressed(KEYS.RELOAD)) recargar();

    _watchdogRecarga();

    // El guard va SIEMPRE y va al final: la recarga escribe el par clip/total, y
    // el guard tiene que ver el estado ya terminado.
    normalizarSinReserva(char);
}

// La recarga en curso. No es estado de juego: es el Armed del motor. Se pone al
// empezar la recarga y lo consume el watchdog del update.
//
// Un unico pendiente y no una lista: un ped tiene UN arma en la mano y una sola
// recarga a la vez.
var _pendiente = null;

// ---------------------------------------------------------------------------
// EL CAMINO AL MOTOR
// ---------------------------------------------------------------------------
// El UNICO camino por el que un arma llega al ped. Vive aca y no en ammo.js porque
// ammo.js no depende de nada: es una funcion que lee y compara.
//
// EL REMOVE VA SIEMPRE, y no solo cuando el tipo cambia: GIVE_WEAPON_TO_CHAR del
// MISMO tipo no reemplaza, SUMA. Con un arma de 8 y un give de 8 el total pasaba a
// 16. Quitar y dar es lo unico que es "dar este arma con este estado".
//
// Y la verificacion es por MEMORIA, no con HAS_CHAR_GOT_WEAPON: en el runtime donde
// se desarrollo el native miente y la memoria no, y un give puede dar el arma y
// tirar despues (el tipo lo metio el .asi, que la capa JS no conoce).
function _darArma(char, tipo, balas) {
    var ped = Engine.pedPointer(char);
    if (!ped) return false;

    if (Engine.addressOfType(ped, tipo)) Engine.removeWeapon(char, tipo);

    if (!Engine.giveWeapon(char, tipo, balas)) return false;
    Engine.setCurrentWeapon(char, tipo);

    var addr = Engine.addressOfType(ped, tipo);
    if (!addr) return false;

    Engine.setSlotClip(addr, balas);
    Engine.setSlotTotal(addr, balas);
    // El estado en READY importa: si el motor lo deja en OUT_OF_AMMO, CWeapon::Fire
    // hace return false y el arma tiene balas y no dispara.
    Engine.setSlotState(addr, Engine.WEAPONSTATE_READY);
    return true;
}

// ---------------------------------------------------------------------------
// CAMBIAR DE VARIANTE
// ---------------------------------------------------------------------------
// Un `_darArma` y nada mas. NO hay remove del tipo viejo, NO hay rollback y NO
// hay transaccion, y esa es la decision de diseño de todo el sistema de familias.
//
// GIVE_WEAPON_TO_CHAR da el arma, la pone en el slot del arma y REEMPLAZA lo que
// hubiera en ese slot. Las 4 variantes de la Colt son slot 2, asi que dar la 62
// con la 63 en la mano deja la 62 y se lleva la 63. El motor hace el trabajo.
//
// El unico guard es el MISMO tipo: un give del mismo tipo NO reemplaza, SUMA. Con
// un arma de 8 y un give de 8 el total pasaba a 16, que es el bug que motivo
// `_darArma` a quitar antes de dar. Un cambio de variante que llega al mismo tipo
// es un no-op, y hay que verlo venir:
//
//   el jugador recarga con el cargador de 15 en un arma que YA es de 15
//   el silenciador se monta en un arma que ya lo tiene
//
// En los dos casos el give sumaria balas a un arma que ya las tiene y dejaria el
// total mal. Por eso la comparacion es contra el tipo REAL del ped y no contra el
// que el modulo cree: si el modulo esta desfasado, la comparacion contra lo que el
// mod cree dejaria pasar el give y el bug seguiria.
//
// Y NO se escribe el estado antes de dar. Si el give no toma, el estado queda como
// estaba y el proximo reconcile lo corrige; al reves, el mod announce una variante
// que el motor no tiene y el inventario miente.
function _darTipo(char, addr, tipoNuevo, balas) {
    if (!addr) return false;
    if (Engine.slotType(addr) === tipoNuevo) return true;
    return _darArma(char, tipoNuevo, balas);
}

// El weaponType que le corresponde a un arma segun SUS ACCESORIOS, o 0 si la
// combinacion no tiene variante.
//
// Y el arma DESNUDA tiene tipo: el de la capacidad base de la familia. No es un
// caso raro ni un parche, es la definicion — naked es la base, con cargador de la
// base—. Devolver 0 para un arma desnuda obligaba a que cada llamador se acordara
// del fallback, y eran dos: el reconciliador lo tenia y `getEquipadas` no, y por eso
// el aviso de "desfasada" nunca aparecia en un arma desnuda.
//
// El 0 es un valor de fallo explicito y no un tipo: tipoDe() devuelve null cuando
// no hay variante, y un tipo inventado seria un arma que el motor no tiene. Quien
// llama loguea y deja el arma como estaba.
function _tipoDeConfiguracion(slot) {
    var e = getEntry(slot);
    if (!e) return 0;
    return tipoDe(e.id, _clipDeConfiguracion(slot), silenciadorEnArma(slot)) || 0;
}

// Las balas que tiene un arma EN LA MANO, leidas del ped. 0 si no hay arma.
function _municionEnLaMano(char) {
    var ped = Engine.pedPointer(char);
    if (!ped) return 0;
    var addr = Engine.slotAddress(ped, Engine.selectedSlot(ped));
    if (!addr) return 0;
    return Engine.slotClip(addr);
}

// ---------------------------------------------------------------------------
// LOS CARGADORES
// ---------------------------------------------------------------------------
// Hay TRES lugares donde puede estar un cargador, y son los tres del juego: el
// INVENTARIO (la mochila), las dos RANURAS de equipados, y PUESTO EN EL ARMA. Los
// tres se mueven con la misma regla y ninguno se pierde:
//
//   equiparCargador  mochila -> primera ranura libre (con las dos llenas no entra)
//   guardarCargador  ranura  -> mochila, con las balas que le quedaron
//   recargar (la R)   ranura  -> arma, y lo que estaba en el arma sale por
//                               soltarCargador (abajo)
//   desequipar       arma    -> mochila, DESNUDA, y el cargador sale con ella
//   rellenar         cargador -> cargador, le pasa las balas de otro
//
// QUE PASA CON EL CARGADOR QUE SALE DEL ARMA
// ---------------------------------------------------------------------------
// Es la regla de la casa: un cargador que sale del arma va a una ranura si hay lugar
// Y TIENE BALAS, y si no a la mochila. Vive en un solo lugar (soltarCargador) porque
// son tres los caminos que lo hacen —el cambio, la descarga y el desequipar— y si
// cada uno decidiera por su cuenta, uno de ellos tarde o temprano lo perderia.
//
// Y un cargador VACIO NUNCA OCUPA RANURA: en una ranura no sirve para nada, porque
// recargar exige ammo > 0, y dejaria trabado el cambio al jugador. Por eso la
// mochila no es el segundo destino, sino el unico para el vacio.
//
// QUE PASA CON LAS BALAS QUE SOBRAN
// ---------------------------------------------------------------------------
// Un cargador de 15 en un arma de 8 deja 8 y las 7 sobrantes SE PIERDEN: la
// capacidad la dice el motor para ese arma y el cargador no sabe nada. El cargador
// VUELVE con lo que le quedo (15 - 8 = 7), no con lo que tenia antes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DONDE VA UN CARGADOR QUE SALE DEL ARMA
// ---------------------------------------------------------------------------
// El unico lugar del modulo que decide esto, y lo usan los tres caminos que sacan
// un cargador del arma: el cambio de la recarga, la descarga y el desequipar.
//
// A una ranura si hay lugar Y el cargador tiene balas. A la mochila si no hay lugar,
// o si el cargador esta vacio: un cargador de 0 en una ranura no se puede usar para
// recargar (la recarga exige ammo > 0) y ocuparia una de las dos ranuras que el
// jugador tiene para las que si sirven.
//
// Devuelve donde fue, para el log y para los avisos.
export function soltarCargador(itemId, ammo) {
    var balas = ammo || 0;

    // Con balas y con lugar: ranura.
    var ranura = balas > 0 ? ranuraLibre() : -1;
    if (ranura >= 0) {
        setCargador(ranura, { id: itemId, ammo: balas });
        log("[Weapons] soltarCargador: " + itemId + " (" + balas + ") -> ranura " + (ranura + 1));
        return "ranura " + (ranura + 1);
    }

    // Sin balas, o sin ranura: mochila.
    query(ITEMS_STORE_MAGAZINE, { id: itemId, ammo: balas });
    log("[Weapons] soltarCargador: " + itemId + " (" + balas + ") -> el inventario" +
        (balas > 0 ? " | no habia ranura libre" : " | vacio, y vacio no ocupa ranura"));
    return "el inventario";
}

// Sacar un cargador del inventario y ponerlo en una ranura.
export function equiparCargador(itemId) {
    var def = defDeCargador(itemId);
    if (!def) {
        log("[Weapons] equiparCargador: " + itemId + " no es un cargador del mod");
        return false;
    }

    // Primero la ranura, despues el inventario. Al reves se saca una pieza del
    // inventario para que no haya donde guardarla, y se devuelve a entrar.
    var ranura = ranuraLibre();
    if (ranura < 0) {
        showTextBox(t("WPN_CARGADORES_LLENOS"));
        log("[Weapons] equiparCargador: las " + maxCargadores() + " ranuras estan llenas");
        return false;
    }

    var fila = query(ITEMS_TAKE_MAGAZINE, { id: itemId });
    if (!fila) {
        log("[Weapons] equiparCargador: no hay " + itemId + " con balas en el inventario");
        return false;
    }

    setCargador(ranura, { id: itemId, ammo: fila.ammo || 0 });

    log("[Weapons] equiparCargador: " + itemId + " -> ranura " + (ranura + 1) +
        " | " + (fila.ammo || 0) + " balas");
    return true;
}

// Sacar un cargador de la ranura y devolverlo al inventario con lo que le queda.
export function guardarCargador(indice) {
    var lista = getCargadores();
    if (indice < 0 || indice >= lista.length) {
        log("[Weapons] guardarCargador: no hay cargador en la ranura " + indice);
        return false;
    }
    var c = lista[indice];

    query(ITEMS_STORE_MAGAZINE, { id: c.id, ammo: c.ammo || 0 });
    setCargador(indice, null);

    log("[Weapons] guardarCargador: " + c.id + " <- ranura " + (indice + 1) +
        " | vuelve al inventario con " + (c.ammo || 0) + " balas");
    return true;
}

// ---------------------------------------------------------------------------
// EQUIPAR
// ---------------------------------------------------------------------------
// Sacar el arma del inventario y ponerla en la mano. La fila sale del inventario
// ANTES del give y vuelve intacta si el motor no la acepta.
export function equipar(itemId) {
    var def = defDeFamilia(itemId);
    if (!def) {
        log("[Weapons] equipar: " + itemId + " no es un arma del mod");
        return false;
    }
    var char = Engine.playerChar();
    if (!char) return false;

    // El slot ya tiene un arma? primero sale esa. Sin esto, equipar encima
    // dejaria dos armas en el mundo y una fila en el inventario.
    if (getEntry(def.slot)) {
        if (!desequipar(def.slot)) {
            log("[Weapons] equipar: no se pudo sacar el arma anterior del slot " + def.slot);
            return false;
        }
    }

    var fila = query(ITEMS_TAKE_WEAPON, { id: itemId });
    if (!fila) {
        log("[Weapons] equipar: no hay " + itemId + " en el inventario");
        return false;
    }

    // UN ARMA DESNUDA TIENE LA CAPACIDAD DE SU FAMILIA, Y EL SILENCIADOR SI CUENTA.
    //
    // El cargador es lo que no hay, y lo que falta es la capacidad: el cargador mas
    // chico de la familia es la base. El silenciador en cambio esta MONTADO y viaja
    // con el arma, asi que se respeta desde el mismo instante en que se equipa.
    //
    // Esto no es un detalle: armar la variante pelada en un arma que tiene el
    // silenciador puesto la haria ver y sonar como una pistola normal hasta la
    // primera recarga. El jugador tendria un arma en la mano que no es la que dice
    // la mochila, que es exactamente la clase de mentira que hay que evitar.
    //
    // El silenciador sale de la FILA, no del registro: todavia no hay entry para este
    // slot, y la fila es la que sabe como estaba el arma en la mochila.
    var silenciador = !!fila.silenciador;
    var tipo = tipoDe(itemId, _clipPelado(itemId), silenciador);
    if (!tipo) {
        query(ITEMS_STORE_WEAPON, fila);
        log("[Weapons] equipar: la familia " + itemId +
            " no tiene variante para (" + _clipPelado(itemId) + ", " +
            (silenciador ? "sil." : "pelada") + "). La pieza vuelve al inventario.");
        return false;
    }

    if (!_darArma(char, tipo, 0)) {
        query(ITEMS_STORE_WEAPON, fila);
        log("[Weapons] equipar: el motor no acepto el tipo " + tipo +
            ". El .asi lo registro? La pieza vuelve al inventario.");
        return false;
    }

    setEntry(def.slot, { id: itemId, salud: fila.salud, silenciador: silenciador });
    log("[Weapons] equipar: " + itemId + " -> " + nombreDeConfiguracion(itemId, tipo) +
        " (tipo " + tipo + ") | slot " + def.slot + " | desnuda, 0/" +
        Engine.clipCapacityOf(tipo));
    return true;
}

// La capacidad de la variante pelada de una familia: la del cargador mas chico.
//
// POR QUE NO ESTA EN EL CATALOGO COMO UN DATO MAS
// ---------------------------------------------------------------------------
// Seria la cuarta copia del numero de balas si lo escribiera, y la segunda copia
// es exactamente lo que produjo el cargador de 15 que terminaba en 8. Sale de los
// cargadores que la familia declara, que son los mismos de los que salen las otras
// tres variantes.
//
// Y si la familia no tuviera ningun cargador, el arma no se puede equipar: es el
// caso degenerado que `_clipPelado` devuelve 0 para que `tipoDe` no encuentre
// variante y el error diga "no tiene cargador" y no "el .asi no registro el tipo".
function _clipPelado(familiaId) {
    var mags = cargadoresDe(familiaId);
    if (!mags.length) return 0;
    var menor = null;
    for (var i = 0; i < mags.length; i++) {
        var c = CARGADORES[mags[i]].clipSize;
        if (menor === null || c < menor) menor = c;
    }
    return menor === null ? 0 : menor;
}

// ---------------------------------------------------------------------------
// LLENAR
// ---------------------------------------------------------------------------
// Pasarle balas a un cargador. Es la accion que le da sentido a un cargador vacio:
// sin ella, disparar las 8 balas dejaba una pieza en la mochila que no servia para
// nada.
//
// LA FUENTE SON LAS BALAS SUELTAS, Y ANTES ERA OTRO CARGADOR. Ese cambio es todo el
// sistema: antes la accion era un trasvase entre cargadores del mismo id, que hacia
// circular lo que ya estaba dentro y no dejaba entrar municion nueva al sistema —
// con dos cargadores y ocho balas, la suma de balas del mundo no crecia nunca—.
// Ahora la caja es la unica entrada, y el cargador es la pieza que se llena.
//
// Que el destino siga siendo el cargador y no el arma es lo que sostiene el
// sistema de variantes: la capacidad la elige QUE CARGADOR esta puesto, y sin
// cargadores el cargador de 15 —y con el, las variantes 62 y 61— seria
// inalcanzable.
//
// Y NUNCA se mueve una fila: las dos se escriben donde estan. Sacar una fila corre
// los indices de las de abajo, y la segunda escritura caeria en el cargador
// equivocado —que es la forma sutil de que un cargador aparezca con las balas de
// otro—.
// ---------------------------------------------------------------------------
// LLENAR UN CARGADOR DESDE LA CAJA
// ---------------------------------------------------------------------------
// El destino es el cargador que el jugador eligio —el de la fila que toco— y la
// fuente ya no es un cargador: son las balas sueltas, que son la UNICA entrada de
// municion al sistema. Antes la fuente era "otro cargador del mismo id", un
// trasvase que hacia circular lo que ya estaba dentro y no dejaba entrar nada
// nuevo.
//
// Que elija el MODULO y no el jugador tambien es lo mismo que antes: si el modulo
// pregunta "cual caja" y hay varias, "la de la familia" alcanza, porque una caja de
// otra familia no le sirve a este cargador.
//
// Y NUNCA se mueve una fila del destino: se le ESCRIBE la municion donde esta. Y
// las balas tampoco se mueven: se las descuenta, que es una operacion distinta y no
// corre indices. Por eso la fila que el jugador toco sigue siendo la misma fila
// despues de rellenar.
export function llenarDesdeCaja(equipado, indice) {
    // ---- EL DESTINO
    var destId = null;
    var destAmmo = 0;
    if (equipado) {
        var enRanura = getCargadores()[indice];
        if (!enRanura) {
            log("[Weapons] llenarDesdeCaja: la ranura " + (indice + 1) + " esta vacia");
            return false;
        }
        destId = enRanura.id;
        destAmmo = enRanura.ammo || 0;
    } else {
        var fila = query(ITEMS_MAG_AMMO, { indice: indice });
        if (!fila) {
            log("[Weapons] llenarDesdeCaja: en la mochila no hay un cargador en el indice " + indice);
            return false;
        }
        destId = fila.id;
        destAmmo = fila.ammo || 0;
    }

    // ---- QUE FAMILIA ES
    //
    // La familia es lo que decide que balas sirven, y sale del CARGADOR, no del
    // arma: el cargador es la pieza, y el casamiento de una bala con un cargador es
    // "las familias que le sirven a ambos". Un cargador de otra familia en esta
    // ranura es un estado que `recargar` no puede dejar, pero aca se rechaza igual
    // en vez de llenar un cargador que ninguna variante puede usar.
    var destDef = defDeCargador(destId);
    if (!destDef || !destDef.familias.length) {
        log("[Weapons] llenarDesdeCaja: " + destId + " no es un cargador con familias");
        return false;
    }

    var cap = capacidadDeItem(destId);
    var falta = cap - destAmmo;
    if (falta <= 0) {
        showTextBox(t("WPN_LLENO"));
        log("[Weapons] llenarDesdeCaja: " + destId + " ya esta lleno (" + destAmmo + "/" + cap + ")");
        return false;
    }

    // ---- LAS BALAS
    //
    // Un solo evento, y hace el gasto entero adentro. Se pide `falta`, no todo lo
    // que hay: si el jugador tiene 200 balas y el cargador va a estar lleno con 8,
    // pedir 200 gastaria el stock entero en una caja que se iba a llenar igual. El
    // handler responde cuanto salio de verdad, que es lo que se le suma al
    // cargador, y por eso un `taken` menor que `falta` no es un error: es que no
    // habia balas.
    var r = query(ITEMS_TAKE_AMMO, { n: falta, familias: destDef.familias });
    var tomadas = (r && r.taken) || 0;
    if (tomadas <= 0) {
        showTextBox(t("WPN_SIN_MUNICION"));
        log("[Weapons] llenarDesdeCaja: no hay balas para " + destId +
            " (familia " + destDef.familias.join(", ") + ")");
        return false;
    }

    // ---- ESCRIBIR EL DESTINO
    //
    // El indice del destino se leyo antes de gastar las balas, y gastar balas no
    // mueve filas —descuenta cantidades y borra stacks que llegaron a cero, que no
    // son el destino porque el destino es un cargador instanciado— asi que el
    // indice sigue apuntando a la misma fila.
    if (equipado) {
        setCargador(indice, { id: destId, ammo: destAmmo + tomadas });
    } else {
        query(ITEMS_SET_MAG_AMMO, { indice: indice, ammo: destAmmo + tomadas });
    }

    log("[Weapons] llenarDesdeCaja: " + destId + " " + destAmmo + "/" + cap +
        " -> " + (destAmmo + tomadas) + "/" + cap + " | " + tomadas + " bala(s) de la caja");
    return true;
}

// ---------------------------------------------------------------------------
// LO QUE HAY PUESTO EN UN ARMA
// ---------------------------------------------------------------------------
// `cargador` sale del registro del modulo y las balas salen del MOTOR, en el mismo
// `getEquipadas`: leerlas por separado seria dos respuestas al motor para un dato que
// ya se leyo. La fila de la UI necesita los dos —cuantas balas quedan y de donde
// salieron— y este es el lugar que tiene los dos.

// ---------------------------------------------------------------------------
// DESEQUIPAR
// ---------------------------------------------------------------------------
// Sacar el arma de la mano. Vuelve DESNUDA, y su cargador sale con ella.
//
// Antes el arma volvia CON SUS BALAS y se copiaba la municion al inventario. Ya no:
// las balas de un arma son las del cargador que tiene puesto, asi que el arma
// desnuda vuelve con cero y el cargador se va con lo que le queda. Si vuelve un arma
// con balas y sin cargador, la proxima recarga no tendria nada que sacar de ella.
export function desequipar(slot) {
    var entry = getEntry(slot);
    if (!entry) {
        log("[Weapons] desequipar: no hay arma registrada en el slot " + slot);
        return false;
    }
    var def = defDeFamilia(entry.id);
    if (!def) {
        // El registro nombra un item que el catalogo ya no tiene: se descarta,
        // porque dejarlo bloquea el slot para siempre.
        setEntry(slot, null);
        log("[Weapons] desequipar: el registro del slot " + slot + " (" + entry.id +
            ") no es un arma del catalogo. Se descarta.");
        return true;
    }

    var char = Engine.playerChar();
    if (!char) return false;

    // Las TRES cosas se leen DEL PED ANTES de sacar el arma, porque despues el slot
    // ya no las tiene: que cargador tiene puesto, cuantas balas le quedan, y QUE
    // TIPO tiene de verdad. El tipo se lee del ped y no del modulo a proposito: es
    // el que hay que sacar, y si el modulo esta desfasado, sacar el que el modulo
    // cree deja al otro en la mano con un arma en el inventario.
    var magId = getCargadorEnArma(slot);
    var ammo = _municionEnLaMano(char);
    var ped = Engine.pedPointer(char);
    var addr = ped ? Engine.slotAddress(ped, def.slot) : 0;
    var tipoReal = addr ? Engine.slotType(addr) : 0;

    if (tipoReal) Engine.removeWeapon(char, tipoReal);

    // El silenciador se va CON el arma: la fila del inventario lo lleva, y por eso
    // vuelve a estar montado la proxima vez que se equipe. Sin este campo el arma
    // perderia el silenciador en cada viaje a la mochila.
    query(ITEMS_STORE_WEAPON, {
        id: entry.id,
        salud: entry.salud,
        ammo: 0,
        silenciador: !!entry.silenciador
    });
    setEntry(slot, null);
    setCargadorEnArma(slot, null);

    var detalle = "vuelve al inventario desnuda";
    detalle += entry.silenciador ? " | con el silenciador montado" : "";
    if (magId) {
        detalle += " | su cargador (" + magId + ", " + ammo + ") -> " +
            soltarCargador(magId, ammo);
    } else {
        detalle += " | sin cargador puesto";
    }

    log("[Weapons] desequipar: slot " + slot + " | " + entry.id + " | " + detalle);
    return true;
}

// ---------------------------------------------------------------------------
// EL SILENCIADOR
// ---------------------------------------------------------------------------
// Montarlo y desmontarlo cambia la variante, y por eso las dos operaciones son
// "sacar una pieza, cambiar el tipo, dejar el flag".
//
// Y hay una diferencia importante con el cargador, que explica por que el
// silenciador se monta y no se recarga:
//
//   el cargador   se CONSUME: sus balas pasan al arma y la fila desaparece. Es un
//                 recurso.
//   el silenciador NO se consume: se MONTA. El mismo silenciador se puede quitar
//                 y volver a poner, y mientras esta en el arma no esta en ningun
//                 otro lado del modulo — no hay ranura de silenciadores, y el flag
//                 vive en la fila del arma.
//
// Por eso el silenciador no tiene `clipSize` ni `familias` en el catalogo: no es un
// cargador, no entra en las ranuras de cargador, y `slotDe` lo devuelve como 0
// mientras esta en la mochila. Ver data/gsis_weapons.js.

// Montar el silenciador del inventario en el arma de un slot.
//
// El orden es el de siempre: el give primero, el flag despues. Si el give no toma,
// el silenciador no se gasto.
export function montarSilenciador(slot, silenciadorId) {
    var char = Engine.playerChar();
    if (!char) return false;
    var ped = Engine.pedPointer(char);
    if (!ped) return false;

    var def = defDeSilenciador(silenciadorId);
    if (!def) {
        log("[Weapons] montarSilenciador: " + silenciadorId + " no es un silenciador del mod");
        return false;
    }

    var entry = getEntry(slot);
    if (!entry) {
        log("[Weapons] montarSilenciador: no hay arma en el slot " + slot);
        return false;
    }
    if (entry.silenciador) {
        log("[Weapons] montarSilenciador: el slot " + slot + " ya tiene silenciador");
        return false;
    }

    var addr = Engine.slotAddress(ped, entry.id ? _slotDeFamilia(entry.id) : 0);
    if (!addr) {
        log("[Weapons] montarSilenciador: el ped no tiene el arma del slot " + slot);
        return false;
    }
    var tipoActual = Engine.slotType(addr);
    var enClip = Engine.slotClip(addr);

    // Que variante le toca. Con cargador puesto, la del cargador; desnuda, la base.
    var clip = _clipDeConfiguracion(slot);
    var tipoNuevo = tipoDe(entry.id, clip, true);
    if (!tipoNuevo) {
        log("[Weapons] montarSilenciador: la familia " + entry.id +
            " no tiene variante silenciada para (" + clip + ")");
        return false;
    }

    var fila = query(ITEMS_TAKE_ACCESSORY, { id: silenciadorId });
    if (!fila) {
        log("[Weapons] montarSilenciador: no hay " + silenciadorId + " en el inventario");
        return false;
    }

    if (tipoNuevo !== tipoActual) {
        if (!_darTipo(char, addr, tipoNuevo, enClip)) {
            query(ITEMS_STORE_ACCESSORY, { id: silenciadorId });
            log("[Weapons] montarSilenciador: el motor no acepto el tipo " + tipoNuevo +
                ". El silenciador vuelve al inventario.");
            return false;
        }
    }
    setEntry(slot, { id: entry.id, salud: entry.salud, silenciador: true });
    log("[Weapons] montarSilenciador: " + silenciadorId + " -> slot " + slot +
        " | " + nombreDeConfiguracion(entry.id, tipoActual) + " -> " +
        nombreDeConfiguracion(entry.id, tipoNuevo) + " (tipo " + tipoNuevo + ") | " +
        enClip + " balas");
    return true;
}

// Desmontar el silenciador del arma de un slot y devolverlo a la mochila.
//
// Al reves que montar, el estado va PRIMERO y el give despues, y por una razon
// concreta: si el give falla, el arma tiene el silenciador puesto y asi debe
// quedar. Si se hiciera al reves, un fallo dejaba el flag puesto con el silenciador
// en la mochila, y el proximo reconcile lo montaria solo sin que el jugador lo
// pidiera. Un flag que se pone solo es peor que un flag que no se pone.
export function quitarSilenciador(slot) {
    var char = Engine.playerChar();
    if (!char) return false;
    var ped = Engine.pedPointer(char);
    if (!ped) return false;

    var entry = getEntry(slot);
    if (!entry) {
        log("[Weapons] quitarSilenciador: no hay arma en el slot " + slot);
        return false;
    }
    if (!entry.silenciador) {
        log("[Weapons] quitarSilenciador: el slot " + slot + " no tiene silenciador");
        return false;
    }

    var addr = Engine.slotAddress(ped, _slotDeFamilia(entry.id));
    if (!addr) {
        log("[Weapons] quitarSilenciador: el ped no tiene el arma del slot " + slot);
        return false;
    }
    var tipoActual = Engine.slotType(addr);
    var enClip = Engine.slotClip(addr);

    var clip = _clipDeConfiguracion(slot);
    var tipoNuevo = tipoDe(entry.id, clip, false);
    if (!tipoNuevo) {
        log("[Weapons] quitarSilenciador: la familia " + entry.id +
            " no tiene variante pelada para (" + clip + ")");
        return false;
    }

    // EL PESO SE CHEQUEA EN EL HANDLER, no aca: `storeAccessory` devuelve false si
    // el silenciador no entra en la mochila. Esa es la razon de que el handler sea el
    // que decide y no el que avisa despues — el modulo tiene que poder abortar la
    // operacion ANTES de tocar el flag y el tipo, y no despues.
    //
    // Y por eso el orden es el inverso que en `montarSilenciador`: aca la pieza se
    // guarda PRIMERO y el estado se escribe despues. Si la pieza no entra, no se
    // toca nada y el arma sigue con el silenciador puesto y con su tipo.
    if (!query(ITEMS_STORE_ACCESSORY, { id: defSilenciadorDe(entry) })) {
        showTextBox(t("WPN_LLENO"));
        log("[Weapons] quitarSilenciador: no hay lugar en la mochila para el silenciador");
        return false;
    }

    setEntry(slot, { id: entry.id, salud: entry.salud, silenciador: false });

    var detalle = "";
    if (tipoNuevo !== tipoActual) {
        if (!_darTipo(char, addr, tipoNuevo, enClip)) {
            // El estado ya esta sin silenciador y la pieza ya esta en la mochila, que
            // es coherente. Lo que no se pudo es el tipo: se avisa y el proximo
            // reconcile lo arregla. No se devuelve la pieza porque eso dejaria el
            // estado diciendo que el arma no lo tiene.
            log("[Weapons] quitarSilenciador: el motor no acepto el tipo " + tipoNuevo +
                ". El silenciador esta en la mochila y el arma sigue con su tipo viejo" +
                "; el proximo reconcile lo corrige.");
            return true;
        }
        detalle = " -> " + nombreDeConfiguracion(entry.id, tipoNuevo) +
            " (tipo " + tipoNuevo + ")";
    }

    log("[Weapons] quitarSilenciador: slot " + slot + " | " +
        nombreDeConfiguracion(entry.id, tipoActual) + detalle +
        " | el silenciador vuelve a la mochila");
    return true;
}

// El slot del motor de la familia de un item. 0 si el item no es un arma del mod.
function _slotDeFamilia(familiaId) {
    var f = defDeFamilia(familiaId);
    return f ? f.slot : 0;
}

// El silenciador que el arma de un slot tiene montado. Hoy hay uno solo en el
// catalogo; el dia que haya mas de uno pasa a ser "el primero que sirva", y el
// llamador tiene que decidir cual monta. Mismo contrato que cargadorDe().
//
// Y sale del catalogo y no de la fila del arma a proposito: en la fila esta el
// BOOLEANO ("tiene silenciador"), no la pieza. Que pieza es, se decide cuando se
// monta, y el flag despues solo recuerda que hay una.
function defSilenciadorDe(entry) {
    for (var id in SILENCIADORES) {
        if (Object.prototype.hasOwnProperty.call(SILENCIADORES, id)) return id;
    }
    return null;
}

// La capacidad de la configuracion actual de un slot: la del cargador puesto, o la
// base de la familia si el arma esta desnuda.
//
// Es la misma cuenta que hace tipoDe(), y va en una funcion para que las dos no
// puedan dejar de coincidir: si estas dos leyeran capacidades de fuentes distintas,
// el flag "ya tiene silenciador" y el tipo del motor dejarian de estar de acuerdo.
function _clipDeConfiguracion(slot) {
    var magId = getCargadorEnArma(slot);
    if (magId) {
        var mag = defDeCargador(magId);
        if (mag) return mag.clipSize;
    }
    var e = getEntry(slot);
    return e ? _clipPelado(e.id) : 0;
}

// ---------------------------------------------------------------------------
// RECONCILIAR
// ---------------------------------------------------------------------------
// Que el TIPO DEL PED sea el que dicen los accesorios del modulo, y arreglarlo si
// no lo es.
//
// POR QUE HACE FALTA, Y NO ES UN EXTRA
// ---------------------------------------------------------------------------
// El save de GTA y el save del mod son DOS guardados distintos. El del juego tiene
// `m_aWeapons[]` con los tipos; el del modulo tiene `equipped` y `enArma`. Nada los
// cruza: cargar el slot 1 del juego con el slot 3 del mod deja un ped con un arma y
// un modulo que cree que hay otra.
//
// Con el tipo DECLARADO eso se resolvia solo: las dos copias del numero eran el
// mismo numero, y lo que no coincidia era la accesorios, no la identidad. Con el
// tipo DERIVADO el desajuste es de tipo, y un 63 en la mano con el estado diciendo
// "cargador de 15 y silenciador" no se arregla solo: el modulo cree que el arma es
// de 15 balas y el HUD muestra 8.
//
// Y el caso del filesystem inverso tambien: un save del juego con la 63 en el slot
// 2 y un modulo con la entry del slot 2. Antes `_entradasHuerfanas` contaba eso y
// no hacia nada, y el arma se quedaba en la mano sin fila que la representara.
//
// QUE GANA Y POR QUE
// ---------------------------------------------------------------------------
// Gana el ESTADO DEL MOD. El tipo es una representacion derivada de los accesorios,
// y los accesorios son lo que el jugador hizo: si el modulo dice que hay un
// cargador de 15 montado, el arma es de 15 balas aunque el save de GTA diga otra
// cosa. Al reves —adoptar el tipo del ped— el silenciador que el jugador se puso
// desapareceria por un detalle de a que slot se cargo la partida.
//
// Y en un caso NO se toca nada: si el slot no tiene entry en el modulo, lo que hay
// en el ped es un arma que el mod no conoce, y se avisa. No es un arma que este
// "mal": puede ser una pistola de vanilla que el jugador agarro de una mission.
export function reconciliar() {
    var char = Engine.playerChar();
    if (!char) return 0;
    var ped = Engine.pedPointer(char);
    if (!ped) return 0;

    var corregidas = 0;
    var entries = getEntries();
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var addr = Engine.slotAddress(ped, e.slot);
        var tipoReal = addr ? Engine.slotType(addr) : 0;

        // Que el modulo dice, con los accesorios guardados. El arma desnuda tambien
        // tiene tipo, asi que aca no hay caso especial que se resuelva en otro
        // lado: es la misma cuenta que hace `getEquipadas`.
        var esperado = _tipoDeConfiguracion(e.slot);
        if (!esperado) continue;      // el catalogo no tiene esa combinacion
        if (tipoReal === esperado) continue;

        // Un tipo en el slot que NO es del mod no se toca: seria pisar un arma que
        // el modulo no tiene, y puede ser una pistola de vanilla que el jugador
        // agarro de una mission. El aviso es lo unico que corresponde.
        if (tipoReal && !familiaDeTipo(tipoReal)) {
            log("[Weapons] reconciliar: el slot " + e.slot + " tiene el tipo " +
                tipoReal + ", que no es del mod. Se deja como esta.");
            continue;
        }

        if (!_darTipo(char, addr, esperado, addr ? Engine.slotClip(addr) : 0)) {
            log("[Weapons] reconciliar: el motor no acepto el tipo " + esperado +
                " en el slot " + e.slot + ". Queda como estaba.");
            continue;
        }
        corregidas++;
        log("[Weapons] reconciliar: slot " + e.slot + " | " + e.id +
            " | tipo " + tipoReal + " -> " + esperado +
            " (" + nombreDeConfiguracion(e.id, esperado) + ")");
    }

    var huerfanas = _entradasHuerfanas(char);
    if (huerfanas > 0) {
        log("[Weapons] reconciliar: quedan " + huerfanas +
            " slot(s) del registro sin arma en el ped. No se tocan: un arma que el "
            + "mod cree que tiene y el ped no, se devuelve a la mochila al desequipar.");
    }
    return corregidas;
}

// ---------------------------------------------------------------------------
// RECARGAR
// ---------------------------------------------------------------------------
// Meter en el arma un cargador que este EQUIPADO, con animacion.
//
// ---------------------------------------------------------------------------
// La R tiene DOS caminos, y cual de los dos es lo decide el jugador:
//
//   CAMBIO     hay un cargador EQUIPADO con balas para este arma. El que tiene
//              PUESTO sale por soltarCargador, con las balas que le quedaban, y el
//              equipado entra. Con animacion y con el sonido del .asi.
//   DESCARGA   no hay ninguno equipado, pero hay uno puesto: ese sale por
//              soltarCargador y el arma queda DESNUDA. Con la MISMA animacion del
//              cambio y el mismo sonido, porque es la misma animacion del motor sin
//              las balas.
//
// Que no haya un tercer camino —"no pasa nada"— es lo que hace que la R sirva para
// cambiar de cargador con el arma llena, que es el uso mas comun de la tecla.
//
// La animacion se pregunta una sola vez y antes de tocar nada, porque los dos
// caminos la necesitan: un arma sin anim de recarga no puede cambiar ni descargar,
// y en ese caso no se mueve ningun cargador.
//
// El orden de las comprobaciones es el que hace que un fallo no gaste nada:
//
//   1. el arma de la mano es del mod      si no, no es nuestra recarga
//   2. no esta recargando ya              una recarga, no dos
//   3. el motor tiene capacidad declarada
//   4. ese arma tiene cargador en el catalogo
//   5. (solo en el CAMBIO) el motor tiene anim para este arma, y se PREGUNTA ANTES
//      de gastar el cargador: si el arma no recarga, el cargador se queda equipado
//      y el que tiene puesto no se toca
//
// Antes habia una comprobacion mas: "el clip no esta lleno". Se saco a proposito:
// era la que hacia que la R no hiciera nada con el arma llena, y cambiar de cargador
// es exactamente lo que se le pide a la tecla en ese caso.
// ---------------------------------------------------------------------------
export function recargar() {
    var char = Engine.playerChar();
    if (!char) return false;
    var ped = Engine.pedPointer(char);
    if (!ped) return false;

    var slot = Engine.selectedSlot(ped);
    if (!slot) return false;
    var addr = Engine.slotAddress(ped, slot);
    if (!addr) return false;
    var tipo = Engine.slotType(addr);

    var delMod = familiaDeTipo(tipo);
    if (!delMod) return false;

    if (Engine.slotState(addr) === Engine.WEAPONSTATE_RELOADING) return false;

    var cap = Engine.clipCapacityOf(tipo);
    if (cap <= 0) {
        log("[Weapons] recargar: el tipo " + tipo + " no tiene capacidad declarada");
        return false;
    }
    // NO HAY GUARDA DE CLIP LLENO. Antes habia una aqui y se borro: con el arma
    // llena la R tiene que hacer una de las dos cosas de abajo, y si no hay cargador
    // equipado eso es la descarga, no "no pasa nada".

    // Que cargador tiene PUESTO este arma, y cuantas balas le quedan.
    //
    // Las balas son el clip, que es del juego: se leen, no se copian a ningun lado.
    // El id sale del registro del modulo porque el motor no distingue "sin cargador"
    // de "descargado": para el los dos son cero balas, y sin el id no hay manera de
    // saber que este arma tiene un cargador.
    var puestoId = getCargadorEnArma(slot);
    var enClip = Engine.slotClip(addr);

    // La 4: este arma tiene AL MENOS UN cargador que le sirve en el catalogo.
    //
    // Y son varios, no uno: la familia declara los que le sirven y la recarga elige
    // entre los que estan EQUIPADOS. Con un indice unico —el primer cargador de la
    // familia— el cargador de 15 quedaba inalcanzable en cuanto el de 8 estaba en la
    // ranura de adelante, y la variante de 15 no se podia alcanzar nunca.
    var candidatos = cargadoresDe(delMod.itemId);
    if (!candidatos.length) {
        log("[Weapons] recargar: " + delMod.itemId + " no tiene cargador en el catalogo");
        return false;
    }

    // La 5: la animacion se pregunta ANTES de mover un cargador, y va ACA y no
    // adentro de un camino porque los DOS la necesitan. Cambiar y descargar son la
    // misma animacion del motor; lo que cambia son las balas que mete, que en la
    // descarga son cero.
    //
    // Un arma sin anim no recarga nunca, y si movemos los cargadores primero no hay
    // manera de volver atras: mejor no hacer nada y que el cargador siga donde esta.
    var spec = Engine.reloadSpec(tipo);
    if (!spec) {
        log("[Weapons] recargar: el tipo " + tipo + " no tiene anim de recarga");
        return false;
    }

    var equipados = getCargadores();
    var elegido = -1;
    for (var i = 0; i < equipados.length; i++) {
        if (equipados[i].ammo > 0 && cargadorSirveA(equipados[i].id, delMod.itemId)) {
            elegido = i;
            break;
        }
    }
    // ---- EL CAMBIO
    //
    // Hay cargador equipado con balas: entra este, y el que estaba puesto sale.
    if (elegido >= 0) {
        var mag = equipados[elegido];

        // ---- LA CONVERSION DE VARIANTE, Y POR QUE VA ANTES DE NADA
        //
        // El cargador que entra define la capacidad del arma, y la capacidad con el
        // silenciador defines la VARIANTE. O sea que el tipo del motor todavia no es
        // el de este cargador, y se cambia aca: un `give` del tipo nuevo, que el
        // motor usa para reemplazar el slot.
        //
        // Va antes de tocar el estado por dos razones, y las dos importan:
        //
        //   el clip   el give deja el arma en 0/0, asi que las balas se escriben
        //             DESPUES, con el cargador ya montado. Al reves, el arma queda
        //             con las balas del cargador viejo hasta el final de la recarga.
        //   el fallo   si el give no toma, el cargador sigue equipado y el que
        //             estaba puesto sigue puesto. Ningun cargador se gasto en un
        //             cambio de tipo que no se pudo hacer.
        //
        // Y el `n` del recorte se calcula con la capacidad NUEVA, no con la que
        // tiene el arma ahora: un cargador de 15 en un arma que era de 8 mete 15 y
        // no 8, porque para cuando se cuenta el arma ya es de 15.
        var tipoNuevo = tipoDe(delMod.itemId, CARGADORES[mag.id].clipSize,
                               silenciadorEnArma(slot));
        if (!tipoNuevo) {
            log("[Weapons] recargar: la familia " + delMod.itemId +
                " no tiene variante para (" + CARGADORES[mag.id].clipSize + ", " +
                (silenciadorEnArma(slot) ? "sil." : "pelada") +
                "). El cargador queda equipado y el arma como estaba.");
            return false;
        }

        var capNuevo = Engine.clipCapacityOf(tipoNuevo);
        if (capNuevo <= 0) {
            log("[Weapons] recargar: el tipo " + tipoNuevo +
                " no tiene capacidad declarada. El cargador queda equipado.");
            return false;
        }
        var n = Math.min(capNuevo, mag.ammo);

        // La animacion se pregunta para el tipo NUEVO cuando el tipo cambia: la
        // animacion de recarga es la del padre, y un 62 y un 61 no tienen la misma.
        // Preguntarla sobre el tipo viejo era correcto cuando el tipo no cambiaba.
        var specNuevo = (tipoNuevo === tipo) ? spec : Engine.reloadSpec(tipoNuevo);
        if (!specNuevo) {
            log("[Weapons] recargar: el tipo " + tipoNuevo +
                " no tiene anim de recarga. El cargador queda equipado.");
            return false;
        }

        var cambio = "";
        if (tipoNuevo !== tipo) {
            if (!_darTipo(char, addr, tipoNuevo, 0)) {
                log("[Weapons] recargar: el motor no acepto el tipo " + tipoNuevo +
                    ". El cargador queda equipado y el arma como estaba.");
                return false;
            }
            // El give dejo el arma en otro slot del ped: `addr` es puntero viejo.
            addr = Engine.slotAddress(ped, slot) || addr;
            cambio = " | " + nombreDeConfiguracion(delMod.itemId, tipo) +
                " -> " + nombreDeConfiguracion(delMod.itemId, tipoNuevo) +
                " (tipo " + tipoNuevo + ")";
        }

        // EL QUE ESTABA PUESTO SALE PRIMERO, o se pierde. Antes no salia nunca: el
        // clip viejo se ponia en cero y el cargador no existed en ningun lado del
        // modulo, asi que se perdia en cada recarga.
        var salio = "no habia ninguno puesto";
        if (puestoId) salio = "el " + puestoId + " (" + enClip + ") -> " +
            soltarCargador(puestoId, enClip);

        setCargador(elegido, null);
        setCargadorEnArma(slot, mag.id);
        _empezarRecarga(addr, tipoNuevo, n, specNuevo.ms);

        // El sonido NO se pide aca. Lo pide el .asi: el motor tiene
        // CAEWeaponAudioEntity::WeaponReload con la tabla de sonidos por tipo de arma, y
        // el .asi es el unico de los dos lados que sabe resolver el padre, que es lo que
        // el motor exige para elegir el sfx. El modulo solo pone RECARGANDO y el .asi ve
        // el estado y llama al motor.
        log("[Weapons] recargar: CAMBIO | " + mag.id + " de la ranura " + (elegido + 1) +
            " -> tipo " + tipoNuevo + " | " + n + "/" + capNuevo +
            " | " + salio + cambio +
            ((mag.ammo - n) > 0 ? " | " + (mag.ammo - n) + " balas sobrantes se pierden" : ""));
        return true;
    }

    // ---- LA DESCARGA
    //
    // No hay cargador equipado, pero hay uno puesto: ese sale y el arma queda
    // desnuda.
    //
    // CON LA MISMA ANIMACION que el cambio, y por eso con las mismas tres
    // escrituras: es la misma animacion del motor, solo que sin balas que meter. Se
    // llama _empezarRecarga con CERO, y el watchdog escribe cero en el clip cuando
    // vence el plazo: el arma queda 0/0 en READY exactamente igual que antes, pero
    // despues de sacar el cargador en vez de tele transportarlo.
    //
    // Y el sonido tambien va, porque lo pide el .asi con el estado, y el estado es el
    // mismo. Es lo que hace el juego cuando el jugador saca el cargador a mano, y
    // ademas es el aviso de que la R hizo algo.
    //
    // LA DESCARGA TAMBIEN CAMBIA DE VARIANTE, y es la mitad de la que se espera.
    // Sacar el cargador deja el arma desnuda, y desnuda es la capacidad BASE de la
    // familia: un 62 con cargador de 15 vuelve a ser el 63 al descargar. No hacerlo
    // dejaba un arma de 15 balas en la mano sin cargador, que es exactamente el
    // estado que el modulo dice que no existe.
    if (puestoId) {
        var tipoDesnudo = tipoDe(delMod.itemId, _clipPelado(delMod.itemId),
                                 silenciadorEnArma(slot));
        if (!tipoDesnudo) {
            log("[Weapons] recargar: la familia " + delMod.itemId +
                " no tiene variante base. El cargador sigue puesto.");
            return false;
        }

        var animDesnudo = spec;
        if (tipoDesnudo !== tipo) {
            animDesnudo = Engine.reloadSpec(tipoDesnudo);
            if (!animDesnudo) {
                log("[Weapons] recargar: el tipo " + tipoDesnudo +
                    " no tiene anim de recarga. El cargador sigue puesto.");
                return false;
            }
        }

        // EL GIVE VA PRIMERO, y el por que es el orden inverso al del CAMBIO:
        //
        // el give pone el clip en 0, asi que las balas del cargador que sale ya
        // estan leidas —`enClip` se leyo al principio de la funcion— y no hay que
        // volver a preguntarlas.
        //
        // Y si el give NO toma, el cargador sigue PUESTO y el arma sigue como
        // estaba. Al reves —soltar el cargador y despues fallar el give— quedaba un
        // arma desnuda CON balas en el motor y sin cargador en el registro, que es
        // el estado que el header de este archivo dice que no puede existir: la
        // proxima recarga no tendria nada que sacar de ella.
        var cambioDesnudo = "";
        if (tipoDesnudo !== tipo) {
            if (!_darTipo(char, addr, tipoDesnudo, 0)) {
                log("[Weapons] recargar: el motor no acepto el tipo " + tipoDesnudo +
                    ". El cargador sigue puesto y el arma queda como estaba.");
                return false;
            }
            addr = Engine.slotAddress(ped, slot) || addr;
            cambioDesnudo = " | " + nombreDeConfiguracion(delMod.itemId, tipo) +
                " -> " + nombreDeConfiguracion(delMod.itemId, tipoDesnudo) +
                " (tipo " + tipoDesnudo + ")";
        }

        var donde = soltarCargador(puestoId, enClip);
        setCargadorEnArma(slot, null);
        _empezarRecarga(addr, tipoDesnudo, 0, animDesnudo.ms);

        log("[Weapons] recargar: DESCARGA | " + puestoId + " (" + enClip +
            " balas) -> " + donde + " | el arma queda desnuda, con la anim del cambio" +
            cambioDesnudo);
        return true;
    }

    // ---- NO HAY CARGADOR NI EQUIPADO NI PUESTO
    //
    // No hay nada que gastar y nada que sacar: avisar y no tocar nada.
    showTextBox(t(equipados.length ? "WPN_NOMAG" : "WPN_NOMAG_EQUIPADO"));
    log("[Weapons] recargar: no hay " + magId + " equipado (" +
        equipados.length + " cargadores equipados) y este arma no tiene ninguno puesto");
    return false;
}

// LA RECARGA
// ---------------------------------------------------------------------------
// Tres escrituras y un pendiente:
//
//   m_nTimeForNextShot = ahora + GetWeaponReloadTime(del animgroup)
//   m_nState           = RECARGANDO
//   clip = total = 0
//
// Que es lo mismo que escribe el mod "Reload Mod" (fuente en
// cleo\Reload Mod Fixed.txt), que a su vez es lo mismo que hace el motor en
// CWeapon::Fire, 0x73FA20: dispara, y si el cargador quedo vacio y hay reserva,
// pone RECARGANDO y el plazo del animgroup.
//
// LO QUE SE PROBO Y SE DESCARTO
// ---------------------------------------------------------------------------
// La variante de "dejar que el motor la termine" —m_nAmmoTotal = las balas y no
// tocar el clip, esperando que el motor cierre con clip += total— se probo el
// 02/10/2026 y NO funciona: la animacion arranca (esa parte si la hace el motor) pero
// el arma no termina de recargar. Por eso el modulo mueve las balas el.
//
// Y el sonido, que era el motivo original de esa variante, tampoco sale de ahi. El
// motor no tiene una operacion "recargar" a la que llamar: la recarga ES parte del
// disparo (0x73FA20). El sonido de recarga del juego vive en un despachador por
// tipo (CAEWeaponAudioEntity::WeaponReload, tabla en 0x503838) al que no se llega
// desde un arma de tipo 60..79 con una recarga escrita a mano. Por eso el sonido lo
// pone el mod con sus dos archivos, en audio.js.
//
// LO QUE NO HACEMOS
// ---------------------------------------------------------------------------
// No escribimos m_nAmmoInClip con las balas antes de tiempo: el arma se veria llena
// durante la animacion. El watchdog las escribe cuando el plazo vence, que es lo que
// hace el arma gastandose y despues apareciendo.
//
// El guard de municion no molesta: saltea el arma mientras el estado sea
// RECARGANDO (ammo.js), y cuando el watchdog escribe el par ya viene bien.
function _empezarRecarga(addr, tipo, n, ms) {
    var hasta = Engine.timerNow() + ms;
    Engine.setSlotNextShotTime(addr, hasta);
    Engine.setSlotClip(addr, 0);
    Engine.setSlotTotal(addr, 0);
    Engine.setSlotState(addr, Engine.WEAPONSTATE_RELOADING);
    _pendiente = { addr: addr, tipo: tipo, balas: n, hasta: hasta };
}

// El watchdog. Corre por frame mientras hay una recarga pendiente, y escribe las
// balas cuando el plazo vencie.
//
// POR QUE NO ESPERAMOS A QUE EL MOTOR TERMINE
// ---------------------------------------------------------------------------
// Porque no las pone. El motor cierra la recarga y moves el total al clip, y el
// total esta en cero: "esperar a que el motor termine" es esperar a que el arma
// quede vacia. El plazo es lo unico que el motor si cumple, asi que el plazo es lo
// que se mira.
//
// Y si el estado dejo de ser RECARGANDO antes de tiempo —el motor corto la
// animacion— el pendiente se descarta en vez de escribir: escribir sobre un arma
// que el jugador ya volvio a usar es peor que dejar el cargador consumido.
function _watchdogRecarga() {
    var p = _pendiente;
    if (!p) return;

    var state = Engine.slotState(p.addr);
    if (state !== Engine.WEAPONSTATE_RELOADING && Engine.timerNow() < p.hasta) {
        _pendiente = null;
        return;
    }
    if (Engine.timerNow() < p.hasta) return;

    Engine.setSlotClip(p.addr, p.balas);
    Engine.setSlotTotal(p.addr, p.balas);
    Engine.setSlotState(p.addr, Engine.WEAPONSTATE_READY);
    _pendiente = null;
}

// ---------------------------------------------------------------------------
// LO QUE LA UI PREGUNTA
// ---------------------------------------------------------------------------
// Las equipadas, con la municion leida del ped en vivo.
//
// "En vivo" y no del registro porque la municion no esta en el registro: la tiene
// el juego. La fila de la UI tiene que decir cuantas balas quedan ahora, no
// cuantas quedaban cuando se unequipo.
export function getEquipadas() {
    var char = Engine.playerChar();
    var ped = char ? Engine.pedPointer(char) : 0;
    var out = [];

    var entries = getEntries();
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var def = defDeFamilia(e.id);
        if (!def) continue;

        // TODO lo que la fila afirma sale del PED, no del modulo. Y el tipo que se
        // muestra es el que el ped TIENE, no el que el estado derivaria.
        //
        // La diferencia importa cuando los dos no coinciden, y es el caso que el
        // jugador no puede ver: la fila mostrando la variante del modulo con el
        // modelo de otra en la mano es una mentira que el HUD contradice a la vista.
        // Mostrando el tipo real, el HUD y la mochila dicen lo mismo siempre, y el
        // desajuste queda como lo que es: un problema visible, no un dato
        // misterioso.
        var addr = Engine.slotAddress(ped, def.slot);
        var tipoReal = addr ? Engine.slotType(addr) : 0;
        var delMod = tipoReal ? familiaDeTipo(tipoReal) : null;

        out.push({
            id: e.id,
            slot: e.slot,
            salud: e.salud,
            ammo: addr ? Engine.slotClip(addr) : 0,
            cap: tipoReal ? Engine.clipCapacityOf(tipoReal) : 0,
            cargador: getCargadorEnArma(e.slot),
            silenciador: e.silenciador,
            // Lo que el modulo cree, y `null` cuando coincide con el ped. La UI lo
            // usa para avisar que hay que reconciliar, no para mostrar una variante
            // que el motor no tiene.
            tipoEsperado: _tipoDeConfiguracion(e.slot) || null,
            tipo: tipoReal,
            configuracion: nombreDeConfiguracion(e.id, tipoReal),
            enLaMano: !!(delMod && delMod.itemId === e.id)
        });
    }
    return out;
}

// Los cargadores equipados, con las balas que tienen guardadas.
//
// `ammo` sale del REGISTRO y no del juego: un cargador equipado no esta en el
// inventario, asi que el modulo es el dueno de su municion. Es al reves del arma,
// que si esta en el ped.
export function getCargadoresEquipados() {
    var lista = getCargadores();
    var out = [];
    for (var i = 0; i < lista.length; i++) {
        out.push({
            id: lista[i].id,
            indice: lista[i].indice,
            ammo: lista[i].ammo || 0,
            cap: capacidadDeItem(lista[i].id)
        });
    }
    return out;
}

// La capacidad que le ve el motor a un item del mod. La UI la usa para pintar
// "N/cap" en la fila del arma equipada, que es el unico lugar donde el denominador
// es el del motor y no el declarado.
//
// Y para un ARMA hay que dizer de QUE TIPO: la capacidad es de la VARIANTE, y un
// item de arma ya no tiene un tipo propio. Con la familia sola no hay respuesta, y
// devolver 0 seria la respuesta de "no declarada". Quien la llama para un arma
// tiene el tipo del arma en la mano —`getEquipadas` lo tiene— y lo pasa.
export function capacidadDeItem(itemId, tipo) {
    var f = defDeFamilia(itemId);
    if (f) return tipo ? Engine.clipCapacityOf(tipo) : 0;
    var mag = defDeCargador(itemId);
    return mag ? mag.clipSize : 0;
}

// Las entradas del registro cuyo arma el ped NO tiene. El numero, no la lista: lo
// usa el init para avisar, y no hay nada que hacer con el salvo avisar.
//
// Y la pregunta es por SLOT y por FAMILIA, no por tipo: con el tipo derivado, "el
// ped tiene ESTA variante" no es la pregunta. "El ped tiene ALGUNA variante de
// esta familia en este slot" si, y es la que evita dar por perdida un arma que esta
// en la mano con otra configuracion puesta.
function _entradasHuerfanas(char) {
    if (!char) return 0;
    var ped = Engine.pedPointer(char);
    if (!ped) return 0;
    var n = 0;
    var entries = getEntries();
    for (var i = 0; i < entries.length; i++) {
        var def = defDeFamilia(entries[i].id);
        if (!def) { n++; continue; }
        var addr = Engine.slotAddress(ped, def.slot);
        var tipo = addr ? Engine.slotType(addr) : 0;
        var delMod = tipo ? familiaDeTipo(tipo) : null;
        if (!delMod || delMod.itemId !== entries[i].id) n++;
    }
    return n;
}

// ---------------------------------------------------------------------------
// ANDAMIAJE DE PRUEBA, Y SE SACA CUANDO LA PRUEBA CIERRE
// ---------------------------------------------------------------------------
// El .asi da de alta los tipos 60..66 en su DllMain y el dealer todavia no los
// vende, asi que sin esto no hay forma de tener un arma GSIS en la mano.
//
// Con UNA familia hay que dar las cuatro piezas que producen las cuatro variantes,
// y no cuatro armas: el arma es una, y lo que cambia son los cargadores y el
// silenciador. Por eso la lista es de items sueltos y el `equipar` es uno solo.
//
// Y el orden importa para poder probar sin pensar: se da el cargador de 15 y el
// silenciador DEPRIMERO, asi que al equipar y recargar el arma ya sale en la
// variante mas completa (el 61) y de ahi se baja.
function _darArmaDePrueba() {
    var char = Engine.playerChar();
    if (!char) return;

    var id = DEBUG_ITEM_ARMA;
    if (!defDeFamilia(id)) {
        log("[Weapons] prueba: el catalogo no tiene " + id);
        return;
    }

    // Un cargador por capacidad. VACIOS, y no con las balas que traen de fabrica.
    //
    // El dealer los entrega llenos y el ciclo de la recarga hay que probarlo
    // tambien asi, pero lo que es NUEVO en el sistema es el camino de llenar desde
    // la caja, y para llegar a un cargador vacio habria que gastar municion real
    // disparando. Con un cargador en cero y una caja de 50, el ciclo entero se ve
    // de una sentada: llenar, recargar, disparar, vaciar, llenar.
    //
    // 50 balas y no mas: dan para varias vueltas, y el tope de 50 por fila ya se
    // ve en la mochila —tres filas de 50, 50 y 20 si se pide mas.
    var mags = cargadoresDe(id);
    for (var i = 0; i < mags.length; i++) {
        query(ITEMS_STORE_MAGAZINE, { id: mags[i], ammo: 0 });
    }
    // El silenciador suelto, que es como lo compra el jugador.
    var silId = DEBUG_ITEM_SILENCIADOR;
    if (defDeSilenciador(silId)) query(ITEMS_STORE_ACCESSORY, { id: silId });

    var balas = balasDe(id);
    var dadas = [];
    for (var b = 0; b < balas.length; b++) {
        if (query(ITEMS_STORE_AMMO, { id: balas[b], n: DEBUG_CANTIDAD_BALAS })) {
            dadas.push(balas[b]);
        }
    }

    query(ITEMS_STORE_WEAPON, { id: id, salud: 100, ammo: 0 });

    equipar(id);
    var fam = defDeFamilia(id);
    var addr = Engine.slotAddress(Engine.pedPointer(char), fam.slot);
    log("[Weapons] prueba: " + id + " desnuda (tipo " + Engine.slotType(addr) + "), " +
        mags.length + " cargador(es) VACIOS (" + mags.join(", ") + "), " +
        (dadas.length ? dadas.join(", ") + " x" + DEBUG_CANTIDAD_BALAS : "sin balas") +
        " y " + silId + " en el inventario.");
    log("[Weapons] prueba: Llená un cargador con el boton de la fila, ponelo en una ranura y " +
        "apretá la R para recargar (ahi cambia de variante); montá el silenciador con su boton.");
}

var DEBUG_ITEM_ARMA = "colt45";
var DEBUG_ITEM_SILENCIADOR = "suppressor";

// Cuantas balas deja el debug.
//
// 100, y no 50, para que se vea el tope en accion: son DOS filas de 50 y no una de
// 100. Los dos cargadores de 8 y 15 se llenan y sobra, asi que el ciclo se puede
// probar varias veces antes de que se acaben.
var DEBUG_CANTIDAD_BALAS = 100;