# TEST-REPORT.md — V7.5.0

## Périmètre

Finalisation produit : persistance, export, guide, CSV confirm, correctifs P0 moteur.

## Résultat

- `npm test` → **85/85 PASS**
- `npm run lint` → PASS (warnings non bloquants)
- `npm run build` → PASS

## Couverture ajoutée

- userSettings save/load/reset/corrupt
- export CSV stamped INTERNAL/asOf/Pas LIVE
- predictor NaN/Infinity + insufficient
- allocation maxWeight
- CSV dates futures / close manquant
- money PnL négatif
- backtest never validated

## Non-régression

- INTERNAL J-1
- SAMPLE / CSV
- Annual PRICE_INDEX
- Pas de LIVE BRVM
