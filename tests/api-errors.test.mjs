import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { publicErrorBody } from "../lib/apiErrors.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("production API errors do not expose internal detail", () => {
  process.env.NODE_ENV = "production";

  const body = publicErrorBody("報價來源暫時無法使用", new Error("MIS HTTP 403"));

  assert.deepEqual(body, { error: "報價來源暫時無法使用" });
});

test("development API errors include detail for local debugging", () => {
  process.env.NODE_ENV = "development";

  const body = publicErrorBody("報價來源暫時無法使用", new Error("MIS HTTP 403"));

  assert.deepEqual(body, {
    error: "報價來源暫時無法使用",
    detail: "Error: MIS HTTP 403",
  });
});
