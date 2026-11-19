"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS: Record<string, string> = {
  available: "#34d399",
  occupied: "#8b5cf6",
  paused: "#fbbf24",
  maintenance: "#f97316",
  out_of_service: "#f87171",
  reserved: "#22d3ee",
};

export function DeviceStatusDonut({
  data,
}: {
  data: Array<{ status: string; label: string; count: number }>;
}) {
  const filtered = data.filter((entry) => entry.count > 0);

  if (filtered.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Aucun appareil configuré.</p>;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filtered}
              dataKey="count"
              nameKey="label"
              innerRadius={44}
              outerRadius={66}
              paddingAngle={3}
              stroke="none"
            >
              {filtered.map((entry) => (
                <Cell key={entry.status} fill={COLORS[entry.status] ?? "#8b5cf6"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#12121c",
                border: "1px solid #2a2a3d",
                borderRadius: 12,
                fontSize: 12,
                color: "#ececf5",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-2 text-sm">
        {filtered.map((entry) => (
          <li key={entry.status} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: COLORS[entry.status] ?? "#8b5cf6" }}
            />
            <span className="flex-1 text-muted">{entry.label}</span>
            <span className="font-medium">{entry.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
