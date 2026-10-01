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
// LA REGLA DE LA FAMILIA, Y POR QUE ESTA EN UN COMENTARIO Y NO EN EL CODIGO
// ============================================================================
// Un comando de arma manda `id` (el itemId, "colt45") y, si quiere una
// configuracion, `attachments` (los ids de los accesorios montados). NO manda
// weaponType, y no hay forma de que mande uno: el modulo de armas no lo expone y
// weapons/logic.js deriva el tipo de la configuracion con resolveWeaponType().
//
// Que la pagina no pueda mandar el tipo no es una convencion: es que el
// weaponType es la REPRESENTACION que ejecuta el motor, y el registro guarda la
// CONFIGURACION. Si un comando pudiera aceptar un tipo, la pagina podria
//Equipar un 62 (que es colt45 + cargador de 15) sin que haya un cargador de 15 en
// el inventario —el motor lo daria, y el cargador apareceria de la nada en el arma
//—. O mandaria un 60 y la pagina creeria que puede volver a mandarlo aunque el
// silenciador este en otro lado. El numero no es una entrada, es una SALIDA.
//
// ============================================================================
// LO QUE NO SE VALIDA ACA
// ============================================================================
// Ningun comando valida peso, ni inventario lleno, ni si el jugador esta parado
// al lado del baul. Todo eso vive en el modulo owner (addItem, putInTrunk,
// doOffer). La pagina ve un snapshot que puede tener hasta 400ms, asi que si el
// modulo no valida, su respuesta seria la de hace un snapshot. Este archivo
// translates, no decide.
import { equipWeapon, unequipWeapon, attachAccessory, detachAccessory } from "../weapons/logic.js";
import { removeItem, equipMagToBelt, unequipBeltMag } from "../inventory/index.js";
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
            // `inv:equip` manda el itemId. El modulo de armas decide que variante
            // es, y la pagina no sabe ni le importa el numero. `attachments`, si
            // viene, es la configuracion que se quiere; si no viene, el arma se
            // equipa como este, que es lo que hace el boton de primera vez.
            //
            // Y se mira el RETORNO antes de loguear. Antes se logueaba "equipo X"
            // siempre, y con eso el log reportaba una accion que no ocurria: un
            // armar fallido se leia como un armar exitoso, y durante horas la
            // busqueda del bug apunto al lado que no era. Un false aqui no es un
            // error de la pagina —la pagina no ve el motivo— asi que se devuelve
            // false y el que aviso es el modulo de armas, que si sabe por que.
            case "inv:equip":
                if (!id) return false;
                var eq = equipWeapon(id, cmd.attachments);
                if (!eq) return false;
                log("[UI] equipó " + id +
                    (cmd.attachments && cmd.attachments.length
                        ? " con " + cmd.attachments.join(" + ") : ""));
                return true;

            case "inv:unequip":
                if (cmd.slot === undefined || cmd.slot === null) return false;
                unequipWeapon(parseInt(cmd.slot, 10));
                log("[UI] desequipó el slot " + cmd.slot);
                return true;

            // --- ACCESORIOS ---
            //
            // Montar y sacar un accesorio sobre el arma EQUIPADA. Es el unico
            // camino que existe para el silenciador: la R solo cambia cargadores,
            // y sin esto los tipos 60 y 61 serian inalcanzables desde el juego.
            //
            // El payload trae el SLOT del arma, no el id del arma: el accesorio
            // que se manda es el que esta en la mochila, y donde se monta lo dice
            // la pagina, que ya sabe que fila esta equipada. El modulo no busca
            // "el arma equipada" porque puede haber mas de una.
            //
            // Y el id va tal cual: hay un solo namespace para un accesorio, asi que
            // la pagina manda el id que ve en la mochila y el modulo lo monta sin
            // convertir nada. Ver "UN SOLO NOMBRE POR PIEZA" en
            // data/gsis_weapons.js.
            // Y el id NO es obligatorio en los dos.
            //
            //   inv:mount    lo necesita: hay que saber QUE pieza se saca de la
            //                mochila.
            //   inv:unmount   NO lo necesita, y la pagina no lo manda a proposito
            //                (app.js:889): el modulo sabe cual es el accesorio que no
            //                es cargador, y la pagina no deberia tener que distinguir
            //                un silenciador de un cargador por el id.
            //
            // MEDIDO el 30/09: los dos casos exigean `id`, y como la pagina no lo
            // mandaba, `inv:unmount` salia en la primera guarda y devolvia false SIN
            // LOG. O sea: el silenciador se podia montar y no se podia quitar, y el
            // log no decia nada. Un comando que falla en silencio es el peor
            // resultado posible: el jugador aprieta un boton que no hace nada y no hay
            // ni un renglon que buscar.
            case "inv:mount":
                if (!id) {
                    log("[UI] inv:mount sin id: no se sabe que pieza montar");
                    return false;
                }
                if (cmd.slot === undefined || cmd.slot === null) {
                    log("[UI] inv:mount sin slot: no se sabe donde montarla");
                    return false;
                }
                var accM = attachAccessory(null, parseInt(cmd.slot, 10), id);
                if (!accM.ok) {
                    log("[UI] inv:mount fallo: " + accM.motivo);
                    return false;
                }
                log("[UI] inv:mount: " + id + " en el slot " + cmd.slot +
                    " -> tipo " + accM.weaponType);
                return true;

            case "inv:unmount":
                if (cmd.slot === undefined || cmd.slot === null) {
                    log("[UI] inv:unmount sin slot: no se sabe de que arma sacarlo");
                    return false;
                }
                // El id es opcional. Si viene, se usa; si no, el modulo lo deduce.
                // `saco` es lo que se acabo sacando de verdad, que es el dato que
                // hace falta para diagnosticar: sin el, el log no dice que paso con
                // un arma que tiene mas de un accesorio.
                var accU = detachAccessory(null, parseInt(cmd.slot, 10), id || null);
                if (!accU.ok) {
                    log("[UI] inv:unmount fallo (" + (id || "sin id") + "): " + accU.motivo);
                    return false;
                }
                log("[UI] inv:unmount: saco " + (accU.saco || id || "?") +
                    " del slot " + cmd.slot + " -> tipo " + accU.weaponType);
                return true;

            case "inv:belt":
                if (!id) return false;
                equipMagToBelt(id);
                log("[UI] cargador al cinturón: " + id);
                return true;

            // El camino de vuelta del cinturon. No estaba: unequipBeltMag ya
            // existia pero nadie la llamaba, asi que un cargador equipado no
            // tenia forma de volver al inventario desde la pagina. La pagina lo
            // manda con slot = indice de casilla, no con id, porque en el
            // cinturon puede haber dos cargadores del mismo tipo y la casilla es
            // lo unico que las distingue.
            case "inv:belt:off":
                if (cmd.slot === undefined || cmd.slot === null) return false;
                unequipBeltMag(parseInt(cmd.slot, 10));
                log("[UI] cargador fuera del cinturón: casilla " + cmd.slot);
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
