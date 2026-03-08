<script setup lang="ts">
definePageMeta({ layout: false });

const { fetch: refreshSession } = useUserSession();
const password = ref('');
const error = ref('');
const loading = ref(false);

async function login() {
  if (!password.value.trim()) return;
  loading.value = true;
  error.value = '';

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { password: password.value },
    });
    await refreshSession();
    await navigateTo('/');
  } catch (err: any) {
    error.value = err.data?.message || 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="flex h-screen items-center justify-center bg-gumm-bg relative overflow-hidden"
  >
    <!-- Subtle background pattern deleted to maintain deep black -->

    <div
      class="relative w-80 rounded-xl border border-gumm-border bg-gumm-surface p-6 shadow-2xl shadow-black animate-slide-up"
    >
      <div class="mb-6 text-center space-y-2">
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-gumm-bg border border-gumm-border mb-3"
        >
          <Icon name="lucide:sparkles" class="h-6 w-6 text-gumm-text" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight text-white">Gumm</h1>
        <p class="text-xs text-gumm-muted">Enter password to continue</p>
      </div>

      <form @submit.prevent="login" class="space-y-3">
        <div class="relative">
          <Icon
            name="lucide:lock"
            class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gumm-muted"
          />
          <input
            v-model="password"
            type="password"
            placeholder="Password"
            class="w-full rounded-md border border-gumm-border bg-gumm-bg pl-10 pr-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-border-hover focus:ring-1 focus:ring-gumm-border-hover"
            autofocus
          />
        </div>

        <div
          v-if="error"
          class="flex items-center gap-1.5 text-xs text-red-400"
        >
          <Icon name="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full flex items-center justify-center gap-2 rounded-md bg-white text-black py-2.5 text-sm font-semibold transition-colors hover:bg-gray-200 disabled:opacity-50"
        >
          <Icon
            v-if="loading"
            name="lucide:loader"
            class="h-4 w-4 animate-spin"
          />
          <Icon v-else name="lucide:log-in" class="h-4 w-4" />
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>
