<script setup lang="ts">
definePageMeta({ layout: 'default' });

const route = useRoute();
const router = useRouter();

interface Command {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  enabled: boolean;
}

const messages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>(
  [],
);
const input = ref('');
const loading = ref(false);
const chatContainer = ref<HTMLElement | null>(null);
const conversationId = ref<string | null>(null);

// Commands for suggestions
const { data: commands } = await useFetch<Command[]>('/api/commands');
const showCommandSuggestions = ref(false);
const selectedCommandIndex = ref(0);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

// Filter commands based on input
const filteredCommands = computed(() => {
  if (!input.value.startsWith('/')) return [];
  const query = input.value.slice(1).toLowerCase();
  const enabledCommands = (commands.value || []).filter((c) => c.enabled);
  if (!query) return enabledCommands.slice(0, 10);
  return enabledCommands
    .filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.shortDescription.toLowerCase().includes(query),
    )
    .slice(0, 10);
});

// Watch input for command trigger
watch(input, (val) => {
  if (val.startsWith('/') && !val.includes(' ')) {
    showCommandSuggestions.value = true;
    selectedCommandIndex.value = 0;
  } else {
    showCommandSuggestions.value = false;
  }
});

function selectCommand(cmd: Command) {
  // Replace the partial command with the full command + space
  input.value = `/${cmd.name} `;
  showCommandSuggestions.value = false;
  textareaRef.value?.focus();
}

// Send a welcome greeting after fresh setup
async function sendWelcome() {
  if (loading.value || messages.value.length > 0) return;
  loading.value = true;
  try {
    const response = await $fetch<{
      content: string;
      conversationId: string;
    }>('/api/chat', {
      method: 'POST',
      body: {
        messages: [
          { role: 'user', content: 'Say hello! Introduce yourself briefly.' },
        ],
      },
    });
    messages.value.push({ role: 'assistant', content: response.content });
    conversationId.value = response.conversationId;
    router.replace({ query: { conversation: response.conversationId } });
  } catch {
    // Silently fail — user can start chatting normally
  } finally {
    loading.value = false;
  }
}

// Load existing conversation if ?conversation=ID is present
async function loadConversation(id: string) {
  try {
    const conv = await $fetch<{
      id: string;
      title: string;
      messages: Array<{ role: string; content: string }>;
    }>(`/api/conversations/${id}`);
    conversationId.value = conv.id;
    messages.value = conv.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => m.content)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  } catch {
    // Conversation not found — start fresh
    conversationId.value = null;
  }
}

// Watch route query for conversation loading
watch(
  () => route.query.conversation,
  async (id) => {
    if (id && typeof id === 'string') {
      await loadConversation(id);
      await nextTick();
      scrollToBottom();
    }
  },
  { immediate: true },
);

// Trigger welcome message after fresh setup
onMounted(async () => {
  if (route.query.welcome === 'true') {
    router.replace({ query: {} });
    await sendWelcome();
  }
});

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
}

function newConversation() {
  messages.value = [];
  conversationId.value = null;
  router.replace({ query: {} });
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text || loading.value) return;

  messages.value.push({ role: 'user', content: text });
  input.value = '';
  loading.value = true;

  try {
    const response = await $fetch<{
      content: string;
      conversationId: string;
    }>('/api/chat', {
      method: 'POST',
      body: {
        messages: messages.value,
        conversationId: conversationId.value,
      },
    });
    messages.value.push({ role: 'assistant', content: response.content });
    // Track the conversation ID for future messages
    if (response.conversationId && !conversationId.value) {
      conversationId.value = response.conversationId;
      router.replace({
        query: { conversation: response.conversationId },
      });
    }
  } catch (err: any) {
    messages.value.push({
      role: 'assistant',
      content: `Error: ${err.data?.message || err.message || 'Unknown error'}`,
    });
  } finally {
    loading.value = false;
    await nextTick();
    scrollToBottom();
  }
}

function handleKeydown(e: KeyboardEvent) {
  // Handle command suggestions navigation
  if (showCommandSuggestions.value && filteredCommands.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedCommandIndex.value = Math.min(
        selectedCommandIndex.value + 1,
        filteredCommands.value.length - 1,
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedCommandIndex.value = Math.max(selectedCommandIndex.value - 1, 0);
      return;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      selectCommand(filteredCommands.value[selectedCommandIndex.value]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      showCommandSuggestions.value = false;
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <Icon name="lucide:message-square" class="h-4 w-4 text-gumm-accent" />
        <h1 class="text-base font-semibold">Chat</h1>
        <span
          class="rounded-md bg-gumm-accent/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-gumm-accent"
          >AI</span
        >
      </div>
      <button
        v-if="messages.length > 0"
        class="flex items-center gap-1.5 rounded-lg border border-gumm-border px-2.5 py-1.5 text-xs text-gumm-muted transition-all duration-150 hover:bg-white/5 hover:text-gumm-text hover:border-gumm-border-hover"
        @click="newConversation"
      >
        <Icon name="lucide:plus" class="h-3.5 w-3.5" />
        New
      </button>
    </header>

    <!-- Messages -->
    <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
      <!-- Empty state -->
      <div
        v-if="messages.length === 0"
        class="flex h-full items-center justify-center animate-fade-in"
      >
        <div class="text-center space-y-3">
          <div
            class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-gumm-surface border border-gumm-border mb-4"
          >
            <Icon name="lucide:sparkles" class="h-6 w-6 text-gumm-text" />
          </div>
          <p class="text-lg font-semibold tracking-tight text-white">
            Start a conversation
          </p>
          <p class="text-xs text-gumm-muted">
            Ask Gumm anything — your modular AI brain is ready.
          </p>
        </div>
      </div>

      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="flex gap-2.5 animate-slide-up"
        :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <!-- Bot avatar -->
        <div
          v-if="msg.role === 'assistant'"
          class="flex h-7 w-7 shrink-0 items-center justify-center mt-0.5"
        >
          <Icon name="lucide:sparkles" class="h-4 w-4 text-gumm-text" />
        </div>

        <div
          class="max-w-[85%] px-3.5 py-2.5"
          :class="
            msg.role === 'user'
              ? 'bg-white text-black rounded-xl rounded-tr-sm'
              : 'bg-transparent text-gumm-text'
          "
        >
          <p class="whitespace-pre-wrap text-sm leading-relaxed">
            {{ msg.content }}
          </p>
        </div>

        <!-- User avatar -->
        <div
          v-if="msg.role === 'user'"
          class="flex h-7 w-7 shrink-0 items-center justify-center mt-0.5"
        >
          <Icon name="lucide:user" class="h-4 w-4 text-gumm-muted" />
        </div>
      </div>

      <div v-if="loading" class="flex gap-2.5 justify-start">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center mt-0.5">
          <Icon
            name="lucide:sparkles"
            class="h-4 w-4 text-gumm-text animate-pulse"
          />
        </div>
        <div class="px-3.5 py-2.5 text-gumm-muted">
          <div class="flex items-center gap-1.5 h-full">
            <span class="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            <span
              class="h-1.5 w-1.5 rounded-full bg-white animate-pulse [animation-delay:150ms]"
            />
            <span
              class="h-1.5 w-1.5 rounded-full bg-white animate-pulse [animation-delay:300ms]"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="border-t border-gumm-border p-4 bg-gumm-surface relative">
      <!-- Command Suggestions -->
      <Transition
        enter-active-class="transition-all duration-150"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-100"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-2"
      >
        <div
          v-if="showCommandSuggestions && filteredCommands.length > 0"
          class="absolute bottom-full left-4 right-4 mb-2 rounded-xl border border-gumm-border bg-gumm-bg shadow-2xl overflow-hidden"
        >
          <div class="px-3 py-2 border-b border-gumm-border">
            <p class="text-xs text-gumm-muted">Commands</p>
          </div>
          <div class="max-h-64 overflow-y-auto">
            <button
              v-for="(cmd, idx) in filteredCommands"
              :key="cmd.id"
              class="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
              :class="
                idx === selectedCommandIndex
                  ? 'bg-gumm-accent/10 text-gumm-text'
                  : 'hover:bg-white/5 text-gumm-muted'
              "
              @click="selectCommand(cmd)"
              @mouseenter="selectedCommandIndex = idx"
            >
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gumm-border bg-gumm-surface"
              >
                <Icon name="lucide:terminal" class="h-4 w-4 text-gumm-accent" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gumm-text">
                  /{{ cmd.name }}
                </p>
                <p class="text-xs text-gumm-muted truncate">
                  {{ cmd.shortDescription }}
                </p>
              </div>
              <kbd
                v-if="idx === selectedCommandIndex"
                class="text-[10px] text-gumm-muted bg-gumm-surface px-1.5 py-0.5 rounded border border-gumm-border"
              >
                Tab
              </kbd>
            </button>
          </div>
        </div>
      </Transition>

      <div
        class="flex items-end gap-2 rounded-lg border border-gumm-border bg-gumm-bg p-1.5 focus-within:ring-1 focus-within:ring-gumm-border-hover focus-within:border-gumm-border-hover transition-colors"
      >
        <textarea
          ref="textareaRef"
          v-model="input"
          rows="1"
          placeholder="Message Gumm... (Enter to send, / for commands)"
          class="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none"
          @keydown="handleKeydown"
        />
        <button
          :disabled="!input.trim() || loading"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-black transition-colors duration-150 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
          @click="sendMessage"
        >
          <Icon name="lucide:arrow-up" class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>
