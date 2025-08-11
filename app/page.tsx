'use client';
import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { NumberField, PercentField } from '@/components/NumberField';
import { KPI } from '@/components/KPI';
import { Inputs, Row, computeCapacity, buildSchedule, minDSCR, fmtIDR } from '@/lib/finance';

function downloadCSV(filename: string, rows: Row[]) {
  const headers = [
    'Year','Beg Balance','Interest','Principal','Debt Service','Revenue','O&M','Available for DS','DSCR','Reserve Target','Reserve Allocation','Reserve Begin','Reserve End','Surplus/Deficit'
  ];
  const csv = [
    headers.join(','),
    ...rows.map(r => [r.year,r.begBal,r.interest,r.principal,r.debtService,r.revenue,r.opex,r.availForDS,r.dscr ?? '',r.reserveTarget,r.reserveAlloc,r.reserveBeg,r.reserveEnd,r.surplus].map(x => typeof x==='number' ? Math.round(x) : x).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Page() {
  const [inputs, setInputs] = useState<Inputs>({
    prevRevenue: 1_000_000_000_000,
    prevOpex: 800_000_000_000,
    revGrowth: 0.05,
    opexGrowth: 0.03,
    rate: 0.08,
    termYears: 10,
    paymentType: 'annuity',
    reserveRatio: 1.0,
    minDSCR: 2.5,
    initReserve: 0,
    graceYears: 2,
  });

  const [rateShockBps, setRateShockBps] = useState(0);
  const [revShockPct, setRevShockPct] = useState(0);
  const [opexShockPct, setOpexShockPct] = useState(0);

  const base = useMemo(() => {
    const cap = computeCapacity(inputs);
    const sched = buildSchedule(inputs, cap.allowedDebt);
    const minD = minDSCR(sched);
    return { cap, sched, minD };
  }, [inputs]);

  const stressed = useMemo(() => {
    const i: Inputs = {
      ...inputs,
      rate: Math.max(0, inputs.rate + rateShockBps / 10_000),
      prevRevenue: inputs.prevRevenue * (1 + revShockPct / 100),
      prevOpex: inputs.prevOpex * (1 + opexShockPct / 100),
    };
    const cap = computeCapacity(i);
    const sched = buildSchedule(i, cap.allowedDebt);
    const minD = minDSCR(sched);
    return { cap, sched, minD };
  }, [inputs, rateShockBps, revShockPct, opexShockPct]);

  const dscrOk = base.minD >= inputs.minDSCR && base.minD > 0;
  const seventyFiveOk = base.cap.allowedDebt <= 0.75 * inputs.prevRevenue + 1e-6;

  return (
    <div className="container space-y-6 py-6">
      <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-2xl font-semibold tracking-tight">
        Municipal Debt Capacity & Repayment Planner (Indonesia)
      </motion.h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Inputs</div>
          </div>
          <div className="card-content grid gap-4">
            <div className="grid-2">
              <NumberField label="Previous Year Revenue (audited)" value={inputs.prevRevenue} onChange={(v)=>setInputs({...inputs, prevRevenue: v})} hint="IDR" />
              <NumberField label="Previous Year Operating Expenses" value={inputs.prevOpex} onChange={(v)=>setInputs({...inputs, prevOpex: v})} hint="IDR" />
              <PercentField label="Projected Revenue Growth" value={inputs.revGrowth*100} onChange={(v)=>setInputs({...inputs, revGrowth: v/100})} />
              <PercentField label="Projected O&M Growth" value={inputs.opexGrowth*100} onChange={(v)=>setInputs({...inputs, opexGrowth: v/100})} />
              <PercentField label="Interest Rate" value={inputs.rate*100} onChange={(v)=>setInputs({...inputs, rate: v/100})} />
              <NumberField label="Loan Term (years — includes grace)" value={inputs.termYears} onChange={(v)=>setInputs({...inputs, termYears: Math.max(1, Math.floor(v))})} step={1} />
              <NumberField label="Grace Period (years)" value={inputs.graceYears} onChange={(v)=>setInputs({...inputs, graceYears: Math.max(0, Math.floor(v))})} step={1} hint="Interest-only years" />
              <div className="grid gap-2">
                <label className="label">Payment Type</label>
                <select value={inputs.paymentType} onChange={(e)=>setInputs({...inputs, paymentType: e.target.value as any})} className="input">
                  <option value="annuity">Annuity</option>
                  <option value="equal_principal">Equal Principal</option>
                </select>
              </div>
              <PercentField label="Reserve Ratio (of next year's DS)" value={inputs.reserveRatio*100} onChange={(v)=>setInputs({...inputs, reserveRatio: v/100})} />
              <PercentField label="Minimum DSCR" value={inputs.minDSCR*100} onChange={(v)=>setInputs({...inputs, minDSCR: v/100})} hint="e.g. 250% = 2.5x" />
              <NumberField label="Initial Reserve Balance" value={inputs.initReserve} onChange={(v)=>setInputs({...inputs, initReserve: v})} hint="IDR" />
            </div>
            {inputs.termYears <= inputs.graceYears && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Grace period must be less than the loan term. Increase term or reduce grace to enable amortization.
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Key Results</div>
          </div>
          <div className="card-content grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <KPI label="Allowed Debt" value={fmtIDR(base.cap.allowedDebt)} badge={base.cap.binding} />
              <KPI label="Max by 75% Revenue Rule" value={fmtIDR(base.cap.maxDebtRevenueRule)} />
              <KPI label="Max Annual DS (DSCR)" value={fmtIDR(base.cap.maxAnnualDS)} />
              <KPI label="Minimum DSCR across term" value={base.minD > 0 ? `${base.minD.toFixed(2)}x` : '—'} intent={dscrOk ? 'ok':'warn'} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={"badge " + (seventyFiveOk ? '' : 'border-red-300 text-red-700')}>{seventyFiveOk ? 'Within 75% revenue cap':'Exceeds 75% revenue cap'}</span>
              <span className={"badge " + (dscrOk ? '' : 'border-red-300 text-red-700')}>{dscrOk ? 'DSCR ≥ minimum in all years':'DSCR below minimum in some years'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Schedule (Years 1…{inputs.termYears})</div>
        </div>
        <div className="card-content">
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="table-head sticky top-0 z-10">
                <tr>
                  {['Yr','Beg Balance','Interest','Principal','Debt Service','Revenue','O&M','Avail for DS','DSCR','Reserve Target','Reserve Allocation','Reserve Begin','Reserve End','Surplus / (Deficit)'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {base.sched.slice(0, inputs.termYears).map((r) => (
                  <tr key={r.year} className="odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-1.5">{r.year}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.begBal)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.interest)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.principal)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.debtService)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.revenue)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.opex)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.availForDS)}</td>
                    <td className="px-3 py-1.5">{r.dscr ? `${r.dscr.toFixed(2)}x` : '—'}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.reserveTarget)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.reserveAlloc)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.reserveBeg)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.reserveEnd)}</td>
                    <td className="px-3 py-1.5">{fmtIDR(r.surplus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn" onClick={() => downloadCSV('schedule.csv', base.sched)}>Export CSV</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header"><div className="card-title">DSCR Trend</div></div>
          <div className="card-content" style={{height: 320}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={base.sched.slice(0, inputs.termYears).map(r => ({year: r.year, dscr: r.dscr ?? null}))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis domain={[0, 'auto']} />
                <RTooltip formatter={(v) => (v ? `${Number(v).toFixed(2)}x` : '—')} labelFormatter={(l) => `Year ${l}`} />
                <ReferenceLine y={inputs.minDSCR} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="dscr" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Risk & Stress Test</div></div>
          <div className="card-content grid gap-4">
            <div className="grid-3">
              <div>
                <label className="label">Rate shock (bps)</label>
                <input type="range" min={-300} max={500} step={25} value={rateShockBps} onChange={(e)=>setRateShockBps(Number(e.target.value))} className="w-full" />
                <div className="text-xs text-gray-500 mt-1">Current: {rateShockBps} bps</div>
              </div>
              <div>
                <label className="label">Revenue level shock</label>
                <input type="range" min={-30} max={30} step={1} value={revShockPct} onChange={(e)=>setRevShockPct(Number(e.target.value))} className="w-full" />
                <div className="text-xs text-gray-500 mt-1">Current: {revShockPct}%</div>
              </div>
              <div>
                <label className="label">O&M level shock</label>
                <input type="range" min={-30} max={30} step={1} value={opexShockPct} onChange={(e)=>setOpexShockPct(Number(e.target.value))} className="w-full" />
                <div className="text-xs text-gray-500 mt-1">Current: {opexShockPct}%</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KPI label="Stressed Allowed Debt" value={fmtIDR(stressed.cap.allowedDebt)} />
              <KPI label="Stressed Min DSCR" value={stressed.minD > 0 ? `${stressed.minD.toFixed(2)}x` : '—'} intent={stressed.minD >= inputs.minDSCR ? 'ok' : 'warn'} />
              <KPI label="Rate (stressed)" value={`${((inputs.rate + rateShockBps/10000)*100).toFixed(2)}%`} />
            </div>

            <div className={(stressed.minD >= inputs.minDSCR ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50') + ' rounded-xl border p-3 text-sm'}>
              <div className="font-medium mb-1">{stressed.minD >= inputs.minDSCR ? 'Resilient under stress' : 'Vulnerable under stress'}</div>
              <div className="text-gray-700">
                {stressed.minD >= inputs.minDSCR
                  ? 'The portfolio maintains DSCR above the minimum across the term under current shocks.'
                  : 'Under current shocks, at least one year falls below the minimum DSCR. Consider reducing debt, extending term, increasing grace, or boosting reserves.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Notes: Max debt = min( 75%×prior revenue, DSCR-based PV with grace ). Grace years are interest-only. Reserves fund next year’s debt service by the chosen ratio.
        This tool is simplified and does not model taxes, capitalized interest, issuance costs, or multiple tranches. Always corroborate with legal and MOF guidance.
      </div>
    </div>
  );
}
