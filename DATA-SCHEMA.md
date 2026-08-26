# DATA-SCHEMA.md

## Statut actuel (V7.4.1)

| Mode | Live | Disponible |
|------|------|------------|
| INTERNAL | NON | OUI — **tout l’historique public jusqu’à J-1** |
| SAMPLE | NON | OUI (fallback) |
| CSV | NON | OUI (import + fusion interne) |
| ANNUAL_INDEX | NON | OUI — BRVM Composite année de fin 2006–2025 |
| LIVE BRVM | — | **NON utilisé** — volontairement |

Politique : pas de LIVE BRVM. La base de travail utilise toutes les séries disponibles avec `date <= J-1`.

## Historique annuel (PRICE_INDEX)

Fichier : `public/data/BRVM_HISTORICAL_2006_2025_ANNUAL.csv`

Colonnes :

```
year,brvm_composite_year_end,quality,notes
```

- `quality` ∈ `VERIFIED` | `SECONDARY` | `MISSING`
- Niveau d’indice ou rendement manquant → `null` (jamais inventé)
- Rendement YoY dérivé **uniquement** si deux niveaux d’indice consécutifs existent
- `seriesType` = `PRICE_INDEX` (pas `TOTAL_RETURN`)
- Interdit : expansion en daily fake, prix de titres inventés, label LIVE, backtest titres « validé »

Module : `src/data/historical/HistoricalMarketData.js`

Usages autorisés : régimes, scénarios stress, benchmark annuel, sanity checks.

## Schéma quotidien futur (non rempli)

```
date,symbol,open,high,low,close,volume
```

Constante : `src/data/historical/dailySchema.js`  
Tant qu’absent / non officiel : `BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT`

## Base interne daily (communauté)

Construit à partir de séries historiques publiques :
`https://github.com/Fredysessie/brvm-data-public`

Univers cœur : SNTS, BOAB, ORAC, SGBC, ETIT, CABC, ECOC, TTLC, SHEC, SIVC, SDCC, CIEC  
Fenêtre : **historique public complet** coupé à **J-1** (jamais la séance du jour / LIVE).  
**≠** feed officiel BRVM.

## Architecture

```
DATA SOURCE → DATA ADAPTER → NORMALIZER → QUALITY GATE
→ FEATURE ENGINE → PREDICTOR → PORTFOLIO → ALLOCATION
→ STRESS → DECISION → BACKTEST → AUDIT → UI
         ↗ HistoricalMarketData (annual index)
```

Providers (`src/data/`) :

- `brvmOfficialStub` — jamais live tant que non souscrit
- `csvProvider` — upload utilisateur
- `sampleProvider` — CSV SAMPLE bundlé
- `internalDb` — IndexedDB
- `historical/HistoricalMarketData` — indice annuel

## Modèle interne daily

Minimum : `date,symbol,close,volume`  
Enrichi (nullable) : `pe,dividendYield,roe,revenueGrowth,debtEquity,marketCap,sharesOutstanding`

Champ absent → `null` (jamais inventé).

**Dividendes :** la sync INTERNAL (`historicalSync`) ne remplit **pas** `dividendYield` (séries
OHLC communauté uniquement). Sample / CSV enrichi peuvent fournir un yield. Sans yield, le moteur
n’illustre pas de dividendes et les rendements titres restent **PRICE_ONLY** (pas de
TOTAL_RETURN inventé).

**Appréciation annuelle (prix) :**
- `avgAnnualReturn` = moyenne géométrique des variations close année civile → année civile
- `annualizedReturn` / `priceCagr` = CAGR prix first→last (si ≥ 60 jours)
- Les deux excluent les dividendes tant que DPS/yield absents.

## Source officielle BRVM

Les flux temps réel / fin de journée BRVM sont des **services sous contrat**.

Pour activer un vrai LIVE plus tard : backend/serverless + credentials hors frontend.

## Sécurité

Aucune clé API dans le frontend / GitHub Pages.
