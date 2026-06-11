# FaçadeIA

Simulez la couleur de votre façade en secondes grâce à l'IA.

## Démarrage rapide

### 1. Configurer les clés API

Copiez `.env.local.example` vers `.env.local` et remplissez les clés :

```
ANTHROPIC_API_KEY=sk-ant-...       # https://console.anthropic.com
REPLICATE_API_TOKEN=r8_...         # https://replicate.com/account/api-tokens
```

### 2. Lancer l'app

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000

## Clés API nécessaires

| Service | Usage | Lien |
|---------|-------|------|
| **Anthropic** (Claude) | Analyse vision de la façade | [console.anthropic.com](https://console.anthropic.com) |
| **Replicate** | Recoloriage IA de l'image (FLUX Kontext) | [replicate.com](https://replicate.com/account/api-tokens) |
| Resend *(optionnel)* | Envoi par email | [resend.com](https://resend.com) |

## Fonctionnement

1. **Upload** — Glissez-déposez ou cliquez pour uploader une photo de façade
2. **Analyse** — Claude vision analyse la façade et personnalise les recommandations
3. **Choix couleur** — 2 teintes proposées : G00 Naturel & R93 Brique Chaud
4. **Recoloriage** — FLUX Kontext Pro recolorie la façade de façon photoréaliste
5. **Résultat** — Affichage avant/après, téléchargement et envoi par email

## Couleurs disponibles

| Code | Nom | NCS | Hex |
|------|-----|-----|-----|
| G00 | Naturel | 0502-Y50R | #F0EEE8 |
| R93 | Brique Chaud | 4040-Y80R | #C46248 |
