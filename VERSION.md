# VERSION.md

- **Version** : 7.6.2
- **Date** : 2026-08-26

## 7.6.2

- Les 3 années (plan / spot / récurrent) sont **indépendantes** (plus de forçage mutuel)
- Boutons − / + sur chaque année
- Avertissement si spot/récurrent &lt; démarrage plan (calage en simulation uniquement)

## 7.6.1

- Correctif saisie des années (plan / spot / récurrent / durée) : frappe libre, validation au blur
- Flèches ↑↓ pour incrémenter ; plus de « snap-back » pendant la frappe

## 7.6.0

- Apport **initial** distinct de l’**investissement spot**
- Années : démarrage plan, investissement spot, démarrage récurrent
- Simulation patrimoniale calée sur ce calendrier
- Rendement historique **par action** (période + annualisé si ≥ 60 j) — jamais inventé
- Scénario titres optionnel (moyenne pondérée observée)

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
