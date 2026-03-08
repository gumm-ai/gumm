<script setup lang="ts">
definePageMeta({ layout: 'default' });

// ── Types ───────────────────────────────────────────────────────────────────

interface BackgroundJob {
  id: string;
  title: string;
  prompt: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  result: string | null;
  error: string | null;
  conversationId: string;
  parentConversationId: string | null;
  model: string | null;
  moduleIds: string[] | null;
  iterations: number;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface Module {
  id: string;
  name: string;
  status: string;
}

// ── Data ────────────────────────────────────────────────────────────────────

const { data: jobsData, refresh } = await useFetch<{ jobs: BackgroundJob[] }>(
  '/api/jobs',
);

const jobs = computed(() => jobsData.value?.jobs ?? []);

// ── Derived ─────────────────────────────────────────────────────────────────

const activeJobs = computed(() =>
  jobs.value.filter((j) => j.status === 'running' || j.status === 'pending'),
);
const doneJobs = computed(() =>
  jobs.value.filter(
    (j) =>
      j.status === 'done' || j.status === 'failed' || j.status === 'cancelled',
  ),
);

// ── New Job Form ─────────────────────────────────────────────────────────────

const showForm = ref(false);
const newTitle = ref('');
const newPrompt = ref('');
const creating = ref(false);
const improving = ref(false);
const linkedModuleIds = ref<string[]>([]);
const moduleSearch = ref('');
const showModuleDropdown = ref(false);

// Fetch available modules
const { data: availableModules } = useFetch<Module[]>('/api/modules');

const filteredModules = computed(() => {
  const modules = (availableModules.value || []).filter(
    (m) => m.status === 'active' && !linkedModuleIds.value.includes(m.id),
  );
  if (!moduleSearch.value) return modules;
  const q = moduleSearch.value.toLowerCase();
  return modules.filter(
    (m) => m.id.includes(q) || m.name.toLowerCase().includes(q),
  );
});

function addModule(moduleId: string) {
  if (!linkedModuleIds.value.includes(moduleId)) {
    linkedModuleIds.value.push(moduleId);
  }
  moduleSearch.value = '';
  showModuleDropdown.value = false;
}

function removeModule(moduleId: string) {
  linkedModuleIds.value = linkedModuleIds.value.filter((id) => id !== moduleId);
}

function getModuleName(moduleId: string): string {
  return (
    availableModules.value?.find((m) => m.id === moduleId)?.name || moduleId
  );
}

async function createJob() {
  if (!newTitle.value.trim() || !newPrompt.value.trim()) return;
  creating.value = true;
  try {
    await $fetch('/api/jobs', {
      method: 'POST',
      body: {
        title: newTitle.value.trim(),
        prompt: newPrompt.value.trim(),
        moduleIds: linkedModuleIds.value.length
          ? linkedModuleIds.value
          : undefined,
      },
    });
    newTitle.value = '';
    newPrompt.value = '';
    linkedModuleIds.value = [];
    showForm.value = false;
    await refresh();
  } finally {
    creating.value = false;
  }
}

async function improvePrompt() {
  if (!newTitle.value.trim() && !newPrompt.value.trim()) return;
  improving.value = true;
  try {
    const result = await $fetch<{ prompt: string }>('/api/jobs/improve', {
      method: 'POST',
      body: {
        title: newTitle.value.trim(),
        prompt: newPrompt.value.trim(),
      },
    });
    newPrompt.value = result.prompt;
  } catch {
    // silently fail — user can retry
  } finally {
    improving.value = false;
  }
}

// ── Delete / Cancel ──────────────────────────────────────────────────────────

const deleting = ref<string | null>(null);

async function deleteJob(id: string) {
  if (!confirm('Delete this job?')) return;
  deleting.value = id;
  try {
    await $fetch(`/api/jobs/${id}` as string, { method: 'DELETE' });
    await refresh();
  } finally {
    deleting.value = null;
  }
}

function hideModuleDropdown() {
  setTimeout(() => (showModuleDropdown.value = false), 200);
}

// ── Expanded job detail ──────────────────────────────────────────────────────

const expandedId = ref<string | null>(null);
function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

// ── Formatting ───────────────────────────────────────────────────────────────

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

function formatDuration(job: BackgroundJob): string {
  if (!job.startedAt) return '—';
  const end = job.completedAt ?? Date.now();
  const ms = end - job.startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ── SSE real-time updates ────────────────────────────────────────────────────

onMounted(() => {
  const es = new EventSource('/api/jobs/stream');

  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (
        msg.type === 'job.running' ||
        msg.type === 'job.done' ||
        msg.type === 'job.failed' ||
        msg.type === 'job.cancelled'
      ) {
        refresh();
      }
    } catch {
      // ignore malformed events
    }
  };

  onUnmounted(() => es.close());
});
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex shrink-0 items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <Icon name="lucide:git-branch-plus" class="h-4 w-4 text-gumm-accent" />
        <h1 class="text-base font-semibold">Background Jobs</h1>
        <span
          v-if="activeJobs.length"
          class="flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-xs text-indigo-400"
        >
          <span class="relative flex h-1.5 w-1.5">
            <span
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"
            />
            <span
              class="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500"
            />
          </span>
          {{ activeJobs.length }} running
        </span>
        <span
          v-else
          class="rounded-md bg-gumm-surface px-1.5 py-0.5 text-xs text-gumm-muted"
        >
          {{ jobs.length }} total
        </span>
      </div>

      <button
        class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gumm-accent-hover"
        @click="showForm = !showForm"
      >
        <Icon name="lucide:plus" class="h-3.5 w-3.5" />
        New Job
      </button>
    </header>

    <!-- New Job Form -->
    <Transition
      enter-active-class="transition-all duration-150"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition-all duration-150"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="showForm"
        class="shrink-0 border-b border-gumm-border bg-gumm-surface px-4 py-3 space-y-2.5"
      >
        <input
          v-model="newTitle"
          type="text"
          placeholder="Job title (e.g. Research best React patterns)"
          class="w-full rounded-lg border border-gumm-border bg-gumm-bg px-3 py-2 text-sm placeholder-gumm-muted outline-none focus:border-gumm-accent"
          @keydown.esc="showForm = false"
        />
        <textarea
          v-model="newPrompt"
          placeholder="Detailed task description…"
          rows="3"
          class="w-full resize-none rounded-lg border border-gumm-border bg-gumm-bg px-3 py-2 text-sm placeholder-gumm-muted outline-none focus:border-gumm-accent"
        />

        <!-- Linked Modules -->
        <div>
          <label class="block text-xs font-medium text-gumm-muted mb-1.5">
            Modules
            <span class="font-normal text-gumm-muted/60">(optional)</span>
          </label>
          <p class="text-[10px] text-gumm-muted mb-2">
            Restrict this job to specific modules. Leave empty to use all
            available tools.
          </p>

          <!-- Selected modules -->
          <div
            v-if="linkedModuleIds.length > 0"
            class="flex flex-wrap gap-1.5 mb-2"
          >
            <span
              v-for="modId in linkedModuleIds"
              :key="modId"
              class="inline-flex items-center gap-1 rounded-md bg-gumm-accent/10 border border-gumm-accent/20 px-2 py-0.5 text-xs text-gumm-accent"
            >
              <Icon name="lucide:package" class="h-3 w-3" />
              {{ getModuleName(modId) }}
              <button
                type="button"
                class="ml-0.5 hover:text-red-400 transition-colors"
                @click="removeModule(modId)"
              >
                <Icon name="lucide:x" class="h-3 w-3" />
              </button>
            </span>
          </div>

          <!-- Module search input -->
          <div class="relative">
            <div class="relative">
              <Icon
                name="lucide:search"
                class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gumm-muted"
              />
              <input
                v-model="moduleSearch"
                type="text"
                placeholder="Search modules to add..."
                class="w-full rounded-lg border border-gumm-border bg-gumm-bg pl-8 pr-3 py-1.5 text-xs placeholder-gumm-muted outline-none focus:border-gumm-accent"
                @focus="showModuleDropdown = true"
                @blur="hideModuleDropdown"
              />
            </div>

            <!-- Dropdown -->
            <div
              v-if="showModuleDropdown && filteredModules.length > 0"
              class="absolute z-20 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-gumm-border bg-gumm-bg shadow-xl"
            >
              <button
                v-for="mod in filteredModules"
                :key="mod.id"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gumm-text transition-colors hover:bg-gumm-surface"
                @mousedown.prevent="addModule(mod.id)"
              >
                <Icon
                  name="lucide:package"
                  class="h-3.5 w-3.5 text-gumm-muted shrink-0"
                />
                <div class="min-w-0">
                  <span class="font-medium">{{ mod.name }}</span>
                  <span class="text-gumm-muted ml-1.5 font-mono">{{
                    mod.id
                  }}</span>
                </div>
              </button>
            </div>

            <div
              v-if="
                showModuleDropdown &&
                filteredModules.length === 0 &&
                moduleSearch
              "
              class="absolute z-20 mt-1 w-full rounded-lg border border-gumm-border bg-gumm-bg p-3 shadow-xl"
            >
              <p class="text-xs text-gumm-muted text-center">
                No matching modules
              </p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 justify-between">
          <button
            :disabled="improving || (!newTitle.trim() && !newPrompt.trim())"
            class="flex items-center gap-1.5 rounded-lg border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted transition-colors hover:bg-white/5 hover:text-white hover:border-gumm-border-hover disabled:opacity-50 disabled:cursor-not-allowed"
            @click="improvePrompt"
          >
            <Icon
              :name="improving ? 'lucide:loader-2' : 'lucide:sparkles'"
              class="h-3.5 w-3.5"
              :class="{ 'animate-spin': improving }"
            />
            {{ improving ? 'Improving…' : 'Improve with AI' }}
          </button>
          <div class="flex items-center gap-2">
            <button
              class="rounded-lg px-3 py-1.5 text-xs text-gumm-muted hover:text-white transition-colors"
              @click="showForm = false"
            >
              Cancel
            </button>
            <button
              :disabled="creating || !newTitle.trim() || !newPrompt.trim()"
              class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gumm-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              @click="createJob"
            >
              <Icon
                :name="creating ? 'lucide:loader-2' : 'lucide:play'"
                class="h-3.5 w-3.5"
                :class="creating ? 'animate-spin' : ''"
              />
              {{ creating ? 'Starting…' : 'Start Job' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Job list -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="!jobs.length" class="flex h-full items-center justify-center">
        <div class="text-center space-y-3 animate-fade-in">
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gumm-accent/10 glow-accent"
          >
            <Icon
              name="lucide:git-branch-plus"
              class="h-7 w-7 text-gumm-accent"
            />
          </div>
          <p class="text-sm text-gumm-muted">No background jobs yet</p>
          <p class="text-xs text-gumm-muted">
            Ask Gumm to run tasks in parallel, or create one manually.
          </p>
        </div>
      </div>

      <div v-else class="p-4 space-y-2">
        <!-- Active jobs -->
        <template v-if="activeJobs.length">
          <p
            class="px-1 text-xs font-medium text-gumm-muted uppercase tracking-wide mb-1"
          >
            Running
          </p>
          <div
            v-for="job in activeJobs"
            :key="job.id"
            class="rounded-lg border border-gumm-border bg-gumm-surface"
          >
            <JobCard
              :job="job"
              :expanded="expandedId === job.id"
              :deleting="deleting === job.id"
              @toggle="toggleExpand(job.id)"
              @delete="deleteJob(job.id)"
            />
          </div>
        </template>

        <!-- Completed / failed / cancelled jobs -->
        <template v-if="doneJobs.length">
          <p
            class="px-1 text-xs font-medium text-gumm-muted uppercase tracking-wide mt-4 mb-1"
            :class="activeJobs.length ? 'mt-4' : ''"
          >
            Completed
          </p>
          <div
            v-for="job in [...doneJobs].reverse()"
            :key="job.id"
            class="rounded-lg border border-gumm-border bg-gumm-surface"
          >
            <JobCard
              :job="job"
              :expanded="expandedId === job.id"
              :deleting="deleting === job.id"
              @toggle="toggleExpand(job.id)"
              @delete="deleteJob(job.id)"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
