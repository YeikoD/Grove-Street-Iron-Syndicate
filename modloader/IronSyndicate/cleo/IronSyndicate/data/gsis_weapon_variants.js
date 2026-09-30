// GSIS - Variantes de arma
// Copyright (C) 2026  YeikoD
// License: GNU GPL v3 or later (full text in LICENSE).

// ============================================================================
// QUE RESUELVE ESTE ARCHIVO
// ============================================================================
// El weaponType de GTA no es la identidad de un arma: es la REPRESENTACION que el
// motor necesita para ejecutar una configuracion concreta. La identidad es la
// familia.
//
// Antes de este archivo, `WEAPON_DATA` ataba las dos cosas: una fila de inventario
// era un weaponId. Eso obliga a que "Colt .45", "Colt .45 silenciada" y "Colt .45
// con cargador de 15" sean tres items distintos en el inventario, cuando en la
// realidad son el mismo ARMAMENTO con distinta configuracion encima.
//
// Aca se separan tres cosas que estaban pegadas:
//
//   FAMILIA       la identidad. Un item de inventario. "colt45".
//   ACCESORIO     una pieza compatible con una familia. "suppressor",
//                 "mag_colt45_15". Va suelto en el inventario.
//   VARIANTE      la combinacion resuelta a un weaponType que el motor ejecuta.
//
// Y el estado de un arma (el WeaponInstance) es la familia mas la lista de
// accesorios montados. Cambiar de configuracion NO crea ni destruye el item:
// solo recalcula el weaponType.
//
// LA REGLA
// ============================================================================
//   accesorios -> determinan la variante -> la variante determina el weaponType
//   -> el weaponType determina las propiedades tecnicas que ve el motor.
//
// Y la ultima flecha es del .asi, no de este archivo: el .asi clona la
// CWeaponInfo del padre y escribe el cargador, el modelo y el damage de cada
// variante. El mod NUNCA escribe m_nAmmoClip. Lo unico que hace es:
//
//   1. guardar familia + accesorios
//   2. resolver la variante
//   3. sacar su weaponType
//   4. dar el arma con ese weaponType
//   5. LEER la capacidad de ese weaponType para acotar la municion
//
// Por eso `clipSize` y `modelId` en las tablas de abajo son DECLARATIVOS: son
// el numero que deberia estar en gsis_weapons.dat, y estan para que se pueda
// cross-checkear contra el .asi. No son una entrada de runtime.
//
// ============================================================================
// EL LIMITE DE ESTA FASE
// ============================================================================
// Las variantes son ESTATICAS: estan todas declaradas aca y en gsis_weapons.dat,
// que el .asi lee una vez en DllMain. No hay generacion en runtime.
//
// Eso NO es una limitacion de este modulo, es del .asi: el rango de tipos que un
// .asi puede dar de alta esta en el archivo, no en una llamada. Por eso resolver
// una configuracion que nadie declaro devuelve null y no un tipo inventado: un
// weaponType que no existe en el .dat no dispara, no hace ruido y no tiene mira,
// y el fallo aparece en el log del .asi, no aca.
//
// EL RANGO DE TIPOS ES CONDICIONAL
// ============================================================================
// Los tipos de plugin van en 60..79, y esa franja esta libre SOLO porque
// fastman92 limit adjuster esta apagado. Con FLA prendido, 60 y 61 son
// JETPACK_TYPE y BINOCULARS_TYPE, y 70..79 caen fuera de NumberOfWeaponTypes = 70.
// Es una precondicion del mod entero, no de este archivo.
//
// Ver gsis_WEAPON_LIMITER.md §1 y gsis_VARIANTES.md.

// ============================================================================
// FAMILIAS - la identidad
// ============================================================================
// Una familia es un armamento. NO es un item: es la clase de cosa a la que los
// accesorios se enganchan.
//
//   family       id estable. Va en los saves.
//   itemId       el item de inventario que la representa. Una familia, un item:
//                por eso hay una sola "Colt .45" y no tres.
//   baseVariant  el weaponType de la familia SIN NINGUN ACCESORIO montado. Es
//                un tipo de plugin, no uno de vanilla: el 22 de vanilla trae 17
//                balas y el mod no escribe m_nAmmoClip, asi que la Colt de GSIS
//                necesita el 63 para tener 8.
//   parent       el tipo VANILLA del que clona la variante base. -1 = la
//                variante base es un tipo de vanilla y no necesita .asi.
//   modelId      modelo 3D de la variante base.
//   slot         WEAPONSLOT. 2 pistola, 3 escopeta, 4 subfusil, 5 MG, 6 fusil...
//   baseClip     capacidad de la variante base. DECLARATIVO: la que manda es la
//                del .asi. Aca esta el mismo numero, para poder cross-checkear.
//
// OJO con `slot`: es el mismo para TODAS las variantes de la familia. Dos
// variantes no pueden caer en slots distintos, porque el motor tiene UN
// CWeapon por slot (CPed.m_aWeapons[13]) y un accesorio no mueve el arma de
// combate; cambia como se ejecuta.
export var WEAPON_FAMILIES = [
    {
        family: "colt45",
        itemId: "colt45",
        name: "Colt .45",
        parent: 22,           // la variante base clona de la Colt de vanilla
        baseVariant: 63,      // ...pero EJECUTA el 63, que tiene 8 y no 17
        modelId: 346,
        slot: 2,
        baseClip: 8,
        ammoType: ".45 ACP",
        category: "Pistolas",
        realWorldName: "Colt M1911A1",
        weight: 1.5,
        isLong: false,
        price: 550
    }
];

// ============================================================================
// ACCESORIOS - piezas compatibles
// ============================================================================
// Un accesorio NO es un arma. No tiene weaponId, no tiene modelo propio, y no se
// equipa solo: se monta sobre una familia que lo acepte.
//
//   id                   id estable del item de inventario
//   type                 "weapon_attachment" | "magazine"
//   compatibleFamilies   familias que lo aceptan
//   clipSize             capacidad que aporta al montarlo. Para un cargador.
//                        null en un accesorio que no cambia la capacidad.
//   price                lo que sale del armero
//
// `magazine` es un `type` mas, no un caso especial: el sistema trata igual a un
// cargador y a un silenciador. La diferencia es que `clipSize` != null.
//
// La capacidad del cargador es un DATO DEL ACCESORIO y no del arma, a proposito:
// un cargador de 15 SIEMPRE tiene 15, y el arma no lo hereda de ningun lado. Es
// lo que hace que dos capacidades distintas puedan convivir sin que el numero
// este duplicado en dos lugares que divergen.
// OJO con el id: el item de inventario se llama `mag_colt45_extended` y este
// accesorio tiene que llamarse IGUAL. Los dos son el mismo objeto y hay 5
// archivos que lo nombran (item_data, weapon_data, web_data, Items, y el
// renombre de SaveMigration). Renombrarlo a `mag_colt45_15` es lo que quiere el
// diseno final, pero es un cambio atomico: si se renombra SOLO aca, el
// cargador queda sin item en el inventario y no se puede montar, que es un
// fallo silencioso. Va con su entrada en ITEM_RENAMES, en la fase de
// migracion de saves.
export var WEAPON_ATTACHMENTS = [
    {
        id: "suppressor",
        type: "weapon_attachment",
        name: "Silenciador",
        compatibleFamilies: ["colt45"],
        clipSize: null,
        weight: 0.3,
        price: 1200
    },
    {
        id: "mag_colt45_extended",
        type: "magazine",
        name: "Cargador Colt .45 extendido",
        compatibleFamilies: ["colt45"],
        clipSize: 15,
        weight: 0.2,
        price: 220
    }
];

// ============================================================================
// VARIANTES - la combinacion resuelta
// ============================================================================
// La tabla completa. `variantKey` la calcula el resolver; esta escrita a mano
// porque son pocas y porque escribirla a mano es lo que hace visible una
// combinacion que nadie declaro.
//
//   weaponType  lo que el motor ejecuta. Vanilla o dado de alta por el .asi.
//   family      familia a la que pertenece
//   attachments ids de accesorios, ORDENADOS por id. El orden importa porque
//               es la clave: dos variantes con los mismos accesorios en distinto
//               orden son la MISMA variante, y por eso se normaliza antes de
//               comparar.
//   parent      solo para variantes plugin: el tipo vanilla del que clona el
//               .asi. Para variantes vanilla va null.
//   clipSize    capacidad de ESTA variante. DECLARATIVO: lo que importa es el
//               `cargador` de la fila correspondiente en gsis_weapons.dat, que
//               es lo unico que escribe la CWeaponInfo. Aca esta el mismo
//               numero para que se pueda cross-checkear.
//   modelId     modelo de ESTA variante. Un silenciador cambia la silueta.
//
// `modelSource` es opcional y solo hace falta cuando el modelo NO es uno de
// vanilla: "special" = vive en el rango de modelos que reservo un plugin, asi
// que no se pide con REQUEST_MODEL sino que se verifica que este. El default
// ausente es un modelId de vanilla.
//
// LAS 4 VARIANTES DE LA COLT .45
//
//   tipo  modelo  parent  capacidad  configuracion
//    63     346      22        8     pelada
//    62     346      22       15     cargador 15
//    60     347      23        8     silenciador
//    61     347      23       15     silenciador + cargador 15
//
// LAS 4 NECESITAN TIPO PROPIO, y antes eran 2. Lo que cambio:
//
//   - El 22 de vanilla trae 17 balas. El mod no escribe m_nAmmoClip, asi que
//     no puede bajarlo: la Colt de GSIS tiene su propio tipo, el 63, con 8.
//
//   - El 23 es la pistola silenciada de VANILLA y es un tipo vivo. Registrarlo
//     aca haria que HookGetWeaponInfo(23) devolviera filas de GSIS para la
//     silenciada de todo el juego. El silenciado de GSIS es el 60, que CLONA
//     del 23 y hereda su modelo 347, su animacion 18 y su sonido sin pisarlo.
//
//   - El 22 y el 23 quedan 100% vanilla. 60 y 61 los usan de PADRE, no los
//     reemplazan. Esa diferencia es toda la linea entre un silenciador que
//     funciona y uno que no cambia nada.
//
// Los parent tienen que ser de vanilla y directo. Resolver() sube hasta el
// ancestro MAS ALTO, asi que un padre en cadena se pierde: si el 61 declarara
// padre 60, Resolver(61) daria 22 y el clon saldria de la Colt base.
//
// `modelId` es el valor de ARRANQUE del clon. El id real de un modelo propio lo
// ASIGNA el juego cuando se carga (LOAD_SPECIAL_MODEL lo devuelve), asi que no
// se puede escribir en una tabla estatica; por eso con WEAPON_MODELS los
// nombres van aparte. Hoy WEAPON_MODELS_ENABLED esta en false y las 4 filas usan
// modelos de vanilla, que es la respuesta honesta: 346 y 347 existen, y un
// numero que no existe se ve como un arma invisible.
export var WEAPON_VARIANTS = [
    { weaponType: 63, family: "colt45", attachments: [], parent: 22, clipSize: 8, modelId: 346 },
    { weaponType: 62, family: "colt45", attachments: ["mag_colt45_extended"], parent: 22, clipSize: 15, modelId: 346 },
    { weaponType: 60, family: "colt45", attachments: ["suppressor"], parent: 23, clipSize: 8, modelId: 347 },
    { weaponType: 61, family: "colt45", attachments: ["mag_colt45_extended", "suppressor"], parent: 23, clipSize: 15, modelId: 347 }
];

// ============================================================================
// CLAVE DE VARIANTE
// ============================================================================
// La identidad de una configuracion es "familia + conjunto de accesorios". Como
// el conjunto no tiene orden (poner y sacar el silenciador da el mismo resultado
// que nunca ponerlo), la clave ordena los ids y los junta. Sin esto,
// ["suppressor"] y [] con un silenciador esperando ser montado darian dos
// variantes distintas, y el jugador veria el arma cambiar de tipo al azar.
export function variantKey(family, attachments) {
    var a = (attachments || []).slice();
    a.sort();
    return family + "|" + a.join(",");
}

// La misma normalizacion para un objeto WeaponInstance o para un array suelto.
function _normAttachments(attachments) {
    if (!attachments) return [];
    if (typeof attachments === "string") return [attachments];
    return attachments.slice();
}

// ============================================================================
// INDICE
// ============================================================================
// Se construye una vez. Un indice por clave de variante y uno por weaponId,
// porque Ballistic llega por las dos vias: el catalogo pregunta por
// configuracion, y la reconciliacion pregunta "que variante es el tipo que tiene
// el ped en la mano ahora".
//
// Los duplicados NO se descartan en silencio: se anotan en `problems` y los
// reporta validateVariants(). Descartarlos sin avisar es lo que hace que un
// accesorio mal declarado parezca no hacer nada.
function _buildVariantIndex() {
    var byKey = {};
    var byType = {};
    var byFamily = {};
    var problems = [];
    for (var i = 0; i < WEAPON_VARIANTS.length; i++) {
        var v = WEAPON_VARIANTS[i];
        var key = variantKey(v.family, v.attachments);
        if (byKey[key]) {
            problems.push("la configuracion " + key + " la declaran " +
                byKey[key].weaponType + " y " + v.weaponType + "; gana " + byKey[key].weaponType);
            continue;
        }
        if (byType[v.weaponType]) {
            problems.push("el weaponType " + v.weaponType + " lo declaran mas de una variante; gana la primera");
            continue;
        }
        byKey[key] = v;
        byType[v.weaponType] = v;
        if (!byFamily[v.family]) byFamily[v.family] = [];
        byFamily[v.family].push(v);
    }
    return { byKey: byKey, byType: byType, byFamily: byFamily, problems: problems };
}

var _VARIANTS = _buildVariantIndex();

// ============================================================================
// VALIDACION
// ============================================================================
// Devuelve la lista de problemas. NO loguea: este archivo es un modulo de datos
// puro, sin imports y sin logging, igual que gsis_weapon_data.js. Quien reporta
// es Ballistic en el init, que es donde ya vive la politica de avisar.
//
// Lo que comprueba, y por que cada cosa es un fallo silencioso si no se chequea:
//
//   1. WeaponType repetido entre variantes. Dos configuraciones contendrian el
//      mismo tipo y el motor ejecutaria la misma para las dos.
//   2. Configuracion duplicada. Dos filas para la misma combinacion de
//      accesorios: la segunda no se usa nunca y el accesorio parece no hacer nada.
//   3. Variante que declara un accesorio que nadie declaro. La combinacion es
//      inalcanzable: se puede presentar en la UI y no llevar a ningun lado.
//   4. Variante con un accesorio incompatible con su familia. Igual que el
//      anterior, pero ademas es un error de diseno del accesorio.
//   5. Item de inventario duplicado entre dos familias. Cada familia es un item;
//      dos familias con el mismo itemId no se distinguen en el collar.
//   6. Variante cuyo weaponType no esta en 60..79. Es el rango que el .asi
//      puede dar de alta, y 22/23 quedan vanilla: declararlos aca seria pedirle
//      al .asi que pise un arma que el motor consulta de verdad.
//   7. Variante de plugin cuyo parent no es un tipo VANILLA de 22..32. Tres
//      fallos distintos con el mismo sintoma, y por eso van separados:
//        - fuera de 22..32: GetSkillStatIndex da -1 y el arma no sube de skill
//        - dentro de 22..32 pero ES OTRO TIPO DE PLUGIN: Resolver() sube hasta
//          el ancestro mas alto y el clon sale del ancestro final, perdiendo lo
//          que el padre intermedio habia heredado
//        - parent igual al weaponType: el clon seria de si mismo
//   8. Variante que es de plugin (tiene parent) pero su weaponType NO esta en
//      60..79, o al reves: un tipo de plugin sin parent no clona de nada.
//   9. Capacidad declarada que no sale del .asi, o una variante cuyo cargador se
//      puede leer de tres sitios distintos. Fase 2 lo resuelve dejando un solo
//      lugar; aca se avisa que hay mas de uno.
//
// El punto 10 —que una variante de plugin tenga fila en gsis_weapons.dat y que
// el `cargador` y el `modelId` de esa fila sean los de la variante— NO se puede
// comprobar aca: ese archivo lo lee el .asi, no el mod. Lo comprueba
// tools/check-dat.mjs, que es el unico lugar donde se ven las dos mitades.
export var PLUGIN_TYPE_MIN = 60;
export var PLUGIN_TYPE_MAX = 79;
export var VANILLA_PARENT_MIN = 22;
export var VANILLA_PARENT_MAX = 32;

function _esTipoDePlugin(tipo) {
    return tipo >= PLUGIN_TYPE_MIN && tipo <= PLUGIN_TYPE_MAX;
}

export function validateVariants() {
    var problems = _VARIANTS.problems.slice();
    var seenItems = {};
    var seenTypes = {};

    for (var f = 0; f < WEAPON_FAMILIES.length; f++) {
        var fam = WEAPON_FAMILIES[f];
        if (!fam.itemId) problems.push("la familia " + fam.family + " no declara itemId");
        else if (seenItems[fam.itemId]) {
            problems.push("el itemId " + fam.itemId + " lo usan las familias " +
                seenItems[fam.itemId] + " y " + fam.family);
        } else seenItems[fam.itemId] = fam.family;

        // La variante base es la que se ejecuta sin ningun accesorio montado, asi
        // que tiene que existir como fila. Si no, resolveWeaponType(familia, [])
        // cae a fam.baseVariant, que es un numero sin fila: un tipo que el .asi
        // no conoce, que dispara muda y no tiene mira.
        var base = getVariantByKey(fam.family, []);
        if (!base) {
            problems.push("la familia " + fam.family + " no declara la variante base "
                + "(ninguna fila con attachments vacios)");
        } else if (base.weaponType !== fam.baseVariant) {
            problems.push("la familia " + fam.family + " dice baseVariant " +
                fam.baseVariant + " pero la fila sin accesorios es la " + base.weaponType);
        }
    }

    for (var i = 0; i < WEAPON_VARIANTS.length; i++) {
        var v = WEAPON_VARIANTS[i];
        var accs = v.attachments || [];
        var plugin = isPluginVariant(v);

        // --- el rango, y que no se pise a un tipo vivo ---
        if (!_esTipoDePlugin(v.weaponType) && plugin) {
            problems.push("la variante " + v.weaponType + " declara parent " + v.parent +
                " pero el tipo no esta en " + PLUGIN_TYPE_MIN + ".." + PLUGIN_TYPE_MAX +
                ". Sin esa franja el .asi no lo puede dar de alta");
        }
        if (_esTipoDePlugin(v.weaponType) && !plugin) {
            problems.push("la variante " + v.weaponType + " esta en el rango de plugin " +
                PLUGIN_TYPE_MIN + ".." + PLUGIN_TYPE_MAX + " pero no declara parent, asi que " +
                "no clona de ningun tipo y el motor no lo ejecuta");
        }
        if (v.weaponType === 22 || v.weaponType === 23) {
            problems.push("la variante " + v.weaponType + " usa un tipo VANILLA. 22 y 23 se "
                + "usan de PADRE (el 23 para clonar la silenciada) y no como variante: "
                + "registrarlos seria pisar un arma que el motor consulta de verdad");
        }

        // --- el padre ---
        if (plugin) {
            if (v.parent < VANILLA_PARENT_MIN || v.parent > VANILLA_PARENT_MAX) {
                problems.push("la variante " + v.weaponType + " tiene parent " + v.parent +
                    ", y tiene que ser un tipo vanilla de " + VANILLA_PARENT_MIN + ".." +
                    VANILLA_PARENT_MAX + ": fuera de ahi GetSkillStatIndex devuelve -1 y el arma no sube de skill");
            } else if (_esTipoDePlugin(v.parent)) {
                problems.push("la variante " + v.weaponType + " tiene parent " + v.parent +
                    ", que es un tipo de plugin. El padre tiene que ser de vanilla: Resolver() sube "
                    + "hasta el ancestro MAS ALTO, asi que con un padre en cadena el clon sale del "
                    + "ancestro final y se pierde todo lo que el padre intermedio heredaba");
            } else if (v.parent === v.weaponType) {
                problems.push("la variante " + v.weaponType + " declara su propio tipo como parent");
            }
        }

        // --- una capacidad, un solo lugar ---
        if (seenTypes[v.weaponType] === undefined) seenTypes[v.weaponType] = 0;
        seenTypes[v.weaponType]++;

        for (var a = 0; a < accs.length; a++) {
            var att = getAttachmentById(accs[a]);
            if (!att) {
                problems.push("la variante " + v.weaponType + " usa el accesorio " +
                    accs[a] + ", que no esta en WEAPON_ATTACHMENTS");
            } else if (att.compatibleFamilies &&
                       att.compatibleFamilies.indexOf(v.family) === -1) {
                problems.push("la variante " + v.weaponType + " monta " + accs[a] +
                    " en " + v.family + ", pero el accesorio no lo declara compatible");
            }
        }
        // Orden de accesorios inconsistente con la clave: dos filas queeston
        // mismo conjunto en distinto orden se ven distintas en la tabla y la
        // segunda nunca se resuelve.
        var norm = accs.slice().sort();
        if (norm.join(",") !== accs.join(",")) {
            problems.push("la variante " + v.weaponType + " tiene los accesorios sin ordenar");
        }
    }
    return problems;
}

// ============================================================================
// HELPERS
// ============================================================================

export function getFamilyById(family) {
    for (var i = 0; i < WEAPON_FAMILIES.length; i++) {
        if (WEAPON_FAMILIES[i].family === family) return WEAPON_FAMILIES[i];
    }
    return null;
}

// El item de inventario de una familia. Un item, no una variante: por eso el
// collar de la pistola no se multiplica al montar el silenciador.
export function getFamilyItemId(family) {
    var f = getFamilyById(family);
    return f ? f.itemId : null;
}

// Que item de inventario representa un weaponId. Para un tipo vanilla que no es
// de ninguna familia, cae en WEAPON_DATA (el camino viejo, intacto).
export function getItemIdByWeaponType(weaponType) {
    var v = _VARIANTS.byType[weaponType];
    if (!v) return null;
    return getFamilyItemId(v.family);
}

export function getVariantByKey(family, attachments) {
    return _VARIANTS.byKey[variantKey(family, attachments)] || null;
}

export function getVariantByWeaponType(weaponType) {
    if (weaponType === null || weaponType === undefined) return null;
    return _VARIANTS.byType[weaponType] || null;
}

// Todas las variantes de una familia. Lo usa el validador y la UI de
// configuracion para mostrar que combinaciones existen.
export function getVariantsOfFamily(family) {
    return _VARIANTS.byFamily[family] || [];
}

// Un accesorio se puede montar en esta familia. Es la unica regla de
// compatibilidad y se consulta por el nombre del accesorio, no por el tipo.
export function isAttachmentCompatible(attachmentId, family) {
    for (var i = 0; i < WEAPON_ATTACHMENTS.length; i++) {
        var a = WEAPON_ATTACHMENTS[i];
        if (a.id !== attachmentId) continue;
        if (!a.compatibleFamilies) return false;
        return a.compatibleFamilies.indexOf(family) !== -1;
    }
    return false;
}

export function getAttachmentById(attachmentId) {
    for (var i = 0; i < WEAPON_ATTACHMENTS.length; i++) {
        if (WEAPON_ATTACHMENTS[i].id === attachmentId) return WEAPON_ATTACHMENTS[i];
    }
    return null;
}

// ============================================================================
// RESOLVER - la funcion que hace todo el trabajo
// ============================================================================
// family + lista de accesorios -> weaponType, o null si nadie declaro esa
// combinacion.
//
// Devolver null en vez de un tipo inventado es lo que mantiene honesta la
// tabla: si se caera a la variante base, un accesorio mal declarado seria
// INDISTINGUIBLE de un accesorio que no hace nada, y ese es justo el bug que
// mas cuesta ver. Con null, quien llama lo avisa con el contexto que tiene
// (familia + accesorios + donde se pidio) y el fallo queda en el log.
export function resolveWeaponType(family, attachments) {
    var norm = _normAttachments(attachments);

    // Todo accesorio tiene que ser compatible con la familia. Si uno no lo es,
    // la combinacion no existe ni por error.
    for (var i = 0; i < norm.length; i++) {
        if (!isAttachmentCompatible(norm[i], family)) return null;
    }

    var v = getVariantByKey(family, norm);
    if (v) return v.weaponType;

    // Sin accesorios: cae a la variante base de la familia.
    //
    // Esto solo se alcanza si la familia NO declaro la fila con attachments
    // vacios, y validateVariants() avisa de eso. Es una red, no el camino
    // normal: `baseVariant` es un numero declarado, no inventado, y el
    // validador exige que coincida con la fila. Si la fila existe, la linea de
    // arriba ya devolvio.
    if (norm.length === 0) {
        var f = getFamilyById(family);
        if (f && f.baseVariant) return f.baseVariant;
    }
    return null;
}

// ============================================================================
// VARIANTE CONCRETA
// ============================================================================
// Lo que Ballistic necesita saber de un weaponType: modelo, capacidad, familia,
// que cargador espera y si es un tipo que dio de alta un plugin.
export function getVariantProfile(weaponType) {
    var v = getVariantByWeaponType(weaponType);
    if (!v) return null;
    var f = getFamilyById(v.family);
    var accs = v.attachments || [];

    // Capacidad: la del cargador si lleva uno, si no la de la variante, si no la
    // de la familia. El orden importa: una variante con cargador de 15 tiene
    // que dar 15 aunque la familia declare otra cosa.
    var clip = null;
    for (var i = 0; i < accs.length; i++) {
        var a = getAttachmentById(accs[i]);
        if (a && a.clipSize !== null && a.clipSize !== undefined) { clip = a.clipSize; break; }
    }
    if (clip === null && v.clipSize !== null && v.clipSize !== undefined) clip = v.clipSize;
    if (clip === null && f) clip = f.baseClip;

    var modelId = v.modelId !== null && v.modelId !== undefined ? v.modelId : null;
    return {
        weaponType: v.weaponType,
        family: v.family,
        itemId: f ? f.itemId : null,
        attachments: accs,
        // Para un modelo propio, `model` es el NOMBRE y `modelId` es null: el
        // numero lo asigna el juego al cargarlo y no se puede escribir en una
        // tabla estatica. Quien tenga el ID real es Ballistic, que es el que
        // llama a LOAD_SPECIAL_MODEL. Ver getModelIdDeTipo.
        modelName: v.model || null,
        modelId: modelId,
        // Null = modelo de vanilla, y el llamador lo pide con REQUEST_MODEL.
        // "special" = lo cargo un plugin: ya esta en la memoria del juego y lo
        // unico que se puede hacer (y hay que hacer) es verificar que este.
        modelSource: v.modelSource || null,
        slot: f ? f.slot : null,
        clipSize: clip,
        ammoType: f ? f.ammoType : null,
        isPlugin: isPluginVariant(v)
    };
}

// Una variante es de plugin si su .asi la registro: hay fila en
// gsis_weapons.dat para ese tipo. Se deduce del `parent`, que solo lo tienen las
// que hubo que clonar.
//
// ES la distincion que decide si syncClipSizes puede escribirle. Un tipo de
// vanilla tiene su CWeaponInfo en la tabla global del juego y el mod la escribe.
// Un tipo de plugin la tiene en memoria del .asi y el mod solo la LEE: pisarle la
// capacidad seria dejarle al arma la del padre, que es exactamente lo que el
// .asi vino a evitar.
export function isPluginVariant(variant) {
    return !!(variant && variant.parent !== null && variant.parent !== undefined);
}

// Todos los weaponType de plugin que alguna variante usa. El validador los
// cruza contra gsis_weapons.dat: una variante plugin sin fila ahi es un tipo que
// el .asi no conoce, y eso no se ve hasta que el jugador equipa.
export function getPluginWeaponTypes() {
    var out = [];
    for (var i = 0; i < WEAPON_VARIANTS.length; i++) {
        if (isPluginVariant(WEAPON_VARIANTS[i])) out.push(WEAPON_VARIANTS[i].weaponType);
    }
    return out;
}
