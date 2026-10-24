"use client";

import { startTransition, useEffect, useState } from "react";

export default function AnalyticsTrends({ profiles, events, registrations }) {
  const [now, setNow] = useState(null);

  useEffect(() => {
    startTransition(() => {
      setNow(Date.now());
    });
  }, []);

  const series = [
    ["New accounts", profiles],
    ["Events created", events],
    ["Registrations", registrations],
  ].map(([label, rows]) => {
    if (now === null) return [label, null, []];
    const period = 30 * 24 * 60 * 60 * 1000;
    const start = now - period;
    const buckets = Array(10).fill(0);
    for (const row of rows) {
      const createdAt = new Date(row.created_at).getTime();
      if (Number.isNaN(createdAt) || createdAt < start) continue;
      const index = Math.min(9, Math.floor((createdAt - start) / (period / buckets.length)));
      buckets[index] += 1;
    }
    return [label, buckets.reduce((total, count) => total + count, 0), buckets];
  });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {series.map(([label, count, buckets]) => (
        <div className="rounded-lg bg-slate-50 p-4" key={label}>
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p aria-live="polite" className="mt-2 text-3xl font-black">{count ?? "—"}</p>
          <div aria-hidden="true" className="mt-4 flex h-20 items-end gap-1">
            {Array.from({ length: 10 }, (_, index) => (
              <span
                className="flex-1 rounded-t bg-[#245c55]"
                key={index}
                style={{ height: count === null ? "4%" : `${Math.max(4, Math.round((buckets[index] / Math.max(...buckets, 1)) * 100))}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
