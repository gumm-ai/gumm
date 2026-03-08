/**
 * Prompt builders for the Fitness Coach module
 */

// ─── Workout Prompt ──────────────────────────────────────────────────────────

export function buildWorkoutPrompt(params: Record<string, any>): string {
  const lines = [
    `Generate a ${params.plan_type.replace('_', ' ')} workout plan.`,
    `Focus: ${params.focus}`,
    `Duration: ${params.duration} minutes`,
    `Intensity: ${params.intensity}`,
    `Goal: ${params.goal}`,
    `Fitness level: ${params.fitness_level}`,
  ];

  if (params.equipment?.length) {
    lines.push(`Available equipment: ${params.equipment.join(', ')}`);
  } else {
    lines.push('Equipment: Bodyweight only (no equipment)');
  }

  if (params.gym_access) {
    lines.push('Has gym access with full equipment');
  }

  const constraints = [];
  if (!params.constraints.can_run) constraints.push('Cannot run');
  if (!params.constraints.can_jump)
    constraints.push('Cannot do jumping exercises');
  if (!params.constraints.can_lift_heavy)
    constraints.push('Cannot lift heavy weights');
  if (params.constraints.disabilities?.length)
    constraints.push(
      `Disabilities: ${params.constraints.disabilities.join(', ')}`,
    );
  if (params.constraints.injuries?.length)
    constraints.push(
      `Current injuries: ${params.constraints.injuries.join(', ')}`,
    );

  if (constraints.length) {
    lines.push(`IMPORTANT CONSTRAINTS: ${constraints.join('; ')}`);
  }

  if (params.specific_request) {
    lines.push(`Specific request: ${params.specific_request}`);
  }

  return lines.join('\n');
}

// ─── Meal Plan Prompt ────────────────────────────────────────────────────────

export function buildMealPlanPrompt(params: Record<string, any>): string {
  const lines = [
    `Generate a ${params.plan_type.replace('_', ' ')}.`,
    `Target calories: ${params.calorie_target} kcal/day`,
    `Macro focus: ${params.macro_focus}`,
    `Diet type: ${params.diet_type}`,
    `Meals per day: ${params.meals_per_day}`,
    `Goal: ${params.goal}`,
  ];

  if (params.meal_type) {
    lines.push(`Meal type: ${params.meal_type}`);
  }

  if (params.allergies?.length) {
    lines.push(`ALLERGIES (MUST AVOID): ${params.allergies.join(', ')}`);
  }

  if (params.dislikes?.length) {
    lines.push(
      `Food dislikes (avoid if possible): ${params.dislikes.join(', ')}`,
    );
  }

  if (params.specific_request) {
    lines.push(`Specific request: ${params.specific_request}`);
  }

  return lines.join('\n');
}

// ─── Coaching Prompt ─────────────────────────────────────────────────────────

export function buildCoachingPrompt(context: Record<string, any>): string {
  const lines = ['Provide coaching advice on: ' + context.topic];

  if (context.profile_summary) {
    lines.push('\nUser profile:');
    lines.push(`- Goal: ${context.profile_summary.goal || 'Not set'}`);
    lines.push(
      `- Weight: ${context.profile_summary.weight ? context.profile_summary.weight + ' kg' : 'Not set'}`,
    );
    lines.push(
      `- Target: ${context.profile_summary.target ? context.profile_summary.target + ' kg' : 'Not set'}`,
    );
    lines.push(
      `- Activity level: ${context.profile_summary.activity_level || 'Not set'}`,
    );
    if (context.profile_summary.constraints?.length) {
      lines.push(
        `- Constraints: ${context.profile_summary.constraints.join(', ')}`,
      );
    }
    if (context.profile_summary.equipment?.length) {
      lines.push(
        `- Equipment: ${context.profile_summary.equipment.join(', ')}`,
      );
    }
  }

  lines.push('\nRecent activity:');
  lines.push(
    `- Workouts (last 2 weeks): ${context.recent_activity.workouts_last_2_weeks}`,
  );
  if (context.recent_activity.workout_types?.length) {
    lines.push(
      `- Workout types: ${context.recent_activity.workout_types.join(', ')}`,
    );
  }
  lines.push(
    `- Avg workout duration: ${context.recent_activity.avg_workout_duration} min`,
  );
  lines.push(
    `- Meals logged (last week): ${context.recent_activity.meals_logged_last_week}`,
  );

  if (context.specific_question) {
    lines.push(`\nSpecific question: ${context.specific_question}`);
  }

  return lines.join('\n');
}

// ─── Photo Analysis Guides ───────────────────────────────────────────────────

export function getPhotoAnalysisGuide(
  analysis_type: string,
  exercise_name?: string,
): string {
  switch (analysis_type) {
    case 'body_composition':
      return `Analyze this body composition photo. Provide:
1. Estimated body fat percentage range
2. Visible muscle development assessment
3. Posture observations
4. Symmetry notes
5. Areas of strength and areas for improvement
6. Specific recommendations based on what you see`;

    case 'exercise_form':
      return `Analyze the exercise form in this photo${exercise_name ? ` (${exercise_name})` : ''}.
Check for:
1. Joint alignment and positioning
2. Spine neutrality (if applicable)
3. Weight distribution
4. Common form errors for this movement
5. Safety concerns
6. Specific corrections with clear instructions
7. Cues to improve the movement`;

    case 'meal':
      return `Analyze this meal photo and provide:
1. Identified foods and estimated portions
2. Estimated total calories
3. Estimated macros (protein, carbs, fat)
4. Nutritional highlights (good aspects)
5. Suggestions for improvement
6. How this fits into a balanced diet`;

    case 'progress':
      return `Analyze this progress photo. Note:
1. Visible changes in body composition
2. Areas showing improvement
3. Areas that may need more focus
4. Overall assessment of progress
5. Recommendations for continued improvement`;

    default:
      return '';
  }
}
