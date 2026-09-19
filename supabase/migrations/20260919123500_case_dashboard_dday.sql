-- MASTER ERP Phase 2: CASE dashboard + D-Day automation
-- Additive schema changes and task synchronization for active confirmed reservations.

alter table public.ops_reservations
  add column if not exists departure_notice_done boolean not null default false,
  add column if not exists departure_notice_at timestamptz;

create or replace function public.ops_sync_reservation_tasks(p_reservation_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  r public.ops_reservations%rowtype;
  f public.ops_reservation_financial_summary%rowtype;
  v_passport_done boolean;
  v_balance_done boolean;
  v_final_done boolean;
  v_midair_done boolean;
  v_fx_done boolean;
  v_reconfirm_done boolean;
  v_briefing_done boolean;
  v_docs_done boolean;
  v_departure_notice_done boolean;
begin
  select * into r from public.ops_reservations where id = p_reservation_id;
  if not found then return; end if;

  select * into f
  from public.ops_reservation_financial_summary
  where reservation_id = p_reservation_id;

  v_passport_done := coalesce(r.passport_copy_received,false);
  v_balance_done := coalesce(
    f.receivable_amount,
    greatest(coalesce(f.final_sale_amount,f.sale_amount,0)-coalesce(f.paid_amount,0),0)
  ) <= 0;
  v_final_done := coalesce(r.final_check_done,false);
  v_midair_done := (not coalesce(r.intermediate_air_segment_exists,false))
                   or coalesce(r.intermediate_air_nonrefundable_notice_done,false);
  v_fx_done := (r.fx_currency is null)
               or (coalesce(r.fx_notice_done,false) and r.balance_exchange_rate is not null);
  v_reconfirm_done := coalesce(r.air_recheck_done,false)
                      and coalesce(r.supplier_confirmation_received,false);
  v_briefing_done := coalesce(r.briefing_notice_done,false);
  v_docs_done := coalesce(r.travel_docs_delivered,false);
  v_departure_notice_done := coalesce(r.departure_notice_done,false);

  insert into public.ops_reservation_tasks(
    organization_id,reservation_id,task_type,task_label,due_date,status,priority,
    completed_at,auto_generated,updated_at
  )
  values
    (
      r.organization_id,r.id,'balance','잔금 결제 확인',
      coalesce(r.balance_due_date, r.departure_date - 45),
      case when v_balance_done then 'completed' else 'pending' end,
      'normal',case when v_balance_done then now() else null end,true,now()
    ),
    (
      r.organization_id,r.id,'final_check','파이널 체크',
      coalesce(r.final_check_due_date, r.departure_date - 45),
      case when v_final_done then 'completed' else 'pending' end,
      'normal',case when v_final_done then now() else null end,true,now()
    ),
    (
      r.organization_id,r.id,'passport','여권 사본 수령',
      coalesce(r.passport_due_date, r.departure_date - 30),
      case when v_passport_done then 'completed' else 'pending' end,
      'normal',case when v_passport_done then now() else null end,true,now()
    ),
    (
      r.organization_id,r.id,'intermediate_air_notice','중간항공 환불불가 안내',
      case when r.intermediate_air_segment_exists
        then coalesce(r.balance_due_date, r.departure_date - 45)
        else null end,
      case when v_midair_done then 'completed' else 'pending' end,
      'normal',case when v_midair_done then now() else null end,true,now()
    ),
    (
      r.organization_id,r.id,'fx_notice','환율 변동 및 잔금 재확인',
      coalesce(r.balance_due_date, r.departure_date - 45),
      case when v_fx_done then 'completed' else 'pending' end,
      'normal',case when v_fx_done then now() else null end,true,now()
    ),
    (
      r.organization_id,r.id,'reconfirm','항공·호텔 재확인',
      r.departure_date - 15,
      case when v_reconfirm_done then 'completed' else 'pending' end,
      'normal',case when v_reconfirm_done then now() else null end,true,now()
    ),
    (
      r.organization_id,r.id,'briefing','여행 설명회·안내 확인',
      r.departure_date - 10,
      case when v_briefing_done then 'completed' else 'pending' end,
      'normal',case when v_briefing_done then now() else null end,true,now()
    ),
    (
      r.organization_id,r.id,'travel_docs','최종 여행서류 전달',
      r.departure_date - 7,
      case when v_docs_done then 'completed' else 'pending' end,
      'normal',case when v_docs_done then now() else null end,true,now()
    ),
    (
      r.organization_id,r.id,'departure_notice','출발 전 최종 안내',
      r.departure_date - 1,
      case when v_departure_notice_done then 'completed' else 'pending' end,
      'normal',case when v_departure_notice_done then now() else null end,true,now()
    )
  on conflict (reservation_id, task_type) where auto_generated = true
  do update set
    task_label = excluded.task_label,
    due_date = excluded.due_date,
    status = excluded.status,
    completed_at = case
      when excluded.status='completed'
        then coalesce(public.ops_reservation_tasks.completed_at, now())
      else null
    end,
    updated_at = now();

  update public.ops_reservation_tasks t
  set priority = case
      when t.status='completed' then 'low'
      when t.due_date is not null and t.due_date < current_date then 'urgent'
      when t.due_date is not null and t.due_date <= current_date + 3 then 'high'
      when t.due_date is not null and t.due_date <= current_date + 7 then 'high'
      else 'normal'
    end,
    updated_at = now()
  where t.reservation_id = r.id and t.auto_generated = true;

  delete from public.ops_reservation_tasks
  where reservation_id=r.id
    and auto_generated=true
    and task_type='intermediate_air_notice'
    and not coalesce(r.intermediate_air_segment_exists,false);

  delete from public.ops_reservation_tasks
  where reservation_id=r.id
    and auto_generated=true
    and task_type='fx_notice'
    and r.fx_currency is null;
end;
$function$;

drop trigger if exists trg_ops_reservations_sync_tasks on public.ops_reservations;
create trigger trg_ops_reservations_sync_tasks
after insert or update of
  departure_date,
  balance_due_date,
  passport_due_date,
  final_check_due_date,
  settlement_status,
  balance_notice_done,
  final_check_done,
  passport_copy_received,
  intermediate_air_segment_exists,
  intermediate_air_nonrefundable_notice_done,
  fx_currency,
  fx_notice_done,
  air_recheck_done,
  supplier_confirmation_received,
  briefing_notice_done,
  briefing_at,
  travel_docs_delivered,
  departure_notice_done
on public.ops_reservations
for each row execute function public.trg_ops_sync_reservation_tasks();

create or replace view public.ops_case_dashboard
with (security_invoker=true)
as
with task_summary as (
  select
    organization_id,
    reservation_id,
    count(*) filter (where status in ('pending','in_progress')) as pending_tasks,
    count(*) filter (
      where status in ('pending','in_progress')
        and due_date is not null
        and due_date < current_date
    ) as overdue_tasks,
    count(*) filter (
      where status in ('pending','in_progress')
        and due_date is not null
        and due_date between current_date and current_date + 7
    ) as due_7_tasks,
    min(due_date) filter (where status in ('pending','in_progress')) as next_task_due_date
  from public.ops_reservation_tasks
  group by organization_id,reservation_id
),
next_task as (
  select distinct on (organization_id,reservation_id)
    organization_id,reservation_id,task_type,task_label,due_date
  from public.ops_reservation_tasks
  where status in ('pending','in_progress')
  order by organization_id,reservation_id,due_date nulls last,created_at
),
quote_summary as (
  select organization_id,reservation_id,
    count(*) as quote_count,
    count(*) filter (where selected) as selected_quote_count
  from public.ops_quotes
  group by organization_id,reservation_id
),
contract_summary as (
  select organization_id,reservation_id,
    count(*) as contract_count,
    count(*) filter (where is_active) as active_contract_count
  from public.ops_contracts
  group by organization_id,reservation_id
),
request_summary as (
  select organization_id,reservation_id,
    count(*) as request_count
  from public.ops_reservation_requests
  group by organization_id,reservation_id
),
request_item_summary as (
  select organization_id,reservation_id,
    count(*) as request_item_count,
    count(*) filter (where status='confirmed') as request_confirmed_count
  from public.ops_reservation_request_items
  group by organization_id,reservation_id
),
booking_summary as (
  select organization_id,reservation_id,
    count(*) filter (where kind='air') as air_count,
    count(*) filter (where kind='hotel') as hotel_count,
    count(*) filter (where kind='land') as land_count
  from (
    select organization_id,reservation_id,'air'::text as kind from public.ops_air_bookings
    union all
    select organization_id,reservation_id,'hotel'::text as kind from public.ops_hotel_bookings
    union all
    select organization_id,reservation_id,'land'::text as kind from public.ops_land_bookings
  ) b
  group by organization_id,reservation_id
),
reconciliation_summary as (
  select organization_id,reservation_id,
    count(*) filter (where resolution_status='open') as open_reconciliation_count,
    count(*) filter (where resolution_status='open' and severity='high') as high_reconciliation_count
  from public.ops_source_reconciliations
  group by organization_id,reservation_id
)
select
  r.id as reservation_id,
  r.organization_id,
  r.reservation_code,
  r.product_type,
  r.customer_name,
  r.destination,
  r.departure_date,
  (r.departure_date-current_date) as days_to_departure,
  r.manager_name,
  r.case_stage,
  r.case_status,
  coalesce(f.final_sale_amount,r.sale_amount,0) as final_sale_amount,
  coalesce(f.paid_amount,0) as paid_amount,
  coalesce(f.receivable_amount,0) as receivable_amount,
  coalesce(f.expense_amount,0) as expense_amount,
  coalesce(f.expected_profit,0) as expected_profit,
  f.payment_status,
  coalesce(t.pending_tasks,0) as pending_tasks,
  coalesce(t.overdue_tasks,0) as overdue_tasks,
  coalesce(t.due_7_tasks,0) as due_7_tasks,
  t.next_task_due_date,
  nt.task_type as next_task_type,
  nt.task_label as next_task_label,
  coalesce(q.quote_count,0) as quote_count,
  coalesce(q.selected_quote_count,0) as selected_quote_count,
  coalesce(c.contract_count,0) as contract_count,
  coalesce(c.active_contract_count,0) as active_contract_count,
  coalesce(req.request_count,0) as request_count,
  coalesce(ri.request_item_count,0) as request_item_count,
  coalesce(ri.request_confirmed_count,0) as request_confirmed_count,
  coalesce(b.air_count,0) as air_count,
  coalesce(b.hotel_count,0) as hotel_count,
  coalesce(b.land_count,0) as land_count,
  coalesce(rec.open_reconciliation_count,0) as open_reconciliation_count,
  coalesce(rec.high_reconciliation_count,0) as high_reconciliation_count,
  case
    when coalesce(t.overdue_tasks,0)>0
      or coalesce(rec.high_reconciliation_count,0)>0
      then 'danger'
    when coalesce(t.due_7_tasks,0)>0
      or coalesce(rec.open_reconciliation_count,0)>0
      or (
        coalesce(f.receivable_amount,0)>0
        and r.departure_date-current_date <= 45
      )
      then 'warning'
    else 'ready'
  end as case_health
from public.ops_reservations r
left join public.ops_reservation_financial_summary f on f.reservation_id=r.id
left join task_summary t on t.organization_id=r.organization_id and t.reservation_id=r.id
left join next_task nt on nt.organization_id=r.organization_id and nt.reservation_id=r.id
left join quote_summary q on q.organization_id=r.organization_id and q.reservation_id=r.id
left join contract_summary c on c.organization_id=r.organization_id and c.reservation_id=r.id
left join request_summary req on req.organization_id=r.organization_id and req.reservation_id=r.id
left join request_item_summary ri on ri.organization_id=r.organization_id and ri.reservation_id=r.id
left join booking_summary b on b.organization_id=r.organization_id and b.reservation_id=r.id
left join reconciliation_summary rec on rec.organization_id=r.organization_id and rec.reservation_id=r.id;

grant select on public.ops_case_dashboard to authenticated;

select public.ops_sync_reservation_tasks(id)
from public.ops_reservations
where status='confirmed' and departure_date>=current_date;
