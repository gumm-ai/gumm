export interface InstagramMedia {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  mediaUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
}

export interface InstagramComment {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  likeCount: number;
}

export interface InstagramInsights {
  reach: number;
  impressions: number;
  engagement: number;
  saved?: number;
}

export interface WatchedHashtag {
  hashtag: string;
  hashtagId?: string;
  addedAt: string;
  lastCheckedAt?: string;
}

export interface CapturedMedia {
  hashtag: string;
  media: {
    id: string;
    mediaUrl?: string;
    caption?: string;
    permalink: string;
    timestamp: string;
    likeCount: number;
    commentsCount: number;
  };
  capturedAt: string;
}
