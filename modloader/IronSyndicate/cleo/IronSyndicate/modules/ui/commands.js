// GSIS - UI: commands
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// Que significa cada comando que manda la pagina. Es la tabla de verbos: el
// `case` de cada accion, y nada mas.
//
// Ni el transporte (eso es bridge.js) ni el estado de la UI (eso es index.js).
// Por eso el objeto `ui` —open, close, togglePanel, abrirFlujo, cerrarVisible—
// entra POR PARAMETRO: commands necesita llamar a funciones que viven en index, e
// index necesita a commands para drenar la cola. Si uno importara al otro habria un
// ciclo, y un ciclo entre dos archivos de UI es un undefined en el menu.
//
// ============================================================================
// LA FAMILIA DE ARMAS, Y POR QUE NO HAY NINGUNA
// ============================================================================
// Antes este archivo atendia cinco comandos de arma —inv:equip, inv:unequip,
// inv:mount, inv:unmount, inv:belt:off— y el header explicaba el contrato que
// los ataba: un comando de arma manda `id` y, si quiere una configuracion,
// `attachments`; NUNCA un weaponType, porque el weaponType era la representacion
// que ejecuta el motor y la pagina no tenia por que conocerla.
//
// Ese contrato se fue con el sistema de armas entero, y con el se fue la regla que
// lo justificaba. No queda sustituto que escribir: no hay item cuya accion sea
// equipar o montar.
//
// Lo que si queda es la mitad laica del mismo criterio, y aplica a los comandos que
// siguen:
//
//   la pagina manda un ID DE ITEM y una CANTIDAD, nunca un estado
//
// `inv:drop` manda `id` y `qty`. `trunk:put` y `trunk:take` mandan `id` y `qty`.
// `dealer:add` manda `id` y `qty`. El estado de la fila —su salud, su cantidad
// real— lo tiene el modulo owner, que es el que lo lee del save y el que decide.
// La pagina propone una accion sobre un id; el modulo la ejecuta o la rechaza.
//
// ============================================================================
// LO QUE NO SE VALIDA ACA
// ============================================================================
// Ningun comando valida peso, ni inventario lleno, ni si el jugador esta parado
// al lado del baul. Todo eso vive en el modulo owner (addItem, putInTrunk,
// doOffer). La pagina ve un snapshot que puede tener hasta 400ms, asi que si el
// modulo no valida, su respuesta seria la de hace un snapshot. Este archivo
// traduce, no decide.
import { removeItem } from "../inventory/index.js";
import { equipar, desequipar, equiparCargador, guardarCargador, rellenarCargador, recargar } from "../weapons/gsis_Weapons.js";
import { putInTrunk, takeFromTrunk } from "../gsis_Trunk.js";
import { addToCart, removeFromCart, resetCart, checkout } from "../gsis_WeaponDealer.js";
import { doOffer, moveOffer } from "../gsis_WeaponSeller.js";
import { collectItem, collectAll, cancelOrder } from "../gsis_DealerPickup.js";
import { clearNotice } from "../../core/gsis_Notice.js";

// Un comando desconocido se avisa UNA vez. La pagina esta en un ciclo de
// desarrollo y un typo suyo no puede llenar el log cada frame.
var _unknownCmds = {};

// El handler de un comando. Devuelve true si atendio algo (eso fuerza el push del
// inventario) y false si no (un diag, o un comando que no toco nada).
//
// `ui` es el objeto de callbacks de ui/index.js. Se pasa en vez de importarse por
// el ciclo que eso evita; ver el header.
export function handleCommand(cmd, ui) {
    var what = cmd && cmd.cmd;
    var id = cmd ? cmd.id : null;

    try {
        switch (what) {
            // v3: la pagina cierra el menu. Es el unico camino que anda
            // cuando la pagina se quedo con el teclado, porque en ese estado
            // el WndProc consume la tecla y el juego no la ve: el menu solo
            // se cerraba sacando el puntero de la UI.
            //
// Cierra lo que se ESTA VIENDO, no lo que haya abierto: con el
            // panel principal abierto y un flujo esperando turno, la tecla de
            // cierre tiene que cerrar el inventario, no un menu que el jugador
            // ni esta mirando. Es la misma regla 1 que decide que pantalla se
            // ve, y por eso va por la MISMA funcion que el teclado
            // (cerrarVisible, en ui/index.js): el debounce va adentro, y las dos
            // mitades de la misma pulsacion —el mod la ve por GetAsyncKeyState,
            // la pagina la manda por aca— se anulan solas.
            //
            // El nombre del comando es el de la ACCION, no el de una tecla: lo
            // mandan el ESC y el F de la pagina, y las dos quieren lo mismo.
            case "ui:close":
                return ui.cerrarVisible(Date.now(), "comando ui:close");

            // La I de la pagina. Es la misma accion que la tecla del mod, y va
            // por la misma funcion: si cada camino decidiera por su cuenta,
            // uno de los dos terminaria abriendo algo que el otro prohibe.
            case "ui:toggle":
                if (!ui.togglePanel(Date.now(), "comando ui:toggle")) return false;
                return true;

            // La apertura de los menus de esfera, que ahora son TRES teclas del
            // contrato (ESPACIO, INTRO y F) y una sola. El comando no se llama
            // "flow:toggle" porque no alterna mas: el cierre es "ui:close", con
            // F o ESC, y abrir y cerrar en el mismo comando es justo lo que
            // hacia que la apertura tuviera que preguntar primero si habia algo
            // abierto.
            //
            // La pagina no decide si abrir: lo pide, y abrirFlujo() es el mismo
            // camino que usa el teclado. Si el jugador no esta en una esfera
            // valida no pasa nada, y eso es lo que la pagina necesita para no
            // mentirle con una apertura que el mod no puede hacer.
            //
            // El debounce de abrirFlujo es lo que hace que las dos mitades no
            // se cancelen: con el teclado en la pagina, el mod igual lee la
            // tecla por GetAsyncKeyState, asi que la misma pulsacion llega por
            // los dos caminos. La segunda cae dentro de la ventana.
            case "flow:open":
                if (!ui.abrirFlujo(Date.now(), "comando flow:open")) return false;
                return true;

            // La pagina reporta que le llego y que quedo en el DOM. No es una
            // accion: no cambia nada, se loguea y se sigue.
            //
            // Existe porque la pagina era ciega para diagnosticar: sus _diag()
            // van a console.log y el runtime no captura OnConsoleMessage, asi
            // que no quedan en ningun archivo. Con el mod diciendo "menu=0" y
            // la pagina mostrando un panel, los dos lados tienen que estar en el
            // mismo log; si no, la contradiccion se busca a ciegas.
            //
            // "hidden" es el que sirve: es la clase que REALMENTE quedo en el
            // DOM, no la que se pidio. El bug del panel que no se apagaba era
            // dos funciones peleandose por la misma clase, y eso solo se
            // diferencia mirando el resultado.
            case "ui:diag":
                // Los campos vienen en `cmd`, no en un `data`: leer `data` era un
                // ReferenceError tragado por el catch de abajo — el canal de
                // diagnostico nunca se emitio.
                log("[UI] pagina dice: " + (cmd && cmd.dice) +
                    " flow=\"" + (cmd && cmd.flow) + "\"" +
                    " menu=" + (cmd && cmd.menu) +
                    " #panel" + (cmd && cmd.hidden ? " OCULTO" : " VISIBLE"));
                return false;

            // --- INVENTARIO ---
            //
            // Los cinco comandos de armas que hubo aca se fueron con el sistema y
            // cuatro vuelven ahora, con el mismo contrato y un nombre menos:
            //
            //   inv:equip      sacar un arma del inventario y ponerla en la mano
            //   inv:unequip    sacarla de la mano y devolverla
            //   inv:equipMag   sacar un cargador del inventario y ponerlo en una
            //                  de las dos ranuras de equipados
            //   inv:unequipMag sacar un cargador de su ranura y devolverlo
            //   inv:fillMag    pasarle las balas de otro cargador a este
            //   inv:reload     la R del arma de la mano: cambio o descarga
            //
            // EL CONTRATO: la pagina manda un ID DE ITEM, nunca un weaponType ni un
            // estado. `inv:unequip` manda el slot porque la fila equipada sabe el
            // suyo y la pagina lo ve en `r.slot`; `inv:unequipMag` manda el indice
            // de ranura porque su fila lo ve en `r.indice`. Las otras solo necesitan
            // el id. Quien sabe el estado —el weaponType, la capacidad— es el modulo
            // de armas, que lo lee del motor.
            //
            // Y ningun `case` loguea a ciegas: mira el retorno antes de decir que
            // lo hizo. Un log que afirma una accion que no ocurrio manda a
            // investigar el archivo equivocado, y esa fue la clase de bug mas cara
            // de la sesion del armado.
            case "inv:equip":
                if (!id) return false;
                if (!equipar(id)) {
                    log("[UI] equipar fallo: " + id);
                    return false;
                }
                log("[UI] equipar: " + id);
                return true;

            case "inv:unequip":
                if (cmd.slot === undefined || cmd.slot === null) return false;
                if (!desequipar(parseInt(cmd.slot, 10))) {
                    log("[UI] desequipar fallo: slot " + cmd.slot);
                    return false;
                }
                log("[UI] desequipar: slot " + cmd.slot);
                return true;

            case "inv:equipMag":
                if (!id) return false;
                if (!equiparCargador(id)) {
                    log("[UI] equiparCargador fallo: " + id);
                    return false;
                }
                log("[UI] equiparCargador: " + id);
                return true;

            case "inv:unequipMag":
                if (cmd.indice === undefined || cmd.indice === null) return false;
                if (!guardarCargador(parseInt(cmd.indice, 10))) {
                    log("[UI] guardarCargador fallo: ranura " + cmd.indice);
                    return false;
                }
                log("[UI] guardarCargador: ranura " + cmd.indice);
                return true;

            case "inv:fillMag":
                // Rellenar pasa el INDICE, no el id, y el `equipado` que lo acompana
                // dice si ese indice es una ranura o un lugar de la mochila. No es la
                // excepcion que parece: con dos cargadores del mismo tipo en la
                // mochila —el vacio y el lleno— el id no distingue a cual leyo el
                // jugador, y rellenar el equivocado es un cargador que se llena solo.
                if (cmd.indice === undefined || cmd.indice === null) return false;
                var destinoMag = parseInt(cmd.indice, 10);
                var enRanura = cmd.equipado === true;
                if (!rellenarCargador(enRanura, destinoMag)) {
                    log("[UI] rellenarCargador fallo: " + (enRanura ? "ranura " : "mochila ") + destinoMag);
                    return false;
                }
                log("[UI] rellenarCargador: " + (enRanura ? "ranura " : "mochila ") + destinoMag);
                return true;

            case "inv:reload":
                // No lleva id: recargar no es una accion sobre una fila, es una
                // accion sobre el arma de la mano. El modulo ve que cargador le
                // sirve, lo saca de los EQUIPADOS y lo gasta.
                if (!recargar()) return false;
                log("[UI] recargar");
                return true;

            case "inv:drop":
                if (!id) return false;
                // qty viene del boton "tirar": 1 por defecto, o lo que pida la
                // pagina. removeItem es el unico que saca de verdad.
                removeItem(id, cmd.qty ? parseInt(cmd.qty, 10) : 1);
                log("[UI] tirar " + id);
                return true;

            // ------------------------------------------------------------- FLUJOS --
            //
            // Los cuatro menus de proximidad. Cada caso es una linea: el
            // prechequeo de peso, el aviso y la validacion viven en el modulo
            // owner (putInTrunk, doOffer, collectItem), no aca.
            //
            // Eso es lo que hace que el modulo tenga que ser el que valida: la
            // pagina ve un snapshot que tiene hasta 400ms. Si el peso lo
            // calculara la pagina, su respuesta seria la de hace un snapshot.
            //
            // El clearNotice() del principio no es cosmetico: un comando que
            // vuelve temprano (payload invalido) no escribe aviso, y si el
            // anterior siguiera pendiente la pagina repetiria el mensaje viejo
            // como si fuera la respuesta de este.

            case "trunk:put":
            case "trunk:take":
                if (!id) return false;
                if (what === "trunk:put") {
                    putInTrunk(id, cmd.qty);
                } else {
                    takeFromTrunk(id, cmd.qty);
                }
                log("[UI] baul: " + what + " " + id + " x" + cmd.qty);
                return true;

            case "dealer:add":
                if (!id) return false;
                clearNotice();
                addToCart(id, cmd.qty);
                log("[UI] carrito +" + (cmd.qty || 1) + " " + id);
                return true;

            // Quitar de la lista del carrito (el pane derecho de la armeria).
            // Mismo esquema que dealer:add: el modulo decide si habia algo que
            // sacar, y el aviso lo escribe el (ver removeFromCart / setNotice).
            case "dealer:cart:remove":
                if (!id) return false;
                clearNotice();
                removeFromCart(id, cmd.qty);
                log("[UI] carrito -" + (cmd.qty || 1) + " " + id);
                return true;

            case "dealer:cart:clear":
                clearNotice();
                resetCart();
                log("[UI] carrito vaciado");
                return true;

            case "dealer:checkout":
                clearNotice();
                checkout();
                log("[UI] carrito pagado");
                return true;

            case "pickup:take":
                clearNotice();
                if (!id) return false;
                collectItem(id, cmd.qty);
                log("[UI] retiro " + id + " x" + cmd.qty);
                return true;

            case "pickup:takeAll":
                clearNotice();
                collectAll();
                log("[UI] retiro de todo el pedido");
                return true;

            case "pickup:cancel":
                // clearNotice() SI va, aunque no haya id que validar: cancelOrder
                // escribe su propio aviso (cancelado / no hay pedido), y sin
                // limpiar el aviso anterior de la pantalla sobrevive a este
                // comando y la pagina lo repite como si fuera la respuesta.
                clearNotice();
                cancelOrder();
                log("[UI] cancelacion del pedido pendiente");
                return true;

            case "seller:offer":
                if (!id) return false;
                doOffer(id, cmd.qty, cmd.price);
                log("[UI] oferta " + id + " x" + cmd.qty + " a " + cmd.price);
                return true;

            // Mueve la oferta de una fila (las teclas +/- y los dos botones del
            // pie). Sin clearNotice() a proposito: el aviso que quedo de la
            // oferta anterior es el que trae el precio seguro, y es justamente
            // el dato con el que se esta ajustando. El siguiente seller:offer
            // lo sobreescribe solo.
            case "seller:quote":
                if (!id) return false;
                moveOffer(id, cmd.delta);
                log("[UI] oferta movida " + id + " " +
                    (cmd.delta >= 0 ? "+" : "") + cmd.delta);
                return true;

            default:
                if (!_unknownCmds[String(what)]) {
                    _unknownCmds[String(what)] = true;
                    log("[UI] comando desconocido: " + JSON.stringify(cmd));
                }
                return false;
        }
    } catch (e) {
        // Un comando que revienta no puede llevarse por delante el loop: se
        // loguea y el frame sigue.
        log("[UI] comando '" + what + "' fallo: " + e.message);
        return false;
    }
}
