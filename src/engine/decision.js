/**
 * Decision Center — BUY / ADD / WAIT / REDUCE / EXIT / NO ACTION
 * Insufficient data → WAIT / NO ACTION. Never firm recommendation when BLOCKED.
 */

import { getCompanyName } from '../data/companyNames.js';

export function decide({ ranked, allocation, qualityGate, profile, stress, heldSymbols = [] }) {
  const decisions = [];

  if (qualityGate.status === 'BLOCKED') {
    return [
      {
        symbol: '—',
        companyName: '—',
        action: 'NO ACTION',
        justification: 'Quality Gate BLOCKED — données insuffisantes ou invalides',
        score: null,
        risk: 'données',
        invalidation: 'Importer un CSV exploitable et repasser le Quality Gate',
        dataQuality: 0,
      },
    ];
  }

  const baissier = stress?.find((s) => s.id === 'baissier');
  const selectedSymbols = new Set((allocation?.positions || []).map((p) => p.symbol));
  const held = new Set([
    ...heldSymbols.map((s) => String(s).toUpperCase()),
    ...((allocation?.existing || []).map((p) => p.symbol) || []),
  ]);
  const buyBySym = new Map((allocation?.proposedBuys || []).map((b) => [b.symbol, b]));
  const posBySym = new Map((allocation?.positions || []).map((p) => [p.symbol, p]));

  for (const item of ranked) {
    const inPort = selectedSymbols.has(item.symbol) || held.has(item.symbol);
    const owned = held.has(item.symbol);
    const pos = posBySym.get(item.symbol);
    const proposed = buyBySym.get(item.symbol);
    const dq = item.dataQuality;
    const conf = item.confidence;
    let action = 'WAIT';
    let justification = '';
    let risk = 'modéré';
    let invalidation = '';

    if (dq < 0.3 || conf < 0.35 || item.insufficient) {
      action = 'WAIT';
      justification = 'Données insuffisantes pour une décision ferme';
      risk = 'données';
      invalidation = 'Améliorer couverture fondamentaux / historique';
    } else if (item.negatives.some((n) => /Volume nul|Historique/.test(n))) {
      action = 'NO ACTION';
      justification = 'Titre non exploitable (volume ou historique)';
      risk = 'liquidité';
      invalidation = 'Volume et historique minimum requis';
    } else if (item.score < 40 && owned) {
      action = 'EXIT';
      justification = 'Position déjà détenue avec score faible';
      risk = 'titre';
      invalidation = 'Score remonte au-dessus de 50 avec data quality stable';
    } else if (
      owned &&
      pos &&
      pos.targetWeightPct != null &&
      pos.weightPct != null &&
      pos.weightPct > pos.targetWeightPct + 2
    ) {
      action = 'REDUCE';
      justification = `Poids actuel ${pos.weightPct}% > cible ${pos.targetWeightPct}% — surpondération`;
      risk = 'concentration';
      invalidation = 'Poids actuel ≤ cible + 1 pt';
    } else if (item.score < 48 && owned) {
      action = 'REDUCE';
      justification = 'Position détenue — score médiocre, réduire l’exposition';
      risk = 'titre';
      invalidation = 'Score > 55 sur 2 observations';
    } else if (baissier && baissier.recommendedPositionScale < 0.7 && owned) {
      action = 'REDUCE';
      justification = 'Stress baissier sur titre déjà détenu';
      risk = 'marché';
      invalidation = 'Scénario baissier moins sévère / haircut réduit';
    } else if (proposed && proposed.amount > 0 && proposed.action === 'ADD') {
      action = 'ADD';
      justification = `Renforcement proposé — ${Math.round(proposed.amount).toLocaleString('fr-FR')} FCFA (score ${item.score})`;
      risk = 'concentration';
      invalidation = `Dépasser limite concentration ${(profile.concentrationLimit * 100).toFixed(0)}%`;
    } else if (proposed && proposed.amount > 0 && proposed.action === 'BUY') {
      action = 'BUY';
      justification = `Nouvelle ligne — ${Math.round(proposed.amount).toLocaleString('fr-FR')} FCFA · score ${item.score}, confiance ${Math.round(conf * 100)}%`;
      risk = item.feature?.volatility > 0.05 ? 'titre élevé' : 'marché';
      invalidation = 'Score < 55 ou qualité data < 40%';
    } else if (proposed && (!proposed.amount || proposed.amount <= 0)) {
      action = 'WAIT';
      justification = 'Signal d’achat sans montant exécutable (arrondi / cash / plafond)';
      risk = 'liquidité';
      invalidation = 'Cash investissable ou prix permettant ≥ 1 action';
    } else if (
      owned &&
      pos &&
      pos.targetWeightPct != null &&
      Math.abs((pos.weightPct || 0) - (pos.targetWeightPct || 0)) <= 2
    ) {
      action = 'HOLD';
      justification = 'Position proche de la cible — aucun ajustement material';
      risk = 'modèle';
      invalidation = 'Écart poids > 2 pts ou changement de score';
    } else if (item.score >= 55 && !inPort && conf >= 0.45) {
      action = 'WAIT';
      justification = 'Score correct mais hors sélection / cash insuffisant après contraintes';
      risk = 'modèle';
      invalidation = 'Entrée dans le top sélection du profil avec cash disponible';
    } else if (owned) {
      action = 'NO ACTION';
      justification = 'Position détenue — pas de signal d’ajustement';
      risk = 'modèle';
      invalidation = 'Changement matériel de score ou de données';
    } else {
      action = 'NO ACTION';
      justification = 'Pas de signal actionnable';
      risk = 'modèle';
      invalidation = 'Changement matériel de score ou de données';
    }

    if (qualityGate.status === 'WARNING' && (action === 'BUY' || action === 'ADD')) {
      action = 'WAIT';
      justification = `Quality Gate WARNING — ${justification}`;
      risk = 'données';
    }

    decisions.push({
      symbol: item.symbol,
      companyName: getCompanyName(item.symbol),
      action,
      justification,
      score: item.score,
      risk,
      invalidation,
      dataQuality: dq,
      confidence: conf,
      qualityLabel: item.qualityLabel || null,
      currentWeightPct: pos?.weightPct ?? null,
      targetWeightPct: pos?.targetWeightPct ?? null,
      weightGapPct:
        pos != null
          ? Math.round(((pos.weightPct || 0) - (pos.targetWeightPct || 0)) * 10) / 10
          : null,
      buyAmount: proposed?.amount || 0,
      alreadyHeld: owned,
    });
  }

  const priority = { EXIT: 0, REDUCE: 1, BUY: 2, ADD: 3, HOLD: 4, WAIT: 5, 'NO ACTION': 6 };
  return decisions.sort((a, b) => (priority[a.action] ?? 9) - (priority[b.action] ?? 9)).slice(0, 15);
}
