<script setup lang="ts">
definePageMeta({ layout: false });

// ── Redirect if setup already done ──────────────────────────────────
const { data: setupStatus } = await useFetch('/api/setup/status');
if (setupStatus.value && !setupStatus.value.needsSetup) {
  await navigateTo('/', { replace: true });
}

// Password already set via setup-server.sh → skip Security step
const hasEnvPassword = setupStatus.value?.hasEnvPassword ?? false;
// Telegram already configured via env/server script → skip Telegram step
const hasTelegram = setupStatus.value?.hasTelegram ?? false;
// Network mode (netbird = no webhook needed)
const networkMode = setupStatus.value?.networkMode ?? 'public';

// ── Steps ───────────────────────────────────────────────────────────
const currentStep = ref(0);
const loading = ref(false);
const error = ref('');

const allSteps = [
  { title: 'Welcome', icon: 'lucide:sparkles', id: 'welcome' },
  { title: 'Language', icon: 'lucide:globe', id: 'language' },
  { title: 'Security', icon: 'lucide:lock', id: 'security' },
  { title: 'API', icon: 'lucide:zap', id: 'api' },
  { title: 'Telegram', icon: 'lucide:send', id: 'telegram' },
  { title: 'Launch', icon: 'lucide:rocket', id: 'launch' },
];

// Filter out steps that are already configured
const steps = computed(() =>
  allSteps.filter((s) => {
    if (s.id === 'security' && hasEnvPassword) return false;
    if (s.id === 'telegram' && hasTelegram) return false;
    return true;
  }),
);
const currentStepId = computed(() => steps.value[currentStep.value]?.id);

const { fetch: refreshSession } = useUserSession();

// ── Form state ──────────────────────────────────────────────────────
const form = reactive({
  language: 'en',
  password: '',
  passwordConfirm: '',
  openrouterApiKey: '',
  mistralApiKey: '',
  llmModel: '', // Will be set by Api.vue from dynamically fetched models
  telegram: {
    botToken: '',
    webhookUrl: '',
    allowedChatIds: '',
  },
});

const telegramBotInfo = ref<{ username: string; first_name: string } | null>(
  null,
);

// ── Validation ──────────────────────────────────────────────────────
const canNext = computed(() => {
  switch (currentStepId.value) {
    case 'welcome':
      return true;
    case 'language':
      return !!form.language;
    case 'security':
      return (
        form.password.trim().length >= 4 &&
        form.password === form.passwordConfirm
      );
    case 'api':
      return true; // API key is optional
    case 'telegram':
      return true; // Telegram is optional
    case 'launch':
      return true;
    default:
      return true;
  }
});

function next() {
  if (canNext.value && currentStep.value < steps.value.length - 1) {
    currentStep.value++;
    error.value = '';
  }
}

function prev() {
  if (currentStep.value > 0) {
    currentStep.value--;
    error.value = '';
  }
}

// ── Submit ──────────────────────────────────────────────────────────
async function completeSetup() {
  loading.value = true;
  error.value = '';

  try {
    await $fetch('/api/setup/complete', {
      method: 'POST',
      body: {
        // Only send password if not using env var
        password: hasEnvPassword ? undefined : form.password,
        language: form.language,
        openrouterApiKey: form.openrouterApiKey.trim() || undefined,
        mistralApiKey: form.mistralApiKey.trim() || undefined,
        llmModel: form.llmModel || undefined,
        telegram: form.telegram.botToken.trim()
          ? {
              botToken: form.telegram.botToken.trim(),
              webhookUrl: form.telegram.webhookUrl.trim() || undefined,
              allowedChatIds: form.telegram.allowedChatIds.trim() || undefined,
            }
          : undefined,
      },
    });

    // Refresh client-side session state (server already created the session)
    await refreshSession();
    // Clear the cached setup check so middleware re-fetches the new status
    useState('setup-checked').value = true;

    await navigateTo('/?welcome=true');
  } catch (err: any) {
    error.value = err.data?.message || 'Setup failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="flex h-screen items-center justify-center bg-gumm-bg p-4 relative overflow-hidden"
  >
    <div
      class="relative w-full max-w-lg rounded-xl border border-gumm-border bg-gumm-surface shadow-2xl shadow-black animate-slide-up"
    >
      <!-- Progress bar -->
      <div
        class="flex items-center gap-1 border-b border-gumm-border px-4 py-3"
      >
        <template v-for="(step, i) in steps" :key="i">
          <button
            class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors duration-150"
            :class="
              i === currentStep
                ? 'bg-white text-black'
                : i < currentStep
                  ? 'text-gumm-text'
                  : 'text-gumm-muted hover:text-white'
            "
            :disabled="i > currentStep"
            @click="i < currentStep ? (currentStep = i) : null"
          >
            <Icon :name="step.icon" class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">{{ step.title }}</span>
          </button>
          <Icon
            v-if="i < steps.length - 1"
            name="lucide:chevron-right"
            class="h-3 w-3 text-gumm-muted/30"
          />
        </template>
      </div>

      <!-- Step content -->
      <div class="p-6">
        <SetupWelcome v-if="currentStepId === 'welcome'" />
        <SetupLanguage v-else-if="currentStepId === 'language'" :form="form" />
        <SetupSecurity v-else-if="currentStepId === 'security'" :form="form" />
        <SetupApi v-else-if="currentStepId === 'api'" :form="form" />
        <SetupTelegram
          v-else-if="currentStepId === 'telegram'"
          :form="form"
          :telegram-bot-info="telegramBotInfo"
          :network-mode="networkMode"
          @update:telegramBotInfo="telegramBotInfo = $event"
        />
        <SetupLaunch
          v-else-if="currentStepId === 'launch'"
          :form="form"
          :telegram-bot-info="telegramBotInfo"
          :error="error"
        />
      </div>

      <!-- Footer / Navigation -->
      <div
        class="flex items-center justify-between border-t border-gumm-border px-6 py-3"
      >
        <button
          v-if="currentStep > 0"
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-gumm-muted transition-colors hover:bg-white/5 hover:text-gumm-text"
          @click="prev"
        >
          <Icon name="lucide:arrow-left" class="h-3.5 w-3.5" />
          Back
        </button>
        <span v-else />

        <button
          v-if="currentStep < steps.length - 1"
          :disabled="!canNext"
          class="flex items-center gap-1.5 rounded-md bg-white px-4 py-1.5 text-xs font-semibold text-black transition-colors duration-150 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          @click="next"
        >
          Continue
          <Icon name="lucide:arrow-right" class="h-3.5 w-3.5" />
        </button>
        <button
          v-else
          :disabled="loading || !canNext"
          class="flex items-center gap-1.5 rounded-md bg-white px-4 py-1.5 text-xs font-semibold text-black transition-colors duration-150 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
          @click="completeSetup"
        >
          <Icon
            v-if="loading"
            name="lucide:loader"
            class="h-3.5 w-3.5 animate-spin"
          />
          <Icon v-else name="lucide:rocket" class="h-3.5 w-3.5" />
          {{ loading ? 'Setting up...' : 'Launch Gumm' }}
        </button>
      </div>
    </div>
  </div>
</template>
