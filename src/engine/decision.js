/**
 * Decision Center — BUY / ADD / WAIT / REDUCE / EXIT / NO ACTION
 * Insufficient data → WAIT / NO ACTION. Never firm recommendation when BLOCKED.
 */

export function decide({ ranked, allocation, qualityGate, profile, stress, heldSymbols = [] }) {
  const decisions = [];

  if (qualityGate.status === 'BLOCKED') {
    return [
      {
        symbol: '—',
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
  const proposedAdd = new Set(
    (allocation?.proposedBuys || []).filter((b) => b.action === 'ADD').map((b) => b.symbol)
  );
  const proposedBuy = new Set(
    (allocation?.proposedBuys || []).filter((b) => b.action === 'BUY').map((b) => b.symbol)
  );

  for (const item of ranked) {
    const inPort = selectedSymbols.has(item.symbol) || held.has(item.symbol);
    const owned = held.has(item.symbol);
    const dq = item.dataQuality;
    const conf = item.confidence;
    let action = 'WAIT';
    let justification = '';
    let risk = 'modéré';
    let invalidation = '';

    if (dq < 0.3 || conf < 0.35) {
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
    } else if (proposedAdd.has(item.symbol) || (owned && item.score >= 62 && conf >= 0.45)) {
      action = 'ADD';
      justification = owned
        ? 'Titre déjà en portefeuille — renforcement proposé avec le cash spot'
        : 'Renforcement proposé';
      risk = 'concentration';
      invalidation = `Dépasser limite concentration ${(profile.concentrationLimit * 100).toFixed(0)}%`;
    } else if (proposedBuy.has(item.symbol) || (item.score >= 70 && conf >= 0.55 && !owned)) {
      action = 'BUY';
      justification = `Nouvelle ligne proposée — score ${item.score}, confiance ${Math.round(conf * 100)}%`;
      risk = item.feature.volatility > 0.05 ? 'titre élevé' : 'marché';
      invalidation = `Score < 55 ou qualité data < 40%`;
    } else if (item.score >= 55 && !inPort && conf >= 0.45) {
      action = 'WAIT';
      justification = 'Score correct mais hors sélection automatique (contraintes profil)';
      risk = 'modèle';
      invalidation = 'Entrée dans le top sélection du profil';
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
      action,
      justification,
      score: item.score,
      risk,
      invalidation,
      dataQuality: dq,
      confidence: conf,
    });
  }

  // Keep actionable + top WAIT items for UI
  const priority = { EXIT: 0, REDUCE: 1, BUY: 2, ADD: 3, WAIT: 4, 'NO ACTION': 5 };
  return decisions.sort((a, b) => (priority[a.action] ?? 9) - (priority[b.action] ?? 9)).slice(0, 15);
}
