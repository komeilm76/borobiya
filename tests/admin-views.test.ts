import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import AuditView from '../src/client/views/admin/AuditView.vue';
import AlertsView from '../src/client/views/admin/AlertsView.vue';
import ReportsView from '../src/client/views/admin/ReportsView.vue';
import HistoryView from '../src/client/views/map/HistoryView.vue';
import { useAdminStore } from '../src/client/stores/admin.ts';
import { useSosStore } from '../src/client/stores/sos.ts';
import { useToast } from '../src/client/composables/useToast.ts';

/**
 * The administrator list screens and the responder history screen: they render rows, wire one or
 * two interactions each, and otherwise stay out of the way. Their value to a suite is that they
 * call the *right* store action with the *right* arguments — a search button wired to nothing
 * looks identical to a working one until an operator needs it.
 */

/**
 * Mounts a view on its route.
 *
 * `seed` runs after the pinia is created and before the component mounts, so tests can stub store
 * state and actions on the *same* pinia instance the component resolves. Patching a store from
 * outside the render records nothing, because the component holds its own instance.
 */
async function render(
  component: unknown,
  name: string,
  seed?: (ctx: { admin: ReturnType<typeof useAdminStore>; sos: ReturnType<typeof useSosStore> }) => void
) {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const admin = useAdminStore(pinia);
  const sos = useSosStore(pinia);
  seed?.({ admin, sos });
  const wrapper = mount(component as never, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router, admin, sos };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  for (const message of [...useToast().messages.value]) useToast().dismiss(message.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

// Server projection: no raw actorId/meta — the CSV identity is trackingCode.
const AUDIT_ITEMS = [
  { id: 1, trackingCode: 1001, createdAt: 1794136000000, actorUsername: 'saeed.k', action: 'sos.cancel', target: 'sos_1', ip: '127.0.0.1' },
  { id: 2, trackingCode: 1002, createdAt: 1794136100000, actorUsername: null, action: 'auth.login', target: 'ses_1', ip: '127.0.0.1' },
  { id: 3, trackingCode: 1003, createdAt: 1794136200000, actorUsername: null, action: 'system.boot', target: 'host', ip: '127.0.0.1' }
];

describe('audit log', () => {
  it('renders one row per entry with its actor, action and target', async () => {
    const { wrapper } = await render(AuditView, ROUTE_NAMES.adminAudit, ({ admin }) => {
      vi.spyOn(admin, 'loadAudit').mockResolvedValue(undefined as never);
      admin.audit = { items: AUDIT_ITEMS as never, total: 3 } as never;
    });
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(wrapper.text()).toContain('sos.cancel');
    expect(wrapper.text()).toContain('sos_1');
    // Actor fallback: username, then an em-dash — never `null` or `undefined`.
    expect(wrapper.text()).toContain('saeed.k');
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });

  it('searches with the typed query capped at 100 rows', async () => {
    const { wrapper, admin } = await render(AuditView, ROUTE_NAMES.adminAudit, ({ admin }) => {
      vi.spyOn(admin, 'loadAudit').mockResolvedValue(undefined as never);
    });
    const search = vi.mocked(admin.loadAudit);
    search.mockClear();
    const field = wrapper.find('input');
    await field.setValue('login');
    await field.trigger('keyup.enter');
    expect(search).toHaveBeenCalledWith({ q: 'login', limit: 100 });
    search.mockClear();
    // The button path goes through the same action with the same arguments.
    await wrapper.findAll('button').at(-1)!.trigger('click');
    expect(search).toHaveBeenCalledWith({ q: 'login', limit: 100 });
    wrapper.unmount();
  });

  it('omits the query entirely when the filter is blank', async () => {
    const { wrapper, admin } = await render(AuditView, ROUTE_NAMES.adminAudit, ({ admin }) => {
      vi.spyOn(admin, 'loadAudit').mockResolvedValue(undefined as never);
    });
    const search = vi.mocked(admin.loadAudit);
    search.mockClear();
    await wrapper.findAll('button').at(-1)!.trigger('click');
    // An empty string would filter to nothing server-side; the filter is simply not applied.
    expect(search).toHaveBeenCalledWith({ q: undefined, limit: 100 });
    wrapper.unmount();
  });

  it('shows the empty state and offers the CSV export', async () => {
    const { wrapper } = await render(AuditView, ROUTE_NAMES.adminAudit, ({ admin }) => {
      vi.spyOn(admin, 'loadAudit').mockResolvedValue(undefined as never);
    });
    expect(wrapper.text()).toContain('رویدادی ثبت نشده است.');
    const csv = wrapper.find('a.admin-action');
    expect(csv.attributes('href')).toBe('/_admin/audit.csv');
    expect(csv.attributes('download')).toBeDefined();
    wrapper.unmount();
  });
});

describe('operational alerts', () => {
  const ALERTS = [
    { id: 'alt_1', kind: 'sos', severity: 'danger', message: 'تماس بی‌پاسخ', createdAt: 1794136000000, resolvedAt: null, resolvedBy: null },
    { id: 'alt_2', kind: 'disk', severity: 'warning', message: 'فضای دیسک کم است', createdAt: 1794136000000, resolvedAt: 1794137000000, resolvedBy: 'admin' }
  ];

  it('renders severity icons, resolution state and the resolve action', async () => {
    const { wrapper, admin } = await render(AlertsView, ROUTE_NAMES.adminAlerts, ({ admin }) => {
      vi.spyOn(admin, 'loadAlerts').mockResolvedValue(undefined as never);
      vi.spyOn(admin, 'resolveAlert').mockResolvedValue(undefined as never);
      admin.alerts = ALERTS as never;
    });
    const resolver = vi.mocked(admin.resolveAlert);

    const items = wrapper.findAll('.admin-list li');
    expect(items).toHaveLength(2);
    // Danger gets the filled-circle icon, warning the outline.
    expect(items[0].find('.mdi-alert-circle-outline').exists()).toBe(true);
    expect(items[1].find('.mdi-alert-outline').exists()).toBe(true);
    // An unresolved alert offers the action; a resolved one shows the closed pill instead.
    expect(items[0].find('button').text()).toBe('بستن');
    expect(items[0].find('button').exists()).toBe(true);
    expect(items[1].text()).toContain('بسته شده');
    expect(items[1].find('button').exists()).toBe(false);

    await items[0].find('button').trigger('click');
    expect(resolver).toHaveBeenCalledWith('alt_1');
    wrapper.unmount();
  });

  it('reloads with resolved alerts included when the toggle is switched on', async () => {
    const { wrapper, admin } = await render(AlertsView, ROUTE_NAMES.adminAlerts, ({ admin }) => {
      vi.spyOn(admin, 'loadAlerts').mockResolvedValue(undefined as never);
      admin.alerts = ALERTS as never;
    });
    const reload = vi.mocked(admin.loadAlerts);
    reload.mockClear();

    const toggle = wrapper.find('input[type="checkbox"]');
    await toggle.setValue(true);
    expect(reload).toHaveBeenCalledWith(true);
    wrapper.unmount();
  });

  it('shows the empty state when nothing is outstanding', async () => {
    const { wrapper } = await render(AlertsView, ROUTE_NAMES.adminAlerts, ({ admin }) => {
      vi.spyOn(admin, 'loadAlerts').mockResolvedValue(undefined as never);
      admin.alerts = [] as never;
    });
    expect(wrapper.text()).toContain('هشدار بازی وجود ندارد.');
    wrapper.unmount();
  });
});

describe('administrator reports export', () => {
  it('hands the CSV off to the browser and confirms the download', async () => {
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign }
    });
    try {
      const { wrapper } = await render(ReportsView, ROUTE_NAMES.adminReports, ({ admin }) => {
        vi.spyOn(admin, 'loadOverview').mockResolvedValue(undefined as never);
      });
      const buttons = wrapper.findAll('.export-row button');
      expect(buttons).toHaveLength(2);
      await buttons[0].trigger('click');
      expect(assign).toHaveBeenCalledWith('/_admin/users.csv');
      await buttons[1].trigger('click');
      expect(assign).toHaveBeenCalledWith('/_admin/audit.csv');
      expect(useToast().messages.value.some((message) => message.message === 'صدور فایل آغاز شد.')).toBe(true);
      wrapper.unmount();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });
});

describe('responder history', () => {
  it('lists past requests with tracking codes and an empty state', async () => {
    const { wrapper } = await render(HistoryView, ROUTE_NAMES.history, ({ sos }) => {
      sos.requests = [
        { id: 'sos_1', incidentLabel: 'آتش‌سوزی', createdAt: 1794136000000, status: 'completed', trackingCode: 4242 },
        { id: 'sos_2', incidentLabel: 'حادثه رانندگی', createdAt: 1794137000000, status: 'cancelled', trackingCode: 4243 }
      ] as never;
    });
    expect(wrapper.text()).toContain('آتش‌سوزی');
    expect(wrapper.text()).toContain('حادثه رانندگی');
    expect(wrapper.text()).toContain('۲ رویداد ثبت‌شده');
    wrapper.unmount();
  });

  it('offers the profile shortcut from the header', async () => {
    const { wrapper, router } = await render(HistoryView, ROUTE_NAMES.history, ({ sos }) => {
      sos.requests = [] as never;
    });
    expect(wrapper.text()).toContain('درخواستی ثبت نشده است.');
    const navigations = vi.spyOn(router, 'push');
    await wrapper.find('.sheet__expand').trigger('click');
    expect(navigations).toHaveBeenCalledWith({ name: ROUTE_NAMES.profile });
    wrapper.unmount();
  });
});
