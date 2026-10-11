-- Administrateurs autorisés (comptes Supabase Auth). Gérés uniquement côté serveur (RLS sans politique).
create table if not exists public.admin_users (
  email text primary key check (email = lower(email) and char_length(email) between 5 and 254),
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
-- Ajouter un administrateur (le compte doit exister dans Authentication > Users et être confirmé) :
-- insert into public.admin_users (email) values ('prenom.nom@exemple.fr') on conflict do nothing;
