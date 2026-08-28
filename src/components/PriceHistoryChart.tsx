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

export function PriceHistoryChart({ data, hours = 24 }: PriceHistoryChartProps) {
  // 1. Robust data formatting to prevent X-axis crashes
  const chartData = useMemo(() => {
    const now = Date.now();
    const hoursMs = hours * 60 * 60 * 1000;
    const startMs = now - hoursMs;

    return data.map((point, index) => {
      // Safely resolve the timestamp. If it's completely missing from your API, 
      // we generate an evenly spaced timeline so the chart still renders perfectly.
      let timeMs = startMs + (index / Math.max(1, data.length - 1)) * hoursMs;
      
      // Handle standard OSRS Wiki timestamps if they exist
      if ("timestamp" in point && point.timestamp) {
        timeMs = point.timestamp < 10000000000 ? point.timestamp * 1000 : point.timestamp;
      }

      // Handle potentially null prices in OSRS API
      const high = point.high ?? null;
      const low = point.low ?? null;

      return {
        ...point,
        timeMs,
        Instabuy: high,
        Instasell: low,
      };
    });
  }, [data, hours]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[350px] w-full items-center justify-center rounded-xl border border-zinc-300 bg-white text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        No chart data yet. Press &quot;Refresh data from OSRS Wiki&quot; first.
      </div>
    );
  }

  return (
    <div className="relative h-[400px] w-full rounded-xl border border-zinc-300 bg-white p-4 pt-6 font-sans dark:border-zinc-700 dark:bg-zinc-900">
      {/* Reset Zoom button positioned identically to the reference image */}
      <button className="absolute right-4 top-4 z-10 rounded bg-[#ffcc99] px-3 py-1 text-xs font-bold text-black transition-colors hover:bg-[#ffb870]">
        Reset Zoom
      </button>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          {/* Subtle grid lines */}
          <CartesianGrid stroke="#52525b" vertical={true} horizontal={true} strokeOpacity={0.4} />
          
          <XAxis
            dataKey="timeMs"
            type="number"
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
            tickMargin={12}
            minTickGap={40}
          />
          
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(tick) => tick.toLocaleString()}
            stroke="#71717a"
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            tickMargin={12}
            width={85}
          />
          
          <Tooltip
            contentStyle={{
              backgroundColor: "#27272a", // zinc-800
              borderColor: "#3f3f46", // zinc-700
              color: "#f4f4f5", // zinc-100
              borderRadius: "6px",
            }}
            itemStyle={{ color: "#fff", fontWeight: "bold" }}
            labelFormatter={(label) => new Date(label).toLocaleString()}
          />
          
          <Legend
            verticalAlign="top"
            align="left"
            height={40}
            iconType="circle"
            wrapperStyle={{ fontSize: "14px", color: "#d4d4d8" }}
          />
          
          <Line
            type="linear"
            dataKey="Instabuy"
            stroke="#22c55e" // Green
            strokeWidth={2}
            dot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls={true} // CRITICAL: bridges gaps if OSRS items have missing data periods
          />
          
          <Line
            type="linear"
            dataKey="Instasell"
            stroke="#f97316" // Orange
            strokeWidth={2}
            dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            connectNulls={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}