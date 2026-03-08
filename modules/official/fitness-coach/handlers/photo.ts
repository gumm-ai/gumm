/**
 * Photo analysis handler for the Fitness Coach module
 */

import type { ModuleContext } from '../../../../back/utils/brain';
import { getProfile } from '../utils';
import { getPhotoAnalysisGuide } from '../prompts';

// ─── Analyze Photo ───────────────────────────────────────────────────────────

export async function handleAnalyzePhoto(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  const { analysis_type, context, exercise_name } = args;

  // Get user profile for context
  const profile = ctx ? await getProfile(ctx) : null;

  // Build analysis prompt based on type
  const analysisGuide = getPhotoAnalysisGuide(analysis_type, exercise_name);

  // Include profile context if available
  let profileContext = '';
  if (profile) {
    profileContext = `\n\nUser Profile Context:
- Goal: ${profile.primary_goal || 'Not specified'}
- Current weight: ${profile.weight_kg ? profile.weight_kg + ' kg' : 'Not specified'}
- Target weight: ${profile.target_weight_kg ? profile.target_weight_kg + ' kg' : 'Not specified'}
- Disabilities/Injuries: ${[...(profile.disabilities || []), ...(profile.injuries || [])].join(', ') || 'None reported'}
- Diet type: ${profile.diet_type || 'Not specified'}`;
  }

  // Note: The actual image analysis is done by the LLM which has vision capability.
  // This tool prepares the analysis framework and returns instructions for the LLM.
  return JSON.stringify({
    status: 'ready_for_analysis',
    analysis_type,
    context: context || '',
    analysis_guide: analysisGuide + profileContext,
    instructions:
      'Please analyze the photo provided by the user using the guide above. Be specific, actionable, and encouraging. If this is for exercise form, prioritize safety.',
  });
}
