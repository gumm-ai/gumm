/**
 * Progress and analytics handlers for the Fitness Coach module
 */

import type { ModuleContext } from '../../../../back/utils/brain';
import type { WorkoutLog, MealLog, BodyMeasurement } from '../types';
import {
  getProfile,
  formatDate,
  daysAgo,
  countByProperty,
  getDaysWithMeals,
  generateProgressRecommendations,
} from '../utils';
import { buildCoachingPrompt } from '../prompts';

// ─── Get Progress ────────────────────────────────────────────────────────────

export async function handleGetProgress(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({ error: 'Context not available.' });
  }

  const { period, focus } = args;
  const daysMap: Record<string, number> = {
    week: 7,
    month: 30,
    '3months': 90,
    year: 365,
    all: 9999,
  };
  const days = daysMap[period] || 30;
  const since = daysAgo(days);

  // Fetch all relevant data
  const workouts = await ctx.storage.list('workout_log', {
    since,
    limit: 100,
  });
  const meals = await ctx.storage.list('meal_log', { since, limit: 100 });
  const measurements = await ctx.storage.list('measurement_log', {
    since,
    limit: 100,
  });
  const profile = await getProfile(ctx);

  // Calculate stats
  const stats: Record<string, any> = {};

  // Workout stats
  const workoutData = workouts.map((w) => w.value as WorkoutLog);
  stats.workouts = {
    total_sessions: workoutData.length,
    total_duration_minutes: workoutData.reduce(
      (sum, w) => sum + (w.duration_minutes || 0),
      0,
    ),
    total_calories_burned: workoutData.reduce(
      (sum, w) => sum + (w.calories_burned || 0),
      0,
    ),
    types_breakdown: countByProperty(workoutData, 'type'),
    avg_duration:
      workoutData.length > 0
        ? Math.round(
            workoutData.reduce((sum, w) => sum + (w.duration_minutes || 0), 0) /
              workoutData.length,
          )
        : 0,
  };

  // Nutrition stats
  const mealData = meals.map((m) => m.value as MealLog);
  const mealsWithCalories = mealData.filter((m) => m.calories);
  stats.nutrition = {
    meals_logged: mealData.length,
    avg_daily_calories:
      mealsWithCalories.length > 0
        ? Math.round(
            mealsWithCalories.reduce((sum, m) => sum + (m.calories || 0), 0) /
              Math.max(1, getDaysWithMeals(mealData)),
          )
        : null,
  };

  // Weight progress
  const measurementData = measurements.map((m) => m.value as BodyMeasurement);
  const weights = measurementData
    .filter((m) => m.weight_kg)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (weights.length >= 2) {
    stats.weight = {
      starting: weights[0]!.weight_kg,
      current: weights[weights.length - 1]!.weight_kg,
      change: Number(
        (
          weights[weights.length - 1]!.weight_kg! - weights[0]!.weight_kg!
        ).toFixed(1),
      ),
      trend:
        weights[weights.length - 1]!.weight_kg! < weights[0]!.weight_kg!
          ? 'down'
          : 'up',
    };
  } else if (profile?.weight_kg) {
    stats.weight = {
      current: profile.weight_kg,
      starting: profile.starting_weight_kg,
      change: profile.starting_weight_kg
        ? Number((profile.weight_kg - profile.starting_weight_kg).toFixed(1))
        : null,
    };
  }

  // Goal progress
  if (
    profile?.primary_goal &&
    profile?.target_weight_kg &&
    stats.weight?.current
  ) {
    const startWeight = stats.weight.starting || stats.weight.current;
    const targetWeight = profile.target_weight_kg;
    const currentWeight = stats.weight.current;
    const totalToLose = Math.abs(startWeight - targetWeight);
    const lostSoFar = Math.abs(startWeight - currentWeight);
    stats.goal_progress = {
      goal: profile.primary_goal,
      target_weight: targetWeight,
      progress_percentage:
        totalToLose > 0 ? Math.round((lostSoFar / totalToLose) * 100) : 0,
    };
  }

  return JSON.stringify({
    period,
    focus: focus || 'overview',
    stats,
    recommendations: generateProgressRecommendations(stats, profile),
  });
}

// ─── Log Measurement ─────────────────────────────────────────────────────────

export async function handleLogMeasurement(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({ error: 'Context not available for logging.' });
  }

  const measurement: BodyMeasurement = {
    date: args.date || formatDate(),
    weight_kg: args.weight_kg,
    body_fat_percentage: args.body_fat_percentage,
    waist_cm: args.waist_cm,
    chest_cm: args.chest_cm,
    hips_cm: args.hips_cm,
    arms_cm: args.arms_cm,
    thighs_cm: args.thighs_cm,
    notes: args.notes,
  };

  await ctx.storage.store('measurement_log', measurement);

  // Also update profile weight if provided
  if (args.weight_kg) {
    const profile = (await getProfile(ctx)) || {};
    profile.weight_kg = args.weight_kg;
    profile.updated_at = new Date().toISOString();
    if (args.body_fat_percentage) {
      profile.body_fat_percentage = args.body_fat_percentage;
    }
    await ctx.storage.store('profile', profile);
  }

  return JSON.stringify({
    status: 'logged',
    message: 'Body measurements logged successfully.',
    measurement,
  });
}

// ─── Get Coaching Advice ─────────────────────────────────────────────────────

export async function handleGetCoachingAdvice(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  const { topic, specific_question } = args;

  // Get user data for context
  const profile = ctx ? await getProfile(ctx) : null;
  const recentWorkouts = ctx
    ? await ctx.storage.list('workout_log', {
        since: daysAgo(14),
        limit: 20,
      })
    : [];
  const recentMeals = ctx
    ? await ctx.storage.list('meal_log', { since: daysAgo(7), limit: 30 })
    : [];

  const workoutData = recentWorkouts.map((w) => w.value as WorkoutLog);
  const mealData = recentMeals.map((m) => m.value as MealLog);

  // Build context for advice
  const context = {
    profile_summary: profile
      ? {
          goal: profile.primary_goal,
          weight: profile.weight_kg,
          target: profile.target_weight_kg,
          activity_level: profile.activity_level,
          constraints: [
            ...(profile.disabilities || []),
            ...(profile.injuries || []),
          ],
          equipment: profile.equipment,
        }
      : null,
    recent_activity: {
      workouts_last_2_weeks: workoutData.length,
      workout_types: [...new Set(workoutData.map((w) => w.type))],
      avg_workout_duration:
        workoutData.length > 0
          ? Math.round(
              workoutData.reduce((sum, w) => sum + w.duration_minutes, 0) /
                workoutData.length,
            )
          : 0,
      meals_logged_last_week: mealData.length,
    },
    topic: topic || 'general',
    specific_question,
  };

  return JSON.stringify({
    status: 'provide_coaching',
    context,
    coaching_prompt: buildCoachingPrompt(context),
    instructions:
      "Provide personalized coaching advice as an elite-level personal trainer and nutrition expert. Be specific, actionable, and motivating. Address the user's specific situation and constraints.",
  });
}
