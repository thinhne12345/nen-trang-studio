import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses portrait matting before compositing onto solid white", async () => {
  const [processor, page, packageJson] = await Promise.all([
    readFile(new URL("../app/portrait-background.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(processor, /pipeline\(\s*"background-removal"/);
  assert.match(processor, /"Xenova\/modnet"/);
  assert.match(processor, /dtype:\s*"fp32"/);
  assert.match(processor, /removeDetachedAlphaIslands/);
  assert.match(processor, /refinePortraitEdges/);
  assert.match(page, /fillStyle = "#ffffff"/);
  assert.match(page, /outputContext\.drawImage\(cutout/);
  assert.match(page, /multiple/);
  assert.match(page, /MAX_BATCH_SIZE = 20/);
  assert.match(page, /MAX_WORKSPACE_SIZE = 60/);
  assert.match(page, /queueRef\.current\.push\(\.\.\.queue\)/);
  assert.match(page, /setItems\(\(current\) => \[\.\.\.current, \.\.\.queue\]\)/);
  assert.match(page, /while \(queueRef\.current\.length > 0\)/);
  assert.doesNotMatch(page, /setItems\(queue\)/);
  assert.match(page, /canvasToBlob/);
  assert.match(page, /name:\s*file\.name/);
  assert.match(page, /exterior\.isWhiteBackground/);
  assert.doesNotMatch(page, /normalizeExteriorWhiteBackground/);
  assert.match(packageJson, /"@huggingface\/transformers":\s*"[^"]+"/);
});
