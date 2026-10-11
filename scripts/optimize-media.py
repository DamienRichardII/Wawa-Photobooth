#!/usr/bin/env python3
"""Optimise les assets de /assets vers /public/media (WebP, MP4 muets compressés, icônes).

Usage : python3 scripts/optimize-media.py        (nécessite Pillow, numpy et ffmpeg)
Les originaux de /assets ne sont JAMAIS modifiés ni déployés.
"""
import subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ROOT / "public" / "media"
(OUT / "img").mkdir(parents=True, exist_ok=True)
(OUT / "video").mkdir(parents=True, exist_ok=True)
(OUT / "icons").mkdir(parents=True, exist_ok=True)

# --- Logo -------------------------------------------------------------------
# Le logo fourni est or sur fond noir (JPEG). On en dérive des versions à fond transparent
# (luminance -> alpha), sans modifier le dessin. Une variante "claire" recolore uniquement
# le mot PHOTOBOOTH (blanc) en brun foncé pour rester lisible sur fond ivoire.
src = Image.open(ASSETS / "Logo" / "logo.jpeg").convert("RGB")
arr = np.asarray(src).astype(np.float32) / 255.0

def to_alpha(a, lo=0.10, hi=0.42, floor=0.62):
    """Luminance -> alpha. La couleur d'origine est conservée (dégradé or/bronze) ;
    seuls les pixels de bord (sombres) sont éclaircis pour éviter les liserés noirs."""
    mx = a.max(axis=2)
    alpha = np.clip((mx - lo) / (hi - lo), 0, 1)
    b = np.maximum(mx, floor)
    rgb = np.clip(a / np.maximum(mx, 1e-4)[..., None] * b[..., None], 0, 1)
    return (np.dstack([rgb, alpha]) * 255).astype(np.uint8)

rgba = to_alpha(arr)

def save_webp(img, path, q=90):
    img.save(path, "WEBP", quality=q, method=6)

full = Image.fromarray(rgba, "RGBA")
bbox = full.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
full = full.crop(bbox)
full.thumbnail((900, 900), Image.LANCZOS)
save_webp(full, OUT / "img" / "logo-complet-or.webp")

# Emblème + mot-symbole (sans cercle) : appareil + WAWA + PHOTOBOOTH
CROP = (215, 322, 1075, 1030)
mark = Image.fromarray(rgba, "RGBA").crop(CROP)
ma = np.asarray(mark).copy()
mask = np.zeros(ma.shape[:2], bool)
mask[24:420, 345:545] = True     # corps de l'appareil + trépied
mask[0:150, 548:650] = True      # éclairs du flash
mask[418:710, 0:860] = True      # WAWA + PHOTOBOOTH
ma[~mask, 3] = 0
mark = Image.fromarray(ma, "RGBA")
bb = mark.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
mark = mark.crop(bb)
mk = mark.copy(); mk.thumbnail((760, 760), Image.LANCZOS)
save_webp(mk, OUT / "img" / "logo-embleme-or.webp")

# Variante fond clair : pixels peu saturés (reflets de l'objectif, blanc de PHOTOBOOTH)
m = np.asarray(mark).astype(np.float32) / 255.0
rgb, a = m[..., :3].copy(), m[..., 3].copy()
mx, mn = rgb.max(axis=2), rgb.min(axis=2)
sat = (mx - mn) / np.maximum(mx, 1e-4)
Hm = a.shape[0]
text_rows = np.zeros_like(a, bool); text_rows[int(Hm * 0.80):, :] = True
low_sat = sat < 0.28
rgb[low_sat & text_rows] = np.array([0.20, 0.14, 0.08], np.float32)   # PHOTOBOOTH -> brun foncé
a[low_sat & ~text_rows] = 0                                            # reflets de l'objectif retirés
light = Image.fromarray((np.dstack([rgb, a]) * 255).astype(np.uint8), "RGBA")
light.thumbnail((760, 760), Image.LANCZOS)
save_webp(light, OUT / "img" / "logo-embleme-clair.webp")

# Icônes (appareil seul, doré sur fond sombre) + favicon + image de partage
cam = Image.fromarray(rgba, "RGBA").crop((540, 310, 880, 740))
cb = cam.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
cam = cam.crop(cb)
def icon(size, pad=0.16, bg=(10, 8, 6, 255), radius=0.22):
    can = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    from PIL import ImageDraw
    d = ImageDraw.Draw(can)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius), fill=bg)
    inner = int(size * (1 - 2 * pad))
    c = cam.copy(); c.thumbnail((inner, inner), Image.LANCZOS)
    can.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2))
    return can
icon(32, 0.08).save(OUT / "icons" / "favicon-32.png")
icon(180, 0.18).save(OUT / "icons" / "apple-touch-icon.png")
icon(512, 0.18).save(OUT / "icons" / "icon-512.png")

og = Image.new("RGB", (1200, 630), (8, 6, 5))
lg = full.copy(); lg.thumbnail((560, 560), Image.LANCZOS)
og.paste(lg, ((1200 - lg.width) // 2, (630 - lg.height) // 2), lg)
og.save(OUT / "img" / "og-wawa.jpg", quality=86, optimize=True)

# --- Visuels des formules (référence interne, non publiés tels quels) ---------------------
# (Les tarifs sont transcrits dans config/packages.json ; les images ne sont pas déployées.)

# --- Vidéos -----------------------------------------------------------------
VIDEOS = [
    # (fichier source, slug, légende/alt)
    ("WhatsApp Video 2026-10-11 at 14.53.08.mp4", "miroir-fleurs-blanches", "Miroir photobooth WAWA avec composition de fleurs blanches et crème", 1.2),
    ("WhatsApp Video 2026-10-11 at 14.52.18.mp4", "miroir-logo-led", "Gros plan sur le miroir photobooth WAWA et son cadre lumineux LED", 8.0),
    ("WhatsApp Video 2026-10-11 at 14.55.53.mp4", "miroir-ecran-fete", "Miroir photobooth WAWA en soirée avec écran d'accueil festif", 4.0),
    ("WhatsApp Video 2026-10-11 at 14.56.25.mp4", "miroir-fleurs-jaunes", "Miroir photobooth WAWA avec écran de sélection et fleurs jaunes", 1.0),
]
for fname, slug, _, t in VIDEOS:
    inp = ASSETS / "Vidéos" / fname
    out = OUT / "video" / f"{slug}.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", str(inp), "-an",
        "-vf", "scale=-2:1024:flags=lanczos,fps=30",
        "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p",
        "-profile:v", "main", "-movflags", "+faststart", str(out)], check=True)
    poster = OUT / "img" / f"{slug}-poster.webp"
    tmp = OUT / "img" / f"{slug}-poster.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(out), "-frames:v", "1", str(tmp)], check=True)
    im = Image.open(tmp).convert("RGB")
    im.save(poster, "WEBP", quality=78, method=6)
    # version basse définition pour le flou d'arrière-plan
    small = im.copy(); small.thumbnail((48, 86))
    small.save(OUT / "img" / f"{slug}-blur.webp", "WEBP", quality=60)
    tmp.unlink()
    print(slug, out.stat().st_size // 1024, "Ko", im.size)

# --- Photos (images fixes extraites des vidéos fournies — remplacer par de vraies photos HD si disponibles) ---
STILLS = [
    ("WhatsApp Video 2026-10-11 at 14.53.08.mp4", "photo-fleurs-blanches-led", 5.0),
    ("WhatsApp Video 2026-10-11 at 14.52.18.mp4", "photo-gros-plan-logo", 2.0),
    ("WhatsApp Video 2026-10-11 at 14.55.53.mp4", "photo-soiree-ballons", 6.5),
    ("WhatsApp Video 2026-10-11 at 14.56.25.mp4", "photo-ecran-bleu-fleurs", 3.5),
]
for fname, slug, t in STILLS:
    tmp = OUT / "img" / f"{slug}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(ASSETS / "Vidéos" / fname), "-frames:v", "1", "-vf", "scale=-2:1024:flags=lanczos", str(tmp)], check=True)
    Image.open(tmp).convert("RGB").save(OUT / "img" / f"{slug}.webp", "WEBP", quality=80, method=6)
    tmp.unlink()
print("OK")
