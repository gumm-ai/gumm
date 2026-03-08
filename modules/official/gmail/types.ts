/**
 * Resolved attachment data ready for email
 */
export interface ResolvedAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Attachment metadata from a Gmail message
 */
export interface AttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}
