<script setup lang="ts">
definePageMeta({ layout: 'default' });

const repoInput = ref('');
const refInput = ref('main');
const loading = ref(false);
const error = ref('');
const previewManifest = ref<Record<string, any> | null>(null);
const previewLoading = ref(false);

// Official modules (bundled in Docker)
const { data: officialModules, pending: officialLoading } = await useFetch<
  Array<{
    id: string;
    name: string;
    description: string;
    capabilities: string[];
  }>
>('/api/modules/official');

const installingOfficial = ref<string | null>(null);

async function enableOfficialModule(moduleId: string) {
  installingOfficial.value = moduleId;
  error.value = '';
  try {
    // Official modules are already on disk — just trigger a reload so the
    // registry picks them up and the DB entry is created.
    await $fetch('/api/modules/reload', { method: 'POST' });
    await navigateTo('/modules');
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to enable module';
  } finally {
    installingOfficial.value = null;
  }
}

/**
 * Parse owner/repo from input (supports full GitHub URLs).
 */
function parseRepo(input: string): string {
  const trimmed = input.trim();
  // Full URL: https://github.com/owner/repo
  const match = trimmed.match(/github\.com\/([^/]+\/[^/]+)/);
  if (match?.[1]) return match[1].replace(/\.git$/, '');
  return trimmed;
}

async function previewModule() {
  const repo = parseRepo(repoInput.value);
  if (!repo) return;

  previewLoading.value = true;
  previewManifest.value = null;
  error.value = '';

  try {
    // Fetch the manifest from GitHub raw
    const [owner, name] = repo.split('/');
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${name}/${refInput.value}/manifest.json`;
    const manifest = await $fetch<Record<string, any>>(rawUrl);
    previewManifest.value = manifest;
  } catch (err: any) {
    error.value =
      'Could not fetch manifest.json. Ensure the repo has a manifest.json at the root.';
  } finally {
    previewLoading.value = false;
  }
}

async function installModule() {
  const repo = parseRepo(repoInput.value);
  if (!repo) return;

  loading.value = true;
  error.value = '';

  try {
    await $fetch('/api/modules/install', {
      method: 'POST',
      body: {
        repo,
        ref: refInput.value || 'main',
      },
    });
    await navigateTo('/modules');
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Installation failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center gap-2.5 border-b border-gumm-border px-4 py-2.5"
    >
      <NuxtLink
        to="/modules"
        class="text-gumm-muted hover:text-gumm-text transition-colors"
      >
        <Icon name="lucide:arrow-left" class="h-4 w-4" />
      </NuxtLink>
      <Icon name="lucide:download" class="h-4 w-4 text-gumm-accent" />
      <h1 class="text-base font-semibold">Install Module</h1>
    </header>

    <div class="flex-1 overflow-y-auto p-4">
      <div class="mx-auto max-w-lg space-y-4">
        <!-- Official modules catalog -->
        <section
          v-if="officialLoading || (officialModules && officialModules.length)"
          class="space-y-2"
        >
          <h2
            class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gumm-muted"
          >
            <Icon name="lucide:package-check" class="h-3.5 w-3.5" />
            Official Modules
          </h2>

          <div
            v-if="officialLoading"
            class="flex items-center gap-2 text-xs text-gumm-muted py-2"
          >
            <Icon
              name="lucide:loader-circle"
              class="h-3.5 w-3.5 animate-spin"
            />
            Loading…
          </div>

          <div
            v-for="mod in officialModules"
            :key="mod.id"
            class="flex items-start justify-between gap-3 rounded-xl border border-gumm-border bg-gumm-surface px-4 py-3"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{{ mod.name }}</span>
                <span
                  class="rounded-md bg-gumm-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-gumm-accent"
                >
                  built-in
                </span>
              </div>
              <p class="mt-0.5 text-xs text-gumm-muted line-clamp-2">
                {{ mod.description }}
              </p>
              <div
                v-if="mod.capabilities?.length"
                class="mt-1.5 flex flex-wrap gap-1"
              >
                <span
                  v-for="cap in mod.capabilities"
                  :key="cap"
                  class="rounded-md bg-gumm-bg px-1.5 py-0.5 text-[10px] text-gumm-muted"
                  >{{ cap }}</span
                >
              </div>
            </div>
            <button
              :disabled="installingOfficial === mod.id"
              class="shrink-0 flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gumm-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
              @click="enableOfficialModule(mod.id)"
            >
              <Icon
                :name="
                  installingOfficial === mod.id
                    ? 'lucide:loader-circle'
                    : 'lucide:zap'
                "
                :class="[
                  'h-3.5 w-3.5',
                  installingOfficial === mod.id ? 'animate-spin' : '',
                ]"
              />
              {{ installingOfficial === mod.id ? 'Enabling…' : 'Enable' }}
            </button>
          </div>
        </section>

        <!-- Divider -->
        <div v-if="officialModules?.length" class="flex items-center gap-3">
          <div class="h-px flex-1 bg-gumm-border" />
          <span class="text-xs text-gumm-muted">or install from GitHub</span>
          <div class="h-px flex-1 bg-gumm-border" />
        </div>

        <!-- Input -->
        <section
          class="rounded-xl border border-gumm-border bg-gumm-surface p-4 space-y-3"
        >
          <div>
            <label class="text-xs text-gumm-muted mb-1 block"
              >GitHub Repository</label
            >
            <input
              v-model="repoInput"
              type="text"
              placeholder="owner/repo or https://github.com/owner/repo"
              class="w-full rounded-lg border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-accent"
            />
          </div>
          <div>
            <label class="text-xs text-gumm-muted mb-1 block"
              >Branch / Ref</label
            >
            <input
              v-model="refInput"
              type="text"
              placeholder="main"
              class="w-full rounded-lg border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-accent"
            />
          </div>

          <div class="flex gap-2">
            <button
              :disabled="!repoInput.trim() || previewLoading"
              class="flex items-center gap-1.5 rounded-lg border border-gumm-border px-3 py-1.5 text-xs text-gumm-muted transition-all duration-150 hover:bg-white/5 hover:text-gumm-text hover:border-gumm-border-hover disabled:opacity-40 disabled:cursor-not-allowed"
              @click="previewModule"
            >
              <Icon name="lucide:eye" class="h-3.5 w-3.5" />
              {{ previewLoading ? 'Loading...' : 'Preview' }}
            </button>
            <button
              :disabled="!repoInput.trim() || loading"
              class="flex items-center gap-1.5 rounded-lg bg-gumm-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gumm-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
              @click="installModule"
            >
              <Icon name="lucide:download" class="h-3.5 w-3.5" />
              {{ loading ? 'Installing...' : 'Install' }}
            </button>
          </div>
        </section>

        <!-- Error -->
        <div
          v-if="error"
          class="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400"
        >
          <Icon name="lucide:alert-circle" class="h-4 w-4 shrink-0" />
          {{ error }}
        </div>

        <!-- Preview -->
        <section
          v-if="previewManifest"
          class="rounded-xl border border-gumm-accent/30 bg-gumm-surface p-4 animate-slide-up"
        >
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:file-json" class="h-4 w-4 text-gumm-accent" />
            <h2 class="text-sm font-semibold">Manifest Preview</h2>
          </div>
          <div class="space-y-2 text-xs">
            <div class="flex gap-2">
              <span class="text-gumm-muted w-24 shrink-0">ID</span>
              <span>{{ previewManifest.id }}</span>
            </div>
            <div class="flex gap-2">
              <span class="text-gumm-muted w-24 shrink-0">Name</span>
              <span>{{ previewManifest.name }}</span>
            </div>
            <div class="flex gap-2">
              <span class="text-gumm-muted w-24 shrink-0">Version</span>
              <span>{{ previewManifest.version }}</span>
            </div>
            <div class="flex gap-2">
              <span class="text-gumm-muted w-24 shrink-0">Description</span>
              <span class="text-gumm-muted">{{
                previewManifest.description || '—'
              }}</span>
            </div>
            <div v-if="previewManifest.capabilities?.length" class="flex gap-2">
              <span class="text-gumm-muted w-24 shrink-0">Capabilities</span>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="cap in previewManifest.capabilities"
                  :key="cap"
                  class="rounded-md bg-gumm-bg px-1.5 py-0.5 text-[10px] text-gumm-muted"
                >
                  {{ cap }}
                </span>
              </div>
            </div>
          </div>

          <!-- Raw JSON -->
          <details class="mt-3">
            <summary
              class="cursor-pointer text-xs text-gumm-muted hover:text-gumm-text flex items-center gap-1"
            >
              <Icon name="lucide:code" class="h-3 w-3" />
              Raw JSON
            </summary>
            <pre
              class="mt-2 overflow-x-auto rounded-lg bg-gumm-bg p-2.5 text-xs text-gumm-muted"
              >{{ JSON.stringify(previewManifest, null, 2) }}</pre
            >
          </details>
        </section>
      </div>
    </div>
  </div>
</template>
