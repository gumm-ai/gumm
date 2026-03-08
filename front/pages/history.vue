<script setup lang="ts">
definePageMeta({ layout: 'default' });

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

const { data: conversations, refresh } =
  await useFetch<Conversation[]>('/api/conversations');

const deleting = ref<string | null>(null);

async function deleteConversation(id: string) {
  if (!confirm('Delete this conversation?')) return;
  deleting.value = id;
  try {
    await $fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    await refresh();
  } finally {
    deleting.value = null;
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString();
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <Icon name="lucide:history" class="h-4 w-4 text-gumm-accent" />
        <h1 class="text-base font-semibold">History</h1>
        <span
          class="rounded-md bg-gumm-surface px-1.5 py-0.5 text-xs text-gumm-muted"
        >
          {{ conversations?.length || 0 }} conversations
        </span>
      </div>
      <NuxtLink
        to="/"
        class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gumm-accent-hover"
      >
        <Icon name="lucide:plus" class="h-3.5 w-3.5" />
        New Chat
      </NuxtLink>
    </header>

    <div class="flex-1 overflow-y-auto p-4">
      <div
        v-if="!conversations?.length"
        class="flex h-full items-center justify-center animate-fade-in"
      >
        <div class="text-center space-y-3">
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gumm-accent/10 glow-accent"
          >
            <Icon name="lucide:history" class="h-7 w-7 text-gumm-accent" />
          </div>
          <p class="text-sm text-gumm-muted">No conversations yet</p>
          <p class="text-xs text-gumm-muted">
            <NuxtLink to="/" class="text-gumm-accent hover:underline"
              >Start chatting</NuxtLink
            >
          </p>
        </div>
      </div>

      <div v-else class="mx-auto max-w-2xl space-y-1.5">
        <NuxtLink
          v-for="conv in conversations"
          :key="conv.id"
          :to="`/?conversation=${conv.id}`"
          class="flex items-center gap-3 rounded-xl border border-gumm-border bg-gumm-surface p-3.5 transition-all duration-150 hover:border-gumm-border-hover hover:bg-gumm-surface-2"
        >
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gumm-accent/10"
          >
            <Icon
              name="lucide:message-square"
              class="h-4 w-4 text-gumm-accent"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium truncate">
              {{ conv.title || 'Untitled' }}
            </h3>
            <p class="mt-0.5 text-xs text-gumm-muted flex items-center gap-1">
              <Icon name="lucide:clock" class="h-3 w-3" />
              {{ formatDate(conv.updatedAt) }}
            </p>
          </div>
          <button
            class="shrink-0 rounded-lg p-2 text-gumm-muted transition-all duration-150 hover:bg-red-500/10 hover:text-red-400"
            :disabled="deleting === conv.id"
            @click.prevent="deleteConversation(conv.id)"
          >
            <Icon
              v-if="deleting !== conv.id"
              name="lucide:trash-2"
              class="h-3.5 w-3.5"
            />
            <Icon
              v-else
              name="lucide:loader"
              class="h-3.5 w-3.5 animate-spin"
            />
          </button>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
