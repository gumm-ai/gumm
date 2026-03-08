/**
 * Constants for the Fitness Coach module
 */

import type { OnboardingQuestion } from './types';

// ─── Onboarding Questions ────────────────────────────────────────────────────

export const ONBOARDING_QUESTIONS: Record<string, OnboardingQuestion[]> = {
  essential: [
    {
      field: 'sex',
      question:
        'First, are you male, female, or other? (This affects calorie calculations)',
      type: 'choice',
      options: ['male', 'female', 'other'],
    },
    {
      field: 'age',
      question: 'How old are you?',
      type: 'number',
    },
    {
      field: 'height_cm',
      question: "What's your height? (in cm, e.g., 175)",
      type: 'number',
    },
    {
      field: 'weight_kg',
      question: "What's your current weight? (in kg)",
      type: 'number',
    },
    {
      field: 'primary_goal',
      question:
        "What's your main fitness goal?\n• weight_loss - Lose fat\n• muscle_gain - Build muscle\n• maintenance - Stay in shape\n• endurance - Improve cardio\n• strength - Get stronger\n• flexibility - Improve mobility\n• general_health - Overall wellness",
      type: 'choice',
      options: [
        'weight_loss',
        'muscle_gain',
        'maintenance',
        'endurance',
        'strength',
        'flexibility',
        'general_health',
      ],
    },
  ],
  constraints: [
    {
      field: 'disabilities',
      question:
        "Do you have any disabilities or physical limitations I should know about? (Just say 'none' if not)",
      type: 'text_array',
    },
    {
      field: 'injuries',
      question:
        "Any current injuries? (e.g., 'lower back pain', 'bad knees' - or 'none')",
      type: 'text_array',
    },
    {
      field: 'can_run',
      question: 'Are you able to run/jog? (yes/no)',
      type: 'boolean',
    },
    {
      field: 'can_jump',
      question:
        'Can you do jumping exercises (jump squats, burpees...)? (yes/no)',
      type: 'boolean',
    },
  ],
  equipment: [
    {
      field: 'equipment',
      question:
        "What fitness equipment do you have access to? (e.g., dumbbells, barbell, pull-up bar, resistance bands, treadmill - or 'none' for bodyweight only)",
      type: 'text_array',
    },
    {
      field: 'gym_access',
      question: 'Do you have a gym membership? (yes/no)',
      type: 'boolean',
    },
  ],
  diet: [
    {
      field: 'diet_type',
      question:
        "What's your diet type?\n• omnivore (eat everything)\n• vegetarian\n• vegan\n• pescatarian (fish + veggies)\n• keto\n• other",
      type: 'choice',
      options: [
        'omnivore',
        'vegetarian',
        'vegan',
        'pescatarian',
        'keto',
        'paleo',
        'mediterranean',
        'other',
      ],
    },
    {
      field: 'allergies',
      question:
        "Any food allergies? (e.g., peanuts, gluten, lactose - or 'none')",
      type: 'text_array',
    },
  ],
  lifestyle: [
    {
      field: 'activity_level',
      question:
        'How would you describe your daily activity level (outside of workouts)?\n• sedentary - Desk job, little movement\n• light - Some walking\n• moderate - On your feet often\n• active - Physical job\n• very_active - Very physical job',
      type: 'choice',
      options: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
    },
    {
      field: 'weekly_workout_days',
      question: 'How many days per week can you dedicate to working out? (1-7)',
      type: 'number',
    },
    {
      field: 'available_workout_time_minutes',
      question:
        'How much time do you have for each workout session? (in minutes, e.g., 30, 45, 60)',
      type: 'number',
    },
  ],
};

// ─── Essential Fields ────────────────────────────────────────────────────────

export const ESSENTIAL_FIELDS = [
  'sex',
  'age',
  'height_cm',
  'weight_kg',
  'primary_goal',
] as const;

export const RECOMMENDED_FIELDS = [
  'activity_level',
  'equipment',
  'diet_type',
  'weekly_workout_days',
] as const;

// ─── Calorie Adjustments ─────────────────────────────────────────────────────

export const CALORIE_ADJUSTMENTS: Record<string, number> = {
  lose_fast: -750,
  lose_slow: -300,
  maintain: 0,
  gain_slow: 250,
  gain_fast: 500,
};

// ─── Activity Multipliers (TDEE) ─────────────────────────────────────────────

export const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// ─── Protein Targets ─────────────────────────────────────────────────────────

export const PROTEIN_PER_KG: Record<string, number> = {
  muscle_gain: 2.0,
  weight_loss: 1.8,
  default: 1.6,
};
