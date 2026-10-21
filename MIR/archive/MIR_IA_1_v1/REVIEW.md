# MIR_IA_1 · registro de incorporación

Simulacro original de entrenamiento a partir del material de IA aportado el 21 de octubre de 2026. Se han unido los fragmentos, ordenado las preguntas del 1 al 200 y conservado sus cuatro opciones. No se incluyen las cabeceras, la firma ni los datos personales del correo.

- ID inmutable: `mir-ia-1-v1`. Nombre visible: **MIR_IA_1**.
- 200 preguntas, **198 evaluables** y **2 anuladas**, sin preguntas de reserva.
- +3 por acierto, −1 por error, 0 por blanco. Netas = puntos / 3. Máximo: **594 puntos / 198 netas**.
- Duración elegida para el entrenamiento: 270 minutos orientativos, sin entrega automática.
- Se han añadido explicaciones para la revisión posterior. La incorporación incluye comprobaciones dirigidas, no una revisión clínica exhaustiva e independiente de las 200 preguntas.

## Procedencia de la plantilla

El material aportado no incluía las respuestas 1–50. Esta es la **clave propuesta durante la incorporación**, pendiente de revisión clínica independiente:

```text
1C 2A 3B 4D 5C 6A 7B 8D 9A 10C
11B 12A 13D 14C 15B 16D 17A 18C 19B 20D
21A 22C 23B 24D 25C 26A 27B 28D 29C 30A
31D 32B 33C 34A 35D 36B 37C 38A 39D 40B
41C 42A 43D 44B 45C 46A 47D 48B 49C 50A
```

Las respuestas **51–200 conservan exactamente las letras de la plantilla aportada**, incluidas las C pretendidas para las preguntas 148 y 181. Esas dos letras se mantienen únicamente por trazabilidad: ambas preguntas tienen `voided: true`, no se responden ni puntúan y no bloquean la entrega.

## Incidencias

| Pregunta | Tratamiento | Motivo |
| --- | --- | --- |
| 148 | Anulada al incorporar | La plantilla indica infección vírica como causa más frecuente en niños. La evidencia pediátrica incluye predominio bacteriano y esa respuesta no se ofrece. El enunciado carece del contexto necesario para sostener una respuesta universal. Se conserva el texto, sin convertir la C en una respuesta válida. |
| 181 | Anulada, como ya advertía el material | Ninguna opción expresa la interpretación frecuentista: el 95 % describe la cobertura del procedimiento en muestreos repetidos, no una probabilidad del parámetro fijo en un intervalo observado. |
| 7 | Se mantiene B, con matiz en la explicación | «Principal» es impreciso sin población; el tabaquismo es el único factor modificable entre las opciones. |
| 12 | Se mantiene A, con matiz | El enunciado es redundante al preguntar por la causa de una exacerbación ya descrita como infecciosa. |
| 26 | Se mantiene A, con matiz | La única opción compatible es colon y recto; no identifica un segmento de mayor frecuencia universal. |
| 121, 123 y 130 | Se mantienen las claves, con matices | Los casos orientan al diagnóstico propuesto, pero son resúmenes que no documentan todos los criterios diagnósticos ni excluyen causas alternativas. |

## Referencias de las comprobaciones dirigidas

- Preguntas 1 y 200: [NICE NG185, reperfusión en el infarto con elevación del ST](https://www.nice.org.uk/guidance/ng185/chapter/Recommendations), apartado 1.1.
- Pregunta 11: [NICE NG115, ventilación no invasiva en exacerbaciones de EPOC](https://www.nice.org.uk/guidance/ng115/chapter/Recommendations), apartados 1.3.30–1.3.32.
- Pregunta 148: [Patel et al. Clinical features of bacterial conjunctivitis in children, estudio prospectivo, PMID 17119185](https://pubmed.ncbi.nlm.nih.gov/17119185/). La frecuencia varía con la población y el contexto; este estudio no permite sostener la C como regla general pediátrica.
- Preguntas 175–177: [Ley 41/2002, texto consolidado del BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2002-22188), autonomía, instrucciones previas y confidencialidad.
- Pregunta 181 y conceptos de interpretación estadística: [Cochrane Handbook, capítulo 15](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-15), especialmente 15.3.3.

Estas referencias respaldan las comprobaciones indicadas; no son una validación global del simulacro ni acreditan que prediga preguntas del MIR 2027.

## Carga en la plataforma

Ejecutar `python scripts/build.py --sql --require-backend`. Importar el archivo generado `supabase/import.sql` en el **SQL Editor del proyecto ya configurado**. El archivo añade los exámenes de forma transaccional e idempotente, sin modificar cuentas, permisos ni intentos. No volver a ejecutar el instalador inicial.

Después, publicar la compilación en Pages. Las soluciones se envían a Supabase y se eliminan del artefacto web. El repositorio fuente público sí permite consultar `exam.json`, como ya se indica en la documentación general.

Una vez importado, no cambiar el contenido bajo el mismo ID. Cualquier corrección posterior requiere una nueva versión para no alterar el significado de los intentos guardados.
