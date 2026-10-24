<template>
  <v-dialog :model-value="cancellation.open.value" max-width="500" :persistent="cancellation.submitting.value"
      @update:model-value="(visible: boolean) => { if (!visible) cancellation.dismiss(); }">
      <v-card rounded="xl" class="pa-2">
        <v-card-title class="text-wrap">لغو درخواست امداد</v-card-title>
        <v-card-text>
          <p class="mb-4 text-body-2">اگر هنوز به کمک نیاز دارید، درخواست را لغو نکنید. پس از لغو، پیشنهادهای در انتظار بسته می‌شوند و مأموریت امدادگرِ پذیرفته‌شده نیز پایان می‌یابد.</p>
          <v-progress-linear v-if="cancellation.loading.value" indeterminate color="primary" aria-label="در حال دریافت دلایل لغو" class="mb-4" />
          <v-alert v-if="cancellation.error.value" type="error" variant="tonal" role="alert" class="mb-4">
            {{ cancellation.error.value }}
          </v-alert>
          <v-btn v-if="cancellation.error.value && !cancellation.reasons.value.length" variant="tonal" color="primary"
            :disabled="cancellation.loading.value" @click="cancellation.show()">تلاش دوباره</v-btn>
          <v-radio-group v-if="cancellation.reasons.value.length" v-model="cancellation.reasonId.value"
            label="دلیل لغو را انتخاب کنید" :disabled="cancellation.submitting.value" hide-details>
            <v-radio v-for="reason in cancellation.reasons.value" :key="reason.id"
              :label="reason.labelFa || reason.label" :value="reason.id" />
          </v-radio-group>
          <v-textarea v-if="cancellation.selected.value?.requiresCustomText" v-model="cancellation.customReason.value"
            label="توضیح دلیل (۱۰ تا ۲۰۰ نویسه)" counter="200" maxlength="200" variant="outlined" rows="2"
            :disabled="cancellation.submitting.value" hint="برای «سایر» توضیح حداقل ۱۰ نویسه لازم است." persistent-hint />
        </v-card-text>
        <v-card-actions class="flex-wrap">
          <v-spacer />
          <v-btn variant="text" :disabled="cancellation.submitting.value" @click="cancellation.dismiss()">بازگشت</v-btn>
          <v-btn color="error" variant="flat" rounded="lg" :loading="cancellation.submitting.value"
            :disabled="!cancellation.canConfirm.value" @click="cancellation.confirm()">تأیید لغو درخواست</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import type { useSosCancellation } from "@/composables/use-sos-cancellation";

defineProps<{ cancellation: ReturnType<typeof useSosCancellation> }>();
</script>
