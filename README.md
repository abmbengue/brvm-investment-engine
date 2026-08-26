# README.md

# BRVM Investment Engine V7.5.0

Moteur d’analyse BRVM — produit finalisé : persistance, export, guide, CSV confirmé, historique jusqu’à J-1.

## URL

https://abmbengue.github.io/brvm-investment-engine/

## Chaîne

DATA → PREDICTOR → PORTFOLIO → ALLOCATION → STRESS → DECISION → BACKTEST → AUDIT

## Données

| Mode | Live | Rôle |
|------|------|------|
| **INTERNAL** | NON | Tout l’historique public dispo jusqu’à **J-1** |
| **SAMPLE** | NON | Démo bundlée |
| **CSV** | NON | Import avec prévisualisation + confirmation |
| **ANNUAL INDEX** | NON | Indice Composite 2006–2025 (PRICE_INDEX) |
| **LIVE BRVM** | — | **Non utilisé** |

Politique : **pas de LIVE BRVM** — asOf ≤ J-1 affiché clairement.

L’historique annuel est un **PRICE_INDEX**, pas un TOTAL RETURN, pas des prix de titres, pas LIVE.

Backtest titres : **`BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT`** tant qu’un dataset quotidien officiel/autorisé (`date,symbol,open,high,low,close,volume`) n’est pas branché.

## Démarrage

```bash
npm install
npm test
npm run lint
npm run build
npm run preview
```

## Avertissement

Projections = hypothèses, jamais des garanties. Aucun ordre de bourse.
