// GSIS - Notice
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// GSIS Notice - el mensaje de resultado que la pagina puede ver
//
// El feedback de una accion tiene dos destinos y antes solo tenia uno:
// showTextBox() dibuja abajo a la izquierda, DETRAS del panel, asi que con el
// menu abierto el jugador no ve ni una letra. Ese camino lo necesita el juego
// igual -el texto sale de las teclas, no del mouse-, asi que no se toca; lo que
// faltaba era el otro.
//
// Un aviso es de un solo uso: se escribe, viaja en el proximo snapshot, y se
// borra. Si no se borrara, el mismo "no cabe" volveria a salir cada 400ms y la
// pagina no tendria forma de saber que es algo nuevo.
//
// El texto va YA TRADUCIDO (viene de t()) y con los codigos de color del juego
// (~r~ rojo, ~g~ verde). La pagina saca los codigos y saca el tono del prefijo,
// asi que el mod no tiene que decidir como se ve: lo decide la hoja de estilo.
//
// Depende de: nada
// ============================================================================

var _notice = null;

// txt: el texto de t(), tal cual.
export function setNotice(txt) {
    if (txt) _notice = txt;
}

export function hasNotice() {
    return _notice !== null;
}

// Lee y borra en la misma llamada. El que arma el snapshot es el unico que
// llama, y lo hace una vez por push: por eso puede consumirlo.
export function takeNotice() {
    var n = _notice;
    _notice = null;
    return n;
}

// Para los avisos que no se quieren mostrar (un comando duplicado, una accion
// que no apply). Sin esto el mensaje viejo seguiria en la pagina.
export function clearNotice() {
    _notice = null;
}
