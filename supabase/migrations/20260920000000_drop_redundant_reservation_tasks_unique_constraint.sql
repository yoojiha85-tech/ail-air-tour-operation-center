-- ops_reservation_tasks_reservation_id_task_type_key duplicated the scope of
-- uq_ops_reservation_tasks_auto (the partial unique index that
-- ops_sync_reservation_tasks() actually targets via
-- ON CONFLICT (reservation_id, task_type) WHERE auto_generated = true).
-- The unconditional table constraint blocked any manual task from ever
-- sharing a task_type with an auto-generated task on the same reservation,
-- which would break the reservation-update trigger the moment a manual
-- task-creation feature is added. No current rows collide (verified via
-- group-by count check), so this is a pure schema cleanup with no data impact.
alter table public.ops_reservation_tasks
  drop constraint ops_reservation_tasks_reservation_id_task_type_key;
