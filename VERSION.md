# VERSION.md

- **Version** : 7.4.1
- **Date** : 2026-08-26

## 7.4.1

- Politique data : **pas de LIVE BRVM**
- Base interne = **tout l’historique public disponible jusqu’à J-1**
- Plus de fenêtre forcée 3 ans
- Labels UI : asOf J-1 explicite

## 7.4.0

- Module **HistoricalMarketData** — indice BRVM Composite annuel 2006–2025
- Régimes de marché, calibration stress, benchmark annuel
- Qualité **VERIFIED / SECONDARY / MISSING** affichée
- Série **PRICE_INDEX** (pas TOTAL RETURN, pas LIVE)
- Message : `BACKTEST TITRES NON VALIDÉ — HISTORIQUE QUOTIDIEN INSUFFISANT`
- Schéma quotidien futur préparé : `date,symbol,open,high,low,close,volume`
- Aucune invention de prix / daily à partir de l’annuel

## 7.3.0

- Base de données interne (IndexedDB) pour le Predictor
- Ingestion de séries historiques publiques (GitHub `brvm-data-public`)
- Mode **INTERNAL** (pas LIVE)

## 7.2.0

- Cash spot + portefeuille déjà acheté

## 7.1.0-PREPARED

- Couche DataProvider

## 7.0.1

- SAMPLE auto-load + Pages
