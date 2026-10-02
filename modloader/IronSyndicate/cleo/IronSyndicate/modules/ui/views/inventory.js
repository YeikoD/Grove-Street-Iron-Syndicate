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
import { getEquipadas, capacidadDeItem } from "../../weapons/gsis_Weapons.js";
import { itemRow } from "./itemRow.js";

var MAX_WEIGHT = MISC.MAX_INVENTORY_WEIGHT;

// ============================================================================
// LO QUE SE FUE CON EL SISTEMA DE ARMAS Y LO QUE VOLVIO
// ============================================================================
// Antes este snapshot armaba DOS listas mas y las concatenaba adelante de las
// filas del inventario:
//
//   equipadasSnap()   las armas equipadas, con la municion leida del ped EN VIVO
//   el cinturon        los cargadores equipados
//
// La primera VOLVIO con el sistema nuevo, y por la misma razon: el mod saca el arma
// de items[] al equiparla, asi que sin esta fila el inventario pierde un item por
// el camino y el jugador lo lee como que el arma desaparecio.
//
// La segunda no: no hay cinturon. El cargador se carga directo del inventario con
// la R, y un cinturon seria una pantalla mas que rellenar para no cambiar nada.
//
// POR QUE VAN PRIMERO Y NO AL FINAL
// ---------------------------------------------------------------------------
// Porque `ordenarPorBanda` de la pagina (UI/app.js) agrupa por categoria y, dentro
// de la banda, respeta el ORDEN EN QUE LLEGO. Mandandolas primero, el arma
// equipada encabeza la banda "Armas" sin que la pagina tenga que saber que existe
// una lista de equipadas.
//
// LO QUE LE ANADE LA PAGINA A ESTAS FILAS
// ---------------------------------------------------------------------------
// Tres campos, y los tres los usa snapRow(): `equipado` (pinta la etiqueta
// "(Equipado)"), `ranura` (distingue arma de cinturon) y `slot`. El `weaponType` no
// viaja, ni disfrazado: es la representacion que ejecuta el motor y la pagina no
// tiene por que conocerla.

// Las filas del arma equipada, con lo que hay que mostrarle.
//
// La municion es "N/cap" y el denominador sale del MOTOR, que es la unica diferencia
// con una fila de la mochila: ahi el denominador es el declarado por el item, y aca
// es el que le escribio el .asi. Se lee de dos lugares distintos a proposito.
function equipadasSnap() {
    var equipadas = getEquipadas();
    var rows = [];
    for (var i = 0; i < equipadas.length; i++) {
        var e = equipadas[i];
        var row = itemRow({
            id: e.id,
            qty: 1,
            salud: e.salud,
            ammo: e.ammo
        });
        row.ammo = e.ammo + "/" + (e.cap || capacidadDeItem(e.id));
        row.equipado = true;
        row.ranura = "arma";
        row.slot = e.slot;
        rows.push(row);
    }
    return rows;
}

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
    var rows = equipadasSnap();
    for (var i = 0; i < items.length; i++) {
        rows.push(itemRow(items[i]));
    }
    return {
        weight: Math.round(getTotalWeight() * 100) / 100,
        rows: rows
    };
}
