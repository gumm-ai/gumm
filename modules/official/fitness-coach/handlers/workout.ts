/**
 * Workout handlers for the Fitness Coach module
 */

import type { ModuleContext } from '../../../../back/utils/brain';
import type { WorkoutLog } from '../types';
import { getProfile, formatDate, updateWorkoutStreak } from '../utils';
import { buildWorkoutPrompt } from '../prompts';

// ─── Generate Workout ────────────────────────────────────────────────────────

export async function handleGenerateWorkout(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  const { plan_type, focus, duration_minutes, intensity, specific_request } =
    args;

  // Get user profile for personalization
  const profile = ctx ? await getProfile(ctx) : null;

  // Check if profile has minimum required info
  const hasMininumInfo =
    profile?.sex && profile?.age && profile?.height_cm && profile?.weight_kg;
  if (!hasMininumInfo) {
    return JSON.stringify({
      status: 'profile_incomplete',
      message:
        'I need some basic info about you before creating a personalized workout plan.',
      missing_info: {
        sex: !profile?.sex,
        age: !profile?.age,
        height_cm: !profile?.height_cm,
        weight_kg: !profile?.weight_kg,
      },
      action:
        'Please run fitness_start_setup first and send the onboarding questions via Telegram. Once I know your basic stats (sex, age, height, weight), I can create a personalized plan for you.',
      can_proceed_with_generic: true,
      note: "If the user insists, you can generate a generic workout, but it won't be personalized.",
    });
  }

  // Build workout parameters
  const params = {
    plan_type,
    focus: focus || 'full_body',
    duration: duration_minutes || profile?.available_workout_time_minutes || 45,
    intensity: intensity || 'medium',
    equipment: profile?.equipment || [],
    gym_access: profile?.gym_access || false,
    constraints: {
      can_run: profile?.can_run !== false,
      can_jump: profile?.can_jump !== false,
      can_lift_heavy: profile?.can_lift_heavy !== false,
      disabilities: profile?.disabilities || [],
      injuries: profile?.injuries || [],
    },
    goal: profile?.primary_goal || 'general_health',
    fitness_level: profile?.activity_level || 'moderate',
    specific_request,
  };

  // Build detailed workout generation prompt
  const prompt = buildWorkoutPrompt(params);

  return JSON.stringify({
    status: 'generate_workout',
    parameters: params,
    generation_prompt: prompt,
    instructions:
      "Generate a detailed workout plan following the parameters above. Include warm-up, main workout, and cool-down. For each exercise, provide: name, sets, reps/duration, rest time, and form cues. Adapt to the user's constraints.",
  });
}

// ─── Log Workout ─────────────────────────────────────────────────────────────

export async function handleLogWorkout(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({ error: 'Context not available for logging.' });
  }

  const workout: WorkoutLog = {
    date: args.date || formatDate(),
    type: args.type,
    duration_minutes: args.duration_minutes,
    calories_burned: args.calories_burned,
    exercises: args.exercises,
    intensity: args.intensity,
    feeling: args.feeling,
    notes: args.notes,
  };

  await ctx.storage.store('workout_log', workout);

  // Update streak tracking
  await updateWorkoutStreak(ctx, workout.date);

  return JSON.stringify({
    status: 'logged',
    message: `Workout logged: ${workout.type} for ${workout.duration_minutes} minutes`,
    workout,
  });
}

// ─── Get Workout History ─────────────────────────────────────────────────────

export async function handleGetWorkoutHistory(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({ error: 'Context not available.' });
  }

  const days = args.days || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const workouts = await ctx.storage.list('workout_log', {
    since,
    limit: 50,
  });

  let data = workouts.map((w) => w.value as WorkoutLog);
  if (args.workout_type) {
    data = data.filter((w) =>
      w.type.toLowerCase().includes(args.workout_type.toLowerCase()),
    );
  }

  return JSON.stringify({
    period_days: days,
    total_workouts: data.length,
    workouts: data,
  });
}
