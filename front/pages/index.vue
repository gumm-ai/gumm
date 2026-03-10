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

const messages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
const input = ref('');
const loading = ref(false);
const chatContainer = ref<HTMLElement | null>(null);
const conversationId = ref<string | null>(null);

const { data: commands } = await useFetch<Command[]>('/api/commands');
const showCommandSuggestions = ref(false);
const selectedCommandIndex = ref(0);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const filteredCommands = computed(() => {
  if (!input.value.startsWith('/')) return [];
  const query = input.value.slice(1).toLowerCase();
  const enabledCommands = (commands.value || []).filter((c) => c.enabled);
  if (!query) return enabledCommands.slice(0, 10);
  return enabledCommands.filter((c) => c.name.toLowerCase().includes(query) || c.shortDescription.toLowerCase().includes(query)).slice(0, 10);
});

watch(input, (val) => {
  if (val.startsWith('/') && !val.includes(' ')) {
    showCommandSuggestions.value = true;
    selectedCommandIndex.value = 0;
  } else {
    showCommandSuggestions.value = false;
  }
});

function selectCommand(cmd: Command) {
  input.value = `/${cmd.name} `;
  showCommandSuggestions.value = false;
  textareaRef.value?.focus();
}

async function sendWelcome() {
  if (loading.value || messages.value.length > 0) return;
  loading.value = true;
  try {
    const response = await $fetch<{ content: string; conversationId: string }>('/api/chat', {
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'Say hello! Introduce yourself briefly.' }] },
    });
    messages.value.push({ role: 'assistant', content: response.content });
    conversationId.value = response.conversationId;
    router.replace({ query: { conversation: response.conversationId } });
  } catch {} finally {
    loading.value = false;
  }
}

async function loadConversation(id: string) {
  try {
    const conv = await $fetch<{ id: string; title: string; messages: Array<{ role: string; content: string }> }>(`/api/conversations/${id}`);
    conversationId.value = conv.id;
    messages.value = conv.messages.filter((m) => m.role === 'user' || m.role === 'assistant').filter((m) => m.content).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  } catch {
    conversationId.value = null;
  }
}

watch(
  () => route.query.conversation,
  async (id) => {
    if (id && typeof id === 'string') {
      await loadConversation(id);
      await nextTick();
      scrollToBottom();
    }
  },
  { immediate: true }
);

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
    const response = await $fetch<{ content: string; conversationId: string }>('/api/chat', {
      method: 'POST',
      body: { messages: messages.value, conversationId: conversationId.value },
    });
    messages.value.push({ role: 'assistant', content: response.content });
    if (response.conversationId && !conversationId.value) {
      conversationId.value = response.conversationId;
      router.replace({ query: { conversation: response.conversationId } });
    }
  } catch (err: any) {
    messages.value.push({ role: 'assistant', content: `Error: ${err.data?.message || err.message || 'Unknown error'}` });
  } finally {
    loading.value = false;
    await nextTick();
    scrollToBottom();
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (showCommandSuggestions.value && filteredCommands.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedCommandIndex.value = Math.min(selectedCommandIndex.value + 1, filteredCommands.value.length - 1);
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
  <div class="flex h-full flex-col bg-gumm-bg">
    <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center justify-between px-6 h-14">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <Icon name="lucide:message-square" class="h-4 w-4 text-white/70" />
          </div>
          <div>
            <h1 class="text-sm font-medium text-white tracking-tight">Chat</h1>
            <p class="text-[11px] text-white/40">Talk to your AI brain</p>
          </div>
        </div>
        <button
          v-if="messages.length > 0"
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/50 transition-all hover:bg-white/[0.04] hover:text-white/80"
          @click="newConversation"
        >
          <Icon name="lucide:plus" class="h-3.5 w-3.5" />
          New
        </button>
      </div>
    </header>

    <div ref="chatContainer" class="flex-1 overflow-y-auto">
      <div v-if="messages.length === 0" class="flex h-full items-center justify-center">
        <div class="text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
            <Icon name="lucide:sparkles" class="h-6 w-6 text-white/50" />
          </div>
          <p class="text-base font-medium text-white/90 mb-1">Start a conversation</p>
          <p class="text-sm text-white/40">Ask Gumm anything — your modular AI brain is ready.</p>
        </div>
      </div>

      <div v-else class="max-w-3xl mx-auto p-6 space-y-4">
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="flex gap-3"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div v-if="msg.role === 'assistant'" class="flex h-7 w-7 shrink-0 items-center justify-center mt-0.5">
            <Icon name="lucide:sparkles" class="h-4 w-4 text-white/50" />
          </div>

          <div
            class="max-w-[80%] px-4 py-2.5 text-sm leading-relaxed"
            :class="msg.role === 'user' ? 'bg-white text-black rounded-2xl rounded-br-sm' : 'text-white/80'"
          >
            <p class="whitespace-pre-wrap">{{ msg.content }}</p>
          </div>

          <div v-if="msg.role === 'user'" class="flex h-7 w-7 shrink-0 items-center justify-center mt-0.5">
            <Icon name="lucide:user" class="h-4 w-4 text-white/40" />
          </div>
        </div>

        <div v-if="loading" class="flex gap-3 justify-start">
          <div class="flex h-7 w-7 shrink-0 items-center justify-center mt-0.5">
            <Icon name="lucide:sparkles" class="h-4 w-4 text-white/50 animate-pulse" />
          </div>
          <div class="px-4 py-3 text-white/40">
            <div class="flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full bg-white/40 animate-pulse" />
              <span class="h-1.5 w-1.5 rounded-full bg-white/40 animate-pulse [animation-delay:150ms]" />
              <span class="h-1.5 w-1.5 rounded-full bg-white/40 animate-pulse [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="shrink-0 border-t border-white/[0.06] p-4 relative">
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
          class="absolute bottom-full left-4 right-4 mb-2 rounded-xl border border-white/[0.08] bg-gumm-surface shadow-2xl overflow-hidden"
        >
          <div class="px-3 py-2 border-b border-white/[0.06]">
            <p class="text-[10px] text-white/40 uppercase tracking-wider">Commands</p>
          </div>
          <div class="max-h-64 overflow-y-auto">
            <button
              v-for="(cmd, idx) in filteredCommands"
              :key="cmd.id"
              class="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
              :class="idx === selectedCommandIndex ? 'bg-white/[0.06] text-white/90' : 'hover:bg-white/[0.04] text-white/60'"
              @click="selectCommand(cmd)"
              @mouseenter="selectedCommandIndex = idx"
            >
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                <Icon name="lucide:terminal" class="h-4 w-4 text-white/50" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-white/90">/{{ cmd.name }}</p>
                <p class="text-xs text-white/40 truncate">{{ cmd.shortDescription }}</p>
              </div>
              <kbd v-if="idx === selectedCommandIndex" class="text-[10px] text-white/40 bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.08]">
                Tab
              </kbd>
            </button>
          </div>
        </div>
      </Transition>

      <div class="max-w-3xl mx-auto">
        <div class="flex items-end gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] p-1.5 focus-within:border-white/20 transition-colors">
          <textarea
            ref="textareaRef"
            v-model="input"
            rows="1"
            placeholder="Message Gumm... (/ for commands)"
            class="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
            @keydown="handleKeydown"
          />
          <button
            :disabled="!input.trim() || loading"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-black transition-colors hover:bg-white/90 disabled:opacity-30"
            @click="sendMessage"
          >
            <Icon name="lucide:arrow-up" class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
