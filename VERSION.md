# VERSION.md

- **Version** : 7.9.0
- **Date** : 2026-08-26

## 7.9.0

- Camembert **portefeuille total** : actions (valeur) + initial/spot/récurrents avec appréciation
- Attribution FV par source de flux (même capitalisation mensuelle que la simulation)

## 7.8.0

- Clarifie : **dividendes absents** des séries INTERNAL (OHLC) — jamais inventés
- **Moyenne géométrique annuelle** des variations de cours (compoundée) + CAGR prix
- Affichage sur holdings / predictor / allocation + export CSV
- Base de rendement explicite : `PRICE_ONLY`

## 7.7.3

- Alias holdings : `SONATEL` → `SNTS` (et autres noms courants → tickers BRVM)
- Résolution à la saisie + à la normalisation portefeuille (prix / nom marché)
- Guide : préciser symbole coté vs alias

## 7.7.2

- Cours portefeuille = **close le plus récent ≤ asOf (J-1) et ≤ 3 jours**
- Au-delà de 3 jours : prix N/D (périmé), jamais de cours inventé
- Affichage date du cours + âge (J-n) dans le portefeuille détenu

## 7.7.1

- Axes X : ticks d’années explicites (début + fin du plan toujours visibles)
- Légendes hors SVG (plus de débordement) ; libellés raccourcis
- Camemberts sans labels sur tranches (légende HTML en dessous)

## 7.7.0

- Nouvel onglet **Graphiques**
