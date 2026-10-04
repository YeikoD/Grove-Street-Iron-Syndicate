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
    // Un item apilable se guarda como UNA fila con `qty`. Un item instanciado se
    // guarda como UNA fila por unidad, y por eso necesita saber el tipo de cada
    // unidad: su municion y su salud. Ver isInstanced(), que es la pregunta.
    //
    // LAS ARMAS, UNA POR FAMILIA
    //
    // UNA sola Colt .45 en el catalogo. Que se vea pelada, con cargador de 15,
    // silenciada o silenciada con cargador de 15 NO son cuatro items: es la misma
    // arma con distinto accesorio. Las cuatro configuraciones son las `variantes`
    // de FAMILIAS (data/gsis_weapons.js), y el weaponType se deriva de los
    // accesorios con `tipoDe()`. El jugador nunca elige entre cuatro filas: elige
    // un cargador y un silenciador, y el arma cambia sola.
    //
    // LAS CUATRO VARIANTES TIENEN SU FILA EN gsis_weapons.dat, y las dos mitades
    // tienen que crecer juntas:
    //
    //   colt45                        tipo 63   63 22   346 2  8 -1
    //   colt45 + cargador de 15       tipo 62   62 22 15065 2 15 -1
    //   colt45 + silenciador          tipo 60   60 23   347 2  8 -1
    //   colt45 + sil. + cargador 15   tipo 61   61 23 15066 2 15 -1
    //
    // Y el cargador de cada capacidad tiene el MISMO clipSize que las filas que
    // selecciona: es la segunda copia del numero, y es la que `check-dat.mjs`
    // cruza.
    //
    // Un item de arma sin fila en el .dat es un arma que no se entrega nunca, y
    // una fila sin item es un tipo que el .asi registra al pedirlo y ocupa un
    // slot del rango 60..79 para siempre.
    "colt45":        { name: "Colt .45",           weight: 1.5, type: "weapon" },
    "mag_colt45":    { name: "Cargador Colt 45",  weight: 0.2, type: "magazine" },
    "mag_colt45_c15": { name: "Cargador Colt 45 Extended", weight: 0.25, type: "magazine" },

    // El silenciador se COMPRA suelto y se MONTA en el arma. No es una variante:
    // es la pieza que convierte una variante en la de al lado. Por eso es un item
    // y por eso el flag `silenciador` vive en la fila del arma.
    //
    // `instanced` porque se lleva UNO por fila, y no por una razon de diseno sino de
    // bookkeeping: `ITEMS_TAKE_ACCESSORY` saca la fila entera del id que se le pide,
    // asi que un silenciador apilable con cantidad 2 se llevaria los dos de un
    // montage. Con una fila por unidad, sacar uno y devolver uno son simetricos, que
    // es la misma propiedad por la que armas y cargadores son instanciados.
    "suppressor":    { name: "Silenciador",        weight: 0.1, type: "weapon_attachment", instanced: true },

    // Chatarra
    //
    // LO QUE NO HAY EN ESTE CATALOGO, Y POR QUE
    //
    // El mod tuvo un sistema de armas completo —familias, accesorios, cargadores
    // instanciados, variantes con weaponType propio— y se borro entero. Con el se
    // fueron 17 armas, 19 cargadores y los ocho materiales de armeria. Lo que
    // vuelve es la familia de la Colt .45 con sus accesorios: UNA arma, dos
    // cargadores y un silenciador, y las cuatro configuraciones salen de ahi.
    //
    // Los materiales de armeria se fueron porque eran la entrada de un ensamblaje
    // que no llego a existir: sin armas que los consuman, un catalogo de piezas
    // sueltas es contenido muerto que el jugador ve en la mochila y no puede usar.
    //
    // Que quede chatarra es lo que mantiene vivos el inventario, el baul, la UI y
    // la economia: los cuatro necesitan al menos un item APILABLE que mover, y con
    // un catalogo de solo instanciados no hay stack que ejercite esa rama. Ver
    // "POR QUE QUEDA UNA FILA" en el pie de este archivo.
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
// propio estado (su municion, su salud).
//
// LA RESPUESTA SALE DEL TIPO, y no de una fila por item:
//
//   weapon    un arma es una unidad con su municion y su desgaste
//   magazine  un cargador es una unidad con SUS balas, no un numero de unidades
//   material  se apila
//
// La version anterior de esta pregunta consultaba la tabla de armas por el id, y
// el arma era instanciada si la tabla tenia un weaponId para ese id. Con la tabla
// nueva el arma tiene SIEMPRE un weaponId, asi que la pregunta se respondio sola:
// es instanciada por ser un arma.
//
// Y la fila puede marcar `instanced: true` para un tipo que todavia no exista, que
// es la puerta de salida para un item instanciado de otra familia.
//
// Que el predicado viva en la capa de datos y no en el modulo de inventario es lo
// que hace que los cinco que lo preguntan (los dos del modulo de inventario, el
// baul, el vendedor y el retiro) compartan la misma respuesta. Si cada uno
// preguntara distinto, "instanciado" seria una palabra con cinco significados.
export function isInstanced(id) {
    var def = ITEMS[id];
    if (!def) return false;  // id fuera de catalogo: no hay nada que contar
    if (def.type === "weapon" || def.type === "magazine") return true;
    return def.instanced === true;
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
