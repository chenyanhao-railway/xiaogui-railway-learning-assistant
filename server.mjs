import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_FILE =
  process.env.ASSISTANT_DATA_FILE || path.join(ROOT, "data.json");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function localDateAt(daysFromToday, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function defaultState() {
  return {
    tasks: [
      {
        id: crypto.randomUUID(),
        title: "整理高速铁路施工课程笔记",
        dueAt: localDateAt(0, 19, 0),
        priority: "高",
        notes: "把今天的课堂要点整理成三个问题。",
        completed: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: "练习 WPS 函数 SUM、COUNTIF、IF",
        dueAt: localDateAt(1, 20, 0),
        priority: "中",
        notes: "每个函数至少独立完成一次。",
        completed: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: "完成入团申请书誊写",
        dueAt: localDateAt(2, 12, 0),
        priority: "高",
        notes: "检查姓名、班级、日期和红稿纸要求。",
        completed: false,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const initial = defaultState();
    await writeState(initial);
    return initial;
  }
}

async function writeState(state) {
  const temporary = `${DATA_FILE}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(temporary, DATA_FILE);
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 64 * 1024) {
      throw new Error("请求内容超过 64 KB");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function cleanText(value, maxLength = 200) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function orderedPending(tasks) {
  return tasks
    .filter((task) => !task.completed)
    .sort((a, b) => {
      const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return aTime - bTime;
    });
}

function taskSummary(tasks) {
  const pending = orderedPending(tasks);
  if (pending.length === 0) {
    return "目前没有待完成的学习任务。";
  }
  const text = pending
    .slice(0, 4)
    .map((task) => {
      const due = task.dueAt
        ? new Date(task.dueAt).toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "未设置截止时间";
      return `${task.title}（${due}）`;
    })
    .join("；");
  return `现在有 ${pending.length} 项未完成任务：${text}。`;
}

function localReply(message, tasks) {
  const normalized = cleanText(message, 500);
  if (!normalized) return "你可以告诉我今天想完成什么。";

  if (/你好|在吗|小轨/.test(normalized)) {
    return `我在。${taskSummary(tasks)} 你想先从哪一项开始？`;
  }
  if (/今天|任务|待办|安排|做什么/.test(normalized)) {
    const next = orderedPending(tasks)[0];
    return next
      ? `${taskSummary(tasks)} 建议先做“${next.title}”，只推进一个最小步骤。`
      : "今天没有未完成任务。可以安排一次复盘，或者给自己留一点休息时间。";
  }
  if (/完成|做完|搞定/.test(normalized)) {
    return "完成后记得在任务列表中勾选，我会根据最新进度调整下一次提醒。";
  }
  if (/提醒|主动|联系我/.test(normalized)) {
    return "我会在页面保持打开时主动提醒。你可以设置提醒间隔和免打扰时段，我不会在静默时段说话。";
  }
  if (/不会|不懂|难|卡住/.test(normalized)) {
    return "先不要一次解决整道题。把卡住的位置写成一个具体问题，例如“哪一步不会”“输入和预期结果分别是什么”，我可以陪你拆开。";
  }
  return `我听到的是：“${normalized}”。${taskSummary(tasks)} 你可以继续说目标，我会帮你拆成下一步。`;
}

async function modelReply(message, tasks) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.LLM_BASE_URL || "https://api.deepseek.com").replace(
    /\/+$/,
    "",
  );
  const model = process.env.LLM_MODEL || "deepseek-chat";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "你是小轨，一名克制、具体、尊重隐私的学习助手。回答用自然中文，优先给出一个可执行的下一步。不要编造用户经历，不要连续说教。用户待办如下：" +
            JSON.stringify(tasks),
        },
        { role: "user", content: cleanText(message, 2000) },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`模型接口返回 ${response.status}`);
  }
  const result = await response.json();
  return cleanText(result?.choices?.[0]?.message?.content, 2000) || null;
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/tasks" && request.method === "GET") {
    return sendJson(response, 200, await readState());
  }

  if (url.pathname === "/api/tasks" && request.method === "POST") {
    const body = await readJsonBody(request);
    const title = cleanText(body.title, 100);
    if (!title) return sendJson(response, 400, { error: "任务名称不能为空" });
    const state = await readState();
    const task = {
      id: crypto.randomUUID(),
      title,
      dueAt: body.dueAt ? new Date(body.dueAt).toISOString() : null,
      priority: ["高", "中", "低"].includes(body.priority)
        ? body.priority
        : "中",
      notes: cleanText(body.notes, 300),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    state.tasks.push(task);
    await writeState(state);
    return sendJson(response, 201, task);
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === "PATCH") {
    const body = await readJsonBody(request);
    const state = await readState();
    const task = state.tasks.find((item) => item.id === taskMatch[1]);
    if (!task) return sendJson(response, 404, { error: "任务不存在" });
    if (typeof body.completed === "boolean") task.completed = body.completed;
    if (typeof body.title === "string" && cleanText(body.title, 100)) {
      task.title = cleanText(body.title, 100);
    }
    await writeState(state);
    return sendJson(response, 200, task);
  }

  if (taskMatch && request.method === "DELETE") {
    const state = await readState();
    const index = state.tasks.findIndex((item) => item.id === taskMatch[1]);
    if (index < 0) return sendJson(response, 404, { error: "任务不存在" });
    state.tasks.splice(index, 1);
    await writeState(state);
    return sendJson(response, 200, { ok: true });
  }

  if (url.pathname === "/api/chat" && request.method === "POST") {
    const body = await readJsonBody(request);
    const message = cleanText(body.message, 2000);
    const tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 100) : [];
    if (!message) return sendJson(response, 400, { error: "消息不能为空" });
    try {
      const modelText = await modelReply(message, tasks);
      return sendJson(response, 200, {
        text: modelText || localReply(message, tasks),
        source: modelText ? "model" : "local",
      });
    } catch (error) {
      console.error("Model request failed:", error.message);
      return sendJson(response, 200, {
        text: localReply(message, tasks),
        source: "local",
        warning: "模型接口未连接，已使用本地规则回复。",
      });
    }
  }

  if (url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      modelConfigured: Boolean(process.env.LLM_API_KEY),
    });
  }

  return sendJson(response, 404, { error: "接口不存在" });
}

async function serveStatic(response, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, relative);
  const publicRoot = path.resolve(PUBLIC_DIR) + path.sep;
  if (!filePath.startsWith(publicRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": type,
      "Content-Length": content.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || HOST}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else {
      await serveStatic(response, url.pathname);
    }
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "服务暂时不可用" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`小轨已启动：http://${HOST}:${PORT}`);
  console.log(
    process.env.LLM_API_KEY
      ? "模型接口：已配置"
      : "模型接口：未配置，当前使用本地规则",
  );
});
