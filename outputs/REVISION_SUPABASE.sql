-- Diagnóstico de SOLO LECTURA. Ejecutar en el SQL Editor del proyecto del equipo.
-- No contiene datos personales, claves ni cambios de esquema.
select c.relname as tabla, c.relrowsecurity as rls_activado,
       c.relforcerowsecurity as rls_forzado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select p.proname, p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       p.proconfig as configuracion
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname in ('book_experience', 'redeem_coupon') or p.prosecdef)
order by p.proname;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema = 'public'
order by table_name, ordinal_position;
