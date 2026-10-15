-- Modèle de Photobooth par formule (classique | bois).
alter table public.packages add column if not exists booth text not null default 'classique';
alter table public.packages drop constraint if exists packages_booth_check;
alter table public.packages add constraint packages_booth_check check (booth in ('classique','bois'));

insert into public.packages (id,name,description,family,print_allowance,duration_hours,price_eur,is_active,is_featured,sort_order,booth) values
('bois-decouverte','Formule Découverte','Offre de lancement','numerique','Photo numérique',3,130,true,true,1010,'bois'),
('bois-evasion','Formule Évasion','Offre de lancement','numerique','Photo numérique',4,180,true,true,1020,'bois'),
('bois-passion','Formule Passion','Offre de lancement','numerique','Photo numérique',5,230,true,true,1030,'bois'),
('bois-emotion','Formule Émotion','Offre de lancement','numerique','Photo numérique',6,280,true,true,1040,'bois'),
('bois-prestige','Formule Prestige','Offre de lancement','numerique','Photo numérique',7,330,true,false,1050,'bois'),
('bois-excellence','Formule Excellence','Offre de lancement','numerique','Photo numérique',8,380,true,false,1060,'bois'),
('bois-grandiose','Formule Grandiose','Offre de lancement','numerique','Photo numérique',9,430,true,false,1070,'bois'),
('bois-legende','Formule Légende','Offre de lancement','numerique','Photo numérique',10,480,true,false,1080,'bois'),
('bois-essentielle','Formule Essentielle','Offre de lancement','tirages','Tirages illimités',3,230,true,false,1110,'bois'),
('bois-prestiges','Formule Prestiges','Offre de lancement','tirages','Tirages illimités',4,280,true,false,1120,'bois'),
('bois-signature','Formule Signature','Offre de lancement','tirages','Tirages illimités',5,330,true,false,1130,'bois'),
('bois-royale','Formule Royale','Offre de lancement','tirages','Tirages illimités',6,380,true,false,1140,'bois'),
('bois-imperiale','Formule Impériale','Offre de lancement','tirages','Tirages illimités',7,430,true,false,1150,'bois'),
('bois-elegance','Formule Élégance','Offre de lancement','tirages','Tirages illimités',8,480,true,false,1160,'bois'),
('bois-majestueuse','Formule Majestueuse','Offre de lancement','tirages','Tirages illimités',9,530,true,false,1170,'bois'),
('bois-supreme','Formule Suprême','Offre de lancement','tirages','Tirages illimités',10,580,true,false,1180,'bois')
on conflict (id) do update set name=excluded.name,description=excluded.description,family=excluded.family,print_allowance=excluded.print_allowance,duration_hours=excluded.duration_hours,price_eur=excluded.price_eur,is_active=excluded.is_active,is_featured=excluded.is_featured,sort_order=excluded.sort_order,booth=excluded.booth;
