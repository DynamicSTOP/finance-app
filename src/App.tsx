import { useState, useMemo } from 'react';
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
  initialCapital: 27000,
  sideHustleAfterMonth: 60,
  perYearExtraAfter5Years: 30000,
  monthlyFromSalary: 2800,
  afterYears: 30,
};

const SERIES = [
  { key: 'currentBalance', color: '#4f8ef7', label: 'Balance' },
  { key: 'diff',           color: '#34d399', label: 'Monthly Gain' },
  { key: 'interestEarned', color: '#f59e0b', label: 'Interest' },
];

function fmt(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v}`;
}

interface NumInputProps {
  label: string;
  name: keyof CalcParams;
  value: number;
  onChange: (name: keyof CalcParams, value: number) => void;
  step?: number;
  isPercent?: boolean;
}

function NumInput({ label, name, value, onChange, step = 1, isPercent }: NumInputProps) {
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
}

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

export default function App() {
  const [params, setParams] = useState(DEFAULT);
  const [visibleSeries, setVisibleSeries] = useState(
    Object.fromEntries(SERIES.map(s => [s.key, true]))
  );
  const [step, setStep] = useState(12);

  const allData = useMemo(() => calculate(params), [params]);
  const data = useMemo(
    () => allData.filter((_, i) => i === 0 || (i + 1) % step === 0),
    [allData, step]
  );

  const final = allData[allData.length - 1];

  function setParam(name: keyof CalcParams, value: number) {
    setParams(p => ({ ...p, [name]: value }));
  }

  function toggleSeries(key: string) {
    setVisibleSeries(v => ({ ...v, [key]: !v[key] }));
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Finance Planner</h1>
      {final && (
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>
          Final balance after {params.afterYears}y: <strong style={{ color: '#4f8ef7' }}>{fmt(final.currentBalance)}</strong>
        </p>
      )}

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 180 }}>
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
            {SERIES.map(s => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={visibleSeries[s.key]} onChange={() => toggleSeries(s.key)} />
                <span style={{ color: s.color }}>{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={500}>
            <ComposedChart data={data} margin={{ top: 10, right: 80, bottom: 10, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tickFormatter={fmt} tick={{ fontSize: 11, fill: '#64748b' }} width={70} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={fmt} tick={{ fontSize: 11, fill: '#64748b' }} width={75} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 13, color: '#94a3b8' }} />

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
    </div>
  );
}
