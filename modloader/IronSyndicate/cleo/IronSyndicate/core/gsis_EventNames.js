// GSIS - EventNames
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Los NOMBRES de los eventos que cruzan de un modulo a otro. Y nada mas: ni una
// funcion, ni un estado, ni una importacion.
//
// ============================================================================
// POR QUE EXISTE
// ============================================================================
// Un nombre de evento es un string, y un string mal escrito es la peor clase de
// bug que hay en un bus: el handler no se ejecuta nunca, no tira, y el que
// manda se queda esperando una respuesta que no llega. El sintoma es un
// `undefined` o un `false` en un lugar donde deberia haber un objeto, tres
// archivos mas alla, sin nada que apunte al error.
//
// Un import de simbolo convierte ese string en algo que el runtime verifica. Y
// poner el nombre en un archivo que los DOS modulos importan lo convierte en algo
// que ambos tienen por construccion.
//
// LA ALTERNATIVA, Y POR QUE NO SE USO
// ------------------------------------
// Que cada modulo declare sus propios nombres y el otro los importe del modulo:
// weapons/logic.js haciendo `import { ITEMS_TAKE_WEAPON } from "../inventory/events.js"`.
//
// Funciona, y es la primera version que se considero. Es un import DIRECTO
// entre los dos modulos, que es justo lo que el corte de imports prohibe: se
// cambia el archivo que hay que mover cuando uno de los dos cambia de lugar, y un
// modulo termina importando el `events.js` del otro solo por un string, que es lo
// peor que puede pasar: un acoplamiento que no se ve en la logica y que aparece
// como `undefined` en runtime.
//
// Este archivo es la tercera via: no es un modulo (no se registra, no tiene
// init, no habla con nadie), es una tabla de strings. Los dos modulos lo importan
// y ninguno importa al otro.
//
// ============================================================================
// QUE NAMES VAN ACA Y CUALES NO
// ============================================================================
// Solo los que DOS modulos tienen que acordar. Un evento que solo escucha su
// dueño se declara en el archivo del dueño (weapons/events.js, inventory/
// events.js) y no aparece aca.
//
// La razon de la diferencia: este archivo es el punto donde se nota que un nombre
// es un CONTRATO. Un nombre que necesita dos firmas es un contrato; uno que no, es
// un detalle de implementacion. Y mezclar los dos hace que este archivo crezca
// con cada evento que se emite, y un archivo que crece con cada evento deja de
// ser un contrato y pasa a ser un tablero.
// ============================================================================

// ---------------------------------------------------------------------------
// weapons -> inventory
// ---------------------------------------------------------------------------
// Los declara weapons porque weapons es el que los USA, y los atiende
// inventory/events.js. Ver weapons/logic.js (equipar, recargar) y
// weapons/reconcile.js (adoptar un arma del ped).

// Saca 1 instancia de arma del inventario y responde su estado
// { hasMag, ammo, salud, attachments }. attachments en namespace de INVENTARIO.
export var ITEMS_TAKE_WEAPON = "items:takeWeapon";

// Guarda 1 instancia de arma con su estado. Responde { ok } o null si no cabe.
//
// `magazine` es opcional y es un cargador QUE ESTABA MONTADO en el arma: { id, ammo }
// en namespace de INVENTARIO. Cuando viene, el arma se guarda SIN ese cargador y el
// cargador vuelve a ser un objeto propio, con las balas que tenia.
//
// Donde se pone, en este orden, y el orden ES la regla:
//
//   1. si el cinturon tiene casilla libre Y el cargador tiene balas -> al Cinturon.
//   2. si no -> al inventario.
//
// Y en los dos casos NUNCA se consume. Un cargador vacio tampoco: va al inventario, que
// es donde un cargador sin balas tiene sentido, y ocupa una casilla de la mochila pero
// no una del cinturon.
//
// Si el arma entra pero el cargador no se puede guardar en ningun lado, NO se guarda
// el arma: responde null y weapons re-equipa. Guardar el arma y perder el cargador es
// perder un item, que es la peor falla de un inventario.
//
// El motivo de que el Cinturon este primero: un cargador con balas es MUNICION, y la
// municion va en el cinturon para estar a mano. Un cargador vacio no es municion, asi
// que no gasta una casilla de cinturon que un cargador lleno necesita.
//
// Namespace de INVENTARIO en los dos ids, como todos los de esta seccion.
export var ITEMS_STORE_WEAPON = "items:storeWeapon";

// Saca un cargador del cinturon y deja el MONTADO en su casilla. Responde
// { ammo, magId }. Recibe una LISTA de magIds porque un arma puede tener mas de
// un cargador.
//
// "el montado" incluye al cargador de FABRICA del arma, sin excepcion: cuando el
// que entra es el de fabrica, el arma vuelve a su configuracion base, y esa
// configuracion ES "tengo el cargador de fabrica puesto". O sea que tambien se
// consume del cinturon. Por eso la operacion es una sola y no tiene dos ramas:
// uno entra al arma y el que estaba sale a la casilla de la que entro.
//
// NO RECIBE `deFabrica`. Hubo un flag que decia si el que entra era de fabrica,
// para que el handler no lo gastara. Con la invariante de arriba el flag era
// redundante y su rama duplicaba MUNICION: dejaba el cargador en el cinturon con
// sus balas y despues pasaba esas mismas balas al arma.
export var ITEMS_SWAP_MAGAZINE = "items:swapMagazine";

// El cargador montado pasa al inventario. Responde { ammo } o null si no cabe.
export var ITEMS_EXTRACT_MAGAZINE = "items:extractMagazine";

// Saca UN accesorio suelto del inventario para MONTARLO en un arma, y responde
// { item } con la fila que se llevo, o null si no habia.
//
// Existe por lo que hace weapons/logic.js al equipar con una configuracion pedida:
// montar un accesorio tiene que CONSUMIRLO, o seria un accesorio regalado. Y
// "consumir" no puede ser un removeItem() de weapons hacia inventory, porque eso
// seria un import directo entre los dos modulos —el corte que este archivo
// existe para hacer posible—.
//
// El que responde devuelve la FILA, no un id, y eso es lo que permite devolverla
// intacta si el motor despues rechaza el arma. Un removeItem que solo devuelve
// un boolean obliga a inventar la fila otra vez, y esa fila lleva el ammo del
// cargador: reconstruirla con `makeMagazineInstance(id, 0)` seria devolver un
// cargador vacio que el jugador tenia lleno.
export var ITEMS_TAKE_ATTACHMENT = "items:takeAttachment";

// El camino de vuelta de ITEMS_TAKE_ATTACHMENT. Recibe la fila tal cual la
// devolvio el otro, y la mete tal cual. Un { id, ammo } seria el mismo
// problema de antes en espejo.
export var ITEMS_STORE_ATTACHMENT = "items:storeAttachment";

// ---------------------------------------------------------------------------
// inventory -> weapons
// ---------------------------------------------------------------------------
// La capacidad DECLARADA de un item, o 0 si no tiene. Lo declara weapons porque
// weapons es el que tiene la tabla; lo PREGUNTA inventory/state.js.
//
// Es la unica pregunta en sentido inverso, y es la que existia como import
// directo: inventory/state.js importaba getClipSizeByItemId de
// data/gsis_weapon_data.js. Con esto, ninguno de los dos importa al otro.
export var WEAPONS_CAPACITY = "weapons:capacityOfItem";
