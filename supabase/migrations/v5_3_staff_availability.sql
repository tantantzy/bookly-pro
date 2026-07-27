-- Bookly Pro V5.3 — staff schedules, recurring breaks, time off,
-- and server-side double-booking protection.
-- Non-destructive: existing businesses, staff, appointments, and availability remain intact.

begin;

create table if not exists public.staff_breaks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_breaks_valid_time check (starts_at < ends_at)
);

create index if not exists staff_breaks_staff_day_idx
  on public.staff_breaks(staff_id, day_of_week);

create table if not exists public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint staff_time_off_valid_range check (starts_on <= ends_on)
);

create index if not exists staff_time_off_staff_dates_idx
  on public.staff_time_off(staff_id, starts_on, ends_on);

alter table public.staff_breaks enable row level security;
alter table public.staff_time_off enable row level security;

drop policy if exists staff_breaks_public_read on public.staff_breaks;
create policy staff_breaks_public_read on public.staff_breaks
for select to anon, authenticated using (true);

drop policy if exists staff_breaks_owner_insert on public.staff_breaks;
create policy staff_breaks_owner_insert on public.staff_breaks
for insert to authenticated with check (
  exists (
    select 1 from public.staff s
    where s.id = staff_id and public.is_business_owner(s.business_id)
  )
);

drop policy if exists staff_breaks_owner_update on public.staff_breaks;
create policy staff_breaks_owner_update on public.staff_breaks
for update to authenticated using (
  exists (
    select 1 from public.staff s
    where s.id = staff_id and public.is_business_owner(s.business_id)
  )
) with check (
  exists (
    select 1 from public.staff s
    where s.id = staff_id and public.is_business_owner(s.business_id)
  )
);

drop policy if exists staff_breaks_owner_delete on public.staff_breaks;
create policy staff_breaks_owner_delete on public.staff_breaks
for delete to authenticated using (
  exists (
    select 1 from public.staff s
    where s.id = staff_id and public.is_business_owner(s.business_id)
  )
);

drop policy if exists staff_time_off_public_read on public.staff_time_off;
create policy staff_time_off_public_read on public.staff_time_off
for select to anon, authenticated using (true);

drop policy if exists staff_time_off_owner_insert on public.staff_time_off;
create policy staff_time_off_owner_insert on public.staff_time_off
for insert to authenticated with check (
  exists (
    select 1 from public.staff s
    where s.id = staff_id and public.is_business_owner(s.business_id)
  )
);

drop policy if exists staff_time_off_owner_update on public.staff_time_off;
create policy staff_time_off_owner_update on public.staff_time_off
for update to authenticated using (
  exists (
    select 1 from public.staff s
    where s.id = staff_id and public.is_business_owner(s.business_id)
  )
) with check (
  exists (
    select 1 from public.staff s
    where s.id = staff_id and public.is_business_owner(s.business_id)
  )
);

drop policy if exists staff_time_off_owner_delete on public.staff_time_off;
create policy staff_time_off_owner_delete on public.staff_time_off
for delete to authenticated using (
  exists (
    select 1 from public.staff s
    where s.id = staff_id and public.is_business_owner(s.business_id)
  )
);

grant select on public.staff_breaks, public.staff_time_off to anon, authenticated;
grant insert, update, delete on public.staff_breaks, public.staff_time_off to authenticated;

-- Uses a staff member's custom weekly schedule when one exists.
-- Staff without a custom schedule continue using the business opening hours.
create or replace function public.get_available_booking_slots(
  p_business_id uuid,
  p_service_id uuid,
  p_date date,
  p_staff_id uuid default null
)
returns table(slot_start timestamptz, staff_id uuid, staff_name text)
language sql
stable
security definer
set search_path = public
as $$
with business_data as (
  select id, coalesce(timezone, 'UTC') as tz
  from public.businesses
  where id = p_business_id and is_active = true
),
service_data as (
  select id, duration_minutes
  from public.services
  where id = p_service_id
    and business_id = p_business_id
    and is_active = true
),
eligible_staff as (
  select s.id, s.name,
    exists (
      select 1 from public.staff_availability sa0
      where sa0.staff_id = s.id and sa0.is_active = true
    ) as has_custom_schedule
  from public.staff s
  join public.staff_services ss
    on ss.staff_id = s.id and ss.service_id = p_service_id
  where s.business_id = p_business_id
    and s.is_active = true
    and (p_staff_id is null or s.id = p_staff_id)
),
staff_windows as (
  select es.id as staff_id, es.name as staff_name,
         sa.starts_at, sa.ends_at, b.tz
  from eligible_staff es
  join public.staff_availability sa
    on sa.staff_id = es.id
   and sa.day_of_week = extract(dow from p_date)::int
   and sa.is_active = true
  cross join business_data b
  where es.has_custom_schedule

  union all

  select es.id, es.name, bh.opens_at, bh.closes_at, b.tz
  from eligible_staff es
  join public.business_hours bh
    on bh.business_id = p_business_id
   and bh.day_of_week = extract(dow from p_date)::int
   and bh.is_closed = false
  cross join business_data b
  where not es.has_custom_schedule
),
slots as (
  select sw.staff_id, sw.staff_name, sw.tz,
         (gs at time zone sw.tz) as slot_start,
         sd.duration_minutes
  from staff_windows sw
  cross join service_data sd
  cross join lateral generate_series(
    p_date + sw.starts_at,
    p_date + sw.ends_at - make_interval(mins => sd.duration_minutes),
    interval '30 minutes'
  ) gs
)
select s.slot_start, s.staff_id, s.staff_name
from slots s
where s.slot_start > now()
  and not exists (
    select 1 from public.staff_time_off sto
    where sto.staff_id = s.staff_id
      and p_date between sto.starts_on and sto.ends_on
  )
  and not exists (
    select 1 from public.staff_breaks sb
    where sb.staff_id = s.staff_id
      and sb.day_of_week = extract(dow from p_date)::int
      and sb.is_active = true
      and (s.slot_start at time zone s.tz)::time < sb.ends_at
      and ((s.slot_start + make_interval(mins => s.duration_minutes)) at time zone s.tz)::time > sb.starts_at
  )
  and not exists (
    select 1 from public.appointments a
    where a.staff_id = s.staff_id
      and a.status in ('pending', 'confirmed')
      and a.start_time < s.slot_start + make_interval(mins => s.duration_minutes)
      and a.end_time > s.slot_start
  )
order by s.slot_start, s.staff_name;
$$;

grant execute on function public.get_available_booking_slots(uuid, uuid, date, uuid)
to anon, authenticated;

-- Protect against two customers taking the same staff time simultaneously.
create or replace function public.prevent_staff_double_booking()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.staff_id is null or new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.staff_id::text, 0));

  if exists (
    select 1
    from public.appointments a
    where a.staff_id = new.staff_id
      and a.id is distinct from new.id
      and a.status in ('pending', 'confirmed')
      and a.start_time < new.end_time
      and a.end_time > new.start_time
  ) then
    raise exception 'This staff member is no longer available at that time.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_prevent_double_booking on public.appointments;
create trigger appointments_prevent_double_booking
before insert or update of staff_id, start_time, end_time, status
on public.appointments
for each row execute function public.prevent_staff_double_booking();

commit;

select 'Bookly Pro V5.3 staff availability installed successfully' as result;
