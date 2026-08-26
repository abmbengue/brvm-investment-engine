import { useMemo, useState, useCallback, useEffect, lazy, Suspense } from 'react';
import MoneyInput from './components/MoneyInput.jsx';
import YearSelect from './components/YearSelect.jsx';
import UserGuide from './components/UserGuide.jsx';
import { formatMoneyLabel } from './lib/money.js';
import { loadUserSettings, saveUserSettings, resetUserSettings } from './lib/userSettings.js';
import { exportAnalysisCsv, downloadTextFile } from './lib/exportAnalysis.js';
import { runEngine } from './engine/pipeline.js';
import { RISK_PROFILES } from './engine/profiles.js';
import {
  loadMarketData,
  previewCsvText,
  commitCsvImport,
  refreshInternalHistoricalDb,
} from './data/loadMarketData.js';
import { loadBundledAnnualHistory } from './data/historical/HistoricalMarketData.js';
import { getCompanyName, resolveSymbolInput } from './data/companyNames.js';
import './App.css';

const ChartsPanel = lazy(() => import('./components/ChartsPanel.jsx'));

const VERSION = '7.7.2';
const SAMPLE_CSV_URL = `${import.meta.env.BASE_URL}sample-brvm.csv`;
const ANNUAL_HISTORY_URL = `${import.meta.env.BASE_URL}data/BRVM_HISTORICAL_2006_2025_ANNUAL.csv`;
const YEAR_SELECT_MIN = 2000;
const YEAR_SELECT_MAX = 2100;
const DURATION_MAX = 100;
const EMPTY_HOLDING = () => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  symbol: '',
  shares: '',
  avgCost: '',
});

/** Navigation principale — une section = un onglet */
const TABS = [
  { id: 'params', label: 'Paramètres' },
  { id: 'data', label: 'Données' },
  { id: 'analyse', label: 'Analyse' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'graphs', label: 'Graphiques' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'audit', label: 'Audit' },
];

function pct(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function qualityClass(q) {
  if (q === 'VERIFIED') return 'green';
  if (q === 'SECONDARY') return 'yellow';
  return 'red';
}

function gateClass(status) {
  if (status === 'WARNING' || status === 'READY' || status === 'GATE') return 'yellow';
  if (status === 'PASS') return 'green';
  return 'red';
}

function dataStatusBadge(mode, live) {
  if (live && mode === 'LIVE') return { label: 'LIVE', className: 'status-live' };
  if (mode === 'INTERNAL') return { label: 'INTERNAL', className: 'status-internal' };
  if (mode === 'SAMPLE') return { label: 'SAMPLE', className: 'status-sample' };
  if (mode === 'CSV') return { label: 'CSV', className: 'status-csv' };
  return { label: mode === 'BLOCKED' ? 'BLOCKED' : 'NONE', className: 'status-blocked' };
}

function actionCountChips(decisions) {
  const counts = {};
  for (const d of decisions || []) {
    const a = d.action || '—';
    counts[a] = (counts[a] || 0) + 1;
  }
  return Object.entries(counts);
}

function csvPreviewSummary(loaded) {
  const compat = loaded?.csvCompat || {};
  const rows = loaded?.rows || compat.rows || [];
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const summary = compat.summary || {};
  return {
    valid: summary.validRows ?? compat.importedRows ?? rows.length,
    rejected: summary.rejectedRows ?? compat.rejectedRows ?? 0,
    duplicates: summary.duplicatesRemoved ?? compat.duplicatesRemoved ?? 0,
    dateMin: summary.dateMin ?? dates[0] ?? null,
    dateMax: summary.dateMax ?? dates[dates.length - 1] ?? null,
    symbols: loaded?.meta?.symbols || compat.symbols || [],
    ok: Boolean(loaded?.ok ?? compat.ok),
    errors: loaded?.errors || compat.errors || [],
  };
}

export default function App() {
  const initial = loadUserSettings();
  const [initialApport, setInitialApport] = useState(initial.initialApport);
  const [capital, setCapital] = useState(initial.capital);
  const [monthly, setMonthly] = useState(initial.monthly);
  const [years, setYears] = useState(initial.years);
  const [rate, setRate] = useState(initial.rate);
  const [planStartYear, setPlanStartYear] = useState(initial.planStartYear);
  const [spotYear, setSpotYear] = useState(initial.spotYear);
  const [recurrentStartYear, setRecurrentStartYear] = useState(initial.recurrentStartYear);
  const [profileId, setProfileId] = useState(initial.profileId);
  const [holdingRows, setHoldingRows] = useState(initial.holdingRows);
  const [settingsSavedAt, setSettingsSavedAt] = useState(initial.updatedAt);
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = sessionStorage.getItem('brvm-active-tab');
      return TABS.some((t) => t.id === saved) ? saved : 'analyse';
    } catch {
      return 'analyse';
    }
  });
  const [csvPreview, setCsvPreview] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const [csvMessage, setCsvMessage] = useState('Chargement historique jusqu’à J-1…');
  const [dataSource, setDataSource] = useState('NONE');
  const [liveStatusMessage, setLiveStatusMessage] = useState(
    'Pas de LIVE BRVM — données historiques disponibles jusqu’à J-1.'
  );
  const [commitSignal, setCommitSignal] = useState(0);
  const [annualHistory, setAnnualHistory] = useState(null);

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

  useEffect(() => {
    const saved = saveUserSettings({
      initialApport,
      capital,
      monthly,
      years,
      rate,
      planStartYear,
      spotYear,
      recurrentStartYear,
      profileId,
      holdingRows,
    });
    setSettingsSavedAt(saved.updatedAt);
  }, [
    initialApport,
    capital,
    monthly,
    years,
    rate,
    planStartYear,
    spotYear,
    recurrentStartYear,
    profileId,
    holdingRows,
  ]);

  useEffect(() => {
    try {
      sessionStorage.setItem('brvm-active-tab', activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

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
    setDataLoading(true);
    setCsvMessage('Chargement SAMPLE…');
    try {
      const loaded = await loadMarketData({ sampleUrl: SAMPLE_CSV_URL, preferSample: true });
      return applyProviderResult(loaded);
    } finally {
      setDataLoading(false);
    }
  }, [applyProviderResult]);

  const refreshHistorical = useCallback(async () => {
    setDataLoading(true);
    setCsvMessage('Construction / mise à jour de la base interne historique…');
    try {
      const loaded = await refreshInternalHistoricalDb();
      return applyProviderResult(loaded);
    } finally {
      setDataLoading(false);
    }
  }, [applyProviderResult]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      try {
        setCsvMessage('Initialisation historique complet jusqu’à J-1…');
        const loaded = await loadMarketData({ sampleUrl: SAMPLE_CSV_URL });
        if (!cancelled) applyProviderResult(loaded);
      } catch (e) {
        if (!cancelled) {
          setDataSource('NONE');
          setLiveStatusMessage('Pas de LIVE BRVM — fallback SAMPLE/CSV.');
          setCsvMessage(`Base interne indisponible — fallback SAMPLE/CSV. (${e.message})`);
          try {
            const fb = await loadMarketData({ sampleUrl: SAMPLE_CSV_URL, preferSample: true });
            if (!cancelled) applyProviderResult(fb);
          } catch {
            /* ignore */
          }
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProviderResult]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hist = await loadBundledAnnualHistory(ANNUAL_HISTORY_URL);
        if (!cancelled) setAnnualHistory(hist);
      } catch {
        if (!cancelled) setAnnualHistory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        annualHistory,
        initialApport,
        planStartYear,
        spotYear,
        recurrentStartYear,
      }),
    [
      capital,
      monthly,
      years,
      rate,
      profileId,
      csvResult,
      holdingsInput,
      annualHistory,
      initialApport,
      planStartYear,
      spotYear,
      recurrentStartYear,
    ]
  );

  async function onCsvFile(file) {
    if (!file) return;
    const text = await file.text();
    setCsvMessage('Prévisualisation CSV…');
    const loaded = await previewCsvText(text);
    setCsvPreview({ text, loaded });
    setCsvMessage(loaded.liveStatusMessage || 'CSV en prévisualisation.');
  }

  async function confirmCsvMerge() {
    if (!csvPreview?.text) return;
    setDataLoading(true);
    setCsvMessage('Fusion CSV dans la base interne…');
    try {
      const loaded = await commitCsvImport(csvPreview.text, { mergeIntoInternal: true });
      applyProviderResult(loaded);
      setCsvPreview(null);
    } catch (e) {
      setCsvMessage(`Fusion CSV : ${e.message}`);
    } finally {
      setDataLoading(false);
    }
  }

  function cancelCsvPreview() {
    setCsvPreview(null);
    setCsvMessage('Prévisualisation annulée — aucune fusion.');
  }

  function resetParams() {
    if (
      !window.confirm(
        'Réinitialiser vos paramètres (capital, apports, horizon, profil, holdings) ?\nLa base marché INTERNAL n’est PAS effacée.'
      )
    ) {
      return;
    }
    const fresh = resetUserSettings();
    setInitialApport(fresh.initialApport);
    setCapital(fresh.capital);
    setMonthly(fresh.monthly);
    setYears(fresh.years);
    setRate(fresh.rate);
    setPlanStartYear(fresh.planStartYear);
    setSpotYear(fresh.spotYear);
    setRecurrentStartYear(fresh.recurrentStartYear);
    setProfileId(fresh.profileId);
    setHoldingRows(fresh.holdingRows);
    setSettingsSavedAt(fresh.updatedAt);
  }

  function exportKind(kind) {
    const { csv, filename } = exportAnalysisCsv(result, kind);
    downloadTextFile(filename, csv);
  }

  const badge = dataStatusBadge(result.dataStatus.mode || dataSource, result.dataStatus.live);
  const asOf = result.dataStatus.asOf || '—';
  const previewSummary = csvPreview ? csvPreviewSummary(csvPreview.loaded) : null;
  const actionChips = actionCountChips(result.decisions);
  const hasDecisions = (result.decisions || []).length > 0;
  const exploratoryMetrics = result.backtest?.metrics && !result.backtest?.validated;

  return (
    <main className="app">
      <UserGuide open={guideOpen} onClose={() => setGuideOpen(false)} />

      <section className="hero">
        <h1>BRVM INVESTMENT ENGINE — V{VERSION}</h1>
        <p className="muted">
          Moteur opérationnel : DATA → PREDICTOR → PORTFOLIO → ALLOCATION → STRESS → DECISION →
          BACKTEST → AUDIT. Simulation ≠ garantie. Aucun ordre réel. Aucun flux live inventé.
        </p>
        <p className="small" id="data-status-line">
          <span id="data-status-badge" className={`data-status ${badge.className}`}>
            DATA STATUS · {badge.label} · asOf {asOf} · Politique J-1 · Pas LIVE BRVM
          </span>{' '}
          <span className="muted" id="live-status-msg">
            {liveStatusMessage || result.liveStatusMessage}
          </span>
        </p>
        <div className="toolbar hero-actions">
          <button type="button" id="recalc" onClick={recalculate}>
            RECALCULER
          </button>
          <button type="button" id="open-guide" onClick={() => setGuideOpen(true)}>
            GUIDE
          </button>
          <button type="button" id="goto-params" onClick={() => setActiveTab('params')}>
            PARAMÈTRES
          </button>
        </div>
        <p className="small muted">
          Naviguez par onglets. Spot, apports, holdings et exports → Paramètres.
          {settingsSavedAt ? (
            <>
              {' '}
              · Enregistrés : {new Date(settingsSavedAt).toLocaleString('fr-FR')}
            </>
          ) : null}
          {dataLoading ? ' · Chargement données…' : ''}
        </p>
      </section>

      <section className="metrics metrics-wide">
        <div className="metric">
          <small>Apport initial</small>
          <div className="big" id="minit">
            {formatMoneyLabel(result.initialApport ?? 0)}
          </div>
        </div>
        <div className="metric">
          <small>Invest. spot ({result.schedule?.spotYear ?? spotYear})</small>
          <div className="big" id="mcap">
            {formatMoneyLabel(result.spotCash)}
          </div>
        </div>
        <div className="metric">
          <small>Récurrent / mois ({result.schedule?.recurrentStartYear ?? recurrentStartYear})</small>
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

      <nav className="tab-nav" role="tablist" aria-label="Sections de l’application">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'params' && (
      <div className="tab-panel" role="tabpanel" id="panel-params" aria-labelledby="tab-params">
      <section className="panel" id="params-panel">
        <h2>Paramètres de simulation</h2>
        <div className="toolbar">
          <MoneyInput
            id="initial-apport"
            label="Apport initial (début du plan)"
            value={initialApport}
            onValueChange={setInitialApport}
            commitSignal={commitSignal}
          />
          <MoneyInput
            id="capital"
            label="Investissement spot (cash actions)"
            value={capital}
            onValueChange={setCapital}
            commitSignal={commitSignal}
          />
          <MoneyInput
            id="monthly"
            label="Apport mensuel récurrent"
            value={monthly}
            onValueChange={setMonthly}
            commitSignal={commitSignal}
          />
          <YearSelect
            id="plan-start-year"
            label="Année démarrage du plan"
            value={planStartYear}
            min={YEAR_SELECT_MIN}
            max={YEAR_SELECT_MAX}
            onValueChange={setPlanStartYear}
          />
          <YearSelect
            id="spot-year"
            label="Année investissement spot"
            value={spotYear}
            min={YEAR_SELECT_MIN}
            max={YEAR_SELECT_MAX}
            onValueChange={setSpotYear}
          />
          <YearSelect
            id="recurrent-start-year"
            label="Année démarrage récurrent"
            value={recurrentStartYear}
            min={YEAR_SELECT_MIN}
            max={YEAR_SELECT_MAX}
            onValueChange={setRecurrentStartYear}
          />
          <YearSelect
            id="years"
            label="Durée (ans)"
            value={years}
            min={1}
            max={DURATION_MAX}
            onValueChange={setYears}
          />
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
          <button type="button" id="reset-settings" onClick={resetParams}>
            RÉINITIALISER MES PARAMÈTRES
          </button>
        </div>
        {years > 80 && (
          <p className="yellow small" id="years-warn">
            Horizon très long ({years} ans) — autorisé, mais la simulation peut être lourde et peu
            réaliste sur plusieurs décennies.
          </p>
        )}
        {(spotYear < planStartYear || recurrentStartYear < planStartYear) && (
          <p className="yellow small" id="year-order-warn">
            Attention : spot ou récurrent avant le démarrage du plan — la simulation calera
            automatiquement ces années sur {planStartYear}.
          </p>
        )}
        <p className="small muted">
          Calendrier : apport initial en {planStartYear} → investissement spot en {spotYear} →
          apports mensuels dès {recurrentStartYear} · horizon {years} ans (fin{' '}
          {planStartYear + years}). Choisissez chaque année dans son menu déroulant (indépendant).
          L’allocation actions porte sur l’investissement spot. Les rendements titres sont
          historiques observés, jamais inventés.
        </p>
        <div className="toolbar">
          <button type="button" id="export-decisions" onClick={() => exportKind('decisions')}>
            Décisions CSV
          </button>
          <button type="button" id="export-allocation" onClick={() => exportKind('allocation')}>
            Allocation CSV
          </button>
          <button type="button" id="export-portfolio" onClick={() => exportKind('portfolio')}>
            Portefeuille CSV
          </button>
        </div>
      </section>

      <section className="panel" id="holdings-panel">
        <h2>Portefeuille déjà acheté</h2>
        <p className="muted small">
          Saisissez le <b>ticker BRVM</b> (ex. <b>SNTS</b> pour Sonatel), la quantité, et le prix
          d’achat moyen optionnel. Les alias connus (ex. SONATEL → SNTS) sont convertis
          automatiquement. La valorisation utilise le <b>cours le plus récent</b> dans une fenêtre de{' '}
          <b>3 jours</b> autour de l’asOf (J-1) — jamais inventé. Au-delà de 3 jours : prix N/D
          (périmé).
        </p>
        <div className="table-scroll">
          <table className="holdings-input-table">
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
                            r.id === row.id
                              ? { ...r, symbol: resolveSymbolInput(e.target.value) }
                              : r
                          )
                        )
                      }
                      onBlur={(e) =>
                        setHoldingRows((rows) =>
                          rows.map((r) =>
                            r.id === row.id
                              ? { ...r, symbol: resolveSymbolInput(e.target.value) }
                              : r
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
                            r.id === row.id
                              ? { ...r, shares: e.target.value.replace(/[^\d]/g, '') }
                              : r
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
        </div>
        <div className="toolbar">
          <button type="button" id="add-holding" onClick={() => setHoldingRows((r) => [...r, EMPTY_HOLDING()])}>
            AJOUTER UNE LIGNE
          </button>
        </div>
        {result.holdings?.positionCount > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Titre</th>
                  <th>Qté</th>
                  <th>Cours (≤3j)</th>
                  <th>Date cours</th>
                  <th>Valorisation</th>
                  <th>P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {result.holdings.positions.map((p) => (
                  <tr key={p.symbol}>
                    <td>
                      {p.symbol}
                      <div className="small muted">{getCompanyName(p.symbol)}</div>
                    </td>
                    <td>{p.shares}</td>
                    <td>
                      {p.priced ? (
                        formatMoneyLabel(p.price)
                      ) : (
                        <span className="yellow">
                          prix N/D
                          {p.priceReason === 'STALE'
                            ? ` (>${p.priceAgeDays ?? '?'}j)`
                            : ''}
                        </span>
                      )}
                    </td>
                    <td className="small muted">
                      {p.priceDate || '—'}
                      {p.priced && p.priceAgeDays != null ? ` · J-${p.priceAgeDays}` : ''}
                    </td>
                    <td>{p.marketValue != null ? formatMoneyLabel(p.marketValue) : '—'}</td>
                    <td className={p.pnl == null ? '' : p.pnl >= 0 ? 'green' : 'red'}>
                      {p.pnl == null ? '—' : formatMoneyLabel(p.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="yellow small">Aucune position détenue saisie.</p>
        )}
      </section>

      </div>
      )}

      {activeTab === 'data' && (
      <div className="tab-panel" role="tabpanel" id="panel-data" aria-labelledby="tab-data">
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
          <span id="live-flag">
            Flux live : <b>{result.dataStatus.live ? 'OUI' : 'NON'}</b>
          </span>
          {' — '}
          <span id="asof-flag">
            asOf : <b>{result.dataStatus.asOf || '—'}</b> (politique J-1, pas LIVE BRVM)
          </span>
          . Authentification / API privée / paywall non contournés.
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
            disabled={dataLoading}
            onClick={() => loadSample().catch((e) => setCsvMessage(`SAMPLE : ${e.message}`))}
          >
            CHARGER SAMPLE
          </button>
          <button
            type="button"
            id="refresh-historical"
            disabled={dataLoading}
            onClick={() =>
              refreshHistorical().catch((e) => setCsvMessage(`Base historique : ${e.message}`))
            }
          >
            ACTUALISER BASE HISTORIQUE
          </button>
          <a className="badge" href={SAMPLE_CSV_URL} download>
            Télécharger CSV d&apos;exemple (SAMPLE)
          </a>
        </div>
        <p id="csv-status">{csvMessage}</p>
        {csvPreview && previewSummary && (
          <div className="csv-preview" id="csv-preview-panel">
            <h3>Prévisualisation CSV — confirmation requise</h3>
            <p className="small">
              Lignes valides : <b>{previewSummary.valid}</b> · Rejetées :{' '}
              <b>{previewSummary.rejected}</b> · Doublons : <b>{previewSummary.duplicates}</b>
            </p>
            <p className="small">
              Période : <b>{previewSummary.dateMin || '—'}</b> → <b>{previewSummary.dateMax || '—'}</b>{' '}
              · Titres : <b>{previewSummary.symbols.length}</b>
              {previewSummary.symbols.length ? (
                <> ({previewSummary.symbols.slice(0, 12).join(', ')}
                {previewSummary.symbols.length > 12 ? '…' : ''})</>
              ) : null}
            </p>
            {previewSummary.errors?.length > 0 && (
              <p className="small red">{previewSummary.errors.slice(0, 3).join(' · ')}</p>
            )}
            <div className="toolbar">
              <button
                type="button"
                id="csv-confirm-merge"
                disabled={!previewSummary.ok || dataLoading}
                onClick={() => confirmCsvMerge()}
              >
                CONFIRMER FUSION
              </button>
              <button type="button" id="csv-cancel-preview" onClick={cancelCsvPreview}>
                ANNULER
              </button>
            </div>
          </div>
        )}
        {csvResult?.warnings?.length > 0 && (
          <p className="small yellow">
            Avertissements : {csvResult.warnings.slice(0, 5).join(' · ')}
            {csvResult.warnings.length > 5 ? ` (+${csvResult.warnings.length - 5})` : ''}
          </p>
        )}
      </section>

      <section className="panel" id="annual-history-panel">
        <h2>Historique annuel BRVM Composite (2006–2025)</h2>
        <p className="muted small">
          Série <b>PRICE_INDEX</b> annuelle — pas TOTAL RETURN, pas LIVE, pas prix de titres. Qualité
          affichée : VERIFIED / SECONDARY / MISSING. Aucune donnée manquante inventée.
        </p>
        {result.historicalMarketData?.ok ? (
          <>
            <p className="small">
              {result.historicalMarketData.yearCount} années ·{' '}
              {result.historicalMarketData.yearStart}–{result.historicalMarketData.yearEnd} · VERIFIED{' '}
              {result.historicalMarketData.qualityCounts?.VERIFIED ?? 0} · SECONDARY{' '}
              {result.historicalMarketData.qualityCounts?.SECONDARY ?? 0} · MISSING{' '}
              {result.historicalMarketData.qualityCounts?.MISSING ?? 0}
            </p>
            <p className="yellow small">
              <b>{result.historicalMarketData.stockBacktestMessage}</b>
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Année</th>
                    <th>Indice fin d’année</th>
                    <th>Rendement</th>
                    <th>Régime</th>
                    <th>Qualité</th>
                    <th>Source rendement</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.historicalMarketData.benchmark || []).map((b) => {
                    const regime = (result.historicalMarketData.regimes || []).find(
                      (r) => r.year === b.year
                    );
                    return (
                      <tr key={b.year}>
                        <td>{b.year}</td>
                        <td>{b.indexYearEnd != null ? b.indexYearEnd.toFixed(2) : '—'}</td>
                        <td>{pct(b.annualReturn)}</td>
                        <td>{regime?.regime || '—'}</td>
                        <td className={qualityClass(b.quality)}>{b.quality}</td>
                        <td className="small muted">{b.returnSource || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="yellow">Historique annuel d’indice non chargé.</p>
        )}
      </section>

      </div>
      )}

      {activeTab === 'analyse' && (
      <div className="tab-panel" role="tabpanel" id="panel-analyse" aria-labelledby="tab-analyse">
      <section className="grid">
        <div className="panel">
          <h2>Predictor</h2>
          <p className="small muted">
            Sélection automatique — l&apos;utilisateur ne choisit pas les titres. Rendements =
            historique prix observé sur la fenêtre dispo (annuel si ≥ 60 j) — jamais inventé.
          </p>
          {result.ranked.length === 0 ? (
            <p className="yellow">Aucun score — importez des données.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Symbole</th>
                    <th>Société</th>
                    <th>Score</th>
                    <th>Rend. périod.</th>
                    <th>Rend. ann.</th>
                    <th>Div.</th>
                    <th>+</th>
                    <th>−</th>
                    <th>Data</th>
                    <th>Conf.</th>
                    <th>Qualité</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ranked.slice(0, 10).map((r) => (
                    <tr key={r.symbol}>
                      <td>{r.symbol}</td>
                      <td className="small">{getCompanyName(r.symbol)}</td>
                      <td>{r.score}</td>
                      <td>{pct(r.totalReturn)}</td>
                      <td>{pct(r.annualizedReturn)}</td>
                      <td>{pct(r.dividendYield)}</td>
                      <td className="small">{r.positives.slice(0, 2).join(', ') || '—'}</td>
                      <td className="small">{r.negatives.slice(0, 2).join(', ') || '—'}</td>
                      <td>{Math.round(r.dataQuality * 100)}%</td>
                      <td>{Math.round(r.confidence * 100)}%</td>
                      <td className={qualityClass(r.qualityLabel)}>
                        {r.qualityLabel || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Allocation du cash spot — {result.profile.label}</h2>
          <p>
            Cash spot : <b>{formatMoneyLabel(result.allocation.spotCash)}</b> · Réserve profil :{' '}
            <b>{formatMoneyLabel(result.allocation.reserveSpot ?? 0)}</b> · Investissable :{' '}
            <b>{formatMoneyLabel(result.allocation.investableSpot ?? 0)}</b> · Spot investi :{' '}
            <b>{formatMoneyLabel(result.allocation.invested)}</b> · Cash résiduel :{' '}
            <b>{formatMoneyLabel(result.allocation.residualCash ?? 0)}</b>
          </p>
          <p className="small muted">
            Concentration = {result.allocation.concentrationDefinition || 'poids du plus gros titre (portefeuille actions)'}
            {' · '}
            <b>{pct(result.allocation.concentration)}</b>
            {result.allocation.effectiveN != null ? (
              <>
                {' · '}N effectif ≈ <b>{result.allocation.effectiveN}</b>
              </>
            ) : null}
            {' · '}maxWeight <b>{pct(result.allocation.maxWeight)}</b>
          </p>
          <p className="small muted">
            Rendement titres (pondéré, observé) :{' '}
            <b>{pct(result.allocation.portfolioAnnualizedReturn)}</b>
            {' — '}
            {result.allocation.portfolioReturnNote || 'historique prix uniquement'}
          </p>
          {result.allocation.diversificationLimited && (
            <div className="warn">
              <b>DIVERSIFICATION LIMITÉE</b>
              <p className="small">{result.allocation.diversificationNote}</p>
            </div>
          )}
          {!result.allocation.diversificationLimited && result.allocation.diversificationNote && (
            <p className="small yellow">{result.allocation.diversificationNote}</p>
          )}
          {(result.allocation.targetWeightSum != null ||
            result.allocation.maxWeightRespected != null) && (
            <p className="small muted">
              Somme poids cibles :{' '}
              <b>
                {result.allocation.targetWeightSum != null
                  ? pct(result.allocation.targetWeightSum)
                  : '—'}
              </b>
              {' · '}
              Plafond poids :{' '}
              <b className={result.allocation.maxWeightRespected === false ? 'red' : 'green'}>
                {result.allocation.maxWeightRespected == null
                  ? '—'
                  : result.allocation.maxWeightRespected
                    ? 'respecté'
                    : 'dépassé'}
              </b>
              {' · '}
              Éligibles : <b>{result.selection?.eligibleCount ?? result.allocation.eligibleCount ?? '—'}</b>
            </p>
          )}
          {result.allocation.positions.length === 0 ? (
            <p className="yellow">Aucune allocation — gate ou filtres.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Symbole</th>
                    <th>Société</th>
                    <th>Score</th>
                    <th>Rend. ann.</th>
                    <th>Qualité</th>
                    <th>Détenu</th>
                    <th>Poids actuel</th>
                    <th>Poids cible</th>
                    <th>Écart</th>
                    <th>Achat</th>
                    <th>Décision</th>
                  </tr>
                </thead>
                <tbody>
                  {result.allocation.positions.map((p) => {
                    const gap = Math.round(((p.weightPct || 0) - (p.targetWeightPct || 0)) * 10) / 10;
                    const decision =
                      p.buyShares > 0 ? (p.alreadyHeld ? 'ADD' : 'BUY') : p.alreadyHeld ? 'HOLD' : '—';
                    return (
                      <tr key={p.symbol}>
                        <td>{p.symbol}</td>
                        <td className="small">{p.companyName || getCompanyName(p.symbol)}</td>
                        <td>{p.score ?? '—'}</td>
                        <td>{pct(p.annualizedReturn)}</td>
                        <td className={qualityClass(p.qualityLabel)}>{p.qualityLabel || '—'}</td>
                        <td>{p.alreadyHeld ? 'Oui' : 'Non'}</td>
                        <td>{p.weightPct}%</td>
                        <td>{p.targetWeightPct}%</td>
                        <td>
                          {gap > 0 ? '+' : ''}
                          {gap}%
                        </td>
                        <td>{formatMoneyLabel(p.buyAmount || 0)}</td>
                        <td>
                          <b
                            className={
                              decision === 'BUY' || decision === 'ADD'
                                ? 'green'
                                : decision === 'HOLD'
                                  ? 'yellow'
                                  : ''
                            }
                          >
                            {decision}
                          </b>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {result.allocation.positions.some((p) => p.explanation) && (
            <p className="small muted">
              {result.allocation.positions
                .filter((p) => p.buyAmount > 0)
                .slice(0, 2)
                .map((p) => p.explanation)
                .join(' · ')}
            </p>
          )}
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Stress</h2>
          <div className="table-scroll">
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
        </div>

        <div className="panel">
          <h2>Decision Center</h2>
          <p className="small muted">
            Décision analytique — ne constitue pas un ordre de bourse.
          </p>
          {result.qualityGate.status === 'BLOCKED' && (
            <div className="danger">BLOCKED — aucune recommandation ferme.</div>
          )}
          {actionChips.length > 0 && (
            <div className="chips" id="decision-action-chips">
              {actionChips.map(([action, n]) => (
                <span key={action} className="chip">
                  {action} · {n}
                </span>
              ))}
            </div>
          )}
          {!hasDecisions ? (
            <p className="yellow small">Aucune décision — importez des données ou assouplissez les filtres.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Symbole</th>
                    <th>Société</th>
                    <th>Action</th>
                    <th>Score</th>
                    <th>Rend. ann.</th>
                    <th>Qualité</th>
                    <th>Conf.</th>
                    <th>Poids actuel</th>
                    <th>Poids cible</th>
                    <th>Écart</th>
                    <th>Achat</th>
                    <th>Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {result.decisions.map((d, i) => (
                    <tr key={`${d.symbol}-${i}`}>
                      <td>{d.symbol}</td>
                      <td className="small">{d.companyName || getCompanyName(d.symbol)}</td>
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
                      <td>{pct(d.annualizedReturn)}</td>
                      <td className={qualityClass(d.qualityLabel)}>{d.qualityLabel || '—'}</td>
                      <td>
                        {d.confidence != null ? `${Math.round(d.confidence * 100)}%` : '—'}
                      </td>
                      <td>
                        {d.currentWeightPct != null ? `${d.currentWeightPct}%` : '—'}
                      </td>
                      <td>
                        {d.targetWeightPct != null ? `${d.targetWeightPct}%` : '—'}
                      </td>
                      <td>
                        {d.weightGapPct != null
                          ? `${d.weightGapPct > 0 ? '+' : ''}${d.weightGapPct}%`
                          : '—'}
                      </td>
                      <td>{formatMoneyLabel(d.buyAmount || 0)}</td>
                      <td className="small">{d.justification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      </div>
      )}

      {activeTab === 'simulation' && (
      <div className="tab-panel" role="tabpanel" id="panel-simulation" aria-labelledby="tab-simulation">
      <section className="panel">
        <h2>Simulation patrimoniale</h2>
        <p className="muted small">
          Calendrier : apport initial {result.schedule?.planStartYear} → spot{' '}
          {result.schedule?.spotYear} → récurrent dès {result.schedule?.recurrentStartYear} · fin{' '}
          {result.schedule?.endYear}. Scénarios = hypothèses, jamais une garantie. Gain = valeur
          projetée − capital versé.
        </p>
        <div className="metrics mini">
          <div className="metric">
            <small>Capital versé</small>
            <div className="big" id="mcontrib">
              {formatMoneyLabel(result.contributed)}
            </div>
          </div>
          <div className="metric">
            <small>Valeur finale (hypothèse {pct(result.rate)})</small>
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
        {result.finalValueTitles != null && (
          <p className="small yellow">
            Scénario titres (rend. pondéré observé {pct(result.titlesRate)}) :{' '}
            <b>{formatMoneyLabel(result.finalValueTitles)}</b> — historique prix, pas une prévision.
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Horizon</th>
                <th>Fin</th>
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
                  <td>{p.endYear ?? '—'}</td>
                  <td>{formatMoneyLabel(p.contributed)}</td>
                  <td>{formatMoneyLabel(p.prudent)}</td>
                  <td>{formatMoneyLabel(p.central)}</td>
                  <td>{formatMoneyLabel(p.dynamic)}</td>
                  <td>{formatMoneyLabel(p.gainCentral)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      </div>
      )}

      {activeTab === 'graphs' && (
      <div
        className="tab-panel"
        role="tabpanel"
        id="panel-graphs"
        aria-labelledby="tab-graphs"
      >
        <Suspense fallback={<p className="panel muted">Chargement des graphiques…</p>}>
          <ChartsPanel result={result} />
        </Suspense>
      </div>
      )}

      {activeTab === 'backtest' && (
      <div className="tab-panel" role="tabpanel" id="panel-backtest" aria-labelledby="tab-backtest">
      <section className="panel">
        <h2>Backtest (TRAIN → VALIDATION → OUT-OF-SAMPLE)</h2>
        <p className="yellow">
          <b>{result.backtest.status}</b>
        </p>
        <p className="small muted">
          L’historique annuel d’indice (PRICE_INDEX) ne valide pas un backtest titres. Schéma
          quotidien futur requis : date,symbol,open,high,low,close,volume. Aucun backtest titres
          n’est présenté comme validé tant que l’historique quotidien officiel est insuffisant.
        </p>
        {exploratoryMetrics && (
          <div className="warn">
            <p className="yellow small">
              <b>Indicateurs exploratoires uniquement</b> — non validés, non exploitables pour une
              décision d’investissement.
            </p>
            <p className="small muted">
              Splits — Train : {result.backtest.splits?.train} · Val :{' '}
              {result.backtest.splits?.validation} · OOS : {result.backtest.splits?.oos}
            </p>
            {result.backtest.selectedFromTrain?.length > 0 && (
              <p className="small">
                Sélection (train only) : {result.backtest.selectedFromTrain.join(', ')}
              </p>
            )}
            <div className="table-scroll">
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
            </div>
          </div>
        )}
        {result.backtest.validated && result.backtest.metrics && (
          <>
            <p className="small muted">
              Splits — Train : {result.backtest.splits.train} · Val : {result.backtest.splits.validation}{' '}
              · OOS : {result.backtest.splits.oos}
            </p>
            <p className="small">Sélection (train only) : {result.backtest.selectedFromTrain.join(', ')}</p>
            <div className="table-scroll">
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
            </div>
          </>
        )}
      </section>

      </div>
      )}

      {activeTab === 'audit' && (
      <div className="tab-panel" role="tabpanel" id="panel-audit" aria-labelledby="tab-audit">
      <section className="panel">
        <h2>Audit / risques / Quality Gate</h2>
        <div className="table-scroll">
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
        </div>
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
      </div>
      )}
    </main>
  );
}
