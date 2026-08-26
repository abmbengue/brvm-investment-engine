import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  AreaChart,
} from 'recharts';
import { formatMoneyLabel } from '../lib/money.js';
import {
  buildYearlyIllustration,
  yearTickInterval,
  allocationPieRows,
  decisionPieRows,
  reservePieRows,
  portfolioDividendYield,
} from '../engine/illustrationSeries.js';

const COLORS = [
  '#7bd79f',
  '#78a9ff',
  '#efcf79',
  '#ef8e8e',
  '#9ec1ff',
  '#c9a0ff',
  '#6dd3c8',
  '#f0a06a',
  '#a8e0a0',
  '#d4a5a5',
];

function shortMoney(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}Md`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.round(n));
}

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color || p.fill }}>
          {p.name}: {formatMoneyLabel(p.value)}
        </div>
      ))}
    </div>
  );
}

function PctTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color || p.fill }}>
          {p.name}: {p.value}%
        </div>
      ))}
    </div>
  );
}

function CountTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color || p.fill }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, note, children }) {
  return (
    <section className="panel chart-card">
      <h3>{title}</h3>
      {note ? <p className="small muted">{note}</p> : null}
      <div className="chart-wrap">{children}</div>
    </section>
  );
}

export default function ChartsPanel({ result }) {
  const schedule = result?.schedule;
  const dividendYield = portfolioDividendYield(result?.allocation);
  const illustration = buildYearlyIllustration({
    schedule,
    annualRate: result?.rate || 0,
    titlesRate: result?.titlesRate ?? null,
    holdingsMarketValue: result?.holdings?.marketValue || 0,
    dividendYield,
  });

  const tickEvery = yearTickInterval(illustration.schedule.horizonYears);
  const yearsData = illustration.years;
  const allocPie = allocationPieRows(result?.allocation);
  const decisionPie = decisionPieRows(result?.decisions);
  const reservePie = reservePieRows(result?.allocation);
  const capitalPie = illustration.capitalStructure;

  const hasTitlesLine = yearsData.some((y) => y.portfolioTitles != null);

  return (
    <div className="charts-panel">
      <section className="panel">
        <h2>Graphiques patrimoniaux</h2>
        <p className="muted small">
          Axes X = années calendaires du plan ({illustration.xDomain[0]} → {illustration.xDomain[1]},{' '}
          {illustration.schedule.horizonYears} ans). Courbes et histogrammes suivent apport initial →
          spot → récurrent. Hypothèse de rendement :{' '}
          <b>{((result?.rate || 0) * 100).toFixed(1)}%</b>
          {illustration.titlesRate != null
            ? ` · scénario titres observé ${((illustration.titlesRate || 0) * 100).toFixed(1)}%`
            : ''}
          . Simulation ≠ garantie.
        </p>
        <p className="small yellow">{illustration.dividendNote}</p>
      </section>

      <div className="charts-grid">
        <ChartCard
          title="Courbe — argent investi vs valeur projetée"
          note="Capital cumulé versé et valeur du plan sous hypothèse de rendement."
        >
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={yearsData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#273650" strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                stroke="#8b99b2"
                tick={{ fill: '#8b99b2', fontSize: 11 }}
                interval={tickEvery}
              />
              <YAxis
                stroke="#8b99b2"
                tick={{ fill: '#8b99b2', fontSize: 11 }}
                tickFormatter={shortMoney}
                width={56}
              />
              <Tooltip content={<MoneyTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="contributedCum"
                name="Capital versé (cumul)"
                stroke="#78a9ff"
                fill="#78a9ff33"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="portfolioValue"
                name="Valeur projetée (hypothèse)"
                stroke="#7bd79f"
                fill="#7bd79f22"
                strokeWidth={2}
              />
              {hasTitlesLine && (
                <Line
                  type="monotone"
                  dataKey="portfolioTitles"
                  name="Scénario titres (observé)"
                  stroke="#efcf79"
                  strokeWidth={2}
                  dot={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Courbe — gain estimé & holdings croissants"
          note="Gain = valeur projetée − capital versé. Holdings = valorisation actuelle croissante (hypothèse)."
        >
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={yearsData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#273650" strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                stroke="#8b99b2"
                tick={{ fill: '#8b99b2', fontSize: 11 }}
                interval={tickEvery}
              />
              <YAxis
                stroke="#8b99b2"
                tick={{ fill: '#8b99b2', fontSize: 11 }}
                tickFormatter={shortMoney}
                width={56}
              />
              <Tooltip content={<MoneyTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="gain"
                name="Gain estimé"
                stroke="#7bd79f"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="holdingsGrown"
                name="Portefeuille détenu (croissance hyp.)"
                stroke="#c9a0ff"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Histogramme — contributions annuelles"
          note="Apport initial, spot, apports récurrents et dividendes estimés (si yield observé)."
        >
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={yearsData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="#273650" strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                stroke="#8b99b2"
                tick={{ fill: '#8b99b2', fontSize: 11 }}
                interval={tickEvery}
              />
              <YAxis
                stroke="#8b99b2"
                tick={{ fill: '#8b99b2', fontSize: 11 }}
                tickFormatter={shortMoney}
                width={56}
              />
              <Tooltip content={<MoneyTooltip />} />
              <Legend />
              <Bar dataKey="initialApport" name="Apport initial" stackId="c" fill="#78a9ff" />
              <Bar dataKey="spot" name="Investissement spot" stackId="c" fill="#7bd79f" />
              <Bar dataKey="recurrent" name="Apports récurrents" stackId="c" fill="#efcf79" />
              <Bar dataKey="dividendEst" name="Dividendes estimés" stackId="c" fill="#ef8e8e" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Camembert — structure du capital versé"
          note="Répartition totale sur l’horizon : initial / spot / récurrent."
        >
          {capitalPie.length === 0 ? (
            <p className="yellow small">Aucun capital versé à illustrer.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={capitalPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {capitalPie.map((entry, i) => (
                    <Cell key={entry.key} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatMoneyLabel(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Camembert — allocation actions (poids)"
          note="Poids dans le portefeuille actions (allocation courante)."
        >
          {allocPie.length === 0 ? (
            <p className="yellow small">Aucune allocation — importez des données / assouplissez les filtres.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={allocPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, value }) => `${name} ${value}%`}
                >
                  {allocPie.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PctTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Camembert — spot investi vs réserve"
          note="Déploiement du cash spot selon le profil de risque."
        >
          {reservePie.length === 0 ? (
            <p className="yellow small">Pas de cash spot à illustrer.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={reservePie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {reservePie.map((entry, i) => (
                    <Cell key={entry.key} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatMoneyLabel(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Camembert — décisions (Decision Center)"
          note="Répartition des actions recommandées (analytique, pas un ordre)."
        >
          {decisionPie.length === 0 ? (
            <p className="yellow small">Aucune décision à illustrer.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={decisionPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {decisionPie.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CountTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Histogramme — poids par titre"
          note="Poids actuel (%) dans l’allocation actions."
        >
          {allocPie.length === 0 ? (
            <p className="yellow small">Aucune ligne d’allocation.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={allocPie}
                margin={{ top: 8, right: 12, left: 8, bottom: 48 }}
              >
                <CartesianGrid stroke="#273650" strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  stroke="#8b99b2"
                  tick={{ fill: '#8b99b2', fontSize: 10 }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  stroke="#8b99b2"
                  tick={{ fill: '#8b99b2', fontSize: 11 }}
                  unit="%"
                  width={40}
                />
                <Tooltip content={<PctTooltip />} />
                <Bar dataKey="value" name="Poids %" fill="#78a9ff">
                  {allocPie.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
