<script setup lang="ts">
definePageMeta({ layout: 'default' });

// ── Types ───────────────────────────────────────────────────────────────────

interface Schedule {
  id: string;
  moduleId: string;
  name: string;
  cron: string;
  handler: string;
  payload: Record<string, any> | null;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface Reminder {
  id: string;
  message: string;
  triggerAt: number;
  channel: 'telegram' | 'web';
  chatId: number | null;
  conversationId: string | null;
  fired: boolean;
  createdAt: number;
}

interface RecurringTask {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  channel: 'telegram' | 'web';
  chatId: number | null;
  conversationId: string | null;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

// ── Data ────────────────────────────────────────────────────────────────────

const { data: schedulesList, refresh: refreshSchedules } =
  await useFetch<Schedule[]>('/api/schedules');

const { data: remindersList, refresh: refreshReminders } =
  await useFetch<Reminder[]>('/api/reminders');

const { data: recurringList, refresh: refreshRecurring } = await useFetch<
  RecurringTask[]
>('/api/recurring-tasks');

// ── State ───────────────────────────────────────────────────────────────────

const tab = ref<'schedules' | 'reminders' | 'recurring'>('recurring');
const toggling = ref<string | null>(null);
const triggering = ref<string | null>(null);
const deleting = ref<string | null>(null);
const editingId = ref<string | null>(null);
const editCron = ref('');
const savingCron = ref(false);

// Recurring task edit state
const editingRecurringId = ref<string | null>(null);
const editRecurringName = ref('');
const editRecurringPrompt = ref('');
const editRecurringCron = ref('');
const savingRecurring = ref(false);

// ── Actions ─────────────────────────────────────────────────────────────────

async function toggleSchedule(id: string, enabled: boolean) {
  toggling.value = id;
  try {
    await $fetch(`/api/schedules/${id}/toggle`, {
      method: 'PUT',
      body: { enabled },
    });
    await refreshSchedules();
  } finally {
    toggling.value = null;
  }
}

async function triggerSchedule(id: string) {
  triggering.value = id;
  try {
    await $fetch(`/api/schedules/${id}/trigger`, { method: 'POST' });
    await refreshSchedules();
  } finally {
    triggering.value = null;
  }
}

async function deleteSchedule(id: string) {
  if (!confirm('Delete this schedule permanently?')) return;
  deleting.value = id;
  try {
    await $fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    await refreshSchedules();
  } finally {
    deleting.value = null;
  }
}

function startEditCron(schedule: Schedule) {
  editingId.value = schedule.id;
  editCron.value = schedule.cron;
}

function cancelEditCron() {
  editingId.value = null;
  editCron.value = '';
}

async function saveCron(id: string) {
  savingCron.value = true;
  try {
    await $fetch(`/api/schedules/${id}`, {
      method: 'PUT',
      body: { cron: editCron.value },
    });
    editingId.value = null;
    editCron.value = '';
    await refreshSchedules();
  } finally {
    savingCron.value = false;
  }
}

async function deleteReminder(id: string) {
  if (!confirm('Cancel this reminder?')) return;
  deleting.value = id;
  try {
    await $fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    await refreshReminders();
  } finally {
    deleting.value = null;
  }
}

function startEditRecurring(task: RecurringTask) {
  editingRecurringId.value = task.id;
  editRecurringName.value = task.name;
  editRecurringPrompt.value = task.prompt;
  editRecurringCron.value = task.cron;
}

function cancelEditRecurring() {
  editingRecurringId.value = null;
  editRecurringName.value = '';
  editRecurringPrompt.value = '';
  editRecurringCron.value = '';
}

async function saveRecurring(id: string) {
  savingRecurring.value = true;
  try {
    await $fetch(`/api/recurring-tasks/${id}`, {
      method: 'PUT',
      body: {
        name: editRecurringName.value,
        prompt: editRecurringPrompt.value,
        cron: editRecurringCron.value,
      },
    });
    editingRecurringId.value = null;
    await refreshRecurring();
  } finally {
    savingRecurring.value = false;
  }
}

async function toggleRecurring(id: string, enabled: boolean) {
  toggling.value = id;
  try {
    await $fetch(`/api/recurring-tasks/${id}/toggle`, {
      method: 'PUT',
      body: { enabled },
    });
    await refreshRecurring();
  } finally {
    toggling.value = null;
  }
}

async function triggerRecurring(id: string) {
  triggering.value = id;
  try {
    await $fetch(`/api/recurring-tasks/${id}/trigger`, { method: 'POST' });
    await refreshRecurring();
  } finally {
    triggering.value = null;
  }
}

async function deleteRecurring(id: string) {
  if (!confirm('Delete this recurring task permanently?')) return;
  deleting.value = id;
  try {
    await $fetch(`/api/recurring-tasks/${id}`, { method: 'DELETE' });
    await refreshRecurring();
  } finally {
    deleting.value = null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 0) {
    // Future date
    const absMins = Math.abs(mins);
    if (absMins < 60) return `in ${absMins}m`;
    const hours = Math.floor(absMins / 60);
    if (hours < 24) return `in ${hours}h`;
    return d.toLocaleDateString();
  }
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString();
}

function formatFutureDate(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const schedulesCount = computed(() => schedulesList.value?.length || 0);
const activeCount = computed(
  () => schedulesList.value?.filter((s) => s.enabled).length || 0,
);
const remindersCount = computed(() => remindersList.value?.length || 0);
const recurringCount = computed(() => recurringList.value?.length || 0);
const recurringActiveCount = computed(
  () => recurringList.value?.filter((t) => t.enabled).length || 0,
);
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <Icon name="lucide:clock" class="h-4 w-4 text-gumm-accent" />
        <h1 class="text-base font-semibold">Tasks</h1>
        <span
          class="rounded-md bg-gumm-surface px-1.5 py-0.5 text-xs text-gumm-muted"
        >
          {{ activeCount + recurringActiveCount }} active
        </span>
      </div>

      <div class="flex items-center gap-1">
        <button
          class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150"
          :class="
            tab === 'schedules'
              ? 'bg-gumm-accent text-white'
              : 'text-gumm-muted hover:text-white hover:bg-gumm-border/30'
          "
          @click="tab = 'schedules'"
        >
          Schedules
          <span class="ml-1 opacity-60">{{ schedulesCount }}</span>
        </button>
        <button
          class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150"
          :class="
            tab === 'recurring'
              ? 'bg-gumm-accent text-white'
              : 'text-gumm-muted hover:text-white hover:bg-gumm-border/30'
          "
          @click="tab = 'recurring'"
        >
          Recurring
          <span class="ml-1 opacity-60">{{ recurringCount }}</span>
        </button>
        <button
          class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150"
          :class="
            tab === 'reminders'
              ? 'bg-gumm-accent text-white'
              : 'text-gumm-muted hover:text-white hover:bg-gumm-border/30'
          "
          @click="tab = 'reminders'"
        >
          Reminders
          <span class="ml-1 opacity-60">{{ remindersCount }}</span>
        </button>
      </div>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4">
      <!-- ═══ Schedules Tab ═══ -->
      <div v-if="tab === 'schedules'">
        <!-- Empty state -->
        <div
          v-if="!schedulesList?.length"
          class="flex h-full items-center justify-center animate-fade-in"
        >
          <div class="text-center space-y-3">
            <div
              class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gumm-accent/10 glow-accent"
            >
              <Icon
                name="lucide:calendar-clock"
                class="h-7 w-7 text-gumm-accent"
              />
            </div>
            <p class="text-sm text-gumm-muted">No scheduled tasks</p>
            <p class="text-xs text-gumm-muted">
              Schedules are created by
              <NuxtLink to="/modules" class="text-gumm-accent hover:underline"
                >modules</NuxtLink
              >
            </p>
          </div>
        </div>

        <!-- Schedule list -->
        <div v-else class="mx-auto max-w-3xl space-y-2">
          <div
            v-for="schedule in schedulesList"
            :key="schedule.id"
            class="rounded-xl border border-gumm-border bg-gumm-surface p-4 transition-all duration-150"
            :class="{
              'border-gumm-border-hover': editingId === schedule.id,
              'opacity-50': !schedule.enabled,
            }"
          >
            <!-- Top row: status + name + actions -->
            <div class="flex items-start gap-3">
              <!-- Status indicator -->
              <div class="mt-0.5">
                <span
                  class="block h-2.5 w-2.5 rounded-full"
                  :class="
                    schedule.lastError
                      ? 'bg-red-500 animate-pulse-dot'
                      : schedule.enabled
                        ? 'bg-emerald-500 animate-pulse-dot'
                        : 'bg-gray-500'
                  "
                  :title="
                    schedule.lastError
                      ? 'Error'
                      : schedule.enabled
                        ? 'Active'
                        : 'Disabled'
                  "
                />
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-medium truncate">
                    {{ schedule.name }}
                  </h3>
                  <span
                    class="shrink-0 rounded-md bg-gumm-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-gumm-accent"
                  >
                    {{ schedule.moduleId }}
                  </span>
                </div>

                <!-- Cron expression (view / edit) -->
                <div class="mt-1.5 flex items-center gap-2">
                  <template v-if="editingId === schedule.id">
                    <input
                      v-model="editCron"
                      type="text"
                      class="w-40 rounded-md border border-gumm-border bg-gumm-bg px-2 py-1 text-xs text-gumm-text outline-none focus:border-gumm-accent"
                      placeholder="*/5 * * * *"
                      @keydown.enter="saveCron(schedule.id)"
                      @keydown.escape="cancelEditCron"
                    />
                    <button
                      class="rounded-md bg-gumm-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-gumm-accent-hover transition-colors"
                      :disabled="savingCron"
                      @click="saveCron(schedule.id)"
                    >
                      Save
                    </button>
                    <button
                      class="rounded-md px-2 py-1 text-[10px] text-gumm-muted hover:text-white transition-colors"
                      @click="cancelEditCron"
                    >
                      Cancel
                    </button>
                  </template>
                  <template v-else>
                    <code
                      class="rounded-md bg-gumm-bg px-2 py-0.5 text-xs text-gumm-muted font-mono cursor-pointer hover:text-white transition-colors"
                      title="Click to edit cron"
                      @click="startEditCron(schedule)"
                    >
                      {{ schedule.cron }}
                    </code>
                    <span class="text-[10px] text-gumm-muted">
                      → {{ schedule.handler }}
                    </span>
                  </template>
                </div>

                <!-- Meta row -->
                <div
                  class="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-gumm-muted"
                >
                  <span class="flex items-center gap-1" title="Total runs">
                    <Icon name="lucide:repeat" class="h-3 w-3" />
                    {{ schedule.runCount }} runs
                  </span>
                  <span
                    v-if="schedule.lastRunAt"
                    class="flex items-center gap-1"
                    title="Last run"
                  >
                    <Icon name="lucide:clock" class="h-3 w-3" />
                    {{ formatDate(schedule.lastRunAt) }}
                  </span>
                  <span
                    v-if="schedule.nextRunAt && schedule.enabled"
                    class="flex items-center gap-1"
                    title="Next run"
                  >
                    <Icon name="lucide:arrow-right" class="h-3 w-3" />
                    {{ formatDate(schedule.nextRunAt) }}
                  </span>
                </div>

                <!-- Error -->
                <div
                  v-if="schedule.lastError"
                  class="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[10px] text-red-400"
                >
                  {{ schedule.lastError }}
                </div>
              </div>

              <!-- Actions -->
              <div class="flex shrink-0 items-center gap-1">
                <!-- Toggle -->
                <button
                  class="rounded-lg p-2 text-gumm-muted transition-all duration-150 hover:text-white"
                  :class="
                    schedule.enabled
                      ? 'hover:bg-amber-500/10 hover:text-amber-400'
                      : 'hover:bg-emerald-500/10 hover:text-emerald-400'
                  "
                  :title="schedule.enabled ? 'Disable' : 'Enable'"
                  :disabled="toggling === schedule.id"
                  @click="toggleSchedule(schedule.id, !schedule.enabled)"
                >
                  <Icon
                    v-if="toggling !== schedule.id"
                    :name="schedule.enabled ? 'lucide:pause' : 'lucide:play'"
                    class="h-3.5 w-3.5"
                  />
                  <Icon
                    v-else
                    name="lucide:loader"
                    class="h-3.5 w-3.5 animate-spin"
                  />
                </button>

                <!-- Trigger now -->
                <button
                  class="rounded-lg p-2 text-gumm-muted transition-all duration-150 hover:bg-gumm-accent/10 hover:text-gumm-accent"
                  title="Run now"
                  :disabled="triggering === schedule.id"
                  @click="triggerSchedule(schedule.id)"
                >
                  <Icon
                    v-if="triggering !== schedule.id"
                    name="lucide:zap"
                    class="h-3.5 w-3.5"
                  />
                  <Icon
                    v-else
                    name="lucide:loader"
                    class="h-3.5 w-3.5 animate-spin"
                  />
                </button>

                <!-- Delete -->
                <button
                  class="rounded-lg p-2 text-gumm-muted transition-all duration-150 hover:bg-red-500/10 hover:text-red-400"
                  title="Delete"
                  :disabled="deleting === schedule.id"
                  @click="deleteSchedule(schedule.id)"
                >
                  <Icon
                    v-if="deleting !== schedule.id"
                    name="lucide:trash-2"
                    class="h-3.5 w-3.5"
                  />
                  <Icon
                    v-else
                    name="lucide:loader"
                    class="h-3.5 w-3.5 animate-spin"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Recurring Tasks Tab ═══ -->
      <div v-if="tab === 'recurring'">
        <!-- Empty state -->
        <div
          v-if="!recurringList?.length"
          class="flex h-full items-center justify-center animate-fade-in"
        >
          <div class="text-center space-y-3">
            <div
              class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gumm-accent/10 glow-accent"
            >
              <Icon name="lucide:repeat" class="h-7 w-7 text-gumm-accent" />
            </div>
            <p class="text-sm text-gumm-muted">No recurring tasks</p>
            <p class="text-xs text-gumm-muted">
              Ask Gumm to
              <NuxtLink to="/" class="text-gumm-accent hover:underline"
                >schedule something</NuxtLink
              >
              in chat
            </p>
          </div>
        </div>

        <!-- Recurring task list -->
        <div v-else class="mx-auto max-w-3xl space-y-2">
          <div
            v-for="task in recurringList"
            :key="task.id"
            class="rounded-xl border border-gumm-border bg-gumm-surface p-4 transition-all duration-150"
            :class="{
              'opacity-50': !task.enabled,
              'border-gumm-border-hover': editingRecurringId === task.id,
            }"
          >
            <!-- Edit mode -->
            <template v-if="editingRecurringId === task.id">
              <div class="space-y-3">
                <div>
                  <label
                    class="text-[10px] text-gumm-muted uppercase tracking-wider"
                    >Name</label
                  >
                  <input
                    v-model="editRecurringName"
                    type="text"
                    class="mt-1 w-full rounded-md border border-gumm-border bg-gumm-bg px-2.5 py-1.5 text-sm text-gumm-text outline-none focus:border-gumm-accent"
                    @keydown.escape="cancelEditRecurring"
                  />
                </div>
                <div>
                  <label
                    class="text-[10px] text-gumm-muted uppercase tracking-wider"
                    >Prompt</label
                  >
                  <textarea
                    v-model="editRecurringPrompt"
                    rows="3"
                    class="mt-1 w-full rounded-md border border-gumm-border bg-gumm-bg px-2.5 py-1.5 text-xs text-gumm-text outline-none focus:border-gumm-accent resize-y"
                    @keydown.escape="cancelEditRecurring"
                  />
                </div>
                <div>
                  <label
                    class="text-[10px] text-gumm-muted uppercase tracking-wider"
                    >Cron</label
                  >
                  <input
                    v-model="editRecurringCron"
                    type="text"
                    class="mt-1 w-40 rounded-md border border-gumm-border bg-gumm-bg px-2.5 py-1.5 text-xs text-gumm-text font-mono outline-none focus:border-gumm-accent"
                    placeholder="0 7 * * *"
                    @keydown.enter="saveRecurring(task.id)"
                    @keydown.escape="cancelEditRecurring"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="rounded-md bg-gumm-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-gumm-accent-hover transition-colors"
                    :disabled="savingRecurring"
                    @click="saveRecurring(task.id)"
                  >
                    {{ savingRecurring ? 'Saving...' : 'Save' }}
                  </button>
                  <button
                    class="rounded-md px-3 py-1.5 text-xs text-gumm-muted hover:text-white transition-colors"
                    @click="cancelEditRecurring"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </template>

            <!-- View mode -->
            <template v-else>
              <!-- Top row: status + name + actions -->
              <div class="flex items-start gap-3">
                <!-- Status indicator -->
                <div class="mt-0.5">
                  <span
                    class="block h-2.5 w-2.5 rounded-full"
                    :class="
                      task.lastError
                        ? 'bg-red-500 animate-pulse-dot'
                        : task.enabled
                          ? 'bg-emerald-500 animate-pulse-dot'
                          : 'bg-gray-500'
                    "
                    :title="
                      task.lastError
                        ? 'Error'
                        : task.enabled
                          ? 'Active'
                          : 'Disabled'
                    "
                  />
                </div>

                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="text-sm font-medium truncate">
                      {{ task.name }}
                    </h3>
                    <span
                      class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                      :class="
                        task.channel === 'telegram'
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-gumm-accent/10 text-gumm-accent'
                      "
                    >
                      {{ task.channel }}
                    </span>
                  </div>

                  <!-- Prompt preview -->
                  <p
                    class="mt-1 text-xs text-gumm-muted truncate"
                    :title="task.prompt"
                  >
                    {{ task.prompt }}
                  </p>

                  <!-- Cron expression -->
                  <div class="mt-1.5 flex items-center gap-2">
                    <code
                      class="rounded-md bg-gumm-bg px-2 py-0.5 text-xs text-gumm-muted font-mono"
                    >
                      {{ task.cron }}
                    </code>
                  </div>

                  <!-- Meta row -->
                  <div
                    class="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-gumm-muted"
                  >
                    <span class="flex items-center gap-1" title="Total runs">
                      <Icon name="lucide:repeat" class="h-3 w-3" />
                      {{ task.runCount }} runs
                    </span>
                    <span
                      v-if="task.lastRunAt"
                      class="flex items-center gap-1"
                      title="Last run"
                    >
                      <Icon name="lucide:clock" class="h-3 w-3" />
                      {{ formatDate(task.lastRunAt) }}
                    </span>
                    <span
                      v-if="task.nextRunAt && task.enabled"
                      class="flex items-center gap-1"
                      title="Next run"
                    >
                      <Icon name="lucide:arrow-right" class="h-3 w-3" />
                      {{ formatDate(task.nextRunAt) }}
                    </span>
                  </div>

                  <!-- Error -->
                  <div
                    v-if="task.lastError"
                    class="mt-2 rounded-md bg-red-500/10 px-2 py-1 text-[10px] text-red-400"
                  >
                    {{ task.lastError }}
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex shrink-0 items-center gap-1">
                  <!-- Edit -->
                  <button
                    class="rounded-lg p-2 text-gumm-muted transition-all duration-150 hover:bg-gumm-accent/10 hover:text-gumm-accent"
                    title="Edit"
                    @click="startEditRecurring(task)"
                  >
                    <Icon name="lucide:pencil" class="h-3.5 w-3.5" />
                  </button>

                  <!-- Toggle -->
                  <button
                    class="rounded-lg p-2 text-gumm-muted transition-all duration-150 hover:text-white"
                    :class="
                      task.enabled
                        ? 'hover:bg-amber-500/10 hover:text-amber-400'
                        : 'hover:bg-emerald-500/10 hover:text-emerald-400'
                    "
                    :title="task.enabled ? 'Disable' : 'Enable'"
                    :disabled="toggling === task.id"
                    @click="toggleRecurring(task.id, !task.enabled)"
                  >
                    <Icon
                      v-if="toggling !== task.id"
                      :name="task.enabled ? 'lucide:pause' : 'lucide:play'"
                      class="h-3.5 w-3.5"
                    />
                    <Icon
                      v-else
                      name="lucide:loader"
                      class="h-3.5 w-3.5 animate-spin"
                    />
                  </button>

                  <!-- Trigger now -->
                  <button
                    class="rounded-lg p-2 text-gumm-muted transition-all duration-150 hover:bg-gumm-accent/10 hover:text-gumm-accent"
                    title="Run now"
                    :disabled="triggering === task.id"
                    @click="triggerRecurring(task.id)"
                  >
                    <Icon
                      v-if="triggering !== task.id"
                      name="lucide:zap"
                      class="h-3.5 w-3.5"
                    />
                    <Icon
                      v-else
                      name="lucide:loader"
                      class="h-3.5 w-3.5 animate-spin"
                    />
                  </button>

                  <!-- Delete -->
                  <button
                    class="rounded-lg p-2 text-gumm-muted transition-all duration-150 hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                    :disabled="deleting === task.id"
                    @click="deleteRecurring(task.id)"
                  >
                    <Icon
                      v-if="deleting !== task.id"
                      name="lucide:trash-2"
                      class="h-3.5 w-3.5"
                    />
                    <Icon
                      v-else
                      name="lucide:loader"
                      class="h-3.5 w-3.5 animate-spin"
                    />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- ═══ Reminders Tab ═══ -->
      <div v-if="tab === 'reminders'">
        <!-- Empty state -->
        <div
          v-if="!remindersList?.length"
          class="flex h-full items-center justify-center animate-fade-in"
        >
          <div class="text-center space-y-3">
            <div
              class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gumm-accent/10 glow-accent"
            >
              <Icon name="lucide:bell" class="h-7 w-7 text-gumm-accent" />
            </div>
            <p class="text-sm text-gumm-muted">No pending reminders</p>
            <p class="text-xs text-gumm-muted">
              Ask Gumm to
              <NuxtLink to="/" class="text-gumm-accent hover:underline"
                >set a reminder</NuxtLink
              >
              in chat
            </p>
          </div>
        </div>

        <!-- Reminder list -->
        <div v-else class="mx-auto max-w-3xl space-y-2">
          <div
            v-for="reminder in remindersList"
            :key="reminder.id"
            class="flex items-center gap-3 rounded-xl border border-gumm-border bg-gumm-surface p-3.5 transition-all duration-150 hover:border-gumm-border-hover"
          >
            <!-- Icon -->
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              :class="
                reminder.channel === 'telegram'
                  ? 'bg-blue-500/10'
                  : 'bg-gumm-accent/10'
              "
            >
              <Icon
                :name="
                  reminder.channel === 'telegram'
                    ? 'lucide:send'
                    : 'lucide:bell'
                "
                class="h-4 w-4"
                :class="
                  reminder.channel === 'telegram'
                    ? 'text-blue-400'
                    : 'text-gumm-accent'
                "
              />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">
                {{ reminder.message }}
              </p>
              <div
                class="mt-0.5 flex items-center gap-2 text-xs text-gumm-muted"
              >
                <span class="flex items-center gap-1">
                  <Icon name="lucide:clock" class="h-3 w-3" />
                  {{ formatFutureDate(reminder.triggerAt) }}
                </span>
                <span
                  class="rounded-md px-1.5 py-0.5 text-[10px]"
                  :class="
                    reminder.channel === 'telegram'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-gumm-accent/10 text-gumm-accent'
                  "
                >
                  {{ reminder.channel }}
                </span>
              </div>
            </div>

            <!-- Cancel -->
            <button
              class="shrink-0 rounded-lg p-2 text-gumm-muted transition-all duration-150 hover:bg-red-500/10 hover:text-red-400"
              title="Cancel reminder"
              :disabled="deleting === reminder.id"
              @click="deleteReminder(reminder.id)"
            >
              <Icon
                v-if="deleting !== reminder.id"
                name="lucide:x"
                class="h-3.5 w-3.5"
              />
              <Icon
                v-else
                name="lucide:loader"
                class="h-3.5 w-3.5 animate-spin"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
