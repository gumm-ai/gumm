<script setup lang="ts">
definePageMeta({ layout: 'default' });

interface TimeInfo {
  serverTimeUtc: string;
  serverTimezone: string;
  userTimezone: string;
  userTime: string;
}

const { data: timeInfo } = await useFetch<TimeInfo>('/api/time');

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
}

interface Reminder {
  id: string;
  message: string;
  triggerAt: number;
  channel: 'telegram' | 'web';
  fired: boolean;
}

interface RecurringTask {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  channel: 'telegram' | 'web';
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  runCount: number;
  lastError: string | null;
}

const { data: schedulesList, refresh: refreshSchedules } = await useFetch<Schedule[]>('/api/schedules');
const { data: remindersList, refresh: refreshReminders } = await useFetch<Reminder[]>('/api/reminders');
const { data: recurringList, refresh: refreshRecurring } = await useFetch<RecurringTask[]>('/api/recurring-tasks');

type TabId = 'schedules' | 'reminders' | 'recurring';
const tab = ref<TabId>('recurring');

const toggling = ref<string | null>(null);
const triggering = ref<string | null>(null);
const deleting = ref<string | null>(null);

const editingId = ref<string | null>(null);
const editCron = ref('');
const savingCron = ref(false);

const editingRecurringId = ref<string | null>(null);
const editRecurringName = ref('');
const editRecurringPrompt = ref('');
const editRecurringCron = ref('');
const savingRecurring = ref(false);

async function toggleSchedule(id: string, enabled: boolean) {
  toggling.value = id;
  try {
    await $fetch(`/api/schedules/${id}/toggle`, { method: 'PUT', body: { enabled } });
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
  if (!confirm('Delete this schedule?')) return;
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
    await $fetch(`/api/schedules/${id}`, { method: 'PUT', body: { cron: editCron.value } });
    editingId.value = null;
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
}

async function saveRecurring(id: string) {
  savingRecurring.value = true;
  try {
    await $fetch(`/api/recurring-tasks/${id}`, {
      method: 'PUT',
      body: { name: editRecurringName.value, prompt: editRecurringPrompt.value, cron: editRecurringCron.value },
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
    await $fetch(`/api/recurring-tasks/${id}/toggle`, { method: 'PUT', body: { enabled } });
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
  if (!confirm('Delete this task?')) return;
  deleting.value = id;
  try {
    await $fetch(`/api/recurring-tasks/${id}`, { method: 'DELETE' });
    await refreshRecurring();
  } finally {
    deleting.value = null;
  }
}

function formatAgo(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

function formatFuture(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const schedulesCount = computed(() => schedulesList.value?.length || 0);
const remindersCount = computed(() => remindersList.value?.length || 0);
const recurringCount = computed(() => recurringList.value?.length || 0);
const activeCount = computed(() => (schedulesList.value?.filter((s) => s.enabled).length || 0) + (recurringList.value?.filter((t) => t.enabled).length || 0));
</script>

<template>
  <div class="flex h-full flex-col bg-gumm-bg">
    <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center justify-between px-6 h-14">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <Icon name="lucide:clock" class="h-4 w-4 text-white/70" />
          </div>
          <div>
            <h1 class="text-sm font-medium text-white tracking-tight">Tasks</h1>
            <p class="text-[11px] text-white/40">Schedules & reminders</p>
          </div>
          <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">{{ activeCount }} active</span>
        </div>

        <div class="flex items-center gap-1">
          <button
            v-for="t in [
              { id: 'recurring' as TabId, label: 'Recurring', count: recurringCount },
              { id: 'schedules' as TabId, label: 'Schedules', count: schedulesCount },
              { id: 'reminders' as TabId, label: 'Reminders', count: remindersCount },
            ]"
            :key="t.id"
            class="rounded-lg px-3 py-1.5 text-xs transition-all"
            :class="tab === t.id ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:text-white/80'"
            @click="tab = t.id"
          >
            {{ t.label }}
            <span class="ml-1.5 text-white/40">{{ t.count }}</span>
          </button>
        </div>
      </div>

      <div v-if="timeInfo" class="flex items-center gap-6 px-6 py-2 border-t border-white/[0.04] bg-white/[0.01]">
        <span class="flex items-center gap-1.5 text-[10px] text-white/40">
          <Icon name="lucide:globe" class="h-3 w-3" />
          Server: <strong class="text-white/60">{{ timeInfo.serverTimezone }}</strong>
        </span>
        <span class="flex items-center gap-1.5 text-[10px] text-white/40">
          <Icon name="lucide:user" class="h-3 w-3" />
          Your TZ: <strong class="text-white/60">{{ timeInfo.userTimezone }}</strong>
        </span>
        <span v-if="timeInfo.serverTimezone !== timeInfo.userTimezone" class="flex items-center gap-1 text-[10px] text-amber-400/80">
          <Icon name="lucide:alert-triangle" class="h-3 w-3" />
          Mismatch
        </span>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="tab === 'schedules'">
        <div v-if="!schedulesList?.length" class="flex h-full items-center justify-center">
          <div class="text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
              <Icon name="lucide:calendar-clock" class="h-6 w-6 text-white/50" />
            </div>
            <p class="text-base font-medium text-white/90 mb-1">No scheduled tasks</p>
            <p class="text-sm text-white/40">Schedules are created by <NuxtLink to="/modules" class="text-white/60 hover:text-white/90">modules</NuxtLink></p>
          </div>
        </div>

        <div v-else class="max-w-3xl mx-auto space-y-2">
          <div
            v-for="schedule in schedulesList"
            :key="schedule.id"
            class="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 transition-all"
            :class="{ 'opacity-50': !schedule.enabled, 'border-white/12': editingId === schedule.id }"
          >
            <div class="flex items-start gap-3">
              <span class="mt-1 h-2 w-2 rounded-full shrink-0" :class="schedule.lastError ? 'bg-red-400' : schedule.enabled ? 'bg-emerald-400' : 'bg-white/30'" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="text-sm font-medium text-white/90">{{ schedule.name }}</h3>
                  <span class="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/50">{{ schedule.moduleId }}</span>
                </div>

                <div class="flex items-center gap-2 text-xs">
                  <template v-if="editingId === schedule.id">
                    <input
                      v-model="editCron"
                      type="text"
                      class="w-32 rounded-lg bg-white/[0.04] border border-white/[0.08] px-2 py-1 text-xs text-white outline-none focus:border-white/20"
                      @keydown.enter="saveCron(schedule.id)"
                      @keydown.escape="cancelEditCron"
                    />
                    <button class="rounded-lg bg-white text-black px-2 py-1 text-[10px] font-medium" :disabled="savingCron" @click="saveCron(schedule.id)">Save</button>
                    <button class="text-white/50 hover:text-white/80 text-[10px]" @click="cancelEditCron">Cancel</button>
                  </template>
                  <template v-else>
                    <code class="rounded bg-white/[0.04] px-2 py-0.5 text-white/50 cursor-pointer hover:text-white/80" @click="startEditCron(schedule)">{{ schedule.cron }}</code>
                    <span class="text-white/30">→</span>
                    <span class="text-white/40">{{ schedule.handler }}</span>
                  </template>
                </div>

                <div class="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-white/40">
                  <span class="flex items-center gap-1"><Icon name="lucide:repeat" class="h-3 w-3" /> {{ schedule.runCount }} runs</span>
                  <span v-if="schedule.lastRunAt" class="flex items-center gap-1"><Icon name="lucide:clock" class="h-3 w-3" /> {{ formatAgo(schedule.lastRunAt) }}</span>
                  <span v-if="schedule.nextRunAt && schedule.enabled" class="flex items-center gap-1 text-white/60">
                    <Icon name="lucide:arrow-right" class="h-3 w-3" /> {{ formatFuture(schedule.nextRunAt) }}
                  </span>
                </div>

                <div v-if="schedule.lastError" class="mt-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-[10px] text-red-400">
                  {{ schedule.lastError }}
                </div>
              </div>

              <div class="flex items-center gap-1 shrink-0">
                <button class="rounded-lg p-1.5 text-white/40 hover:text-white/80 hover:bg-white/[0.04] transition-colors" :title="schedule.enabled ? 'Pause' : 'Play'" @click="toggleSchedule(schedule.id, !schedule.enabled)">
                  <Icon v-if="toggling !== schedule.id" :name="schedule.enabled ? 'lucide:pause' : 'lucide:play'" class="h-3.5 w-3.5" />
                  <Icon v-else name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
                </button>
                <button class="rounded-lg p-1.5 text-white/40 hover:text-white/80 hover:bg-white/[0.04] transition-colors" title="Run now" @click="triggerSchedule(schedule.id)">
                  <Icon v-if="triggering !== schedule.id" name="lucide:zap" class="h-3.5 w-3.5" />
                  <Icon v-else name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
                </button>
                <button class="rounded-lg p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete" @click="deleteSchedule(schedule.id)">
                  <Icon v-if="deleting !== schedule.id" name="lucide:trash-2" class="h-3.5 w-3.5" />
                  <Icon v-else name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="tab === 'recurring'">
        <div v-if="!recurringList?.length" class="flex h-full items-center justify-center">
          <div class="text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
              <Icon name="lucide:repeat" class="h-6 w-6 text-white/50" />
            </div>
            <p class="text-base font-medium text-white/90 mb-1">No recurring tasks</p>
            <p class="text-sm text-white/40">Ask Gumm to <NuxtLink to="/" class="text-white/60 hover:text-white/90">schedule something</NuxtLink> in chat</p>
          </div>
        </div>

        <div v-else class="max-w-3xl mx-auto space-y-2">
          <div
            v-for="task in recurringList"
            :key="task.id"
            class="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 transition-all"
            :class="{ 'opacity-50': !task.enabled, 'border-white/12': editingRecurringId === task.id }"
          >
            <template v-if="editingRecurringId === task.id">
              <div class="space-y-3">
                <input v-model="editRecurringName" type="text" class="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none focus:border-white/20" />
                <textarea v-model="editRecurringPrompt" rows="2" class="w-full resize-none rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-xs text-white outline-none focus:border-white/20" />
                <input v-model="editRecurringCron" type="text" class="w-40 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-xs text-white font-mono outline-none focus:border-white/20" />
                <div class="flex items-center gap-2">
                  <button class="rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium" :disabled="savingRecurring" @click="saveRecurring(task.id)">Save</button>
                  <button class="text-white/50 hover:text-white/80 text-xs" @click="cancelEditRecurring">Cancel</button>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="flex items-start gap-3">
                <span class="mt-1 h-2 w-2 rounded-full shrink-0" :class="task.lastError ? 'bg-red-400' : task.enabled ? 'bg-emerald-400' : 'bg-white/30'" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="text-sm font-medium text-white/90">{{ task.name }}</h3>
                    <span class="rounded px-1.5 py-0.5 text-[10px]" :class="task.channel === 'telegram' ? 'bg-blue-500/10 text-blue-400' : 'bg-white/[0.06] text-white/50'">{{ task.channel }}</span>
                  </div>
                  <p class="text-xs text-white/40 truncate mb-1">{{ task.prompt }}</p>
                  <code class="rounded bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/50">{{ task.cron }}</code>

                  <div class="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-white/40">
                    <span class="flex items-center gap-1"><Icon name="lucide:repeat" class="h-3 w-3" /> {{ task.runCount }} runs</span>
                    <span v-if="task.lastRunAt" class="flex items-center gap-1"><Icon name="lucide:clock" class="h-3 w-3" /> {{ formatAgo(task.lastRunAt) }}</span>
                    <span v-if="task.nextRunAt && task.enabled" class="flex items-center gap-1 text-white/60">
                      <Icon name="lucide:arrow-right" class="h-3 w-3" /> {{ formatFuture(task.nextRunAt) }}
                    </span>
                  </div>

                  <div v-if="task.lastError" class="mt-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-[10px] text-red-400">{{ task.lastError }}</div>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <button class="rounded-lg p-1.5 text-white/40 hover:text-white/80 hover:bg-white/[0.04] transition-colors" title="Edit" @click="startEditRecurring(task)">
                    <Icon name="lucide:pencil" class="h-3.5 w-3.5" />
                  </button>
                  <button class="rounded-lg p-1.5 text-white/40 hover:text-white/80 hover:bg-white/[0.04] transition-colors" :title="task.enabled ? 'Pause' : 'Play'" @click="toggleRecurring(task.id, !task.enabled)">
                    <Icon v-if="toggling !== task.id" :name="task.enabled ? 'lucide:pause' : 'lucide:play'" class="h-3.5 w-3.5" />
                    <Icon v-else name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
                  </button>
                  <button class="rounded-lg p-1.5 text-white/40 hover:text-white/80 hover:bg-white/[0.04] transition-colors" title="Run now" @click="triggerRecurring(task.id)">
                    <Icon v-if="triggering !== task.id" name="lucide:zap" class="h-3.5 w-3.5" />
                    <Icon v-else name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
                  </button>
                  <button class="rounded-lg p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete" @click="deleteRecurring(task.id)">
                    <Icon v-if="deleting !== task.id" name="lucide:trash-2" class="h-3.5 w-3.5" />
                    <Icon v-else name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="tab === 'reminders'">
        <div v-if="!remindersList?.length" class="flex h-full items-center justify-center">
          <div class="text-center">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
              <Icon name="lucide:bell" class="h-6 w-6 text-white/50" />
            </div>
            <p class="text-base font-medium text-white/90 mb-1">No pending reminders</p>
            <p class="text-sm text-white/40">Ask Gumm to <NuxtLink to="/" class="text-white/60 hover:text-white/90">set a reminder</NuxtLink> in chat</p>
          </div>
        </div>

        <div v-else class="max-w-3xl mx-auto space-y-2">
          <div
            v-for="reminder in remindersList"
            :key="reminder.id"
            class="flex items-center gap-3 rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 transition-all hover:bg-white/[0.04]"
          >
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="reminder.channel === 'telegram' ? 'bg-blue-500/10' : 'bg-white/[0.04]'">
              <Icon :name="reminder.channel === 'telegram' ? 'lucide:send' : 'lucide:bell'" class="h-4 w-4" :class="reminder.channel === 'telegram' ? 'text-blue-400' : 'text-white/50'" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-white/90 truncate">{{ reminder.message }}</p>
              <div class="flex items-center gap-2 mt-1 text-xs text-white/40">
                <span class="flex items-center gap-1"><Icon name="lucide:clock" class="h-3 w-3" /> {{ formatFuture(reminder.triggerAt) }}</span>
                <span class="rounded px-1.5 py-0.5 text-[10px]" :class="reminder.channel === 'telegram' ? 'bg-blue-500/10 text-blue-400' : 'bg-white/[0.06] text-white/50'">{{ reminder.channel }}</span>
              </div>
            </div>
            <button class="rounded-lg p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Cancel" @click="deleteReminder(reminder.id)">
              <Icon v-if="deleting !== reminder.id" name="lucide:x" class="h-3.5 w-3.5" />
              <Icon v-else name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
