# VERSION.md

- **Version** : 7.5.2
- **Date** : 2026-08-26

## 7.5.2

- Navigation par onglets : Paramètres, Données, Analyse, Simulation, Backtest, Audit
- En-tête allégé (statut + RECALCULER / GUIDE) ; métriques toujours visibles
- Onglet actif mémorisé en session

## 7.5.1

- Correction allocation : cibles sur **budget actions** (hors réserve) — plus de starvation des derniers titres
- Score ≠ poids ; plafond maxWeight + redistribution score-driven
- Holdings : plafond sur position **totale** post-achat
- DIVERSIFICATION LIMITÉE explicite si trop peu de titres éligibles
- Concentration = poids du plus gros titre (portefeuille actions)
- Noms complets des sociétés (mapping centralisé, jamais inventé)
- Decision Center / exports enrichis (société, achat, écart)

## 7.5.0

- Persistance, export CSV, guide, CSV preview/confirm
- Correctifs P0 Predictor/backtest/PnL

## 7.4.1

- Historique complet jusqu’à J-1, jamais LIVE BRVM
