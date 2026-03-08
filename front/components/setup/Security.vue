<script setup lang="ts">
defineProps<{ form: any }>();
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2
        class="text-base font-semibold text-gumm-text flex items-center gap-2"
      >
        <Icon name="lucide:lock" class="h-4 w-4 text-gumm-accent" />
        Admin Password
      </h2>
      <p class="mt-1 text-xs text-gumm-muted">
        Set the password to access the Gumm dashboard.
      </p>
    </div>

    <div class="space-y-3">
      <div>
        <label class="mb-1 block text-xs text-gumm-muted">Password *</label>
        <input
          v-model="form.password"
          type="password"
          placeholder="At least 4 characters"
          class="w-full rounded-xl border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-accent"
          autofocus
        />
      </div>
      <div>
        <label class="mb-1 block text-xs text-gumm-muted"
          >Confirm password *</label
        >
        <input
          v-model="form.passwordConfirm"
          type="password"
          placeholder="Repeat your password"
          class="w-full rounded-xl border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-accent"
        />
        <p
          v-if="form.passwordConfirm && form.password !== form.passwordConfirm"
          class="mt-1 text-xs text-red-400 flex items-center gap-1"
        >
          <Icon name="lucide:alert-circle" class="h-3 w-3" />
          Passwords don't match
        </p>
      </div>
    </div>
  </div>
</template>
