// GSIS - Index
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Index - Punto de entrada: registry + loop
// ============================================================================

import { initSaveManager, saveGame, getActiveSlot, _invalidateCache } from "./IronSyndicate/core/gsis_SaveManager.js";
import { TIMERS } from "./IronSyndicate/core/gsis_Config.js";
import { initL10n, t } from "./IronSyndicate/core/gsis_L10n.js";
import { initAll, updateAll, getModules } from "./IronSyndicate/core/gsis_ModuleRegistry.js";

// Efecto: cada módulo se auto-registra al importarse
// Orden de imports = orden de update por frame
import "./IronSyndicate/modules/gsis_Spawner.js";
import "./IronSyndicate/modules/gsis_EngineLock.js";
import "./IronSyndicate/modules/gsis_Trunk.js";
import "./IronSyndicate/modules/gsis_Vehicles.js";
import "./IronSyndicate/modules/gsis_Documents.js";
import "./IronSyndicate/modules/gsis_Bag.js";
import "./IronSyndicate/modules/inventory/index.js";
import "./IronSyndicate/modules/gsis_PropertyModule.js";
import "./IronSyndicate/modules/gsis_Actors.js";
import "./IronSyndicate/modules/gsis_ActorAnims.js";
import "./IronSyndicate/modules/gsis_Dialogue.js";
import "./IronSyndicate/modules/gsis_Characters.js";
import "./IronSyndicate/modules/gsis_WeaponDealer.js";
import "./IronSyndicate/modules/gsis_DealerPickup.js";
import "./IronSyndicate/modules/gsis_WeaponSeller.js";
// El bridge va aca, y no en cualquier lado: tiene que leer los flags de
// visibilidad de este frame (los menus de esfera ya decididos por sus modulos),
// asi que va despues de los modulos que los calculan (Trunk / WeaponDealer /
// DealerPickup / WeaponSeller) y antes de FireButton, que depende de Items.
import "./IronSyndicate/modules/ui/index.js";

// NO hay modulo de armas. Modules/weapons/ se borro entero, con el registro de
// equipping, las variantes con weaponType propio, los cargadores instanciados y el
// reconciliador que los comparaba con el save del juego. Y en su lugar no hay un
// import, porque un import a un archivo que no existe es un modulo que no arranca.
//
// El hueco que deja, y que es lo unico que hay que saber:
//
//   FUE        equipar, desequipar, montar y sacar accesorios, cambiar el cargador
//              con la R, la animacion de recarga y el reconciliador por frame
//   DEJO       los comandos inv:equip / inv:unequip / inv:mount / inv:unmount /
//              inv:belt:off, la franjita de ARMAS y CARGADORES equipados en el
//              inventario, el cinturon de cargadores, y las cuatro filas de la
//              tabla de armas con sus categorias y sus precios
//   SIGUE      el boton de disparo de gsis_FireButton.js, que es del juego y no
//              del mod: GTA sigue dando sus propias armas por su cuenta
//
// Y lo que NO se borro, porque no era del sistema de armas: el dealer y el vendedor
// siguen siendo modulos, con su esfera, su menu y su carrito, y no tienen mercaderia.
// Ver los headers de gsis_WeaponDealer.js y gsis_WeaponSeller.js.
import "./IronSyndicate/modules/gsis_FireButton.js";

log("========Grove Street Iron Syndicate=========");

initL10n();
initSaveManager();
initAll();

var mods = getModules();
log("[GSIS] Modulos registrados: " + mods.length);
for (var i = 0; i < mods.length; i++) {
    log("  - " + mods[i].name);
}

var _frameCount = 0;
var SAVE_EVERY_FRAMES = TIMERS.AUTO_SAVE_FRAMES; // ~5 minutos a 60fps
var _lastAreaId = -1;

while (true) {
    wait(0);
    _invalidateCache();
    updateAll(Date.now());

    // Auto-save al entrar a interior
    try {
        var p = new Player(0);
        var c = p.getChar();
        var areaId = c.getAreaVisible();
        if (_lastAreaId === 0 && areaId !== 0) {
            saveGame(getActiveSlot());
            showTextBox(t("SAVEINT"));
        }
        _lastAreaId = areaId;
    } catch (e) { }

    _frameCount++;
    if (_frameCount >= SAVE_EVERY_FRAMES) {
        _frameCount = 0;
        saveGame(getActiveSlot());
        showTextBox(t("SAVEAUT"));
    }
}
