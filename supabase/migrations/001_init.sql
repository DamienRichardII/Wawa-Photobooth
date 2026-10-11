-- WAWA PHOTOBOOTH — schéma initial.
-- Principe : RLS activée SANS politique + droits retirés à anon/authenticated => seule la clé « service_role »
-- (utilisée uniquement par les fonctions serveur) peut accéder aux tables. Aucune lecture depuis le navigateur.
-- Les données de contact sont chiffrées au niveau applicatif (AES-256-GCM) dans « pii_encrypted ».
-- Choisir la région du projet Supabase dans l'UE (ex. eu-west-3 Paris) pour la conformité RGPD.

create extension if not exists pgcrypto;

create table if not exists public.packages (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 300),
  family text not null default 'autre' check (family in ('numerique','tirages','autre')),
  print_allowance text check (char_length(print_allowance) <= 60),
  duration_hours numeric check (duration_hours > 0 and duration_hours <= 48),
  price_eur numeric check (price_eur >= 0 and price_eur <= 100000),
  is_active boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  status text not null default 'nouvelle' check (status in ('nouvelle','a-contacter','devis-envoye','confirmee','annulee')),
  event_type text not null check (event_type in ('mariage','nikkah-hlel','fiancailles','soiree-henne','baby-shower','anniversaire','soiree-privee','evenement-pro','autre')),
  event_date date not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  guest_count integer not null check (guest_count between 1 and 2000),
  installation_type text not null check (installation_type in ('indoor','outdoor')),
  photobooth_requested boolean not null,
  magnet_bar_requested boolean not null default false, -- ajouté par 002_magnet_bar.sql sur les bases existantes
  package_id text,                      -- volontairement sans FK : l'instantané ci-dessous fait foi
  package_snapshot jsonb,               -- formule telle que connue du serveur au moment de la demande
  pii_encrypted text not null,          -- prénom, nom, email, téléphone, adresse, prénoms des mariés (chiffrés)
  marketing_consent boolean not null default false,
  idempotency_hash text unique,
  ip_hash text,                         -- HMAC de l'IP (anti-abus), jamais l'IP en clair
  notify_status text,
  ack_status text,
  check (photobooth_requested or package_id is null)
);
create index if not exists booking_requests_created_idx on public.booking_requests (created_at desc);
create index if not exists booking_requests_status_idx on public.booking_requests (status);
create index if not exists booking_requests_ip_idx on public.booking_requests (ip_hash, created_at);

create table if not exists public.booking_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.booking_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null,
  from_status text,
  to_status text,
  actor text,
  note_encrypted text                   -- note interne chiffrée (AES-256-GCM) — ajouté par 003 sur les bases existantes
);
create index if not exists booking_request_events_req_idx on public.booking_request_events (request_id, created_at);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  created_at timestamptz not null default now(),
  status text not null default 'nouveau' check (status in ('nouveau','traite')),
  pii_encrypted text not null,
  ip_hash text,
  notify_status text
);
create index if not exists contact_messages_ip_idx on public.contact_messages (ip_hash, created_at);

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor text,
  action text not null,
  ip_hash text,
  email_hash text,
  detail jsonb
);
create index if not exists admin_audit_fail_idx on public.admin_audit (action, created_at);

-- admin_users : voir 004_admin_users.sql
create table if not exists public.admin_totp_steps (
  step bigint primary key,
  used_at timestamptz not null default now()
);

-- Verrouillage : aucune politique => aucun accès pour anon/authenticated.
do $$
declare t text;
begin
  foreach t in array array['packages','booking_requests','booking_request_events','contact_messages','admin_audit','admin_totp_steps']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
