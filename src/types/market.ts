export type MarketItem = {
  itemId: number;
  name: string;
  high: number;
  low: number;
  margin: number;
  potentialProfit: number;
  favorited: boolean;
  updatedAt: string;
  highTime?: number;
  lowTime?: number;
  volume?: number; 
  limit?: number;
};

export type PriceHistoryPoint = {
  timestamp: string;
  high: number;
  low: number;
};

export type FavoriteItem = {
  itemId: number;
  name: string;
  high: number;
  low: number;
  margin: number;
  potentialProfit: number;
};
