-- Run once in Supabase SQL Editor after backup-user.sql and backup-ops.sql.
-- Lets the GitHub backup job write status rows into backup_runs (metadata only).
-- Does not change evaluation/answer data.

grant insert, update on public.backup_runs to visio360_backup;

-- Optional: confirm grants
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'backup_runs'
  and grantee = 'visio360_backup';
