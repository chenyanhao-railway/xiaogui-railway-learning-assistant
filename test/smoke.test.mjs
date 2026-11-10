import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 4274;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return;
    } catch {
      // The server has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
}

test("task API and local railway learning replies", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "xiaogui-test-"));
  const dataFile = path.join(temporary, "data.json");
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      ASSISTANT_DATA_FILE: dataFile,
      LLM_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  t.after(async () => {
    child.kill();
    await fs.rm(temporary, { recursive: true, force: true });
  });

  await waitForServer();

  const stateResponse = await fetch(`${BASE_URL}/api/tasks`);
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.ok(Array.isArray(state.tasks));
  assert.ok(state.tasks.length >= 3);

  const createResponse = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "测试线路巡检学习卡",
      priority: "高",
      notes: "仅用于自动测试",
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const completeResponse = await fetch(`${BASE_URL}/api/tasks/${created.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(completeResponse.status, 200);
  assert.equal((await completeResponse.json()).completed, true);

  const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "线路巡检需要重点关注什么？",
      tasks: [],
    }),
  });
  assert.equal(chatResponse.status, 200);
  const reply = await chatResponse.json();
  assert.equal(reply.source, "local");
  assert.match(reply.text, /巡检/);
  assert.match(reply.text, /不替代/);
});
