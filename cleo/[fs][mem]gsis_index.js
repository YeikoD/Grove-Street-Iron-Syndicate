// ============================================================================
// GSIS Index - Punto de entrada: registry + loop
// ============================================================================

import { initSaveManager, saveGame, getActiveSlot, _invalidateCache } from "./IronSyndicate/core/gsis_SaveManager.js";
import { TIMERS } from "./IronSyndicate/core/gsis_Config.js";
import { initL10n, t } from "./IronSyndicate/core/gsis_L10n.js";
import { initAll, updateAll, getModules } from "./IronSyndicate/core/gsis_ModuleRegistry.js";
import { isMenuVisible } from "./IronSyndicate/core/gsis_UIManager.js";
import { isDealerMenuVisible } from "./IronSyndicate/modules/gsis_WeaponDealer.js";
import { isPickupMenuVisible } from "./IronSyndicate/modules/gsis_DealerPickup.js";
import { isSellMenuVisible } from "./IronSyndicate/modules/gsis_WeaponSeller.js";
import { isTrunkMenuVisible } from "./IronSyndicate/modules/gsis_Trunk.js";

// Efecto: cada módulo se auto-registra al importarse
// Orden de imports = orden de update por frame
import "./IronSyndicate/modules/gsis_Spawner.js";
import "./IronSyndicate/modules/gsis_EngineLock.js";
import "./IronSyndicate/modules/gsis_Trunk.js";
import "./IronSyndicate/modules/gsis_Vehicles.js";
import "./IronSyndicate/modules/gsis_Documents.js";
import "./IronSyndicate/modules/gsis_Bag.js";
import "./IronSyndicate/modules/gsis_Items.js";
import "./IronSyndicate/modules/gsis_PropertyModule.js";
import "./IronSyndicate/modules/gsis_Actors.js";
import "./IronSyndicate/modules/gsis_ActorAnims.js";
import "./IronSyndicate/modules/gsis_Dialogue.js";
import "./IronSyndicate/modules/gsis_Characters.js";
import "./IronSyndicate/modules/gsis_WeaponDealer.js";
import "./IronSyndicate/modules/gsis_DealerPickup.js";
import "./IronSyndicate/modules/gsis_WeaponSeller.js";
import "./IronSyndicate/core/gsis_UIManager.js";
import "./IronSyndicate/modules/gsis_Ballistic.js";
import "./IronSyndicate/modules/gsis_FireButton.js";
import "./IronSyndicate/ui/gsis_InventoryMenu.js";
import "./IronSyndicate/ui/gsis_PropertiesComponent.js";
import "./IronSyndicate/ui/gsis_VehiclesComponent.js";
import "./IronSyndicate/ui/gsis_TrunkMenu.js";
import "./IronSyndicate/ui/gsis_DealerMenu.js";
import "./IronSyndicate/ui/gsis_DealerPickupMenu.js";
import "./IronSyndicate/ui/gsis_SellMenu.js";

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

    // Control centralizado del cursor basado en visibilidad real de cada menú
    if (isMenuVisible() || isDealerMenuVisible() || isPickupMenuVisible() || isSellMenuVisible() || isTrunkMenuVisible()) {
        ImGui.SetCursorVisible(true);
    } else {
        ImGui.SetCursorVisible(false);
    }

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
