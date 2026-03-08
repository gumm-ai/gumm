/**
 * Utility functions for the Fitness Coach module
 */

import type { ModuleContext } from '../../../back/utils/brain';
import type { UserFitnessProfile, MealLog, WorkoutStreak } from './types';
import { ACTIVITY_MULTIPLIERS } from './constants';

// ─── Profile Storage ─────────────────────────────────────────────────────────

export async function getProfile(
  ctx: ModuleContext,
): Promise<UserFitnessProfile | null> {
  const stored = await ctx.storage.get('profile');
  return stored ? (stored as UserFitnessProfile) : null;
}

// ─── Date Helpers ────────────────────────────────────────────────────────────

export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0]!;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Body Calculations ───────────────────────────────────────────────────────

export function calculateBMI(weight_kg: number, height_cm: number): number {
  const height_m = height_cm / 100;
  return Math.round((weight_kg / (height_m * height_m)) * 10) / 10;
}

export function calculateBMR(
  weight_kg: number,
  height_cm: number,
  age: number,
  sex: string,
): number {
  // Mifflin-St Jeor Equation
  if (sex === 'male') {
    return Math.round(10 * weight_kg + 6.25 * height_cm - 5 * age + 5);
  } else {
    return Math.round(10 * weight_kg + 6.25 * height_cm - 5 * age - 161);
  }
}

export function calculateTDEE(bmr: number, activity_level: string): number {
  return Math.round(bmr * (ACTIVITY_MULTIPLIERS[activity_level] || 1.55));
}

export function getBMICategory(bmi: number): string {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  return 'obese';
}

// ─── Data Aggregation ────────────────────────────────────────────────────────

export function countByProperty(
  items: any[],
  prop: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const val = item[prop] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

export function getDaysWithMeals(meals: MealLog[]): number {
  const days = new Set(meals.map((m) => m.date));
  return days.size;
}

// ─── Streak Management ───────────────────────────────────────────────────────

export async function updateWorkoutStreak(
  ctx: ModuleContext,
  date: string,
): Promise<void> {
  const streakData = (await ctx.storage.get(
    'workout_streak',
  )) as WorkoutStreak | null;

  const today = formatDate();
  const yesterday = formatDate(daysAgo(1));

  if (!streakData) {
    await ctx.storage.store('workout_streak', {
      current: 1,
      best: 1,
      lastDate: date,
    });
    return;
  }

  if (streakData.lastDate === today) {
    return; // Already logged today
  }

  if (streakData.lastDate === yesterday || streakData.lastDate === date) {
    const newStreak = streakData.current + 1;
    await ctx.storage.store('workout_streak', {
      current: newStreak,
      best: Math.max(streakData.best, newStreak),
      lastDate: today,
    });
  } else {
    // Streak broken
    await ctx.storage.store('workout_streak', {
      current: 1,
      best: streakData.best,
      lastDate: today,
    });
  }
}

// ─── Progress Recommendations ────────────────────────────────────────────────

export function generateProgressRecommendations(
  stats: Record<string, any>,
  profile: UserFitnessProfile | null,
): string[] {
  const recs: string[] = [];

  // Workout frequency
  if (stats.workouts?.total_sessions < 3) {
    recs.push(
      'Try to increase workout frequency to at least 3 sessions per week for better results.',
    );
  } else if (stats.workouts?.total_sessions >= 5) {
    recs.push(
      'Great workout consistency! Make sure to include adequate rest days for recovery.',
    );
  }

  // Nutrition tracking
  if (!stats.nutrition?.avg_daily_calories) {
    recs.push(
      'Start logging your meals to track nutrition. This significantly improves results.',
    );
  }

  // Weight progress
  if (stats.weight?.change && profile?.primary_goal === 'weight_loss') {
    if (stats.weight.change > 0) {
      recs.push(
        'Weight is trending up. Review calorie intake and consider increasing cardio.',
      );
    } else if (stats.weight.change < -3) {
      recs.push(
        "Steady weight loss! Make sure you're getting enough protein to preserve muscle.",
      );
    }
  }

  if (recs.length === 0) {
    recs.push(
      'Keep up the great work! Consistency is key to long-term success.',
    );
  }

  return recs;
}
