import assert from "node:assert/strict";
import test from "node:test";
import { analyzeExteriorBackground } from "../app/white-background-detection.ts";

const createImage = (width, height, color) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    data.set(color, index * 4);
  }
  return data;
};

test("detects an existing white background even when the subject touches the bottom", () => {
  const width = 100;
  const height = 140;
  const data = createImage(width, height, [255, 255, 255, 255]);

  for (let y = 20; y < height; y++) {
    for (let x = 32; x < 68; x++) {
      data.set([22, 25, 29, 255], (y * width + x) * 4);
    }
  }

  const analysis = analyzeExteriorBackground(data, width, height);
  assert.equal(analysis.isWhiteBackground, true);
  assert.ok(analysis.cornerWhiteRatio >= 0.96);
  assert.ok(analysis.perimeterWhiteRatio >= 0.78);
});

test("does not mistake a dark complex background for white", () => {
  const data = createImage(100, 140, [44, 45, 47, 255]);
  const analysis = analyzeExteriorBackground(data, 100, 140);

  assert.equal(analysis.isWhiteBackground, false);
  assert.equal(analysis.cornerWhiteRatio, 0);
});

test("treats transparent exterior pixels as white after compositing", () => {
  const data = createImage(30, 30, [0, 0, 0, 0]);
  for (let y = 8; y < 30; y++) {
    for (let x = 10; x < 20; x++) {
      data.set([15, 18, 20, 255], (y * 30 + x) * 4);
    }
  }

  assert.equal(analyzeExteriorBackground(data, 30, 30).isWhiteBackground, true);
});
