# Gooweb Color (facade-ia)

Simulez la couleur de votre façade grâce à l’IA — 10 teintes, recoloriage, watermark et PDF avant/après.

## Démarrage rapide

### 1. Configurer la clé API

Copiez `.env.local.example` vers `.env.local` et renseignez :

```
OPENROUTER_API_KEY=sk-or-...
```

### 2. Lancer l’app

```bash
npm install
npm run dev
```

Si le port 3000 est déjà pris par un autre projet, Next.js utilisera **3001** (ou le suivant).

Ouvrez l’URL indiquée dans le terminal (souvent http://localhost:3001).

Mot de passe (Basic Auth) : `web` (identifiant vide), configurable via `APP_PASSWORD`.

## Fonctionnement

1. **Upload** — photo de façade (JPG / PNG / WebP)
2. **Analyse** — Claude vision (via OpenRouter) propose des arguments pour 10 teintes
3. **Choix** — vous sélectionnez une teinte du nuancier
4. **Recoloriage** — Gemini Image (via OpenRouter) recolorie les murs
5. **Résultat** — avant/après, **envoyer au client** (partage téléphone : WhatsApp, Messages…), téléchargement image + PDF

## Modèles (OpenRouter)

| Usage | Modèle par défaut |
|-------|-------------------|
| Analyse vision | `anthropic/claude-sonnet-4.6` |
| Recoloriage | `google/gemini-3-pro-image-preview` (qualité), repli `google/gemini-2.5-flash-image` |

Pour forcer un modèle moins cher : `RECOLOR_MODEL=google/gemini-2.5-flash-image` dans `.env.local`.

## Nuancier (10 teintes)

G10 Blanc Lumière · 320 Blanc Cassé · J50 Jaune Paille · T20 Sable Clair · 190 Beige · G37 Sable Rosé · G16 Gris Nuage · V59 Vert Sauge · R80 Terre de Sienne · 0147 Brun Doux

## Scripts utiles

```bash
npm run dev        # serveur de dev
npm run typecheck  # vérification TypeScript (sans toucher .next)
npm run lint       # ESLint
```

> Ne lancez pas `npm run build` pendant que `npm run dev` tourne (cache `.next` corrompu).

## Compteur de simulations

- Départ : 300 simulations, −1 par colorisation réussie réservée (remboursée si échec)
- En local sans Upstash : compteur en mémoire (OK pour dev)
- En prod Vercel : configurer `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

## Branches

| Branche | Contenu |
|---------|---------|
| `main` / tag `v1.0` | V1 en ligne (Vercel) |
| `v2` / `v2.0` | 4 teintes + teinte perso + watermark + PDF |
| `v3` / `v3.0` | 4 teintes simplifiées |
| `v4` | Gooweb Color, 10 teintes, compteur (travail actuel) |
