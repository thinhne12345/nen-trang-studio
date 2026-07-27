import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the AI portrait-background workflow in Vietnamese", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="vi">/i);
  assert.match(html, /Nền Trắng — Tách người và thay nền trắng/);
  assert.match(html, /TÁCH CHỦ THỂ/);
  assert.match(html, /dù nền sáng, tối hay có nhiều chi tiết/i);
  assert.match(html, /AI tách người, tóc, áo và cánh tay/i);
  assert.doesNotMatch(html, /Chỉ vùng nền sáng nối với mép ảnh/i);
});

test("uses a solid white result preview instead of a transparency grid", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Tải ảnh nền trắng/);
  assert.match(page, /fillStyle = "#ffffff"/);
  assert.doesNotMatch(page, /-transparent\.png/);
  assert.match(css, /\.preview\s*\{[^}]*background:\s*#fff;/s);
  assert.doesNotMatch(css, /linear-gradient\(/);
});
