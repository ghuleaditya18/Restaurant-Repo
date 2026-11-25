import test from "node:test";
import assert from "node:assert/strict";

import {
  clearSessionAuthStorage,
  DEFAULT_API_BASE_URL,
  getModuleApiBaseUrl,
  getModuleHomeRoute,
  normalizeModuleContext,
  VILLAS_API_BASE_URL,
} from "./moduleRouting.js";

test("module API routing sends Restaurant and Spa to port 8000 and Villas to port 8001", () => {
  assert.equal(getModuleApiBaseUrl("RESTAURANT"), DEFAULT_API_BASE_URL);
  assert.equal(getModuleApiBaseUrl("SPA"), DEFAULT_API_BASE_URL);
  assert.equal(getModuleApiBaseUrl("VILLA"), VILLAS_API_BASE_URL);
  assert.equal(getModuleApiBaseUrl("VILLAS"), VILLAS_API_BASE_URL);
  assert.equal(getModuleApiBaseUrl("NIWARAAI"), VILLAS_API_BASE_URL);

  assert.equal(DEFAULT_API_BASE_URL, "http://127.0.0.1:8000");
  assert.equal(VILLAS_API_BASE_URL, "http://127.0.0.1:8001");
});

test("unknown or missing module context is rejected and never defaults to Restaurant", () => {
  assert.equal(normalizeModuleContext(null), null);
  assert.equal(normalizeModuleContext(""), null);
  assert.equal(normalizeModuleContext("UNKNOWN"), null);

  assert.throws(() => getModuleApiBaseUrl(null), /valid business module/i);
  assert.throws(() => getModuleApiBaseUrl("HOTEL"), /valid business module/i);
  assert.equal(getModuleHomeRoute("UNKNOWN"), "/login");
});

test("module home routes and aliases normalize consistently", () => {
  assert.equal(normalizeModuleContext("villas"), "VILLA");
  assert.equal(normalizeModuleContext("niwaraai"), "VILLA");
  assert.equal(getModuleHomeRoute("RESTAURANT"), "/");
  assert.equal(getModuleHomeRoute("SPA"), "/spa/dashboard");
  assert.equal(getModuleHomeRoute("VILLA"), "/villas/dashboard");
  assert.equal(getModuleHomeRoute("NIWARAAI"), "/villas/dashboard");
});

test("clearSessionAuthStorage removes token, api_base_url, and auth_context on logout or module switch", () => {
  const store = new Map([
    ["access_token", "jwt-token"],
    ["api_base_url", "http://127.0.0.1:8001"],
    ["auth_context", "VILLA"],
    ["unrelated_key", "keep"],
  ]);
  const storage = {
    removeItem(key) {
      store.delete(key);
    },
  };

  clearSessionAuthStorage(storage);

  assert.equal(store.has("access_token"), false);
  assert.equal(store.has("api_base_url"), false);
  assert.equal(store.has("auth_context"), false);
  assert.equal(store.get("unrelated_key"), "keep");
});
