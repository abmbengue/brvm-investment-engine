# README.md

# BRVM Investment Engine V7.4.0

Moteur d’analyse BRVM — Predictor + portefeuille + historique annuel d’indice + base interne quotidienne (communauté).

## URL

https://abmbengue.github.io/brvm-investment-engine/

## Chaîne

DATA → PREDICTOR → PORTFOLIO → ALLOCATION → STRESS → DECISION → BACKTEST → AUDIT

## Données

| Mode | Live | Rôle |
|------|------|------|
| **INTERNAL** | NON | Daily OHLC communauté (IndexedDB) pour Predictor |
| **SAMPLE** | NON | Démo bundlée |
| **CSV** | NON | Import utilisateur |
| **ANNUAL INDEX** | NON | Indice Composite 2006–2025 (régimes / stress / benchmark) |
| **LIVE BRVM** | — | Non connecté (contrat officiel requis) |

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
