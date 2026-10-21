# Exámenes

Cada examen tiene su propia carpeta con un `exam.json`. `demo/exam.json` muestra el formato completo. Más adelante se pueden añadir aquí los MIR generados y revisados.

Campos del examen: `id` único y versionado, `title`, `subtitle`, `description`, `category`, `isDemo`, `durationMinutes`, `scoring` y `questions`.

Cada pregunta tiene `id`, `specialty`, `statement`, `options` (2–6 elementos con `id` y `text`), `correctOptionId` y `explanation`. Opcionales: `image` (archivo relativo a la carpeta del examen), `imageAlt` y `voided: true` para anular una pregunta. La compilación comprueba identificadores, claves, puntuaciones y archivos de imagen. Las anuladas no puntúan ni bloquean la entrega; no se implementa sustitución automática por reservas.

1. Duplica la estructura de ejemplo y usa `isDemo: false` para un examen normal.
2. Revisa el contenido médico y las explicaciones antes de publicarlo. La plataforma no genera ni valida contenido médico con IA.
3. Ejecuta `python scripts/build.py` para validar y construir la web.
4. Ejecuta `python scripts/build.py --sql` y carga `supabase/import.sql` en el editor SQL de Supabase, después de `supabase/schema.sql`.
5. Publica la web. El catálogo se construye automáticamente.

Las soluciones se eliminan de los JSON publicados. La corrección de cuentas reales sucede en la base de datos. Solo el entrenamiento demo publica sus soluciones, para poder funcionar sin servidor.

**Versionado:** no cambies el contenido de un examen ya importado. Crea otra carpeta con un `id` nuevo (`mir-001-v2`, por ejemplo). El importador rechaza cambios de contenido bajo el mismo ID, conservando la coherencia del historial.

**Repositorio:** un repositorio público expone también los `exam.json` originales y sus soluciones. Si necesitas mantenerlas confidenciales, conserva el repositorio fuente privado y publica únicamente el artefacto `dist/`. Excluirlas de Pages no las oculta en un repositorio público.
