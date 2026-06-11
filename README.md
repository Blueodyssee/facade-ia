# FaçadeIA

Simulez la couleur de votre façade en secondes grâce à l'IA.

## Démarrage rapide

### 1. Configurer la clé API

Copiez `.env.local.example` vers `.env.local` et remplissez :

```
OPENROUTER_API_KEY=sk-or-...     # https://openrouter.ai/keys
```

Une seule clé OpenRouter suffit — elle gère l'analyse ET le recoloriage.

### 2. Lancer l'app

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000

## Fonctionnement

1. **Upload** — Glissez-déposez ou cliquez pour uploader une photo de façade
2. **Analyse** — Claude vision (via OpenRouter) analyse la façade
3. **Choix couleur** — 2 teintes proposées : G00 Naturel & R93 Brique Chaud
4. **Recoloriage** — Gemini Image (via OpenRouter) recolorie la façade
5. **Résultat** — Avant/après, téléchargement et envoi par email

## Modèles utilisés (via OpenRouter)

| Usage | Modèle |
|-------|--------|
| Analyse vision | `anthropic/claude-sonnet-4.6` |
| Édition d'image | `google/gemini-2.5-flash-image` |

## Couleurs disponibles

| Code | Nom | NCS | Hex |
|------|-----|-----|-----|
| G00 | Naturel | 0502-Y50R | #F0EEE8 |
| R93 | Brique Chaud | 4040-Y80R | #C46248 |

## Email (optionnel)

Pour activer l'envoi par email, ajoutez dans `.env.local` :
```
RESEND_API_KEY=re_...            # https://resend.com
EMAIL_FROM=facade-ia@votredomaine.com
```
