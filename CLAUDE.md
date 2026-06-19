# Gooweb Color — Contexte projet (pour Claude Code)

> Lis ce fichier en premier. Il résume le projet, les décisions techniques et les
> pièges connus, pour reprendre le travail sans tout réexpliquer.

## L'utilisateur

- **Non technique / débutant.** Expliquer simplement, en français, étape par étape.
- Il lance le serveur lui-même dans une fenêtre `cmd` (`npm run dev`). Il fait les
  commandes `git` dans une 2ᵉ fenêtre `cmd`.
- Donner les commandes Windows une par une, et lui dire où coller (`...\facade-ia>`).

## C'est quoi

App web Next.js : un façadier uploade une photo de maison, une IA propose 10 teintes,
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

### [HISTORIQUE] Ancien process simple de recoloriage (remplacé le 18/06/2026, voir section suivante)
- On utilise `google/gemini-2.5-flash-image` car **pas cher (~0,039 $/image)**.
- `gemini-3-pro-image-preview` recolorise mieux MAIS **~7× plus cher** → écarté par l'utilisateur.
- **Process voulu = le plus simple** : envoyer la photo seule + prompt texte, et
  renvoyer l'image du modèle **telle quelle**. PAS de vignette de référence, PAS de
  `matchAspect`, PAS de letterbox/padding. (On avait ajouté tout ça, ça a cassé le
  cadrage, l'utilisateur a demandé de revenir au process simple d'hier — commit `050185b`.)
- **Limite connue (état v4 actuel)** : Nano Banana renvoie souvent du carré (1024×1024)
  et peut légèrement recadrer (zoom). Le code v4 actuel reste sur le process simple.

### Process de recoloriage OPTIMISÉ - IMPLÉMENTÉ le 18/06/2026 (process actuel)
> Codé dans `app/page.tsx` (`makeColorSwatch`, `padToSquare`, `cropToRegion`) +
> `app/api/recolor/route.ts` (2ᵉ image + prompt FERME utilisant la description courte de
> la teinte). ⚠️ Testé 19/06/2026 : vignette+letterbox NE SUFFISENT PAS, il faut la
> description par teinte + un prompt insistant (« FULLY repaint… NOT a faint tint »),
> sinon l'IA laisse les murs quasi inchangés. Le letterbox AIDE la colorisation (vérifié).
Objectif : **recoloriage fiable à prix compétitif**. Garder Nano Banana (pas cher) mais
le rendre fiable avec ces leviers, plutôt que de passer à un modèle premium :
1. **Modèle pas cher par défaut** : `google/gemini-2.5-flash-image` (~0,04 $/image). Bon
   sur de vraies photos de façade.
2. **Couleur en IMAGE, pas juste en hex** : envoyer une **vignette unie** de la couleur
   cible en 2ᵉ image (+ le nom). Les modèles d'image suivent mal un `#RRGGBB` seul.
   *(Testé : orange→bleu marche avec vignette, pas en texte seul.)*
3. **Cadrage préservé = technique « letterbox »** : transformer la photo en **carré**
   (bandes neutres haut/bas) AVANT l'envoi, puis **retirer les bandes après** (recadrer au
   ratio d'origine). Le modèle ne rogne plus les côtés. *(Testé : côtés conservés, cadrage
   fidèle. C'EST la bonne façon de corriger le zoom — pas le matchAspect seul qui, lui,
   rognait l'image déjà carrée.)*
4. **Prompt strict** : « change UNIQUEMENT les murs en [couleur], garde tout identique, ne
   zoome/recadre pas ».
5. **Escalade premium en secours** (bouton « améliorer » premium `gemini-3-pro-image-preview`) :
   **ÉCARTÉ par l'utilisateur le 18/06/2026 — NON implémenté.** Idée conservée ici pour mémoire ;
   les leviers 1 à 4 ci-dessus, eux, SONT codés.

> Différence clé avec les essais ratés : le zoom venait du **carré non compensé**. Le
> letterbox (pré-pad carré → dépad après) corrige ça proprement, contrairement au
> matchAspect seul. La vignette de référence améliore la fidélité couleur, sans coût cadrage.

### Les 10 teintes (définies dans `app/api/analyze/route.ts`)
Nuancier rangé du plus clair au plus foncé. Hex **mesuré sur les échantillons** du
dossier `couleurs/` (pas estimé). Chaque teinte porte un `recolorPrompt` = **courte
description anglaise** (ex. « a soft muted sage green »), **invisible côté client**,
INDISPENSABLE à la fidélité couleur (testé 19/06/2026 : sans description, l'IA ne
colorise quasiment pas). Pas de code NCS.
- G10 Blanc Lumière `#F6F5F3`
- 320 Blanc Cassé `#E2DCD4`
- J50 Jaune Paille `#F0CD75`
- T20 Sable Clair `#DCBE98`
- 190 Beige `#D6BB9E`
- G37 Sable Rosé `#D8B4A1`
- G16 Gris Nuage `#BAB8B5`
- V59 Vert Sauge `#ACB28E`
- R80 Terre de Sienne `#BB633D`
- 0147 Brun Doux `#A46B3F`

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

- `app/page.tsx` — toute l'UI + la logique (upload → analyse → 10 teintes → résultat).
- `app/api/analyze/route.ts` — vision Claude, renvoie les 10 teintes + raisons.
- `app/api/recolor/route.ts` — Nano Banana, recolorise (process optimisé : vignette + letterbox).
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
