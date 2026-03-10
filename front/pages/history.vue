<script setup lang="ts">
definePageMeta({ layout: 'default' });

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

const { data: conversations, refresh } = await useFetch<Conversation[]>('/api/conversations');

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
  <div class="flex h-full flex-col bg-gumm-bg">
    <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center justify-between px-6 h-14">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <Icon name="lucide:history" class="h-4 w-4 text-white/70" />
          </div>
          <div>
            <h1 class="text-sm font-medium text-white tracking-tight">History</h1>
            <p class="text-[11px] text-white/40">Past conversations</p>
          </div>
          <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">{{ conversations?.length || 0 }}</span>
        </div>
        <NuxtLink
          to="/"
          class="flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90"
        >
          <Icon name="lucide:plus" class="h-3.5 w-3.5" />
          New Chat
        </NuxtLink>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="!conversations?.length" class="flex h-full items-center justify-center">
        <div class="text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
            <Icon name="lucide:history" class="h-6 w-6 text-white/50" />
          </div>
          <p class="text-base font-medium text-white/90 mb-1">No conversations yet</p>
          <p class="text-sm text-white/40">
            <NuxtLink to="/" class="text-white/60 hover:text-white/90 transition-colors">Start chatting</NuxtLink>
          </p>
        </div>
      </div>

      <div v-else class="max-w-2xl mx-auto space-y-2">
        <NuxtLink
          v-for="conv in conversations"
          :key="conv.id"
          :to="`/?conversation=${conv.id}`"
          class="group flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 transition-all hover:bg-white/[0.04] hover:border-white/[0.12]"
        >
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
            <Icon name="lucide:message-square" class="h-4 w-4 text-white/50" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-white/90 truncate">{{ conv.title || 'Untitled' }}</h3>
            <p class="text-xs text-white/40 flex items-center gap-1 mt-0.5">
              <Icon name="lucide:clock" class="h-3 w-3" />
              {{ formatDate(conv.updatedAt) }}
            </p>
          </div>
          <button
            class="shrink-0 rounded-lg p-2 text-white/30 transition-all hover:bg-red-500/10 hover:text-red-400"
            :disabled="deleting === conv.id"
            @click.prevent="deleteConversation(conv.id)"
          >
            <Icon v-if="deleting !== conv.id" name="lucide:trash-2" class="h-3.5 w-3.5" />
            <Icon v-else name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
          </button>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
