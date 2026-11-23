// Data contract from the PRD ("Data model and seed data").

export type Vertical = 'travel' | 'airlines' | 'travel_insurance' | 'beauty' | 'food_delivery' | 'finance';
export type PageId = 'A' | 'B' | 'C' | 'D';
export type Tier = 1 | 2 | 3 | 4;
export type Mode = 'keyword' | 'lel';

export interface Page {
  id: PageId;
  title: string;
  publishedHoursBeforeEvent: number; // 0 = published at event time
  baseTier: Tier; // 1 high risk, 4 fully safe
  entities: { entityId: string; salience: number }[]; // salience 0-1
  keywords: string[]; // words the keyword blocklist checks
  impressionsPerHour: number;
}

export interface Advertiser {
  id: string;
  name: string;
  vertical: Vertical;
  minTier: Tier;
  bidCpm: number; // USD per 1,000 impressions
  relevance: Record<PageId, number>; // 0-1
}

export interface EventRecord {
  eventId: string;
  entityId: string;
  vertical: Vertical; // one record per affected vertical
  riskClass: 'high' | 'medium';
  confidence: number; // 0-1
  startMinute: number; // minutes after the incident
  halfLifeHours: number;
  minWeight: number; // step-down ends below this
}

export interface DecisionRow {
  pageId: PageId;
  advertiserId: string;
  baseTier: number;
  stepDown: 0 | 1;
  rule: string;
  effectiveTier: number;
  eligible: boolean;
  why: string;
  score: number;
  winner: boolean;
}

export interface Bucket {
  minute: number;
  mentions: number;
}

export interface BucketEval extends Bucket {
  ratio: number;
  confidence: number;
  checks: { ratio: boolean; volume: boolean; polarity: boolean; confidence: boolean };
  pass: boolean;
}

export interface Detection {
  fired: boolean;
  bucket: BucketEval | null;
  evals: BucketEval[];
  events: EventRecord[];
}

export interface EventTemplate {
  riskClass: 'high' | 'medium';
  verticals: Vertical[];
  halfLifeHours: number;
  minWeight: number;
}

export interface Seed {
  entity: { id: string; name: string };
  keywordBlocklist: string[];
  pages: Page[];
  advertisers: Advertiser[];
  eventTemplate: EventTemplate;
  mentionsBaselinePer10Min: number;
  spikeSeries: Bucket[];
  polarityPresets: { crash: number; positiveStory: number };
  reportWindowHours: number;
}

export interface Ctx {
  pages: Page[];
  advertisers: Advertiser[];
  keywordBlocklist: string[];
  events: EventRecord[];
  entityId: string;
}

export interface AuctionResult {
  rows: DecisionRow[];
  winner: Advertiser | null;
  revenue: number;
  blockedKeyword: string | null;
}

export interface ModeTotals {
  revenue: number;
  impressions: number;
  filled: number;
  rpm: number;
  fillRate: number;
}

export interface Report {
  keyword: ModeTotals;
  lel: ModeTotals;
  protectedImpressions: number;
  recoveredImpressions: number;
}

export interface PageBreakdown {
  page: Page;
  keywordRevenue: number;
  lelRevenue: number;
}
