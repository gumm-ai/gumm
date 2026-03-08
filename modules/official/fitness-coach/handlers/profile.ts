/**
 * Profile and onboarding handlers for the Fitness Coach module
 */

import type { ModuleContext } from '../../../../back/utils/brain';
import type { UserFitnessProfile } from '../types';
import {
  ONBOARDING_QUESTIONS,
  ESSENTIAL_FIELDS,
  RECOMMENDED_FIELDS,
} from '../constants';
import {
  getProfile,
  formatDate,
  calculateBMI,
  calculateBMR,
  calculateTDEE,
  getBMICategory,
} from '../utils';

// ─── Get Profile ─────────────────────────────────────────────────────────────

export async function handleGetProfile(ctx?: ModuleContext): Promise<string> {
  if (!ctx) {
    return JSON.stringify({
      error: 'Context not available. Profile cannot be retrieved.',
    });
  }

  const profile = await getProfile(ctx);

  if (!profile || Object.keys(profile).length === 0) {
    return JSON.stringify({
      status: 'no_profile',
      message:
        'No fitness profile configured yet. Use fitness_update_profile to set up your profile with your stats, goals, equipment, and preferences.',
      suggested_fields: [
        'sex',
        'age',
        'height_cm',
        'weight_kg',
        'primary_goal',
        'equipment',
        'disabilities',
        'diet_type',
        'activity_level',
      ],
    });
  }

  // Calculate derived values
  const derived: Record<string, any> = {};
  if (profile.weight_kg && profile.height_cm) {
    derived.bmi = calculateBMI(profile.weight_kg, profile.height_cm);
    derived.bmi_category = getBMICategory(derived.bmi);
  }
  if (profile.weight_kg && profile.height_cm && profile.age && profile.sex) {
    derived.bmr = calculateBMR(
      profile.weight_kg,
      profile.height_cm,
      profile.age,
      profile.sex,
    );
    derived.tdee = calculateTDEE(
      derived.bmr,
      profile.activity_level || 'moderate',
    );
  }

  return JSON.stringify({
    profile,
    derived_stats: derived,
  });
}

// ─── Update Profile ──────────────────────────────────────────────────────────

export async function handleUpdateProfile(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({
      error: 'Context not available. Profile cannot be updated.',
    });
  }

  // Get current profile
  const current = (await getProfile(ctx)) || {};

  // Merge with new values
  const updated: UserFitnessProfile = {
    ...current,
    ...args,
    updated_at: new Date().toISOString(),
  };

  // If this is the first time setting weight, also set starting weight
  if (args.weight_kg && !current.starting_weight_kg) {
    updated.starting_weight_kg = args.weight_kg;
    updated.starting_date = formatDate();
  }

  // Save to storage
  await ctx.storage.store('profile', updated);

  // Also save key facts to memory for the LLM to reference
  const memoryFacts = [];
  if (updated.sex) memoryFacts.push(`User sex: ${updated.sex}`);
  if (updated.age) memoryFacts.push(`User age: ${updated.age}`);
  if (updated.height_cm)
    memoryFacts.push(`User height: ${updated.height_cm} cm`);
  if (updated.weight_kg)
    memoryFacts.push(`User weight: ${updated.weight_kg} kg`);
  if (updated.primary_goal)
    memoryFacts.push(`Fitness goal: ${updated.primary_goal}`);
  if (updated.disabilities?.length)
    memoryFacts.push(`Disabilities: ${updated.disabilities.join(', ')}`);
  if (updated.injuries?.length)
    memoryFacts.push(`Current injuries: ${updated.injuries.join(', ')}`);
  if (updated.equipment?.length)
    memoryFacts.push(`Available equipment: ${updated.equipment.join(', ')}`);
  if (updated.diet_type) memoryFacts.push(`Diet type: ${updated.diet_type}`);
  if (updated.allergies?.length)
    memoryFacts.push(`Food allergies: ${updated.allergies.join(', ')}`);

  // Store consolidated fitness profile in memory
  if (memoryFacts.length > 0) {
    await ctx.memory.remember(
      'fitness_profile_summary',
      memoryFacts.join('; '),
      'fact',
    );
  }

  return JSON.stringify({
    status: 'updated',
    message: 'Fitness profile updated successfully.',
    updated_fields: Object.keys(args),
    profile: updated,
  });
}

// ─── Start Setup (Onboarding) ────────────────────────────────────────────────

export async function handleStartSetup(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({
      error: 'Context not available. Cannot start setup.',
    });
  }

  const forceFullSetup = args.force_full_setup || false;
  const profile = (await getProfile(ctx)) || {};

  // Determine which questions to ask based on missing data
  const questionsToAsk: Array<{
    field: string;
    question: string;
    category: string;
  }> = [];

  for (const [category, questions] of Object.entries(ONBOARDING_QUESTIONS)) {
    for (const q of questions) {
      const hasValue =
        profile[q.field as keyof UserFitnessProfile] !== undefined &&
        profile[q.field as keyof UserFitnessProfile] !== null;

      // Skip if we already have the data and not forcing full setup
      if (hasValue && !forceFullSetup) continue;

      // For arrays, check if they're non-empty
      if (Array.isArray(profile[q.field as keyof UserFitnessProfile])) {
        const arr = profile[q.field as keyof UserFitnessProfile] as any[];
        if (arr.length > 0 && !forceFullSetup) continue;
      }

      questionsToAsk.push({
        field: q.field,
        question: q.question,
        category,
      });
    }
  }

  // If profile is complete, return success message
  if (questionsToAsk.length === 0) {
    return JSON.stringify({
      status: 'profile_complete',
      message:
        "Your fitness profile is already set up! You're ready to get personalized workouts and nutrition advice.",
      profile_summary: {
        sex: profile.sex,
        age: profile.age,
        height_cm: profile.height_cm,
        weight_kg: profile.weight_kg,
        goal: profile.primary_goal,
      },
    });
  }

  // Group questions for a natural conversation flow
  const essentialMissing = questionsToAsk.filter(
    (q) => q.category === 'essential',
  );
  const otherMissing = questionsToAsk.filter((q) => q.category !== 'essential');

  // Build the onboarding message
  const introMessage =
    essentialMissing.length > 0
      ? "👋 Hey! I'm your personal fitness coach. To give you the best advice, I need to know a bit about you. Let's set up your profile!\n\n"
      : 'Great, I have your basics! Let me ask a few more questions to personalize your experience:\n\n';

  // Prioritize essential questions first
  const prioritizedQuestions = [...essentialMissing, ...otherMissing].slice(
    0,
    8,
  );

  return JSON.stringify({
    status: 'onboarding_needed',
    intro_message: introMessage,
    questions: prioritizedQuestions.map((q, i) => ({
      order: i + 1,
      field: q.field,
      question: q.question,
      category: q.category,
    })),
    total_questions: questionsToAsk.length,
    instruction: `Send the intro_message followed by the questions to the user via Telegram (send_telegram_message).
You can ask 2-3 questions at a time to keep the conversation natural.
When the user answers, use fitness_update_profile to save their responses.
After collecting essential info (sex, age, height, weight, goal), you can start providing advice while collecting remaining details gradually.`,
    telegram_format: `${introMessage}Let's start with the basics:\n\n1️⃣ ${prioritizedQuestions[0]?.question || ''}\n\n2️⃣ ${prioritizedQuestions[1]?.question || ''}\n\n3️⃣ ${prioritizedQuestions[2]?.question || ''}\n\nJust reply with your answers!`,
  });
}

// ─── Check Profile Complete ──────────────────────────────────────────────────

export async function handleCheckProfileComplete(
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({
      error: 'Context not available.',
      needs_setup: true,
    });
  }

  const profile = await getProfile(ctx);

  if (!profile) {
    return JSON.stringify({
      complete: false,
      needs_setup: true,
      missing_essential: [...ESSENTIAL_FIELDS],
      message:
        'No fitness profile found. Please run fitness_start_setup to begin the onboarding process.',
      action:
        'Call fitness_start_setup and send the questions to the user via Telegram.',
    });
  }

  // Essential fields that must be filled for basic functionality
  const missingEssential = ESSENTIAL_FIELDS.filter(
    (f) =>
      profile[f as keyof UserFitnessProfile] === undefined ||
      profile[f as keyof UserFitnessProfile] === null,
  );

  // Nice-to-have fields for better personalization
  const missingRecommended = RECOMMENDED_FIELDS.filter((f) => {
    const val = profile[f as keyof UserFitnessProfile];
    if (val === undefined || val === null) return true;
    if (Array.isArray(val) && val.length === 0) return true;
    return false;
  });

  const isComplete = missingEssential.length === 0;
  const hasRecommended = missingRecommended.length === 0;

  return JSON.stringify({
    complete: isComplete,
    fully_personalized: isComplete && hasRecommended,
    needs_setup: !isComplete,
    missing_essential: missingEssential,
    missing_recommended: missingRecommended,
    profile_summary: isComplete
      ? {
          sex: profile.sex,
          age: profile.age,
          height_cm: profile.height_cm,
          weight_kg: profile.weight_kg,
          goal: profile.primary_goal,
          equipment: profile.equipment || [],
          constraints: [
            ...(profile.disabilities || []),
            ...(profile.injuries || []),
          ],
        }
      : null,
    message: !isComplete
      ? `Profile incomplete. Missing: ${missingEssential.join(', ')}. Run fitness_start_setup to collect this info.`
      : hasRecommended
        ? 'Profile is complete and fully personalized!'
        : `Profile has essentials, but could be improved with: ${missingRecommended.join(', ')}`,
    action: !isComplete
      ? 'Call fitness_start_setup and send the questions via Telegram.'
      : undefined,
  });
}
