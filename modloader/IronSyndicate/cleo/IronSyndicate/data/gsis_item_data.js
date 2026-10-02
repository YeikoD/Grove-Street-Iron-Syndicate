// GSIS - Item Data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// No importa NADA. Antes importaba `getWeaponByItemId` de data/gsis_weapon_data.js
// para que isInstanced() supiera si un arma era instanciada, y ese archivo se borro
// con el sistema de armas entero. Hoy el catalogo es una tabla plana y todas las
// preguntas se responden mirando ITEMS: ver isInstanced().

// GSIS Item Data - Catalogo de items (pesos en kg/unidad)
// Fuente: docs/gsis_INVENTORY.md
//
// EL CATALOGO NO LLEVA SALUD. La salud es estado de una INSTANCIA, no de un
// tipo: todas las unidades nacen a SALUD_MAX y cada una se desgasta por su
// cuenta. Ponerla aca (ITEMS[id].salud) la volveria un default por tipo, que
// es otra cosa — dos chatarras con distinta salud son el mismo
// ITEMS["scrap_metal"] — y ese default no podria expresar una instancia
// gastada mientras el resto del stack esta nueva.
//
// SALUD_MAX vive aca y no en Config porque no es un ajuste del juego: es la
// escala del dato. Config es para lo que se tunea (MISC.MAX_INVENTORY_WEIGHT).
// El clamp tambien va aca, junto a la escala que define: los dos son la misma
// regla y basta una fuente.
export var SALUD_MAX = 100;

export function clampSalud(v) {
    if (v === undefined || v === null) return SALUD_MAX;
    var n = Math.round(Number(v));
    if (!isFinite(n)) return SALUD_MAX;  // no es numero: queda nueva, no se inventa
    if (n < 0) return 0;
    if (n > SALUD_MAX) return SALUD_MAX;
    return n;
}

export var ITEMS = {
    // Materias primas
    //
    // ESTE CATALOGO ESTA VACIO DE ARMAS A PROPOSITO.
    //
    // El mod tuvo un sistema de armas completo —familias, accesorios, cargadores
    // instanciados, variantes con weaponType propio— y se borro entero. Con el se
    // fueron 17 armas, 19 cargadores, el silenciador y los ocho materiales de
    // armeria, y lo que queda es esta unica fila.
    //
    // Los materiales de armeria se fueron con las armas porque no se usaban para
    // nada solo: eran la entrada de un ensamblaje que no llego a existir, y sin
    // armas no hay que ensamblar. Un catalogo de piezas sueltas sin ninguna que
    // las consuma es contenido muerto que el jugador ve en la mochila y no puede
    // usar.
    //
    // Que quede UNA fila y no cero es lo que mantiene vivos el inventario, el baul,
    // la UI y la economia: los cuatro necesitan al menos un item que mover, y con
    // el catalogo vacio addItem() devuelve false siempre y ninguna pantalla tiene
    // filas que dibujar. Ver "POR QUE QUEDA UNA FILA" en el pie de este archivo.
    "scrap_metal":   { name: "Chatarra",        weight: 0.5, type: "material" }
};

export function getItemDef(id) {
    return ITEMS[id] || null;  // Retorna definicion del item o null
}

export function getItemName(id) {
    var def = ITEMS[id];
    return def ? def.name : id;  // Retorna nombre del item o el ID
}

export function getItemWeight(id) {
    var def = ITEMS[id];
    return def ? def.weight : 0;  // Retorna peso del item o 0
}

export function getItemType(id) {
    var def = ITEMS[id];
    return def ? def.type : "material";  // Retorna tipo del item o default
}

// isInstanced — true si el item NO se apila: cada unidad es una fila con su
// propio estado.
//
// CON EL SISTEMA DE ARMAS BORRADO, NADA ES INSTANCIADO: el unico item del
// catalogo es chatarra, que se apila.
//
// El predicado queda, y la respuesta es siempre false, porque hay tres
// consumidores reales que lo preguntan y ninguno de los tres puede dejar de
// hacerlo sin reescribirse:
//
//   inventory/state.js   _splitStacks, al cargar una partida vieja
//   inventory/logic.js   addItem y removeItem, al agregar y al sacar
//   gsis_Trunk.js        _cuentaDe, al medir un baul
//   gsis_WeaponSeller.js idem
//
// Los cuatro hacen `isInstanced(id) ? 1 : qty`, y con la respuesta en false toman
// la rama de apilable, que es la unica que existe. Borrar la funcion obligaria a
// cambiar los cuatro en el mismo commit, y el valor de ese cambio es cero: se
// reemplaza una pregunta con la constante que ya contestaba.
//
// Que quede la FUNCION y no un false escrito en los cuatro sitios es lo que
// permite que el catalogo vuelva a tener items instanciados sin tener que
// acordarse de los cuatro: se cambia esta linea y los cuatro vuelven a funcionar.
//
// Vive en la capa de datos y no en gsis_Items.js porque NO es una regla de
// guardado: es una pregunta del catalogo —"¿esta entrada se cuenta de a uno?"—
// y la responden tanto el modulo (que guarda una fila por unidad) como la fila
// de la tabla (que tiene que decir "instanciado" y no "1 unidad" para un arma,
// y al reves para una sola chatarra). gsis_Items.js la re-exporta para los que
// ya la importaban de ahi; los dos caminos son el mismo codigo.
//
// El que la consulta tiene que ser el mismo en todas partes porque de eso
// depende que las cosas se multipliquen o no: el baul la usa para saber si "3"
// son tres filas o tres unidades de un apilado, y el modulo para saber si una
// fila con qty > 1 hay que partirla.
export function isInstanced(id) {
    var def = ITEMS[id];
    if (!def) return false;  // id fuera de catalogo: no hay nada que contar
    return def.type === "magazine" || def.instanced === true;
}

// ============================================================================
// POR QUE QUEDA UNA FILA Y NO CERO
// ============================================================================
// La respuesta corta: porque el inventario, el baul, la UI y la economia existen,
// y los cuatro necesitan al menos un item que mover.
//
// Con ITEMS vacio, `addItem(id, qty)` devuelve false en su primera linea —
// `if (!ITEMS[id]) return false` — y no hay forma de que el jugador obtenga nada
// por el camino normal. Encima de eso, sin filas el snapshot del inventario
// devuelve `rows: []`, la pagina dibuja una tabla vacia, el baul rechaza todo lo
// que se le quiera meter y el peso total nunca pasa de cero.
//
// Chatarra cumple las dos funciones: es apilable, asi que ejercita el camino de
// los stacks, y es lo unico que se puede tener, asi que el inventario tiene algo
// que mostrar y algo que pesar.
//
// Y es honesta: si manana vuelve el sistema de armas, la fila que falta es
// `scrap_metal` mas lo que venga, y el resto del mod no cambia. Lo que cambio con
// el borrado fue el CATALOGO, no el inventario.
// ============================================================================

// No hay getMagazineDisplayName. Antes el nombre del cargador llevaba el estado
// pegado ("Cargador 9mm - Cal: 1"): la salud vive en su propia columna
// (celdaSalud, UI/app.js) y en el tooltip de la fila (tipFor, gsis_ItemRow.js).
// Un nombre con estado dentro se desincroniza del dato —el mismo cargador se
// llama distinto segun cuando se lea— y la fila y su tooltip tienen que decir
// lo mismo. El nombre es el nombre: getItemName.
