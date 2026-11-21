import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AppToastHost from '../src/client/components/AppToastHost.vue';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import { useToast } from '../src/client/composables/useToast.ts';

/**
 * The toast host is the assertive live region screens use to talk to the field. Every tone has
 * its own icon and its own dismiss path; if a tone silently loses one, the message still shows
 * but the affordance disappears on the one screen where it matters.
 */

afterEach(() => {
  const { messages, dismiss } = useToast();
  for (const message of [...messages.value]) dismiss(message.id);
  document.body.innerHTML = '';
});

describe('toast host', () => {
  it('renders a toast per message with the tone-specific icon', async () => {
    const wrapper = mount(AppToastHost, { global: { plugins: [vuetify] }, attachTo: document.body });
    const toast = useToast();
    toast.push('عملیات با موفقیت انجام شد.', 'success', 0);
    toast.push('خطا در ثبت درخواست.', 'error', 0);
    toast.push('هشدار باتری.', 'warning', 0);
    toast.push('اعلان عمومی.', 'info', 0);
    await wrapper.vm.$nextTick();

    const toasts = wrapper.findAll('.toast');
    expect(toasts).toHaveLength(4);
    expect(wrapper.find('.toast--success .mdi-check-circle-outline').exists()).toBe(true);
    expect(wrapper.find('.toast--error .mdi-alert-circle-outline').exists()).toBe(true);
    expect(wrapper.find('.toast--warning .mdi-alert-outline').exists()).toBe(true);
    expect(wrapper.find('.toast--info .mdi-information-outline').exists()).toBe(true);
    expect(wrapper.find('#toast-root').attributes('aria-live')).toBe('assertive');
    expect(wrapper.find('#toast-root').attributes('role')).toBe('status');
    wrapper.unmount();
  });

  it('dismisses a toast through its close button', async () => {
    const wrapper = mount(AppToastHost, { global: { plugins: [vuetify] }, attachTo: document.body });
    const toast = useToast();
    const id = toast.push('این پیام بسته می‌شود.', 'info', 0);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.toast')).toHaveLength(1);

    await wrapper.find('.toast__close').trigger('click');
    expect(useToast().messages.value.map((message) => message.id)).not.toContain(id);
    // TransitionGroup keeps the leaving element until the transition ends; wait it out.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.toast')).toHaveLength(0);
    wrapper.unmount();
  });

  it('auto-dismisses once the configured timeout elapses', async () => {
    const toast = useToast();
    const before = toast.messages.value.length;
    toast.push('گفت‌وگو خودکار بسته می‌شود.', 'success', 20);
    expect(toast.messages.value.length).toBe(before + 1);
    await new Promise((resolve) => setTimeout(resolve, 80));
    // The module-scoped timer fired and removed exactly the timed toast.
    expect(toast.messages.value.some((message) => message.timeout === 20)).toBe(false);
  });
});
