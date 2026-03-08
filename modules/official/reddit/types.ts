export interface RedditPost {
  id: string;
  fullname: string;
  title: string;
  author: string;
  subreddit: string;
  text?: string;
  url: string;
  score: number;
  numComments: number;
  flair?: string;
  createdAt: number;
  isNsfw: boolean;
  permalink: string;
}

export interface RedditComment {
  id: string;
  fullname: string;
  author: string;
  body: string;
  score: number;
  createdAt: number;
  permalink: string;
}

export interface WatchEntry {
  subreddit: string;
  keyword?: string;
  addedAt: string;
  lastCheckedAt?: string;
  lastPostFullname?: string;
}

export interface CapturedPost {
  watchKey: string;
  post: RedditPost;
  capturedAt: string;
}
