/**
 * Type definitions for the Fitness Coach module
 */

// ─── User Profile ────────────────────────────────────────────────────────────

export interface UserFitnessProfile {
  // Basic info
  sex?: 'male' | 'female' | 'other';
  age?: number;
  height_cm?: number;
  weight_kg?: number;
  body_fat_percentage?: number;

  // Goals
  primary_goal?: FitnessGoal;
  target_weight_kg?: number;
  weekly_workout_days?: number;

  // Constraints
  disabilities?: string[];
  injuries?: string[];
  medical_conditions?: string[];
  can_run?: boolean;
  can_jump?: boolean;
  can_lift_heavy?: boolean;

  // Equipment
  equipment?: string[];
  gym_access?: boolean;
  pool_access?: boolean;
  outdoor_space?: boolean;

  // Diet
  diet_type?: DietType;
  allergies?: string[];
  food_dislikes?: string[];
  daily_calorie_target?: number;
  meals_per_day?: number;

  // Lifestyle
  activity_level?: ActivityLevel;
  sleep_hours?: number;
  stress_level?: 'low' | 'medium' | 'high';
  work_schedule?: string;
  available_workout_time_minutes?: number;

  // Progress tracking
  starting_weight_kg?: number;
  starting_date?: string;

  // Last updated
  updated_at?: string;
}

// ─── Logs ────────────────────────────────────────────────────────────────────

export interface WorkoutLog {
  date: string;
  type: string;
  duration_minutes: number;
  calories_burned?: number;
  exercises?: Exercise[];
  intensity?: Intensity;
  notes?: string;
  heart_rate_avg?: number;
  feeling?: Feeling;
}

export interface Exercise {
  name: string;
  sets?: number;
  reps?: number;
  weight_kg?: number;
  duration_seconds?: number;
}

export interface MealLog {
  date: string;
  meal_type: MealType;
  description: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  photo_analyzed?: boolean;
  notes?: string;
}

export interface BodyMeasurement {
  date: string;
  weight_kg?: number;
  body_fat_percentage?: number;
  muscle_mass_kg?: number;
  waist_cm?: number;
  chest_cm?: number;
  hips_cm?: number;
  arms_cm?: number;
  thighs_cm?: number;
  notes?: string;
}

// ─── Enums / Literal Types ───────────────────────────────────────────────────

export type FitnessGoal =
  | 'weight_loss'
  | 'muscle_gain'
  | 'maintenance'
  | 'endurance'
  | 'strength'
  | 'flexibility'
  | 'general_health';

export type DietType =
  | 'omnivore'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'keto'
  | 'paleo'
  | 'mediterranean'
  | 'other';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type Intensity = 'low' | 'medium' | 'high';

export type Feeling = 'great' | 'good' | 'okay' | 'tired' | 'exhausted';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type AnalysisType =
  | 'body_composition'
  | 'exercise_form'
  | 'meal'
  | 'progress';

export type WorkoutFocus =
  | 'full_body'
  | 'upper_body'
  | 'lower_body'
  | 'core'
  | 'cardio'
  | 'hiit'
  | 'strength'
  | 'flexibility'
  | 'recovery';

export type PlanType = 'single_session' | 'weekly_plan' | 'monthly_plan';

export type MealPlanType = 'single_meal' | 'daily_plan' | 'weekly_plan';

export type MacroFocus =
  | 'balanced'
  | 'high_protein'
  | 'low_carb'
  | 'high_carb'
  | 'low_fat';

export type CoachingTopic =
  | 'general'
  | 'workout_optimization'
  | 'nutrition'
  | 'recovery'
  | 'motivation'
  | 'plateau'
  | 'injury_prevention'
  | 'sleep'
  | 'stress_management';

export type GoalType =
  | 'lose_fast'
  | 'lose_slow'
  | 'maintain'
  | 'gain_slow'
  | 'gain_fast';

// ─── Internal Types ──────────────────────────────────────────────────────────

export interface WorkoutStreak {
  current: number;
  best: number;
  lastDate: string;
}

export interface OnboardingQuestion {
  field: string;
  question: string;
  type: 'choice' | 'number' | 'boolean' | 'text_array';
  options?: string[];
}

export interface QuestionWithCategory {
  field: string;
  question: string;
  category: string;
}
