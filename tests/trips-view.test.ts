import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import TripsView from '../src/client/views/map/TripsView.vue';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The trips screen is the only client surface for group rides; these tests pin the list, the
 * invitation inbox, creation with ranked stops and the leader/member action split.
 */

const SELF = {
  id: 'usr_self', username: 'saeed.k', role: 'user' as const, isActive: true,
  securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false,
  averageRating: 0, createdAt: 1794000000000
};

const TRIP = {
  id: 'trp_1', name: 'مسیر بیمارستان', status: 'planned', saved: false, role: 'leader',
  ownerId: 'usr_self', ownerUsername: 'saeed.k', stopCount: 2, memberCount: 2,
  createdAt: 1794100000000, updatedAt: 1794100000000, startedAt: null, completedAt: null
} as const;

const DETAIL = {
  ...TRIP,
  stops: [
    { id: 'tstp_1', rank: 1, label: 'خانه', latitude: 35.7192, longitude: 51.3314, placeId: null },
    { id: 'tstp_2', rank: 2, label: 'بیمارستان امید', latitude: 35.7231, longitude: 51.4122, placeId: null }
  ],
  members: [
    { userId: 'usr_self', username: 'saeed.k', role: 'leader', joinedAt: 1794100000000 },
    { userId: 'usr_companion', username: 'maryam.a', role: 'member', joinedAt: 1794100001000 }
  ],
  invitations: []
};

const MEMBER_DETAIL = { ...DETAIL, role: 'member', ownerId: 'usr_other', ownerUsername: 'reza.m' };

type Handler = (path: string, method: string, body: any, url: string) => unknown;

/** Stubs fetch; `handler` decides the `data` payload per request. */
function stubFetch(handler: Handler): { calls: Array<{ method: string; path: string; url: string; body: any }> } {
  const calls: Array<{ method: string; path: string; url: string; body: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const path = url.split('?')[0];
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, url, body });
    const data = handler(path, method, body, url);
    return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  }));
  return { calls };
}

async function render() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().$patch({ user: { ...SELF } });
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.trips });
  await router.isReady();
  const wrapper = mount(TripsView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('trips list', () => {
  it('renders my trips with status, role and counts', async () => {
    stubFetch((path) => {
      if (path === '/_user/trips') return { items: [TRIP], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    const row = wrapper.find('[data-testid="trips-row-trp_1"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain('مسیر بیمارستان');
    expect(row.text()).toContain('برنامه‌ریزی‌شده');
    // Persian digits per the fa-IR display contract.
    expect(row.text()).toContain('۲');
    wrapper.unmount();
  });

  it('shows pending invitations and accepts one from the inbox', async () => {
    const { calls } = stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [], total: 0 };
      if (path === '/_user/trips/invitations' && method === 'GET') {
        return { items: [{ id: 'tinv_1', tripId: 'trp_9', tripName: 'مسیر صبح', tripStatus: 'planned', inviterUsername: 'reza.m', createdAt: 1794100000000 }], total: 1 };
      }
      if (path === '/_user/trips/invitations/tinv_1/accept') return { ok: true };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    const accept = wrapper.find('[data-testid="trips-inbox-accept-tinv_1"]');
    expect(accept.exists()).toBe(true);
    await accept.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/trips/invitations/tinv_1/accept')).toBe(true);
    wrapper.unmount();
  });

  it('re-fetches with saved=true when the saved filter is ticked', async () => {
    const { calls } = stubFetch((path) => {
      if (path === '/_user/trips') return { items: [], total: 0 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    const filter = wrapper.find('[data-testid="trips-saved-filter"]');
    await filter.setValue(true);
    await flushPromises();
    expect(calls.some((call) => call.url.includes('/_user/trips?') && call.url.includes('saved=true'))).toBe(true);
    wrapper.unmount();
  });
});

describe('creating a trip', () => {
  it('posts the name and the ranked stops', async () => {
    const { calls } = stubFetch((path, method, body) => {
      if (path === '/_user/trips' && method === 'POST') {
        return { ...DETAIL, id: 'trp_new', name: body.name, stops: body.stops.map((stop: any, index: number) => ({ ...stop, id: `tstp_${index + 1}`, rank: index + 1 })) };
      }
      if (path === '/_user/trips') return { items: [], total: 0 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_user/trips/trp_new') return { ...DETAIL, id: 'trp_new' };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();

    await wrapper.find('[data-testid="trips-create-toggle"]').trigger('click');
    await wrapper.find('[data-testid="trips-name"]').setValue('مسیر صبح');
    await wrapper.find('[data-testid="trips-stop-label-0"]').setValue('خانه');
    await wrapper.find('[data-testid="trips-stop-lat-0"]').setValue('35.7192');
    await wrapper.find('[data-testid="trips-stop-lng-0"]').setValue('51.3314');

    await wrapper.find('[data-testid="trips-add-stop"]').trigger('click');
    await wrapper.find('[data-testid="trips-stop-label-1"]').setValue('بیمارستان امید');
    await wrapper.find('[data-testid="trips-stop-lat-1"]').setValue('35.7231');
    await wrapper.find('[data-testid="trips-stop-lng-1"]').setValue('51.4122');

    expect(wrapper.find('[data-testid="trips-submit"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-testid="trips-submit"]').trigger('click');
    await flushPromises();

    const post = calls.find((call) => call.method === 'POST' && call.path === '/_user/trips');
    expect(post).toBeTruthy();
    expect(post!.body).toEqual({
      name: 'مسیر صبح',
      stops: [
        { label: 'خانه', latitude: 35.7192, longitude: 51.3314, placeId: null },
        { label: 'بیمارستان امید', latitude: 35.7231, longitude: 51.4122, placeId: null }
      ]
    });
    wrapper.unmount();
  });
});

describe('trip detail', () => {
  it('shows the stops and lets the leader start a planned trip', async () => {
    const { calls } = stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [TRIP], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_user/trips/trp_1' && method === 'GET') return DETAIL;
      if (path === '/_user/trips/trp_1/start') return { ...DETAIL, status: 'active', startedAt: 1794110000000 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-row-trp_1"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="trips-detail-stops"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="trips-detail-members"]').text()).toContain('maryam.a');

    const start = wrapper.find('[data-testid="trips-start"]');
    expect(start.exists()).toBe(true);
    await start.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/trips/trp_1/start')).toBe(true);
    wrapper.unmount();
  });

  it('hides leader actions from an accepted member', async () => {
    stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [{ ...TRIP, role: 'member' }], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_user/trips/trp_1' && method === 'GET') return MEMBER_DETAIL;
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-row-trp_1"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="trips-start"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="trips-invite-search"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="trips-leave"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('trip detail interactions', () => {
  const DETAIL_ACTIVE = { ...DETAIL, status: 'active', startedAt: 1794110000000 };

  function stubDetail(overrides: (path: string, method: string, body: any) => unknown) {
    return stubFetch((path, method, body) => {
      const custom = overrides(path, method, body);
      if (custom !== undefined) return custom;
      if (path === '/_user/trips') return { items: [{ ...TRIP, status: body?.status ?? 'planned' }], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      if (path === '/_user/trips/trp_1' && method === 'GET') return DETAIL;
      return { items: [] };
    });
  }

  it('saves a trip from the row star', async () => {
    const { calls } = stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [TRIP], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      if (path === '/_user/trips/trp_1/save') return { ...DETAIL, saved: true };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-save-trp_1"]').trigger('click');
    await flushPromises();
    const save = calls.find((call) => call.path === '/_user/trips/trp_1/save');
    expect(save?.method).toBe('POST');
    expect(save?.body).toEqual({ saved: true });
    wrapper.unmount();
  });

  it('completes an active trip as the leader', async () => {
    const { calls } = stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [{ ...TRIP, status: 'active' }], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      if (path === '/_user/trips/trp_1' && method === 'GET') return DETAIL_ACTIVE;
      if (path === '/_user/trips/trp_1/complete') return { ...DETAIL_ACTIVE, status: 'completed' };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-row-trp_1"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="trips-complete"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/trips/trp_1/complete')).toBe(true);
    wrapper.unmount();
  });

  it('cancels an active trip as the leader', async () => {
    const { calls } = stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [{ ...TRIP, status: 'active' }], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      if (path === '/_user/trips/trp_1' && method === 'GET') return DETAIL_ACTIVE;
      if (path === '/_user/trips/trp_1/cancel') return { ...DETAIL_ACTIVE, status: 'cancelled' };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-row-trp_1"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="trips-cancel"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/trips/trp_1/cancel')).toBe(true);
    wrapper.unmount();
  });

  it('lets a member leave and clears the open detail', async () => {
    const { calls } = stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [{ ...TRIP, role: 'member' }], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      if (path === '/_user/trips/trp_1' && method === 'GET') return MEMBER_DETAIL;
      if (path === '/_user/trips/trp_1/leave') return {};
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-row-trp_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="trips-leave"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/trips/trp_1/leave')).toBe(true);
    // The detail panel closes after leaving.
    expect(wrapper.find('[data-testid="trips-detail-stops"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('declines an invitation from the inbox', async () => {
    const { calls } = stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [], total: 0 };
      if (path === '/_user/trips/invitations' && method === 'GET') {
        return { items: [{ id: 'tinv_7', tripId: 'trp_9', tripName: 'مسیر عصر', tripStatus: 'planned', inviterUsername: 'reza.m', createdAt: 1794100000000 }], total: 1 };
      }
      if (path === '/_user/trips/invitations/tinv_7/decline') return {};
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-inbox-decline-tinv_7"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/trips/invitations/tinv_7/decline')).toBe(true);
    wrapper.unmount();
  });

  it('unselects a trip when its row is clicked twice', async () => {
    stubDetail(() => undefined);
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-row-trp_1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="trips-detail-stops"]').exists()).toBe(true);
    await wrapper.find('[data-testid="trips-row-trp_1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="trips-detail-stops"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('searches for an invitee and sends the invitation', async () => {
    const { calls } = stubFetch((path, method, body) => {
      if (path === '/_user/trips') return { items: [TRIP], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_user/trips/trp_1' && method === 'GET') return DETAIL;
      if (path === '/_user/users/search') return { items: [{ id: 'usr_reza', username: 'reza.m', role: 'user', online: true, readyForMission: false, averageRating: 4.5 }] };
      if (path === '/_user/trips/trp_1/invitations' && method === 'POST') {
        return { ...DETAIL, invitations: [{ id: 'tinv_1', inviteeId: body.inviteeId, inviteeUsername: 'reza.m', invitedByUsername: 'saeed.k', status: 'pending', createdAt: 1794100000000, respondedAt: null }] };
      }
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-row-trp_1"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="trips-invite-search"]').setValue('reza');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();
    expect(calls.some((call) => call.path === '/_user/users/search')).toBe(true);

    const result = wrapper.find('[data-testid="trips-invite-result-reza.m"]');
    expect(result.exists()).toBe(true);
    await result.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/trips/trp_1/invitations' && call.body.inviteeId === 'usr_reza')).toBe(true);
    wrapper.unmount();
  });

  it('cancels a pending invitation as the leader', async () => {
    const { calls } = stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [TRIP], total: 1 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_user/trips/trp_1' && method === 'GET') {
        return { ...DETAIL, invitations: [{ id: 'tinv_9', inviteeId: 'usr_reza', inviteeUsername: 'reza.m', invitedByUsername: 'saeed.k', status: 'pending', createdAt: 1794100000000, respondedAt: null }] };
      }
      if (path === '/_user/trips/invitations/tinv_9' && method === 'DELETE') return {};
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-row-trp_1"]').trigger('click');
    await flushPromises();
    const cancel = wrapper.find('[data-testid="trips-invitation-cancel-tinv_9"]');
    expect(cancel.exists()).toBe(true);
    await cancel.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/_user/trips/invitations/tinv_9')).toBe(true);
    wrapper.unmount();
  });
});

describe('trip creation details', () => {
  it('blocks submit while any stop is incomplete and allows removal of extra stops', async () => {
    stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [], total: 0 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-create-toggle"]').trigger('click');
    // Default draft has a label missing, so submit is disabled.
    expect(wrapper.find('[data-testid="trips-submit"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="trips-add-stop"]').trigger('click');
    expect(wrapper.findAll('.trip-stop-row')).toHaveLength(2);
    await wrapper.find('[data-testid="trips-stop-remove-1"]').trigger('click');
    expect(wrapper.findAll('.trip-stop-row')).toHaveLength(1);
    // The last stop cannot be removed.
    expect(wrapper.find('[data-testid="trips-stop-remove-0"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('drops a stop on the map centre', async () => {
    stubFetch((path, method) => {
      if (path === '/_user/trips') return { items: [], total: 0 };
      if (path === '/_user/trips/invitations') return { items: [], total: 0 };
      if (path === '/_public/map/config') return { pois: [] };
      if (path === '/_user/places') return { items: [] };
      return { items: [] };
    });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="trips-create-toggle"]').trigger('click');
    await wrapper.find('[data-testid="trips-add-center-stop"]').trigger('click');
    expect(wrapper.findAll('.trip-stop-row')).toHaveLength(2);
    wrapper.unmount();
  });
});
