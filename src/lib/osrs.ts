const OSRS_PRICES_API = "https://prices.runescape.wiki/api/v1/osrs";

export type OsrsMappingItem = {
  id: number;
  name: string;
  examine?: string;
  members?: boolean;
  lowalch?: number;
  highalch?: number;
  limit?: number;
  icon?: string;
};

type LatestPricePoint = {
  high: number;
  highTime: number;
  low: number;
  lowTime: number;
};

type LatestPricesResponse = {
  data: Record<string, LatestPricePoint>;
};

const userAgent =
  process.env.OSRS_WIKI_USER_AGENT ??
  "osrs-flip-finder-school-project - contact@example.com";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${OSRS_PRICES_API}${path}`, {
    headers: {
      "User-Agent": userAgent,
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`OSRS API request failed (${response.status}) at ${path}`);
  }

  return (await response.json()) as T;
}

export async function fetchItemMapping(): Promise<OsrsMappingItem[]> {
  return fetchJson<OsrsMappingItem[]>("/mapping");
}

export async function fetchLatestPrices(): Promise<LatestPricesResponse> {
  return fetchJson<LatestPricesResponse>("/latest");
}
