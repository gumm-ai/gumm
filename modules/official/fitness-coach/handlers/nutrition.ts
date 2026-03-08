/**
 * Nutrition handlers for the Fitness Coach module
 */

import type { ModuleContext } from '../../../../back/utils/brain';
import type { MealLog } from '../types';
import { CALORIE_ADJUSTMENTS, PROTEIN_PER_KG } from '../constants';
import {
  getProfile,
  formatDate,
  calculateBMR,
  calculateTDEE,
  getDaysWithMeals,
} from '../utils';
import { buildMealPlanPrompt } from '../prompts';

// ─── Generate Meal Plan ──────────────────────────────────────────────────────

export async function handleGenerateMealPlan(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  const {
    plan_type,
    meal_type,
    calorie_target,
    macro_focus,
    specific_request,
  } = args;

  // Get user profile
  const profile = ctx ? await getProfile(ctx) : null;

  // Check if profile has minimum required info for calorie calculation
  const hasMinimumInfo =
    profile?.sex && profile?.age && profile?.height_cm && profile?.weight_kg;
  if (!hasMinimumInfo && !calorie_target) {
    return JSON.stringify({
      status: 'profile_incomplete',
      message:
        'I need to know your basic stats to calculate your calorie needs and create a personalized nutrition plan.',
      missing_info: {
        sex: !profile?.sex,
        age: !profile?.age,
        height_cm: !profile?.height_cm,
        weight_kg: !profile?.weight_kg,
      },
      action:
        'Please run fitness_start_setup first and send the onboarding questions via Telegram. This will let me calculate your BMR/TDEE and give you accurate recommendations.',
      alternative:
        'If you provide a specific calorie_target in the request, I can work with that instead.',
    });
  }

  // Calculate calorie needs if not specified
  let targetCalories = calorie_target || profile?.daily_calorie_target;
  if (
    !targetCalories &&
    profile?.weight_kg &&
    profile?.height_cm &&
    profile?.age &&
    profile?.sex
  ) {
    const bmr = calculateBMR(
      profile.weight_kg,
      profile.height_cm,
      profile.age,
      profile.sex,
    );
    targetCalories = calculateTDEE(bmr, profile.activity_level || 'moderate');

    // Adjust for goal
    if (profile.primary_goal === 'weight_loss') targetCalories -= 500;
    else if (profile.primary_goal === 'muscle_gain') targetCalories += 300;
  }

  const params = {
    plan_type,
    meal_type: meal_type || undefined,
    calorie_target: targetCalories || 2000,
    macro_focus: macro_focus || 'balanced',
    diet_type: profile?.diet_type || 'omnivore',
    allergies: profile?.allergies || [],
    dislikes: profile?.food_dislikes || [],
    meals_per_day: profile?.meals_per_day || 3,
    goal: profile?.primary_goal || 'maintenance',
    specific_request,
  };

  const prompt = buildMealPlanPrompt(params);

  return JSON.stringify({
    status: 'generate_meal_plan',
    parameters: params,
    generation_prompt: prompt,
    instructions:
      'Generate a detailed meal plan following the parameters. Include ingredients, portions, estimated macros, and simple prep instructions. Respect all dietary restrictions.',
  });
}

// ─── Log Meal ────────────────────────────────────────────────────────────────

export async function handleLogMeal(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({ error: 'Context not available for logging.' });
  }

  const meal: MealLog = {
    date: args.date || formatDate(),
    meal_type: args.meal_type,
    description: args.description,
    calories: args.calories,
    protein_g: args.protein_g,
    carbs_g: args.carbs_g,
    fat_g: args.fat_g,
    notes: args.notes,
  };

  await ctx.storage.store('meal_log', meal);

  return JSON.stringify({
    status: 'logged',
    message: `${meal.meal_type} logged: ${meal.description}`,
    meal,
    tip: !meal.calories
      ? 'Tip: You can also provide calories and macros for better tracking accuracy.'
      : undefined,
  });
}

// ─── Get Meal History ────────────────────────────────────────────────────────

export async function handleGetMealHistory(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({ error: 'Context not available.' });
  }

  const days = args.days || 7;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const meals = await ctx.storage.list('meal_log', { since, limit: 100 });
  const data = meals.map((m) => m.value as MealLog);

  // Group by day
  const byDay: Record<string, MealLog[]> = {};
  for (const meal of data) {
    if (!byDay[meal.date]) byDay[meal.date] = [];
    byDay[meal.date]!.push(meal);
  }

  // Calculate daily totals
  const dailyTotals = Object.entries(byDay).map(([date, dayMeals]) => ({
    date,
    meals: dayMeals.length,
    total_calories: dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0),
    total_protein: dayMeals.reduce((sum, m) => sum + (m.protein_g || 0), 0),
    total_carbs: dayMeals.reduce((sum, m) => sum + (m.carbs_g || 0), 0),
    total_fat: dayMeals.reduce((sum, m) => sum + (m.fat_g || 0), 0),
  }));

  return JSON.stringify({
    period_days: days,
    total_meals: data.length,
    daily_totals: dailyTotals,
    meals: data,
  });
}

// ─── Calculate Calories ──────────────────────────────────────────────────────

export async function handleCalculateCalories(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  const profile = ctx ? await getProfile(ctx) : null;

  const weight = args.override_weight_kg || profile?.weight_kg;
  const height = profile?.height_cm;
  const age = profile?.age;
  const sex = profile?.sex;
  const activity =
    args.override_activity || profile?.activity_level || 'moderate';
  const goalType = args.goal_type || 'maintain';

  if (!weight || !height || !age || !sex) {
    return JSON.stringify({
      error: 'Missing required data',
      message:
        'Need weight_kg, height_cm, age, and sex in profile to calculate calories. Use fitness_update_profile first.',
      missing: {
        weight: !weight,
        height: !height,
        age: !age,
        sex: !sex,
      },
    });
  }

  const bmr = calculateBMR(weight, height, age, sex);
  const tdee = calculateTDEE(bmr, activity);

  // Adjust for goal
  const adjustment = CALORIE_ADJUSTMENTS[goalType] || 0;
  const targetCalories = tdee + adjustment;

  // Calculate macros (balanced approach)
  let proteinPerKg = 1.6; // default
  if (profile?.primary_goal === 'muscle_gain') {
    proteinPerKg = PROTEIN_PER_KG.muscle_gain ?? 2.0;
  } else if (profile?.primary_goal === 'weight_loss') {
    proteinPerKg = PROTEIN_PER_KG.weight_loss ?? 1.8;
  }
  const protein_g = Math.round(weight * proteinPerKg);
  const fat_g = Math.round((targetCalories * 0.25) / 9);
  const carbs_g = Math.round((targetCalories - protein_g * 4 - fat_g * 9) / 4);

  return JSON.stringify({
    calculations: {
      bmr,
      bmr_explanation:
        'Basal Metabolic Rate - calories burned at complete rest',
      tdee,
      tdee_explanation:
        'Total Daily Energy Expenditure - calories burned with activity',
      activity_level: activity,
      goal_adjustment: adjustment,
      target_calories: targetCalories,
    },
    macros: {
      protein_g,
      protein_calories: protein_g * 4,
      carbs_g,
      carbs_calories: carbs_g * 4,
      fat_g,
      fat_calories: fat_g * 9,
      protein_per_meal:
        profile?.meals_per_day && profile.meals_per_day > 0
          ? Math.round(protein_g / profile.meals_per_day)
          : Math.round(protein_g / 3),
    },
    goal: goalType,
    weekly_change_kg: goalType.includes('lose')
      ? Number(((adjustment * 7) / 7700).toFixed(2))
      : goalType.includes('gain')
        ? Number(((adjustment * 7) / 7700).toFixed(2))
        : 0,
  });
}
