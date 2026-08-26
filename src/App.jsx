import { useMemo, useState, useCallback, useEffect } from 'react';
import MoneyInput from './components/MoneyInput.jsx';
import { formatMoneyLabel } from './lib/money.js';
import { runEngine } from './engine/pipeline.js';
import { RISK_PROFILES } from './engine/profiles.js';
import { loadMarketData, loadFromCsvText } from './data/loadMarketData.js';
import './App.css';

const VERSION = '7.2.0';
const SAMPLE_CSV_URL = `${import.meta.env.BASE_URL}sample-brvm.csv`;
const EMPTY_HOLDING = () => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  symbol: '',
  shares: '',
  avgCost: '',
});

function pct(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function gateClass(status) {
  if (status === 'WARNING' || status === 'READY' || status === 'GATE') return 'yellow';
  if (status === 'PASS') return 'green';
  return 'red';
}

function dataStatusBadge(mode, live) {
  if (live && mode === 'LIVE') return { label: 'LIVE', className: 'status-live' };
  if (mode === 'SAMPLE') return { label: 'SAMPLE', className: 'status-sample' };
  if (mode === 'CSV') return { label: 'CSV', className: 'status-csv' };
  return { label: mode === 'BLOCKED' ? 'BLOCKED' : 'NONE', className: 'status-blocked' };
}

export default function App() {
  const [capital, setCapital] = useState(5_000_000);
  const [monthly, setMonthly] = useState(500_000);
  const [years, setYears] = useState(25);
  const [rate, setRate] = useState(9);
  const [profileId, setProfileId] = useState('equilibre');
  const [csvResult, setCsvResult] = useState(null);
  const [csvMessage, setCsvMessage] = useState('Chargement SAMPLE…');
  const [dataSource, setDataSource] = useState('NONE');
  const [liveStatusMessage, setLiveStatusMessage] = useState('Données temps réel non connectées.');
  const [commitSignal, setCommitSignal] = useState(0);
  const [holdingRows, setHoldingRows] = useState([EMPTY_HOLDING()]);

  const holdingsInput = useMemo(
    () =>
      holdingRows
        .map((r) => ({
          symbol: r.symbol,
          shares: r.shares,
          avgCost: r.avgCost === '' ? null : r.avgCost,
        }))
        .filter((r) => String(r.symbol || '').trim() && Number(r.shares) > 0),
    [holdingRows]
  );

  const applyProviderResult = useCallback((loaded) => {
    const compat = loaded.csvCompat;
    setCsvResult(compat);
    setLiveStatusMessage(loaded.liveStatusMessage || 'Données temps réel non connectées.');
    if (compat?.ok) {
      const mode = loaded.meta?.mode || compat.meta?.mode || 'CSV';
      setDataSource(mode);
      setCsvMessage(
        `${mode} : ${compat.importedRows} lignes, ${compat.symbols.length} titres. ${loaded.liveStatusMessage}`
      );
    } else {
      setDataSource('NONE');
      setCsvMessage(
        `Source indisponible — ${[...(loaded.errors || []), ...(loaded.officialErrors || [])].join(' ; ') || 'fallback requis'}`
      );
    }
    return loaded;
  }, []);

  const loadSample = useCallback(async () => {
    setCsvMessage('Chargement SAMPLE…');
    const loaded = await loadMarketData({ sampleUrl: SAMPLE_CSV_URL, preferSample: true });
    return applyProviderResult(loaded);
  }, [applyProviderResult]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadMarketData({ sampleUrl: SAMPLE_CSV_URL });
        if (!cancelled) applyProviderResult(loaded);
      } catch (e) {
        if (!cancelled) {
          setDataSource('NONE');
          setLiveStatusMessage('Données temps réel non connectées.');
          setCsvMessage(`SAMPLE indisponible — importez un CSV. (${e.message})`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProviderResult]);

  const recalculate = useCallback(() => {
    setCommitSignal((s) => s + 1);
  }, []);

  const result = useMemo(
    () =>
      runEngine({
        capital,
        monthly,
        years,
        annualRatePct: rate,
        profileId,
        csvResult,
        holdings: holdingsInput,
      }),
    [capital, monthly, years, rate, profileId, csvResult, holdingsInput]
  );

  async function onCsvFile(file) {
    if (!file) return;
    const text = await file.text();
    const loaded = await loadFromCsvText(text);
    applyProviderResult(loaded);
  }

  const badge = dataStatusBadge(result.dataStatus.mode || dataSource, result.dataStatus.live);

  return (
    <main className="app">
      <section className="hero">
        <h1>BRVM INVESTMENT ENGINE — V{VERSION}</h1>
        <p className="muted">
          Moteur opérationnel : DATA → PREDICTOR → PORTFOLIO → ALLOCATION → STRESS → DECISION →
          BACKTEST → AUDIT. Simulation ≠ garantie. Aucun ordre réel. Aucun flux live inventé.
        </p>
        <p className="small">
          <span id="data-status-badge" className={`data-status ${badge.className}`}>
            DATA STATUS · {badge.label}
          </span>{' '}
          <span className="muted" id="live-status-msg">
            {liveStatusMessage || result.liveStatusMessage}
          </span>
        </p>
        <div className="toolbar">
          <MoneyInput
            id="capital"
            label="Disponible spot (cash à investir)"
            value={capital}
            onValueChange={setCapital}
            commitSignal={commitSignal}
          />
          <MoneyInput
            id="monthly"
            label="Apport mensuel"
            value={monthly}
            onValueChange={setMonthly}
            commitSignal={commitSignal}
          />
          <label className="field">
            Durée (ans, sans plafond)
            <br />
            <input
              id="years"
              type="number"
              min={1}
              value={years}
              onChange={(e) => setYears(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="field">
            Objectif annuel (%) — hypothèse
            <br />
            <input
              id="rate"
              type="number"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value) || 0)}
            />
          </label>
          <label className="field">
            Profil de risque
            <br />
            <select
              id="profile"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              {Object.values(RISK_PROFILES).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" id="recalc" onClick={recalculate}>
            RECALCULER
          </button>
        </div>
        <p className="small muted">
          Spot = liquidités disponibles maintenant. Apport mensuel = versements futurs (simulation).
          Le portefeuille déjà acheté se saisit ci-dessous.
        </p>
      </section>

      <section className="metrics">
        <div className="metric">
          <small>Cash spot</small>
          <div className="big" id="mcap">
            {formatMoneyLabel(result.spotCash)}
          </div>
        </div>
        <div className="metric">
          <small>Apport mensuel</small>
          <div className="big" id="mmonth">
            {formatMoneyLabel(result.monthly)}
          </div>
        </div>
        <div className="metric">
          <small>Portefeuille détenu</small>
          <div className="big" id="mhold">
            {formatMoneyLabel(result.holdings?.marketValue || 0)}
          </div>
        </div>
        <div className="metric">
          <small>Patrimoine (spot + titres)</small>
          <div className="big" id="mwealth">
            {formatMoneyLabel(result.totalWealthNow)}
          </div>
        </div>
        <div className="metric">
          <small>Quality Gate</small>
          <div className={`big ${gateClass(result.qualityGate.status)}`} id="mqg">
            {result.qualityGate.status}
          </div>
        </div>
      </section>

      <section className="panel" id="holdings-panel">
        <h2>Portefeuille déjà acheté</h2>
        <p className="muted small">
          Saisissez les titres que vous détenez déjà (symbole BRVM, quantité, prix d’achat moyen
          optionnel). La valorisation utilise le dernier cours disponible dans les données — jamais
          inventé.
        </p>
        <table>
          <thead>
            <tr>
              <th>Symbole</th>
              <th>Quantité</th>
              <th>Prix d’achat moyen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {holdingRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    aria-label="symbole"
                    value={row.symbol}
                    placeholder="ex: SNTS"
                    onChange={(e) =>
                      setHoldingRows((rows) =>
                        rows.map((r) =>
                          r.id === row.id ? { ...r, symbol: e.target.value.toUpperCase() } : r
                        )
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="quantité"
                    inputMode="numeric"
                    value={row.shares}
                    placeholder="0"
                    onChange={(e) =>
                      setHoldingRows((rows) =>
                        rows.map((r) =>
                          r.id === row.id ? { ...r, shares: e.target.value.replace(/[^\d]/g, '') } : r
                        )
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="prix moyen"
                    inputMode="decimal"
                    value={row.avgCost}
                    placeholder="optionnel"
                    onChange={(e) =>
                      setHoldingRows((rows) =>
                        rows.map((r) =>
                          r.id === row.id
                            ? { ...r, avgCost: e.target.value.replace(/[^\d.,]/g, '') }
                            : r
                        )
                      )
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      setHoldingRows((rows) =>
                        rows.length <= 1 ? [EMPTY_HOLDING()] : rows.filter((r) => r.id !== row.id)
                      )
                    }
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <button type="button" id="add-holding" onClick={() => setHoldingRows((r) => [...r, EMPTY_HOLDING()])}>
            AJOUTER UNE LIGNE
          </button>
        </div>
        {result.holdings?.positionCount > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Titre</th>
                <th>Qté</th>
                <th>Cours</th>
                <th>Valorisation</th>
                <th>P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {result.holdings.positions.map((p) => (
                <tr key={p.symbol}>
                  <td>{p.symbol}</td>
                  <td>{p.shares}</td>
                  <td>{p.priced ? formatMoneyLabel(p.price) : 'prix N/D'}</td>
                  <td>{p.marketValue != null ? formatMoneyLabel(p.marketValue) : '—'}</td>
                  <td className={p.pnl == null ? '' : p.pnl >= 0 ? 'green' : 'red'}>
                    {p.pnl == null ? '—' : formatMoneyLabel(p.pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="yellow small">Aucune position détenue saisie.</p>
        )}
      </section>

      <section className="panel">
        <h2>Chaîne maître</h2>
        <div className="flow">
          {[
            ['1 DATA', 'Source / qualité / fraîcheur'],
            ['2 PREDICTOR', 'Ranking / conviction'],
            ['3 PORTFOLIO', 'Risque / diversification'],
            ['4 ALLOCATION', 'Poids / tranches'],
            ['5 STRESS', 'Scénarios'],
            ['6 DECISION', 'BUY / WAIT / EXIT'],
            ['7 BACKTEST', 'Walk-forward'],
            ['8 AUDIT', 'Traçabilité'],
          ].map(([t, d]) => (
            <div key={t}>
              <b>{t}</b>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Données BRVM — import CSV</h2>
        <p className="muted small">
          Statut :{' '}
          <b className={result.dataStatus.live ? 'red' : 'yellow'} id="data-source">
            {badge.label}
          </b>
          {' — '}
          <span id="live-flag">Flux live : <b>{result.dataStatus.live ? 'OUI' : 'NON'}</b></span>.
          Authentification / API privée / paywall non contournés.
        </p>
        <div className="toolbar">
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onCsvFile(e.target.files?.[0])}
          />
          <button
            type="button"
            id="load-sample"
            onClick={() => loadSample().catch((e) => setCsvMessage(`SAMPLE : ${e.message}`))}
          >
            CHARGER SAMPLE
          </button>
          <a className="badge" href={SAMPLE_CSV_URL} download>
            Télécharger CSV d&apos;exemple (SAMPLE)
          </a>
        </div>
        <p id="csv-status">{csvMessage}</p>
        {csvResult?.warnings?.length > 0 && (
          <p className="small yellow">
            Avertissements : {csvResult.warnings.slice(0, 5).join(' · ')}
            {csvResult.warnings.length > 5 ? ` (+${csvResult.warnings.length - 5})` : ''}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Simulation patrimoniale</h2>
        <p className="muted small">
          Scénarios = hypothèses de simulation, jamais une garantie. Gain estimé = valeur projetée −
          capital versé.
        </p>
        <div className="metrics mini">
          <div className="metric">
            <small>Capital versé</small>
            <div className="big" id="mcontrib">
              {formatMoneyLabel(result.contributed)}
            </div>
          </div>
          <div className="metric">
            <small>Valeur finale centrale (cash spot + apports)</small>
            <div className="big" id="mfv">
              {formatMoneyLabel(result.finalValue)}
            </div>
          </div>
          <div className="metric">
            <small>Gain estimé</small>
            <div className={`big ${result.gain >= 0 ? 'green' : 'red'}`} id="mgain">
              {formatMoneyLabel(result.gain)}
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Horizon</th>
              <th>Capital versé</th>
              <th>Prudent (5%)</th>
              <th>Central</th>
              <th>Dynamique (12%)</th>
              <th>Gain (central)</th>
            </tr>
          </thead>
          <tbody id="proj">
            {result.projections.map((p) => (
              <tr key={p.years}>
                <td>{p.years} ans</td>
                <td>{formatMoneyLabel(p.contributed)}</td>
                <td>{formatMoneyLabel(p.prudent)}</td>
                <td>{formatMoneyLabel(p.central)}</td>
                <td>{formatMoneyLabel(p.dynamic)}</td>
                <td>{formatMoneyLabel(p.gainCentral)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Predictor</h2>
          <p className="small muted">Sélection automatique — l&apos;utilisateur ne choisit pas les titres.</p>
          {result.ranked.length === 0 ? (
            <p className="yellow">Aucun score — importez des données.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Titre</th>
                  <th>Score</th>
                  <th>+</th>
                  <th>−</th>
                  <th>Data</th>
                  <th>Conf.</th>
                </tr>
              </thead>
              <tbody>
                {result.ranked.slice(0, 10).map((r) => (
                  <tr key={r.symbol}>
                    <td>{r.symbol}</td>
                    <td>{r.score}</td>
                    <td className="small">{r.positives.slice(0, 2).join(', ') || '—'}</td>
                    <td className="small">{r.negatives.slice(0, 2).join(', ') || '—'}</td>
                    <td>{Math.round(r.dataQuality * 100)}%</td>
                    <td>{Math.round(r.confidence * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <h2>Allocation du cash spot — {result.profile.label}</h2>
          <p>
            Cash spot : <b>{formatMoneyLabel(result.allocation.spotCash)}</b> · Réserve :{' '}
            <b>{formatMoneyLabel(result.allocation.reserve)}</b> · Spot investi :{' '}
            <b>{formatMoneyLabel(result.allocation.invested)}</b> · Détenu :{' '}
            <b>{formatMoneyLabel(result.allocation.existingMarketValue)}</b> · Concentration :{' '}
            <b>{pct(result.allocation.concentration)}</b>
          </p>
          {result.allocation.positions.length === 0 ? (
            <p className="yellow">Aucune allocation — gate ou filtres.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Titre</th>
                  <th>Score</th>
                  <th>Détenu</th>
                  <th>Achat spot</th>
                  <th>Total</th>
                  <th>Poids</th>
                  <th>Montant</th>
                </tr>
              </thead>
              <tbody>
                {result.allocation.positions.map((p) => (
                  <tr key={p.symbol}>
                    <td>
                      {p.symbol}
                      {p.alreadyHeld ? ' · détenu' : ''}
                    </td>
                    <td>{p.score ?? '—'}</td>
                    <td>{p.existingShares || 0}</td>
                    <td>{p.buyShares || 0}</td>
                    <td>{p.shares}</td>
                    <td>{p.weightPct}%</td>
                    <td>{formatMoneyLabel(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Stress</h2>
          <table>
            <thead>
              <tr>
                <th>Scénario</th>
                <th>Capital choqué</th>
                <th>Projection</th>
                <th>Échelle position</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {result.stress.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td>{formatMoneyLabel(s.shockedCapital)}</td>
                  <td>{formatMoneyLabel(s.futureValue)}</td>
                  <td>{s.recommendedPositionScale}</td>
                  <td className="small">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Decision Center</h2>
          {result.qualityGate.status === 'BLOCKED' && (
            <div className="danger">BLOCKED — aucune recommandation ferme.</div>
          )}
          <table>
            <thead>
              <tr>
                <th>Titre</th>
                <th>Action</th>
                <th>Score</th>
                <th>Risque</th>
                <th>Justification</th>
                <th>Invalidation</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {result.decisions.map((d, i) => (
                <tr key={`${d.symbol}-${i}`}>
                  <td>{d.symbol}</td>
                  <td>
                    <b
                      className={
                        d.action === 'BUY' || d.action === 'ADD'
                          ? 'green'
                          : d.action === 'EXIT' || d.action === 'REDUCE'
                            ? 'red'
                            : 'yellow'
                      }
                    >
                      {d.action}
                    </b>
                  </td>
                  <td>{d.score ?? '—'}</td>
                  <td>{d.risk}</td>
                  <td className="small">{d.justification}</td>
                  <td className="small">{d.invalidation}</td>
                  <td>{d.dataQuality != null ? `${Math.round(d.dataQuality * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Backtest (TRAIN → VALIDATION → OUT-OF-SAMPLE)</h2>
        <p className={result.backtest.validated ? 'green' : 'yellow'}>
          <b>{result.backtest.status}</b>
        </p>
        {result.backtest.validated && result.backtest.metrics && (
          <>
            <p className="small muted">
              Splits — Train : {result.backtest.splits.train} · Val : {result.backtest.splits.validation}{' '}
              · OOS : {result.backtest.splits.oos}
            </p>
            <p className="small">Sélection (train only) : {result.backtest.selectedFromTrain.join(', ')}</p>
            <table>
              <tbody>
                <tr>
                  <td>Rendement cumulé OOS</td>
                  <td>{pct(result.backtest.metrics.rendementCumuleOOS)}</td>
                </tr>
                <tr>
                  <td>Rendement annualisé OOS</td>
                  <td>{pct(result.backtest.metrics.rendementAnnualiseOOS)}</td>
                </tr>
                <tr>
                  <td>Volatilité</td>
                  <td>{pct(result.backtest.metrics.volatilite)}</td>
                </tr>
                <tr>
                  <td>Max drawdown</td>
                  <td>{pct(result.backtest.metrics.maxDrawdown)}</td>
                </tr>
                <tr>
                  <td>Transactions</td>
                  <td>{result.backtest.metrics.transactions}</td>
                </tr>
                <tr>
                  <td>Frais / dividendes / benchmark</td>
                  <td className="muted">{result.backtest.metrics.note}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Audit / risques / Quality Gate</h2>
        <table>
          <thead>
            <tr>
              <th>Contrôle</th>
              <th>Statut</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {result.qualityGate.checks.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td className={gateClass(c.status)}>{c.status}</td>
                <td>{c.detail}</td>
              </tr>
            ))}
            <tr>
              <td>Risque marché</td>
              <td>—</td>
              <td>{result.qualityGate.risks.marche}</td>
            </tr>
            <tr>
              <td>Risque titre</td>
              <td>—</td>
              <td>{result.qualityGate.risks.titre}</td>
            </tr>
            <tr>
              <td>Risque liquidité</td>
              <td>—</td>
              <td>{result.qualityGate.risks.liquidite}</td>
            </tr>
            <tr>
              <td>Risque données</td>
              <td className={gateClass(result.qualityGate.status)}>
                {result.qualityGate.risks.donnees}
              </td>
              <td>Quality Gate</td>
            </tr>
            <tr>
              <td>Risque modèle</td>
              <td>—</td>
              <td>{result.qualityGate.risks.modele}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="warn">
          <b>Avertissement</b>
          <p>
            Cet outil est une aide à l&apos;analyse. Les projections ne sont pas des garanties. Aucun
            conseil d&apos;investissement personnalisé ni ordre de bourse n&apos;est exécuté.
          </p>
        </div>
      </section>
    </main>
  );
}
