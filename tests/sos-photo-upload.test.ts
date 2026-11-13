import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import SosView from '../src/client/views/map/SosView.vue';
import { useSosStore } from '../src/client/stores/sos.ts';
import { useMapStore } from '../src/client/stores/map.ts';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { ImageProcessingError, SERVER_DATA_URL_LIMIT } from '../src/client/utils/image.ts';

/**
 * The photo pipeline is the emergency-path fix for the server's 160,000-character data-url cap:
 * the composer must compress before upload, surface compressor failures with a retry path, and
 * never submit a payload the server will reject. The browser boundary is replaced by a controllable
 * compressor so the view's behaviour is what is under test.
 */

const INCIDENT_TYPES = [{ id: 'inc_fire', label: 'آتش‌سوزی', icon: 'fire', color: '#B35A18' }];
const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(100);

/** The compressor double: behaviour is steered per test. */
const compress = vi.fn<(file: File) => Promise<{ dataUrl: string; width: number; height: number; quality: number; bytes: number }>>();

vi.mock('../src/client/utils/image.ts', async () => {
  const actual = await vi.importActual<typeof import('../src/client/utils/image.ts')>('../src/client/utils/image.ts');
  return {
    ...actual,
    compressImageFile: (file: File) => compress(file)
  };
});

/** Installs a fetch double for the catalogs and the create call. */
function stubApi() {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let data: unknown = { ok: true };
      if (path === '/_public/incident-types') data = { items: INCIDENT_TYPES };
      else if (path === '/_public/cancellation-reasons') data = { items: [] };
      else if (path === '/_user/sos' && method === 'GET') data = { items: [] };
      else if (path === '/_user/missions') data = { items: [] };
      else if (path === '/_user/places') data = { items: [] };
      else if (path === '/_user/location/shares') data = { items: [] };
      return new Response(JSON.stringify({ ok: true, requestId: 'req_photo', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return calls;
}

/** Mounts the composer on the photo step. */
async function renderAtPhotoStep() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.sos });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  await useSosStore().load();
  await useMapStore().load();
  const sos = useSosStore();
  sos.draft.step = 3;
  const wrapper = mount(SosView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, sos };
}

/** Simulates picking a photo through the hidden file input. */
async function pick(wrapper: Awaited<ReturnType<typeof renderAtPhotoStep>>['wrapper'], file: File) {
  const input = wrapper.find('#sos-photo');
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] });
  await input.trigger('change');
  await flushPromises();
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  compress.mockReset();
  for (const message of [...useToast().messages.value]) useToast().dismiss(message.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('sos composer photo pipeline', () => {
  it('compresses a picked file and attaches the result', async () => {
    stubApi();
    compress.mockResolvedValue({ dataUrl: PHOTO, width: 1280, height: 960, quality: 0.6, bytes: 50_000 });
    const { wrapper, sos } = await renderAtPhotoStep();
    await pick(wrapper, new File([new Uint8Array(900)], 'photo.jpg', { type: 'image/jpeg' }));
    expect(compress).toHaveBeenCalledTimes(1);
    expect(sos.draft.photoDataUrl).toBe(PHOTO);
    expect(wrapper.find('img').attributes('src')).toBe(PHOTO);
  });

  it('shows a retryable error when the image cannot be compressed', async () => {
    stubApi();
    compress.mockRejectedValue(new ImageProcessingError('too-large', 'nope'));
    const { wrapper, sos } = await renderAtPhotoStep();
    await pick(wrapper, new File([new Uint8Array(900)], 'photo.jpg', { type: 'image/jpeg' }));
    expect(sos.draft.photoDataUrl).toBeNull();
    expect(wrapper.text()).toContain('عکس پیوست نشد');
    expect(wrapper.text()).toContain('عکس دیگری انتخاب کنید');
  });

  it('names the unsupported-type cause in plain words', async () => {
    stubApi();
    compress.mockRejectedValue(new ImageProcessingError('unsupported-type', 'nope'));
    const { wrapper } = await renderAtPhotoStep();
    await pick(wrapper, new File([new Uint8Array(10)], 'photo.gif', { type: 'image/gif' }));
    expect(wrapper.text()).toContain('JPEG');
  });

  it('disables the picker while compression is running', async () => {
    stubApi();
    let release!: (value: { dataUrl: string; width: number; height: number; quality: number; bytes: number }) => void;
    compress.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { wrapper } = await renderAtPhotoStep();
    const input = wrapper.find<HTMLInputElement>('#sos-photo');
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File([new Uint8Array(900)], 'photo.jpg', { type: 'image/jpeg' })] });
    await input.trigger('change');
    await flushPromises();
    expect(wrapper.find<HTMLInputElement>('#sos-photo').element.disabled).toBe(true);
    expect(wrapper.text()).toContain('در حال فشرده‌سازی');
    release({ dataUrl: PHOTO, width: 100, height: 100, quality: 0.8, bytes: 1000 });
    await flushPromises();
    expect(wrapper.find<HTMLInputElement>('#sos-photo').element.disabled).toBe(false);
  });

  it('refuses to submit a payload the server would reject', async () => {
    const calls = stubApi();
    const { wrapper, sos } = await renderAtPhotoStep();
    sos.draft.step = 4;
    sos.draft.description = 'توضیح کافی برای عبور از حداقل ده نویسه';
    sos.draft.photoDataUrl = `data:image/jpeg;base64,${'A'.repeat(SERVER_DATA_URL_LIMIT)}`;
    await flushPromises();
    const submit = wrapper.findAll('button').find((button) => button.text().includes('ارسال درخواست امداد'));
    expect(submit).toBeDefined();
    await submit!.trigger('click');
    await flushPromises();
    const post = calls.find((call) => call.method === 'POST' && call.path === '/_user/sos');
    expect(post).toBeUndefined();
    expect(sos.error).toContain('حد مجاز');
  });

  it('removes an attached photo on demand', async () => {
    stubApi();
    compress.mockResolvedValue({ dataUrl: PHOTO, width: 10, height: 10, quality: 0.8, bytes: 1000 });
    const { wrapper, sos } = await renderAtPhotoStep();
    await pick(wrapper, new File([new Uint8Array(900)], 'photo.jpg', { type: 'image/jpeg' }));
    expect(sos.draft.photoDataUrl).toBe(PHOTO);
    await wrapper.find('.text-link').trigger('click');
    expect(sos.draft.photoDataUrl).toBeNull();
    expect(wrapper.find('img').exists()).toBe(false);
  });
});
