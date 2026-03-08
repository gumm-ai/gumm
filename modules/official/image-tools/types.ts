export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff';

export type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

export type FilterType =
  | 'grayscale'
  | 'blur'
  | 'sharpen'
  | 'negate'
  | 'normalize'
  | 'flip'
  | 'flop';

export interface ImageResult {
  success: boolean;
  storageKey: string;
  width: number;
  height: number;
  format: string;
  size: number;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  channels: number;
  hasAlpha: boolean;
  size: number;
  storageKey: string;
}
