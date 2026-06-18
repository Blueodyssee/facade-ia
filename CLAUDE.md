# Gooweb Color — Contexte projet (pour Claude Code)

> Lis ce fichier en premier. Il résume le projet, les décisions techniques et les
> pièges connus, pour reprendre le travail sans tout réexpliquer.

## L'utilisateur

- **Non technique / débutant.** Expliquer simplement, en français, étape par étape.
- Il lance le serveur lui-même dans une fenêtre `cmd` (`npm run dev`). Il fait les
  commandes `git` dans une 2ᵉ fenêtre `cmd`.
- Donner les commandes Windows une par une, et lui dire où coller (`...\facade-ia>`).

## C'est quoi

App web Next.js : un façadier uploade une photo de maison, une IA propose 4 teintes,
recolorise la façade, et l'utilisateur télécharge l'image (avec watermark logo) + un
PDF avant/après. Pas de login utilisateur (juste un mot de passe simple).

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind**.
- **OpenRouter** pour TOUTE l'IA (une seule clé `OPENROUTER_API_KEY`).
  - Analyse façade : `anthropic/claude-sonnet-4.6` (vision) → `app/api/analyze/route.ts`
  - Recoloriage : `google/gemini-2.5-flash-image` (= "Nano Banana") → `app/api/recolor/route.ts`
- **jsPDF** + **qrcode** (client) pour le PDF → logique dans `app/lib/export.ts`
- Déploiement **Vercel** (déploie depuis `main`). Repo : github.com/Blueodyssee/facade-ia

## Versions (branches + tags)

| Branche | Tag | Contenu |
|---------|-----|---------|
| `main`  | `v1.0` | V1 simple (2 teintes), + mot de passe. **C'est ce qui est en ligne sur Vercel** (facade-ia.vercel.app) |
| `v2`    | `v2.0` | 4 teintes + teinte perso (upload couleur) + watermark + PDF + recadrage |
| `v3`    | `v3.0` | Simplifiée : 4 teintes seulement (pas de teinte perso) |
| `v4`    | (pas de tag) | **Branche de travail actuelle.** Marque "Gooweb Color", logo, compteur, sans email ni "Coller" |

Convention : chaque version = une branche `vN` + un tag `vN.0`. Garder ce schéma.

## Décisions techniques importantes (NE PAS refaire les erreurs passées)

### Modèle de recoloriage = Nano Banana, process SIMPLE
- On utilise `google/gemini-2.5-flash-image` car **pas cher (~0,039 $/image)**.
- `gemini-3-pro-image-preview` recolorise mieux MAIS **~7× plus cher** → écarté par l'utilisateur.
- **Process voulu = le plus simple** : envoyer la photo seule + prompt texte, et
  renvoyer l'image du modèle **telle quelle**. PAS de vignette de référence, PAS de
  `matchAspect`, PAS de letterbox/padding. (On avait ajouté tout ça, ça a cassé le
  cadrage, l'utilisateur a demandé de revenir au process simple d'hier — commit `050185b`.)
- **Limite connue acceptée** : Nano Banana renvoie souvent du carré (1024×1024) et peut
  légèrement recadrer. L'utilisateur préfère ça plutôt que les rustines qui zoomaient.
  Ne PAS réintroduire de post-traitement de cadrage sans son accord explicite.

### Les 4 teintes (définies dans `app/api/analyze/route.ts`)
- G00 Naturel `#F0EEE8` (NCS 0502-Y50R)
- R93 Brique Chaud `#C46248` (NCS 4040-Y80R)
- G50 Gris Cendre `#D3D6D1` (hex estimé)
- J40 Sable Jaune `#ECE3C8` (hex estimé)

### Mot de passe
- `middleware.ts` protège tout le site (HTTP Basic Auth). Mot de passe = `web`
  (var `APP_PASSWORD`, défaut "web"). Identifiant vide.

### Compteur de simulations (V4)
- `app/api/counter/route.ts`. Départ **300**, −1 à **chaque colorisation**, **bloque à 0**.
- Affiché en haut à droite. Décrément réservé avant la colo, **remboursé si échec**.
- **Global partagé** voulu → via **Upstash Redis REST** (`UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN`). **Repli en mémoire** si absent (OK en local, PAS fiable
  sur Vercel serverless). Pour un vrai compteur global en ligne : configurer Upstash.

### Logo
- `public/logo-gooweb.png` (pétales colorés). Utilisé dans : en-tête, watermark, PDF.
  **Doit être committé** (Vercel en a besoin). Fond transparent.

## Variables d'environnement (`.env.local`, et à mettre sur Vercel)

```
OPENROUTER_API_KEY=sk-or-...            # requis (analyse + recoloriage)
APP_PASSWORD=web                        # optionnel (défaut "web")
UPSTASH_REDIS_REST_URL=...              # optionnel (compteur global)
UPSTASH_REDIS_REST_TOKEN=...            # optionnel (compteur global)
```
`.env.local` est gitignoré (les clés n'allument PAS sur GitHub). Sur Vercel, les ajouter
dans Settings → Environment Variables (cocher Production + Preview + Development).

## Fichiers clés

- `app/page.tsx` — toute l'UI + la logique (upload → analyse → 4 teintes → résultat).
- `app/api/analyze/route.ts` — vision Claude, renvoie les 4 teintes + raisons.
- `app/api/recolor/route.ts` — Nano Banana, recolorise (process simple).
- `app/api/counter/route.ts` — compteur global/local.
- `app/lib/export.ts` — watermark image + génération PDF (jsPDF) + QR code.
- `middleware.ts` — mot de passe.
- `app/api/email/route.ts` — route email (Resend). **Le bouton email est retiré en V4**,
  la route existe encore mais n'est plus utilisée.

## Pièges / à savoir

- **NE PAS lancer `npm run build` pendant que le serveur `npm run dev` tourne** : ça
  corrompt le cache `.next` (erreur `Cannot find module './948.js'`). Pour vérifier le
  code, utiliser **`npx tsc --noEmit`** (ne touche pas `.next`).
- Si l'erreur `.next` arrive quand même : `rm -rf .next`, puis relancer `npm run dev`,
  et faire **Ctrl+Maj+R** dans le navigateur.
- **localhost = version locale en cours** ; **facade-ia.vercel.app = V1 en ligne**.
  L'utilisateur confond parfois les deux.
- Watermark/PDF : nommage `gooweb_facade_AAAA-MM-JJ_HHMM.(jpg|pdf)`.
- Coordonnées Gooweb (pied de PDF) : `Gooweb – 06 69 95 18 13 – contact@gooweb.biz – gooweb.biz`.

## État actuel

- Sur branche **`v4`** (committée + poussée). Pas encore de tag `v4.0`.
- V4 testée en local. **Pas encore déployée** comme version en ligne (Vercel sert toujours V1/`main`).
- Compteur global Upstash : **pas encore configuré** (tourne en repli mémoire).
