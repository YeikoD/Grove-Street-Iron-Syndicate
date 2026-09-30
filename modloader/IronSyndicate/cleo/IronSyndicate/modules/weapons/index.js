// GSIS - Weapons: index
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El arranque del modulo de armas: que se registre, que valide el catalogo, y
// el loop de cada frame.
//
//   state.js      donde vive la configuracion de las armas equipadas
//   logic.js      equipar, desequipar, montar, sacar, recargar
//   internal.js   el unico camino por el que un arma llega al ped
//   reconcile.js  que el ped y el registro digan lo mismo
//   models.js     que el modelo este cargado antes de dar el arma
//   events.js     los nombres de los eventos de armas
//
// ============================================================================
// LO QUE ESTE ARCHIVO HACIA ANTES Y HACE AHORA
// ============================================================================
// Antes era modules/gsis_Ballistic.js, 1816 lineas, y hacia de todo: el
// registro, las operaciones, el reconciliador, la carga de modelos, la anim de
// recarga con su watchdog, y las 3 respuestas distintas a "que weaponType tiene el
// ped". Esta es la version de esa linea, partida por responsabilidad.
//
// Un archivo por responsabilidad, y cada uno cabe en una frase:
//
//   state.js      donde esta la configuracion
//   logic.js      que se puede hacer con un arma
//   internal.js   como se le da un arma al motor
//   reconcile.js  que el motor y el registro coincidan
//   models.js     que el modelo este cargado
//   events.js     como se habla de las armas desde afuera
//
// ============================================================================
// EL INIT
// ============================================================================
// Tres cosas, y el orden importa:
//
//   1. el registro, con su forma nueva de 4 campos
//   2. el catalogo, validado contra la tabla de variantes
//   3. la cola de modelos propios, SOLO armada (la carga corre por frame)
//
// La migracion de saves NO esta aca. El registro cambio de 7 campos a 4, y un
// save viejo con `variantWeaponType` o `magId` necesita una traducion antes de que
// `resolveWeaponType` pueda trabajar con la lista de accesorios. Eso es de la fase
// de saves, y hasta que este aca un save viejo se comporta asi: el slot tiene
// `attachments`, se resuelve con eso, y los campos viejos sobran sin molestar.
import { register } from "../../core/gsis_ModuleRegistry.js";
import { registerModule, getModuleData, setModuleData } from "../../core/gsis_SaveManager.js";
import { KEYS } from "../../core/gsis_Config.js";
import { keyJustPressed } from "../../core/gsis_Input.js";
import * as Engine from "../../core/gsis_Engine.js";
import { validateWeapons, PLUGIN_TYPE_MIN, PLUGIN_TYPE_MAX } from "../../data/gsis_weapons.js";
import { clampSalud } from "../../data/gsis_item_data.js";
import { SAVE_KEY, getEquipped } from "./state.js";
import { tryReload } from "./logic.js";
import { reconcile, resetAvisos } from "./reconcile.js";
import { queueCustomModels, stepCustomModels } from "./models.js";

var _lastSlot = null;

register({
    // El nombre del modulo es "Weapons" y la clave del save es "Ballistic". No es
    // una contradiccion: el primero es para el registro de modulos (logs y orden
    // de update) y el segundo es la ruta dentro de GameState. Cambiar el segundo
    // es un rename de save, y va con la migracion de la fase de saves.
    name: "Weapons",

    init: function () {
        _lastSlot = null;
        resetAvisos();

        // El registro. equipped[slot] = { id, family, attachments, salud }.
        // `foreign` ya no existe: era el mapa de "armas de plugin que el mod no
        // conoce", y ahora el mod conoce todas las que declara weapons.js. Un
        // arma de un .asi que no este en el catalogo es del juego, y se deja como
        // esta.
        registerModule(SAVE_KEY, { equipped: {} });

        _normalizarSalud();

        // El catalogo contra la tabla de variantes. Lo que falla aca es un fallo de
        // esta fase: una familia sin variante base, un accesorio que no existe, un
        // padre que no es de vanilla. Todo eso lo agarra validateWeapons().
        _reportarCatalogo();

        // Los modelos propios, si estan prendidos. La cola se arma aca y la carga
        // corre de a un paso por frame desde update(), porque cargar en el init se
        // come el timeout de 2 segundos de CLEO+ y el mod no arranca.
        queueCustomModels();

        // Que camino de "dar el arma" esta activo. La conmutacion de remove+give
        // esta en internal.js; esta linea dice cual de los dos esta corriendo.
        log("[Weapons] camino de armado: " +
            (Engine.giveUsesNative() ? "GIVE_WEAPON_TO_CHAR (0x01B2)" : "p.giveWeapon()"));
    },

    update: function (now) {
        // 1. Un paso de la carga de modelos. Va PRIMERO y no al final a proposito:
        //    si el arma con modelo propio se da este mismo frame, el paso ya
        //    escribio el modelId y sale con el modelo correcto en vez de invisible.
        stepCustomModels();

        // 2. El ped contra el registro. Antes de la recarga y no despues: si el
        //    jugador pulso R en el frame en que el motor cambio el arma, la
        //    recarga tiene que ver el arma que quedo, no la que se fue.
        reconcile();

        // 3. La tecla R.
        if (keyJustPressed(KEYS.RELOAD)) tryReload();

        // 4. El cambio de slot. No hace nada todavia: el reconciliador ya se
        //    encargo de que el ped y el registro coincidan, y avisar de un cambio
        //    de slot seria log por frame. El estado queda para cuando haya algo
        //    que hacer con el.
        var cur = Engine.readCurrentWeapon();
        if (!cur) return;
        if (_lastSlot !== null && cur.slot === _lastSlot) return;
        _lastSlot = cur.slot;
    }
});

// ---------------------------------------------------------------------------
// INIT: helpers
// ---------------------------------------------------------------------------

// equipped[slot].salud no existia antes: los slots de un save viejo la tomaban a
// SALUD_MAX. Sin esto el registro queda con salud undefined y desequipar la manda
// al inventario en 100% por el default de addItem, que es el mismo numero pero por
// el camino corto y de rebote.
//
// Y NO se migra magId ni variantWeaponType aca: son la migracion de saves, y esta
// fase no la toca. Hasta que exista, sobran sin molestar.
function _normalizarSalud() {
    var data = getModuleData(SAVE_KEY);
    if (!data || !data.equipped) return;
    var cambio = false;
    for (var slot in data.equipped) {
        if (!Object.prototype.hasOwnProperty.call(data.equipped, slot)) continue;
        var entry = data.equipped[slot];
        if (!entry) continue;
        var s = clampSalud(entry.salud);
        if (entry.salud !== s) { entry.salud = s; cambio = true; }
    }
    if (cambio) setModuleData(SAVE_KEY, data);
}

function _reportarCatalogo() {
    var problemas = validateWeapons();
    for (var i = 0; i < problemas.length; i++) {
        log("[Weapons] ERROR de catalogo: " + problemas[i]);
    }
    if (!problemas.length) {
        var n = 0;
        for (var slot in getEquipped()) {
            if (Object.prototype.hasOwnProperty.call(getEquipped(), slot)) n++;
        }
        log("[Weapons] catalogo OK. Armas equipadas en el registro: " + n + ".");
    }
    // El rango de tipos. Que este libre es una PRECONDICION y no un dato: si
    // fastman92 limit adjuster se prende, 60 y 61 pasan a ser JETPACK y
    // BINOCULARS y 70..79 caen fuera de la tabla. Se avisa una vez al arrancar
    // porque es el tipo de cosa que se rompe a las tres semanas sin que nadie sepa
    // que paso.
    log("[Weapons] rango de tipos de plugin: " + PLUGIN_TYPE_MIN + ".." + PLUGIN_TYPE_MAX +
        ". Es libre SOLO con fastman92 limit adjuster apagado.");
}
