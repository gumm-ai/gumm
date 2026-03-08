<script setup lang="ts">
import { ref, watch, computed } from 'vue';

interface Command {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  moduleId: string | null;
  enabled: boolean;
  isUserCreated: boolean;
  linkedModuleIds?: string[];
}

interface Module {
  id: string;
  name: string;
  status: string;
}

const props = defineProps<{
  show: boolean;
  command: Command | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const form = ref({
  name: '',
  shortDescription: '',
  description: '',
  linkedModuleIds: [] as string[],
});

const saving = ref(false);
const improving = ref(false);
const error = ref('');
const moduleSearch = ref('');
const showModuleDropdown = ref(false);

const isEditing = computed(() => !!props.command);
const isModuleCommand = computed(() => !!props.command?.moduleId);
const canEdit = computed(() => !isModuleCommand.value);

// Fetch available modules
const { data: availableModules } = useFetch<Module[]>('/api/modules');

const filteredModules = computed(() => {
  const modules = (availableModules.value || []).filter(
    (m) => m.status === 'active' && !form.value.linkedModuleIds.includes(m.id),
  );
  if (!moduleSearch.value) return modules;
  const q = moduleSearch.value.toLowerCase();
  return modules.filter(
    (m) => m.id.includes(q) || m.name.toLowerCase().includes(q),
  );
});

function addModule(moduleId: string) {
  if (!form.value.linkedModuleIds.includes(moduleId)) {
    form.value.linkedModuleIds.push(moduleId);
  }
  moduleSearch.value = '';
  showModuleDropdown.value = false;
}

function removeModule(moduleId: string) {
  form.value.linkedModuleIds = form.value.linkedModuleIds.filter(
    (id) => id !== moduleId,
  );
}

function getModuleName(moduleId: string): string {
  return (
    availableModules.value?.find((m) => m.id === moduleId)?.name || moduleId
  );
}

// Reset form when modal opens/closes or command changes
watch(
  () => [props.show, props.command],
  () => {
    if (props.show) {
      if (props.command) {
        form.value = {
          name: props.command.name,
          shortDescription: props.command.shortDescription,
          description: props.command.description,
          linkedModuleIds: [...(props.command.linkedModuleIds || [])],
        };
      } else {
        form.value = {
          name: '',
          shortDescription: '',
          description: '',
          linkedModuleIds: [],
        };
      }
      error.value = '';
      moduleSearch.value = '';
      showModuleDropdown.value = false;
    }
  },
  { immediate: true },
);

// Auto-format command name
watch(
  () => form.value.name,
  (val) => {
    form.value.name = val
      .toLowerCase()
      .replace(/^\//, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  },
);

function handleClose() {
  emit('close');
}

async function handleImprove() {
  if (!form.value.name.trim()) {
    error.value = 'Enter a command name first';
    return;
  }

  improving.value = true;
  error.value = '';

  try {
    const result = await $fetch<{
      shortDescription: string;
      description: string;
    }>('/api/commands/improve', {
      method: 'POST',
      body: {
        name: form.value.name,
        shortDescription: form.value.shortDescription,
        description: form.value.description,
      },
    });

    form.value.shortDescription = result.shortDescription;
    form.value.description = result.description;
  } catch (err: any) {
    error.value = err.data?.message || 'Failed to improve descriptions';
  } finally {
    improving.value = false;
  }
}

async function handleSubmit() {
  if (!form.value.name.trim()) {
    error.value = 'Command name is required';
    return;
  }
  if (!form.value.shortDescription.trim()) {
    error.value = 'Short description is required';
    return;
  }
  if (!form.value.description.trim()) {
    error.value = 'Description is required';
    return;
  }

  saving.value = true;
  error.value = '';

  try {
    if (isEditing.value && props.command) {
      await $fetch(`/api/commands/${props.command.id}`, {
        method: 'PUT',
        body: canEdit.value
          ? {
              name: form.value.name,
              shortDescription: form.value.shortDescription,
              description: form.value.description,
              linkedModuleIds: form.value.linkedModuleIds,
            }
          : {
              linkedModuleIds: form.value.linkedModuleIds,
            },
      });
    } else {
      await $fetch('/api/commands', {
        method: 'POST',
        body: {
          name: form.value.name,
          shortDescription: form.value.shortDescription,
          description: form.value.description,
          linkedModuleIds: form.value.linkedModuleIds,
        },
      });
    }
    emit('saved');
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to save command';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="handleClose"
        />

        <div
          class="relative z-10 w-full max-w-lg rounded-2xl border border-gumm-border bg-gumm-bg p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          <!-- Header -->
          <div class="mb-5 flex items-center justify-between">
            <h2 class="text-sm font-semibold">
              {{
                isEditing
                  ? isModuleCommand
                    ? 'View Command'
                    : 'Edit Command'
                  : 'New Command'
              }}
            </h2>
            <button
              class="text-gumm-muted transition-colors hover:text-gumm-text"
              @click="handleClose"
            >
              <Icon name="lucide:x" class="h-4 w-4" />
            </button>
          </div>

          <!-- Module Command Notice -->
          <div
            v-if="isModuleCommand"
            class="mb-4 flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-400"
          >
            <Icon name="lucide:info" class="h-4 w-4 shrink-0" />
            <span>
              This command is provided by the
              <strong>{{ command?.moduleId }}</strong> module. It can only be
              enabled/disabled, not edited.
            </span>
          </div>

          <!-- Error -->
          <div
            v-if="error"
            class="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400"
          >
            <Icon name="lucide:alert-circle" class="h-4 w-4 shrink-0" />
            {{ error }}
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-4">
            <!-- Command Name -->
            <div>
              <label class="block text-xs font-medium text-gumm-muted mb-1.5">
                Command Name
              </label>
              <div class="relative">
                <span
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-gumm-muted text-sm"
                  >/</span
                >
                <input
                  v-model="form.name"
                  type="text"
                  placeholder="my_command"
                  :disabled="isModuleCommand"
                  class="w-full rounded-lg border border-gumm-border bg-gumm-surface px-3 py-2 pl-7 text-sm text-gumm-text placeholder-gumm-muted/50 transition-colors focus:border-gumm-accent focus:outline-none disabled:opacity-50"
                />
              </div>
              <p class="mt-1 text-[10px] text-gumm-muted">
                Lowercase letters, numbers, and underscores only
              </p>
            </div>

            <!-- Short Description -->
            <div>
              <label class="block text-xs font-medium text-gumm-muted mb-1.5">
                Short Description
              </label>
              <input
                v-model="form.shortDescription"
                type="text"
                maxlength="100"
                placeholder="Brief one-liner about what this command does"
                :disabled="isModuleCommand"
                class="w-full rounded-lg border border-gumm-border bg-gumm-surface px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted/50 transition-colors focus:border-gumm-accent focus:outline-none disabled:opacity-50"
              />
              <p class="mt-1 text-[10px] text-gumm-muted">
                {{ form.shortDescription.length }}/100 characters
              </p>
            </div>

            <!-- Detailed Description -->
            <div>
              <label class="block text-xs font-medium text-gumm-muted mb-1.5">
                Detailed Description
              </label>
              <textarea
                v-model="form.description"
                rows="5"
                placeholder="Detailed instructions for the AI when this command is triggered. Describe what actions to take, what information to provide, etc."
                :disabled="isModuleCommand"
                class="w-full rounded-lg border border-gumm-border bg-gumm-surface px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted/50 transition-colors focus:border-gumm-accent focus:outline-none resize-none disabled:opacity-50"
              />
            </div>

            <!-- Linked Modules (optional) -->
            <div>
              <label class="block text-xs font-medium text-gumm-muted mb-1.5">
                Linked Modules
                <span class="font-normal text-gumm-muted/60">(optional)</span>
              </label>
              <p class="text-[10px] text-gumm-muted mb-2">
                Restrict this command to only use tools from specific modules.
                Leave empty to use all available tools.
              </p>

              <!-- Selected modules -->
              <div
                v-if="form.linkedModuleIds.length > 0"
                class="flex flex-wrap gap-1.5 mb-2"
              >
                <span
                  v-for="modId in form.linkedModuleIds"
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
                    class="w-full rounded-lg border border-gumm-border bg-gumm-surface pl-8 pr-3 py-1.5 text-xs text-gumm-text placeholder-gumm-muted/50 transition-colors focus:border-gumm-accent focus:outline-none"
                    @focus="showModuleDropdown = true"
                    @blur="setTimeout(() => (showModuleDropdown = false), 200)"
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

            <!-- Actions -->
            <div class="flex items-center justify-between pt-2">
              <!-- Improve with AI button -->
              <button
                v-if="canEdit"
                type="button"
                :disabled="improving || !form.name.trim()"
                class="flex items-center gap-1.5 rounded-lg border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted transition-colors hover:bg-white/5 hover:text-gumm-text hover:border-gumm-border-hover disabled:opacity-50"
                @click="handleImprove"
              >
                <Icon
                  :name="improving ? 'lucide:loader-2' : 'lucide:sparkles'"
                  class="h-3.5 w-3.5"
                  :class="{ 'animate-spin': improving }"
                />
                {{ improving ? 'Improving...' : 'Improve with AI' }}
              </button>
              <div v-else />

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted transition-colors hover:bg-white/5 hover:text-gumm-text"
                  @click="handleClose"
                >
                  {{ isModuleCommand ? 'Close' : 'Cancel' }}
                </button>
                <button
                  v-if="canEdit"
                  type="submit"
                  :disabled="saving"
                  class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover disabled:opacity-50"
                >
                  <Icon
                    v-if="saving"
                    name="lucide:loader-2"
                    class="h-3.5 w-3.5 animate-spin"
                  />
                  {{ saving ? 'Saving...' : isEditing ? 'Update' : 'Create' }}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
