'use client';
import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { NumberField, PercentField } from '@/components/NumberField';
import { KPI } from '@/components/KPI';
import { Inputs, Row, computeCapacity, buildSchedule, minDSCR, fmtIDR, getTotalRevenue, getNettFinancing, getTotalOpex } from '@/lib/finance';

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
  // Default values matching Excel (Endi Roswendi's calculator)
  const [inputs, setInputs] = useState<Inputs>({
    // Revenue breakdown (matching Excel: 34.722.800.000.000 total)
    localRevenuePAD: 34_722_800_000_000,
    balancingFundPerimbangan: 0,
    otherLegalRevenue: 0,
    
    // Nett Financing (matching Excel: 1.540.603.000.000)
    financingReceipts: 1_540_603_000_000,
    financingExpenditures: 0,
    
    // Operating expenses breakdown (calculated from NOI)
    personnelExpenses: 33_459_397_000_000, // Derived from Excel NOI calculation
    goodsServicesExpenses: 0,
    capitalExpenditures: 0,
    
    // Growth projections
    revGrowth: 0.05,
    opexGrowth: 0.03,
    
    // Loan parameters
    rate: 0.08,
    termYears: 10,
    paymentType: 'equal_principal', // Excel shows "Equal Principal"
    
    // Debt structure (per dad's feedback)
    debtType: 'ptsmi_other', // Default to PT SMI/Other
    finalDebtTaken: 3_391_014_787_866, // Default to match Excel allowed debt
    
    reserveRatio: 1.0,
    minDSCR: 2.5,
    initReserve: 0,
    graceYears: 0, // Excel doesn't show grace period
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
      localRevenuePAD: inputs.localRevenuePAD * (1 + revShockPct / 100),
      personnelExpenses: inputs.personnelExpenses * (1 + opexShockPct / 100),
    };
    const cap = computeCapacity(i);
    const sched = buildSchedule(i, cap.allowedDebt);
    const minD = minDSCR(sched);
    return { cap, sched, minD };
  }, [inputs, rateShockBps, revShockPct, opexShockPct]);

  const dscrOk = base.minD >= inputs.minDSCR && base.minD > 0;
  const seventyFiveOk = base.cap.allowedDebt <= 0.75 * getTotalRevenue(inputs) + 1e-6;

  return (
    <div className="container space-y-6 py-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Municipal Debt Capacity & Repayment Planner (Indonesia)
          </h1>
          <div className="text-sm text-gray-600">
            Created by: <span className="font-medium">Endi Roswendi</span> • {new Date().toLocaleDateString('id-ID')}
          </div>
        </div>
      </motion.div>
      
      {/* Executive Summary */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Executive Summary</div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Key Capacity Outputs</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Allowed Debt Ceiling (IDR)</span>
                  <span className="font-mono text-sm">{fmtIDR(base.cap.allowedDebt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Final Debt Taken (IDR)</span>
                  <span className="font-mono text-sm">{fmtIDR(Math.min(inputs.finalDebtTaken, base.cap.allowedDebt))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">First-Year Debt Service</span>
                  <span className="font-mono text-sm">{base.sched.length > 0 ? fmtIDR(base.sched[0].debtService) : fmtIDR(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">First-Year DSCR</span>
                  <span className="font-mono text-sm">{base.sched.length > 0 && base.sched[0].dscr ? `${base.sched[0].dscr.toFixed(2)}x` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Reserve Allocation (Y1)</span>
                  <span className="font-mono text-sm">{base.sched.length > 0 ? fmtIDR(base.sched[0].reserveAlloc) : fmtIDR(0)}</span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Compliance Checks</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Debt ≤ 75% of previous revenue?</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${seventyFiveOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {seventyFiveOk ? 'OK' : 'Exceeds'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">DSCR ≥ Minimum in all years?</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${dscrOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {dscrOk ? 'OK' : 'Fail'}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Interpretation</h3>
              <p className="text-sm text-gray-600">
                Binding debt capacity after applying both rules. Coverage in Year 1 must be ≥ Minimum DSCR.
                Budget headroom after obligations.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Inputs</div>
          </div>
          <div className="card-content space-y-6">
            {/* Revenue Section */}
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Previous Year Revenue (audited)</h3>
              <div className="grid gap-3 pl-4 border-l-2 border-blue-200">
                <NumberField 
                  label="Local Revenue (PAD)" 
                  value={inputs.localRevenuePAD} 
                  onChange={(v)=>setInputs({...inputs, localRevenuePAD: v})} 
                  hint="IDR" 
                />
                <NumberField 
                  label="Balancing Fund (Dana Perimbangan)" 
                  value={inputs.balancingFundPerimbangan} 
                  onChange={(v)=>setInputs({...inputs, balancingFundPerimbangan: v})} 
                  hint="IDR" 
                />
                <NumberField 
                  label="Lain-lain Pendapatan yang Sah" 
                  value={inputs.otherLegalRevenue} 
                  onChange={(v)=>setInputs({...inputs, otherLegalRevenue: v})} 
                  hint="IDR" 
                />
                <div className="text-sm font-medium text-gray-700 pt-2 border-t">
                  Total Revenue: {fmtIDR(getTotalRevenue(inputs))}
                </div>
              </div>
            </div>

            {/* Nett Financing Section */}
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Nett Financing</h3>
              <div className="grid gap-3 pl-4 border-l-2 border-green-200">
                <NumberField 
                  label="Financing Receipt" 
                  value={inputs.financingReceipts} 
                  onChange={(v)=>setInputs({...inputs, financingReceipts: v})} 
                  hint="SILPA, Financing Receipts" 
                />
                <NumberField 
                  label="Financing Expenditure" 
                  value={inputs.financingExpenditures} 
                  onChange={(v)=>setInputs({...inputs, financingExpenditures: v})} 
                  hint="IDR" 
                />
                <div className="text-sm font-medium text-gray-700 pt-2 border-t">
                  Nett Financing: {fmtIDR(getNettFinancing(inputs))}
                </div>
              </div>
            </div>

            {/* Operating Expenses Section */}
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Previous Year Operating Expenses</h3>
              <div className="grid gap-3 pl-4 border-l-2 border-orange-200">
                <NumberField 
                  label="Personnel Expenses" 
                  value={inputs.personnelExpenses} 
                  onChange={(v)=>setInputs({...inputs, personnelExpenses: v})} 
                  hint="IDR" 
                />
                <NumberField 
                  label="Goods & Services Expenses" 
                  value={inputs.goodsServicesExpenses} 
                  onChange={(v)=>setInputs({...inputs, goodsServicesExpenses: v})} 
                  hint="IDR" 
                />
                <NumberField 
                  label="Capital Expenditures" 
                  value={inputs.capitalExpenditures} 
                  onChange={(v)=>setInputs({...inputs, capitalExpenditures: v})} 
                  hint="IDR" 
                />
                <div className="text-sm font-medium text-gray-700 pt-2 border-t">
                  Total OpEx: {fmtIDR(getTotalOpex(inputs))}
                </div>
              </div>
            </div>

            {/* Growth Parameters */}
            <div className="grid grid-cols-2 gap-4">
              <PercentField label="Projected Revenue Growth (annual, %)" value={inputs.revGrowth*100} onChange={(v)=>setInputs({...inputs, revGrowth: v/100})} />
              <PercentField label="Projected O&M Growth (annual, %)" value={inputs.opexGrowth*100} onChange={(v)=>setInputs({...inputs, opexGrowth: v/100})} />
            </div>

            {/* Debt Structure & Parameters */}
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Debt Structure & Parameters</h3>
              <div className="grid gap-4 pl-4 border-l-2 border-purple-200">
                <div className="grid grid-cols-2 gap-4">
                  <PercentField label="Interest Rate (annual, %) (Assumption)" value={inputs.rate*100} onChange={(v)=>setInputs({...inputs, rate: v/100})} />
                  <NumberField label="Loan Term (years)" value={inputs.termYears} onChange={(v)=>setInputs({...inputs, termYears: Math.max(1, Math.floor(v))})} step={1} />
                </div>
                
                <div className="grid gap-2">
                  <label className="label">Debt Type</label>
                  <select value={inputs.debtType} onChange={(e)=>setInputs({...inputs, debtType: e.target.value as any})} className="input">
                    <option value="bond">BOND (equal interest annually)</option>
                    <option value="ptsmi_other">PT SMI / Other (interest on outstanding balance)</option>
                  </select>
                  <div className="text-xs text-gray-500">
                    {inputs.debtType === 'bond' 
                      ? 'BOND: Equal interest payment annually on original debt amount' 
                      : 'PT SMI/Other: Interest calculated on outstanding debt balance'}
                  </div>
                </div>

                {inputs.debtType === 'ptsmi_other' && (
                  <div className="grid gap-2">
                    <label className="label">Payment Type</label>
                    <select value={inputs.paymentType} onChange={(e)=>setInputs({...inputs, paymentType: e.target.value as any})} className="input">
                      <option value="annuity">Annuity</option>
                      <option value="equal_principal">Equal Principal</option>
                    </select>
                  </div>
                )}

                <div className="grid gap-4">
                  <NumberField 
                    label="FINAL DEBT TAKEN (≤ Allowed Debt)" 
                    value={inputs.finalDebtTaken} 
                    onChange={(v)=>setInputs({...inputs, finalDebtTaken: Math.min(v, base.cap.allowedDebt)})} 
                    hint="IDR"
                  />
                  <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                    <strong>Important:</strong> Allowed debt ({fmtIDR(base.cap.allowedDebt)}) is the ceiling. 
                    Government takes debt ≤ this amount. Payment schedule uses FINAL DEBT TAKEN.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <PercentField label="Reserve Ratio (as % of annual debt service)" value={inputs.reserveRatio*100} onChange={(v)=>setInputs({...inputs, reserveRatio: v/100})} />
                  <PercentField label="Minimum DSCR (must be ≥ this)" value={inputs.minDSCR*100} onChange={(v)=>setInputs({...inputs, minDSCR: v/100})} hint="Regulatory minimum coverage" />
                </div>
                <NumberField label="Initial Reserve Balance" value={inputs.initReserve} onChange={(v)=>setInputs({...inputs, initReserve: v})} hint="IDR" />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Debt Capacity Rules & Binding Constraint</div>
            <div className="text-sm text-gray-600 mt-1">
              Assumptions read from Inputs sheet; do not overwrite formulas.
            </div>
          </div>
          <div className="card-content space-y-6">
            <div className="space-y-4">
              <div className="grid gap-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-900">Net Operating Income (NOI) = PrevRevenue - PrevOpEx</span>
                  <div className="text-right">
                    <div className="font-mono text-sm">{fmtIDR(base.cap.NOI)}</div>
                    <div className="text-xs text-gray-500">Available to service debt (Year 0 proxy).</div>
                  </div>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-900">Max Debt from 75% Revenue Rule</span>
                  <div className="text-right">
                    <div className="font-mono text-sm">{fmtIDR(base.cap.maxDebtRevenueRule)}</div>
                    <div className="text-xs text-gray-500">Law: Max outstanding/new debt ≤ 75% of previous revenue.</div>
                  </div>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-900">Max Annual Debt Service from DSCR</span>
                  <div className="text-right">
                    <div className="font-mono text-sm">{fmtIDR(base.cap.maxAnnualDS)}</div>
                    <div className="text-xs text-gray-500">NOI / MinDSCR (≥ {inputs.minDSCR}).</div>
                  </div>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-900">Debt PV allowed by DSCR (Annuity)</span>
                  <div className="text-right">
                    <div className="font-mono text-sm">{fmtIDR(base.cap.dscrPV)}</div>
                    <div className="text-xs text-gray-500">Present value given max annual DS and interest rate.</div>
                  </div>
                </div>
                <div className="flex justify-between items-center py-3 border-2 border-blue-200 rounded-lg bg-blue-50">
                  <span className="text-sm font-semibold text-blue-900">Allowed Debt CEILING (lower of 75% rule & DSCR-PV)</span>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold text-blue-900">{fmtIDR(base.cap.allowedDebt)}</div>
                    <div className="text-xs text-blue-700">Maximum debt capacity - government can take ≤ this amount.</div>
                    <div className="text-xs text-blue-600 font-medium mt-1">Binding constraint: {base.cap.binding}</div>
                  </div>
                </div>
                <div className="flex justify-between items-center py-3 border-2 border-green-200 rounded-lg bg-green-50">
                  <span className="text-sm font-semibold text-green-900">FINAL DEBT TAKEN (actual debt amount)</span>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold text-green-900">{fmtIDR(Math.min(inputs.finalDebtTaken, base.cap.allowedDebt))}</div>
                    <div className="text-xs text-green-700">Payment schedule calculated from this amount.</div>
                    <div className="text-xs text-green-600 font-medium mt-1">Debt Type: {inputs.debtType === 'bond' ? 'BOND' : 'PT SMI/Other'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <KPI 
                label="Minimum DSCR across term" 
                value={base.minD > 0 ? `${base.minD.toFixed(2)}x` : '—'} 
                intent={dscrOk ? 'ok':'warn'} 
              />
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs px-3 py-1 rounded-full ${seventyFiveOk ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                    {seventyFiveOk ? '✓ Within 75% revenue cap':'⚠ Exceeds 75% revenue cap'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs px-3 py-1 rounded-full ${dscrOk ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                    {dscrOk ? '✓ DSCR ≥ minimum in all years':'⚠ DSCR below minimum in some years'}
                  </span>
                </div>
              </div>
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

      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="text-sm font-medium text-gray-900">Important Notes & Legal Guidance</div>
        <div className="text-xs text-gray-600 space-y-2">
          <p>
            <strong>Calculation Method:</strong> Max debt = min( 75%×prior revenue, DSCR-based PV with grace ). Grace years are interest-only. 
            Reserves fund next year&apos;s debt service by the chosen ratio.
          </p>
          <p>
            <strong>Limitations:</strong> This tool is simplified and does not model taxes, capitalized interest, issuance costs, or multiple tranches.
          </p>
          <p className="font-medium text-amber-700">
            ⚠️ <strong>Always corroborate with legal and MOF guidance.</strong> This calculator is for preliminary analysis only.
            Consult Ministry of Finance regulations and local legal requirements before finalizing debt arrangements.
          </p>
          <div className="mt-3 pt-2 border-t border-gray-200 text-gray-500">
            Municipal Debt Capacity & Repayment Planner (Indonesia) • Created by: Endi Roswendi • {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </div>
  );
}
