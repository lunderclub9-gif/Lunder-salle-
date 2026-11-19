"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "@/lib/money";

export function SalesChart({
  data,
}: {
  data: Array<{ day: string; salesCents: number; collectedCents: number }>;
}) {
  const chartData = data.map((point) => ({
    ...point,
    label: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(
      new Date(`${point.day}T12:00:00Z`),
    ),
    sales: point.salesCents / 100,
    collected: point.collectedCents / 100,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={4}>
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id="collectedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f1f2d" vertical={false} />
          <XAxis dataKey="label" stroke="#6b6b85" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#6b6b85" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(139,92,246,0.08)" }}
            contentStyle={{
              background: "#12121c",
              border: "1px solid #2a2a3d",
              borderRadius: 12,
              fontSize: 12,
              color: "#ececf5",
            }}
            formatter={(value: number, name: string) => [
              formatCents(Math.round(value * 100)),
              name === "sales" ? "Ventes" : "Encaissements",
            ]}
          />
          <Bar dataKey="sales" fill="url(#salesGradient)" radius={[6, 6, 0, 0]} maxBarSize={34} />
          <Bar dataKey="collected" fill="url(#collectedGradient)" radius={[6, 6, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
