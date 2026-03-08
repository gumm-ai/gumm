/**
 * Personal Facts — Persistent owner profile & preferences.
 *
 * Stores structured personal information about the user (identity, tastes,
 * dislikes, lifestyle, etc.) so the Brain can always know who it's talking to.
 * Unlike generic memory, personal facts are ALWAYS injected into the LLM context.
 */
import { eq, and } from 'drizzle-orm';
import { personalFacts } from '../db/schema';

export type PersonalFactCategory =
  | 'identity'
  | 'preferences'
  | 'tastes'
  | 'dislikes'
  | 'health'
  | 'lifestyle'
  | 'relationships'
  | 'work'
  | 'goals'
  | 'education'
  | 'finances'
  | 'travel'
  | 'other';

export interface PersonalFact {
  id: string;
  category: PersonalFactCategory;
  key: string;
  value: string;
  source: 'auto' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Save a personal fact. Upserts by (category, key) pair.
 */
export async function savePersonalFact(
  category: PersonalFactCategory,
  key: string,
  value: string,
  source: 'auto' | 'manual' = 'auto',
): Promise<PersonalFact> {
  const now = new Date();

  // Try update first
  const updated = await useDrizzle()
    .update(personalFacts)
    .set({ value, source, updatedAt: now })
    .where(
      and(eq(personalFacts.category, category), eq(personalFacts.key, key)),
    )
    .returning();

  if (updated.length > 0) {
    return updated[0] as PersonalFact;
  }

  // Insert if not found
  const id = crypto.randomUUID();
  const [inserted] = await useDrizzle()
    .insert(personalFacts)
    .values({
      id,
      category,
      key,
      value,
      source,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return inserted as PersonalFact;
}

/**
 * Get all personal facts, optionally filtered by category.
 */
export async function getPersonalFacts(
  category?: PersonalFactCategory,
): Promise<PersonalFact[]> {
  if (category) {
    return (await useDrizzle()
      .select()
      .from(personalFacts)
      .where(eq(personalFacts.category, category))) as PersonalFact[];
  }
  return (await useDrizzle().select().from(personalFacts)) as PersonalFact[];
}

/**
 * Delete a personal fact by ID.
 */
export async function deletePersonalFact(id: string): Promise<void> {
  await useDrizzle().delete(personalFacts).where(eq(personalFacts.id, id));
}

/**
 * Update a personal fact's value by ID.
 */
export async function updatePersonalFact(
  id: string,
  updates: { value?: string; category?: PersonalFactCategory },
): Promise<PersonalFact | null> {
  const now = new Date();
  const [updated] = await useDrizzle()
    .update(personalFacts)
    .set({ ...updates, source: 'manual' as const, updatedAt: now })
    .where(eq(personalFacts.id, id))
    .returning();

  return (updated as PersonalFact) ?? null;
}

/**
 * Build a formatted block of all personal facts for injection into the system prompt.
 * Groups facts by category for readability.
 */
export async function buildPersonalFactsBlock(): Promise<string | null> {
  const facts = await getPersonalFacts();
  if (facts.length === 0) return null;

  const categoryLabels: Record<PersonalFactCategory, string> = {
    identity: 'Identity',
    preferences: 'Preferences',
    tastes: 'Likes & Tastes',
    dislikes: 'Dislikes',
    health: 'Health',
    lifestyle: 'Lifestyle',
    relationships: 'Relationships',
    work: 'Work & Career',
    goals: 'Goals & Aspirations',
    education: 'Education & Skills',
    finances: 'Finances',
    travel: 'Travel',
    other: 'Other',
  };

  // Group by category
  const grouped = new Map<PersonalFactCategory, PersonalFact[]>();
  for (const fact of facts) {
    const list = grouped.get(fact.category) || [];
    list.push(fact);
    grouped.set(fact.category, list);
  }

  const lines: string[] = [];
  for (const [cat, items] of grouped) {
    lines.push(`### ${categoryLabels[cat]}`);
    for (const item of items) {
      lines.push(`- ${item.key}: ${item.value}`);
    }
  }

  return lines.join('\n');
}
