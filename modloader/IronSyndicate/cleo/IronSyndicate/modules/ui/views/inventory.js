// GSIS - UI: views/inventory
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El snapshot del inventario y el del catalogo: lo que la pagina dibuja. Un
// archivo por grupo de datos, no uno por panel. Cada snapshot() lee el estado de
// los modulos y devuelve algo que se pueda meter en JSON y cruzar la capa IPC.
// Nada de esto se dibuja: aca no hay DOM ni HTMLElement.
//
// Regla de la casa: esto importa de core/ y data/, y de modules/ SOLO a traves de
// sus funciones exportadas. No se toca GameState ni se muta nada — todos los
// snapshot son de lectura. Las acciones viven en ui/commands.js, que es quien
// decide si un comando de la pagina se acepta.
//
// Que el modulo de armas entre por getEquippedForUI() y no por una pregunta al bus
// es una excepcion consciousa y vale la pena decirla: esta vista es un CONSUMIDOR
// del modulo, igual que lo era antes de partirse en ui/, y la regla de no
// importarse entre modulos es para modulos que se hablan entre si. Una vista que
// dibuja el estado de otro modulo tiene que leerlo de alguna parte, y leerlo por
// la funcion publica es mas honesto que simular que no existe. Lo que NO hace es
// mutarlo: aca no se llama a ninguna funcion que escriba.
// ============================================================================

import { MISC } from "../../../core/gsis_Config.js";
import { getItems, getTotalWeight, getBelt } from "../../inventory/index.js";
import { getEquippedForUI } from "../../weapons/state.js";
import { getEquippedAmmo } from "../../weapons/logic.js";
import { itemRow } from "./itemRow.js";

var MAX_WEIGHT = MISC.MAX_INVENTORY_WEIGHT;

// ============================================================================
// INVENTARIO
// ============================================================================
//
// Lo estatico del catalogo (iconos, bandas, peso maximo) se fue a
// views/catalog.js, que es su propio archivo porque viaja con una frecuencia
// distinta: se manda UNA vez al abrir el menu, y el inventario cada 400ms. Un
// archivo con las dos cosas obliga a que quien manda uno pense en el throttle del
// otro.
//
// ---------------------------------------------------------------- INVENTARIO --
//
// La fila en si (itemRow, ammoCell, valueCell, tipFor) vive en views/itemRow.js:
// la usan tambien el baul, el retiro y el resto de las pantallas de items, y una
// copia por pantalla divergen calladas. Aca queda solo lo que es del inventario.

// Armas equipadas y cargadores al cinturon, como filas MAS del inventario.
//
// Razon de que existan aca: el mod saca lo equipado de items[] al equiparlo
// (equipMagToBelt hace splice, equipWeapon pide items:takeWeapon) y por eso no
// pesa —getTotalWeight() solo suma items[]. El efecto secundario es que
// desaparecer de la lista en cuanto lo equipabas, y eso se leia como perder el
// item. Se arman con itemRow() para que salgan con la MISMA forma que el resto:
// la pagina no los distingue por estructura, solo por el flag equipado.
//
// ranura dice donde esta ("arma" / "cinturon") y slot es el indice, y los dos
// hacen falta para devolverlo: unequipWeapon(slot) para el arma,
// unequipBeltMag(index) para el cargador.
//
// El cargador DENTRO de un arma no sale como fila, y es lo que se busca. No esta ni
// en items[] ni en el cinturon: lo tiene la lista de accesorios del registro. Se ve
// en `attachments` de la fila, que es la CONFIGURACION completa del arma, y no
// como un item suelto: asi la pagina puede decir "colt45 + suppressor + cargador
// de 15" en una fila, que es lo que el jugador tiene, en vez de tres filas que no
// existen.
function equipadasSnap() {
    var out = [];

    // getEquippedForUI() y no getEquipped(): la diferencia es `hasMag`, que sale
    // DERIVADO de la lista de accesorios y no esta guardado. La UI lo necesita
    // para distinguir un arma descargada de un arma sin cargador, y esa pregunta
    // tiene respuesta exacta con la lista; guardarla seria volver a tener dos
    // fuentes para la misma cosa.
    var eq = getEquippedForUI();
    for (var slot in eq) {
        if (!eq[slot]) continue;
        // El registro no guarda el ammo, asi que se lee del ped. null si no se
        // pudo leer, y null es lo que ammoCell necesita para NO invente un
        // cargador lleno: esVivo desactiva el fallback.
        var live = getEquippedAmmo(slot);
        // `salud` viene del registro. `hasMag` viene derivado, y antes no viajaba:
        // la fila no podia distinguir un arma descargada de un cargador vacio
        // montado -las dos salian "0/17"-; ahora ademas lo dice el tooltip.
        //
        // Y `family`, `attachments` y `otros` se pasan TAL CUAL. Los tres son lo
        // que la pagina necesita del arma: los dos primeros son la
        // representacion de la configuracion —el weaponType no viaja, y sin ellos
        // la fila de un arma con silenciador seria indistinguible de la de una
        // pelada—, y el tercero le dice si hay un accesorio que se pueda quitar.
        //
        // `otros` se agrega DESPUES de itemRow, no antes: itemRow solo deja pasar
        // `family` y `attachments` de la instancia (ver views/itemRow.js), y meterlo
        // por ahi seria enseñarle a la fila compartida una clave que solo le
        // importa a la vista del inventario. Se escribe en la fila ya armada, que
        // es donde viven las otras tres marcas de ranura.
        var w = itemRow({
            id: eq[slot].id,
            family: eq[slot].family,
            attachments: eq[slot].attachments,
            qty: 1,
            ammo: live == null ? null : String(live),
            salud: eq[slot].salud,
            hasMag: eq[slot].hasMag
        }, true);
        w.equipado = true;
        w.ranura = "arma";
        w.slot = parseInt(slot, 10);
        w.otros = (eq[slot].otros || []).slice();
        out.push(w);
    }

    var belt = getBelt();
    for (var i = 0; i < belt.length; i++) {
        if (!belt[i]) continue;
        var m = itemRow({
            id: belt[i].id,
            qty: 1,
            ammo: belt[i].ammo,
            salud: belt[i].salud
        });
        m.equipado = true;
        m.ranura = "cinturon";
        m.slot = i;
        out.push(m);
    }

    return out;
}

// El snapshot del inventario son DOS claves: las filas y el peso.
//
// Lo que se saco, y por que: maxWeight es estatico y va en el catalogo; y
// money / belt / equipped no los leia nadie. Se pagaban en cada push —unos 200
// chars por snapshot, un tercio de lo que viajaba— y la pagina los descartaba al
// primer asignar. La franja de equipo, si algún dia la dibuja la pagina, los
// vuelve a pedir; el dinero de cada pantalla lo lleva su propio snapshot, que
// sabe de que fuente talking es (getDirtyMoney en el inventario, el storeScore
// nativo en armeria y trueque).
export function snapInventory() {
    var items = getItems();
    var rows = [];
    for (var i = 0; i < items.length; i++) {
        rows.push(itemRow(items[i]));
    }
    // Lo equipado va PRIMERO y no en una clave aparte: la pagina dibuja una sola
    // lista y armanda las bandas filtrando por cat, asi que el orden dentro de
    // rows es el orden dentro de la banda. Concatenando lo equipado adelante,
    // el arma aparece en cabeza de ARMAS y el cargador en cabeza de CARGADORES,
    // que es donde el jugador mira primero. Ver equipadasSnap().
    rows = equipadasSnap().concat(rows);
    return {
        weight: Math.round(getTotalWeight() * 100) / 100,
        rows: rows
    };
}
