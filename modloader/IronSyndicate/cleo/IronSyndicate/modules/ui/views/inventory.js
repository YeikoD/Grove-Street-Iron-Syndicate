// GSIS - UI: views/inventory
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El snapshot del inventario: lo que la pagina dibuja. Un archivo por grupo de
// datos, no uno por panel. Cada snapshot() lee el estado de los modulos y devuelve
// algo que se pueda meter en JSON y cruzar la capa IPC. Nada de esto se dibuja:
// aca no hay DOM ni HTMLElement.
//
// Regla de la casa: esto importa de core/ y data/, y de modules/ SOLO a traves de
// sus funciones exportadas. No se toca GameState ni se muta nada — todos los
// snapshot son de lectura. Las acciones viven en ui/commands.js, que es quien
// decide si un comando de la pagina se acepta.
// ============================================================================

import { MISC } from "../../../core/gsis_Config.js";
import { getItems, getTotalWeight } from "../../inventory/index.js";
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
// ---------------------------------------------------------------------------
// LO QUE SE FUE CON EL SISTEMA DE ARMAS
// ---------------------------------------------------------------------------
// Antes este snapshot armaba DOS listas mas y las concatenaba adelante de las
// filas del inventario:
//
//   equipadasSnap()   las armas equipadas, desde GameState.Ballistic.equipped
//                     via getEquippedForUI(), con la municion leida del ped en
//                     vivo via getEquippedAmmo()
//   el cinturon        los cargadores equipados, con getBelt()
//
// Las dos existen por una razon que ya no aplica. El mod saca lo equipado de
// items[] al equiparlo —`equipMagToBelt` hacia splice, `equipWeapon` pedia
// `items:takeWeapon`— y por eso no pesaba y por eso desaparecia de la lista. Las
// dos listas lo arman al frente para que el jugador no lo leyera como perder el
// item.
//
// Sin equipping, nada sale de items[], asi que las dos listas serian siempre
// vacias: `rows` ya es exactamente lo que hay. Y no se dejan como dos `[]` porque
// una lista vacia que se concatena al frente es ruido con forma de codigo.
//
// Que el snapshot siga siendo `{ weight, rows }` y no un objeto con dos listas
// mas es lo que hace que la pagina siga dibujando sin cambiar de forma: `rows` es
// la clave que ya leia.
// ============================================================================

// ---------------------------------------------------------------------------
// EL SNAPSHOT DEL INVENTARIO
// ---------------------------------------------------------------------------
// El snapshot del inventario son DOS claves: las filas y el peso.
//
// El maximo de peso se leia del config y se manda en el mismo snapshot, asi que no
// hace falta que la pagina lo escriba en ningun lado: lo recibe con los numeros.
//
// Las filas se arman con itemRow(), la MISMA fabrica que usan el baul, el retiro y
// el resto de las pantallas de items. Una fila es { id, cat, name, qty, ammo,
// salud, weight, value, tip } y ninguna pantalla arma la suya: dos copias de una
// fila divergen calladas, y la divergencia se ve como "el baul no muestra el
// valor" o "el retiro dibuja la salud de otra forma".
export function snapInventory() {
    var items = getItems();
    var rows = [];
    for (var i = 0; i < items.length; i++) {
        rows.push(itemRow(items[i]));
    }
    return {
        weight: Math.round(getTotalWeight() * 100) / 100,
        rows: rows
    };
}