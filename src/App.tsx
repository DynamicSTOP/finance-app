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
import { calculate, type GlobalParams, type IncomeSection } from './calculate';

// ── Types ────────────────────────────────────────────────────────────────────

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

interface Mark {
  month: number;
  date: string;
}

interface MarkLabelProps {
  viewBox?: { x: number; y: number; height: number };
  delta: string;
  index: number;
}

interface AppState {
  global: GlobalParams;
  sections: IncomeSection[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_GLOBAL: GlobalParams = {
  bankYearlyPercent: 0.09,
  initialCapital: 0,
  inflationYearlyPercent: 0.05,
  afterYears: 30,
};

const DEFAULT_SECTIONS: IncomeSection[] = [
  { id: 'default-1', startMonth: 1, amount: 2000, everyMonths: 1, duration: 0, enabled: true },
];

const SERIES = [
  { key: 'currentBalance',           color: '#4f8ef7', label: 'Balance' },
  { key: 'inflationAdjustedBalance', color: '#f43f5e', label: 'Real Value (inflation-adj.)' },
  { key: 'simpleSavings',            color: '#a78bfa', label: 'No-Interest Savings' },
  { key: 'diff',                     color: '#34d399', label: 'Monthly Gain' },
  { key: 'interestEarned',           color: '#f59e0b', label: 'Interest' },
];

const STORAGE_KEY = 'finance-planner-v2';
const MARKS_KEY = 'finance-planner-marks';
const CHART_MARGIN = { top: 10, right: 80, bottom: 10, left: 20 };

// ── Encode / Decode ──────────────────────────────────────────────────────────

type StoredSection = Omit<IncomeSection, 'id'>;
type LegacyStoredSection = Omit<StoredSection, 'duration'> & { endMonth?: number };
interface StoredState { g: GlobalParams; s: StoredSection[] }

function encodeState(state: AppState): string {
  const data: StoredState = {
    g: state.global,
    s: state.sections.map(({ id: _id, ...rest }) => rest),
  };
  return btoa(JSON.stringify(data));
}

function decodeState(encoded: string): AppState | null {
  try {
    const data = JSON.parse(atob(encoded)) as StoredState;
    if (!data?.g || !Array.isArray(data?.s)) return null;
    return {
      global: { ...DEFAULT_GLOBAL, ...data.g },
      sections: data.s.map((s: StoredSection | LegacyStoredSection) => {
        const id = crypto.randomUUID();
        if ('duration' in s) { const stored = s as StoredSection; return { ...stored, enabled: stored.enabled ?? true, id }; }
        const end = (s as LegacyStoredSection).endMonth ?? 0;
        const duration = end === 0 ? 0 : Math.max(0, end - s.startMonth + 1);
        return { id, startMonth: s.startMonth, amount: s.amount, everyMonths: s.everyMonths, duration, enabled: true };
      }),
    };
  } catch {
    return null;
  }
}

function loadState(): AppState {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const decoded = decodeState(hash);
    if (decoded) return decoded;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const decoded = decodeState(raw);
      if (decoded) return decoded;
    }
  } catch { /* ignore */ }
  return { global: DEFAULT_GLOBAL, sections: DEFAULT_SECTIONS };
}

const STEP_KEY = 'finance-planner-step';

function loadStep(): number {
  try {
    const raw = localStorage.getItem(STEP_KEY);
    return raw ? (parseInt(raw) || 12) : 12;
  } catch {
    return 12;
  }
}

function loadMarks(): Mark[] {
  try {
    const raw = localStorage.getItem(MARKS_KEY);
    return raw ? (JSON.parse(raw) as Mark[]) : [];
  } catch {
    return [];
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────

function formatDelta(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}m`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}

function fmt(v: number): string {
  const abs = Math.abs(v);
  const prefix = v < 0 ? '-$' : '$';
  if (abs >= 1_000_000) return `${prefix}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${prefix}${(abs / 1_000).toFixed(1)}k`;
  return `${prefix}${abs}`;
}

function logTicks(min: number, max: number): number[] {
  const lo = Math.floor(Math.log10(Math.max(min, 1)));
  const hi = Math.ceil(Math.log10(Math.max(max, 1)));
  const ticks: number[] = [];
  for (let e = lo; e <= hi; e++) ticks.push(10 ** e);
  return ticks;
}

function globalParamsSummary(g: GlobalParams): string {
  const rate = (g.bankYearlyPercent * 100).toFixed(0);
  const infl = (g.inflationYearlyPercent * 100).toFixed(0);
  const cap = g.initialCapital > 0 ? ` · ${fmt(g.initialCapital)}` : '';
  return `${rate}% · ${infl}% infl${cap} · ${g.afterYears}y`;
}

function sectionLabel(s: IncomeSection): string {
  const durStr = s.duration > 0 ? `${s.duration}mo` : '∞';
  const untilStr = s.duration > 0 ? ` (until mo ${s.startMonth + s.duration - 1})` : '';
  const sign = s.amount >= 0 ? '+' : '';
  const freq = s.everyMonths === 1 ? '/mo' : s.everyMonths === 12 ? '/yr' : ` / ${s.everyMonths}mo`;
  return `mo ${s.startMonth} · ${durStr}${untilStr}: ${sign}${fmt(s.amount)}${freq}`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MarkLabel({ viewBox, delta, index }: MarkLabelProps) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  return (
    <text x={x + 4} y={index % 2 === 0 ? y + 16 : y + 32} fill="#cbd5e1" fontSize={11} textAnchor="start">
      {delta}
    </text>
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

interface NumInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  isPercent?: boolean;
  fallback?: number;
}

const NumInput = memo(function NumInput({ label, value, onChange, step = 1, isPercent, fallback = 0 }: NumInputProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <input
        type="number"
        step={step}
        value={isPercent ? (value * 100).toFixed(2) : value}
        onChange={e => {
          const raw = parseFloat(e.target.value);
          const v = isPercent ? raw / 100 : raw;
          onChange(Number.isFinite(v) ? v : fallback);
        }}
        style={{
          background: '#0f172a', border: '1px solid #334155', borderRadius: 4,
          color: '#f1f5f9', padding: '4px 8px', width: '100%', fontSize: 13,
          boxSizing: 'border-box' as const,
        }}
      />
    </label>
  );
});

const sInputStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#f1f5f9',
  padding: '4px 8px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box' as const,
};

interface SectionItemProps {
  section: IncomeSection;
  isOpen: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<Omit<IncomeSection, 'id'>>) => void;
  onRemove: () => void;
  onToggleEnabled: () => void;
}

const SectionItem = memo(function SectionItem({ section, isOpen, onToggle, onUpdate, onRemove, onToggleEnabled }: SectionItemProps) {
  return (
    <div style={{ background: '#1e293b', border: `1px solid ${section.enabled ? '#334155' : '#1e293b'}`, borderRadius: 6, overflow: 'hidden', opacity: section.enabled ? 1 : 0.5 }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ color: '#475569', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{isOpen ? '▾' : '▸'}</span>
        <button
          onClick={e => { e.stopPropagation(); onToggleEnabled(); }}
          title={section.enabled ? 'Disable' : 'Enable'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0, fontSize: 15, color: section.enabled ? '#34d399' : '#475569' }}
        >
          ●
        </button>
        <span style={{ flex: 1, fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sectionLabel(section)}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{ background: 'none', border: 'none', color: '#475569', fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
        >
          ×
        </button>
      </div>
      {isOpen && (
        <div style={{ padding: '6px 8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px', borderTop: '1px solid #0f172a' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Start (month)</span>
            <input
              type="number" min={1} step={1} style={sInputStyle}
              value={section.startMonth}
              onChange={e => {
                const v = parseInt(e.target.value);
                onUpdate({ startMonth: Number.isFinite(v) && v >= 1 ? v : 1 });
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>For (months, ∞)</span>
            <input
              type="number" min={0} step={1} placeholder="∞" style={sInputStyle}
              value={section.duration > 0 ? section.duration : ''}
              onChange={e => {
                const v = parseInt(e.target.value);
                onUpdate({ duration: Number.isFinite(v) && v > 0 ? v : 0 });
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Amount ($)</span>
            <input
              type="number" step={100} style={sInputStyle}
              value={section.amount}
              onChange={e => {
                const v = parseFloat(e.target.value);
                onUpdate({ amount: Number.isFinite(v) ? v : 0 });
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Every (months)</span>
            <input
              type="number" min={1} step={1} style={sInputStyle}
              value={section.everyMonths}
              onChange={e => {
                const v = parseInt(e.target.value);
                onUpdate({ everyMonths: Number.isFinite(v) && v >= 1 ? v : 1 });
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
});

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [appState, setAppState] = useState<AppState>(loadState);
  const { global: globalParams, sections } = appState;

  const [openSections, setOpenSections] = useState<Set<string>>(new Set);
  const [paramsOpen, setParamsOpen] = useState(true);
  const [visibleSeries, setVisibleSeries] = useState(
    Object.fromEntries(SERIES.map(s => [s.key, true]))
  );
  const [step, setStep] = useState(loadStep);
  const [logScale, setLogScale] = useState(false);
  const [marks, setMarks] = useState<Mark[]>(loadMarks);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const encoded = encodeState(appState);
    localStorage.setItem(STORAGE_KEY, encoded);
    history.replaceState(null, '', '#' + encoded);
  }, [appState]);

  useEffect(() => {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  }, [marks]);

  useEffect(() => {
    localStorage.setItem(STEP_KEY, String(step));
  }, [step]);

  const allData = useMemo(() => calculate({ ...globalParams, sections }), [globalParams, sections]);
  const data = useMemo(
    () => allData.filter((_, i) => i === 0 || (i + 1) % step === 0),
    [allData, step]
  );
  const final = allData[allData.length - 1];

  const setGlobalParam = useCallback(<K extends keyof GlobalParams>(key: K, value: GlobalParams[K]) => {
    setAppState(prev => ({ ...prev, global: { ...prev.global, [key]: value } }));
  }, []);

  const addSection = useCallback(() => {
    const newId = crypto.randomUUID();
    setAppState(prev => ({
      ...prev,
      sections: [...prev.sections, { id: newId, startMonth: 1, amount: 0, everyMonths: 1, duration: 0, enabled: true }],
    }));
    setOpenSections(prev => new Set([...prev, newId]));
  }, []);

  const removeSection = useCallback((id: string) => {
    setAppState(prev => ({ ...prev, sections: prev.sections.filter(s => s.id !== id) }));
    setOpenSections(prev => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  const updateSection = useCallback((id: string, updates: Partial<Omit<IncomeSection, 'id'>>) => {
    setAppState(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
  }, []);

  const toggleSectionOpen = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSeries = useCallback((key: string) => {
    setVisibleSeries(v => ({ ...v, [key]: !v[key] }));
  }, []);

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
      Math.min(...allData.map(d => Math.min(d.currentBalance, d.simpleSavings, d.inflationAdjustedBalance))),
      Math.max(...allData.map(d => Math.max(d.currentBalance, d.simpleSavings, d.inflationAdjustedBalance))),
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

  const btnStyle = {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
    color: '#f1f5f9', padding: '6px 10px', fontSize: 13, cursor: 'pointer', textAlign: 'left' as const,
  };
  const sectionHdr = {
    margin: '8px 0 0', fontSize: 14, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: 1,
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>
      <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Finance Planner</h1>
        {final && (
          <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14 }}>
            Final balance after {globalParams.afterYears}y: <strong style={{ color: '#4f8ef7' }}>{fmt(final.currentBalance)}</strong>
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 32, flex: 1, minHeight: 0, overflow: 'hidden', padding: '0 24px 24px' }}>
        {/* Controls */}
        <div style={{ flexShrink: 0, minWidth: 190, overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>

          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, overflow: 'hidden' }}>
            <div
              onClick={() => setParamsOpen(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ color: '#475569', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{paramsOpen ? '▾' : '▸'}</span>
              <span style={{ flex: 1, fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {paramsOpen ? 'Parameters' : globalParamsSummary(globalParams)}
              </span>
            </div>
            {paramsOpen && (
              <div style={{ padding: '6px 8px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #0f172a' }}>
                <NumInput label="Annual Rate (%)" value={globalParams.bankYearlyPercent} onChange={v => setGlobalParam('bankYearlyPercent', v)} step={0.1} isPercent />
                <NumInput label="Inflation Rate (%)" value={globalParams.inflationYearlyPercent} onChange={v => setGlobalParam('inflationYearlyPercent', v)} step={0.1} isPercent />
                <NumInput label="Initial Capital ($)" value={globalParams.initialCapital} onChange={v => setGlobalParam('initialCapital', v)} step={1000} />
                <NumInput label="Years" value={globalParams.afterYears} onChange={v => setGlobalParam('afterYears', v)} fallback={1} />
              </div>
            )}
          </div>

          <h2 style={sectionHdr}>Income Sections</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sections.map(s => (
              <SectionItem
                key={s.id}
                section={s}
                isOpen={openSections.has(s.id)}
                onToggle={() => toggleSectionOpen(s.id)}
                onUpdate={updates => updateSection(s.id, updates)}
                onRemove={() => removeSection(s.id)}
                onToggleEnabled={() => updateSection(s.id, { enabled: !s.enabled })}
              />
            ))}
            <button onClick={addSection} style={{ ...btnStyle, color: '#4f8ef7', marginTop: 2 }}>
              + Add section
            </button>
          </div>

          <h2 style={sectionHdr}>Display</h2>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <span style={{ color: '#94a3b8' }}>Show every N months</span>
            <input
              type="number" min={1} value={step}
              onChange={e => setStep(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', padding: '6px 10px', width: 130, fontSize: 14 }}
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

          <h2 style={sectionHdr}>Marks</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={setLinearMarks} style={btnStyle}>Every $100k</button>
            <button onClick={setLogMarks} style={btnStyle}>×2 from $100k</button>
            <button onClick={() => setIntervalMarks(3)} style={btnStyle}>Every 3 months</button>
            <button onClick={() => setIntervalMarks(6)} style={btnStyle}>Every 6 months</button>
            <button onClick={() => setIntervalMarks(12)} style={btnStyle}>Every 12 months</button>
            <button onClick={() => setPanelOpen(true)} style={{ ...btnStyle, color: '#4f8ef7' }}>Show table</button>
            <button onClick={() => setMarks([])} style={{ ...btnStyle, color: '#f43f5e' }}>Clear marks</button>
          </div>
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
              {visibleSeries.inflationAdjustedBalance && (
                <Line yAxisId="left" type="monotone" dataKey="inflationAdjustedBalance" name="Real Value (inflation-adj.)" stroke="#f43f5e" strokeWidth={1.5} dot={false} strokeDasharray="6 3" />
              )}
              {visibleSeries.simpleSavings && (
                <Line yAxisId="left" type="monotone" dataKey="simpleSavings" name="No-Interest Savings" stroke="#a78bfa" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
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
