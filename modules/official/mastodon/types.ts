export interface MastodonStatus {
  id: string;
  content: string;
  url: string;
  account: {
    id: string;
    username: string;
    displayName: string;
    acct: string;
  };
  createdAt: string;
  reblogsCount: number;
  favouritesCount: number;
  repliesCount: number;
  sensitive: boolean;
  spoilerText: string;
  visibility: 'public' | 'unlisted' | 'private' | 'direct';
}

export interface MastodonNotification {
  id: string;
  type: string;
  createdAt: string;
  account: { id: string; username: string; displayName: string; acct: string };
  status?: MastodonStatus;
}

export interface WatchedHashtag {
  hashtag: string;
  addedAt: string;
  lastCheckedAt?: string;
  lastStatusId?: string;
}

export interface CapturedStatus {
  hashtag: string;
  status: MastodonStatus;
  capturedAt: string;
}
