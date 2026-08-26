# VERSION.md

- **Version** : 7.7.2
- **Date** : 2026-08-26

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
- Courbes : capital versé vs valeur projetée, gain, holdings
- Histogrammes : contributions annuelles (initial / spot / récurrent / div. estimés), poids par titre
- Camemberts : structure du capital, allocation, spot vs réserve, décisions
- Axe X = années calendaires du plan (intervalle adapté à l’horizon)
- Dividendes illustrés seulement si yield observé (hypothèse, jamais inventé)

## 7.6.3

- Années plan / spot / récurrent / durée en **menus déroulants** indépendants
- Plus de saisie libre (évite le blocage spot/récurrent)

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
