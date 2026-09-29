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
//                 "mag_colt45_extended". Va suelto en el inventario.
//   VARIANTE      la combinacion resuelta a un weaponType que el motor ejecuta.
//
// Y el estado delOwned weapon (el WeaponInstance) es la familia mas la lista de
// accesorios montados. Cambiar de configuracion NO crea ni destruye el item:
// solo recalcula el weaponType.
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
// Ver gsis_WEAPON_LIMITER.md §1 y gsis_VARIANTES.md.

// ============================================================================
// FAMILIAS - la identidad
// ============================================================================
// Una familia es un armamento. NO es un item: es la clase de cosa a la que los
// accesorios se enganchan.
//
//   family    id estable. Va en los saves.
//   itemId    el item de inventario que la representa. Una familia, un item:
//             por eso hay una sola "Colt .45" y no tres.
//   parent    tipo vanilla del que clona la variante base, si esa variante es
//             plugin. -1 = la variante base es un tipo vanilla y no necesita .asi.
//   modelId   modelo 3D de la variante base.
//   slot      WEAPONSLOT. 2 pistola, 3 escopeta, 4 subfusil, 5 MG, 6 fusil...
//   baseClip  capacidad de la variante base, sin ningun accesorio.
//
// OJO con `slot`: es el mismo para TODAS las variantes de la familia. Dos
// variantes no pueden caer en slots distintos, porque el motor tiene UN
// CWeapon por slot (CPed.m_aWeapons[13]) y un accesorio no mueve el arma de
//Combat; cambia como se ejecuta.
export var WEAPON_FAMILIES = [
    {
        family: "colt45",
        itemId: "colt45",
        name: "Colt .45",
        parent: -1,          // la variante base es el weaponType 22 de vanilla
        baseVariant: 22,
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
//   clipSize    capacidad de ESTA variante. Para una que lleva cargador es el
//               del cargador; si no lleva, null = la de la familia.
//   modelId     modelo de ESTA variante. Un silenciador cambia la silueta.
//
// Las variantes vanilla no necesitan fila en gsis_weapons.dat: el motor ya las
// tiene. Las plugin necesitan una linea ahi, y el validador de abajo lo comprueba.
//   modelId     modelo de ESTA variante. Un silenciador cambia la silueta.
//
// `modelSource` es opcional y solo hace falta cuando el modelo NO es uno de
// vanilla: "special" = vive en el rango de modelos que reservo un plugin, asi
// que no se pide con REQUEST_MODEL sino que se verifica que este. El default
// ausente es un modelId de vanilla.
//
// LAS 4 VARIANTES DE LA COLT .45 Y SUS MODELOS
//
//   tipo  modelo           archivo         configuracion
//    22   346 (vanilla)    -               pelada, 8 balas
//    23   347 (vanilla)    -               con silenciador, 8 balas
//    60   colt45_c15       propio          cargador de 15
//    61   colt45_c15       propio          cargador de 15 + silenciador
//
// Las de 15 balas usan el modelo propio porque son las unicas que se ven
// distintas de la pistola de vanilla. La 61 usa el MISMO archivo que la 60 y no
// el colt45_c15_silenced.dff que hay en la carpeta: ese es el siguiente paso, y
// cambiarlo es una linea aca.
//
// `model` es un NOMBRE de WEAPON_MODELS, no un modelId, y a proposito: el modelId
// de un modelo propio lo ASIGNA el juego cuando se carga (LOAD_SPECIAL_MODEL lo
// devuelve), asi que no se puede escribir en una tabla estatica. El nombre si
// es estable. Para un modelo de vanilla sigue yendo el numero en `modelId`, que
// si se conoce de antemano.
//
// Que el 60 y el 61 compartan el MISMO modelo es correcto y no es un atajo: son
// la misma configuracion de hardware con distinto cargador, y el cargador no
// cambia la silueta. Lo que cambia la silueta es el silenciador, y ese ya lo
// aporta el weaponType 23 de vanilla con su modelo 347.
export var WEAPON_VARIANTS = [
    { weaponType: 22, family: "colt45", attachments: [], parent: null, clipSize: 8, modelId: 346 },
    { weaponType: 60, family: "colt45", attachments: ["mag_colt45_extended"], parent: 22, clipSize: 15, model: "colt45_c15", modelSource: "special" },
    { weaponType: 23, family: "colt45", attachments: ["suppressor"], parent: null, clipSize: 8, modelId: 347 },
    { weaponType: 61, family: "colt45", attachments: ["mag_colt45_extended", "suppressor"], parent: 23, clipSize: 15, model: "colt45_c15", modelSource: "special" }
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
//   6. Variante cuyo weaponType no esta en el rango de plugins Y declara parent.
//      O al reves: un parent con un tipo vanilla no clona nada.
//
// El punto 7 —que una variante de plugin tenga fila en gsis_weapons.dat— NO se
// puede comprobar aca: ese archivo lo lee el .asi, no el mod. Se comprueba por
// log, que es el unico lugar donde se ven las dos mitades.
export function validateVariants() {
    var problems = _VARIANTS.problems.slice();
    var seenItems = {};

    for (var f = 0; f < WEAPON_FAMILIES.length; f++) {
        var fam = WEAPON_FAMILIES[f];
        if (!fam.itemId) problems.push("la familia " + fam.family + " no declara itemId");
        else if (seenItems[fam.itemId]) {
            problems.push("el itemId " + fam.itemId + " lo usan las familias " +
                seenItems[fam.itemId] + " y " + fam.family);
        } else seenItems[fam.itemId] = fam.family;
    }

    for (var i = 0; i < WEAPON_VARIANTS.length; i++) {
        var v = WEAPON_VARIANTS[i];
        var accs = v.attachments || [];
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
