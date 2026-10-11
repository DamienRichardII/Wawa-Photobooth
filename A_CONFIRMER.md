# À fournir / à valider avant mise en ligne

## Contenus commerciaux
- Formules, prix, durées, tirages : la grille de `config/packages.json` vient de l'asset du client et n'a **pas été validée** (orthographe « Émotion » comprise). Aucune valeur inventée ; prix masqué si vide.
- Option « bar à magnets » (250 €) : présente dans l'asset mais absente du parcours de la spécification — à décider.
- Frais de déplacement : adresse de départ, zones, barème. Tant que rien n'est configuré : « frais éventuels à confirmer ».
- Règles de sécurité des installations en extérieur (avertissement + traitement manuel pour l'instant).
- Accepte-t-on les demandes **sans Photobooth** ? Pour quelle autre prestation ?
- Délai minimal, règles de disponibilité, acompte, conditions d'annulation (`booking.minLeadDays` = 0 par défaut).
- Soirée henné : demander les prénoms ? (`booking.henneAskCoupleNames`, faux par défaut). Consentement marketing : désactivé (`marketingConsentEnabled`).

## Informations de l'entreprise
- Raison sociale, forme, SIRET, adresse, directeur de publication, contact RGPD/DPO, hébergeur (Vercel pré-rempli), durée de conservation → pages légales (marquées « à renseigner »).
- Email destinataire des demandes, email/téléphone/horaires publics, URLs des réseaux sociaux.
Avis clients : aucun fourni, donc aucun affiché.

## Assets
- Logo officiel en SVG/PNG transparent (variantes générées à partir du fichier fourni).
- Photos HD : seules des images extraites des vidéos sont utilisées. Vidéos : son retiré, compressées.
- Éléments de la maquette non construits : « Espace client » et paiement (hors périmètre de la spécification).

## Configuration technique
- Projet Supabase (région UE), variables d'environnement (`.env.example`), clé Resend + domaine d'envoi, secret TOTP admin, `siteUrl`, domaine.
- Tests restants avant production : lecteur d'écran, audit de sécurité, test de restauration des sauvegardes.

- Administration : confirmer la liste des personnes habilitées (actuellement wawaphotobooth77@gmail.com et damien.miyouna@gmail.com), l'adresse e-mail de notification de l'équipe et la durée de conservation des demandes (RETENTION_MONTHS).
