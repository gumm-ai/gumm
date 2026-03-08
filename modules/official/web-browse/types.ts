export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface FetchResponse {
  url: string;
  title: string;
  content: string;
  truncated: boolean;
}
