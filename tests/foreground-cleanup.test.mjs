import assert from "node:assert/strict";
import test from "node:test";
import { removeDetachedAlphaIslands } from "../app/foreground-cleanup.ts";

const pixel = (width, x, y) => (y * width + x) * 4;

test("removes a detached mask island without changing the main subject", () => {
  const width = 24;
  const height = 18;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 3; y < height; y++) {
    for (let x = 8; x <= 17; x++) {
      const offset = pixel(width, x, y);
      data[offset] = 42;
      data[offset + 1] = 83;
      data[offset + 2] = 126;
      data[offset + 3] = 255;
    }
  }

  for (let y = 8; y <= 10; y++) {
    for (let x = 2; x <= 4; x++) {
      const offset = pixel(width, x, y);
      data[offset] = 12;
      data[offset + 1] = 15;
      data[offset + 2] = 19;
      data[offset + 3] = 220;
    }
  }

  const result = removeDetachedAlphaIslands(data, width, height);

  assert.equal(result.componentCount, 2);
  assert.equal(result.removedPixelCount, 9);
  assert.equal(data[pixel(width, 3, 9) + 3], 0);
  assert.deepEqual(
    Array.from(data.slice(pixel(width, 10, 8), pixel(width, 10, 8) + 4)),
    [42, 83, 126, 255],
  );
});

test("preserves a soft edge connected to the dominant subject", () => {
  const width = 16;
  const height = 12;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 2; y <= 10; y++) {
    for (let x = 5; x <= 11; x++) {
      data[pixel(width, x, y) + 3] = 255;
    }
  }
  data[pixel(width, 4, 4) + 3] = 6;

  const result = removeDetachedAlphaIslands(data, width, height);

  assert.equal(result.componentCount, 1);
  assert.equal(result.removedPixelCount, 0);
  assert.equal(data[pixel(width, 4, 4) + 3], 6);
});

test("removes multiple detached text and logo shapes around the portrait", () => {
  const width = 40;
  const height = 30;
  const data = new Uint8ClampedArray(width * height * 4);

  // Dominant portrait.
  for (let y = 4; y < height; y++) {
    for (let x = 14; x <= 27; x++) {
      data[pixel(width, x, y) + 3] = 255;
    }
  }

  // Detached letter T.
  for (let x = 2; x <= 8; x++) data[pixel(width, x, 5) + 3] = 230;
  for (let y = 5; y <= 11; y++) data[pixel(width, 5, y) + 3] = 230;

  // Detached logo block on the other side.
  for (let y = 16; y <= 20; y++) {
    for (let x = 32; x <= 36; x++) {
      data[pixel(width, x, y) + 3] = 190;
    }
  }

  const result = removeDetachedAlphaIslands(data, width, height);

  assert.equal(result.componentCount, 3);
  assert.equal(data[pixel(width, 5, 8) + 3], 0);
  assert.equal(data[pixel(width, 34, 18) + 3], 0);
  assert.equal(data[pixel(width, 20, 18) + 3], 255);
});
