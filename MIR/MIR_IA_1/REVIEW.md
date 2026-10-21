# MIR_IA_1 · versión 2

- Nombre visible: **MIR_IA_1**.
- Descripción: **MIR generado por Rosa con IA**.
- ID inmutable: `mir-ia-1-v2`.
- **200 preguntas puntuables**, cuatro opciones y una única respuesta correcta por pregunta; sin anuladas ni reservas.
- +3 por acierto, −1 por error y 0 por blanco. Máximo: **600 puntos / 200 netas**.
- Duración orientativa: 270 minutos, sin entrega automática.

## Sustituciones solicitadas

Se han sustituido las dos preguntas anuladas de la primera versión:

| Número | Nueva pregunta | Clave | Referencia |
| --- | --- | --- | --- |
| 148 | Caso de pérdida de campo visual periférico, excavación papilar y ángulo iridocorneal abierto. | C: glaucoma primario de ángulo abierto. | [National Eye Institute: glaucoma](https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/glaucoma). |
| 181 | Interpretación frecuentista de un IC del 95 % para una diferencia media de presión arterial. | C: cobertura del procedimiento en muestreos repetidos, bajo sus supuestos. | [Cochrane Handbook, capítulo 15](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-15), apartado 15.3.3. |

Las otras 198 preguntas mantienen exactamente sus enunciados, opciones, claves y explicaciones anteriores. La clave propuesta de las preguntas 1–50 sigue siendo la documentada en el [registro original](../archive/MIR_IA_1_v1/REVIEW.md). Las explicaciones y estas comprobaciones dirigidas no constituyen una revisión clínica independiente del simulacro completo.

## Conservación del historial

La primera versión, `mir-ia-1-v1`, se conserva sin modificar en [MIR/archive/MIR_IA_1_v1](../archive/MIR_IA_1_v1/REVIEW.md) y en Supabase. Sus intentos guardados contienen su propio examen y siguen accesibles desde el panel y el historial. No se transforman respuestas ni resultados anteriores.

La carpeta `MIR/archive/` no se incluye en el catálogo ni en nuevas importaciones: solo la versión 2 se ofrece para empezar nuevos intentos de MIR_IA_1.

## Publicación

Ejecutar **`python scripts/publish.py`**: valida, prueba, importa la nueva versión en Supabase y publica Pages automáticamente. No hace falta copiar SQL ni cambiar credenciales.
