// GSIS - [fs][mem]gsis_index
// Copyright (C) 2026  YeikoD
// Licencia: GNU GPL v3 o posterior (texto completo en LICENSE).

// Punto de entrada del mod para CLEO Redux.
//
// El scanner de CLEO solo levanta .js del nivel superior de CLEO\, y Mod Loader
// no inyecta .js (std.asi solo maneja asi/dll/cs3/cs4/cs5). El codigo real
// sigue empaquetado en modloader\IronSyndicate\cleo\IronSyndicate\; este shim
// solo lo delega. Los tokens [fs][mem] del nombre son los que compran permisos.
import "../modloader/IronSyndicate/cleo/[fs][mem]gsis_index.js";
