<script setup lang="ts">
definePageMeta({ layout: 'default' });

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
  deviceIds: string[] | null;
  persistent: boolean;
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

interface Device {
  id: string;
  name: string;
  status: string;
  os: string | null;
  capabilities: string[];
}

const { data: jobsData, refresh } = await useFetch<{ jobs: BackgroundJob[] }>('/api/jobs');
const jobs = computed(() => jobsData.value?.jobs ?? []);

const activeJobs = computed(() => jobs.value.filter((j) => j.status === 'running' || j.status === 'pending'));
const doneJobs = computed(() => jobs.value.filter((j) => j.status === 'done' || j.status === 'failed' || j.status === 'cancelled'));

const showForm = ref(false);
const newTitle = ref('');
const newPrompt = ref('');
const creating = ref(false);
const improving = ref(false);
const linkedModuleIds = ref<string[]>([]);
const moduleSearch = ref('');
const showModuleDropdown = ref(false);
const linkedDeviceIds = ref<string[]>([]);
const deviceSearch = ref('');
const showDeviceDropdown = ref(false);
const persistent = ref(false);

const { data: availableModules } = useFetch<Module[]>('/api/modules');
const { data: devicesData } = useFetch<{ devices: Device[] }>('/api/devices');
const onlineDevices = computed(() => (devicesData.value?.devices ?? []).filter((d) => d.status === 'online' && d.capabilities.includes('agent')));

const filteredModules = computed(() => {
  const modules = (availableModules.value || []).filter((m) => m.status === 'active' && !linkedModuleIds.value.includes(m.id));
  if (!moduleSearch.value) return modules;
  const q = moduleSearch.value.toLowerCase();
  return modules.filter((m) => m.id.includes(q) || m.name.toLowerCase().includes(q));
});

const filteredDevices = computed(() => {
  const devs = onlineDevices.value.filter((d) => !linkedDeviceIds.value.includes(d.id));
  if (!deviceSearch.value) return devs;
  const q = deviceSearch.value.toLowerCase();
  return devs.filter((d) => d.id.includes(q) || d.name.toLowerCase().includes(q));
});

function addModule(moduleId: string) {
  if (!linkedModuleIds.value.includes(moduleId)) linkedModuleIds.value.push(moduleId);
  moduleSearch.value = '';
  showModuleDropdown.value = false;
}

function removeModule(moduleId: string) {
  linkedModuleIds.value = linkedModuleIds.value.filter((id) => id !== moduleId);
}

function getModuleName(moduleId: string): string {
  return availableModules.value?.find((m) => m.id === moduleId)?.name || moduleId;
}

function addDevice(deviceId: string) {
  if (!linkedDeviceIds.value.includes(deviceId)) linkedDeviceIds.value.push(deviceId);
  deviceSearch.value = '';
  showDeviceDropdown.value = false;
}

function removeDevice(deviceId: string) {
  linkedDeviceIds.value = linkedDeviceIds.value.filter((id) => id !== deviceId);
}

function getDeviceName(deviceId: string): string {
  return onlineDevices.value.find((d) => d.id === deviceId)?.name || deviceId;
}

function hideDeviceDropdown() {
  setTimeout(() => (showDeviceDropdown.value = false), 200);
}

function hideModuleDropdown() {
  setTimeout(() => (showModuleDropdown.value = false), 200);
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
        moduleIds: linkedModuleIds.value.length ? linkedModuleIds.value : undefined,
        deviceIds: linkedDeviceIds.value.length ? linkedDeviceIds.value : undefined,
        persistent: persistent.value || undefined,
      },
    });
    newTitle.value = '';
    newPrompt.value = '';
    linkedModuleIds.value = [];
    linkedDeviceIds.value = [];
    persistent.value = false;
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
      body: { title: newTitle.value.trim(), prompt: newPrompt.value.trim() },
    });
    newPrompt.value = result.prompt;
  } catch {} finally {
    improving.value = false;
  }
}

const deleting = ref<string | null>(null);

async function deleteJob(id: string) {
  if (!confirm('Delete this job?')) return;
  deleting.value = id;
  try {
    await $fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    await refresh();
  } finally {
    deleting.value = null;
  }
}

const expandedId = ref<string | null>(null);
function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

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

onMounted(() => {
  const es = new EventSource('/api/jobs/stream');
  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type?.startsWith('job.')) refresh();
    } catch {}
  };
  onUnmounted(() => es.close());
});
</script>

<template>
  <div class="flex h-full flex-col bg-gumm-bg">
    <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center justify-between px-6 h-14">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <Icon name="lucide:layers" class="h-4 w-4 text-white/70" />
          </div>
          <div>
            <h1 class="text-sm font-medium text-white tracking-tight">Background Jobs</h1>
            <p class="text-[11px] text-white/40">Async task execution</p>
          </div>
          <span v-if="activeJobs.length" class="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/60">
            <span class="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            {{ activeJobs.length }} running
          </span>
        </div>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90"
          @click="showForm = !showForm"
        >
          <Icon name="lucide:plus" class="h-3.5 w-3.5" />
          New Job
        </button>
      </div>
    </header>

    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition-all duration-150"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div v-if="showForm" class="shrink-0 border-b border-white/[0.06] bg-gumm-surface/50 px-6 py-4 space-y-3">
        <input
          v-model="newTitle"
          type="text"
          placeholder="Job title"
          class="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/20 placeholder:text-white/30"
          @keydown.esc="showForm = false"
        />
        <textarea
          v-model="newPrompt"
          placeholder="Detailed task description..."
          rows="3"
          class="w-full resize-none rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/20 placeholder:text-white/30"
        />

        <div class="flex items-center gap-2.5">
          <button
            type="button"
            class="relative flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
            :class="persistent ? 'bg-white/20' : 'bg-white/[0.08]'"
            @click="persistent = !persistent"
          >
            <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform" :class="persistent ? 'translate-x-5' : 'translate-x-0.75'" />
          </button>
          <div>
            <label class="text-xs font-medium text-white/80 cursor-pointer" @click="persistent = !persistent">Persistent</label>
            <p class="text-[10px] text-white/40">Keep running until manually stopped</p>
          </div>
        </div>

        <div class="flex items-center gap-2 justify-between pt-1">
          <button
            :disabled="improving || (!newTitle.trim() && !newPrompt.trim())"
            class="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-white/50 transition-all hover:bg-white/[0.04] hover:text-white/80 disabled:opacity-40"
            @click="improvePrompt"
          >
            <Icon :name="improving ? 'lucide:loader-2' : 'lucide:sparkles'" class="h-3.5 w-3.5" :class="{ 'animate-spin': improving }" />
            {{ improving ? 'Improving...' : 'Improve' }}
          </button>
          <div class="flex items-center gap-2">
            <button class="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:text-white/80 transition-colors" @click="showForm = false">Cancel</button>
            <button
              :disabled="creating || !newTitle.trim() || !newPrompt.trim()"
              class="flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90 disabled:opacity-40"
              @click="createJob"
            >
              <Icon :name="creating ? 'lucide:loader-2' : 'lucide:play'" class="h-3.5 w-3.5" :class="{ 'animate-spin': creating }" />
              {{ creating ? 'Starting...' : 'Start' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <div class="flex-1 overflow-y-auto">
      <div v-if="!jobs.length" class="flex h-full items-center justify-center">
        <div class="text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
            <Icon name="lucide:layers" class="h-6 w-6 text-white/50" />
          </div>
          <p class="text-base font-medium text-white/90 mb-1">No background jobs</p>
          <p class="text-sm text-white/40">Run tasks in parallel with your AI brain</p>
        </div>
      </div>

      <div v-else class="p-6 space-y-6">
        <template v-if="activeJobs.length">
          <div>
            <p class="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-3">Running</p>
            <div class="space-y-2">
              <div v-for="job in activeJobs" :key="job.id" class="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                <JobCard :job="job" :expanded="expandedId === job.id" :deleting="deleting === job.id" @toggle="toggleExpand(job.id)" @delete="deleteJob(job.id)" />
              </div>
            </div>
          </div>
        </template>

        <template v-if="doneJobs.length">
          <div>
            <p class="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-3" :class="activeJobs.length ? 'mt-0' : ''">Completed</p>
            <div class="space-y-2">
              <div v-for="job in [...doneJobs].reverse()" :key="job.id" class="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                <JobCard :job="job" :expanded="expandedId === job.id" :deleting="deleting === job.id" @toggle="toggleExpand(job.id)" @delete="deleteJob(job.id)" />
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
