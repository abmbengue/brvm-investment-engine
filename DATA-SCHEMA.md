# DATA-SCHEMA.md

## Source

| Mode | Description |
|------|-------------|
| CSV | Seule source autorisée livrée |
| LIVE | Non connecté |

## CSV minimum

```
date,symbol,close,volume
```

## CSV enrichi

```
date,symbol,close,volume,pe,dividendYield,roe,revenueGrowth,debtEquity
```

## Règles

- Délimiteurs : `,` ou `;`
- Prix ≤ 0 → rejet
- Volume < 0 → rejet ; volume 0 accepté mais pénalisé
- Doublons `(date,symbol)` → conservé une fois
- Dates désordonnées → tri chronologique
- Fondamentaux absents → `null` (jamais inventés)

## Pipeline

```
DATA SOURCE → ADAPTER (CSV) → NORMALIZER → QUALITY GATE
→ FEATURE ENGINE → PREDICTOR → PORTFOLIO → DECISION → UI
```
