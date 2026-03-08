/**
 * User Secrets — Local credential vault.
 *
 * Intercepts [[sensitive]] markers in user messages BEFORE they reach the LLM.
 * Values are stored locally in the database and replaced with [REDACTED] in the
 * message sent to OpenRouter. Passwords are hashed + salted.
 *
 * Flow:
 *  1. User says: "My Netflix password is [[hunter2]]"
 *  2. redactSecrets() strips [[hunter2]], stores it, replaces with [REDACTED]
 *  3. LLM sees: "My Netflix password is [REDACTED]"
 *  4. LLM uses save_secret tool to persist the structured key/value pair
 */
import { eq, and } from 'drizzle-orm';
import { userSecrets } from '../db/schema';

// ─── Hashing ────────────────────────────────────────────────────────────────

/**
 * Hash a secret password using bcrypt (via Bun built-in).
 * bcrypt handles salting internally — no need to manage salts separately.
 */
async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, { algorithm: 'bcrypt', cost: 10 });
}

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}

// ─── Redaction (pre-LLM) ───────────────────────────────────────────────────

/**
 * Default pattern: [[anything]] — captures the content between double brackets.
 * Supports multi-word values including spaces, special chars, etc.
 */
const DEFAULT_SECRET_PATTERN = '[[...]]';

export interface RedactedResult {
  /** The message with [[values]] replaced by [REDACTED] */
  cleanMessage: string;
  /** The extracted raw values in order of appearance */
  extractedSecrets: string[];
}

export interface GuardrailResult {
  /** Whether any sensitive data was detected */
  blocked: boolean;
  /** The sanitized message (if not blocked) */
  cleanMessage: string;
  /** User-wrapped secrets (from pattern like [[...]]) */
  extractedSecrets: string[];
  /** Auto-detected sensitive data types */
  detectedTypes: string[];
  /** Detailed info about what was detected */
  detections: Array<{ type: string; masked: string; position: number }>;
}

// ─── Auto-detection patterns for sensitive data ────────────────────────────

/**
 * Patterns for auto-detecting sensitive data BEFORE it reaches the LLM.
 * These patterns are designed to catch common sensitive data types.
 */
const SENSITIVE_PATTERNS: Array<{
  type: string;
  label: string;
  pattern: RegExp;
  mask: (match: string) => string;
}> = [
  // Credit card numbers (Visa, MasterCard, Amex, etc.)
  {
    type: 'credit_card',
    label: 'Credit Card Number',
    pattern:
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    mask: (m) => `****-****-****-${m.slice(-4)}`,
  },
  // Credit card with spaces/dashes
  {
    type: 'credit_card_formatted',
    label: 'Credit Card Number',
    pattern:
      /\b(?:4[0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}|5[1-5][0-9]{2}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}|3[47][0-9]{2}[\s-]?[0-9]{6}[\s-]?[0-9]{5})\b/g,
    mask: () => `****-****-****-****`,
  },
  // API Keys (generic patterns for common formats)
  {
    type: 'api_key_generic',
    label: 'API Key',
    pattern:
      /\b(?:sk|pk|api|key|token)[-_]?(?:live|test|prod|dev)?[-_]?[a-zA-Z0-9]{20,}/gi,
    mask: (m) => `${m.slice(0, 8)}...${m.slice(-4)}`,
  },
  // OpenAI API Key
  {
    type: 'openai_key',
    label: 'OpenAI API Key',
    pattern: /\bsk-[a-zA-Z0-9]{48,}/g,
    mask: (m) => `sk-...${m.slice(-4)}`,
  },
  // Anthropic API Key
  {
    type: 'anthropic_key',
    label: 'Anthropic API Key',
    pattern: /\bsk-ant-[a-zA-Z0-9-]{90,}/g,
    mask: (m) => `sk-ant-...${m.slice(-4)}`,
  },
  // AWS Access Key
  {
    type: 'aws_key',
    label: 'AWS Access Key',
    pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    mask: () => `AKIA...XXXX`,
  },
  // AWS Secret Key
  {
    type: 'aws_secret',
    label: 'AWS Secret Key',
    pattern: /\b[A-Za-z0-9/+=]{40}\b/g,
    mask: () => `[AWS_SECRET_HIDDEN]`,
  },
  // GitHub Token
  {
    type: 'github_token',
    label: 'GitHub Token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g,
    mask: (m) => `${m.slice(0, 7)}...${m.slice(-4)}`,
  },
  // Stripe Key
  {
    type: 'stripe_key',
    label: 'Stripe Key',
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[a-zA-Z0-9]{24,}/g,
    mask: (m) => `${m.slice(0, 12)}...${m.slice(-4)}`,
  },
  // Discord Token
  {
    type: 'discord_token',
    label: 'Discord Token',
    pattern: /\b[MN][A-Za-z0-9]{23,28}\.[A-Za-z0-9-_]{6}\.[A-Za-z0-9-_]{27,}/g,
    mask: () => `[DISCORD_TOKEN_HIDDEN]`,
  },
  // JWT Token
  {
    type: 'jwt_token',
    label: 'JWT Token',
    pattern: /\beyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_.+/=]+\b/g,
    mask: () => `[JWT_HIDDEN]`,
  },
  // Bearer Token (generic)
  {
    type: 'bearer_token',
    label: 'Bearer Token',
    pattern: /\bBearer\s+[a-zA-Z0-9-_.]+/gi,
    mask: () => `Bearer [TOKEN_HIDDEN]`,
  },
  // Password patterns (common formats following "password:" or similar)
  {
    type: 'password_field',
    label: 'Password',
    pattern:
      /(?:password|passwd|pwd|pass|secret|credential)[\s]*[=:]\s*["']?[^\s"'\n,;]{4,}["']?/gi,
    mask: () => `password: [HIDDEN]`,
  },
  // Private Key (SSH/PEM)
  {
    type: 'private_key',
    label: 'Private Key',
    pattern:
      /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    mask: () => `[PRIVATE_KEY_HIDDEN]`,
  },
  // Social Security Number (US)
  {
    type: 'ssn',
    label: 'Social Security Number',
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    mask: () => `***-**-****`,
  },
  // French social security number (NIR)
  {
    type: 'nir',
    label: 'Numéro de Sécurité Sociale',
    pattern: /\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g,
    mask: () => `*-**-**-**-***-***-**`,
  },
  // Basic Auth
  {
    type: 'basic_auth',
    label: 'Basic Auth',
    pattern: /\bBasic\s+[A-Za-z0-9+/=]{10,}/gi,
    mask: () => `Basic [AUTH_HIDDEN]`,
  },
  // Database connection strings
  {
    type: 'db_connection',
    label: 'Database Connection String',
    pattern: /(?:mongodb|postgres|mysql|redis|mariadb):\/\/[^\s]+/gi,
    mask: (m) => `${m.split('://')[0]}://[CONNECTION_HIDDEN]`,
  },
  // Generic hex tokens (32+ chars)
  {
    type: 'hex_token',
    label: 'Hex Token',
    pattern: /\b[a-fA-F0-9]{32,}\b/g,
    mask: (m) => `${m.slice(0, 8)}...${m.slice(-4)}`,
  },
];

/**
 * Build a regex from a user-defined pattern string.
 * Supports patterns like [[...]], {{...}}, <<...>>, etc.
 */
function buildPatternRegex(pattern: string): RegExp {
  // Escape special regex chars except for ...
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Replace ... with capture group
  const withCapture = escaped.replace('\\.\\.\\.', '([^\\]\\}\\>]+)');
  return new RegExp(withCapture, 'g');
}

/**
 * Strip all user-marked secrets from a message, replacing them with [REDACTED].
 * Uses the provided pattern or defaults to [[...]].
 */
export function redactSecrets(
  message: string,
  pattern?: string,
): RedactedResult {
  const extractedSecrets: string[] = [];
  const regex = buildPatternRegex(pattern || DEFAULT_SECRET_PATTERN);

  const cleanMessage = message.replace(regex, (_match, value) => {
    extractedSecrets.push(value);
    return '[REDACTED]';
  });

  return { cleanMessage, extractedSecrets };
}

/**
 * Apply the full guardrail: check for user-marked secrets AND auto-detect sensitive data.
 * This should be called BEFORE sending any message to an online LLM.
 */
export async function applyGuardrail(
  message: string,
  options?: {
    enabled?: boolean;
    pattern?: string;
    autoDetect?: boolean;
  },
): Promise<GuardrailResult> {
  const brain = useBrain();
  await brain.ready();

  // Get guardrail settings from brain config
  const guardrailEnabled =
    options?.enabled ??
    (await brain.getConfig('guardrail.enabled')) !== 'false';
  const userPattern =
    options?.pattern ??
    (await brain.getConfig('guardrail.pattern')) ??
    DEFAULT_SECRET_PATTERN;
  const autoDetectEnabled =
    options?.autoDetect ??
    (await brain.getConfig('guardrail.autoDetect')) !== 'false';

  // If guardrail is disabled, pass through unchanged
  if (!guardrailEnabled) {
    return {
      blocked: false,
      cleanMessage: message,
      extractedSecrets: [],
      detectedTypes: [],
      detections: [],
    };
  }

  // 1. First, handle user-marked secrets (e.g., [[secret]])
  const { cleanMessage: afterUserRedaction, extractedSecrets } = redactSecrets(
    message,
    userPattern,
  );

  // 2. Auto-detect sensitive data
  const detections: Array<{ type: string; masked: string; position: number }> =
    [];
  const detectedTypes = new Set<string>();
  let finalMessage = afterUserRedaction;

  if (autoDetectEnabled) {
    for (const { type, label, pattern, mask } of SENSITIVE_PATTERNS) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(afterUserRedaction)) !== null) {
        // Avoid infinite loops with zero-width matches
        if (match[0].length === 0) {
          pattern.lastIndex++;
          continue;
        }

        detectedTypes.add(label);
        detections.push({
          type: label,
          masked: mask(match[0]),
          position: match.index,
        });
      }
    }

    // If sensitive data was auto-detected, block the message
    if (detections.length > 0) {
      // Replace all detected sensitive data with [BLOCKED]
      for (const { type, pattern } of SENSITIVE_PATTERNS) {
        pattern.lastIndex = 0;
        finalMessage = finalMessage.replace(pattern, `[BLOCKED: ${type}]`);
      }
    }
  }

  return {
    blocked: detections.length > 0,
    cleanMessage: finalMessage,
    extractedSecrets,
    detectedTypes: Array.from(detectedTypes),
    detections,
  };
}

/**
 * Check a message for sensitive data without modifying it.
 * Useful for preview/validation in the UI.
 */
export function detectSensitiveData(
  message: string,
  pattern?: string,
): {
  hasUserSecrets: boolean;
  autoDetected: string[];
  details: Array<{ type: string; masked: string }>;
} {
  const regex = buildPatternRegex(pattern || DEFAULT_SECRET_PATTERN);
  const hasUserSecrets = regex.test(message);

  const autoDetected: string[] = [];
  const details: Array<{ type: string; masked: string }> = [];

  for (const { label, pattern: p, mask } of SENSITIVE_PATTERNS) {
    p.lastIndex = 0;
    const match = p.exec(message);
    if (match) {
      if (!autoDetected.includes(label)) {
        autoDetected.push(label);
      }
      details.push({ type: label, masked: mask(match[0]) });
    }
  }

  return { hasUserSecrets, autoDetected, details };
}

/**
 * Check if a message contains any secret markers using the given pattern.
 */
export function hasSecretMarkers(message: string, pattern?: string): boolean {
  const regex = buildPatternRegex(pattern || DEFAULT_SECRET_PATTERN);
  return regex.test(message);
}

// ─── Persistence ────────────────────────────────────────────────────────────

/**
 * Save a secret for a service. Upserts by (service, key).
 * If isPassword is true, the value is hashed+salted before storage.
 */
export async function saveSecret(
  service: string,
  key: string,
  value: string,
  isPassword = false,
): Promise<{ id: string; service: string; key: string }> {
  const db = useDrizzle();
  const now = new Date();
  const normalizedService = service.toLowerCase().trim();
  const normalizedKey = key.toLowerCase().trim();

  let storedValue = value;

  if (isPassword) {
    storedValue = await hashPassword(value);
  }

  // Try update first
  const existing = await db
    .select()
    .from(userSecrets)
    .where(
      and(
        eq(userSecrets.service, normalizedService),
        eq(userSecrets.key, normalizedKey),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0]!;
    await db
      .update(userSecrets)
      .set({ value: storedValue, isPassword, salt: null, updatedAt: now })
      .where(eq(userSecrets.id, row.id));
    return {
      id: row.id,
      service: normalizedService,
      key: normalizedKey,
    };
  }

  const id = crypto.randomUUID();
  await db.insert(userSecrets).values({
    id,
    service: normalizedService,
    key: normalizedKey,
    value: storedValue,
    isPassword,
    salt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { id, service: normalizedService, key: normalizedKey };
}

/**
 * Retrieve a secret value. Returns null if not found.
 * For passwords, returns "[HASHED — cannot retrieve plaintext]".
 */
export async function getSecret(
  service: string,
  key: string,
): Promise<string | null> {
  const db = useDrizzle();
  const rows = await db
    .select()
    .from(userSecrets)
    .where(
      and(
        eq(userSecrets.service, service.toLowerCase().trim()),
        eq(userSecrets.key, key.toLowerCase().trim()),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0]!;
  if (row.isPassword) {
    return '[HASHED — cannot retrieve plaintext]';
  }
  return row.value;
}

/**
 * Verify a password against the stored hash.
 */
export async function verifySecretPassword(
  service: string,
  key: string,
  plaintext: string,
): Promise<boolean> {
  const db = useDrizzle();
  const rows = await db
    .select()
    .from(userSecrets)
    .where(
      and(
        eq(userSecrets.service, service.toLowerCase().trim()),
        eq(userSecrets.key, key.toLowerCase().trim()),
      ),
    )
    .limit(1);

  if (rows.length === 0) return false;

  const row = rows[0]!;
  if (!row.isPassword) return false;

  return verifyPassword(plaintext, row.value);
}

/**
 * List all secrets for a service (values masked for passwords).
 */
export async function listSecrets(service?: string): Promise<
  Array<{
    id: string;
    service: string;
    key: string;
    value: string;
    isPassword: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  const db = useDrizzle();

  const rows = service
    ? await db
        .select()
        .from(userSecrets)
        .where(eq(userSecrets.service, service.toLowerCase().trim()))
    : await db.select().from(userSecrets);

  return rows.map((r) => ({
    id: r.id,
    service: r.service,
    key: r.key,
    value: r.isPassword ? '••••••••' : r.value,
    isPassword: r.isPassword,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Delete a secret by ID.
 */
export async function deleteSecret(id: string): Promise<void> {
  await useDrizzle().delete(userSecrets).where(eq(userSecrets.id, id));
}

/**
 * Delete all secrets for a service.
 */
export async function deleteServiceSecrets(service: string): Promise<number> {
  const result = await useDrizzle()
    .delete(userSecrets)
    .where(eq(userSecrets.service, service.toLowerCase().trim()))
    .returning();
  return result.length;
}
