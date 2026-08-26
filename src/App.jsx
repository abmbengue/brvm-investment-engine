import { useMemo, useState, useCallback } from 'react';
import MoneyInput from './components/MoneyInput.jsx';
import { parseCsv } from './lib/csv.js';
import { formatMoneyLabel } from './lib/money.js';
import { runEngine } from './engine/pipeline.js';
import { RISK_PROFILES } from './engine/profiles.js';
import './App.css';

const VERSION = '7.0.0';

function pct(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function gateClass(status) {
  if (status === 'PASS') return 'green';
  if (status === 'WARNING' || status === 'READY' || status === 'GATE') return 'yellow';
  return 'red';
}

export default function App() {
  const [capital, setCapital] = useState(5_000_000);
  const [monthly, setMonthly] = useState(500_000);
  const [years, setYears] = useState(25);
  const [rate, setRate] = useState(9);
  const [profileId, setProfileId] = useState('equilibre');
  const [csvResult, setCsvResult] = useState(null);
  const [csvMessage, setCsvMessage] = useState('Aucun CSV importé — statut données : NONE');
  const [commitSignal, setCommitSignal] = useState(0);

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
      }),
    [capital, monthly, years, rate, profileId, csvResult]
  );

  async function onCsvFile(file) {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setCsvResult(parsed);
    if (parsed.ok) {
      setCsvMessage(
        `CSV importé : ${parsed.importedRows} lignes, ${parsed.symbols.length} titres (délimiteur « ${parsed.delimiter} »). Flux live : NON.`
      );
    } else {
      setCsvMessage(`Import échoué : ${parsed.errors.join(' ; ') || 'fichier invalide'}`);
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <h1>BRVM INVESTMENT ENGINE — V{VERSION}</h1>
        <p className="muted">
          Moteur opérationnel : DATA → PREDICTOR → PORTFOLIO → ALLOCATION → STRESS → DECISION →
          BACKTEST → AUDIT. Simulation ≠ garantie. Aucun ordre réel. Aucun flux live inventé.
        </p>
        <div className="toolbar">
          <MoneyInput
            id="capital"
            label="Capital disponible"
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
      </section>

      <section className="metrics">
        <div className="metric">
          <small>Architecture</small>
          <div className="big green">INTÉGRÉE</div>
        </div>
        <div className="metric">
          <small>Capital</small>
          <div className="big" id="mcap">
            {formatMoneyLabel(result.capital)}
          </div>
        </div>
        <div className="metric">
          <small>Apport</small>
          <div className="big" id="mmonth">
            {formatMoneyLabel(result.monthly)}
          </div>
        </div>
        <div className="metric">
          <small>Valeur finale (hypothèse)</small>
          <div className="big" id="mfv">
            {formatMoneyLabel(result.finalValue)}
          </div>
        </div>
        <div className="metric">
          <small>Quality Gate</small>
          <div className={`big ${gateClass(result.qualityGate.status)}`} id="mqg">
            {result.qualityGate.status}
          </div>
        </div>
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
          Statut : <b className={result.dataStatus.live ? 'red' : 'yellow'}>{result.dataStatus.mode}</b>
          {' — '}
          Flux live : <b>NON</b>. Authentification / API privée / paywall non contournés.
        </p>
        <div className="toolbar">
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onCsvFile(e.target.files?.[0])}
          />
          <a className="badge" href="/sample-brvm.csv" download>
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
            <small>Valeur finale centrale</small>
            <div className="big">{formatMoneyLabel(result.finalValue)}</div>
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
          <h2>Allocation — {result.profile.label}</h2>
          <p>
            Réserve : <b>{formatMoneyLabel(result.allocation.reserve)}</b> · Investi :{' '}
            <b>{formatMoneyLabel(result.allocation.invested)}</b> · Positions :{' '}
            <b>{result.allocation.positionCount}</b> · Concentration :{' '}
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
                  <th>Poids</th>
                  <th>Montant</th>
                  <th>Nb titres</th>
                </tr>
              </thead>
              <tbody>
                {result.allocation.positions.map((p) => (
                  <tr key={p.symbol}>
                    <td>{p.symbol}</td>
                    <td>{p.score}</td>
                    <td>{p.weightPct}%</td>
                    <td>{formatMoneyLabel(p.amount)}</td>
                    <td>{p.shares}</td>
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
