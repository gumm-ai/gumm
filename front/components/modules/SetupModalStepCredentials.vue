<script setup lang="ts">
const setupClientId = defineModel<string>('setupClientId', { required: true });
const setupClientSecret = defineModel<string>('setupClientSecret', {
  required: true,
});

defineProps<{
  error: string;
  loading: boolean;
}>();

defineEmits<{
  close: [];
  save: [];
}>();
</script>

<template>
  <div class="space-y-4 w-full">
    <!-- Instructions -->
    <div
      class="rounded-lg border border-gumm-border bg-gumm-surface/50 p-4 space-y-3 shadow-inner"
    >
      <p class="text-xs font-semibold text-gumm-text">
        How to get your Google credentials:
      </p>
      <ol
        class="list-decimal list-outside ml-3 space-y-2 text-[11px] text-gumm-muted marker:text-gumm-accent/70"
      >
        <li class="pl-1">
          Go to
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            class="text-gumm-accent hover:underline font-medium"
            >Google Cloud Console → Credentials
            <Icon
              name="lucide:external-link"
              class="inline h-2.5 w-2.5 mb-0.5"
            />
          </a>
        </li>
        <li class="pl-1">Create a project (or select an existing one)</li>
        <li class="pl-1">
          Click
          <b class="text-gumm-text font-medium">+ Create Credentials</b>
          → <b class="text-gumm-text font-medium">OAuth client ID</b>
        </li>
        <li class="pl-1">
          Application type:
          <b class="text-gumm-text font-medium">Web application</b>
        </li>
        <li class="pl-1">
          Add
          <code
            class="text-gumm-text bg-gumm-bg px-1 py-0.5 rounded border border-gumm-border/50 text-[10px]"
            >{{
              window?.location?.origin || 'http://localhost:3000'
            }}/api/google/callback</code
          >
          as an authorized redirect URI
        </li>
        <li class="pl-1">
          Enable the
          <a
            href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
            target="_blank"
            class="text-gumm-accent hover:underline font-medium"
            >Gmail API
            <Icon
              name="lucide:external-link"
              class="inline h-2.5 w-2.5 mb-0.5"
            />
          </a>
          in your project
        </li>
        <li class="pl-1">
          Copy the <b class="text-gumm-text">Client ID</b> and
          <b class="text-gumm-text">Client Secret</b> below
        </li>
      </ol>
    </div>

    <!-- Inputs -->
    <div class="space-y-3">
      <div>
        <label
          class="mb-1.5 block text-[11px] font-medium text-gumm-muted uppercase tracking-wide"
          >Client ID</label
        >
        <input
          v-model="setupClientId"
          type="text"
          placeholder="xxxxxxxx.apps.googleusercontent.com"
          class="w-full rounded-xl border border-gumm-border bg-gumm-surface px-4 py-2.5 text-sm text-gumm-text placeholder:text-gumm-muted/40 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent shadow-sm"
        />
      </div>
      <div>
        <label
          class="mb-1.5 block text-[11px] font-medium text-gumm-muted uppercase tracking-wide"
          >Client Secret</label
        >
        <input
          v-model="setupClientSecret"
          type="password"
          placeholder="GOCSPX-…"
          class="w-full rounded-xl border border-gumm-border bg-gumm-surface px-4 py-2.5 text-sm text-gumm-text placeholder:text-gumm-muted/40 outline-none transition-all focus:ring-1 focus:ring-gumm-accent focus:border-gumm-accent shadow-sm"
        />
      </div>
    </div>

    <p
      v-if="error"
      class="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-500 border border-red-500/20"
    >
      {{ error }}
    </p>

    <div class="flex items-center justify-between gap-3 pt-3">
      <button
        class="rounded-xl border border-gumm-border px-5 py-2.5 text-xs font-medium text-gumm-muted transition-colors hover:bg-gumm-surface flex-1"
        @click="$emit('close')"
      >
        Cancel
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-white px-5 py-2.5 text-xs font-semibold text-slate-800 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
        :disabled="
          !setupClientId.trim() || !setupClientSecret.trim() || loading
        "
        @click="$emit('save')"
      >
        <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {{ loading ? 'Saving…' : 'Connect with Google' }}
      </button>
    </div>
  </div>
</template>
