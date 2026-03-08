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

// Separate user commands from system and module commands
const userCommands = computed(() =>
  (commands.value || []).filter((c) => c.isUserCreated),
);
const systemCommands = computed(() =>
  (commands.value || []).filter((c) => c.moduleId === 'system'),
);
const moduleCommands = computed(() =>
  (commands.value || []).filter(
    (c) => !c.isUserCreated && c.moduleId !== 'system',
  ),
);

// Group module commands by moduleId for the UI
const groupedModuleCommands = computed(() => {
  const groups = new Map<string, Command[]>();
  for (const cmd of moduleCommands.value) {
    const mId = cmd.moduleId || 'other';
    if (!groups.has(mId)) {
      groups.set(mId, []);
    }
    groups.get(mId)!.push(cmd);
  }
  return Array.from(groups.entries())
    .map(([moduleId, commands]) => ({ moduleId, commands }))
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId));
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
    await $fetch(`/api/commands/${cmd.id}`, {
      method: 'PUT',
      body: { enabled: !cmd.enabled },
    });
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
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <Icon name="lucide:terminal" class="h-5 w-5 text-gumm-accent" />
        <h1 class="text-base font-semibold">Commands</h1>
        <span
          class="rounded-md bg-gumm-surface px-1.5 py-0.5 text-xs text-gumm-muted"
        >
          {{ commands?.length || 0 }} commands
        </span>
      </div>
      <button
        class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover"
        @click="openCreate"
      >
        <Icon name="lucide:plus" class="h-3.5 w-3.5" />
        New Command
      </button>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6">
      <!-- Empty state -->
      <div
        v-if="!commands?.length"
        class="flex h-full items-center justify-center animate-fade-in"
      >
        <div class="text-center space-y-3">
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gumm-accent/10 text-gumm-accent border border-gumm-accent/20"
          >
            <Icon name="lucide:terminal" class="h-6 w-6" />
          </div>
          <p class="text-sm font-medium text-gumm-text">No commands yet</p>
          <p class="text-xs text-gumm-muted max-w-xs">
            Create slash commands to quickly trigger actions in chat, Telegram,
            or CLI.
          </p>
          <button
            class="inline-flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover"
            @click="openCreate"
          >
            <Icon name="lucide:plus" class="h-3.5 w-3.5" />
            Create your first command
          </button>
        </div>
      </div>

      <template v-else>
        <!-- User Commands Section -->
        <section v-if="userCommands.length > 0">
          <div class="flex items-center gap-2 mb-4">
            <div
              class="flex h-7 w-7 items-center justify-center rounded bg-gumm-accent/10 text-gumm-accent"
            >
              <Icon name="lucide:user" class="h-4 w-4" />
            </div>
            <h2 class="text-sm font-medium text-gumm-text">Your Commands</h2>
          </div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="cmd in userCommands"
              :key="cmd.id"
              class="group flex flex-col justify-between rounded-xl border border-gumm-border bg-gumm-surface p-4 transition-all hover:border-gumm-border-hover"
            >
              <div class="flex items-start justify-between gap-3 min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gumm-border bg-gumm-bg"
                  >
                    <Icon
                      name="lucide:terminal"
                      class="h-4 w-4 text-gumm-accent"
                    />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-gumm-text truncate"
                        >/{{ cmd.name }}</span
                      >
                      <span
                        v-if="!cmd.enabled"
                        class="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded font-medium"
                        >Disabled</span
                      >
                    </div>
                  </div>
                </div>
                <div
                  class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-1"
                >
                  <button
                    class="p-1.5 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5"
                    title="Edit"
                    @click="openEdit(cmd)"
                  >
                    <Icon name="lucide:pencil" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    class="p-1.5 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5"
                    :title="cmd.enabled ? 'Disable' : 'Enable'"
                    :disabled="toggling.has(cmd.id)"
                    @click="toggleEnabled(cmd)"
                  >
                    <Icon
                      :name="
                        cmd.enabled
                          ? 'lucide:toggle-right'
                          : 'lucide:toggle-left'
                      "
                      class="h-3.5 w-3.5"
                      :class="
                        cmd.enabled ? 'text-green-400' : 'text-gumm-muted'
                      "
                    />
                  </button>
                  <button
                    class="p-1.5 text-gumm-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/5"
                    title="Delete"
                    :disabled="deleting.has(cmd.id)"
                    @click="deleteCommand(cmd)"
                  >
                    <Icon
                      v-if="deleting.has(cmd.id)"
                      name="lucide:loader-2"
                      class="h-3.5 w-3.5 animate-spin"
                    />
                    <Icon v-else name="lucide:trash-2" class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p class="text-xs text-gumm-muted mt-3 line-clamp-2">
                {{ cmd.shortDescription }}
              </p>
              <!-- Linked modules -->
              <div
                v-if="cmd.linkedModuleIds?.length"
                class="flex flex-wrap gap-1 mt-2"
              >
                <span
                  v-for="modId in cmd.linkedModuleIds"
                  :key="modId"
                  class="inline-flex items-center gap-1 rounded bg-gumm-accent/10 border border-gumm-accent/20 px-1.5 py-0.5 text-[10px] text-gumm-accent"
                >
                  <Icon name="lucide:package" class="h-2.5 w-2.5" />
                  {{ modId }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- System Commands Section -->
        <section v-if="systemCommands.length > 0">
          <div class="flex items-center gap-2 mb-4">
            <div
              class="flex h-7 w-7 items-center justify-center rounded bg-gumm-accent/10 text-gumm-accent"
            >
              <Icon name="lucide:zap" class="h-4 w-4" />
            </div>
            <h2 class="text-sm font-medium text-gumm-text">
              Built-in Commands
            </h2>
            <span
              class="rounded-md bg-gumm-surface px-1.5 py-0.5 text-[10px] text-gumm-muted"
            >
              {{ systemCommands.length }}
            </span>
          </div>
          <div
            class="rounded-xl border border-gumm-border bg-gumm-surface/50 overflow-hidden"
          >
            <div class="divide-y divide-gumm-border/60">
              <div
                v-for="cmd in systemCommands"
                :key="cmd.id"
                class="group flex items-center justify-between p-3.5 transition-colors hover:bg-gumm-surface relative"
              >
                <div class="flex items-start gap-3.5 min-w-0">
                  <div
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gumm-accent/20 bg-gumm-accent/5 mt-0.5"
                  >
                    <Icon
                      name="lucide:terminal"
                      class="h-3 w-3 text-gumm-accent"
                    />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-sm font-medium text-gumm-text"
                        >/{{ cmd.name }}</span
                      >
                      <span
                        v-if="!cmd.enabled"
                        class="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded font-medium"
                        >Disabled</span
                      >
                    </div>
                    <p class="text-[13px] text-gumm-muted truncate max-w-2xl">
                      {{ cmd.shortDescription }}
                    </p>
                  </div>
                </div>
                <div
                  class="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <button
                    class="p-2 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5 active:bg-white/10"
                    title="View details"
                    @click="openEdit(cmd)"
                  >
                    <Icon name="lucide:eye" class="h-4 w-4" />
                  </button>
                  <button
                    class="p-2 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5 active:bg-white/10"
                    :title="cmd.enabled ? 'Disable' : 'Enable'"
                    :disabled="toggling.has(cmd.id)"
                    @click="toggleEnabled(cmd)"
                  >
                    <Icon
                      :name="
                        cmd.enabled
                          ? 'lucide:toggle-right'
                          : 'lucide:toggle-left'
                      "
                      class="h-4 w-4"
                      :class="
                        cmd.enabled ? 'text-green-400' : 'text-gumm-muted'
                      "
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Module Commands Section -->
        <section v-if="moduleCommands.length > 0">
          <div class="flex items-center gap-2 mb-4">
            <div
              class="flex h-7 w-7 items-center justify-center rounded bg-cyan-400/10 text-cyan-400"
            >
              <Icon name="lucide:blocks" class="h-4 w-4" />
            </div>
            <h2 class="text-sm font-medium text-gumm-text">Module Commands</h2>
          </div>

          <div class="grid gap-6">
            <div
              v-for="group in groupedModuleCommands"
              :key="group.moduleId"
              class="rounded-xl border border-gumm-border bg-gumm-surface/50 overflow-hidden"
            >
              <!-- Group Header -->
              <div
                class="flex items-center justify-between border-b border-gumm-border bg-gumm-surface px-4 py-3"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 shadow-sm"
                  >
                    <Icon name="lucide:package" class="h-4 w-4" />
                  </div>
                  <div>
                    <h3 class="text-sm font-semibold text-gumm-text capitalize">
                      {{ String(group.moduleId).replace(/-/g, ' ') }}
                    </h3>
                    <p class="text-xs text-gumm-muted font-mono mt-0.5">
                      {{ group.moduleId }}
                    </p>
                  </div>
                </div>
                <span
                  class="rounded-full bg-gumm-bg px-2 py-0.5 text-[10px] font-medium text-gumm-muted border border-gumm-border hidden sm:inline-block"
                >
                  {{ group.commands.length }}
                  {{ group.commands.length === 1 ? 'command' : 'commands' }}
                </span>
              </div>

              <!-- Commands List -->
              <div class="divide-y divide-gumm-border/60">
                <div
                  v-for="cmd in group.commands"
                  :key="cmd.id"
                  class="group flex items-center justify-between p-3.5 transition-colors hover:bg-gumm-surface relative"
                >
                  <div class="flex items-start gap-3.5 min-w-0">
                    <div
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gumm-border bg-gumm-bg mt-0.5"
                    >
                      <Icon
                        name="lucide:terminal"
                        class="h-3 w-3 text-gumm-muted group-hover:text-gumm-text transition-colors"
                      />
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-sm font-medium text-gumm-text"
                          >/{{ cmd.name }}</span
                        >
                        <span
                          v-if="!cmd.enabled"
                          class="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded font-medium"
                          >Disabled</span
                        >
                      </div>
                      <p class="text-[13px] text-gumm-muted truncate max-w-2xl">
                        {{ cmd.shortDescription }}
                      </p>
                      <!-- Linked modules -->
                      <div
                        v-if="cmd.linkedModuleIds?.length"
                        class="flex flex-wrap gap-1 mt-1"
                      >
                        <span
                          v-for="modId in cmd.linkedModuleIds"
                          :key="modId"
                          class="inline-flex items-center gap-1 rounded bg-gumm-accent/10 border border-gumm-accent/20 px-1.5 py-0.5 text-[10px] text-gumm-accent"
                        >
                          <Icon name="lucide:package" class="h-2.5 w-2.5" />
                          {{ modId }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <!-- Actions -->
                  <div
                    class="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <button
                      class="p-2 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5 active:bg-white/10"
                      title="View details"
                      @click="openEdit(cmd)"
                    >
                      <Icon name="lucide:eye" class="h-4 w-4" />
                    </button>
                    <button
                      class="p-2 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5 active:bg-white/10"
                      :title="cmd.enabled ? 'Disable' : 'Enable'"
                      :disabled="toggling.has(cmd.id)"
                      @click="toggleEnabled(cmd)"
                    >
                      <Icon
                        :name="
                          cmd.enabled
                            ? 'lucide:toggle-right'
                            : 'lucide:toggle-left'
                        "
                        class="h-4 w-4"
                        :class="
                          cmd.enabled ? 'text-green-400' : 'text-gumm-muted'
                        "
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>

    <!-- Command Modal -->
    <CommandModal
      :show="showModal"
      :command="editingCommand"
      @close="handleClose"
      @saved="handleSaved"
    />
  </div>
</template>
