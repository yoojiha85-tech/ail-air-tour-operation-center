-- Keep the primary administrator account able to manage staff invitations
-- and sign in to the operations center.
update public.ops_members
set
  role = 'master',
  active = true,
  permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object('staff_manage', true)
where organization_id = '1202b7db-c980-43a0-a12c-0db1ac6d042d'
  and lower(email) = lower('yoojiha85@gmail.com');
