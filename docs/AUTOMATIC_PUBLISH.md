# Publicación automática de MIR

Una vez configurado, añade cada simulacro a su carpeta `MIR/<nombre>/exam.json` y ejecuta desde este repositorio:

```powershell
python scripts/publish.py
```

En Windows también puedes hacer doble clic en **PUBLICAR_MIR.cmd**.

El comando valida todos los exámenes, construye la web y ejecuta las pruebas. Comprueba Supabase, importa los exámenes nuevos, guarda los cambios del repositorio en un commit y hace push a `main`. Espera al resultado de GitHub Actions y muestra la URL de Pages. Publica los cambios actuales del repositorio, además de los MIR; revisa que sean los que quieres subir.

El workflow también sincroniza Supabase antes de publicar Pages. Si ya haces un commit y push desde Codex o GitHub, esa sincronización se ejecuta sin abrir el SQL Editor. Si falla la carga o las pruebas, Pages conserva la publicación anterior.

Las importaciones son idempotentes: repetir el comando no duplica exámenes ni cambia intentos, respuestas o cuentas. Un ID existente con contenido diferente se rechaza; crea una nueva versión del examen. En la llamada de importación se valida el lote entero antes de insertar, dentro de una transacción, y se serializan las llamadas concurrentes.

## Configuración inicial, una sola vez

Requiere Python 3.11+, Git, GitHub CLI (`gh auth login`) y Node.js 22+. El script también detecta el Node incluido en la instalación local de Playwright de Python, si existe.

La URL y la clave pública ya se leen de `config.local.json` o de `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Para configurar la parte privada:

```powershell
python scripts/configure_publish.py
```

Solicita la clave secreta del proyecto con entrada oculta. Si el importador no está instalado, solicita además un [token personal de Supabase](https://supabase.com/dashboard/account/tokens) con permiso **Database → Write** para ese proyecto, ejecuta `supabase/automatic-import.sql` mediante la API de gestión y descarta el token personal. No hace falta instalar el CLI de Supabase, copiar SQL ni configurar GitHub Secrets a mano.

La instalación crea únicamente `public.import_mir_exams`, ejecutable por `service_role`. `anon` y `authenticated` no tienen permiso. La tabla de soluciones continúa en el esquema privado. No se abre el registro ni se cambian las restricciones de Esther.

La clave secreta queda cifrada con Windows DPAPI para el usuario actual en `publish.local.json`, excluido de Git. También se guarda como **secreto de GitHub Actions**, no como variable pública. El token personal no se persiste. La compilación solo copia los archivos públicos definidos por el constructor; ni esta configuración, ni los scripts, ni el SQL entran en `dist/`.

En Linux/CI suministra `SUPABASE_SECRET_KEY` mediante el almacén de secretos o el entorno. El archivo cifrado local es específico de Windows y de su usuario; no lo copies a otro equipo.

## Otras opciones

```powershell
# Comprobar qué falta en Supabase sin insertar nada
python scripts/sync_exams.py --check

# Cargar exámenes sin publicar la web
python scripts/sync_exams.py

# Publicar sin esperar al final del despliegue
python scripts/publish.py --no-wait
```

La clave `sb_secret_…` identifica al servicio y permite llamar al importador, pero no sustituye un token personal para instalar funciones SQL. Consulta las referencias oficiales de [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [autenticación de la API de gestión](https://supabase.com/docs/reference/api/introduction) y [ejecución de SQL](https://supabase.com/docs/reference/api/v1-run-a-query).
