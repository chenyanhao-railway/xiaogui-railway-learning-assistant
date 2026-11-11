const elements = {
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  startButton: document.querySelector("#startButton"),
  pauseButton: document.querySelector("#pauseButton"),
  conversation: document.querySelector("#conversation"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  taskList: document.querySelector("#taskList"),
  taskCount: document.querySelector("#taskCount"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskDue: document.querySelector("#taskDue"),
  taskPriority: document.querySelector("#taskPriority"),
  intervalSetting: document.querySelector("#intervalSetting"),
  quietStart: document.querySelector("#quietStart"),
  quietEnd: document.querySelector("#quietEnd"),
  voiceSetting: document.querySelector("#voiceSetting"),
  modeBadge: document.querySelector("#modeBadge"),
  signal: document.querySelector(".signal"),
  quickPrompts: document.querySelectorAll("[data-prompt]"),
  knowledgeCards: document.querySelectorAll(".knowledge-card"),
  weekCompleted: document.querySelector("#weekCompleted"),
  weekPending: document.querySelector("#weekPending"),
  weekQuestions: document.querySelector("#weekQuestions"),
  questionCount: document.querySelector("#questionCount"),
  questionList: document.querySelector("#questionList"),
  questionForm: document.querySelector("#questionForm"),
  questionInput: document.querySelector("#questionInput"),
};

const storageKey = "xiaogui-settings-v1";
const defaultSettings = {
  intervalMinutes: 30,
  quietStart: "23:00",
  quietEnd: "07:00",
  voiceEnabled: true,
};

let tasks = [];
let knowledgeQuestions = [];
let settings = loadSettings();
let started = false;
let paused = false;
let lastProactiveAt = 0;
let lastSpokenAt = 0;
let timer = null;

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem(storageKey, JSON.stringify(settings));
}

function syncSettingsToControls() {
  elements.intervalSetting.value = String(settings.intervalMinutes);
  elements.quietStart.value = settings.quietStart;
  elements.quietEnd.value = settings.quietEnd;
  elements.voiceSetting.checked = settings.voiceEnabled;
}

function timeValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isQuietNow() {
  const now = timeValue(new Date());
  const start = settings.quietStart;
  const end = settings.quietEnd;
  if (start === end) return false;
  return start < end
    ? now >= start && now < end
    : now >= start || now < end;
}

function formatter() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeTask(task) {
  if (!task.dueAt) return "未设置截止时间";
  const date = new Date(task.dueAt);
  if (Number.isNaN(date.getTime())) return "截止时间格式有误";
  return formatter().format(date);
}

function pendingTasks() {
  return tasks
    .filter((task) => !task.completed)
    .sort((a, b) => {
      const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return aTime - bTime;
    });
}

function nextTask() {
  return pendingTasks()[0] || null;
}

function renderTasks() {
  elements.taskList.replaceChildren();
  const ordered = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed));
  elements.taskCount.textContent = `${tasks.filter((task) => !task.completed).length} 项`;

  for (const task of ordered) {
    const item = document.createElement("div");
    item.className = `task${task.completed ? " done" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `完成 ${task.title}`);
    checkbox.addEventListener("change", () => toggleTask(task, checkbox.checked));

    const content = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = task.title;
    const detail = document.createElement("p");
    detail.textContent = `${task.priority}优先级 · ${describeTask(task)}`;
    content.append(title, detail);

    const remove = document.createElement("button");
    remove.className = "task-remove";
    remove.type = "button";
    remove.setAttribute("aria-label", `删除 ${task.title}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => removeTask(task.id));

    item.append(checkbox, content, remove);
    elements.taskList.append(item);
  }

  if (ordered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "caption";
    empty.textContent = "还没有任务。先添加一个今天能完成的小目标。";
    elements.taskList.append(empty);
  }
  renderReview();
}

function renderReview() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const completedThisWeek = tasks.filter((task) => {
    if (!task.completed || !task.completedAt) return false;
    return new Date(task.completedAt).getTime() >= sevenDaysAgo;
  }).length;
  const pending = tasks.filter((task) => !task.completed).length;
  const unresolved = knowledgeQuestions.filter((question) => !question.verified).length;
  elements.weekCompleted.textContent = String(completedThisWeek);
  elements.weekPending.textContent = String(pending);
  elements.weekQuestions.textContent = String(unresolved);
}

function renderQuestions() {
  elements.questionList.replaceChildren();
  const ordered = [...knowledgeQuestions].sort(
    (a, b) => Number(a.verified) - Number(b.verified),
  );
  elements.questionCount.textContent = `${
    knowledgeQuestions.filter((question) => !question.verified).length
  } 项待核实`;

  for (const question of ordered) {
    const item = document.createElement("div");
    item.className = `question-item${question.verified ? " verified" : ""}`;

    const copy = document.createElement("div");
    const text = document.createElement("p");
    text.textContent = question.text;
    const source = document.createElement("small");
    source.textContent = `${question.source} · ${
      question.verified ? "已核实" : "待向老师或正式资料核实"
    }`;
    copy.append(text, source);

    const actions = document.createElement("div");
    actions.className = "question-actions";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = question.verified ? "转回待核实" : "标记已核实";
    toggle.addEventListener("click", () => {
      toggleQuestion(question, !question.verified);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", () => removeQuestion(question.id));
    actions.append(toggle, remove);

    item.append(copy, actions);
    elements.questionList.append(item);
  }

  if (ordered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "question-empty";
    empty.textContent = "还没有记录。遇到没把握的知识，先把它留在这里。";
    elements.questionList.append(empty);
  }
  renderReview();
}

async function loadTasks() {
  const response = await fetch("/api/tasks");
  if (!response.ok) throw new Error("无法读取任务");
  const state = await response.json();
  tasks = state.tasks || [];
  knowledgeQuestions = state.knowledgeQuestions || [];
  renderTasks();
  renderQuestions();
}

async function toggleTask(task, completed) {
  const response = await fetch(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  if (!response.ok) return;
  const updated = await response.json();
  tasks = tasks.map((item) => (item.id === updated.id ? updated : item));
  renderTasks();
  if (completed) {
    const message = `完成了一项：${task.title}。记得给自己一点反馈，再决定下一步。`;
    addMessage("assistant", message);
    speak(message);
  }
}

async function addTask(event) {
  event.preventDefault();
  const title = elements.taskTitle.value.trim();
  if (!title) return;
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      dueAt: elements.taskDue.value || null,
      priority: elements.taskPriority.value,
    }),
  });
  if (!response.ok) {
    addMessage("assistant", "任务没有保存成功，请稍后再试。");
    return;
  }
  const task = await response.json();
  tasks.push(task);
  elements.taskForm.reset();
  elements.taskPriority.value = "中";
  renderTasks();
  const message = `已加入计划：${task.title}。我会按提醒设置关注它。`;
  addMessage("assistant", message);
  speak(message);
}

async function removeTask(id) {
  const response = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  if (!response.ok) return;
  tasks = tasks.filter((task) => task.id !== id);
  renderTasks();
}

async function addQuestion(text, source = "手动添加") {
  const normalized = text.trim();
  if (!normalized) return null;
  const duplicate = knowledgeQuestions.find(
    (question) => !question.verified && question.text === normalized,
  );
  if (duplicate) {
    addMessage("assistant", "这个问题已经在待核实清单里，完成核实后再标记即可。");
    return duplicate;
  }
  const response = await fetch("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: normalized, source }),
  });
  if (!response.ok) {
    addMessage("assistant", "问题没有保存成功，请稍后再试。");
    return null;
  }
  const question = await response.json();
  knowledgeQuestions.unshift(question);
  renderQuestions();
  addMessage("assistant", `已记下待核实问题：${question.text}`);
  return question;
}

async function toggleQuestion(question, verified) {
  const response = await fetch(`/api/questions/${question.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verified }),
  });
  if (!response.ok) return;
  const updated = await response.json();
  knowledgeQuestions = knowledgeQuestions.map((item) =>
    item.id === updated.id ? updated : item,
  );
  renderQuestions();
}

async function removeQuestion(id) {
  const response = await fetch(`/api/questions/${id}`, { method: "DELETE" });
  if (!response.ok) return;
  knowledgeQuestions = knowledgeQuestions.filter((question) => question.id !== id);
  renderQuestions();
}

function addMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role === "user" ? "from-user" : "from-assistant"}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "你" : "小轨";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  wrap.append(label, paragraph);
  elements.conversation.append(wrap);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

function preferredVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((voice) => /zh-CN/i.test(voice.lang) && /Xiaoxiao|Huihui|Yaoyao|Tingting/i.test(voice.name)) ||
    voices.find((voice) => /zh-CN/i.test(voice.lang)) ||
    null
  );
}

function speak(text) {
  if (!settings.voiceEnabled || paused || isQuietNow() || !("speechSynthesis" in window)) {
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.98;
  utterance.pitch = 1.04;
  const voice = preferredVoice();
  if (voice) utterance.voice = voice;
  elements.signal.classList.add("speaking");
  utterance.onend = () => elements.signal.classList.remove("speaking");
  utterance.onerror = () => elements.signal.classList.remove("speaking");
  speechSynthesis.speak(utterance);
  lastSpokenAt = Date.now();
}

async function ask(message) {
  addMessage("user", message);
  elements.chatInput.value = "";
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, tasks }),
  });
  const result = await response.json();
  const text = result.text || result.error || "我暂时没有回应。";
  addMessage("assistant", text);
  elements.modeBadge.textContent = result.source === "model" ? "模型模式" : "本地模式";
  speak(text);
}

function proactiveCheck(force = false) {
  if (!started || paused || isQuietNow()) return;
  const now = Date.now();
  const intervalMs = settings.intervalMinutes * 60 * 1000;
  if (!force && now - lastProactiveAt < intervalMs) return;
  if (now - lastSpokenAt < 10 * 60 * 1000) return;
  lastProactiveAt = now;

  const next = nextTask();
  if (!next) {
    speak("现在的任务都完成了。可以休息一会儿，或者给今天写一句复盘。");
    return;
  }

  const due = next.dueAt ? new Date(next.dueAt).getTime() : null;
  if (due && due < now) {
    speak(`有一项任务已经超过截止时间：${next.title}。先判断是继续完成，还是重新安排。`);
    return;
  }
  if (due && due - now <= 60 * 60 * 1000) {
    speak(`下一项任务是${next.title}，不到一小时就到期。先完成一个最小步骤。`);
    return;
  }
  speak(`我现在提醒你一次：下一项是${next.title}。要不要先做二十五分钟？`);
}

function setStarted(value) {
  started = value;
  elements.statusDot.classList.toggle("active", value && !paused);
  elements.statusText.textContent = value ? (paused ? "已暂停" : "主动提醒中") : "尚未启动";
  elements.startButton.textContent = value ? "已启动" : "启动小轨";
  elements.startButton.disabled = value;
}

async function startAssistant() {
  setStarted(true);
  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      // Voice reminders still work if notification permission is unavailable.
    }
  }
  const greeting = nextTask()
    ? `我在这里。先看一项：${nextTask().title}。你准备好时，我们就从它开始。`
    : "我在这里。今天当前没有待办，可以先休息，也可以添加一个学习目标。";
  addMessage("assistant", greeting);
  speak(greeting);
  clearInterval(timer);
  timer = setInterval(() => proactiveCheck(false), 30_000);
}

function togglePause() {
  paused = !paused;
  elements.pauseButton.setAttribute("aria-pressed", String(paused));
  elements.pauseButton.textContent = paused ? "恢复主动提醒" : "暂停主动提醒";
  elements.statusDot.classList.toggle("active", started && !paused);
  elements.statusText.textContent = started ? (paused ? "已暂停" : "主动提醒中") : "尚未启动";
  if (paused && "speechSynthesis" in window) {
    speechSynthesis.cancel();
    elements.signal.classList.remove("speaking");
  }
}

elements.startButton.addEventListener("click", startAssistant);
elements.pauseButton.addEventListener("click", togglePause);
elements.taskForm.addEventListener("submit", addTask);
elements.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = elements.chatInput.value.trim();
  if (message) ask(message);
});

for (const button of elements.quickPrompts) {
  button.addEventListener("click", () => {
    const message = button.dataset.prompt?.trim();
    if (message) ask(message);
  });
}

for (const card of elements.knowledgeCards) {
  card.addEventListener("toggle", () => {
    if (!card.open) return;
    for (const other of elements.knowledgeCards) {
      if (other !== card) other.open = false;
    }
  });
}

for (const button of document.querySelectorAll(".knowledge-action")) {
  button.addEventListener("click", () => {
    const card = button.closest(".knowledge-card");
    const question = card?.dataset.question;
    const source = card?.querySelector("summary")?.textContent?.trim() || "学习卡";
    if (question) addQuestion(question, source);
  });
}

elements.questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.questionInput.value.trim();
  if (!text) return;
  addQuestion(text).then((question) => {
    if (question) elements.questionForm.reset();
  });
});

elements.intervalSetting.addEventListener("change", () => {
  settings.intervalMinutes = Number(elements.intervalSetting.value);
  saveSettings();
});
elements.quietStart.addEventListener("change", () => {
  settings.quietStart = elements.quietStart.value;
  saveSettings();
});
elements.quietEnd.addEventListener("change", () => {
  settings.quietEnd = elements.quietEnd.value;
  saveSettings();
});
elements.voiceSetting.addEventListener("change", () => {
  settings.voiceEnabled = elements.voiceSetting.checked;
  saveSettings();
  if (!settings.voiceEnabled && "speechSynthesis" in window) speechSynthesis.cancel();
});

syncSettingsToControls();
loadTasks().catch((error) => {
  addMessage("assistant", `任务读取失败：${error.message}`);
});
