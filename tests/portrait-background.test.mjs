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
  assert.match(page, /fillStyle = "#ffffff"/);
  assert.match(page, /outputContext\.drawImage\(cutout/);
  assert.match(page, /AI tự động giữ lại người và loại bỏ toàn bộ nền/);
  assert.doesNotMatch(page, /normalizeExteriorWhiteBackground/);
  assert.match(packageJson, /"@huggingface\/transformers":\s*"[^"]+"/);
});
