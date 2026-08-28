"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import type { FavoriteItem, MarketItem, PriceHistoryPoint } from "@/types/market";

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

  const debouncedQuery = useDebouncedValue(query, 250);
  const isProfileReady = Boolean(profileId);

  useEffect(() => {
    profileStore.initialize();
  }, [profileStore]);

  useEffect(() => {
    if (!isProfileReady) {
      return;
    }

    void runWithErrorHandling(async () => {
      await Promise.all([loadItems(profileId, debouncedQuery), loadFavorites(profileId)]);
    });
  }, [isProfileReady, profileId, debouncedQuery]);

  const effectiveSelectedItemId = useMemo(() => {
    if (items.length === 0) {
      return null;
    }

    if (selectedItemId && items.some((item) => item.itemId === selectedItemId)) {
      return selectedItemId;
    }

    return items[0].itemId;
  }, [items, selectedItemId]);

  useEffect(() => {
    if (!effectiveSelectedItemId) {
      return;
    }
    void runWithErrorHandling(() => loadHistory(effectiveSelectedItemId, selectedHours));
  }, [effectiveSelectedItemId, selectedHours]);

  const selectedItem = useMemo(
    () => items.find((item) => item.itemId === effectiveSelectedItemId) ?? null,
    [items, effectiveSelectedItemId],
  );

  async function loadItems(activeProfileId: string, searchQuery: string) {
    setIsLoadingItems(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/items?query=${encodeURIComponent(searchQuery)}&profileId=${encodeURIComponent(activeProfileId)}`,
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
      `/api/favorites?profileId=${encodeURIComponent(activeProfileId)}`,
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
    if (!profileId) {
      return;
    }

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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-8">
      <header className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">OSRS Flip Finder</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Search items, compare margins, save favorites, and inspect history.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search item name..."
              className="w-full rounded-lg border border-zinc-400 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <button
              type="button"
              disabled={isSyncing || !isProfileReady}
              onClick={() => void runWithErrorHandling(refreshMarketData)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSyncing ? "Syncing..." : "Refresh data from OSRS Wiki"}
            </button>
          </div>

          {errorMessage && (
            <p className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {errorMessage}
            </p>
          )}

          <div className="max-h-[430px] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                <tr>
                  <th className="px-3 py-2">Fav</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Buy</th>
                  <th className="px-3 py-2">Sell</th>
                  <th className="px-3 py-2">Margin</th>
                  <th className="px-3 py-2">Profit (1%)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const selected = item.itemId === effectiveSelectedItemId;
                  return (
                    <tr
                      key={item.itemId}
                      className={`cursor-pointer border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/60 ${
                        selected ? "bg-blue-50 dark:bg-blue-950/40" : ""
                      }`}
                      onClick={() => setSelectedItemId(item.itemId)}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-lg leading-none"
                          onClick={(event) => {
                            event.stopPropagation();
                            void runWithErrorHandling(() =>
                              toggleFavorite(item.itemId, !item.favorited),
                            );
                          }}
                        >
                          {item.favorited ? "★" : "☆"}
                        </button>
                      </td>
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.low.toLocaleString()}</td>
                      <td className="px-3 py-2">{item.high.toLocaleString()}</td>
                      <td className="px-3 py-2">{item.margin.toLocaleString()}</td>
                      <td className="px-3 py-2 font-semibold">
                        {item.potentialProfit.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {items.length === 0 && !isLoadingItems && (
              <p className="p-3 text-sm text-zinc-600 dark:text-zinc-300">
                No matching items found.
              </p>
            )}
            {isLoadingItems && (
              <p className="p-3 text-sm text-zinc-600 dark:text-zinc-300">Loading items...</p>
            )}
          </div>
        </div>

        <aside className="rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-semibold">Favorites</h2>
          <ul className="space-y-2 text-sm">
            {favorites.map((favorite) => (
              <li
                key={favorite.itemId}
                className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setSelectedItemId(favorite.itemId)}
                >
                  <p className="font-semibold">{favorite.name}</p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">
                    Margin: {favorite.margin.toLocaleString()} gp
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {favorites.length === 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">No favorites yet.</p>
          )}
        </aside>
      </section>

      <section className="rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {selectedItem ? `${selectedItem.name} price history` : "Price history"}
            </h2>
            {isLoadingHistory && (
              <span className="text-sm text-zinc-600 dark:text-zinc-300">Loading chart...</span>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-zinc-300 p-1 dark:border-zinc-700 dark:bg-zinc-800">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.hours}
                type="button"
                disabled={isLoadingHistory}
                onClick={() => setSelectedHours(tf.hours)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                  selectedHours === tf.hours
                    ? "bg-blue-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
        <PriceHistoryChart data={history} />
      </section>
    </main>
  );
}