// GSIS - UI: views/catalog
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Lo estatico que la pagina no puede deducir: el peso maximo, los iconos y las
// bandas de grupo.
//
// Un archivo propio, y no una funcion mas de views/inventory.js, por una razon
// de ENVIO: esto viaja una sola vez al abrir el menu, y el inventario cada 400ms.
// Un archivo con las dos cosas obliga a que quien manda uno tenga presente el
// throttle del otro, y el throttle es exactamente la clase de detalle que se
// pierde en un archivo grande.
//
// No depende de ningun modulo: sale entero de data/. Por eso se puede testear sin
// GTA, que es lo que hace check-ui-contract.mjs.
// ============================================================================

import { MISC } from "../../../core/gsis_Config.js";
import { ITEMS } from "../../../data/gsis_item_data.js";
import { WEB_ICONS, WEB_CAT_ORDER, WEB_CAT_LABELS } from "../../../data/gsis_web_data.js";

// Lo estatico que la pagina no puede deducir. Se manda una sola vez al abrir el
// menu, no en cada snapshot: son datos que no cambian, y mandarlos cada 400ms
// sumaria trozos a un canal con tope de 255 chars por evento.
export function snapCatalog() {
    return {
        maxWeight: MISC.MAX_INVENTORY_WEIGHT,
        icons: WEB_ICONS,
        cats: buildCats()
    };
}

// Las bandas de grupo, en el orden de WEB_CAT_ORDER. Los tipos no se inventan
// aca: salen de ITEMS. Si el catalogo tiene un tipo que WEB_CAT_ORDER no lista,
// se avisa en el log y la banda se cae al final, en vez de items sin agrupar.
var _catsChecked = false;
function buildCats() {
    var out = [];
    var known = {};

    for (var c = 0; c < WEB_CAT_ORDER.length; c++) {
        var key = WEB_CAT_ORDER[c];
        known[key] = true;
        out.push({ key: key, label: WEB_CAT_LABELS[key] || key });
    }

    // La comprobacion es una sola vez por sesion, no por llamada: es un error de
    // catalogo, no un evento, y si esta en el camino de cada push el aviso se
    // convierte en ruido.
    if (!_catsChecked) {
        _catsChecked = true;
        var missing = [];
        for (var id in ITEMS) {
            var t = ITEMS[id].type;
            if (t && !known[t]) {
                known[t] = true;
                missing.push(t);
            }
        }
        if (missing.length > 0) {
            log("[UI] Tipo de item sin banda en WEB_CAT_ORDER: " + missing.join(", ") +
                " — agregalo a data/gsis_web_data.js o esos items no se agrupan");
        }
    }

    return out;
}
