# TEST-REPORT.md — V7.4.0

## Périmètre

- Intégration historique annuel BRVM Composite 2006–2025
- Module `HistoricalMarketData`
- Non-régression V7.0.1 → V7.3.0 (SAMPLE / CSV / INTERNAL / holdings / money)

## Tests unitaires obligatoires (annuel)

| Cas | Attendu |
|-----|---------|
| 20 années chargées | PASS |
| Tri chronologique | PASS |
| Absence de doublons | PASS |
| Valeurs manquantes gérées (null, pas inventées) | PASS |
| Aucun calcul avec données inventées | PASS |
| Message backtest titres non validé | PASS |
| PRICE_INDEX / pas LIVE | PASS |

## Commandes

```bash
npm test
npm run lint
npm run build
```

## Non-régression

- SAMPLE / CSV toujours disponibles
- Mode INTERNAL inchangé (couche séparée de l’annuel)
- Money parse/format unique
- Quality Gate BLOCKED sans données titres

## Résultat

- `npm test` → **68/68 PASS**
- `npm run lint` → PASS
- `npm run build` → PASS
- Non-régression SAMPLE/CSV/INTERNAL préservée
- Historique annuel 20 ans intégré (PRICE_INDEX, pas LIVE)
