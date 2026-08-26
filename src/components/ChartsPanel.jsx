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
  Area,
  AreaChart,
} from 'recharts';
import { formatMoneyLabel } from '../lib/money.js';
import {
  buildYearlyIllustration,
  buildYearTicks,
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
      <div className="chart-tooltip-title">Année {label}</div>
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

function CountTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      {payload.map((p) => (
        <div key={p.dataKey || p.name} style={{ color: p.color || p.fill }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

/** HTML legend outside SVG — wraps cleanly, no Recharts overflow */
function ChartLegend({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="chart-legend" aria-label="Légende">
      {items.map((it) => (
        <li key={it.key || it.name}>
          <span className="chart-legend-swatch" style={{ background: it.color }} />
          <span>{it.name}</span>
        </li>
      ))}
    </ul>
  );
}

function ChartCard({ title, note, legend, children }) {
  return (
    <section className="panel chart-card">
      <h3>{title}</h3>
      {note ? <p className="small muted">{note}</p> : null}
      <div className="chart-wrap">{children}</div>
      {legend}
    </section>
  );
}

function YearAxis({ ticks }) {
  return (
    <XAxis
      dataKey="year"
      type="number"
      domain={['dataMin', 'dataMax']}
      ticks={ticks}
      allowDecimals={false}
      stroke="#8b99b2"
      tick={{ fill: '#8b99b2', fontSize: 10 }}
      tickMargin={6}
      height={36}
      label={{
        value: 'Année',
        position: 'insideBottomRight',
        offset: -2,
        fill: '#8b99b2',
        fontSize: 10,
      }}
    />
  );
}

function MoneyAxis() {
  return (
    <YAxis
      stroke="#8b99b2"
      tick={{ fill: '#8b99b2', fontSize: 10 }}
      tickFormatter={shortMoney}
      width={52}
      tickMargin={4}
    />
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

  const yearsData = illustration.years;
  const y0 = illustration.xDomain[0];
  const y1 = illustration.xDomain[1];
  const yearTicks = buildYearTicks(y0, y1, 7);
  const allocPie = allocationPieRows(result?.allocation);
  const decisionPie = decisionPieRows(result?.decisions);
  const reservePie = reservePieRows(result?.allocation);
  const capitalPie = illustration.capitalStructure;
  const hasTitlesLine = yearsData.some((y) => y.portfolioTitles != null);

  const wealthLegend = [
    { key: 'c', name: 'Capital versé', color: '#78a9ff' },
    { key: 'v', name: 'Valeur projetée', color: '#7bd79f' },
    ...(hasTitlesLine ? [{ key: 't', name: 'Scénario titres', color: '#efcf79' }] : []),
  ];
  const gainLegend = [
    { key: 'g', name: 'Gain estimé', color: '#7bd79f' },
    { key: 'h', name: 'Holdings (hyp.)', color: '#c9a0ff' },
  ];
  const contribLegend = [
    { key: 'i', name: 'Initial', color: '#78a9ff' },
    { key: 's', name: 'Spot', color: '#7bd79f' },
    { key: 'r', name: 'Récurrent', color: '#efcf79' },
    { key: 'd', name: 'Dividendes est.', color: '#ef8e8e' },
  ];

  return (
    <div className="charts-panel">
      <section className="panel">
        <h2>Graphiques patrimoniaux</h2>
        <p className="muted small">
          Axe X = années du plan <b>{y0}</b> → <b>{y1}</b> ({illustration.schedule.horizonYears}{' '}
          ans) · démarrage {illustration.schedule.planStartYear} · spot{' '}
          {illustration.schedule.spotYear} · récurrent {illustration.schedule.recurrentStartYear}.
          Hypothèse : <b>{((result?.rate || 0) * 100).toFixed(1)}%</b>
          {illustration.titlesRate != null
            ? ` · titres observés ${((illustration.titlesRate || 0) * 100).toFixed(1)}%`
            : ''}
          . Simulation ≠ garantie.
        </p>
        <p className="small yellow">{illustration.dividendNote}</p>
      </section>

      <div className="charts-grid">
        <ChartCard
          title="Courbe — argent investi vs valeur projetée"
          note="Capital cumulé versé et valeur du plan (hypothèse de rendement)."
          legend={<ChartLegend items={wealthLegend} />}
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={yearsData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="#273650" strokeDasharray="3 3" />
              <YearAxis ticks={yearTicks} />
              <MoneyAxis />
              <Tooltip content={<MoneyTooltip />} />
              <Area
                type="monotone"
                dataKey="contributedCum"
                name="Capital versé"
                stroke="#78a9ff"
                fill="#78a9ff33"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="portfolioValue"
                name="Valeur projetée"
                stroke="#7bd79f"
                fill="#7bd79f22"
                strokeWidth={2}
              />
              {hasTitlesLine && (
                <Line
                  type="monotone"
                  dataKey="portfolioTitles"
                  name="Scénario titres"
                  stroke="#efcf79"
                  strokeWidth={2}
                  dot={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Courbe — gain estimé & holdings"
          note="Gain = valeur projetée − capital versé. Holdings = croiss. hypothèse."
          legend={<ChartLegend items={gainLegend} />}
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={yearsData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="#273650" strokeDasharray="3 3" />
              <YearAxis ticks={yearTicks} />
              <MoneyAxis />
              <Tooltip content={<MoneyTooltip />} />
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
                name="Holdings (hyp.)"
                stroke="#c9a0ff"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Histogramme — contributions annuelles"
          note="Initial, spot, récurrent et dividendes estimés (si yield observé)."
          legend={<ChartLegend items={contribLegend} />}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={yearsData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="#273650" strokeDasharray="3 3" />
              <YearAxis ticks={yearTicks} />
              <MoneyAxis />
              <Tooltip content={<MoneyTooltip />} />
              <Bar dataKey="initialApport" name="Initial" stackId="c" fill="#78a9ff" />
              <Bar dataKey="spot" name="Spot" stackId="c" fill="#7bd79f" />
              <Bar dataKey="recurrent" name="Récurrent" stackId="c" fill="#efcf79" />
              <Bar dataKey="dividendEst" name="Dividendes est." stackId="c" fill="#ef8e8e" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Camembert — structure du capital versé"
          note="Répartition totale sur l’horizon."
          legend={
            <ChartLegend
              items={capitalPie.map((e, i) => ({
                key: e.key,
                name: `${e.name} (${formatMoneyLabel(e.value)})`,
                color: COLORS[i % COLORS.length],
              }))}
            />
          }
        >
          {capitalPie.length === 0 ? (
            <p className="yellow small">Aucun capital versé à illustrer.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <Pie
                  data={capitalPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {capitalPie.map((entry, i) => (
                    <Cell key={entry.key} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatMoneyLabel(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Camembert — allocation actions"
          note="Poids dans le portefeuille actions."
          legend={
            <ChartLegend
              items={allocPie.map((e, i) => ({
                key: e.name,
                name: `${e.name} ${e.value}%`,
                color: COLORS[i % COLORS.length],
              }))}
            />
          }
        >
          {allocPie.length === 0 ? (
            <p className="yellow small">Aucune allocation — importez des données.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <Pie
                  data={allocPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={85}
                  paddingAngle={1}
                >
                  {allocPie.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PctTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Camembert — spot investi vs réserve"
          note="Déploiement du cash spot selon le profil."
          legend={
            <ChartLegend
              items={reservePie.map((e, i) => ({
                key: e.key,
                name: `${e.name} (${formatMoneyLabel(e.value)})`,
                color: COLORS[i % COLORS.length],
              }))}
            />
          }
        >
          {reservePie.length === 0 ? (
            <p className="yellow small">Pas de cash spot à illustrer.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <Pie
                  data={reservePie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {reservePie.map((entry, i) => (
                    <Cell key={entry.key} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatMoneyLabel(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Camembert — décisions"
          note="Actions recommandées (analytique, pas un ordre)."
          legend={
            <ChartLegend
              items={decisionPie.map((e, i) => ({
                key: e.name,
                name: `${e.name} (${e.value})`,
                color: COLORS[i % COLORS.length],
              }))}
            />
          }
        >
          {decisionPie.length === 0 ? (
            <p className="yellow small">Aucune décision à illustrer.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <Pie
                  data={decisionPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {decisionPie.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CountTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Histogramme — poids par titre" note="Poids actuel (%) dans l’allocation.">
          {allocPie.length === 0 ? (
            <p className="yellow small">Aucune ligne d’allocation.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={allocPie} margin={{ top: 8, right: 12, left: 4, bottom: 40 }}>
                <CartesianGrid stroke="#273650" strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  stroke="#8b99b2"
                  tick={{ fill: '#8b99b2', fontSize: 10 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                  tickMargin={6}
                />
                <YAxis
                  stroke="#8b99b2"
                  tick={{ fill: '#8b99b2', fontSize: 10 }}
                  unit="%"
                  width={36}
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
