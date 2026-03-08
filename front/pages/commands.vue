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
  createdAt: Date;
  updatedAt: Date;
}

const { data: commands, refresh } = await useFetch<Command[]>('/api/commands');

const showModal = ref(false);
const editingCommand = ref<Command | null>(null);
const deleting = ref<Set<string>>(new Set());
const toggling = ref<Set<string>>(new Set());

// Separate user commands from module commands
const userCommands = computed(() =>
  (commands.value || []).filter((c) => c.isUserCreated),
);
const moduleCommands = computed(() =>
  (commands.value || []).filter((c) => !c.isUserCreated),
);

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
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:user" class="h-4 w-4 text-gumm-muted" />
            <h2 class="text-sm font-medium text-gumm-muted">Your Commands</h2>
          </div>
          <div class="grid gap-2">
            <div
              v-for="cmd in userCommands"
              :key="cmd.id"
              class="group flex items-center justify-between rounded-xl border border-gumm-border bg-gumm-surface p-3 transition-all hover:border-gumm-border-hover"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gumm-border bg-gumm-bg"
                >
                  <Icon
                    name="lucide:terminal"
                    class="h-4 w-4 text-gumm-accent"
                  />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gumm-text"
                      >/{{ cmd.name }}</span
                    >
                    <span
                      v-if="!cmd.enabled"
                      class="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded"
                      >Disabled</span
                    >
                  </div>
                  <p class="text-xs text-gumm-muted truncate">
                    {{ cmd.shortDescription }}
                  </p>
                </div>
              </div>
              <div
                class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  class="p-1.5 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5"
                  title="Edit"
                  @click="openEdit(cmd)"
                >
                  <Icon name="lucide:pencil" class="h-4 w-4" />
                </button>
                <button
                  class="p-1.5 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5"
                  :title="cmd.enabled ? 'Disable' : 'Enable'"
                  :disabled="toggling.has(cmd.id)"
                  @click="toggleEnabled(cmd)"
                >
                  <Icon
                    :name="
                      cmd.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'
                    "
                    class="h-4 w-4"
                    :class="cmd.enabled ? 'text-green-400' : 'text-gumm-muted'"
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
                    class="h-4 w-4 animate-spin"
                  />
                  <Icon v-else name="lucide:trash-2" class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Module Commands Section -->
        <section v-if="moduleCommands.length > 0">
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:package" class="h-4 w-4 text-gumm-muted" />
            <h2 class="text-sm font-medium text-gumm-muted">Module Commands</h2>
          </div>
          <div class="grid gap-2">
            <div
              v-for="cmd in moduleCommands"
              :key="cmd.id"
              class="group flex items-center justify-between rounded-xl border border-gumm-border bg-gumm-surface p-3 transition-all hover:border-gumm-border-hover"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gumm-border bg-gumm-bg"
                >
                  <Icon name="lucide:package" class="h-4 w-4 text-cyan-400" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gumm-text"
                      >/{{ cmd.name }}</span
                    >
                    <span
                      class="text-[10px] text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded"
                      >{{ cmd.moduleId }}</span
                    >
                    <span
                      v-if="!cmd.enabled"
                      class="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded"
                      >Disabled</span
                    >
                  </div>
                  <p class="text-xs text-gumm-muted truncate">
                    {{ cmd.shortDescription }}
                  </p>
                </div>
              </div>
              <div
                class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  class="p-1.5 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5"
                  title="View details"
                  @click="openEdit(cmd)"
                >
                  <Icon name="lucide:eye" class="h-4 w-4" />
                </button>
                <button
                  class="p-1.5 text-gumm-muted hover:text-gumm-text transition-colors rounded-lg hover:bg-white/5"
                  :title="cmd.enabled ? 'Disable' : 'Enable'"
                  :disabled="toggling.has(cmd.id)"
                  @click="toggleEnabled(cmd)"
                >
                  <Icon
                    :name="
                      cmd.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'
                    "
                    class="h-4 w-4"
                    :class="cmd.enabled ? 'text-green-400' : 'text-gumm-muted'"
                  />
                </button>
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
