/**
 * POST /api/commands/improve
 *
 * Uses AI to improve a command's short description and description.
 * Makes them more detailed, better formatted, concise, and well-structured.
 * Body: { name, shortDescription, description }
 */
import { getLLMConfig, callLLM } from '../../utils/llm-provider';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    name: string;
    shortDescription: string;
    description: string;
  }>(event);

  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, message: 'Command name is required' });
  }

  const brain = useBrain();
  await brain.ready();

  let llmConfig;
  try {
    llmConfig = await getLLMConfig(brain);
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }

  const prompt = `You are an expert technical writer. Improve the following command documentation.

COMMAND: /${body.name.trim()}
SHORT DESCRIPTION (current): ${body.shortDescription?.trim() || '(empty)'}
DETAILED DESCRIPTION (current): ${body.description?.trim() || '(empty)'}

REQUIREMENTS:
1. SHORT DESCRIPTION: Make it concise (max 80 chars), action-oriented, clear. Start with a verb.
2. DETAILED DESCRIPTION: 
   - Add context about when/why to use this command
   - Include usage examples if applicable
   - Structure with bullet points or sections if needed
   - Keep it practical and user-focused
   - Don't be too verbose - aim for clarity over length

Respond ONLY with valid JSON in this exact format:
{
  "shortDescription": "improved short description here",
  "description": "improved detailed description here"
}`;

  try {
    const response = await callLLM(llmConfig, {
      messages: [
        {
          role: 'system',
          content: 'You are a technical writer. Respond only with valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices?.[0]?.message?.content || '';

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const improved = JSON.parse(jsonStr);

    if (!improved.shortDescription || !improved.description) {
      throw new Error('Invalid AI response format');
    }

    return {
      shortDescription: improved.shortDescription.slice(0, 100),
      description: improved.description,
    };
  } catch (err: any) {
    console.error('[Commands/Improve] AI error:', err);
    throw createError({
      statusCode: 500,
      message: 'Failed to improve descriptions. Please try again.',
    });
  }
});
