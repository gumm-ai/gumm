<script setup lang="ts">
import type { OfficialModule } from '~/types/modules';

const props = defineProps<{ module: OfficialModule | null }>();
const emit = defineEmits<{ close: []; finish: [id: string] }>();

const step = ref<'check' | 'no-api' | 'credentials' | 'waiting' | 'success'>(
  'check',
);
const loading = ref(false);
const error = ref('');
const hasGoogleApi = ref(false);
const setupClientId = ref('');
const setupClientSecret = ref('');
const setupEmail = ref('');
let oauthPollInterval: ReturnType<typeof setInterval> | null = null;

watch(
  () => props.module,
  async (newModule) => {
    if (!newModule) {
      if (oauthPollInterval) {
        clearInterval(oauthPollInterval);
        oauthPollInterval = null;
      }
      return;
    }
    // reset state
    step.value = 'check';
    loading.value = true;
    error.value = '';
    hasGoogleApi.value = false;
    setupClientId.value = '';
    setupClientSecret.value = '';
    setupEmail.value = '';

    try {
      const connections =
        await $fetch<{ id: string; provider: string; status: string }[]>(
          '/api/connections',
        );
      const google = connections?.find((c) => c.provider === 'google');
      if (google) {
        hasGoogleApi.value = true;
        const status = await $fetch<{ configured: boolean; email?: string }>(
          '/api/google/status',
        );
        if (status.configured) {
          setupEmail.value = status.email || '';
          step.value = 'success';
          loading.value = false;
          return;
        }
        step.value = 'waiting';
        loading.value = false;
        startOAuthPoll();
        return;
      }
    } catch {}

    step.value = 'no-api';
    loading.value = false;
  },
  { immediate: true },
);

function startOAuthPoll() {
  const popup = window.open(
    '/api/google/auth',
    'google-oauth',
    'width=600,height=700,scrollbars=yes',
  );
  if (oauthPollInterval) clearInterval(oauthPollInterval);
  oauthPollInterval = setInterval(async () => {
    try {
      const status = await $fetch<{ configured: boolean; email?: string }>(
        '/api/google/status',
      );
      if (status.configured) {
        clearInterval(oauthPollInterval!);
        oauthPollInterval = null;
        popup?.close();
        setupEmail.value = status.email || '';
        step.value = 'success';
      }
    } catch {}
  }, 2000);
}

function handleClose() {
  if (oauthPollInterval) {
    clearInterval(oauthPollInterval);
    oauthPollInterval = null;
  }
  emit('close');
}

async function saveCredentialsAndConnect() {
  loading.value = true;
  error.value = '';
  try {
    await $fetch('/api/connections', {
      method: 'POST',
      body: {
        id: 'google',
        name: 'Google',
        provider: 'google',
        authType: 'oauth2',
        config: {
          clientId: setupClientId.value.trim(),
          clientSecret: setupClientSecret.value.trim(),
        },
      },
    }).catch(async () => {
      await $fetch('/api/connections/google', {
        method: 'PUT',
        body: {
          config: {
            clientId: setupClientId.value.trim(),
            clientSecret: setupClientSecret.value.trim(),
          },
        },
      });
    });
  } catch (err: any) {
    error.value =
      err.data?.message || err.message || 'Failed to save credentials';
    loading.value = false;
    return;
  }

  loading.value = false;
  step.value = 'waiting';
  startOAuthPoll();
}

async function finishModuleSetup() {
  if (!props.module) return;
  loading.value = true;
  error.value = '';
  try {
    await $fetch('/api/modules/reload', { method: 'POST' });
    const moduleId = props.module.id;
    handleClose();
    emit('finish', moduleId);
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to enable module';
    loading.value = false;
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
        v-if="module"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="handleClose"
        />

        <div
          class="relative z-10 w-full max-w-lg rounded-2xl border border-gumm-border bg-gumm-bg p-6 shadow-2xl flex flex-col items-center gap-4 py-8"
        >
          <!-- Header -->
          <ModulesSetupModalHeader :module="module" @close="handleClose" />

          <!-- Step: Checking -->
          <div
            v-if="step === 'check'"
            class="flex flex-col items-center gap-4 py-6 w-full"
          >
            <div class="relative">
              <div
                class="h-12 w-12 rounded-full border-2 border-gumm-accent/30"
              />
              <div
                class="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-gumm-accent"
              />
            </div>
            <p class="text-xs text-gumm-muted">
              Checking for Google API connection…
            </p>
          </div>

          <!-- Step: No Google API found -->
          <div v-else-if="step === 'no-api'" class="space-y-4 w-full">
            <div
              class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2 shadow-sm"
            >
              <p
                class="text-xs font-semibold text-amber-500 flex items-center gap-1.5"
              >
                <Icon name="lucide:alert-triangle" class="h-3.5 w-3.5" />
                Google API connection required
              </p>
              <p class="text-[11px] leading-relaxed text-gumm-muted">
                This module requires a Google API connection. You can set one up
                in the <b class="text-gumm-text">APIs</b> page first, then come
                back here to install.
              </p>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <NuxtLink
                to="/apis"
                class="flex items-center justify-center gap-1.5 rounded-xl bg-gumm-accent px-4 py-2 text-xs font-medium text-gumm-bg transition-colors hover:bg-gumm-accent-hover shadow-sm flex-1"
                @click="handleClose"
              >
                <Icon name="lucide:plug-2" class="h-4 w-4" />
                Go to APIs Page
              </NuxtLink>
              <button
                class="flex-1 flex items-center justify-center gap-1.5 text-xs text-gumm-muted hover:text-gumm-text transition-colors border border-gumm-border bg-gumm-surface hover:bg-gumm-bg rounded-xl px-4 py-2"
                @click="step = 'credentials'"
              >
                Enter manually
              </button>
            </div>
          </div>

          <!-- Step: Credentials -->
          <ModulesSetupModalStepCredentials
            v-else-if="step === 'credentials'"
            v-model:setup-client-id="setupClientId"
            v-model:setup-client-secret="setupClientSecret"
            :error="error"
            :loading="loading"
            @close="handleClose"
            @save="saveCredentialsAndConnect"
          />

          <!-- Step: Waiting for authorization -->
          <ModulesSetupModalStepWaiting
            v-else-if="step === 'waiting'"
            @close="handleClose"
          />

          <!-- Step: Success -->
          <ModulesSetupModalStepSuccess
            v-else-if="step === 'success'"
            :email="setupEmail"
            :error="error"
            :loading="loading"
            @finish="finishModuleSetup"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
