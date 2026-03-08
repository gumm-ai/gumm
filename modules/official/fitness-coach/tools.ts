/**
 * Tool definitions for the Fitness Coach module
 */

import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    // ─── Photo Analysis ────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fitness_analyze_photo',
        description: `Analyze a fitness-related photo. This tool processes images of:
- Body composition: Estimate body fat %, muscle definition, posture issues
- Exercise form: Check technique, identify corrections needed, safety concerns
- Meals/food: Estimate calories, macros, portion sizes, nutritional value
- Progress photos: Compare with previous photos if available

The photo must be provided as a base64 data URL or a URL accessible to the assistant.
Returns detailed analysis with actionable advice.`,
        parameters: {
          type: 'object',
          properties: {
            analysis_type: {
              type: 'string',
              enum: ['body_composition', 'exercise_form', 'meal', 'progress'],
              description: 'Type of analysis to perform on the photo',
            },
            context: {
              type: 'string',
              description:
                'Additional context about the photo (e.g., "deadlift from the side", "my lunch today", "front relaxed pose")',
            },
            exercise_name: {
              type: 'string',
              description:
                'For exercise_form analysis: name of the exercise being performed',
            },
          },
          required: ['analysis_type'],
        },
      },
    },

    // ─── Profile Management ────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fitness_get_profile',
        description: `Get the user's complete fitness profile including:
- Physical stats (height, weight, body fat, age, sex)
- Goals (weight loss, muscle gain, etc.)
- Constraints (disabilities, injuries, medical conditions)
- Available equipment and gym access
- Diet preferences and restrictions
- Lifestyle factors (activity level, sleep, stress)

Returns the full profile or a message if not yet configured.`,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fitness_update_profile',
        description: `Update the user's fitness profile. Can update any combination of fields:
- Basic: sex, age, height_cm, weight_kg, body_fat_percentage
- Goals: primary_goal, target_weight_kg, weekly_workout_days
- Constraints: disabilities, injuries, medical_conditions, can_run, can_jump, can_lift_heavy
- Equipment: equipment (array), gym_access, pool_access, outdoor_space
- Diet: diet_type, allergies, food_dislikes, daily_calorie_target, meals_per_day
- Lifestyle: activity_level, sleep_hours, stress_level, work_schedule, available_workout_time_minutes

Only provided fields are updated; others remain unchanged.`,
        parameters: {
          type: 'object',
          properties: {
            sex: {
              type: 'string',
              enum: ['male', 'female', 'other'],
            },
            age: { type: 'number', description: 'Age in years' },
            height_cm: { type: 'number', description: 'Height in centimeters' },
            weight_kg: {
              type: 'number',
              description: 'Current weight in kilograms',
            },
            body_fat_percentage: {
              type: 'number',
              description: 'Body fat percentage (0-100)',
            },
            primary_goal: {
              type: 'string',
              enum: [
                'weight_loss',
                'muscle_gain',
                'maintenance',
                'endurance',
                'strength',
                'flexibility',
                'general_health',
              ],
            },
            target_weight_kg: {
              type: 'number',
              description: 'Target weight in kg',
            },
            weekly_workout_days: {
              type: 'number',
              description:
                'How many days per week available for workouts (1-7)',
            },
            disabilities: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of disabilities to accommodate',
            },
            injuries: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Current injuries (e.g., "lower back pain", "tennis elbow")',
            },
            medical_conditions: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Medical conditions (e.g., "hypertension", "diabetes type 2")',
            },
            can_run: { type: 'boolean', description: 'Able to run/jog' },
            can_jump: {
              type: 'boolean',
              description: 'Able to do jumping exercises',
            },
            can_lift_heavy: {
              type: 'boolean',
              description: 'Able to lift heavy weights',
            },
            equipment: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Available equipment (e.g., "dumbbells", "barbell", "pull-up bar", "resistance bands", "treadmill")',
            },
            gym_access: { type: 'boolean', description: 'Has gym membership' },
            pool_access: { type: 'boolean', description: 'Has pool access' },
            outdoor_space: {
              type: 'boolean',
              description: 'Has outdoor space for exercise',
            },
            diet_type: {
              type: 'string',
              enum: [
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
            allergies: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Food allergies (e.g., "peanuts", "gluten", "lactose")',
            },
            food_dislikes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Foods the user dislikes',
            },
            daily_calorie_target: {
              type: 'number',
              description: 'Daily calorie goal',
            },
            meals_per_day: {
              type: 'number',
              description: 'Preferred number of meals per day',
            },
            activity_level: {
              type: 'string',
              enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
              description: 'Daily activity level outside of workouts',
            },
            sleep_hours: {
              type: 'number',
              description: 'Average hours of sleep per night',
            },
            stress_level: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
            },
            work_schedule: {
              type: 'string',
              description:
                'Work schedule description (e.g., "9-5 office", "shift work", "freelance")',
            },
            available_workout_time_minutes: {
              type: 'number',
              description: 'Available time per workout session in minutes',
            },
          },
          required: [],
        },
      },
    },

    // ─── Workout Planning ──────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fitness_generate_workout',
        description: `Generate a personalized workout plan based on the user's profile.
Considers: available equipment, disabilities/injuries, goals, time constraints, fitness level.
Can generate a single session or a weekly plan.

Returns a detailed workout with exercises, sets, reps, rest times, and coaching cues.
Automatically adapts to the user's constraints and available equipment.`,
        parameters: {
          type: 'object',
          properties: {
            plan_type: {
              type: 'string',
              enum: ['single_session', 'weekly_plan', 'monthly_plan'],
              description: 'Type of plan to generate',
            },
            focus: {
              type: 'string',
              enum: [
                'full_body',
                'upper_body',
                'lower_body',
                'core',
                'cardio',
                'hiit',
                'strength',
                'flexibility',
                'recovery',
              ],
              description: 'Focus area for the workout',
            },
            duration_minutes: {
              type: 'number',
              description:
                'Target duration in minutes (overrides profile default)',
            },
            intensity: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Desired intensity level',
            },
            specific_request: {
              type: 'string',
              description:
                'Any specific requests (e.g., "no equipment", "focus on glutes", "prepare for a 5K")',
            },
          },
          required: ['plan_type'],
        },
      },
    },

    // ─── Nutrition Planning ────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fitness_generate_meal_plan',
        description: `Generate a personalized nutrition plan based on the user's profile.
Considers: diet type, allergies, dislikes, calorie targets, macros, goals.
Can generate a single meal suggestion or full day/week plans.

Returns detailed meal suggestions with ingredients, portions, macros, and prep tips.
Adapts to the user's dietary restrictions and preferences.`,
        parameters: {
          type: 'object',
          properties: {
            plan_type: {
              type: 'string',
              enum: ['single_meal', 'daily_plan', 'weekly_plan'],
              description: 'Type of meal plan to generate',
            },
            meal_type: {
              type: 'string',
              enum: [
                'breakfast',
                'lunch',
                'dinner',
                'snack',
                'pre_workout',
                'post_workout',
              ],
              description: 'For single_meal: which meal to plan',
            },
            calorie_target: {
              type: 'number',
              description: 'Override daily calorie target',
            },
            macro_focus: {
              type: 'string',
              enum: [
                'balanced',
                'high_protein',
                'low_carb',
                'high_carb',
                'low_fat',
              ],
              description: 'Macro distribution preference',
            },
            specific_request: {
              type: 'string',
              description:
                'Specific requests (e.g., "quick recipes under 15 min", "meal prep friendly", "budget conscious")',
            },
          },
          required: ['plan_type'],
        },
      },
    },

    // ─── Logging ───────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fitness_log_workout',
        description: `Log a completed workout session. Stores in user's workout history for progress tracking.
Can log general workout info or detailed exercise-by-exercise breakdown.`,
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description:
                'Type of workout (e.g., "strength training", "running", "yoga", "HIIT", "swimming")',
            },
            duration_minutes: {
              type: 'number',
              description: 'Total duration in minutes',
            },
            calories_burned: {
              type: 'number',
              description: 'Estimated calories burned (optional)',
            },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  sets: { type: 'number' },
                  reps: { type: 'number' },
                  weight_kg: { type: 'number' },
                  duration_seconds: { type: 'number' },
                },
              },
              description: 'Detailed exercise breakdown (optional)',
            },
            intensity: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
            },
            feeling: {
              type: 'string',
              enum: ['great', 'good', 'okay', 'tired', 'exhausted'],
              description: 'How the user felt during/after',
            },
            notes: {
              type: 'string',
              description: 'Additional notes about the workout',
            },
            date: {
              type: 'string',
              description: 'Date of workout (YYYY-MM-DD). Defaults to today.',
            },
          },
          required: ['type', 'duration_minutes'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fitness_log_meal',
        description: `Log a meal for nutrition tracking. Stores in user's meal history.
Can estimate calories/macros from description or accept provided values.`,
        parameters: {
          type: 'object',
          properties: {
            meal_type: {
              type: 'string',
              enum: ['breakfast', 'lunch', 'dinner', 'snack'],
            },
            description: {
              type: 'string',
              description: 'Description of what was eaten',
            },
            calories: {
              type: 'number',
              description: 'Total calories (optional, can be estimated)',
            },
            protein_g: { type: 'number', description: 'Protein in grams' },
            carbs_g: { type: 'number', description: 'Carbs in grams' },
            fat_g: { type: 'number', description: 'Fat in grams' },
            notes: { type: 'string', description: 'Additional notes' },
            date: {
              type: 'string',
              description: 'Date of meal (YYYY-MM-DD). Defaults to today.',
            },
          },
          required: ['meal_type', 'description'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fitness_log_measurement',
        description: `Log body measurements for progress tracking.
Can log weight, body fat, and various body measurements.`,
        parameters: {
          type: 'object',
          properties: {
            weight_kg: { type: 'number', description: 'Weight in kilograms' },
            body_fat_percentage: {
              type: 'number',
              description: 'Body fat percentage',
            },
            waist_cm: {
              type: 'number',
              description: 'Waist circumference in cm',
            },
            chest_cm: {
              type: 'number',
              description: 'Chest circumference in cm',
            },
            hips_cm: { type: 'number', description: 'Hip circumference in cm' },
            arms_cm: { type: 'number', description: 'Arm circumference in cm' },
            thighs_cm: {
              type: 'number',
              description: 'Thigh circumference in cm',
            },
            notes: { type: 'string', description: 'Additional notes' },
            date: {
              type: 'string',
              description:
                'Date of measurement (YYYY-MM-DD). Defaults to today.',
            },
          },
          required: [],
        },
      },
    },

    // ─── Progress & Analytics ──────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fitness_get_progress',
        description: `Get progress summary and analytics. Shows:
- Weight trend over time
- Workout frequency and consistency
- Calorie/macro averages
- Body measurement changes
- Goal progress percentage

Can show daily, weekly, or monthly summaries.`,
        parameters: {
          type: 'object',
          properties: {
            period: {
              type: 'string',
              enum: ['week', 'month', '3months', 'year', 'all'],
              description: 'Time period to analyze',
            },
            focus: {
              type: 'string',
              enum: [
                'overview',
                'weight',
                'workouts',
                'nutrition',
                'measurements',
              ],
              description: 'What aspect to focus on',
            },
          },
          required: ['period'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fitness_get_workout_history',
        description: `Get the user's workout history. Returns logged workouts with details.`,
        parameters: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Number of days to look back (default: 30)',
            },
            workout_type: {
              type: 'string',
              description: 'Filter by workout type',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fitness_get_meal_history',
        description: `Get the user's meal/nutrition history. Returns logged meals with macros.`,
        parameters: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Number of days to look back (default: 7)',
            },
          },
          required: [],
        },
      },
    },

    // ─── Coaching Advice ───────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fitness_get_coaching_advice',
        description: `Get personalized coaching advice based on the user's profile and recent activity.
The coach analyzes patterns, identifies areas for improvement, and provides actionable recommendations.

Topics: workout optimization, nutrition adjustments, recovery, motivation, plateau breaking, injury prevention.`,
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              enum: [
                'general',
                'workout_optimization',
                'nutrition',
                'recovery',
                'motivation',
                'plateau',
                'injury_prevention',
                'sleep',
                'stress_management',
              ],
              description: 'Specific topic for advice',
            },
            specific_question: {
              type: 'string',
              description: 'Specific question or concern to address',
            },
          },
          required: [],
        },
      },
    },

    // ─── Onboarding ───────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fitness_start_setup',
        description: `Start the fitness profile setup process. Call this when:
- The user activates the fitness module for the first time
- The user wants to set up or update their fitness profile
- Any fitness tool returns that the profile is incomplete

Returns a series of questions to ask the user via Telegram (or chat) to collect their profile information.
The questions are personalized based on what information is already known vs missing.

AFTER calling this tool, you MUST send the questions to the user via send_telegram_message and wait for their answers.`,
        parameters: {
          type: 'object',
          properties: {
            force_full_setup: {
              type: 'boolean',
              description:
                'If true, asks all questions even if some data already exists',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fitness_check_profile_complete',
        description: `Check if the user's fitness profile has enough information to provide personalized coaching.
Returns which essential fields are missing and whether onboarding is needed.
Call this before generating workouts or meal plans to ensure you have enough user data.`,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },

    // ─── Calorie Calculator ────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fitness_calculate_calories',
        description: `Calculate recommended daily calories based on user profile and goals.
Returns BMR (Basal Metabolic Rate), TDEE (Total Daily Energy Expenditure), and goal-adjusted calories.
Also provides macro recommendations (protein, carbs, fat).`,
        parameters: {
          type: 'object',
          properties: {
            override_weight_kg: {
              type: 'number',
              description: 'Override profile weight for calculation',
            },
            override_activity: {
              type: 'string',
              enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
              description: 'Override activity level',
            },
            goal_type: {
              type: 'string',
              enum: [
                'lose_fast',
                'lose_slow',
                'maintain',
                'gain_slow',
                'gain_fast',
              ],
              description:
                'Goal type (lose_fast: -750cal, lose_slow: -300cal, maintain: 0, gain_slow: +250cal, gain_fast: +500cal)',
            },
          },
          required: [],
        },
      },
    },
  ];
}
