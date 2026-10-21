# MIR_Prep

Plataforma privada en español para preparar el MIR, con acceso exclusivo para Esther y preparada para **GitHub Pages**. Incluye login, panel personal, catálogo de simulacros, guardado automático, corrección, revisión e historial.

La web es estática y no requiere Node ni paquetes para construirse: usa HTML, CSS, JavaScript y Python 3.11+. Las cuentas y los datos privados se gestionan con **Supabase Auth + PostgreSQL**. GitHub Pages por sí solo no puede mantener contraseñas o datos privados en carpetas.

## Probar en local

```powershell
python scripts/build.py
python scripts/serve.py
```

Abre **http://127.0.0.1:4173/**. El acceso es con el usuario `esthermolinero` y la contraseña configurada en Supabase. Sigue [la configuración de acceso privado](docs/PRIVATE_ACCESS.md) para crear y confirmar la cuenta, cerrar el registro en el servidor y aplicar las restricciones de la base de datos.

Sin Supabase configurado, la web ofrece una demo local con cuatro preguntas sobre el uso de la plataforma. Al conectar Supabase se retira ese acceso público. No abras `index.html` como archivo `file://`: los módulos y los JSON necesitan HTTP.

## Qué incluye

- Login privado con nombre de usuario y contraseña.
- Registro cerrado y acceso a datos restringido a la cuenta autorizada.
- Perfil con nombre visible, objetivo y fecha objetivo.
- Catálogo de exámenes con búsqueda, puntuación y filtro de intentos en curso.
- Navegación por preguntas, marcas de revisión y opción explícita de dejar en blanco.
- Guardado tras los cambios, cada 30 segundos mientras la pestaña está visible y al pulsar «Guardar y salir».
- Recuperación de respuestas, marcas, posición y tiempo activo. Con Supabase, también desde otro dispositivo.
- Control de versiones: una pestaña desactualizada no sobrescribe el progreso de otra. El aviso permite recuperar la última versión guardada.
- Entrega confirmada, corrección en servidor para cuentas reales e intentos entregados inmutables.
- Informe con puntos, netas, aciertos, errores, blancos, tiempo y aciertos por área.
- Revisión con las respuestas elegidas, soluciones y explicaciones; filtros por resultado.
- Historial, gráfico de evolución, repetición de exámenes y exportación de datos personales.
- Informe HTML descargable que se puede imprimir o guardar como PDF desde el navegador.
- Diseño adaptable a móvil, controles por teclado, etiquetas accesibles y respeto de movimiento reducido.

## Estructura

```text
MIR/                         Un directorio por examen; preguntas y soluciones fuente
  demo/exam.json             Entrenamiento de prueba
  MIR_IA_1/exam.json         Primer simulacro médico: 200 preguntas puntuables (v2)
  archive/                  Fuentes de versiones retiradas; historial conservado
usuarios/                    Documentación del modelo; nunca datos reales
src/                         Interfaz, acceso a datos y lógica de puntuación demo
assets/                      Recursos estáticos
supabase/schema.sql          Esquema inicial de tablas, RLS y funciones
supabase/private-access.sql  Restricción a la cuenta privada
docs/PRIVATE_ACCESS.md       Creación de la cuenta y cierre del registro
supabase/tests/security.sql  Comprobaciones de aislamiento para una base de pruebas
scripts/build.py             Valida, elimina soluciones del sitio y genera dist/
scripts/serve.py             Sirve exclusivamente dist/, nunca archivos privados
tests/                       Pruebas de compilación, privacidad, puntuación y API
.github/workflows/pages.yml  Comprobación y publicación en GitHub Pages
```

La paleta visual está centralizada en `src/theme.css`: azul tinta para la estructura, azul para las acciones, violeta para los objetivos y ámbar para las marcas de revisión. Los colores de acierto y error se reservan para los resultados.

## Configurar el acceso privado

Consulta [docs/PRIVATE_ACCESS.md](docs/PRIVATE_ACCESS.md). Incluye los pasos del panel de Supabase, la migración para restringir el acceso y las comprobaciones de conexión y permisos. La contraseña se administra en Supabase Auth; no se almacena en este repositorio.

La configuración local utiliza `config.local.json`, excluido de Git, con la URL del proyecto y su clave pública `sb_publishable_...` o legacy `anon`. Nunca uses claves secretas o `service_role` en la web.

Para una instalación desde cero, `python scripts/prepare_supabase.py` genera `supabase/setup.sql`. Ese instalador es para proyectos sin las tablas de la plataforma. En el proyecto ya instalado utiliza exclusivamente `supabase/private-access.sql` para restringir el acceso.

Las sesiones se guardan en `sessionStorage` para sobrevivir a las recargas. El progreso real está en la base de datos; las respuestas de la cuenta no se guardan en `localStorage`.

## Publicar en GitHub Pages

1. Sube este código a la rama `main` del repositorio.
2. En **Settings → Pages → Build and deployment**, elige **GitHub Actions**.
3. Para activar las cuentas en la versión publicada, añade estas **Repository variables** en **Settings → Secrets and variables → Actions → Variables**:

   | Variable | Valor |
   | --- | --- |
   | `SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | Clave pública `sb_publishable_…` o `anon` |

4. Ejecuta el workflow **Publicar MIR_Prep** o haz un push a `main`. El registro permanece cerrado independientemente de las variables del workflow. La compilación de producción usa `--require-backend` y se detiene si faltan las variables de Supabase: no publica la demo como alternativa.

URL de publicación del repositorio: **https://pablovalle.github.io/MIR_prep/**.

El workflow comprueba el código y publica **solo `dist/`**. No publica `usuarios/`, SQL ni los archivos originales de los exámenes. Las rutas de la interfaz usan `#/…`, así que funcionan al recargar bajo `https://USUARIO.github.io/REPOSITORIO/` sin reglas de servidor.

**Si el repositorio es público, sus archivos fuente también lo son**, incluidas las soluciones de `MIR/*/exam.json`. Para ocultarlas, usa un repositorio fuente privado y publica únicamente el artefacto de Pages, o conserva las fuentes fuera del repositorio público. No pongas jamás credenciales privadas o información de usuarios en Git.

## Exámenes MIR

Para subir los siguientes MIR con un único comando: **`python scripts/publish.py`**, o doble clic en **PUBLICAR_MIR.cmd**. Valida, prueba, importa en Supabase y publica en Pages. La instalación inicial y las credenciales se explican en [publicación automática](docs/AUTOMATIC_PUBLISH.md); después no hace falta abrir el SQL Editor. Los push a `main` también sincronizan los exámenes antes de desplegar.

Consulta [MIR/README.md](MIR/README.md). Crea una carpeta por examen con el formato del ejemplo y un ID versionado. El constructor descubre los exámenes automáticamente. Después importa el SQL en Supabase y publica la nueva versión de la web.

Ya se incluye **MIR_IA_1**, descrito como «MIR generado por Rosa con IA», con 200 preguntas puntuables, sus cuatro opciones y explicaciones. En la versión 2 se han sustituido las preguntas 148 y 181 que estaban anuladas; la versión original y sus intentos se conservan. La plantilla original cubría 51–200; la clave 1–50 se ha completado durante la incorporación. Consulta el [registro de revisión](MIR/MIR_IA_1/REVIEW.md) para conocer su procedencia. No hay un generador de IA conectado y sigue siendo necesaria una revisión clínica independiente del material.

## Puntuación y límites

Cada examen declara sus reglas. La demo usa **+3 acierto, −1 error, 0 blanco**; `netas = puntos / puntos_por_acierto`. Las netas negativas se conservan. Las preguntas anuladas no puntúan ni bloquean la entrega. No se calcula nota oficial, baremo académico, percentil o puesto MIR, ni sustitución automática por preguntas de reserva.

Es necesario resolver todas las preguntas evaluables antes de entregar: elegir una opción o marcar explícitamente «Dejar esta pregunta en blanco». El tiempo es orientativo y registra actividad con la pestaña visible, sin entrega automática. No constituye supervisión antifraude ni mide atención real.

Las cuentas reales requieren conexión para guardar. Si falla, la pantalla conserva los cambios en memoria y muestra el error; no se debe cerrar la pestaña hasta reintentar o recuperar la versión guardada. «Guardar y salir» espera confirmación del servidor. El navegador avisa si se intenta cerrar con cambios pendientes, aunque un cierre forzado puede perderlos.

## Comprobaciones

```powershell
python -m unittest discover -s tests -v
```

Si tienes Node.js 22+ (GitHub Actions lo instala automáticamente):

```powershell
node --test tests/*.test.mjs
```

Construye primero la web para la prueba de recorrido de la aplicación. Las pruebas cubren eliminación de soluciones, exclusión de archivos privados, contenido de exámenes, importación SQL segura, aciertos/errores/blancos/anuladas, netas negativas, persistencia demo, conflictos de guardado, entrega inmutable, cabeceras de autenticación, recuperación de sesión y el recorrido de la interfaz con un DOM de prueba (sin revisión visual). Las restricciones de la cuenta privada se comprueban con `supabase/tests/private-access.sql` en el SQL Editor.

Referencias de arquitectura: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Supabase Auth](https://supabase.com/docs/guides/auth) y [aislamiento por RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
