import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExteriorWhiteBackground } from "../app/white-background.ts";

const pixel = (data, width, x, y) => {
  const offset = (y * width + x) * 4;
  return Array.from(data.slice(offset, offset + 4));
};

test("whitens only the bright background connected to image edges", () => {
  const width = 7;
  const height = 7;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index++) {
    data.set([243, 242, 240, 255], index * 4);
  }

  for (let y = 2; y <= 4; y++) {
    for (let x = 2; x <= 4; x++) {
      data.set([35, 42, 38, 255], (y * width + x) * 4);
    }
  }
  // Chi tiết sáng bị bao kín trong chủ thể phải được giữ nguyên.
  data.set([225, 224, 222, 255], (3 * width + 3) * 4);

  const stats = normalizeExteriorWhiteBackground(data, width, height, 36);

  assert.deepEqual(pixel(data, width, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(pixel(data, width, 2, 2), [35, 42, 38, 255]);
  assert.deepEqual(pixel(data, width, 3, 3), [225, 224, 222, 255]);
  assert.equal(stats.backgroundPixels, 40);
  assert.equal(stats.changedPixels, 40);
});

test("keeps semi-transparent subject edge colors untouched", () => {
  const width = 3;
  const height = 3;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index++) {
    data.set([255, 255, 255, 0], index * 4);
  }
  data.set([78, 52, 41, 128], (1 * width + 1) * 4);

  normalizeExteriorWhiteBackground(data, width, height, 70);

  assert.deepEqual(pixel(data, width, 1, 1), [78, 52, 41, 128]);
});

test("rejects malformed pixel buffers", () => {
  assert.throws(
    () => normalizeExteriorWhiteBackground(new Uint8ClampedArray(4), 2, 2),
    /Dữ liệu ảnh không hợp lệ/,
  );
});
