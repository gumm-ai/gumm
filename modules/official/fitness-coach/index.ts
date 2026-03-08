/**
 * Fitness & Nutrition Coach Module
 *
 * Elite-level personal trainer and nutrition expert that:
 * - Analyzes photos (body composition, exercise form, meals)
 * - Creates personalized plans based on user profile
 * - Tracks progress over time
 * - Adapts to equipment, disabilities, diet preferences
 *
 * Stores user profile and logs in module storage for persistence.
 */

// Export tool definitions
export { tools } from './tools';

// Export main handler
export { handler } from './handlers';

// Re-export types for external use
export type {
  UserFitnessProfile,
  WorkoutLog,
  MealLog,
  BodyMeasurement,
  Exercise,
  FitnessGoal,
  DietType,
  ActivityLevel,
  Intensity,
  Feeling,
  MealType,
} from './types';
