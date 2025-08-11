'use client';
import React from 'react';

export function NumberField({ label, value, onChange, step = 1, min, max, suffix, hint }:{ label:string; value:number; onChange:(v:number)=>void; step?:number; min?:number; max?:number; suffix?:string; hint?:string; }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <label className="label">{label}</label>
        {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
      </div>
      <div className="relative">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="input pr-14"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">{suffix}</span>
        )}
      </div>
    </div>
  );
}

export function PercentField(props: Omit<Parameters<typeof NumberField>[0], 'step'|'suffix'>) {
  return <NumberField {...props} step={0.01} suffix="%" />;
}
