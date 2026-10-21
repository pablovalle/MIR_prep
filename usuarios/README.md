# Datos de usuario

Esta carpeta documenta el modelo, **no almacena cuentas ni datos personales**. GitHub Pages y los archivos del repositorio son públicos: no pongas aquí nombres, correos, contraseñas, resultados ni exportaciones reales.

Los usuarios se administran en **Supabase Authentication**; las contraseñas no pasan por tablas propias ni archivos. Los perfiles se guardan en `public.profiles` y los intentos en `public.attempts`, con acceso restringido a su propietario por RLS y funciones autenticadas. Consulta `supabase/schema.sql`.

El modo demo usa únicamente el almacenamiento de este navegador. No crea una cuenta ni ofrece sincronización entre dispositivos. Se puede borrar desde «Mi perfil».
