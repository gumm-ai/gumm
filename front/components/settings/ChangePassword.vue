<script setup lang="ts">
// ── Password Change ─────────────────────────────────────────────
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const passwordLoading = ref(false);
const passwordError = ref('');
const passwordSuccess = ref(false);

const passwordsMatch = computed(
  () =>
    !passwordForm.value.confirmPassword ||
    passwordForm.value.newPassword === passwordForm.value.confirmPassword,
);

const canSubmitPassword = computed(
  () =>
    passwordForm.value.currentPassword.length > 0 &&
    passwordForm.value.newPassword.trim().length >= 4 &&
    passwordForm.value.newPassword === passwordForm.value.confirmPassword,
);

async function changePassword() {
  passwordLoading.value = true;
  passwordError.value = '';
  passwordSuccess.value = false;

  try {
    await $fetch('/api/auth/password', {
      method: 'PUT',
      body: {
        currentPassword: passwordForm.value.currentPassword,
        newPassword: passwordForm.value.newPassword,
      },
    });
    passwordSuccess.value = true;
    passwordForm.value = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    };
  } catch (err: any) {
    passwordError.value = err.data?.message || 'Failed to change password';
  } finally {
    passwordLoading.value = false;
  }
}
</script>

<template>
  <section
    class="rounded-xl border border-gumm-border bg-gumm-surface p-5 flex flex-col h-full"
  >
    <div class="flex items-center gap-2 mb-4">
      <Icon name="lucide:lock" class="h-4 w-4 text-gumm-accent" />
      <h2 class="text-sm font-semibold">Change Password</h2>
    </div>

    <form class="space-y-3" @submit.prevent="changePassword">
      <div>
        <label class="block text-xs text-gumm-muted mb-1"
          >Current password</label
        >
        <input
          v-model="passwordForm.currentPassword"
          type="password"
          placeholder="Enter current password"
          class="w-full rounded-md border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-border-hover focus:ring-1 focus:ring-gumm-border-hover"
        />
      </div>

      <div>
        <label class="block text-xs text-gumm-muted mb-1">New password</label>
        <input
          v-model="passwordForm.newPassword"
          type="password"
          placeholder="At least 4 characters"
          class="w-full rounded-md border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-border-hover focus:ring-1 focus:ring-gumm-border-hover"
        />
      </div>

      <div>
        <label class="block text-xs text-gumm-muted mb-1"
          >Confirm new password</label
        >
        <input
          v-model="passwordForm.confirmPassword"
          type="password"
          placeholder="Repeat new password"
          class="w-full rounded-md border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-border-hover focus:ring-1 focus:ring-gumm-border-hover"
        />
        <p
          v-if="!passwordsMatch"
          class="mt-1 text-xs text-red-400 flex items-center gap-1"
        >
          <Icon name="lucide:alert-circle" class="h-3 w-3" />
          Passwords don't match
        </p>
      </div>

      <!-- Error -->
      <div
        v-if="passwordError"
        class="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-md px-3 py-2"
      >
        <Icon name="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
        {{ passwordError }}
      </div>

      <!-- Success -->
      <div
        v-if="passwordSuccess"
        class="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 rounded-md px-3 py-2"
      >
        <Icon name="lucide:check-circle" class="h-3.5 w-3.5 shrink-0" />
        Password changed successfully
      </div>

      <button
        type="submit"
        :disabled="!canSubmitPassword || passwordLoading"
        class="flex items-center gap-2 rounded-md bg-white text-black px-4 py-2 text-xs font-semibold transition-colors hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon
          v-if="passwordLoading"
          name="lucide:loader"
          class="h-3.5 w-3.5 animate-spin"
        />
        <Icon v-else name="lucide:save" class="h-3.5 w-3.5" />
        {{ passwordLoading ? 'Saving...' : 'Update Password' }}
      </button>
    </form>
  </section>
</template>
