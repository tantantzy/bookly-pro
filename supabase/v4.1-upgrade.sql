-- Bookly Pro V4.1 non-destructive upgrade
-- Run once if V4 is already installed.



-- ============================================================
-- V4.1 STAFF SERVICE ASSIGNMENTS
-- ============================================================
create table if not exists public.staff_services (
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, service_id)
);
create index if not exists staff_services_service_idx on public.staff_services(service_id);
alter table public.staff_services enable row level security;
drop policy if exists staff_services_public_read on public.staff_services;
create policy staff_services_public_read on public.staff_services for select to anon,authenticated using(true);
drop policy if exists staff_services_owner_insert on public.staff_services;
create policy staff_services_owner_insert on public.staff_services for insert to authenticated with check(
  exists(select 1 from public.staff st where st.id=staff_id and public.is_business_owner(st.business_id))
  and exists(select 1 from public.services sv join public.staff st on st.id=staff_id where sv.id=service_id and sv.business_id=st.business_id)
);
drop policy if exists staff_services_owner_delete on public.staff_services;
create policy staff_services_owner_delete on public.staff_services for delete to authenticated using(
  exists(select 1 from public.staff st where st.id=staff_id and public.is_business_owner(st.business_id))
);
grant select on public.staff_services to anon,authenticated;
grant insert,delete on public.staff_services to authenticated;

-- ============================================================
-- V4.1 IN-APP NOTIFICATIONS
-- ============================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  type text not null check(type in ('new_appointment','appointment_status')),
  title text not null,
  message text not null,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications(recipient_user_id,is_read,created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications for select to authenticated using(recipient_user_id=auth.uid());
drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications for update to authenticated using(recipient_user_id=auth.uid()) with check(recipient_user_id=auth.uid());
grant select,update on public.notifications to authenticated;

create or replace function public.create_appointment_notifications()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  owner_user_id uuid;
  service_name_value text;
  business_name_value text;
begin
  select b.owner_id,b.name into owner_user_id,business_name_value
  from public.businesses b where b.id=new.business_id;
  select s.name into service_name_value from public.services s where s.id=new.service_id;

  if tg_op='INSERT' then
    insert into public.notifications(recipient_user_id,business_id,appointment_id,type,title,message)
    values(owner_user_id,new.business_id,new.id,'new_appointment','New appointment',
      coalesce(new.customer_name,'A customer')||' booked '||coalesce(service_name_value,'a service')||' for '||to_char(new.start_time,'Mon DD, YYYY HH12:MI AM'));
  elsif tg_op='UPDATE' and old.status is distinct from new.status and new.customer_id is not null then
    insert into public.notifications(recipient_user_id,business_id,appointment_id,type,title,message)
    values(new.customer_id,new.business_id,new.id,'appointment_status','Appointment '||initcap(new.status),
      coalesce(business_name_value,'The business')||' changed your '||coalesce(service_name_value,'appointment')||' status to '||replace(new.status,'_',' ')||'.');
  end if;
  return new;
end;
$$;
drop trigger if exists appointment_notifications on public.appointments;
create trigger appointment_notifications
after insert or update of status on public.appointments
for each row execute function public.create_appointment_notifications();

select 'Bookly Pro V4.1 upgrade installed successfully' as result;
