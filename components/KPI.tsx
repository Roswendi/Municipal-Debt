'use client';
import React from 'react';

export function KPI({ label, value, badge, intent = 'neutral' }:{ label:string; value:string; badge?:string; intent?: 'ok'|'warn'|'neutral' }) {
  return (
    <div className="kpi">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="mt-1">
        {badge && <span className="badge">{badge}</span>}
        {!badge && intent === 'ok' && <span className="badge">OK</span>}
        {!badge && intent === 'warn' && <span className="badge border-red-300 text-red-700">Attention</span>}
      </div>
    </div>
  );
}
