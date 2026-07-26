-- BOOKLY PRO V4 — COMPLETE SUPABASE SCHEMA
-- CLEAN INSTALL: this removes existing Bookly tables and their data.

create extension if not exists pgcrypto;

drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.appointment_status_history cascade;
drop table if exists public.appointments cascade;
drop table if exists public.staff_availability cascade;
drop table if exists public.business_hours cascade;
drop table if exists public.staff cascade;
drop table if exists public.services cascade;
drop table if exists public.profiles cascade;
drop table if exists public.businesses cascade;
drop function if exists public.log_appointment_status() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.unique_business_slug(text, uuid) cascade;
drop function if exists public.is_business_owner(uuid) cascade;
drop function if exists public.set_updated_at() cascade;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  business_type text not null default 'Other',
  description text,
  email text,
  phone text,
  address text,
  city text,
  country text,
  logo_url text,
  timezone text not null default 'UTC',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  full_name text,
  role text not null default 'customer' check (role in ('owner','staff','customer')),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_requires_business check (role <> 'owner' or business_id is not null)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 1440),
  price numeric(12,2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  title text,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  unique (business_id, day_of_week),
  constraint valid_business_hours check (is_closed or (opens_at is not null and closes_at is not null and opens_at < closes_at))
);

create table public.staff_availability (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  is_active boolean not null default true,
  unique (staff_id, day_of_week, starts_at),
  constraint valid_staff_availability check (starts_at < ends_at)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete set null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled','no_show')),
  total_price numeric(12,2) not null default 0 check (total_price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_appointment_time check (start_time < end_time)
);

create table public.appointment_status_history (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index services_business_idx on public.services(business_id);
create index staff_business_idx on public.staff(business_id);
create index appointments_business_start_idx on public.appointments(business_id,start_time);
create index appointments_customer_idx on public.appointments(customer_id);
create index appointments_staff_start_idx on public.appointments(staff_id,start_time);
create index history_appointment_idx on public.appointment_status_history(appointment_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;
create trigger businesses_set_updated_at before update on public.businesses for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger staff_set_updated_at before update on public.staff for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();

create or replace function public.unique_business_slug(business_name text,user_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare base_slug text; candidate text; suffix integer:=1;
begin
  base_slug:=trim(both '-' from regexp_replace(lower(coalesce(business_name,'business')),'[^a-z0-9]+','-','g'));
  if base_slug='' then base_slug:='business'; end if;
  candidate:=base_slug||'-'||substr(user_id::text,1,6);
  while exists(select 1 from public.businesses where slug=candidate) loop
    suffix:=suffix+1; candidate:=base_slug||'-'||substr(user_id::text,1,6)||'-'||suffix;
  end loop;
  return candidate;
end; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare account_type_value text; new_business_id uuid; new_business_name text;
begin
  account_type_value:=lower(coalesce(new.raw_user_meta_data->>'account_type','customer'));
  if account_type_value='owner' then
    new_business_name:=coalesce(nullif(trim(new.raw_user_meta_data->>'business_name'),''),'My Business');
    insert into public.businesses(owner_id,name,slug,business_type,email)
    values(new.id,new_business_name,public.unique_business_slug(new_business_name,new.id),coalesce(nullif(new.raw_user_meta_data->>'business_type',''),'Other'),new.email)
    returning id into new_business_id;
    insert into public.profiles(id,business_id,full_name,role)
    values(new.id,new_business_id,coalesce(new.raw_user_meta_data->>'full_name',''),'owner');
    insert into public.business_hours(business_id,day_of_week,opens_at,closes_at,is_closed)
    select new_business_id,d,time '09:00',time '17:00',d in (0,6) from generate_series(0,6) d;
  else
    insert into public.profiles(id,full_name,role)
    values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),'customer');
  end if;
  return new;
exception when others then
  raise log 'Bookly handle_new_user failed for %: %',new.id,sqlerrm;
  raise;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_business_owner(target_business_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
select exists(select 1 from public.profiles where id=auth.uid() and role='owner' and business_id=target_business_id);
$$;

create or replace function public.log_appointment_status()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or old.status is distinct from new.status then
    insert into public.appointment_status_history(appointment_id,old_status,new_status,changed_by)
    values(new.id,case when tg_op='UPDATE' then old.status else null end,new.status,auth.uid());
  end if;
  return new;
end; $$;
create trigger appointment_status_log after insert or update of status on public.appointments for each row execute function public.log_appointment_status();

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.business_hours enable row level security;
alter table public.staff_availability enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_status_history enable row level security;

create policy businesses_public_read on public.businesses for select to anon,authenticated using(is_active or owner_id=auth.uid());
create policy businesses_owner_update on public.businesses for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy businesses_owner_delete on public.businesses for delete to authenticated using(owner_id=auth.uid());

create policy profiles_self_read on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_owner_business_read on public.profiles for select to authenticated using(public.is_business_owner(business_id));
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

create policy services_public_read on public.services for select to anon,authenticated using(is_active or public.is_business_owner(business_id));
create policy services_owner_insert on public.services for insert to authenticated with check(public.is_business_owner(business_id));
create policy services_owner_update on public.services for update to authenticated using(public.is_business_owner(business_id)) with check(public.is_business_owner(business_id));
create policy services_owner_delete on public.services for delete to authenticated using(public.is_business_owner(business_id));

create policy staff_public_read on public.staff for select to anon,authenticated using(is_active or public.is_business_owner(business_id));
create policy staff_owner_insert on public.staff for insert to authenticated with check(public.is_business_owner(business_id));
create policy staff_owner_update on public.staff for update to authenticated using(public.is_business_owner(business_id)) with check(public.is_business_owner(business_id));
create policy staff_owner_delete on public.staff for delete to authenticated using(public.is_business_owner(business_id));

create policy business_hours_public_read on public.business_hours for select to anon,authenticated using(true);
create policy business_hours_owner_insert on public.business_hours for insert to authenticated with check(public.is_business_owner(business_id));
create policy business_hours_owner_update on public.business_hours for update to authenticated using(public.is_business_owner(business_id)) with check(public.is_business_owner(business_id));
create policy business_hours_owner_delete on public.business_hours for delete to authenticated using(public.is_business_owner(business_id));

create policy staff_availability_public_read on public.staff_availability for select to anon,authenticated using(true);
create policy staff_availability_owner_insert on public.staff_availability for insert to authenticated with check(exists(select 1 from public.staff s where s.id=staff_id and public.is_business_owner(s.business_id)));
create policy staff_availability_owner_update on public.staff_availability for update to authenticated using(exists(select 1 from public.staff s where s.id=staff_id and public.is_business_owner(s.business_id))) with check(exists(select 1 from public.staff s where s.id=staff_id and public.is_business_owner(s.business_id)));
create policy staff_availability_owner_delete on public.staff_availability for delete to authenticated using(exists(select 1 from public.staff s where s.id=staff_id and public.is_business_owner(s.business_id)));

create policy appointments_public_insert on public.appointments for insert to anon,authenticated with check(
  exists(select 1 from public.businesses b where b.id=business_id and b.is_active)
  and exists(select 1 from public.services s where s.id=service_id and s.business_id=business_id and s.is_active)
  and (staff_id is null or exists(select 1 from public.staff st where st.id=staff_id and st.business_id=business_id and st.is_active))
  and (customer_id is null or customer_id=auth.uid())
  and status='pending'
);
create policy appointments_owner_read on public.appointments for select to authenticated using(public.is_business_owner(business_id));
create policy appointments_owner_update on public.appointments for update to authenticated using(public.is_business_owner(business_id)) with check(public.is_business_owner(business_id));
create policy appointments_owner_delete on public.appointments for delete to authenticated using(public.is_business_owner(business_id));
create policy appointments_customer_read on public.appointments for select to authenticated using(customer_id=auth.uid());
create policy appointments_customer_cancel on public.appointments for update to authenticated using(customer_id=auth.uid() and status in ('pending','confirmed')) with check(customer_id=auth.uid() and status='cancelled');

create policy history_owner_read on public.appointment_status_history for select to authenticated using(exists(select 1 from public.appointments a where a.id=appointment_id and public.is_business_owner(a.business_id)));
create policy history_customer_read on public.appointment_status_history for select to authenticated using(exists(select 1 from public.appointments a where a.id=appointment_id and a.customer_id=auth.uid()));

grant usage on schema public to anon,authenticated;
grant select on public.businesses,public.services,public.staff,public.business_hours,public.staff_availability to anon,authenticated;
grant insert on public.appointments to anon,authenticated;
grant select,update,delete on public.appointments to authenticated;
grant select,update on public.profiles to authenticated;
grant insert,update,delete on public.services,public.staff,public.business_hours,public.staff_availability to authenticated;
grant update,delete on public.businesses to authenticated;
grant select on public.appointment_status_history to authenticated;
grant usage,select on all sequences in schema public to authenticated;

select 'Bookly Pro V4 schema installed successfully' as result;
