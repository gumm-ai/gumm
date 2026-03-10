<script setup lang="ts">
import { ref, computed } from 'vue';

definePageMeta({ layout: 'default' });

interface Command {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  moduleId: string | null;
  enabled: boolean;
  isUserCreated: boolean;
  linkedModuleIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const { data: commands, refresh } = await useFetch<Command[]>('/api/commands');

const showModal = ref(false);
const editingCommand = ref<Command | null>(null);
const deleting = ref<Set<string>>(new Set());
const toggling = ref<Set<string>>(new Set());

const userCommands = computed(() => (commands.value || []).filter((c) => c.isUserCreated));
const systemCommands = computed(() => (commands.value || []).filter((c) => c.moduleId === 'system'));
const moduleCommands = computed(() => (commands.value || []).filter((c) => !c.isUserCreated && c.moduleId !== 'system'));

const groupedModuleCommands = computed(() => {
  const groups = new Map<string, Command[]>();
  for (const cmd of moduleCommands.value) {
    const mId = cmd.moduleId || 'other';
    if (!groups.has(mId)) groups.set(mId, []);
    groups.get(mId)!.push(cmd);
  }
  return Array.from(groups.entries()).map(([moduleId, commands]) => ({ moduleId, commands })).sort((a, b) => a.moduleId.localeCompare(b.moduleId));
});

function openCreate() {
  editingCommand.value = null;
  showModal.value = true;
}

function openEdit(cmd: Command) {
  editingCommand.value = cmd;
  showModal.value = true;
}

async function toggleEnabled(cmd: Command) {
  toggling.value.add(cmd.id);
  try {
    await $fetch(`/api/commands/${cmd.id}`, { method: 'PUT', body: { enabled: !cmd.enabled } });
    await refresh();
  } finally {
    toggling.value.delete(cmd.id);
  }
}

async function deleteCommand(cmd: Command) {
  if (!confirm(`Delete command "/${cmd.name}"?`)) return;
  deleting.value.add(cmd.id);
  try {
    await $fetch(`/api/commands/${cmd.id}`, { method: 'DELETE' });
    await refresh();
  } finally {
    deleting.value.delete(cmd.id);
  }
}

function handleSaved() {
  showModal.value = false;
  editingCommand.value = null;
  refresh();
}

function handleClose() {
  showModal.value = false;
  editingCommand.value = null;
}
</script>

<template>
  <div class="flex h-full flex-col bg-gumm-bg">
    <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center justify-between px-6 h-14">
        <div class="flex items-center gap-3">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <Icon name="lucide:terminal" class="h-4 w-4 text-white/70" />
          </div>
          <div>
            <h1 class="text-sm font-medium text-white tracking-tight">Commands</h1>
            <p class="text-[11px] text-white/40">Slash shortcuts for chat</p>
          </div>
          <span class="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">{{ commands?.length || 0 }}</span>
        </div>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90"
          @click="openCreate"
        >
          <Icon name="lucide:plus" class="h-3.5 w-3.5" />
          New Command
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="!commands?.length" class="flex h-full items-center justify-center">
        <div class="text-center">
          <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-4">
            <Icon name="lucide:terminal" class="h-6 w-6 text-white/50" />
          </div>
          <p class="text-base font-medium text-white/90 mb-1">No commands yet</p>
          <p class="text-sm text-white/40 mb-4">Create slash commands to quickly trigger actions in chat</p>
          <button
            class="inline-flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-xs font-medium transition-all hover:bg-white/90"
            @click="openCreate"
          >
            <Icon name="lucide:plus" class="h-3.5 w-3.5" />
            Create your first command
          </button>
        </div>
      </div>

      <div v-else class="max-w-4xl mx-auto space-y-8">
        <section v-if="userCommands.length > 0">
          <div class="flex items-center gap-2 mb-3">
            <div class="flex h-6 w-6 items-center justify-center rounded bg-white/[0.06]">
              <Icon name="lucide:user" class="h-3.5 w-3.5 text-white/50" />
            </div>
            <h2 class="text-xs font-medium text-white/70 uppercase tracking-wider">Your Commands</h2>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <div
              v-for="cmd in userCommands"
              :key="cmd.id"
              class="group flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 transition-all hover:bg-white/[0.04]"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                  <Icon name="lucide:terminal" class="h-4 w-4 text-white/50" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-white/90">/{{ cmd.name }}</span>
                    <span v-if="!cmd.enabled" class="text-[9px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">Disabled</span>
                  </div>
                  <p class="text-xs text-white/40 truncate">{{ cmd.shortDescription }}</p>
                </div>
              </div>
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="p-1.5 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/[0.04]" @click="openEdit(cmd)">
                  <Icon name="lucide:pencil" class="h-3.5 w-3.5" />
                </button>
                <button
                  class="p-1.5 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/[0.04]"
                  :disabled="toggling.has(cmd.id)"
                  @click="toggleEnabled(cmd)"
                >
                  <Icon :name="cmd.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'" class="h-3.5 w-3.5" :class="cmd.enabled ? 'text-emerald-400' : ''" />
                </button>
                <button
                  class="p-1.5 text-white/40 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                  :disabled="deleting.has(cmd.id)"
                  @click="deleteCommand(cmd)"
                >
                  <Icon v-if="deleting.has(cmd.id)" name="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
                  <Icon v-else name="lucide:trash-2" class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="systemCommands.length > 0">
          <div class="flex items-center gap-2 mb-3">
            <div class="flex h-6 w-6 items-center justify-center rounded bg-white/[0.06]">
              <Icon name="lucide:zap" class="h-3.5 w-3.5 text-white/50" />
            </div>
            <h2 class="text-xs font-medium text-white/70 uppercase tracking-wider">Built-in</h2>
          </div>
          <div class="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden divide-y divide-white/[0.06]">
            <div
              v-for="cmd in systemCommands"
              :key="cmd.id"
              class="group flex items-center justify-between p-3.5 transition-all hover:bg-white/[0.02]"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                  <Icon name="lucide:terminal" class="h-3.5 w-3.5 text-white/50" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-white/90">/{{ cmd.name }}</span>
                    <span v-if="!cmd.enabled" class="text-[9px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">Disabled</span>
                  </div>
                  <p class="text-xs text-white/40 truncate">{{ cmd.shortDescription }}</p>
                </div>
              </div>
              <button
                class="p-1.5 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/[0.04]"
                :disabled="toggling.has(cmd.id)"
                @click="toggleEnabled(cmd)"
              >
                <Icon :name="cmd.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'" class="h-4 w-4" :class="cmd.enabled ? 'text-emerald-400' : ''" />
              </button>
            </div>
          </div>
        </section>

        <section v-if="moduleCommands.length > 0">
          <div class="flex items-center gap-2 mb-3">
            <div class="flex h-6 w-6 items-center justify-center rounded bg-white/[0.06]">
              <Icon name="lucide:blocks" class="h-3.5 w-3.5 text-white/50" />
            </div>
            <h2 class="text-xs font-medium text-white/70 uppercase tracking-wider">Module Commands</h2>
          </div>
          <div class="space-y-3">
            <div v-for="group in groupedModuleCommands" :key="group.moduleId" class="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
              <div class="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.01]">
                <div class="flex items-center gap-2">
                  <Icon name="lucide:package" class="h-4 w-4 text-white/40" />
                  <span class="text-xs font-medium text-white/70">{{ group.moduleId }}</span>
                </div>
                <span class="text-[10px] text-white/40">{{ group.commands.length }}</span>
              </div>
              <div class="divide-y divide-white/[0.06]">
                <div
                  v-for="cmd in group.commands"
                  :key="cmd.id"
                  class="group flex items-center justify-between p-3.5 transition-all hover:bg-white/[0.02]"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                      <Icon name="lucide:terminal" class="h-3.5 w-3.5 text-white/50" />
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-white/90">/{{ cmd.name }}</span>
                        <span v-if="!cmd.enabled" class="text-[9px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">Disabled</span>
                      </div>
                      <p class="text-xs text-white/40 truncate">{{ cmd.shortDescription }}</p>
                    </div>
                  </div>
                  <button
                    class="p-1.5 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/[0.04]"
                    :disabled="toggling.has(cmd.id)"
                    @click="toggleEnabled(cmd)"
                  >
                    <Icon :name="cmd.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'" class="h-4 w-4" :class="cmd.enabled ? 'text-emerald-400' : ''" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <CommandModal :show="showModal" :command="editingCommand" @close="handleClose" @saved="handleSaved" />
  </div>
</template>
