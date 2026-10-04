// GSIS - Weapons data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Que es un arma del mod y a que tipo del motor corresponde. TRES tablas y las
// funciones que las caminan, y nada mas:
//
//   FAMILIAS     itemId -> { nombre, slot, precio, peso, categoria, variantes[] }
//   CARGADORES   itemId -> { nombre, familias[], clipSize, precio, peso }
//   SILENCIADORES itemId -> { nombre, precio, peso }
//
// UNA FAMILIA, UN ITEM. Y EL TIPO SE DERIVA
// ---------------------------------------------------------------------------
// El jugador tiene UNA Colt .45 en la mochila, no cuatro. Que dispare como la
// pelada, como la C15, como la silenciada o como la silenciada con cargador de 15
// no es un item distinto: es la MISMA arma con distinto ACCESORIO.
//
//   el itemId        lo que el jugador tiene. Uno solo: "colt45"
//   el weaponType    lo que el motor ejecuta. DERIVADO, nunca guardado
//   los accesorios   lo que decide cual de los dos es. En el save
//
// Que el tipo se derive y no se declare es lo que hace que las cuatro
// configuracion se sientan como la misma arma: no hay cuatro filas en la mochila
// que chooses entre, hay una y el cambio pasa en la recarga.
//
// LA DERIVACION ES UNA COMPARACION DE DATOS, NO UN RESOLVER ESCRITO A MANO
// ---------------------------------------------------------------------------
// `tipoDe()` no tiene un `switch`: recorre `variantes` y devuelve la que coincide
// con (clip, silenciador). Agregar una configuracion es agregar UNA fila a
// `variantes`, no tocar una funcion.
//
// Y si una combinacion no tiene variante, `tipoDe` devuelve null y el que llama
// LOGUEA y NO cambia el tipo. Un arma que se queda como estaba con una linea en
// el log es un fallo visible; un arma que cambia a un tipo que el .asi no
// registro es un fallo invisible, que es la clase de bug que hay que evitar.
//
// ============================================================================
// LAS CUATRO FILAS DEL .dat, Y POR QUE ESTAN DUPLICADAS
// ============================================================================
// Las 4 son la fila de gsis_weapons.dat que lee el .asi, una por tipo:
//
//   63 22   346 2  8 -1     colt45                          pelada
//   62 22 15065 2 15 -1     colt45 + cargador de 15         C15
//   60 23   347 2  8 -1     colt45 + silenciador            silenciada
//   61 23 15066 2 15 -1     colt45 + silenciador + cargador 15
//
// Son DOS copias de un numero en dos lugares, y la duplicacion de datos de
// configuracion es exactamente la clase de bug que produjo el cargador de 15
// que terminaba en 8: dos copias, una regla de prioridad, y el valor equivocado
// visible en el arma.
//
// Se acepta por una razon concreta: el .dat lo lee el .asi en su DllMain, antes
// de que exista un solo script de CLEO, y el mod no abre archivos. No hay forma
// de que el mod lea esa fila sin duplicarla o sin agregar un archivo de config
// que las dos mitades lean.
//
// QUE PASA SI FALTA UNA DE LAS DOS MITADES
// ---------------------------------------------------------------------------
//   variante sin fila   el .asi no registro el tipo. El give no da nada, y el arma
//                       se queda como estaba. Por eso tipoDe() devuelve null en vez
//                       de un numero: la falta tiene que ser un null, no un tipo
//                       equivocado.
//   fila sin variante   el .asi registra el tipo y nadie lo pide nunca: se registra
//                       al pedirlo y ocupa un slot del rango 60..79 para siempre.
//
// Las dos mitades tienen que crecer JUNTAS. Agregar una configuracion es: una
// fila en el .dat y una entrada en `variantes`.
//
// QUE SE HACE CONTRA ESO
// ---------------------------------------------------------------------------
//   node check-dat.mjs   (tools/)
//
// Cruza las dos mitades y sale distinto de cero si un tipo no esta en las dos,
// si dos variantes declaran el mismo tipo, si una combinacion de (clip,
// silenciador) no tiene variante, o si el clip de la variante no coincide con el
// clip de la fila.
//
// LO QUE EL CHECK NO DICE, Y ES LA MITAD DEL PROBLEMA
// ---------------------------------------------------------------------------
// El check dice que la configuracion es coherente. No dice que el ARMA SE VEA,
// y esa diferencia es un bug entero: un .dat impecable cuyo `modelId` no esta
// cargado da un arma INVISIBLE, con el cargador, la animacion y el sonido
// correctos. MEDIDO el 03/10 con el 60 y el 61, modelo 347 de vanilla. Lo
// resolvio `PedirModelosVanilla()` en limiter.cpp, que pide el modelo de vanilla
// de cada tipo registrado mientras no este cargado.
//
// Que se vea se verifica en el log, no aca. Ver "COMO SE COMPRUEBA QUE UNA
// FILA NUEVA SIRVE" en el header de gsis_weapons.dat.
//
// ============================================================================
// LA CAPACIDAD NO ESTA ACA, Y ESA ES LA DIFERENCIA
// ============================================================================
// El cargador de 8 balas NO es lo que le cabe al arma: eso lo dice el motor, con
// Engine.clipCapacityOf(tipo), que pega en el hook de GET_WEAPONINFO y recibe la
// fila que escribio el .asi. Lo que dice `clipSize` en CARGADORES es cuantas balas
// APORTA un cargador de los que hay, que es un dato del item y no del arma.
//
// La diferencia importa porque las dos cosas no tienen por que ser iguales: un
// cargador de 5 para un arma de 8 es un item valido y el motor es el que dice que
// el arma entra de a 8.
//
// Y el `clip` de una VARIANTE es la tercera copia... que no esta: sale del .dat y
// se lee con `clipCapacityOf`. El `clip` que declara `variantes` es lo que se
// COMPARA contra el del motor, y por eso tiene que estar.
// ============================================================================

// ---------------------------------------------------------------------------
// FAMILIAS
// ---------------------------------------------------------------------------
// `variantes` esta en orden de menos a mas: la primera es la pelada, que es la
// que entra el item. El `nombre` de cada variante es lo que la UI muestra, y por
// eso existe: el jugador tiene que poder leer "Colt .45 silenciada" en la fila
// de su unequipped arma, no inferirlo.
//
// Y `clip` y `silenciador` son la CONDICION que selecciona la variante, no una
// descripcion. Son los dos datos que el save guarda del arma, y nada mas.
export var FAMILIAS = {
    "colt45": {
        nombre: "Colt .45",
        slot: 2,
        precio: 550,
        peso: 1.5,
        categoria: "Pistolas",
        variantes: [
            { nombre: "Colt .45",                 weaponType: 63, clip: 8,  silenciador: false },
            { nombre: "Colt .45 C15",             weaponType: 62, clip: 15, silenciador: false },
            { nombre: "Colt .45 Silenced",        weaponType: 60, clip: 8,  silenciador: true  },
            { nombre: "Colt .45 Silenced C15",    weaponType: 61, clip: 15, silenciador: true  }
        ]
    }
};

// Los cargadores. `clipSize` es lo que mete UN cargador de los que hay, y
// `familias` es la lista de familias a las que le sirve.
//
// POR QUE UNA LISTA Y NO UNA SOLA
// ----------------------------------------------------------------------------
// Un cargador no es de un arma: es de una CAPACIDAD. El de 8 le sirve a la Colt
// pelada y a la silenciada; el de 15 a la C15 y a la C15 silenciada. Con un solo
// `familia` habia que elegir entre cuatro cargadores para dos capacidades, y el
// jugador tenia que saber cual de los dos de 8 era el suyo.
//
// Y "cada cargador en su arma" no necesita una regla aparte: la recarga elige
// entre los cargadores EQUIPADOS cuyo `familias` incluye la familia del arma. Uno
// que no esta en la lista no se toca nunca; queda en su ranura esperando a un
// arma que si le sirva. Ver "LA 4" en modules/weapons/gsis_Weapons.js.
export var CARGADORES = {
    "mag_colt45": {
        nombre: "Cargador Colt 45",
        familias: ["colt45"],
        clipSize: 8,
        precio: 220,
        peso: 0.2
    },
    "mag_colt45_c15": {
        nombre: "Cargador Colt 45 Extended",
        familias: ["colt45"],
        clipSize: 15,
        precio: 250,
        peso: 0.25
    }
};

// Los silenciadores. A diferencia del cargador, esto NO va a una ranura de
// cargador equipado: se MONTA en el arma y se convierte en parte de ella. Por eso
// no tiene `clipSize` ni `familias`: el silenciador no cambia la capacidad, solo
// elige la mitad de las variantes.
//
// Y por eso su estado vive en la fila del arma y no en un registro aparte: un
// registro por slot no puede seguir al arma cuando vuelve a la mochila.
export var SILENCIADORES = {
    "suppressor": {
        nombre: "Silenciador",
        precio: 400,
        peso: 0.1
    }
};

// ---------------------------------------------------------------------------
// LA MUNICION SUELTA
// ---------------------------------------------------------------------------
// La bala es lo que se consume. El cargador es una PIEZA con SU municion, y hasta
// ahora la municion de un cargador solo venía de otro cargador del mismo id —un
// trasvase entre cargadores, que no deja entrar balas nuevas al sistema y obliga
// a tirar el sobrante—. La bala suelta cierra el circulo: la caja es la UNICA
// fuente, y el cargador se llena desde la caja.
//
// LA MISMA CLAVE `familias` QUE LOS CARGADORES, A PROPOSITO
// ---------------------------------------------------------------------------
// "Que calibre sirve esta bala" y "que familias le sirven a este cargador" son la
// misma pregunta con dos palabras distintas, y contestarla con dos campos seria dos
// fuentes de verdad: un cargador 9mm y una caja .45 podrian coexistir sin que nada
// los casara y el jugador tendria municion que no le sirve a nada. Con `familias` en
// los dos, el casamiento es el MISMO codigo —`cargadorSirveA` y `balaSirveA`— y
// agregar una familia nueva obliga a las dos mitades juntas, que es el mismo
// contrato que ya tienen FAMILIAS y CARGADORES.
//
// Y el `.45` del id es el calibre REAL de la Colt .45. El motor llama "9mm" a su
// tipo de municion interno y por eso los cargadores se ven con mag_9mm.png; el
// calibre del mundo es .45 y las dos cosas viven en capas distintas.
//
// `maxStack` NO esta aca: es una propiedad del CATALOGO de items y vive en ITEMS
// (data/gsis_item_data.js), que es donde vive el peso y el nombre.
export var MUNICION = {
    "bala_45": {
        nombre: "Balas .45",
        familias: ["colt45"]
    }
};

// Si una bala le sirve a una familia. La contraparte exacta de cargadorSirveA.
export function balaSirveA(balaId, familiaId) {
    var def = MUNICION[balaId];
    if (!def || !familiaId) return false;
    return def.familias.indexOf(familiaId) !== -1;
}

// Las balas que le sirven a una familia, en el orden de la tabla.
//
// Devuelve una LISTA y no un id aunque hoy haya una sola: la misma razon que
// `cargadoresDe`. Una familia con dos calibres es un caso que el diseno ya tiene
// que admitir, y un `return MUNICION[primero].id` la haria imposible de agregar
// despues sin tocar tres lugares mas.
export function balasDe(familiaId) {
    var out = [];
    for (var id in MUNICION) {
        if (Object.prototype.hasOwnProperty.call(MUNICION, id) &&
            MUNICION[id].familias.indexOf(familiaId) !== -1) {
            out.push(id);
        }
    }
    return out;
}

// Si el jugador tiene balas de una familia en el inventario, y cuantas.
//
// La respuesta es un NUMERO y no un booleano porque la UI la usa para pintar
// cuanto falta en el cargador: "10 balas" y "sin balas" son dos filas distintas de
// la tabla, y un booleano obliga a la pagina a contar por su cuenta con el mismo
// criterio que el modulo —que es la razon por la que la fila del cargador la
// calcula el modulo y no la pagina (ver `puedeRellenar` en ui/views/inventory.js).
//
// Y DEVUELVE -1, no 0, cuando no hay. La diferencia importa: 0 balas es un estado
// ("tiene la caja vacia") y -1 es una ausencia ("no tiene esa municion"), y el
// segundo tiene que poder desactivar el boton de Rellenar aunque la otra fila de
// balas que el jugador tiene para otra familia le de algo que dibujar.
export function balasDeFamilia(items, familiaId) {
    var total = 0;
    var hay = false;
    for (var i = 0; i < items.length; i++) {
        if (!balaSirveA(items[i].id, familiaId)) continue;
        hay = true;
        total += items[i].qty || 0;
    }
    return hay ? total : -1;
}

// La definicion de la familia de un itemId, o null si el item no es un arma del
// mod. El nombre dice familia y no arma porque UN item es UN arma y todas sus
// configuraciones; `defDeArma` sugeria que cada item era un arma distinta.
export function defDeFamilia(itemId) {
    var def = FAMILIAS[itemId];
    return def || null;
}

// La definicion de un cargador, o null si el item no es un cargador.
export function defDeCargador(itemId) {
    var def = CARGADORES[itemId];
    return def || null;
}

// La definicion de un silenciador, o null.
export function defDeSilenciador(itemId) {
    var def = SILENCIADORES[itemId];
    return def || null;
}

// ---------------------------------------------------------------------------
// LA DERIVACION
// ---------------------------------------------------------------------------

// El weaponType de una familia con (clip, silenciador) dados, o null si esa
// combinacion no existe.
//
// El null es la parte importante del contrato: el que llama tiene que poder
// distinguir "no hay variante para esto" de "la variante es el 62". Con un numero
// en ambos casos, un .dat incompleto se ve como un arma que anda.
export function tipoDe(familiaId, clip, silenciador) {
    var f = FAMILIAS[familiaId];
    if (!f) return null;
    var sil = !!silenciador;
    for (var i = 0; i < f.variantes.length; i++) {
        var v = f.variantes[i];
        if (v.clip === clip && !!v.silenciador === sil) return v.weaponType;
    }
    return null;
}

// La variante de una familia con un weaponType dado, o null.
export function varianteDeTipo(familiaId, tipo) {
    var f = FAMILIAS[familiaId];
    if (!f) return null;
    for (var i = 0; i < f.variantes.length; i++) {
        if (f.variantes[i].weaponType === tipo) return f.variantes[i];
    }
    return null;
}

// El nombre que la UI muestra para una configuracion. El de la variante si se
// conoce; el de la familia si no, que es la respuesta honesta para "el arma esta
// en una configuracion que el catalogo no tiene".
export function nombreDeConfiguracion(familiaId, tipo) {
    var v = varianteDeTipo(familiaId, tipo);
    return v ? v.nombre : (FAMILIAS[familiaId] ? FAMILIAS[familiaId].nombre : familiaId);
}

// La familia a la que pertenece un weaponType del motor, o null.
//
// El camino inverso de `defDeFamilia`: el modulo lo necesita cuando lo que tiene
// es el arma EN LA MANO —que es un tipo del motor, no un id de inventario— y
// necesita saber de que item es para preguntarle por sus cargadores.
export function familiaDeTipo(tipo) {
    for (var id in FAMILIAS) {
        if (!Object.prototype.hasOwnProperty.call(FAMILIAS, id)) continue;
        if (varianteDeTipo(id, tipo)) {
            return { itemId: id, def: FAMILIAS[id], variante: varianteDeTipo(id, tipo) };
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// LOS CARGADORES DE UNA FAMILIA
// ---------------------------------------------------------------------------

// Si un cargador le sirve a una familia.
export function cargadorSirveA(magId, familiaId) {
    var def = CARGADORES[magId];
    if (!def || !familiaId) return false;
    return def.familias.indexOf(familiaId) !== -1;
}

// Los cargadores que le sirven a una familia, en el orden de la tabla.
//
// Es una LISTA y no un indice porque una familia puede tener mas de una
// capacidad: la recarga elige entre los que estan EQUIPADOS, y el jugador
// decide cual monta. Devolver uno solo —el primero de la tabla— dejaba al
// cargador de 15 inalcanzable en cuanto el de 8 estaba en la ranura de adelante.
export function cargadoresDe(familiaId) {
    var out = [];
    for (var id in CARGADORES) {
        if (Object.prototype.hasOwnProperty.call(CARGADORES, id) &&
            CARGADORES[id].familias.indexOf(familiaId) !== -1) {
            out.push(id);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// LAS DOS PREGUNTAS QUE HACE LA UI
// ---------------------------------------------------------------------------

// La capacidad que DECLARA el catalogo para un item, o 0 si no declara ninguna.
//
// Y es 0 para una FAMILIA a proposito: la capacidad de un arma la dice el motor,
// con Engine.clipCapacityOf, y copiarla aca seria la segunda copia que produjo el
// cargador de 15 que terminaba en 8. Lo que se declara aca es lo que es del ITEM:
// un cargador de 5 para un arma de 8 trae 5 balas.
//
// La usa la fila de la UI (ammoCell en ui/views/itemRow.js) para pintar "N/cap" en
// los cargadores. En un arma devuelve 0 y la fila muestra solo "N": la capacidad
// exacta del arma esta en el HUD del juego y en la fila del arma equipada, que si
// la arma y si la muestra.
export function capacidadDeclarada(itemId) {
    var cargador = CARGADORES[itemId];
    return cargador ? (cargador.clipSize || 0) : 0;
}

// Cuantas balas lleva un item NUEVO.
//
// Y la respuesta son dos reglas, no una:
//
//   un cargador   las suyas, las de CARGADORES. Es lo unico de un cargador que no
//                 lo decide el motor: el motor dice cuanto le entra al ARMA, y
//                 esto dice cuanto trae la PIEZA.
//   un arma       ninguna. El arma se entrega desnuda: sin cargador hasta que el
//                 jugador recargue con uno.
//
// Lo usa el alta de filas instanciadas (addItem en inventory/logic.js).
export function municionDeFabrica(itemId) {
    var cargador = CARGADORES[itemId];
    if (cargador) return cargador.clipSize || 0;
    return 0;
}

// El slot del motor de un item. Si el item es un arma, el suyo; si es un
// cargador o un silenciador, el de la familia a la que le sirve. La UI lo usa
// para el `ranura` de la fila equipada.
export function slotDe(itemId) {
    var f = defDeFamilia(itemId);
    if (f) return f.slot;
    var cargador = defDeCargador(itemId);
    if (cargador && cargador.familias.length) {
        var deFamilia = FAMILIAS[cargador.familias[0]];
        return deFamilia ? deFamilia.slot : 0;
    }
    // El silenciador no tiene ranura propia: se muestra en la del arma a la que
    // esta montado, y mientras esta en la mochila no esta en ninguna.
    return 0;
}
