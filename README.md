# Finance Planner

A local React + TypeScript app for visualizing personal savings growth over time. Tweak parameters and see the chart update live.

## Stack

- React 19, TypeScript, Vite
- Recharts for visualization

## Running

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Parameters

| Parameter | Description |
|---|---|
| Annual Rate | Bank deposit APR (net) |
| Initial Capital | Starting deposit |
| Monthly Salary Saving | Fixed monthly contribution from salary |
| Side Hustle Starts (month) | Month number when extra annual income begins |
| Side Hustle / Year | Additional annual income added once per year after the start month |
| Years | How many years to project |

## Chart Series

- **Balance** — total savings at end of each period
- **Prev Balance** — balance at start of each period
- **Monthly Gain** — total growth that month (interest + contributions)
- **Interest** — interest-only portion of monthly gain

All income values are assumed to be net (after tax).
