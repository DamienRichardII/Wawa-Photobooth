# WAWA PHOTOBOOTH — site de demande de réservation

Site multipage en **HTML / CSS / JavaScript** (ES modules, sans framework, sans dépendance npm) + API Node (fonctions Vercel).
Une demande n'est **jamais** une réservation confirmée : aucun paiement, aucun blocage de créneau.

## Structure
- `public/` : site statique (accueil, prestations, galerie, réservation, à propos, contact, faq, pages légales, `/admin/`).
- `api/` + `lib/` : API (`/api/packages`, `/api/booking-requests`, `/api/contact`, `/api/admin/*`, `/api/cron-purge`).
- `config/packages.json` : grille de formules **transcrite de l'asset du client — non validée** ; `config/site.json` : coordonnées/légal (tout `null` = à fournir).
- `supabase/migrations/001_init.sql` : schéma (RLS activée, aucun accès anon).
- `scripts/` : `gen-secrets`, `hash-password`, `sync-layout` (header/footer/partials), `generate-seo`, `purge`, `optimize-media.py`.
- `tests/` : unitaires (`npm test`) et E2E Playwright (`tests/e2e/*.mjs`).

## Développement local
```
npm run dev        # http://localhost:3000 — stockage JSON local (refusé en production)
npm test           # 29 tests unitaires
npm run layout     # après modification du header/footer/partials
npm run seo        # robots.txt (+ sitemap.xml si siteUrl est renseigné)
```

## Déploiement (GitHub → Vercel)
1. Ne pas versionner `assets/` ni `.data/` (voir `.gitignore`). Vercel : `outputDirectory = public` (déjà dans `vercel.json`).
2. Créer un projet **Supabase en région UE**, exécuter `supabase/migrations/001_init.sql`.
3. `npm run gen-secrets` puis `npm run hash-password`; renseigner les variables listées dans `.env.example` dans Vercel (jamais dans Git). Sauvegarder `DATA_ENCRYPTION_KEY` dans un gestionnaire de secrets : sa perte rend les données illisibles.
4. Enregistrer l'URI TOTP dans une application d'authentification (MFA obligatoire en production).
5. Email : clé Resend + domaine d'envoi vérifié + `NOTIFY_EMAIL_TO` (destinataire à confirmer par le client).
6. Renseigner `config/site.json` (siteUrl, contact, mentions légales), passer `legal.validated` à `true` après relecture juridique, relancer `npm run layout && npm run seo`.
7. Sans base configurée, le formulaire affiche un état « non configuré » et **n'affiche aucun succès**.

## Sécurité (résumé)
Validation serveur stricte, honeypot + délai minimal + limitation de débit, contrôle d'Origin, CSP stricte sans script/style inline, HSTS, chiffrement AES-256-GCM des données personnelles en base, IP hachées (HMAC), références opaques, admin : scrypt + TOTP + cookie HttpOnly/SameSite=Strict + CSRF + verrouillage + journal d'audit, export CSV neutralisé, purge RGPD planifiée (`/api/cron-purge`). Aucune promesse de « sécurité totale » : faire une revue et un test d'intrusion avant mise en production.

## Exploitation
Admin sur `/admin/` : tableau de bord (KPI, alertes, prochains événements), demandes en liste ou pipeline (glisser-déposer), calendrier avec détection des dates en conflit, fiche détaillée (statut, contact rapide appel / e-mail / WhatsApp / itinéraire, notes internes chiffrées, trace des contacts, impression, effacement RGPD), messages, formules (import de la grille puis édition), état de la configuration, journal d'audit, export CSV.

**Connexion admin (production)** : comptes Supabase Auth + double authentification TOTP (activée au premier accès, QR code affiché). Seuls les e-mails de la table `public.admin_users` sont admis. Ajouter un admin : créer l'utilisateur dans Supabase (Authentication > Users, e-mail confirmé, connexion par mot de passe activée) puis `insert into public.admin_users (email) values ('adresse@exemple.fr');`. Retirer un admin : `delete from public.admin_users where email = '...'` (accès coupé immédiatement). Variables Vercel : `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `DATA_ENCRYPTION_KEY`, `SESSION_SECRET`, `IP_HASH_SECRET`, `CRON_SECRET`, `SITE_ORIGIN`, puis `RESEND_API_KEY` / `NOTIFY_EMAIL_TO` et `RETENTION_MONTHS` une fois validés.

Voir **A_CONFIRMER.md** pour tout ce qui reste à fournir ou à valider.
