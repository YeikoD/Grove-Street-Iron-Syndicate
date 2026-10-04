# Arquitectura y Gobernanza del Sistema de Permisos en CLEO Redux

La evolución de la ejecución de scripts personalizados en motores de juegos de mundo abierto ha transitado desde la ejecución irrestricta de instrucciones en código de máquina o ensamblador SCM hacia entornos de tiempo de ejecución avanzados capaces de interpretar JavaScript y TypeScript.

En este contexto, CLEO Redux incorpora un modelo formal de seguridad y control de acceso diseñado para mitigar los riesgos inherentes a la ejecución de código potencialmente no seguro. Históricamente, las extensiones desarrolladas por la comunidad poseían acceso ilimitado al espacio de direcciones del proceso anfitrión, lo que permitía la manipulación arbitraria de la memoria, la alteración del sistema de archivos local y la carga de bibliotecas dinámicas sin ningún tipo de supervisión o aislamiento.

Para solucionar estas vulnerabilidades, CLEO Redux implementa un sistema de gobernanza basado en niveles de permisos y tokens de autorización. Este esquema clasifica las operaciones sensibles (denominadas operaciones no seguras) y exige que los scripts soliciten explícitamente las facultades requeridas antes de poder interactuar con la memoria del proceso, el sistema de archivos o las bibliotecas externas.

## Fundamentos del Control de Acceso y Gestión de Código No Seguro

El propósito primario de la arquitectura de seguridad de CLEO Redux es prevenir que modificaciones maliciosas o defectuosas causen daños en el entorno del usuario, corrupción de datos o la inestabilidad del juego anfitrión. Se consideran **operaciones no seguras** a todas aquellas instrucciones que trascienden el ámbito de la lógica estándar del juego, tales como:

- Lectura y escritura directa en la memoria física del proceso.

- Invocación de funciones nativas mediante punteros.

- Carga de bibliotecas dinámicas (`.dll`).

- Operaciones de creación, modificación o eliminación de archivos locales.

Cuando el motor de tiempo de ejecución de CLEO Redux encuentra una instrucción clasificada como no segura durante la ejecución de un script, evalúa la política de seguridad vigente. Si el script no cuenta con los permisos validados correspondientes, la operación es bloqueada inmediatamente y se genera una entrada de advertencia en el registro de diagnóstico `cleo_redux.log`, impidiendo que el código no autorizado afecte la estabilidad del sistema.

## Niveles Globales de Permiso del Entorno

CLEO Redux define cuatro niveles de permisos a escala global, los cuales determinan el rigor con el que la máquina virtual procesa las instrucciones no seguras. La configuración global establece la postura de seguridad por defecto para todo el catálogo de scripts cargados por el sistema.

| **Nivel de Permiso** | **Comportamiento del Entorno de Ejecución**                                                                        | **Criterio de Aprobación de Instrucciones**                                               | **Perfil de Riesgo Operativo**                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **All**              | Permite incondicionalmente cualquier operación no segura sin validar la presencia de tokens en los scripts.        | Autorización automática universal para todo el código.                                    | **Alto.** Indicado únicamente para entornos de desarrollo controlado o fuentes completamente confiables.             |
| **Lax**              | Nivel por defecto. Bloquea operaciones no seguras a menos que el script solicite explícitamente el token adecuado. | Requiere solicitud explícita del token en el script (`[mem]`, `[dll]`, `[fs]`).           | **Balanceado.** Proporciona un equilibrio entre flexibilidad funcional y protección contra ejecuciones accidentales. |
| **Strict**           | Deniega operaciones no seguras a menos que el script las pida y la configuración global las autorice.              | Requiere doble validación: solicitud en el script y habilitación explícita en `cleo.ini`. | **Bajo.** Modelo defensivo que otorga al administrador del sistema el control final sobre las capacidades.           |
| **None**             | Prohíbe de forma absoluta cualquier operación no segura en todos los scripts sin excepción.                        | Rechazo incondicional de cualquier operación no segura.                                   | **Mínimo.** Restringe los scripts a la lógica nativa del juego sin acceso a recursos extendidos.                     |

## Mecanismos de Declaración de Permisos en Scripts y Módulos

Para funcionar bajo las políticas de seguridad **Lax** o **Strict**, los desarrolladores deben declarar formalmente las capacidades requeridas por sus archivos fuente. CLEO Redux ofrece tres mecanismos complementarios para solicitar permisos, adaptados a la estructura y complejidad de cada proyecto:

| **Mecanismo de Declaración**        | **Lenguajes Compatibles**                      | **Ámbito de Aplicación**                          | **Jerarquía de Precedencia**                                           |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| **Sufijos en Nombre de Archivo**    | Todos (`.cs`, `.js`, `.ts`)                    | Archivos fuente individuales aislados.            | Directo sobre el archivo individual.                                   |
| **Sufijos en Nombre de Directorio** | Módulos JavaScript y TypeScript (`.js`, `.ts`) | Todos los scripts contenidos en el subdirectorio. | **Precedencia Alta** (Sobrescribe las reglas de `mod.json`).           |
| **Manifiesto `mod.json`**           | Módulos JavaScript y TypeScript (`.js`, `.ts`) | Configuración estructurada interna del módulo.    | **Precedencia Subordinada** (Sujeto a la nomenclatura del directorio). |

### Detalles de Implementación

1. **Nomenclatura de Archivos:** Los tokens de permiso se adjuntan directamente al nombre del archivo entre corchetes antes de la extensión, como por ejemplo:

   - `spawner[mem].cs` para scripts de CLEO tradicional.

   - `main[mem][dll].ts` para scripts de TypeScript (aplica de forma idéntica a JavaScript).

2. **Proyectos Modulares (Directorios):** Para proyectos organizados en subdirectorios que contienen un punto de entrada `index.js` o `index.ts`, los tokens se pueden declarar adjuntándolos al nombre del directorio contenedor:

   - `CLEO/mi_mod[mem][dll]/index.ts`

3. **Manifiesto `mod.json`:** Alternativamente, los desarrolladores pueden emplear un archivo de manifiesto `mod.json` ubicado en la raíz de la carpeta del módulo, definiendo una estructura JSON con la propiedad `permissions` configurada como un arreglo de cadenas de texto.

> **Regla de Precedencia:** Cuando coexisten un sufijo de directorio y un archivo `mod.json` en un mismo módulo, CLEO Redux aplica una regla de resolución estricta donde la declaración en el nombre de la carpeta toma precedencia absoluta sobre el contenido del manifiesto `mod.json`. Esta jerarquía permite a los usuarios finales o gestores de modificaciones modificar o revocar privilegios de forma externa mediante el simple renombrado del directorio sin necesidad de editar archivos internos del paquete.

## Catálogo de Tokens de Permiso y Ámbitos de Operación

Los tokens de permiso constituyen la unidad fundamental de autorización en CLEO Redux. Cada token representa un dominio específico de interacciones con el entorno anfitrión y restringe un conjunto delimitado de funciones de la API y opcodes.

| **Token** | **Dominio Operativo**     | **Operaciones y Comandos Representativos**                                                                             | **Implicaciones de Seguridad**                                                                                 |
| --------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `mem`     | **Memoria del Proceso**   | Lectura y escritura de memoria (`Memory.Read`, `Memory.Write`), resolución de punteros y llamadas a funciones nativas. | Previene la alteración no autorizada del espacio de direcciones del juego y la ejecución de código arbitrario. |
| `dll`     | **Bibliotecas Dinámicas** | Carga de módulos externos en tiempo de ejecución (`LoadLibrary`) y localización de funciones exportadas.               | Impide la inyección de código binario no verificado y la vinculación con bibliotecas del sistema operativo.    |
| `fs`      | **Sistema de Archivos**   | Creación, lectura, modificación y eliminación de archivos y carpetas en el almacenamiento local.                       | Evita la manipulación no autorizada del disco, la fuga de datos o la destrucción de archivos del usuario.      |

## Configuración del Archivo `cleo.ini` y Jerarquía de Validación

El archivo de configuración principal `cleo.ini` actúa como el centro de control para la administración del entorno de tiempo de ejecución. La propiedad `PermissionLevel` bajo la sección general define el nivel de seguridad activo (`All`, `Lax`, `Strict`, `None`).

### Validación en Modo Strict

Cuando el sistema se configura en el nivel **Strict**, la sección `[Permissions]` del archivo `cleo.ini` asume la función de filtro secundario obligatorio. En este modo, cada token de permiso se asocia a un valor numérico booleano (`1` para permitir, `0` para deshabilitar).

Por ejemplo:

```
[Permissions]mem=0
```

La asignación `mem=0` deshabilita de manera absoluta todas las instrucciones relativas a la manipulación de memoria en todo el sistema, rechazando la ejecución incluso si un script incluye explícitamente el token `[mem]` en su nombre de archivo o manifiesto.

*Nota: Las reglas declaradas dentro de la sección `[Permissions]` son ignoradas por completo si el parámetro `PermissionLevel` se encuentra configurado en cualquier nivel distinto de Strict.*

### Gestión a Nivel del Sistema Operativo

Adicionalmente, el entorno de tiempo de ejecución contempla la gestión de permisos a nivel del sistema operativo. Si el ejecutable del juego se encuentra instalado en un directorio protegido donde el proceso carece de privilegios de escritura para generar archivos de registro o guardar estados, CLEO Redux redirige sus operaciones de entrada y salida hacia la ruta del perfil de usuario:

`C:\Users\<Usuario>\AppData\Roaming\CLEO Redux`

Esta separación garantiza la continuidad operativa sin obligar a conceder privilegios elevados de administrador al proceso principal del juego.

## Implicaciones Operativas e Impacto en el Ecosistema de Modding

La adopción de una arquitectura de seguridad basada en permisos transforma significativamente el paradigma de desarrollo para la comunidad de modding. Tradicionalmente, la ejecución de scripts en juegos clásicos asumía un modelo de confianza ciega en el que cualquier archivo `.cs` podía ejecutar instrucciones de ensamblador con acceso ilimitado a la memoria del sistema operativo.

- **Principio de menor privilegio:** El esquema de CLEO Redux promueve esta práctica. La mayoría de las modificaciones enfocadas exclusivamente en la lógica de juego —como la alteración de parámetros de vehículos, creación de misiones o gestión de interfaces— pueden ejecutarse sin solicitar ningún token especial bajo el nivel **Lax**, manteniéndose aisladas de las API del sistema operativo. Únicamente aquellos proyectos que requieren extender las capacidades del motor mediante llamadas a funciones nativas o lectura de datos externos deben explicitar sus requerimientos.

- **Integración de SDKs:** Para los desarrolladores de herramientas y complementos avanzados que utilizan el SDK de C++ o Rust de CLEO Redux, el sistema impone la obligación de registrar formalmente las nuevas instrucciones clasificadas como no seguras acompañadas de su respectivo token de permiso. Esto asegura que las extensiones de terceros se integren homogéneamente en la jerarquía de validación global y queden sujetas a los mismos controles que las instrucciones nativas del entorno.

## Conclusiones

El sistema de permisos de CLEO Redux representa un avance fundamental hacia la ejecución segura y profesional de código personalizado en motores de juego heredados. Al articular un modelo multinivel (`All`, `Lax`, `Strict`, `None`) con un conjunto preciso de tokens (`mem`, `dll`, `fs`), la plataforma logra separar las operaciones inocuas de la lógica del juego de aquellos comandos con potencial de impactar el sistema operativo o la memoria del proceso.

La flexibilidad ofrecida mediante la declaración de permisos por nombres de archivo, nombres de carpeta y manifiestos `mod.json` asegura que tanto desarrolladores como usuarios mantengan una visibilidad clara y un control absoluto sobre las capacidades operativas del código distribuido.