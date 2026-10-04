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
import {
    getEquipadas, getCargadoresEquipados, capacidadDeItem
} from "../../weapons/gsis_Weapons.js";
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
// Las dos VOLVIERON, y por el mismo motivo en las dos: el mod saca del inventario lo
// que esta equipado, asi que sin estas filas el inventario pierde un item por el
// camino y el jugador lo lee como que el item desaparecio.
//
// El cinturon se habia decidido NO hacerlo (el cargador se cargaba directo del
// inventario con la R). Volvio con los cargadores equipados: ahora son dos ranuras
// con un maximo, y el jugador tiene que verlas.
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
// "(Equipado)"), `ranura` (distingue arma de cargador) y `slot`. El `weaponType` no
// viaja, ni disfrazado: es la representacion que ejecuta el motor y la pagina no
// tiene por que conocerla.

// Las filas del arma equipada, con lo que hay que mostrarle.
//
// La municion es "N/cap" y las dos mitades salen del MOTOR: el numerador es el clip
// que hay ahora, y el denominador la capacidad que leyo el .asi. El modulo no copia
// la municion del arma a ningun lado —es del juego— asi que getEquipadas() la lee del
// ped en vivo y la fila muestra el numero real, no uno guardado.
//
// Y el cargador PUESTO viaja en `cargador`: sin el, la fila dice cuantos proyectiles
// quedan pero no de donde salieron, que es la pregunta que se hace el jugador cuando
// aprieta la R y no pasa nada.
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
        row.ammo = e.ammo + "/" + (e.cap || capacidadDeItem(e.id, e.tipo));
        row.equipado = true;
        row.ranura = "arma";
        row.slot = e.slot;
        if (e.cargador) row.cargador = e.cargador;

        // LA CONFIGURACION, Y POR QUE VIJA COMO DATO Y NO SE CALCULA ACA
        //
        // `configuracion` es el nombre de la variante que el PED tiene —"Colt .45
        // Silenced C15"— y `tipo` es el numero con el que el modulo lo ejecuto.
        //
        // Viaja desde el modulo y no se arma en la pagina porque el nombre tiene que
        // salir de la MISMA tabla que eligio el tipo. Si la pagina compusiera el
        // nombre con el cargador y el flag que ve en la foto, habria dos reglas para
        // decir que configuracion es, y el dia que no coincidan el inventario
        // llamaria "Colt .45" a un arma que el juego muestra con silenciador.
        //
        // Y `enLaMano` mas `tipoEsperado` es la unica forma de que la pagina
        // distinga "el arma es esta" de "el modulo cree que es esta otra". Cuando
        // no coinciden la fila lo dice, en vez de mostrar una configuracion que el
        // motor no tiene.
        row.configuracion = e.configuracion;
        row.tipo = e.tipo;
        row.enLaMano = e.enLaMano;
        row.tipoEsperado = e.tipoEsperado;
        row.silenciador = e.silenciador;

        rows.push(row);
    }
    return rows;
}

// Las filas de los cargadores equipados, una por ranura ocupada.
//
// `indice` viaja porque es lo que la pagina devuelve en el comando de quitar: la
// fila que ve el jugador es la ranura 2, y el modulo tiene que sacar la ranura 2. El
// numero de la ranura NO es el indice del vector por construccion: la ranura 1 es el
// indice 0, y el modulo es el que sabe la cuenta.
//
// Y el ammunition va con barra propia: el cargador no esta en el ped, asi que su
// municion sale del registro del modulo y no de memoria del juego.
//
// `puedeRellenar` es lo unico que la pagina necesita saber de la accion Rellenar, y
// es una comparacion entre dos numeros que el modulo ya tiene: la municion de la fila
// y la capacidad del item. Que la pagina no la calcule es que no pueda equivocarse
// con el mismo criterio que el modulo.
function cargadoresSnap() {
    var cargadores = getCargadoresEquipados();
    var rows = [];
    for (var i = 0; i < cargadores.length; i++) {
        var c = cargadores[i];
        var cap = c.cap || capacidadDeItem(c.id);
        var row = itemRow({ id: c.id, qty: 1, ammo: c.ammo });
        row.ammo = c.ammo + "/" + cap;
        row.equipado = true;
        row.ranura = "cargador";
        row.indice = c.indice;
        row.ranuraNro = c.indice + 1;
        row.puedeRellenar = (c.ammo || 0) < cap;
        rows.push(row);
    }
    return rows;
}

// Las filas de la mochila. Para un cargador se le agregan `indice` y `puedeRellenar`.
//
// `indice` es el de items[], y es lo que permite la accion Rellenar: sin el, el
// modulo tendria que buscar "un cargador" y con dos en la mochila no hay forma de
// saber cual de los dos leyo el jugador. Las demas filas no lo llevan porque ninguna
// otra accion lo necesita — Ellas van por id, que es unico para ellas.
function filasDeItems(items) {
    var rows = [];
    for (var i = 0; i < items.length; i++) {
        var row = itemRow(items[i]);
        if (row.cat === "magazine") {
            row.indice = i;
            row.puedeRellenar = (items[i].ammo || 0) < capacidadDeItem(row.id);
        }
        // El silenciador de un arma DE LA MOCHILA. Sin esto, una Colt con el
        // silenciador puesto sale en la lista como "Colt .45" y no hay forma de
        // saber que lleva el silenciador adentro hasta equiparla.
        //
        // Y no se compone el nombre completo aca —"Colt .45 silenciada"— porque el
        // nombre de la variante sale de la tabla que eligio el tipo, y un arma en la
        // mochila esta SIEMPRE desnuda: su nombre depende de si tiene cargador, y en
        // la mochila no tiene ninguno. Lo que la pagina puede afirmar sin inventar
        // nada es el flag, que es un dato de la fila.
        if (row.cat === "weapon") row.silenciador = !!items[i].silenciador;
        rows.push(row);
    }
    return rows;
}

// ---------------------------------------------------------------------------
// EL SNAPSHOT DEL INVENTARIO
// ---------------------------------------------------------------------------
// Las filas del inventario son CUATRO listas pegadas en este orden, y el orden es
// el unico que decide donde aparece cada cosa:
//
//   1. las armas equipadas     para que la banda "Armas" empiece con lo que llevas
//   2. los cargadores equipados idem, en la banda "Cargadores"
//   3. las filas del inventario
//
// El snapshot del inventario son DOS claves: las filas y el peso.
//
// El maximo de peso se leia del config y se manda en el mismo snapshot, asi que no
// hace falta que la pagina lo escriba en ningun lado: lo recibe con los numeros.
//
// Las filas se arman con itemRow(), la MISMA fabrica que usan el baul, el retiro y el
// resto de las pantallas de items. Una fila es { id, cat, name, qty, ammo,
// salud, weight, value, tip } y ninguna pantalla arma la suya: dos copias de una
// fila divergen calladas, y la divergencia se ve como "el baul no muestra el
// valor" o "el retiro dibuja la salud de otra forma".
export function snapInventory() {
    var items = getItems();
    var rows = equipadasSnap().concat(cargadoresSnap()).concat(filasDeItems(items));
    return {
        weight: Math.round(getTotalWeight() * 100) / 100,
        rows: rows
    };
}
