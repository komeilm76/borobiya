import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");

describe("location-share mobile dialog (source-pinned; no Vue mount)", () => {
  it("keeps the form body scrollable while the live status and actions fit a narrow fullscreen footer", () => {
    expect(source).toContain(':fullscreen="$vuetify.display.smAndDown"');
    expect(source).toContain("    scrollable\n");
    expect(source).toContain('<v-card-text class="share-dialog__body">');
    expect(source).toContain('<v-card-actions class="share-dialog__actions">');
    expect(source).toContain('<span class="share-dialog__status" role="status">{{ statusText }}</span>');
    expect(source).toContain('@click="submit"');
    const start = source.indexOf("@media (max-width: 599px) {");
    expect(start).toBeGreaterThan(-1);
    const phone = source.slice(start);
    expect(phone).toContain('.share-dialog__actions { flex-wrap: wrap; }');
    expect(phone).toContain('.share-dialog__status { flex: 1 1 100%; min-width: 0; overflow-wrap: anywhere; }');
    expect(phone).toContain('.share-dialog__actions :deep(.v-spacer) { display: none; }');
    expect(phone).toContain('.share-dialog__actions :deep(.v-btn) { flex: 1 1 100%; min-width: 0; min-height: 44px; height: auto; }');
    expect(phone).toContain('.share-dialog__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }');
  });

  it("does not reopen a device chooser or publish a stale share result after the dialog/session ends", () => {
    expect(source).toContain('const submission = submissionFence.begin();');
    expect(source).toContain('if (!submissionFence.isCurrent(submission)) return;');
    expect(source).toMatch(/await createLocationHistoryShare\(historyBody, token\);\s*if \(!submissionFence\.isCurrent\(submission\)\) return;/);
    expect(source).toMatch(/await createLocationShare\(body, token\);\s*if \(!submissionFence\.isCurrent\(submission\)\) return;/);
    expect(source).toMatch(/await fetchUserDevices\(accessToken\.value!\)\.catch\(\(\) => \[\]\);\s*if \(!submissionFence\.isCurrent\(submission\)\) return;/);
    expect(source).not.toContain('knownDevices.value = await fetchUserDevices(token).catch(() => []);');
    expect(source).toContain('submissionFence.invalidate();');
    expect(source).toContain('onBeforeUnmount(() => { invalidateSubmission(); cancelPending(); });');
    expect(source).toContain('flush: "sync"');
  });

  it("keeps the multi-device chooser scrollable with reachable actions on short phones", () => {
    const chooser = source.split('<v-dialog v-model="deviceChooserOpen"')[1]?.split('</v-dialog>')[0];
    expect(chooser).toBeDefined();
    expect(source).toContain('<v-dialog v-model="deviceChooserOpen" max-width="480" scrollable persistent>');
    expect(chooser).toContain('<v-card-text class="share-device-chooser__body">');
    expect(source).toContain('.share-device-chooser__body { min-height: 0; overflow-y: auto; }');
    expect(source).toContain('.share-device-chooser__body :deep(.v-label) { white-space: normal; overflow-wrap: anywhere; }');
    expect(chooser).toContain('<v-radio-group v-model="chosenDeviceId"');
    expect(chooser).toContain('<v-card-actions class="share-device-chooser__actions">');
    expect(chooser).toContain(':disabled="submitting" @click="deviceChooserOpen = false"');
    expect(chooser).toContain(':disabled="!chosenDeviceId"');
    expect(chooser).toContain(':loading="submitting"');
    const phone = source.split('@media (max-width: 599px) {')[1]!;
    expect(phone).toContain('.share-device-chooser__actions { flex-wrap: wrap; }');
    expect(phone).toContain('.share-device-chooser__actions :deep(.v-spacer) { display: none; }');
    expect(phone).toContain('.share-device-chooser__actions :deep(.v-btn) { flex: 1 1 100%; min-width: 0; min-height: 44px; height: auto; }');
    expect(phone).toContain('.share-device-chooser__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }');
  });
});
