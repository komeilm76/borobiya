import { describe, expect, it } from 'vitest';
import { offerCameraPadding } from './offer-camera-padding';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, right: left + width, bottom: top + height, width, height });

describe('offer overview in the real map canvas', () => {
  it('leaves a drawable map when a tablet canvas is shorter than the viewport', () => {
    const map = rect(0, 360, 700, 390);
    const panel = rect(15, 140, 350, 500);
    const padding = offerCameraPadding(map, panel);
    expect(padding.left).toBeGreaterThan(350);
    expect(padding.top + padding.bottom).toBeLessThan(map.height - 30);
    expect(padding.left + padding.right).toBeLessThan(map.width - 30);
  });
  it('reserves the phone bottom sheet and desktop right panel without exceeding the canvas', () => {
    const phone = rect(0, 0, 375, 640);
    const mobile = offerCameraPadding(phone, rect(12, 290, 351, 270));
    expect(mobile.bottom).toBeGreaterThan(300);
    expect(mobile.top + mobile.bottom).toBeLessThan(phone.height);
    const desktop = rect(80, 40, 1000, 700);
    const wide = offerCameraPadding(desktop, rect(610, 160, 440, 480));
    expect(wide.right).toBeGreaterThan(440);
    expect(wide.left + wide.right).toBeLessThan(desktop.width);
  });
  it('does not reserve an off-canvas card', () => {
    expect(offerCameraPadding(rect(0, 300, 700, 350), rect(10, 0, 400, 200)))
      .toEqual({ top: 48, bottom: 48, left: 40, right: 40 });
  });
});
