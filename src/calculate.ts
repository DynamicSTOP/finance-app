export interface IncomeSection {
  id: string;
  startMonth: number;
  amount: number;
  everyMonths: number;
  duration: number; // months to run for; 0 = forever
  enabled: boolean;
}

export interface GlobalParams {
  bankYearlyPercent: number;
  initialCapital: number;
  inflationYearlyPercent: number;
  afterYears: number;
}

export interface CalcParams extends GlobalParams {
  sections: IncomeSection[];
}

export interface DataPoint {
  month: number;
  date: string;
  old: number;
  diff: number;
  currentBalance: number;
  interestEarned: number;
  simpleSavings: number;
  inflationAdjustedBalance: number;
}

export function calculate({
  bankYearlyPercent,
  initialCapital,
  inflationYearlyPercent,
  afterYears,
  sections,
}: CalcParams): DataPoint[] {
  const monthlyRate = bankYearlyPercent / 12;
  const monthlyInflationRate = inflationYearlyPercent / 12;
  const totalMonths = Math.max(1, afterYears) * 12;
  let balance = initialCapital;
  let oldBalance = initialCapital;
  let simpleSavings = initialCapital;
  const data: DataPoint[] = [];

  for (let month = 1; month <= totalMonths; month++) {
    let contributions = 0;
    for (const s of sections) {
      if (!s.enabled) continue;
      const period = Math.max(1, s.everyMonths);
      const isActive = month >= s.startMonth && (s.duration === 0 || month < s.startMonth + s.duration);
      if (isActive && (month - s.startMonth) % period === 0) {
        contributions += s.amount;
      }
    }

    balance += contributions;
    simpleSavings += contributions;
    balance *= 1 + monthlyRate;

    const diff = balance - oldBalance;

    data.push({
      month,
      date: `${Math.floor(month / 12)}y ${month % 12}m`,
      old: Math.floor(oldBalance),
      diff: Math.floor(diff),
      currentBalance: Math.floor(balance),
      interestEarned: Math.floor(diff - contributions),
      simpleSavings: Math.floor(simpleSavings),
      inflationAdjustedBalance: Math.floor(balance / (1 + monthlyInflationRate) ** month),
    });

    oldBalance = balance;
  }

  return data;
}
