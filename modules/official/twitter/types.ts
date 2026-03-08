export interface TwitterCredentials {
  bearerToken: string;
  accessToken: string;
  accessTokenSecret: string;
  consumerKey: string;
  consumerSecret: string;
  userId: string;
}

export interface Tweet {
  id: string;
  text: string;
  authorId: string;
  authorName?: string;
  authorUsername?: string;
  createdAt: string;
  metrics?: {
    likeCount: number;
    retweetCount: number;
    replyCount: number;
    quoteCount: number;
  };
  referencedTweetId?: string;
  url?: string;
}

export interface WatchedKeyword {
  keyword: string;
  addedAt: string;
  lastCheckedAt?: string;
  lastTweetId?: string;
}

export interface WatchedTweet {
  keyword: string;
  tweet: Tweet;
  capturedAt: string;
}
