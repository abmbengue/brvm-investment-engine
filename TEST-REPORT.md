# TEST-REPORT.md — BRVM Investment Engine V7.0.0

Format : ACTION | ATTENDU | RÉEL | PASS/FAIL

## Unitaires (`npm test`) — 35/35 PASS

Voir sortie vitest 2026-08-26.

## Navigateur réel (Puppeteer + Chrome) — 14/14 PASS

| ACTION | ATTENDU | RÉEL | PASS/FAIL |
|--------|---------|------|-----------|
| blur capital 2300000 | 2 300 000 | 2 300 000 | PASS |
| blur capital 500000 | 500 000 | 500 000 | PASS |
| blur capital 15000000 | 15 000 000 | 15 000 000 | PASS |
| blur capital 250000000 | 250 000 000 | 250 000 000 | PASS |
| blur capital 1000000000 | 1 000 000 000 | 1 000 000 000 | PASS |
| capital vide | '' + 0 FCFA | '' + 0 FCFA | PASS |
| Enter apport 1000000 | 1 000 000 | 1 000 000 | PASS |
| recalc capital metric 1M→10M | 1 000 000 → 10 000 000 | OK | PASS |
| recalc valeur finale 1M→10M | change (~×10) | 2 451 357 → 24 513 570 | PASS |
| paste 15000000 | 15 000 000 | 15 000 000 | PASS |
| horizon 100 | ligne 100 ans | true | PASS |
| CSV sample | gate ≠ BLOCKED | PASS + 240 lignes / 6 titres | PASS |
| profil prudent≠dynamique | UI change | OK | PASS |
| console errors | 0 | 0 | PASS |

## UI manuelle (Chrome)

| ACTION | ATTENDU | RÉEL | PASS/FAIL |
|--------|---------|------|-----------|
| Capital 1 000 000 + apport 0 + 10 ans | FV ≈ 2.45M | 2 451 357 FCFA | PASS |
| Capital 10 000 000 | FV ≈ 24.5M | 24 513 570 FCFA | PASS |
| Import sample-brvm.csv | Quality Gate PASS | PASS | PASS |
| Predictor peuplé | scores | SNTS 82.3 etc. | PASS |
| Allocation | poids/montants | SNTS 17.8% | PASS |

## Lint / Build

| ACTION | ATTENDU | RÉEL | PASS/FAIL |
|--------|---------|------|-----------|
| `npm run lint` | clean | clean | PASS |
| `npm run build` | success | success | PASS |

## Déploiement

| ACTION | ATTENDU | RÉEL | PASS/FAIL |
|--------|---------|------|-----------|
| Push GitHub projet existant | possible | **BLOQUÉ** — agent sans repo (`repoUrl=null`) | FAIL (blocage infra) |
| URL publique Vercel | disponible | **NON** — pas de credentials / projet lié | FAIL (blocage infra) |

## CSV edge cases (unitaires)

vide, invalide, virgule, point-virgule, colonnes manquantes, doublons, dates désordonnées, nulls, prix nul, volume invalide — PASS (voir `src/lib/csv.test.js`).
