/**
 * Quality Gate — PASS / WARNING / BLOCKED
 */

export function evaluateQualityGate({ csvResult, features, ranked }) {
  const checks = [];

  if (!csvResult || !csvResult.ok) {
    checks.push({ id: 'source', status: 'BLOCKED', detail: 'Aucune source CSV valide' });
  } else {
    checks.push({
      id: 'source',
      status: 'PASS',
      detail: `${csvResult.importedRows} lignes / ${csvResult.symbols.length} titres`,
    });
  }

  const nFeat = features?.length || 0;
  if (nFeat === 0) {
    checks.push({ id: 'universe', status: 'BLOCKED', detail: 'Univers vide' });
  } else if (nFeat < 3) {
    checks.push({ id: 'universe', status: 'WARNING', detail: `Univers restreint (${nFeat})` });
  } else {
    checks.push({ id: 'universe', status: 'PASS', detail: `${nFeat} titres` });
  }

  const avgDq =
    nFeat > 0 ? features.reduce((s, f) => s + f.dataQuality, 0) / nFeat : 0;
  if (avgDq < 0.3) {
    checks.push({ id: 'data_quality', status: 'BLOCKED', detail: `Qualité moyenne ${Math.round(avgDq * 100)}%` });
  } else if (avgDq < 0.55) {
    checks.push({ id: 'data_quality', status: 'WARNING', detail: `Qualité moyenne ${Math.round(avgDq * 100)}%` });
  } else {
    checks.push({ id: 'data_quality', status: 'PASS', detail: `Qualité moyenne ${Math.round(avgDq * 100)}%` });
  }

  const minObs = nFeat ? Math.min(...features.map((f) => f.observations)) : 0;
  if (minObs < 2) {
    checks.push({ id: 'history', status: 'WARNING', detail: 'Historique court (< 2 obs) sur au moins un titre' });
  } else if (minObs < 5) {
    checks.push({ id: 'history', status: 'WARNING', detail: `Historique minimal ${minObs} obs` });
  } else {
    checks.push({ id: 'history', status: 'PASS', detail: `Historique minimal ${minObs} obs` });
  }

  const rankedOk = (ranked || []).filter((r) => r.confidence >= 0.35).length;
  if (rankedOk === 0 && nFeat > 0) {
    checks.push({ id: 'confidence', status: 'WARNING', detail: 'Aucune titre à confiance suffisante' });
  } else if (nFeat > 0) {
    checks.push({ id: 'confidence', status: 'PASS', detail: `${rankedOk} titres exploitables` });
  }

  const order = { BLOCKED: 2, WARNING: 1, PASS: 0 };
  const status = checks.reduce((acc, c) => (order[c.status] > order[acc] ? c.status : acc), 'PASS');

  return {
    status: nFeat === 0 && (!csvResult || !csvResult.ok) ? 'BLOCKED' : status,
    checks,
    risks: {
      marche: status === 'PASS' ? 'contrôlé' : 'élevé',
      titre: 'dépend du score individuel',
      liquidite: avgDq < 0.5 ? 'à surveiller' : 'ok relatif',
      donnees: status,
      modele: 'scoring heuristique — non garanti',
    },
  };
}
