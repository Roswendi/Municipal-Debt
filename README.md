# Indonesian Municipal Debt Capacity & Repayment Planner (Web)

Interactive Next.js app to size municipal debt under Indonesia's constraints:
- Legal cap: **≤ 75% of prior-year audited revenue**
- Coverage: **DSCR ≥ minimum (default 2.5x)**
- **Grace period** (interest-only), then amortization (Annuity or Equal Principal)
- **Reserve policy**: fund next year's debt service by a chosen ratio (e.g., 100%)

## Quick start (local)

```bash
# Node 18+ recommended
npm i
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. Go to https://vercel.com/new and import the repo.
3. Framework preset: **Next.js**. Build command: `next build`. Output: `.next` (default).
4. Deploy.

## Tech

- Next.js App Router, TypeScript
- Tailwind CSS (lightweight styles)
- Recharts (charts)
- Framer Motion (micro-animations)

## Notes

- The app computes allowed debt as `min( 0.75 * prevRevenue, DSCR-based PV with grace )`.
- DSCR-based PV accounts for grace by discounting an annuity of the **Max Annual DS** over *(term - grace)* back to time 0, and caps debt so interest-only years do not exceed the DS cap.
- Reserves pre-fund next year's debt service by the **Reserve Ratio**.
- Export the **Schedule** table to CSV with one click.

> This is a simplified educational model. Confirm final structures against Indonesian regulations and lender (e.g., PT SMI) requirements.
