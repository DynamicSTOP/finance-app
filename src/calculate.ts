export interface CalcParams {
  bankYearlyPercent: number;
  initialCapital: number;
  sideHustleAfterMonth: number;
  perYearExtraAfter5Years: number;
  monthlyFromSalary: number;
  afterYears: number;
}

export interface DataPoint {
  month: number;
  date: string;
  old: number;
  diff: number;
  currentBalance: number;
  interestEarned: number;
}

export function calculate({
  bankYearlyPercent,
  initialCapital,
  sideHustleAfterMonth,
  perYearExtraAfter5Years,
  monthlyFromSalary,
  afterYears,
}: CalcParams): DataPoint[] {
  const monthlyRate = bankYearlyPercent / 12;
  const totalMonths = afterYears * 12;
  let balance = initialCapital;
  let oldBalance = initialCapital;
  const data: DataPoint[] = [];

  for (let month = 1; month <= totalMonths; month++) {
    balance += monthlyFromSalary;
    balance *= 1 + monthlyRate;

    const diff = balance - oldBalance;
    const interestEarned = diff - monthlyFromSalary;

    if (month >= sideHustleAfterMonth && month % 12 === 0) {
      balance += perYearExtraAfter5Years;
    }

    data.push({
      month,
      date: `${Math.floor(month / 12)}y ${month % 12}m`,
      old: Math.floor(oldBalance),
      diff: Math.floor(balance - oldBalance),
      currentBalance: Math.floor(balance),
      interestEarned: Math.floor(interestEarned),
    });

    oldBalance = balance;
  }

  return data;
}
