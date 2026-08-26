# BRVM Investment Engine V7.0.0

Moteur d’analyse et de simulation pour le marché BRVM.

## Chaîne

DATA → PREDICTOR → PORTFOLIO → ALLOCATION → STRESS → DECISION → BACKTEST → AUDIT

## Démarrage

```bash
npm install
npm run dev
```

Scripts :

- `npm test` — tests unitaires
- `npm run lint` — oxlint
- `npm run build` — build production
- `npm run preview` — servir le build

## Données

Aucune API live n’est connectée. Importez un CSV (`date,symbol,close,volume` + colonnes optionnelles).

Un fichier d’exemple SAMPLE est disponible : `/sample-brvm.csv`.

## Avertissement

Les projections sont des **hypothèses**, jamais des garanties. Aucun ordre de bourse n’est passé.
