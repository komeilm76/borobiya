<template>
  <PlaceholderPage :title="title" area="بخش عمومی" :description="description" :icon="icon" />
</template>

<script setup lang="ts">
import PlaceholderPage from "../PlaceholderPage.vue";

defineProps<{ title: string; description: string; icon: string }>();
</script>
