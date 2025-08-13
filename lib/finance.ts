export function pmt(rate: number, nper: number, pv: number, fv = 0, type = 0): number {
  if (nper <= 0) return 0;
  if (rate === 0) return (pv + fv) / nper;
  const pow = Math.pow(1 + rate, nper);
  return (rate * (pv * pow + fv)) / ((1 + rate * type) * (pow - 1));
}

export function pv(rate: number, nper: number, pmtAmt: number, fv = 0, type = 0): number {
  if (nper <= 0) return 0;
  if (rate === 0) return pmtAmt * nper + fv;
  const factor = (1 - Math.pow(1 + rate, -nper)) / rate;
  return (pmtAmt * (1 + rate * type) * factor + fv * Math.pow(1 + rate, -nper));
}

export const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })
    .format(isFinite(v) ? Math.round(v) : 0);

export type Inputs = {
  // Revenue breakdown (matching Excel structure)
  localRevenuePAD: number;
  balancingFundPerimbangan: number;
  otherLegalRevenue: number;
  
  // Nett Financing (matching Excel SILPA + Financing)
  financingReceipts: number;
  financingExpenditures: number;
  
  // Operating expenses breakdown
  personnelExpenses: number;
  goodsServicesExpenses: number;
  capitalExpenditures: number;
  
  // Growth projections
  revGrowth: number;
  opexGrowth: number;
  
  // Loan parameters
  rate: number;
  termYears: number;
  paymentType: "annuity" | "equal_principal";
  reserveRatio: number;
  minDSCR: number;
  initReserve: number;
  graceYears: number;
};

export type Row = {
  year: number;
  begBal: number;
  interest: number;
  principal: number;
  debtService: number;
  revenue: number;
  opex: number;
  availForDS: number;
  dscr: number | null;
  reserveTarget: number;
  reserveAlloc: number;
  reserveBeg: number;
  reserveEnd: number;
  surplus: number;
};

// Helper functions to match Excel structure
export function getTotalRevenue(i: Inputs): number {
  return i.localRevenuePAD + i.balancingFundPerimbangan + i.otherLegalRevenue;
}

export function getNettFinancing(i: Inputs): number {
  return i.financingReceipts - i.financingExpenditures;
}

export function getTotalOpex(i: Inputs): number {
  return i.personnelExpenses + i.goodsServicesExpenses + i.capitalExpenditures;
}

export function computeCapacity(i: Inputs) {
  // Match Excel formulas exactly
  const totalRevenue = getTotalRevenue(i);
  const nettFinancing = getNettFinancing(i);
  const totalOpex = getTotalOpex(i);
  
  // Net Operating Income = Total Revenue + Nett Financing - Total OpEx (matching Excel)
  const NOI = Math.max(totalRevenue + nettFinancing - totalOpex, 0);
  
  // 75% Revenue Rule (using total audited revenue)
  const maxDebtRevenueRule = 0.75 * totalRevenue;
  
  // Max Annual Debt Service from DSCR
  const maxAnnualDS = NOI / i.minDSCR;
  
  // Present value calculation with grace period
  const amortYears = Math.max(i.termYears - i.graceYears, 0);
  const pvAnnuityAfterGrace = amortYears > 0
    ? pv(i.rate, amortYears, maxAnnualDS, 0, 0) / Math.pow(1 + i.rate, i.graceYears)
    : 0;
  const capFromInterestOnly = i.rate > 0 ? maxAnnualDS / i.rate : Number.POSITIVE_INFINITY;
  const dscrPV = Math.min(pvAnnuityAfterGrace || 0, capFromInterestOnly);
  
  // Final allowed debt (minimum of both constraints)
  const allowedDebt = Math.max(0, Math.min(maxDebtRevenueRule, dscrPV));
  const binding = Math.abs(allowedDebt - maxDebtRevenueRule) < 1e-6 ? "75% of prior revenue" : "DSCR constraint";
  
  return { 
    NOI, 
    totalRevenue,
    nettFinancing,
    totalOpex,
    maxDebtRevenueRule, 
    maxAnnualDS, 
    dscrPV, 
    allowedDebt, 
    binding 
  };
}

export function buildSchedule(i: Inputs, allowedDebt: number): Row[] {
  const rows: Row[] = [];
  const n = Math.max(0, Math.floor(i.termYears));
  const amortYears = Math.max(0, Math.floor(i.termYears - i.graceYears));
  const annuityPmt = i.paymentType === "annuity" && amortYears > 0 ? pmt(i.rate, amortYears, allowedDebt) : 0;
  const epPrincipal = i.paymentType === "equal_principal" && amortYears > 0 ? allowedDebt / amortYears : 0;

  let prevBeg = allowedDebt;
  // Use total revenue and nett financing for projections
  const totalRevenue = getTotalRevenue(i);
  const nettFinancing = getNettFinancing(i);
  const totalOpex = getTotalOpex(i);
  
  let revenue = (totalRevenue + nettFinancing) * (1 + i.revGrowth);
  let opex = totalOpex * (1 + i.opexGrowth);
  let reserveBeg = i.initReserve;

  for (let y = 1; y <= n; y++) {
    const inGrace = y <= i.graceYears;
    const interest = y <= i.termYears ? prevBeg * i.rate : 0;
    let principal = 0;
    if (!inGrace && y <= i.termYears) {
      principal = i.paymentType === "annuity" ? Math.max(0, Math.min(prevBeg, annuityPmt - interest))
                                              : Math.max(0, Math.min(prevBeg, epPrincipal));
    }
    const debtService = inGrace ? interest : (interest + principal);

    // Next year's DS
    let nextYearDS = 0;
    if (y < n) {
      const nextBeg = Math.max(prevBeg - principal, 0);
      const nextInterest = nextBeg * i.rate;
      let nextPrincipal = 0;
      if (y + 1 <= i.graceYears) nextPrincipal = 0;
      else if (i.paymentType === "annuity" && amortYears > 0) nextPrincipal = Math.max(0, Math.min(nextBeg, annuityPmt - nextInterest));
      else if (amortYears > 0) nextPrincipal = Math.max(0, Math.min(nextBeg, epPrincipal));
      nextYearDS = (y + 1) <= i.graceYears ? nextInterest : (nextInterest + nextPrincipal);
    }

    const reserveTarget = nextYearDS;
    const reserveAlloc = Math.max(reserveTarget - reserveBeg, 0) * i.reserveRatio;
    const reserveEnd = reserveBeg + reserveAlloc;

    const availForDS = revenue - opex;
    const dscr = debtService > 0 ? availForDS / debtService : null;
    const surplus = revenue - opex - debtService - reserveAlloc;

    rows.push({ year: y, begBal: prevBeg, interest, principal, debtService, revenue, opex, availForDS, dscr, reserveTarget, reserveAlloc, reserveBeg, reserveEnd, surplus });

    // advance
    prevBeg = Math.max(prevBeg - principal, 0);
    revenue = revenue * (1 + i.revGrowth);
    opex = opex * (1 + i.opexGrowth);
    reserveBeg = reserveEnd;
  }
  return rows;
}

export function minDSCR(rows: Row[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const r of rows) if (r.debtService > 0 && r.dscr != null) min = Math.min(min, r.dscr);
  return isFinite(min) ? min : 0;
}
