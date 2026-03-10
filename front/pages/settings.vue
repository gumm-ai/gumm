<script setup lang="ts">
import SettingsTimezone from '~/components/settings/Timezone.vue';
import SettingsChangePassword from '~/components/settings/ChangePassword.vue';
import SettingsNetworkVpn from '~/components/settings/NetworkVpn.vue';
import SettingsGuardrail from '~/components/settings/Guardrail.vue';
import SettingsTelegram from '~/components/settings/Telegram.vue';
import SettingsWebhooks from '~/components/settings/Webhooks.vue';

definePageMeta({ layout: 'default' });
</script>

<template>
  <div class="flex h-full flex-col bg-gumm-bg">
    <header class="shrink-0 border-b border-white/[0.06] bg-gumm-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div class="flex items-center gap-3 px-6 h-14">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
          <Icon name="lucide:settings" class="h-4 w-4 text-white/70" />
        </div>
        <div>
          <h1 class="text-sm font-medium text-white tracking-tight">Settings</h1>
          <p class="text-[11px] text-white/40">Configuration & preferences</p>
        </div>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-5xl mx-auto p-6 space-y-6">
        <SettingsGuardrail />

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SettingsTimezone />
          <SettingsNetworkVpn />
          <SettingsTelegram />
          <SettingsWebhooks />
          <SettingsChangePassword />
        </div>
      </div>
    </div>
  </div>
</template>
