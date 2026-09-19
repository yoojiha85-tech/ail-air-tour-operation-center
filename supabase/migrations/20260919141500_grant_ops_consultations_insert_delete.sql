-- Bugfix: the previous migration (20260919140000) added INSERT/DELETE RLS
-- policies on ops_consultations, but RLS policies only apply after the
-- underlying table-level GRANT passes. The authenticated role only had
-- SELECT/UPDATE granted, so staff hit "permission denied for table
-- ops_consultations" when trying to log an offline consultation or delete
-- a mistaken entry.

grant insert, delete on public.ops_consultations to authenticated;
