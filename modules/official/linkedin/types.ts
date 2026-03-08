export interface LinkedInPost {
  urn: string;
  authorName: string;
  authorUrn: string;
  text: string;
  shareUrl?: string;
  likeCount: number;
  commentCount: number;
  createdAt: number;
}

export interface LinkedInProfile {
  sub: string;
  name: string;
  givenName: string;
  familyName: string;
  email?: string;
  picture?: string;
}

export interface WatchedKeyword {
  keyword: string;
  addedAt: string;
  lastCheckedAt?: string;
}

export interface CapturedPost {
  keyword: string;
  post: LinkedInPost;
  capturedAt: string;
}
