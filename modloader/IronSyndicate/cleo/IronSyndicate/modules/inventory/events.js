// GSIS - Inventory: events
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El nombre del evento que este modulo EMITE, y nada mas.
//
// Antes este archivo atendia seis peticiones del bus, todas de armas:
//
//   items:takeWeapon          saca una instancia de arma del inventario
//   items:storeWeapon         la guarda, con su cargador montado aparte
//   items:swapMagazine        cambia el cargador del cinturon por el del arma
//   items:extractMagazine     saca el cargador montado del arma
//   items:takeAttachment      saca un accesorio suelto para montarlo
//   items:storeAttachment     lo devuelve si el motor rejecta la configuracion
//
// Eran el contrato con modules/weapons/, que ya no existe. Los seis se fueron con
// el, y con ellos se fue la razon de ser del archivo: un `events.js` que no
// atiende nada es un archivo vacio con un import.
// ============================================================================
// QUE SOBRE Y POR QUE ESTE ARCHIVO NO SE BORRO
// ============================================================================
// El modulo de inventario sigue siendo el dueno de items[] y trunks{}, y sigue
// siendo un modulo del juego. Lo que paso es que ya no hay nadie del otro lado del
// bus con quien hablar de armas.
//
// El unico nombre que queda es `inventory:changed`, que este modulo EMITE. No se
// importa de ningun lado y ningun modulo lo escucha todavia: se declara para que
// el que lo necesite no tenga que inventar el nombre, y es la misma razon por la
// que existia antes de que lo escuchara nadie.
//
// Y el archivo se conserva en vez de borrarse por una razon concreta: es donde
// vive la lista de lo que el modulo ATIENDE, y esa lista hoy es la de "nada". Un
// proximo subsistema que necesite del inventario va a agregar sus handlers aca, y
// el archivo con su regla de por que los nombres se importan y no se escriben
// sigue siendo el lugar donde se agan.
// ============================================================================
// LA REGLA DE LOS NOMBRES, QUE NO CAMBIO
// ============================================================================
// Un nombre de evento es un string, y un string mal escrito es un handler que no
// se ejecuta nunca, sin error y sin aviso: el que manda espera una respuesta y
// recibe undefined. Con imports, un nombre mal escrito es un error de
// importacion que se ve al cargar.
//
// Por eso el nombre se DECLARA en core/gsis_EventNames.js y el otro lo importa de
// ahi. El bus no puede verificar que las dos mitades coincidan, asi que la
// coincidencia se vuelve algo que se importa en vez de algo que se escribe dos
// veces.

// El nombre que ESTE modulo emite. Declarado en el archivo del dueno y no en
// EventNames.js, porque no es un contrato: es un aviso de una sola via, para el
// que quiera escucharlo sin tener que preguntar el inventario cada frame.
//
// Cuando se agregue un consumidor, la linea que hay que borrar es la del `on(...)`
// que se sume, no esta.
export var INVENTORY_CHANGED = "inventory:changed";