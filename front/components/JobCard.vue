<script setup lang="ts">
interface BackgroundJob {
  id: string;
  title: string;
  prompt: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  result: string | null;
  error: string | null;
  conversationId: string;
  parentConversationId: string | null;
  moduleIds: string[] | null;
  iterations: number;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

const props = defineProps<{
  job: BackgroundJob;
  expanded: boolean;
  deleting: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  delete: [];
}>();

// ── Status helpers ───────────────────────────────────────────────────────────

const statusConfig = computed(() => {
  switch (props.job.status) {
    case 'pending':
      return {
        color: 'text-slate-400',
        bg: 'bg-slate-400/10',
        label: 'Pending',
        icon: 'lucide:clock',
      };
    case 'running':
      return {
        color: 'text-indigo-400',
        bg: 'bg-indigo-400/10',
        label: 'Running',
        icon: 'lucide:loader-2',
      };
    case 'done':
      return {
        color: 'text-emerald-400',
        bg: 'bg-emerald-400/10',
        label: 'Done',
        icon: 'lucide:check-circle-2',
      };
    case 'failed':
      return {
        color: 'text-red-400',
        bg: 'bg-red-400/10',
        label: 'Failed',
        icon: 'lucide:x-circle',
      };
    case 'cancelled':
      return {
        color: 'text-slate-400',
        bg: 'bg-slate-400/10',
        label: 'Cancelled',
        icon: 'lucide:ban',
      };
  }
});

function formatDate(ts: number | null): string {
  if (!ts) return '—';
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

function formatDuration(): string {
  if (!props.job.startedAt) return '';
  const end = props.job.completedAt ?? Date.now();
  const ms = end - props.job.startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
</script>

<template>
  <div>
    <!-- Job header row -->
    <div
      class="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none hover:bg-white/2 transition-colors"
      @click="emit('toggle')"
    >
      <!-- Status indicator -->
      <div
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        :class="statusConfig.bg"
      >
        <Icon
          :name="statusConfig.icon"
          class="h-3.5 w-3.5"
          :class="[
            statusConfig.color,
            job.status === 'running' ? 'animate-spin' : '',
          ]"
        />
      </div>

      <!-- Title + meta -->
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium leading-tight">
          {{ job.title }}
        </p>
        <div class="mt-0.5 flex items-center gap-2 text-xs text-gumm-muted">
          <span>{{ formatDate(job.createdAt) }}</span>
          <span v-if="job.iterations > 0" class="flex items-center gap-0.5">
            <Icon name="lucide:repeat-2" class="h-3 w-3" />
            {{ job.iterations }} steps
          </span>
          <span v-if="job.startedAt" class="flex items-center gap-0.5">
            <Icon name="lucide:timer" class="h-3 w-3" />
            {{ formatDuration() }}
          </span>
        </div>
      </div>

      <!-- Status badge -->
      <span
        class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
        :class="[statusConfig.bg, statusConfig.color]"
      >
        {{ statusConfig.label }}
      </span>

      <!-- Actions -->
      <div class="flex shrink-0 items-center gap-1" @click.stop>
        <!-- View conversation -->
        <NuxtLink
          :to="`/?conversation=${job.conversationId}`"
          class="flex h-6 w-6 items-center justify-center rounded text-gumm-muted transition-colors hover:text-white hover:bg-white/10"
          title="View conversation"
        >
          <Icon name="lucide:external-link" class="h-3.5 w-3.5" />
        </NuxtLink>
        <!-- Delete -->
        <button
          :disabled="deleting"
          class="flex h-6 w-6 items-center justify-center rounded text-gumm-muted transition-colors hover:text-red-400 hover:bg-red-400/10 disabled:opacity-50"
          title="Delete job"
          @click="emit('delete')"
        >
          <Icon
            :name="deleting ? 'lucide:loader-2' : 'lucide:trash-2'"
            class="h-3.5 w-3.5"
            :class="deleting ? 'animate-spin' : ''"
          />
        </button>
      </div>

      <!-- Expand chevron -->
      <Icon
        name="lucide:chevron-down"
        class="h-3.5 w-3.5 shrink-0 text-gumm-muted transition-transform duration-150"
        :class="expanded ? 'rotate-180' : ''"
      />
    </div>

    <!-- Expanded detail -->
    <Transition
      enter-active-class="transition-all duration-150 overflow-hidden"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-96"
      leave-active-class="transition-all duration-150 overflow-hidden"
      leave-from-class="opacity-100 max-h-96"
      leave-to-class="opacity-0 max-h-0"
    >
      <div
        v-if="expanded"
        class="border-t border-gumm-border px-3 py-3 space-y-2.5 bg-gumm-bg/40"
      >
        <!-- Prompt -->
        <div>
          <p
            class="mb-1 text-xs font-medium text-gumm-muted uppercase tracking-wide"
          >
            Prompt
          </p>
          <p class="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
            {{ job.prompt }}
          </p>
        </div>

        <!-- Linked Modules -->
        <div v-if="job.moduleIds?.length">
          <p
            class="mb-1 text-xs font-medium text-gumm-muted uppercase tracking-wide"
          >
            Modules
          </p>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="modId in job.moduleIds"
              :key="modId"
              class="inline-flex items-center gap-1 rounded-md bg-gumm-accent/10 border border-gumm-accent/20 px-2 py-0.5 text-xs text-gumm-accent"
            >
              <Icon name="lucide:package" class="h-3 w-3" />
              {{ modId }}
            </span>
          </div>
        </div>

        <!-- Result -->
        <div v-if="job.result">
          <p
            class="mb-1 text-xs font-medium text-emerald-400 uppercase tracking-wide"
          >
            Result
          </p>
          <p
            class="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto"
          >
            {{ job.result }}
          </p>
        </div>

        <!-- Error -->
        <div v-if="job.error">
          <p
            class="mb-1 text-xs font-medium text-red-400 uppercase tracking-wide"
          >
            Error
          </p>
          <p class="text-xs text-red-300 whitespace-pre-wrap">
            {{ job.error }}
          </p>
        </div>

        <!-- Running animation -->
        <div
          v-if="job.status === 'running'"
          class="flex items-center gap-2 text-xs text-indigo-400"
        >
          <Icon name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
          Agent is working…
        </div>

        <!-- View full conversation link -->
        <NuxtLink
          :to="`/?conversation=${job.conversationId}`"
          class="inline-flex items-center gap-1.5 text-xs text-gumm-accent hover:underline"
        >
          <Icon name="lucide:message-square" class="h-3.5 w-3.5" />
          View full conversation
        </NuxtLink>
      </div>
    </Transition>
  </div>
</template>
