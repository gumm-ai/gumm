/**
 * POST /api/jobs/improve
 *
 * Uses AI to improve a job's description/prompt.
 * Body: { title, prompt }
 */
import { getLLMConfig, callLLM } from '../../utils/llm-provider';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{ title: string; prompt: string }>(event);

  if (!body?.title?.trim() && !body?.prompt?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Title or prompt is required',
    });
  }

  const brain = useBrain();
  await brain.ready();

  let llmConfig;
  try {
    llmConfig = await getLLMConfig(brain);
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message });
  }

  const userPrompt = `You are an expert at writing clear, detailed task descriptions for an AI agent.

TASK TITLE: ${body.title?.trim() || '(empty)'}
CURRENT DESCRIPTION: ${body.prompt?.trim() || '(empty)'}

REQUIREMENTS:
1. Improve the task description to be more precise, structured, and actionable for an AI agent.
2. Add specific steps, expected outputs, or constraints if relevant.
3. Keep it practical — don't add unnecessary fluff.
4. If the current description is vague, infer likely intent from the title and expand on it.
5. Keep the same language as the original (if it's in French, keep it in French, etc.).

Respond ONLY with valid JSON in this exact format:
{
  "prompt": "the improved detailed task description here"
}`;

  try {
    const response = await callLLM(llmConfig, {
      messages: [
        {
          role: 'system',
          content:
            'You are a task description writer. Respond only with valid JSON.',
        },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = response.choices?.[0]?.message?.content || '';

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const improved = JSON.parse(jsonStr);

    if (!improved.prompt) {
      throw new Error('Invalid AI response format');
    }

    return { prompt: improved.prompt };
  } catch (err: any) {
    console.error('[Jobs/Improve] AI error:', err);
    throw createError({
      statusCode: 500,
      message: 'Failed to improve description. Please try again.',
    });
  }
});
