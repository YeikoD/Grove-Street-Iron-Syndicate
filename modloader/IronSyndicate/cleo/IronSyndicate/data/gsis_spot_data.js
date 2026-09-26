// GSIS Spot Data - Puntos de interaccion (esferas para tecla F)
// Catalogo INDEPENDIENTE de actores: las esferas solo abren menus
// N entradas por tipo — añadir aqui no toca Config ni actor_data
// characterId (opcional): personaje que atiende ESA esfera (→ CHARACTERS[].id)
//   sin characterId → default "seller_local" / "dealer_local"

export var SPOTS = {
    // 5 dealers → misma tecla F; characterId distinto = carrito/precio propio
    dealer: [
        { id: "dealer_0", characterId: "dealer_local", x: 2511.8167, y: -1680.8763, z: 13.5086 }
        // , { id: "dealer_1", characterId: "dealer_raul", x: ..., y: ..., z: ... }
    ],
    // 10 sellers → mismo menu trueque; characterId = NPC propio (budget/intereses)
    seller: [
        { id: "seller_0", characterId: "seller_local", x: 2518.0669, y: -1677.9683, z: 14.4207 }
        // , { id: "seller_1", characterId: "seller_juan", x: ..., y: ..., z: ... }
    ],
    // Retiro de pedidos (esfera/blip solo si hay pedido)
    pickup: [
        { id: "dealer_pickup_0", x: 2513.4575, y: -1689.7646, z: 13.5503 }
    ]
};

export function getSpots(type) {
    return SPOTS[type] || [];
}
