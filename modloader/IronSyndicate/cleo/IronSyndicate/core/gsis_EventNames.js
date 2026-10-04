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
// inventory/logic.js haciendo `import { ITEMS_TAKE_WEAPON } from "../weapons/events.js"`.
//
// Funciona, y es la primera version que se considero. Es un import DIRECTO entre
// los dos modulos, que es justo lo que el corte de imports prohibe: se cambia el
// archivo que hay que mover cuando uno de los dos cambia de lugar, y un modulo
// termina importando el `events.js` del otro solo por un string, que es lo peor
// que puede pasar: un acoplamiento que no se ve en la logica y que aparece
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
// dueno se declara en el archivo del dueno (`inventory/events.js`) y no aparece
// aca.
//
// La razon de la diferencia: este archivo es el punto donde se nota que un nombre
// es un CONTRATO. Un nombre que necesita dos firmas es un contrato; uno que no, es
// un detalle de implementacion. Y mezclar los dos hace que este archivo crezca
// con cada evento que se emite, y un archivo que crece con cada evento deja de
// ser un contrato y pasa a ser un tablero.
//
// ============================================================================
// POR QUE ESTE ARCHIVO VOLVIO A TENER NOMBRES
// ============================================================================
// Los siete nombres que declaraba eran TODOS del sistema de armas, y con el
// borrado no quedaba ninguno con dos firmas. Vuelven tres, y son tres porque el
// modulo de armas y el de inventario se tienen que hablar de tres operaciones:
//
//   items:takeWeapon     sacar UN arma del inventario, para equiparla
//   items:storeWeapon    devolverla, con la municion que tenia en la mano
//   items:takeMagazine   sacar UN cargador, para meterlo en el arma
//
// Los tres los emite modules/weapons/ y los atiende
// modules/inventory/events.js. Ninguno de los dos modulos importa al otro: se
// hablan por el bus, y estos nombres son el contrato.
//
// NO hay un `items:peekMagazine` ni un `items:countOf` porque no hacen falta. El
// modulo de armas necesita UN cargador, no saber cuantos hay: se lo pide el
// primero y el inventario responde, o responde null. Preguntar el contenido del
// inventario para despues pedirlo es una ventana en la que el estado cambio, y en
// un inventario que seVacía con una R y con un click a la vez no hay ventana que
// sobre.
//
// QUE NO SE HIZO
// -------------
// El archivo no se borro cuando se vacio. Es la tercera via de la regla que esta
// en su header, y la va a necesitar el proximo subsistema que tenga que hablarle
// a un modulo que no sea el suyo.
// ============================================================================

// weapons -> inventory
//
// Y POR QUE HAY CUATRO Y NO TRES: `items:storeMagazine` no existia porque un
// cargador no tenia por que volver nunca al inventario. Con los cargadores
// equipping, vuelve: el jugador saca uno de la ranura y lo guarda otra vez, con las
// balas que le quedaron.
//
// No se reusa `storeWeapon` para eso. Ese handler mete `salud`, y un cargador no
// tiene salud: por la misma razon que dos item con distinta forma de vida no
// comparten el mismo camino de vuelta, no comparten el mismo evento.
export var ITEMS_TAKE_WEAPON = "items:takeWeapon";
export var ITEMS_STORE_WEAPON = "items:storeWeapon";
export var ITEMS_TAKE_MAGAZINE = "items:takeMagazine";
export var ITEMS_STORE_MAGAZINE = "items:storeMagazine";

// UN ACCESORIO QUE SE MONTA EN EL ARMA
// ---------------------------------------------------------------------------
// El silenciador es la tercera forma de vida de una pieza, y no comparte evento con
// ninguna de las otras dos:
//
//   un arma      tiene `salud` y se equipa y desequipa
//   un cargador  tiene `ammo` y va a una ranura
//   un accesorio  no tiene ni `salud` ni `ammo`: se MONTA en el arma y a partir de
//                ahi lo que existe es un booleano en la fila del arma
//
// La fila que deja en la mochila es `{ id, qty }` y nada mas. Y `storeAccessory`
// CHEQUEA EL PESO y devuelve false si no entra, que es lo que permite que quien
// llama decida el orden de sus escrituras: si el silenciador no entra en la mochila,
// la operacion se rechaza entera antes de tocar el arma.
//
// Y no se reusa `storeMagazine` para eso. Ese handler escribe `ammo`, y un
// silenciador con `ammo: 0` es una fila que dice que tiene municion un item que no
// la tiene: el mismo argumento del comentario de arriba, aplicado a la otra mitad.
export var ITEMS_TAKE_ACCESSORY = "items:takeAccessory";
export var ITEMS_STORE_ACCESSORY = "items:storeAccessory";

// LA MUNICION DE UN CARGADOR DE LA MOCHILA, POR INDICE
// ---------------------------------------------------------------------------
// Los tres existen por la accion de RELLENAR, que mueve balas de un cargador a
// otro. Y los tres son POR INDICE, no por id, que es lo que hace falta:
//
//   magAmmo   { indice }            -> { id, ammo } o null
//   setMagAmmo{ indice, ammo }      -> true o false
//   magSource { id }                -> { indice, ammo } o null
//
// Por indice y no por id porque dos cargadores del mismo tipo pueden estar en la
// mochila a la vez —el vacio y el lleno, que es justamente el caso de rellenar— y
// "el primero que encuentre" no es el que el jugador leyo.
//
// Y `magSource` NO saca la fila: la devuelve. Si la sacara, las filas de abajo
// correrian un lugar y el indice del destino dejaria de apuntar a la fila
// correcta. Por eso rellenar lee, escribe y no mueve nada: mover filas es lo que
// rompe los indices.
export var ITEMS_MAG_AMMO = "items:magAmmo";
export var ITEMS_SET_MAG_AMMO = "items:setMagAmmo";
export var ITEMS_MAG_SOURCE = "items:magSource";