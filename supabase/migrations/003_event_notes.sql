-- Notes internes (chiffrées) et traces de contact dans le suivi des demandes.
alter table public.booking_request_events add column if not exists note_encrypted text;
