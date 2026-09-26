// GSIS - Property Data
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// GSIS Property Data - Propiedades comprables (Fase 1: Los Santos)
// Fuente: docs/gsis_PROPERTIES.md

export var PROPERTY_DATA = [
    {
        id: "taller_ganton",
        name: "Taller Ganton",
        type: "taller",
        x: 2447, y: -1690, z: 13.5,
        cost: 15000,
        dailyWage: 200,
        capacity: 100
    },
    {
        id: "almacen_idlewood",
        name: "Almacen Idlewood",
        type: "almacen",
        x: 2232, y: -1265, z: 23.8,
        cost: 25000,
        dailyWage: 300,
        capacity: 500
    },
    {
        id: "taller_glen_park",
        name: "Taller Glen Park",
        type: "taller",
        x: 1958, y: -1200, z: 18.0,
        cost: 20000,
        dailyWage: 250,
        capacity: 100
    },
    {
        id: "almacen_compton",
        name: "Almacen Compton",
        type: "almacen",
        x: 1480, y: -1580, z: 13.5,
        cost: 30000,
        dailyWage: 350,
        capacity: 500
    },
    {
        id: "taller_east_los_santos",
        name: "Taller East LS",
        type: "taller",
        x: 2370, y: -1350, z: 24.0,
        cost: 18000,
        dailyWage: 220,
        capacity: 100
    }
];

export function getPropertyDef(id) {
    for (var i = 0; i < PROPERTY_DATA.length; i++) {
        if (PROPERTY_DATA[i].id === id) return PROPERTY_DATA[i];
    }
    return null;
}
