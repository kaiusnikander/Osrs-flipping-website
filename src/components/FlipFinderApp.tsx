"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import type { FavoriteItem, MarketItem, PriceHistoryPoint } from "@/types/market";
import { calculateFlipMetrics, CalculatedFlipItem } from "@/lib/market";

const PROFILE_STORAGE_KEY = "osrs-flip-finder-profile-id";

const TIMEFRAMES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "72h", hours: 72 },
  { label: "168h", hours: 168 },
] as const;

function createProfileId(): string {
  return `profile-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

type ProfileStore = {
  getSnapshot: () => string;
  subscribe: (listener: () => void) => () => void;
  initialize: () => void;
};

function createProfileStore(): ProfileStore {
  let currentValue = "";
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => currentValue,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    initialize: () => {
      if (typeof window === "undefined") {
        return;
      }

      const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (saved) {
        currentValue = saved;
      } else {
        const generated = createProfileId();
        window.localStorage.setItem(PROFILE_STORAGE_KEY, generated);
        currentValue = generated;
      }

      listeners.forEach((listener) => listener());
    },
  };
}

export function FlipFinderApp() {
  const profileStore = useMemo(() => createProfileStore(), []);
  const profileId = useSyncExternalStore(profileStore.subscribe, profileStore.getSnapshot, () => "");

  // Market & API State
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MarketItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedHours, setSelectedHours] = useState(24);

  // Filter & Sort State
  const [minVolume, setMinVolume] = useState<number>(50);
  const [minRoi, setMinRoi] = useState<number>(0.5);
  const [sortBy, setSortBy] = useState<"roi" | "potentialProfit" | "margin">("roi");

  const debouncedQuery = useDebouncedValue(query, 250);
  const isProfileReady = Boolean(profileId);

  useEffect(() => {
    profileStore.initialize();
  }, [profileStore]);

  useEffect(() => {
    if (!isProfileReady) return;

    void runWithErrorHandling(async () => {
      await Promise.all([loadItems(profileId, debouncedQuery), loadFavorites(profileId)]);
    });
  }, [isProfileReady, profileId, debouncedQuery]);

// Process items through flipping math, filtering, and sorting
  const processedItems = useMemo(() => {
    return items
      .map(calculateFlipMetrics)
      .filter((item): item is CalculatedFlipItem => {
        if (!item) return false;

        // --- NEW: Sanity Checks for Dead/Junk Items ---
        // 1. Remove items buying for almost nothing (filters out 1-10 GP fake buy offers)
        if ((item.low ?? 0) < 25) return false;
        
        // 2. Cap realistic ROI. Anything over 500% is usually a dead item, not a real flip.
        if (item.roi > 500) return false;

        // --- Existing Filters ---
        if (item.volume !== undefined && item.volume < minVolume) return false;
        if (item.roi < minRoi) return false;
        
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "roi") return b.roi - a.roi;
        if (sortBy === "potentialProfit") return b.potentialProfit - a.potentialProfit;
        return b.margin - a.margin;
      });
  }, [items, minVolume, minRoi, sortBy]);

  const effectiveSelectedItemId = useMemo(() => {
    if (processedItems.length === 0) return null;

if (selectedItemId && processedItems.some((item) => item.itemId === selectedItemId)) {      return selectedItemId;
    }

return processedItems[0].itemId;  }, [processedItems, selectedItemId]);

  useEffect(() => {
    if (!effectiveSelectedItemId) return;
    void runWithErrorHandling(() => loadHistory(effectiveSelectedItemId, selectedHours));
  }, [effectiveSelectedItemId, selectedHours]);

  const selectedItem = useMemo(
    () =>
    processedItems.find((item) => item.itemId === effectiveSelectedItemId) ?? null,    [processedItems, effectiveSelectedItemId]
  );

  async function loadItems(activeProfileId: string, searchQuery: string) {
    setIsLoadingItems(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/items?query=${encodeURIComponent(searchQuery)}&profileId=${encodeURIComponent(activeProfileId)}`
      );
      const payload = (await response.json()) as { items?: MarketItem[]; error?: string };

      if (!response.ok || !payload.items) {
        throw new Error(payload.error ?? "Unable to load items.");
      }

      setItems(payload.items);
      if (payload.items.length === 0) {
        setHistory([]);
      }
    } finally {
      setIsLoadingItems(false);
    }
  }

  async function loadFavorites(activeProfileId: string) {
    const response = await fetch(
      `/api/favorites?profileId=${encodeURIComponent(activeProfileId)}`
    );
    const payload = (await response.json()) as { favorites?: FavoriteItem[]; error?: string };

    if (!response.ok || !payload.favorites) {
      throw new Error(payload.error ?? "Unable to load favorites.");
    }

    setFavorites(payload.favorites);
  }

  async function loadHistory(itemId: number, hours: number) {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`/api/items/${itemId}/history?hours=${hours}`);
      const payload = (await response.json()) as {
        history?: PriceHistoryPoint[];
        error?: string;
      };

      if (!response.ok || !payload.history) {
        throw new Error(payload.error ?? "Unable to load price history.");
      }

      setHistory(payload.history);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function toggleFavorite(itemId: number, favorite: boolean) {
    if (!profileId) return;

    const response = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, itemId, favorite }),
    });

    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "Could not update favorite.");
    }

    await Promise.all([loadItems(profileId, debouncedQuery), loadFavorites(profileId)]);
  }

  async function refreshMarketData() {
    setIsSyncing(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Sync failed.");
      }

      await Promise.all([loadItems(profileId, debouncedQuery), loadFavorites(profileId)]);
      if (effectiveSelectedItemId) {
        await loadHistory(effectiveSelectedItemId, selectedHours);
      }
    } finally {
      setIsSyncing(false);
    }
  }

  async function runWithErrorHandling(task: () => Promise<void>) {
    try {
      await task();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error. Please try again.";
      setErrorMessage(message);
      setIsLoadingItems(false);
      setIsLoadingHistory(false);
      setIsSyncing(false);
    }
  }

  const favoriteIdSet = useMemo(
    () => new Set(favorites.map((f) => f.itemId)),
    [favorites]
  );

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto font-sans text-zinc-100">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">OSRS Flip Finder</h1>
          <p className="text-xs text-zinc-400">Live prices, margins, tax calculation, and price history</p>
        </div>
        <button
          onClick={() => void refreshMarketData()}
          disabled={isSyncing}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 shadow transition-all hover:bg-amber-400 disabled:opacity-50"
        >
          {isSyncing ? "Syncing with OSRS Wiki..." : "Refresh Wiki Prices"}
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Chart Panel */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {selectedItem ? `${selectedItem.name} Price History` : "Select an item"}
            </h2>
            {selectedItem && (
              <p className="text-xs text-zinc-400">
                Buy Limit: {selectedItem.limit?.toLocaleString() ?? "N/A"} | Margin: {selectedItem.margin.toLocaleString()} GP | ROI: {selectedItem.roi.toFixed(2)}%
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-zinc-950/80 p-1 border border-zinc-800">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.label}
                onClick={() => setSelectedHours(tf.hours)}
                className={`rounded px-3 py-1 text-xs font-semibold transition-all ${
                  selectedHours === tf.hours
                    ? "bg-blue-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {isLoadingHistory ? (
          <div className="flex h-[350px] w-full items-center justify-center text-sm text-zinc-500">
            Loading chart data...
          </div>
        ) : (
          <PriceHistoryChart data={history} hours={selectedHours} />
        )}
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-1 min-w-[240px] items-center">
          <input
            type="text"
            placeholder="Search items..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-zinc-300">
          <label className="flex items-center gap-2">
            <span>Min Volume:</span>
            <input
              type="number"
              value={minVolume}
              onChange={(e) => setMinVolume(Number(e.target.value))}
              className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2">
            <span>Min ROI %:</span>
            <input
              type="number"
              step="0.5"
              value={minRoi}
              onChange={(e) => setMinRoi(Number(e.target.value))}
              className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2">
            <span>Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="roi">ROI % (Highest Return)</option>
              <option value="margin">Net Margin (GP)</option>
              <option value="potentialProfit">Potential Profit (Margin × Limit)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Items Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="border-b border-zinc-800 bg-zinc-900/70 text-xs font-semibold uppercase text-zinc-400">
              <tr>
                <th className="p-3.5 text-center w-12">Fav</th>
                <th className="p-3.5">Item</th>
                <th className="p-3.5 text-right">Buy (Low)</th>
                <th className="p-3.5 text-right">Sell (High)</th>
                <th className="p-3.5 text-right">Net Margin</th>
                <th className="p-3.5 text-right">Potential Profit</th>
                <th className="p-3.5 text-right text-emerald-400">ROI %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {isLoadingItems ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-zinc-500">
                    Loading market items...
                  </td>
                </tr>
              ) : processedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-zinc-500">
                    No items match the current filters. Try lowering the Min Volume or Min ROI %.
                  </td>
                </tr>
              ) : (
                processedItems.map((item) => {
                  const id = item.itemId;                  const isSelected = id === effectiveSelectedItemId;
                  const isFav = favoriteIdSet.has(id);

                  return (
                    <tr
                      key={id}
                      onClick={() => setSelectedItemId(id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-zinc-800/80 text-white font-medium"
                          : "hover:bg-zinc-900/60"
                      }`}
                    >
                      <td
                        className="p-3.5 text-center text-base"
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleFavorite(id, !isFav);
                        }}
                      >
                        <span className={isFav ? "text-amber-400" : "text-zinc-600 hover:text-zinc-400"}>
                          ★
                        </span>
                      </td>
                      <td className="p-3.5 font-medium text-white">{item.name}</td>
                      <td className="p-3.5 text-right font-mono text-zinc-400">
                        {item.low?.toLocaleString() ?? "—"}
                      </td>
                      <td className="p-3.5 text-right font-mono text-zinc-400">
                        {item.high?.toLocaleString() ?? "—"}
                      </td>
                      <td className="p-3.5 text-right font-mono text-zinc-200">
                        {item.margin.toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right font-mono font-semibold text-zinc-100">
                        {item.potentialProfit.toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-400">
                        {item.roi.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default FlipFinderApp;