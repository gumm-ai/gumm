<script setup lang="ts">
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const passwordLoading = ref(false);
const passwordError = ref('');
const passwordSuccess = ref(false);

const passwordsMatch = computed(
  () => !passwordForm.value.confirmPassword || passwordForm.value.newPassword === passwordForm.value.confirmPassword
);

const canSubmitPassword = computed(
  () =>
    passwordForm.value.currentPassword.length > 0 &&
    passwordForm.value.newPassword.trim().length >= 4 &&
    passwordForm.value.newPassword === passwordForm.value.confirmPassword
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
  <section class="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
    <div class="flex items-center gap-3 px-5 py-4 border-b border-white/[0.04]">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
        <Icon name="lucide:lock" class="h-4 w-4 text-white/50" />
      </div>
      <div>
        <h2 class="text-sm font-medium text-white">Password</h2>
        <p class="text-[11px] text-white/40">Change your login password</p>
      </div>
    </div>

    <form class="p-4 space-y-3" @submit.prevent="changePassword">
      <div>
        <label class="text-[11px] text-white/40 uppercase tracking-wider block mb-2">Current Password</label>
        <input
          v-model="passwordForm.currentPassword"
          type="password"
          placeholder="Enter current password"
          class="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/20 placeholder:text-white/30"
        />
      </div>

      <div>
        <label class="text-[11px] text-white/40 uppercase tracking-wider block mb-2">New Password</label>
        <input
          v-model="passwordForm.newPassword"
          type="password"
          placeholder="At least 4 characters"
          class="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/20 placeholder:text-white/30"
        />
      </div>

      <div>
        <label class="text-[11px] text-white/40 uppercase tracking-wider block mb-2">Confirm Password</label>
        <input
          v-model="passwordForm.confirmPassword"
          type="password"
          placeholder="Repeat new password"
          class="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/20 placeholder:text-white/30"
        />
        <p v-if="!passwordsMatch" class="mt-1.5 text-xs text-red-400 flex items-center gap-1">
          <Icon name="lucide:alert-circle" class="h-3 w-3" />
          Passwords don't match
        </p>
      </div>

      <div v-if="passwordError" class="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
        <Icon name="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
        {{ passwordError }}
      </div>

      <div v-if="passwordSuccess" class="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
        <Icon name="lucide:check-circle" class="h-3.5 w-3.5 shrink-0" />
        Password changed successfully
      </div>

      <button
        type="submit"
        :disabled="!canSubmitPassword || passwordLoading"
        class="flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-xs font-medium transition-all hover:bg-white/90 disabled:opacity-40"
      >
        <Icon :name="passwordLoading ? 'lucide:loader-2' : 'lucide:save'" class="h-3.5 w-3.5" :class="{ 'animate-spin': passwordLoading }" />
        {{ passwordLoading ? 'Updating...' : 'Update Password' }}
      </button>
    </form>
  </section>
</template>
