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
  otherTransferCentral: number; // New field from Excel
  transferSharingTax: number; // New field from Excel
  otherFinancialAid: number; // New field from Excel
  otherLegalRevenue: number;
  
  // Nett Financing (matching Excel SILPA + Financing)
  financingReceipts: number;
  financingExpenditures: number;
  
  // Operating expenses (simplified to match Excel)
  operatingExpenses: number; // Single line to match Excel
  // Keep breakdown fields for compatibility but optional
  personnelExpenses?: number;
  goodsServicesExpenses?: number;
  capitalExpenditures?: number;
  
  // Growth projections
  revGrowth: number;
  opexGrowth: number;
  
  // Loan parameters
  rate: number;
  termYears: number;
  paymentType: "annuity" | "equal_principal";
  
  // Debt structure (added per dad's feedback)
  debtType: "bond" | "ptsmi_other"; // BOND vs PT SMI/Other
  allowedDebt: number; // User-selected allowed debt (interchangeable)
  finalDebtTaken: number; // Actual debt amount ≤ allowed debt
  
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
  return i.localRevenuePAD + 
         i.balancingFundPerimbangan + 
         i.otherTransferCentral +
         i.transferSharingTax +
         i.otherFinancialAid +
         i.otherLegalRevenue;
}

export function getNettFinancing(i: Inputs): number {
  return i.financingReceipts - i.financingExpenditures;
}

export function getTotalOpex(i: Inputs): number {
  // Use single operating expense if provided, otherwise sum the breakdown
  if (i.operatingExpenses) {
    return i.operatingExpenses;
  }
  return (i.personnelExpenses || 0) + (i.goodsServicesExpenses || 0) + (i.capitalExpenditures || 0);
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
    calculatedMaxDebt: allowedDebt, // Rename to avoid confusion with user input
    binding 
  };
}

export function buildSchedule(i: Inputs): Row[] {
  const rows: Row[] = [];
  const n = Math.max(0, Math.floor(i.termYears));
  const amortYears = Math.max(0, Math.floor(i.termYears - i.graceYears));
  
  // Use FINAL DEBT TAKEN, respecting user's allowed debt (per dad's feedback)
  const actualDebt = Math.min(i.finalDebtTaken, i.allowedDebt);
  
  const annuityPmt = i.paymentType === "annuity" && amortYears > 0 ? pmt(i.rate, amortYears, actualDebt) : 0;
  const epPrincipal = i.paymentType === "equal_principal" && amortYears > 0 ? actualDebt / amortYears : 0;

  let prevBeg = actualDebt;
  // Use total revenue and nett financing for projections
  const totalRevenue = getTotalRevenue(i);
  const nettFinancing = getNettFinancing(i);
  const totalOpex = getTotalOpex(i);
  
  let revenue = (totalRevenue + nettFinancing) * (1 + i.revGrowth);
  let opex = totalOpex * (1 + i.opexGrowth);
  let reserveBeg = i.initReserve;

  for (let y = 1; y <= n; y++) {
    const inGrace = y <= i.graceYears;
    
    // Calculate interest based on debt type (per dad's feedback)
    let interest = 0;
    if (y <= i.termYears) {
      if (i.debtType === "bond") {
        // BOND: Equal interest payment annually (on original debt amount)
        interest = actualDebt * i.rate;
      } else {
        // PT SMI/Other: Interest calculated on outstanding balance
        interest = prevBeg * i.rate;
      }
    }
    
    let principal = 0;
    if (!inGrace && y <= i.termYears) {
      if (i.debtType === "bond") {
        // BOND: Equal principal payments
        principal = Math.max(0, Math.min(prevBeg, actualDebt / i.termYears));
      } else {
        // PT SMI/Other: Use selected payment type
        principal = i.paymentType === "annuity" ? Math.max(0, Math.min(prevBeg, annuityPmt - interest))
                                                : Math.max(0, Math.min(prevBeg, epPrincipal));
      }
    }
    const debtService = inGrace ? interest : (interest + principal);

    // Next year's DS (updated for debt types)
    let nextYearDS = 0;
    if (y < n) {
      const nextBeg = Math.max(prevBeg - principal, 0);
      
      // Calculate next year interest based on debt type
      let nextInterest = 0;
      if (i.debtType === "bond") {
        nextInterest = actualDebt * i.rate;
      } else {
        nextInterest = nextBeg * i.rate;
      }
      
      let nextPrincipal = 0;
      if (y + 1 <= i.graceYears) nextPrincipal = 0;
      else if (i.debtType === "bond") {
        nextPrincipal = Math.max(0, Math.min(nextBeg, actualDebt / i.termYears));
      } else if (i.paymentType === "annuity" && amortYears > 0) {
        nextPrincipal = Math.max(0, Math.min(nextBeg, annuityPmt - nextInterest));
      } else if (amortYears > 0) {
        nextPrincipal = Math.max(0, Math.min(nextBeg, epPrincipal));
      }
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
