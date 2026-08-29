"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  XAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { PriceHistoryPoint } from "@/types/market";

type PriceHistoryChartProps = {
  data: PriceHistoryPoint[];
  hours?: number;
};

// Robust helper to parse timestamps from Unix seconds, Unix ms, Date objects, or ISO strings
function parseTimestamp(raw: unknown): number {
  if (!raw) return 0;
  
  if (typeof raw === "number") {
    // If in seconds (OSRS Wiki API standard), convert to ms
    return raw < 10000000000 ? raw * 1000 : raw;
  }

  if (typeof raw === "string") {
    // If it's a numeric string like "1720000000"
    if (/^\d+$/.test(raw)) {
      const num = Number(raw);
      return num < 10000000000 ? num * 1000 : num;
    }
    // If it's an ISO string like "2026-08-29T12:00:00.000Z"
    const parsed = new Date(raw).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  if (raw instanceof Date) {
    return raw.getTime();
  }

  return 0;
}

export function PriceHistoryChart({ data, hours = 24 }: PriceHistoryChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // 1. Map data and resolve prices & timestamps safely
    const formatted = data.map((point) => {
      // Check every common timestamp property name
      // @ts-ignore
      const rawTime = point.timestamp ?? point.time ?? point.createdAt ?? point.date;
      const timeMs = parseTimestamp(rawTime);

      // Support all common OSRS API price keys
      // @ts-ignore
      const highPrice = point.high ?? point.avgHighPrice ?? point.highPrice ?? null;
      // @ts-ignore
      const lowPrice = point.low ?? point.avgLowPrice ?? point.lowPrice ?? null;

      return {
        ...point,
        timeMs,
        Instabuy: highPrice !== null ? Number(highPrice) : null,
        Instasell: lowPrice !== null ? Number(lowPrice) : null,
      };
    });

    // 2. Filter out any points with invalid timestamps (NaN/0)
    const validData = formatted.filter((p) => p.timeMs > 0);

    // 3. MUST be sorted ascending for Recharts X-axis to render lines
    return validData.sort((a, b) => a.timeMs - b.timeMs);
  }, [data]);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex h-[350px] w-full items-center justify-center rounded-xl border border-zinc-300 bg-white text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        No chart data yet. Press &quot;Refresh data from OSRS Wiki&quot; first.
      </div>
    );
  }

  return (
    <div className="relative h-[400px] w-full rounded-xl border border-zinc-300 bg-white p-4 pt-6 font-sans dark:border-zinc-700 dark:bg-zinc-900">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid stroke="#3f3f46" vertical={true} horizontal={true} strokeOpacity={0.4} />

          <XAxis
            dataKey="timeMs"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(tick) => {
              const date = new Date(tick);
              return date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
            }}
            stroke="#71717a"
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            tickMargin={10}
            minTickGap={40}
          />

          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(tick) => Number(tick).toLocaleString()}
            stroke="#71717a"
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            tickMargin={10}
            width={85}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "#27272a",
              borderColor: "#3f3f46",
              color: "#f4f4f5",
              borderRadius: "6px",
            }}
            itemStyle={{ color: "#fff", fontWeight: "bold" }}
            labelFormatter={(label) => (label ? new Date(Number(label)).toLocaleString() : "")}
          />

          <Legend
            verticalAlign="top"
            align="left"
            height={40}
            iconType="circle"
            wrapperStyle={{ fontSize: "14px", color: "#d4d4d8" }}
          />

          <Line
            type="stepAfter"
            dataKey="Instabuy"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 2, fill: "#22c55e", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls={true}
          />

          <Line
            type="stepAfter"
            dataKey="Instasell"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 2, fill: "#f97316", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}