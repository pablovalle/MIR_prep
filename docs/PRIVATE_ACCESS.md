# Acceso privado de Esther

El formulario de MIR_Prep acepta el usuario **`esthermolinero`** y una contraseña. No hay registro público ni acceso a la demo en la instalación conectada a Supabase.

Supabase Auth mantiene internamente la identidad `esthermolinero@users.mir-prep.invalid`. Es un alias técnico, no un buzón: Esther no necesita introducir un correo. La contraseña se establece en Supabase y no se incluye en el código ni en los archivos SQL.

## Completar la configuración en Supabase

La clave pública permite conectar la aplicación, pero no crear usuarios administrativos ni cambiar las opciones de autenticación. Estos pasos se hacen desde tu panel:

1. En [Authentication → Sign In / Providers](https://supabase.com/dashboard/project/lwkbrhjrvpdrqfiszyxr/auth/providers), desactiva **Allow new users to sign up** y guarda. Mantén **Email** habilitado, ya que proporciona el acceso con contraseña.
2. En [Authentication → Users](https://supabase.com/dashboard/project/lwkbrhjrvpdrqfiszyxr/auth/users), selecciona **Add user → Create new user**:
   - Email: `esthermolinero@users.mir-prep.invalid`.
   - Password: la contraseña que has elegido para Esther.
   - **Auto Confirm User**: activado. Usa creación directa, no invitación por correo.
3. En el [SQL Editor](https://supabase.com/dashboard/project/lwkbrhjrvpdrqfiszyxr/sql/new), ejecuta [supabase/private-access.sql](../supabase/private-access.sql). El archivo comprueba que la cuenta existe y está confirmada antes de restringir el acceso.

La migración restringe las lecturas y los cambios de perfiles e intentos mediante políticas RLS adicionales. También comprueba la identidad en las funciones de inicio, guardado y entrega, que usan permisos elevados para corregir los exámenes. La identidad se valida contra `auth.users`, sin confiar en campos de perfil editables por el usuario.

Los usuarios y resultados de las pruebas anteriores se conservan, pero esas cuentas pierden el acceso a los datos y funciones de MIR_Prep. No es necesario borrarlos.

Para regenerar la migración si cambia la lógica de los exámenes:

```powershell
python scripts/prepare_private_access.py
```

El identificador autorizado se define en `src/access.js`; el generador SQL toma el mismo valor. La migración puede ejecutarse de nuevo. No vuelvas a ejecutar `schema.sql` sobre la instalación existente.

## Comprobar el cierre y el acceso

```powershell
python scripts/build.py
python scripts/check_supabase.py
python scripts/check_private_account.py
```

La última orden pide la contraseña con entrada oculta, valida el login y comprueba el acceso al perfil e historial sin crear exámenes ni guardar credenciales. Su sesión de diagnóstico se cierra sin revocar la sesión del navegador.

También puedes ejecutar [supabase/tests/private-access.sql](../supabase/tests/private-access.sql) en el SQL Editor. Verifica que otra identidad, incluso usando el mismo nombre en sus metadatos, no pueda consultar datos ni iniciar, guardar o entregar exámenes. Después comprueba el recorrido con la cuenta privada. Todo se ejecuta dentro de una transacción que termina en `rollback`: no cambia el historial.

`supabase/tests/security.sql` corresponde al esquema inicial con varias cuentas de prueba. Una vez restringido el acceso, utiliza `private-access.sql` como comprobación de integración.

Abre **http://127.0.0.1:4173/** y recarga con **Ctrl + F5**. El acceso es con usuario y contraseña, sin formulario de registro. Si había una sesión de pruebas abierta, la aplicación la cierra localmente para mostrar el nuevo login.

## Contraseña y recuperación

Desde una sesión iniciada, **Mi perfil → Cambiar mi contraseña** permite elegir otra contraseña. El alias interno no recibe correos de recuperación. Si se pierde el acceso, el propietario debe restablecer la contraseña desde la administración de Supabase.

## GitHub Pages

Solo necesitas las variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` para publicar la web. El constructor fuerza `allowSignup: false`, incluso si existe una variable antigua `ALLOW_SIGNUP=true`. El cierre del registro en el servidor y las restricciones SQL permanecen en Supabase.

Referencias: [configuración del registro](https://supabase.com/docs/guides/auth/general-configuration) y [creación administrativa de usuarios confirmados](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
