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
export var ITEMS_TAKE_WEAPON = "items:takeWeapon";
export var ITEMS_STORE_WEAPON = "items:storeWeapon";
export var ITEMS_TAKE_MAGAZINE = "items:takeMagazine";