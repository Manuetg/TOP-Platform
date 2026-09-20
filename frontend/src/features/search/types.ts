export type SearchType = "resource" | "contact" | "booking";
export interface SearchItem { type: SearchType; id: string; title: string; subtitle: string | null; status: string; }
export interface SearchGroup { type: SearchType; items: SearchItem[]; hasMore: boolean; }
export interface SearchResponse { groups: SearchGroup[]; }
