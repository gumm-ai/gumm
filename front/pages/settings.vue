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
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center gap-2.5 border-b border-gumm-border px-4 py-2.5"
    >
      <Icon name="lucide:settings" class="h-4 w-4 text-gumm-accent" />
      <h1 class="text-base font-semibold">Settings</h1>
    </header>

    <div class="flex-1 overflow-y-auto p-4 md:p-6 content-start bg-gumm-bg">
      <div class="mx-auto grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl">
        <SettingsGuardrail class="sm:col-span-2 lg:col-span-2" />
        <SettingsTimezone />
        <SettingsNetworkVpn />
        <SettingsTelegram />
        <SettingsWebhooks />
        <SettingsChangePassword />
      </div>
    </div>
  </div>
</template>
