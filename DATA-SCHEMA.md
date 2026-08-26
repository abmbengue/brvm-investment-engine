# DATA-SCHEMA.md

## Statut actuel (V7.3.0)

| Mode | Live | Disponible |
|------|------|------------|
| INTERNAL | NON | OUI — base historique locale (IndexedDB) |
| SAMPLE | NON | OUI (fallback) |
| CSV | NON | OUI (import + fusion interne) |
| LIVE BRVM | — | **NON** — contrat officiel requis |

Message : base interne historique active **≠** flux BRVM live.

## Base interne

Construit à partir de séries historiques publiques :
`https://github.com/Fredysessie/brvm-data-public`

Univers cœur : SNTS, BOAB, ORAC, SGBC, ETIT, CABC, ECOC, TTLC, SHEC, SIVC, SDCC, CIEC  
Fenêtre : ~3 ans de daily bars.

## Architecture

```
DATA SOURCE → DATA ADAPTER → NORMALIZER → QUALITY GATE
→ FEATURE ENGINE → PREDICTOR → PORTFOLIO → ALLOCATION
→ STRESS → DECISION → BACKTEST → AUDIT → UI
```

Providers (`src/data/`) :

- `brvmOfficialStub` — jamais live tant que non souscrit
- `csvProvider` — upload utilisateur
- `sampleProvider` — CSV SAMPLE bundlé

Interface conceptuelle `DataProvider` :

- `getQuotes()` / `getHistory()` / `getFundamentals()` / `getMetadata()` / `isAvailable()`

## Modèle interne

Minimum : `date,symbol,close,volume`  
Enrichi (nullable) : `pe,dividendYield,roe,revenueGrowth,debtEquity,marketCap,sharesOutstanding`

Champ absent → `null` (jamais inventé).

## Source officielle BRVM

Les flux temps réel / fin de journée BRVM sont des **services sous contrat**  
(FIX, web-services, livraison EOD) — pas d’API publique gratuite documentée.

Références :

- https://www.brvm.org/en/real-time-data-feed
- https://www.brvm.org/en/end-day-data
- https://www.brvm.org/en/services/catalogues-de-services

Pour activer un vrai LIVE plus tard : backend/serverless + credentials hors frontend.

## Sécurité

Aucune clé API dans le frontend / GitHub Pages.
