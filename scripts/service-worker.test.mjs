import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

function setup() {
  const handlers = {};
  const stores = new Map();
  const cache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    const key = (req) => typeof req === "string" ? new URL(req, "https://app.test").href : req.url;
    return {
      put: async (req, res) => map.set(key(req), res),
      match: async (req) => map.get(key(req)),
      keys: async () => [...map.keys()].map((url) => ({ url })),
      delete: async (req) => map.delete(key(req)),
    };
  };
  const caches = { open: async (name) => cache(name), delete: async (name) => stores.delete(name) };
  let network = async () => new Response("ok");
  const self = { location: { origin: "https://app.test" }, clients: { claim: async () => {} }, skipWaiting() {}, addEventListener: (name, fn) => { handlers[name] = fn; } };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self, caches, fetch: (...args) => network(...args), URL, Response, Promise });
  async function request(path, mode = "navigate") {
    const waits = [];
    let response;
    handlers.fetch({ request: { url: new URL(path, "https://app.test").href, method: "GET", mode }, waitUntil: (p) => waits.push(p), respondWith: (p) => { response = p; } });
    if (!response) return null;
    const result = await response;
    await Promise.all(waits);
    return result;
  }
  return { stores, request, cache, setNetwork: (fn) => { network = fn; }, activate: async () => { let p; handlers.activate({ waitUntil: (value) => { p = value; } }); await p; } };
}

test("solo cachea la portada pública y recursos de compilación, no pases ni API", async () => {
  const sw = setup();
  await sw.request("/");
  await sw.request("/pase?secreto=1");
  await sw.request("/assets/test-123.js", "no-cors");
  assert.equal(await sw.request("/api/private", "cors"), null);
  const keys = [...sw.stores.get("mievento-shell-v2").keys()];
  assert.deepEqual(keys.sort(), ["https://app.test/", "https://app.test/assets/test-123.js"]);
  sw.setNetwork(async () => { throw new Error("offline"); });
  assert.equal(await (await sw.request("/wallet")).text(), "ok");
  assert.equal(await (await sw.request("/assets/test-123.js", "no-cors")).text(), "ok");
});

test("no almacena respuestas privadas o fallidas y no borra cachés ajenas", async () => {
  const sw = setup();
  await sw.cache("other-app").put("/x", new Response("other"));
  await sw.cache("mievento-shell-v1").put("/", new Response("old"));
  await sw.activate();
  assert.ok(sw.stores.has("other-app"));
  assert.equal(sw.stores.has("mievento-shell-v1"), false);
  sw.setNetwork(async () => new Response("private", { headers: { "Cache-Control": "private, no-store" } }));
  await sw.request("/");
  await sw.request("/assets/private.js", "cors");
  assert.equal(sw.stores.get("mievento-shell-v2").size, 0);
});
