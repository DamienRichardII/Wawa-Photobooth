-- Étape « Envie d'un Bar à magnets ? » (oui / non) ajoutée au parcours de réservation.
alter table public.booking_requests add column if not exists magnet_bar_requested boolean not null default false;
