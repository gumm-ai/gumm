/**
 * Handlers index for the Fitness Coach module
 * Re-exports all handlers and provides the main handler router
 */

import type { ModuleContext } from '../../../../back/utils/brain';

// Re-export all handlers
export {
  handleGetProfile,
  handleUpdateProfile,
  handleStartSetup,
  handleCheckProfileComplete,
} from './profile';

export {
  handleGenerateWorkout,
  handleLogWorkout,
  handleGetWorkoutHistory,
} from './workout';

export {
  handleGenerateMealPlan,
  handleLogMeal,
  handleGetMealHistory,
  handleCalculateCalories,
} from './nutrition';

export {
  handleGetProgress,
  handleLogMeasurement,
  handleGetCoachingAdvice,
} from './progress';

export { handleAnalyzePhoto } from './photo';

// Import all handlers for the router
import {
  handleGetProfile,
  handleUpdateProfile,
  handleStartSetup,
  handleCheckProfileComplete,
} from './profile';

import {
  handleGenerateWorkout,
  handleLogWorkout,
  handleGetWorkoutHistory,
} from './workout';

import {
  handleGenerateMealPlan,
  handleLogMeal,
  handleGetMealHistory,
  handleCalculateCalories,
} from './nutrition';

import {
  handleGetProgress,
  handleLogMeasurement,
  handleGetCoachingAdvice,
} from './progress';

import { handleAnalyzePhoto } from './photo';

// ─── Main Handler Router ─────────────────────────────────────────────────────

export async function handler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  switch (toolName) {
    // Profile
    case 'fitness_start_setup':
      return handleStartSetup(args, ctx);
    case 'fitness_check_profile_complete':
      return handleCheckProfileComplete(ctx);
    case 'fitness_get_profile':
      return handleGetProfile(ctx);
    case 'fitness_update_profile':
      return handleUpdateProfile(args, ctx);

    // Workout
    case 'fitness_generate_workout':
      return handleGenerateWorkout(args, ctx);
    case 'fitness_log_workout':
      return handleLogWorkout(args, ctx);
    case 'fitness_get_workout_history':
      return handleGetWorkoutHistory(args, ctx);

    // Nutrition
    case 'fitness_generate_meal_plan':
      return handleGenerateMealPlan(args, ctx);
    case 'fitness_log_meal':
      return handleLogMeal(args, ctx);
    case 'fitness_get_meal_history':
      return handleGetMealHistory(args, ctx);
    case 'fitness_calculate_calories':
      return handleCalculateCalories(args, ctx);

    // Progress
    case 'fitness_get_progress':
      return handleGetProgress(args, ctx);
    case 'fitness_log_measurement':
      return handleLogMeasurement(args, ctx);
    case 'fitness_get_coaching_advice':
      return handleGetCoachingAdvice(args, ctx);

    // Photo
    case 'fitness_analyze_photo':
      return handleAnalyzePhoto(args, ctx);

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
