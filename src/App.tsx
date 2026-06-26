import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  type MouseHandlerDataParam,
} from 'recharts';
import { calculate, type CalcParams } from './calculate';

interface TooltipEntry {
  dataKey?: string;
  name?: string;
  color?: string;
  value?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

const DEFAULT = {
  bankYearlyPercent: 0.09,
  initialCapital: 0,
  sideHustleAfterMonth: 60,
  perYearExtraAfter5Years: 10000,
  monthlyFromSalary: 2000,
  afterYears: 30,
};

const SERIES = [
  { key: 'currentBalance', color: '#4f8ef7', label: 'Balance' },
  { key: 'diff',           color: '#34d399', label: 'Monthly Gain' },
  { key: 'interestEarned', color: '#f59e0b', label: 'Interest' },
];

interface Mark {
  month: number;
  date: string;
}


interface MarkLabelProps {
  viewBox?: { x: number; y: number; height: number };
  delta: string;
  index: number;
}

function MarkLabel({ viewBox, delta, index }: MarkLabelProps) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  const isEven = index % 2 === 0;
  return (
    <text
      x={x + 4}
      y={isEven ? y + 16 : y + 32}
      fill="#cbd5e1"
      fontSize={11}
      textAnchor="start"
    >
      {delta}
    </text>
  );
}

function formatDelta(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}m`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v}`;
}

function logTicks(min: number, max: number): number[] {
  const lo = Math.floor(Math.log10(Math.max(min, 1)));
  const hi = Math.ceil(Math.log10(Math.max(max, 1)));
  const ticks: number[] = [];
  for (let e = lo; e <= hi; e++) ticks.push(10 ** e);
  return ticks;
}

interface NumInputProps {
  label: string;
  name: keyof CalcParams;
  value: number;
  onChange: (name: keyof CalcParams, value: number) => void;
  step?: number;
  isPercent?: boolean;
}

const NumInput = memo(function NumInput({ label, name, value, onChange, step = 1, isPercent }: NumInputProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <input
        type="number"
        step={step}
        value={isPercent ? (value * 100).toFixed(2) : value}
        onChange={e => onChange(name, isPercent ? parseFloat(e.target.value) / 100 : parseFloat(e.target.value))}
        style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
          color: '#f1f5f9', padding: '6px 10px', width: 130, fontSize: 14,
        }}
      />
    </label>
  );
});

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#cbd5e1' }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ margin: '2px 0', color: p.color }}>
          {p.name}: {fmt(p.value ?? 0)}
        </p>
      ))}
    </div>
  );
};

const STORAGE_KEY = 'finance-planner-params';
const CHART_MARGIN = { top: 10, right: 80, bottom: 10, left: 20 };
const MARKS_KEY = 'finance-planner-marks';

function loadParams(): typeof DEFAULT {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT>;
    return { ...DEFAULT, ...parsed };
  } catch {
    return DEFAULT;
  }
}

function loadMarks(): Mark[] {
  try {
    const raw = localStorage.getItem(MARKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Mark[];
  } catch {
    return [];
  }
}

export default function App() {
  const [params, setParams] = useState(loadParams);
  const [visibleSeries, setVisibleSeries] = useState(
    Object.fromEntries(SERIES.map(s => [s.key, true]))
  );
  const [step, setStep] = useState(12);
  const [logScale, setLogScale] = useState(false);
  const [marks, setMarks] = useState<Mark[]>(loadMarks);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  }, [marks]);

  const allData = useMemo(() => calculate(params), [params]);
  const data = useMemo(
    () => allData.filter((_, i) => i === 0 || (i + 1) % step === 0),
    [allData, step]
  );

  const final = allData[allData.length - 1];

  const resolvedMarks = useMemo(() =>
    marks.map((mark, i) => {
      const nearest = data.reduce((a, b) =>
        Math.abs(b.month - mark.month) < Math.abs(a.month - mark.month) ? b : a
      );
      const balance = allData[mark.month - 1]?.currentBalance ?? 0;
      return {
        month: mark.month,
        x: nearest.date,
        delta: formatDelta(mark.month - (i === 0 ? 0 : marks[i - 1].month)),
        balance,
      };
    }),
    [marks, data, allData],
  );

  const leftLogTicks = useMemo(
    () => logTicks(
      Math.min(...allData.map(d => d.currentBalance)),
      Math.max(...allData.map(d => d.currentBalance)),
    ),
    [allData],
  );
  const rightLogTicks = useMemo(
    () => logTicks(
      Math.min(...allData.map(d => Math.min(d.diff, d.interestEarned))),
      Math.max(...allData.map(d => Math.max(d.diff, d.interestEarned))),
    ),
    [allData],
  );

  const setParam = useCallback((name: keyof CalcParams, value: number) => {
    setParams(p => ({ ...p, [name]: value }));
  }, []);

  function toggleSeries(key: string) {
    setVisibleSeries(v => ({ ...v, [key]: !v[key] }));
  }

  const handleChartClick = useCallback((e: MouseHandlerDataParam) => {
    const idx = Number(e.activeTooltipIndex);
    if (!Number.isFinite(idx)) return;
    const point = data[idx];
    if (!point) return;
    setMarks(prev => {
      if (prev.some(m => m.month === point.month)) return prev;
      return [...prev, { month: point.month, date: point.date }].sort((a, b) => a.month - b.month);
    });
  }, [data]);

  const handleChartRightClick = useCallback((_: MouseHandlerDataParam, event: React.MouseEvent<SVGGraphicsElement>) => {
    event.preventDefault();
    setMarks([]);
  }, []);

  const removeMark = useCallback((month: number) => {
    setMarks(prev => prev.filter(m => m.month !== month));
  }, []);

  const setLinearMarks = useCallback(() => {
    const result: Mark[] = [];
    let threshold = 100_000;
    for (const point of allData) {
      if (point.currentBalance >= threshold) {
        result.push({ month: point.month, date: point.date });
        threshold += 100_000;
      }
    }
    setMarks(result);
  }, [allData]);

  const setLogMarks = useCallback(() => {
    const result: Mark[] = [];
    const maxBalance = allData[allData.length - 1]?.currentBalance ?? 0;
    let threshold = 100_000;
    while (threshold <= maxBalance) {
      const point = allData.find(d => d.currentBalance >= threshold);
      if (point) result.push({ month: point.month, date: point.date });
      threshold *= 2;
    }
    setMarks(result);
  }, [allData]);

  const setIntervalMarks = useCallback((intervalMonths: number) => {
    setMarks(allData
      .filter(d => d.month % intervalMonths === 0)
      .map(d => ({ month: d.month, date: d.date }))
    );
  }, [allData]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif', padding: 24, boxSizing: 'border-box', overflow: 'hidden' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>Finance Planner</h1>
      {final && (
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14, flexShrink: 0 }}>
          Final balance after {params.afterYears}y: <strong style={{ color: '#4f8ef7' }}>{fmt(final.currentBalance)}</strong>
        </p>
      )}

      <div style={{ display: 'flex', gap: 32, flex: 1, minHeight: 0 }}>
        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 180, overflowY: 'auto', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Parameters</h2>
          <NumInput label="Annual Rate (%)" name="bankYearlyPercent" value={params.bankYearlyPercent} onChange={setParam} step={0.1} isPercent />
          <NumInput label="Initial Capital ($)" name="initialCapital" value={params.initialCapital} onChange={setParam} step={1000} />
          <NumInput label="Monthly Salary Saving ($)" name="monthlyFromSalary" value={params.monthlyFromSalary} onChange={setParam} step={100} />
          <NumInput label="Side Hustle Starts (month)" name="sideHustleAfterMonth" value={params.sideHustleAfterMonth} onChange={setParam} />
          <NumInput label="Side Hustle / Year ($)" name="perYearExtraAfter5Years" value={params.perYearExtraAfter5Years} onChange={setParam} step={1000} />
          <NumInput label="Years" name="afterYears" value={params.afterYears} onChange={setParam} />

          <h2 style={{ margin: '8px 0 0', fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Display</h2>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <span style={{ color: '#94a3b8' }}>Show every N months</span>
            <input
              type="number" min={1} value={step}
              onChange={e => setStep(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', width: 130, fontSize: 14 }}
            />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={logScale} onChange={e => setLogScale(e.target.checked)} />
              <span style={{ color: '#94a3b8' }}>Logarithmic scale</span>
            </label>
            {SERIES.map(s => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={visibleSeries[s.key]} onChange={() => toggleSeries(s.key)} />
                <span style={{ color: s.color }}>{s.label}</span>
              </label>
            ))}
          </div>

          <h2 style={{ margin: '8px 0 0', fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Marks</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={setLinearMarks} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              Every $100k
            </button>
            <button onClick={setLogMarks} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              ×2 from $100k
            </button>
            <button onClick={() => setIntervalMarks(3)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              Every 3 months
            </button>
            <button onClick={() => setIntervalMarks(6)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              Every 6 months
            </button>
            <button onClick={() => setIntervalMarks(12)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              Every 12 months
            </button>
            <button onClick={() => setPanelOpen(true)} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#4f8ef7', padding: '6px 10px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              Show table
            </button>
          </div>
        </div>

        {/* Chart */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={CHART_MARGIN} onClick={handleChartClick} onContextMenu={handleChartRightClick} style={{ cursor: 'crosshair' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" scale={logScale ? 'log' : 'linear'} domain={logScale ? [leftLogTicks[0], leftLogTicks[leftLogTicks.length - 1]] : [0, 'auto']} ticks={logScale ? leftLogTicks : undefined} allowDataOverflow tickFormatter={fmt} tick={{ fontSize: 11, fill: '#64748b' }} width={70} />
              <YAxis yAxisId="right" orientation="right" scale={logScale ? 'log' : 'linear'} domain={logScale ? [rightLogTicks[0], rightLogTicks[rightLogTicks.length - 1]] : [0, 'auto']} ticks={logScale ? rightLogTicks : undefined} allowDataOverflow tickFormatter={fmt} tick={{ fontSize: 11, fill: '#64748b' }} width={75} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 13, color: '#94a3b8' }} />

              {resolvedMarks.map((mark, i) => (
                <ReferenceLine
                  key={mark.month}
                  x={mark.x}
                  yAxisId="left"
                  stroke="#64748b"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={<MarkLabel delta={mark.delta} index={i} />}
                />
              ))}

              {visibleSeries.currentBalance && (
                <Area yAxisId="left" type="monotone" dataKey="currentBalance" name="Balance" fill="#4f8ef720" stroke="#4f8ef7" strokeWidth={2} dot={false} />
              )}
              {visibleSeries.diff && (
                <Line yAxisId="right" type="monotone" dataKey="diff" name="Monthly Gain" stroke="#34d399" strokeWidth={1.5} dot={false} />
              )}
              {visibleSeries.interestEarned && (
                <Line yAxisId="right" type="monotone" dataKey="interestEarned" name="Interest" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Marks side panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, height: '100vh', width: 340,
        background: '#1e293b', borderLeft: '1px solid #334155',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: panelOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #334155', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Marks</h2>
          <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {resolvedMarks.length === 0
            ? <p style={{ color: '#475569', fontSize: 13, margin: 16 }}>No marks. Click the chart to place them.</p>
            : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '8px 12px', color: '#64748b', fontWeight: 500, textAlign: 'left' }}>#</th>
                    <th style={{ padding: '8px 12px', color: '#64748b', fontWeight: 500, textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '8px 12px', color: '#64748b', fontWeight: 500, textAlign: 'right' }}>Balance</th>
                    <th style={{ padding: '8px 12px', color: '#64748b', fontWeight: 500, textAlign: 'right' }}>Since</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedMarks.map((mark, i) => (
                    <tr key={mark.month} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px 12px', color: '#475569' }}>{i + 1}</td>
                      <td style={{ padding: '8px 12px', color: '#f1f5f9' }}>{mark.x}</td>
                      <td style={{ padding: '8px 12px', color: '#4f8ef7', textAlign: 'right' }}>{fmt(mark.balance)}</td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8', textAlign: 'right' }}>{i === 0 ? mark.delta : `+${mark.delta}`}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <button onClick={() => removeMark(mark.month)} style={{ background: 'none', border: 'none', color: '#475569', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      </div>
    </div>
  );
}
