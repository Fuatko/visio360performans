-- Optional setup for GitHub encrypted backups without using/resetting the main
-- postgres database password.
--
-- 1) Replace CHANGE_THIS_LONG_RANDOM_PASSWORD before running.
-- 2) Run in Supabase SQL Editor.
-- 3) Store the resulting pooler URI in GitHub Actions secret SUPABASE_DB_URL:
--    postgresql://visio360_backup.<PROJECT_REF>:PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
--    Example: visio360_backup.bwvvuyqaowbwlodxbbrl (pooler requires role.project_ref)
--
-- The role stores no app data and changes no live rows. It only grants read
-- access needed for pg_dump. Keep this password separate from app/admin users.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'visio360_backup') then
    create role visio360_backup login password 'CHANGE_THIS_LONG_RANDOM_PASSWORD' bypassrls;
  else
    alter role visio360_backup with login password 'CHANGE_THIS_LONG_RANDOM_PASSWORD' bypassrls;
  end if;
end $$;

grant connect on database postgres to visio360_backup;
grant usage on schema public to visio360_backup;
grant select on all tables in schema public to visio360_backup;
grant usage, select on all sequences in schema public to visio360_backup;

-- Keep future public tables readable by the backup user when created by the
-- migration/admin role that runs this statement.
alter default privileges in schema public
  grant select on tables to visio360_backup;

alter default privileges in schema public
  grant usage, select on sequences to visio360_backup;

comment on role visio360_backup is
  'Read-only role for encrypted pg_dump backups of the public application schema.';
