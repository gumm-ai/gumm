/**
 * Shared Telegram message handler.
 *
 * Processes a TelegramUpdate through the Brain pipeline.
 * Used by both the webhook endpoint (POST /api/telegram/webhook) and the
 * long-polling plugin so that the processing logic lives in one place.
 */
import type { TelegramUpdate } from './telegram';
import {
  telegramDownloadPhotoAsBase64,
  telegramDownloadAudioAsBase64,
  telegramDownloadFileToStorage,
  telegramSendMarkdown,
} from './telegram';
import {
  getBuiltinTools,
  executeBuiltinTool,
  type ChannelContext,
} from './builtin-tools';
import { eq, and } from 'drizzle-orm';
import {
  conversations,
  messages as messagesTable,
  commands,
  commandModules,
} from '../db/schema';
import { redactSecrets } from './secrets';
import { getLLMConfig, callLLM, getProviderDisplayName } from './llm-provider';
import { analyzeAndExtractMemories } from './auto-memory';
import { getConversationMessages } from './conversation-cache';

export async function processTelegramUpdate(
  update: TelegramUpdate,
): Promise<void> {
  // Ignore non-message updates
  if (
    !update?.message?.text &&
    !update?.message?.photo &&
    !update?.message?.voice &&
    !update?.message?.audio &&
    !update?.message?.document
  )
    return;

  const { message } = update;
  const chatId = message.chat.id;
  const hasPhoto = !!message.photo?.length;
  const hasVoice = !!message.voice;
  const hasAudio = !!message.audio;
  const hasDocument = !!message.document;
  const userText = (message.text || message.caption || '').trim();
  const userName = message.from.first_name || 'User';

  // ── Security: check allowed chat IDs ──────────────────────────────
  const token = await getTelegramToken();
  if (!token) {
    console.warn('[Telegram] No bot token configured');
    return;
  }

  const allowedChats = await getTelegramAllowedChats();
  if (allowedChats.length > 0 && !allowedChats.includes(chatId)) {
    console.warn(
      `[Telegram] Rejected message from unauthorized chat: ${chatId}`,
    );
    return;
  }

  // ── Handle /start command ─────────────────────────────────────────
  if (userText === '/start') {
    await telegramSendMessage(
      token,
      chatId,
      `👋 Hey ${userName}! I'm *${useBrain().identity.name}*.\n\nSend me any message and I'll think about it.\n\nYour chat ID: \`${chatId}\``,
    );
    return;
  }

  // ── Handle /chatid command ────────────────────────────────────────
  if (userText === '/chatid') {
    await telegramSendMessage(token, chatId, `Your chat ID: \`${chatId}\``);
    return;
  }

  // ── Handle /help command (list available commands) ────────────────
  if (userText === '/help') {
    const enabledCommands = await useDrizzle()
      .select()
      .from(commands)
      .where(eq(commands.enabled, true))
      .orderBy(commands.name);

    if (enabledCommands.length === 0) {
      await telegramSendMessage(
        token,
        chatId,
        '📋 *Available Commands*\n\n/start — Start the bot\n/chatid — Get your chat ID\n/help — Show this help\n\n_No custom commands configured._',
      );
    } else {
      const commandList = enabledCommands
        .map((c) => `/${c.name} — ${c.shortDescription}`)
        .join('\n');
      await telegramSendMessage(
        token,
        chatId,
        `📋 *Available Commands*\n\n/start — Start the bot\n/chatid — Get your chat ID\n/help — Show this help\n\n*Custom Commands:*\n${commandList}`,
      );
    }
    return;
  }

  // ── Handle custom slash commands ──────────────────────────────────
  if (userText.startsWith('/')) {
    const parts = userText.slice(1).split(/\s+/);
    const cmdName = parts[0];
    const cmdArgs = parts.slice(1).join(' ');

    if (cmdName && cmdName.length > 0) {
      const [cmd] = await useDrizzle()
        .select()
        .from(commands)
        .where(
          and(
            eq(commands.name, cmdName.toLowerCase()),
            eq(commands.enabled, true),
          ),
        )
        .limit(1);

      if (cmd) {
        // Replace the user text with an expanded prompt including the command description
        const expandedPrompt = `[Command: /${cmd.name}]\n\nCommand Description: ${cmd.description}\n\nUser Input: ${cmdArgs || '(no additional input)'}\n\nExecute this command according to its description.`;

        // Check for linked modules (scoped tool usage)
        const links = await useDrizzle()
          .select({ moduleId: commandModules.moduleId })
          .from(commandModules)
          .where(eq(commandModules.commandId, cmd.id));
        const linkedModuleIds =
          links.length > 0 ? links.map((l) => l.moduleId) : null;

        // Continue processing with the expanded prompt instead of raw command
        // We'll modify userText and let it flow through the normal AI pipeline
        await telegramSendChatAction(token, chatId).catch(() => {});

        // Process with expanded context
        const brain = useBrain();
        await brain.ready();

        const registry = useModuleRegistry();
        await registry.ready();
        const moduleTools = linkedModuleIds
          ? registry.getToolsForModules(linkedModuleIds)
          : registry.getAllTools();
        const tools = [...getBuiltinTools(), ...moduleTools];

        const drizzle = useDrizzle();
        const telegramConversationId = `telegram-${chatId}`;

        const existing = await drizzle
          .select()
          .from(conversations)
          .where(eq(conversations.id, telegramConversationId))
          .limit(1);
        const now = new Date();
        if (existing.length === 0) {
          await drizzle.insert(conversations).values({
            id: telegramConversationId,
            title: `Telegram — ${userName}`,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Persist the command invocation
        await drizzle.insert(messagesTable).values({
          id: crypto.randomUUID(),
          conversationId: telegramConversationId,
          role: 'user',
          content: `/${cmd.name} ${cmdArgs}`.trim(),
          createdAt: now,
        });

        // Fetch conversation history and prepare LLM messages with command context
        const historyRows = await getConversationMessages(
          telegramConversationId,
          50,
        );
        const conversationHistory = historyRows
          .slice(0, -1) // exclude the just-persisted message (we use expandedPrompt instead)
          .map((m) => ({ role: m.role, content: m.content }));
        conversationHistory.push({ role: 'user', content: expandedPrompt });
        const llmMessages: any[] =
          await brain.prepareMessages(conversationHistory);

        // Get LLM configuration
        let llmConfig;
        try {
          llmConfig = await getLLMConfig(brain);
        } catch (err: any) {
          await telegramSendMessage(token, chatId, `⚠️ ${err.message}`);
          return;
        }

        // Single LLM call for command execution
        const MAX_ITERATIONS = 10;
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const response = await callLLM(llmConfig, {
            messages: llmMessages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
          });

          const choice = response.choices?.[0];
          if (!choice) {
            await telegramSendMessage(token, chatId, '⚠️ No response from AI.');
            return;
          }

          const assistantMessage = choice.message;

          if (!assistantMessage.tool_calls?.length) {
            const content = assistantMessage.content || '...';

            await drizzle.insert(messagesTable).values({
              id: crypto.randomUUID(),
              conversationId: telegramConversationId,
              role: 'assistant',
              content,
              createdAt: new Date(),
            });

            await telegramSendMarkdown(token, chatId, content);
            return;
          }

          // Handle tool calls
          llmMessages.push({
            role: 'assistant',
            content: assistantMessage.content || null,
            tool_calls: assistantMessage.tool_calls,
          });

          const channelCtx: ChannelContext = {
            channel: 'telegram',
            chatId,
            conversationId: telegramConversationId,
          };

          for (const tc of assistantMessage.tool_calls) {
            const toolName = tc.function.name;
            let toolArgs: Record<string, any> = {};
            try {
              toolArgs = JSON.parse(tc.function.arguments || '{}');
            } catch {}

            let result: string;
            if (
              toolName.startsWith('memory_') ||
              toolName.startsWith('remind') ||
              toolName.startsWith('recurring_') ||
              toolName === 'save_secret' ||
              toolName.startsWith('telegram_') ||
              toolName.startsWith('storage_') ||
              toolName === 'agent_task' ||
              toolName === 'personal_fact_save'
            ) {
              const builtinResult = await executeBuiltinTool(
                toolName,
                toolArgs,
                channelCtx,
              );
              result = builtinResult ?? 'No result';
            } else {
              result = await registry.executeTool(toolName, toolArgs);
            }

            llmMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: result,
            });
          }
        }

        return;
      }
    }
    // If command not found, fall through to normal AI processing
  }

  // ── Send typing indicator ─────────────────────────────────────────
  await telegramSendChatAction(token, chatId).catch(() => {});

  // ── Route through Brain pipeline ──────────────────────────────────
  try {
    const brain = useBrain();
    await brain.ready();

    const registry = useModuleRegistry();
    await registry.ready();
    const tools = [...getBuiltinTools(), ...registry.getAllTools()];

    // ── Persist Telegram conversation ────────────────────────────────
    const drizzle = useDrizzle();
    const telegramConversationId = `telegram-${chatId}`;

    const existing = await drizzle
      .select()
      .from(conversations)
      .where(eq(conversations.id, telegramConversationId))
      .limit(1);
    const now = new Date();
    if (existing.length === 0) {
      await drizzle.insert(conversations).values({
        id: telegramConversationId,
        title: `Telegram — ${userName}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Persist user message
    await drizzle.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId: telegramConversationId,
      role: 'user',
      content: hasPhoto
        ? `[Photo] ${userText || '(no caption)'}`
        : hasVoice
          ? `[Voice message] ${userText || '(no caption)'}`
          : hasAudio
            ? `[Audio] ${userText || '(no caption)'}`
            : hasDocument
              ? `[Document: ${message.document!.file_name || 'file'}] ${userText || '(no caption)'}`
              : userText,
      createdAt: now,
    });

    // ── Automatic memory extraction (non-blocking) ──────────────────────
    // Analyze user message in background to extract personal facts automatically
    if (userText && userText.length > 10) {
      analyzeAndExtractMemories(userText, telegramConversationId).catch((err) =>
        console.warn('[AutoMemory] Background extraction failed:', err.message),
      );
    }

    // ── Save attachments to persistent storage ───────────────────────
    let storedAttachment: {
      storageKey: string;
      filename: string;
      mimeType: string;
      size: number;
    } | null = null;

    if (hasPhoto) {
      const best = message.photo!.reduce((a, b) =>
        a.width * a.height >= b.width * b.height ? a : b,
      );
      storedAttachment = await telegramDownloadFileToStorage(
        token,
        best.file_id,
        `photo_${Date.now()}.jpg`,
      );
    } else if (hasDocument) {
      storedAttachment = await telegramDownloadFileToStorage(
        token,
        message.document!.file_id,
        message.document!.file_name || `document_${Date.now()}`,
      );
    } else if (hasVoice) {
      storedAttachment = await telegramDownloadFileToStorage(
        token,
        message.voice!.file_id,
        `voice_${Date.now()}.ogg`,
      );
    } else if (hasAudio) {
      storedAttachment = await telegramDownloadFileToStorage(
        token,
        message.audio!.file_id,
        message.audio!.file_name || `audio_${Date.now()}.mp3`,
      );
    }

    // ── Secret redaction ────────────────────────────────────────────
    const { cleanMessage: sanitizedUserText, extractedSecrets } = redactSecrets(
      userText || 'What is this image?',
    );

    let secretSystemNote: string | null = null;
    if (extractedSecrets.length > 0) {
      secretSystemNote = [
        '[SYSTEM — SECRET EXTRACTION]',
        "The user's message contained [[double-bracket]] protected values.",
        'These sensitive values were stripped from the message and replaced with [REDACTED].',
        'Here are the extracted raw values (in order of appearance):',
        ...extractedSecrets.map((s, i) => `  ${i + 1}. ${s}`),
        '',
        'INSTRUCTIONS:',
        '- Use the save_secret tool to store each credential with the correct service, key, and value.',
        '- Determine the service name and key type (username, password, email, api_key, etc.) from context.',
        '- Set is_password=true for passwords, tokens, and highly sensitive secrets.',
        '- NEVER repeat the raw secret values in your response to the user.',
        '- Confirm to the user that their credentials have been securely saved locally.',
      ].join('\n');
    }

    // Fetch full conversation history so the LLM has context from previous messages
    const historyRows = await getConversationMessages(
      telegramConversationId,
      50,
    );
    const conversationHistory = historyRows
      .slice(0, -1) // exclude the just-persisted user message (we use sanitized version)
      .map((m) => ({ role: m.role, content: m.content }));
    conversationHistory.push({ role: 'user', content: sanitizedUserText });
    const llmMessages: any[] = await brain.prepareMessages(conversationHistory);

    if (secretSystemNote) {
      const insertIdx = llmMessages[0]?.role === 'system' ? 1 : 0;
      llmMessages.splice(insertIdx, 0, {
        role: 'system',
        content: secretSystemNote,
      });
    }

    const attachmentHint = storedAttachment
      ? `\n[File saved to storage: storageKey="${storedAttachment.storageKey}", filename="${storedAttachment.filename}", type="${storedAttachment.mimeType}", size=${Math.round(storedAttachment.size / 1024)} KB. You can use this storageKey with send_telegram_file or gmail_send_email attachments.]`
      : '';

    // ── Multi-modal: photo ──────────────────────────────────────────
    if (hasPhoto) {
      const base64Url = await telegramDownloadPhotoAsBase64(
        token,
        message.photo!,
      );
      if (base64Url) {
        for (let i = llmMessages.length - 1; i >= 0; i--) {
          if (llmMessages[i].role === 'user') {
            const textContent =
              (userText ||
                'The user sent a photo. Analyze it carefully. If it contains important information (names, dates, lists, documents, receipts, locations, etc.), use memory_remember to store the key facts.') +
              attachmentHint;
            llmMessages[i].content = [
              { type: 'text', text: textContent },
              { type: 'image_url', image_url: { url: base64Url } },
            ];
            break;
          }
        }
      }
    }

    // ── Multi-modal: document ───────────────────────────────────────
    if (hasDocument && storedAttachment) {
      for (let i = llmMessages.length - 1; i >= 0; i--) {
        if (llmMessages[i].role === 'user') {
          const textContent =
            (userText ||
              `The user sent a document: "${storedAttachment.filename}".`) +
            attachmentHint;
          llmMessages[i].content = textContent;
          break;
        }
      }
    }

    // ── Multi-modal: voice/audio ────────────────────────────────────
    if (hasVoice || hasAudio) {
      const fileId = hasVoice ? message.voice!.file_id : message.audio!.file_id;
      const audioData = await telegramDownloadAudioAsBase64(token, fileId);
      if (audioData) {
        for (let i = llmMessages.length - 1; i >= 0; i--) {
          if (llmMessages[i].role === 'user') {
            const textContent =
              (userText ||
                'The user sent a voice message. Listen to it carefully and respond naturally. If it contains important information, use memory_remember to store the key facts.') +
              attachmentHint;
            llmMessages[i].content = [
              { type: 'text', text: textContent },
              {
                type: 'input_audio',
                input_audio: {
                  data: audioData.base64,
                  format: audioData.format,
                },
              },
            ];
            break;
          }
        }
      }
    }

    // Get LLM configuration
    let llmConfig;
    try {
      llmConfig = await getLLMConfig(brain);
    } catch (err: any) {
      await telegramSendMessage(token, chatId, `⚠️ ${err.message}`);
      return;
    }

    // ── Agentic loop ────────────────────────────────────────────────
    const MAX_ITERATIONS = 10;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await callLLM(llmConfig, {
        messages: llmMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
      });

      const choice = response.choices?.[0];
      if (!choice) {
        await telegramSendMessage(token, chatId, '⚠️ No response from AI.');
        return;
      }

      const assistantMessage = choice.message;

      if (!assistantMessage.tool_calls?.length) {
        const content = assistantMessage.content || '...';

        await drizzle.insert(messagesTable).values({
          id: crypto.randomUUID(),
          conversationId: telegramConversationId,
          role: 'assistant',
          content,
          createdAt: new Date(),
        });
        await drizzle
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, telegramConversationId));

        const chunks = splitTelegramMessage(content);
        for (const chunk of chunks) {
          await telegramSendMarkdown(token, chatId, chunk);
        }

        brain.events
          .emit('telegram', 'message.replied', {
            chatId,
            userName,
            query: userText,
          })
          .catch(() => {});

        return;
      }

      // Process tool calls
      llmMessages.push(assistantMessage);

      const channelCtx: ChannelContext = {
        channel: 'telegram',
        chatId,
        conversationId: telegramConversationId,
      };

      let cliTaskDelegated = false;
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

        console.log(`[Telegram] Executing tool: ${toolName}`, toolArgs);
        const builtinResult = await executeBuiltinTool(
          toolName,
          toolArgs,
          channelCtx,
        );
        const result =
          builtinResult ?? (await registry.executeTool(toolName, toolArgs));

        llmMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });

        if (toolName === 'execute_on_cli') {
          cliTaskDelegated = true;
        }
      }

      if (cliTaskDelegated) {
        try {
          const ackResp = await callLLM(llmConfig, { messages: llmMessages });
          const ackContent = ackResp.choices?.[0]?.message?.content;
          if (ackContent) {
            const chunks = splitTelegramMessage(ackContent);
            for (const chunk of chunks) {
              await telegramSendMarkdown(token, chatId, chunk);
            }
          }
        } catch {
          // Ignore — CLI result delivered later
        }
        return;
      }
    }

    await telegramSendMessage(token, chatId, '⚠️ Reached max tool iterations.');
  } catch (err: any) {
    console.error('[Telegram] Error processing message:', err.message);
    const token = await getTelegramToken();
    if (token) {
      await telegramSendMessage(
        token,
        chatId,
        `❌ Error: ${err.message}`,
      ).catch(() => {});
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function splitTelegramMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf('\n', maxLen);
    if (breakAt < maxLen / 2) breakAt = maxLen;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }
  return chunks;
}
