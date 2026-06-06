const $ = (selector) => document.querySelector(selector);

const page = document.body.dataset.page || "dashboard";
const ACTIVE_CONVERSATION_KEY = "buding.activeConversationId";

const DEFAULT_CONFIG = {
  asr_mode: "transcription",
  asr_url: "http://127.0.0.1:8001/v1/audio/transcriptions",
  asr_model: "qwen3-asr",
  llm_url: "http://127.0.0.1:8080/v1/chat/completions",
  llm_model: "qwen3.5-9b",
  temperature: 0.35,
  max_tokens: 220,
  history_turns: 8,
  tts_url: "http://127.0.0.1:50000/tts",
  tts_sample_rate: 24000,
  tts_speed: 1.08,
  tts_seed: 42,
  tts_volume: 0.88,
  tts_fade_ms: 5,
  vad_threshold: 0.5,
  vad_min_silence_ms: 350,
  vad_speech_pad_ms: 120,
  pre_speech_ms: 250,
  min_utterance_ms: 250,
  max_utterance_sec: 15,
};

const DEFAULT_SERVICES = [
  {
    id: "asr",
    label: "Qwen3-ASR vLLM",
    description: "qwen-asr-serve speech recognition endpoint.",
    cwd: "/root/autodl-tmp/project",
    command: "/root/miniconda3/bin/conda run --no-capture-output -n qwen3-asr qwen-asr-serve /root/autodl-tmp/project/Qwen3-ASR-1.7B --served-model-name qwen3-asr --gpu-memory-utilization 0.45 --max-model-len 8192 --max-num-seqs 1 --enforce-eager --host 0.0.0.0 --port 8001",
    health_url: "http://127.0.0.1:8001/health",
    startup_wait_sec: 25,
    running: false,
  },
  {
    id: "llm",
    label: "llama.cpp Qwen3.5",
    description: "OpenAI-compatible llama.cpp chat server.",
    cwd: "/root/autodl-tmp/project/llama.cpp",
    command: "./build-cuda/bin/llama-server -m ./Qwen3.5-9B.Q8_0.gguf --alias qwen3.5-9b --host 0.0.0.0 --port 8080 -ngl 99 -c 4096 --jinja --reasoning off",
    health_url: "http://127.0.0.1:8080/health",
    startup_wait_sec: 10,
    running: false,
  },
  {
    id: "tts",
    label: "CosyVoice3 TTS",
    description: "Trained CosyVoice3 streaming PCM API.",
    cwd: "/root/autodl-tmp/project/CosyVoice",
    command: "/root/miniconda3/bin/conda run --no-capture-output -n cosyvoice_vllm python -u /root/autodl-tmp/project/buding/tts/trained_tts_server.py --repo_dir /root/autodl-tmp/project/CosyVoice --model_dir /root/autodl-tmp/project/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B --speaker hanser --load_vllm --fp16 --host 0.0.0.0 --port 50000",
    health_url: "http://127.0.0.1:50000/health",
    startup_wait_sec: 0,
    running: false,
  },
];

const state = {
  previewMode: false,
  services: DEFAULT_SERVICES.map((service) => ({ ...service })),
  conversations: [],
  activeConversationId: localStorage.getItem(ACTIVE_CONVERSATION_KEY) || "",
  activeConversation: null,
  selectedLogService: "asr",
  currentConfig: { ...DEFAULT_CONFIG },
  ws: null,
  reconnectTimer: 0,
  manualSocketClose: false,
  connected: false,
  micActive: false,
  busy: false,
  audioCtx: null,
  playerGain: null,
  playheadTime: 0,
  micStream: null,
  micSource: null,
  micProcessor: null,
  silentGain: null,
  micPending: new Float32Array(0),
  ttsSampleRate: 24000,
  currentAssistant: null,
  levels: Array.from({ length: 110 }, () => 0),
  latestLevel: 0,
  releaseTimer: 0,
  servicePollTimer: 0,
};

document.addEventListener("DOMContentLoaded", async () => {
  renderIcons();
  await loadConfig();
  await loadServices();

  if (page === "dashboard") await initDashboard();
  if (page === "services") initServices();
  if (page === "settings") initSettings();
});

function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function loadConfig() {
  try {
    const config = await fetchJson("/api/config");
    state.previewMode = false;
    state.currentConfig = { ...DEFAULT_CONFIG, ...config };
    state.ttsSampleRate = Number(config.tts_sample_rate || 24000);
    fillConfig(state.currentConfig);
    setSystemState("后端在线");
  } catch (error) {
    state.previewMode = true;
    state.currentConfig = { ...DEFAULT_CONFIG };
    state.ttsSampleRate = DEFAULT_CONFIG.tts_sample_rate;
    fillConfig(DEFAULT_CONFIG);
    setSystemState("静态预览");
    if (page === "dashboard") addMessage("system", `预览模式：${error.message}`);
  }
}

function fillConfig(config) {
  setValue("asrMode", config.asr_mode || DEFAULT_CONFIG.asr_mode);
  setValue("asrUrl", config.asr_url || DEFAULT_CONFIG.asr_url);
  setValue("asrModel", config.asr_model || DEFAULT_CONFIG.asr_model);
  setValue("llmUrl", config.llm_url || DEFAULT_CONFIG.llm_url);
  setValue("llmModel", config.llm_model || DEFAULT_CONFIG.llm_model);
  setValue("ttsUrl", config.tts_url || DEFAULT_CONFIG.tts_url);
  setValue("temperature", config.temperature ?? DEFAULT_CONFIG.temperature);
  setValue("maxTokens", config.max_tokens ?? DEFAULT_CONFIG.max_tokens);
  setValue("historyTurns", config.history_turns ?? DEFAULT_CONFIG.history_turns);
  setValue("ttsSpeed", config.tts_speed ?? DEFAULT_CONFIG.tts_speed);
  setValue("ttsSeed", config.tts_seed ?? DEFAULT_CONFIG.tts_seed);
  setValue("ttsVolume", config.tts_volume ?? DEFAULT_CONFIG.tts_volume);
  setValue("ttsFadeMs", config.tts_fade_ms ?? DEFAULT_CONFIG.tts_fade_ms);
  setValue("vadThreshold", config.vad_threshold ?? DEFAULT_CONFIG.vad_threshold);
  setValue("vadMinSilence", config.vad_min_silence_ms ?? DEFAULT_CONFIG.vad_min_silence_ms);
  setValue("vadSpeechPad", config.vad_speech_pad_ms ?? DEFAULT_CONFIG.vad_speech_pad_ms);
  setValue("preSpeech", config.pre_speech_ms ?? DEFAULT_CONFIG.pre_speech_ms);
  setValue("minUtterance", config.min_utterance_ms ?? DEFAULT_CONFIG.min_utterance_ms);
  setValue("maxUtterance", config.max_utterance_sec ?? DEFAULT_CONFIG.max_utterance_sec);
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function value(id, fallback = "") {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}

function collectConfig() {
  return {
    asr_mode: value("asrMode", DEFAULT_CONFIG.asr_mode),
    asr_url: value("asrUrl", DEFAULT_CONFIG.asr_url).trim(),
    asr_model: value("asrModel", DEFAULT_CONFIG.asr_model).trim(),
    llm_url: value("llmUrl", DEFAULT_CONFIG.llm_url).trim(),
    llm_model: value("llmModel", DEFAULT_CONFIG.llm_model).trim(),
    temperature: Number(value("temperature", DEFAULT_CONFIG.temperature)),
    max_tokens: Number(value("maxTokens", DEFAULT_CONFIG.max_tokens)),
    history_turns: Number(value("historyTurns", DEFAULT_CONFIG.history_turns)),
    tts_url: value("ttsUrl", DEFAULT_CONFIG.tts_url).trim(),
    tts_speed: Number(value("ttsSpeed", DEFAULT_CONFIG.tts_speed)),
    tts_seed: Number(value("ttsSeed", DEFAULT_CONFIG.tts_seed)),
    tts_volume: Number(value("ttsVolume", DEFAULT_CONFIG.tts_volume)),
    tts_fade_ms: Number(value("ttsFadeMs", DEFAULT_CONFIG.tts_fade_ms)),
    vad_threshold: Number(value("vadThreshold", DEFAULT_CONFIG.vad_threshold)),
    vad_min_silence_ms: Number(value("vadMinSilence", DEFAULT_CONFIG.vad_min_silence_ms)),
    vad_speech_pad_ms: Number(value("vadSpeechPad", DEFAULT_CONFIG.vad_speech_pad_ms)),
    pre_speech_ms: Number(value("preSpeech", DEFAULT_CONFIG.pre_speech_ms)),
    min_utterance_ms: Number(value("minUtterance", DEFAULT_CONFIG.min_utterance_ms)),
    max_utterance_sec: Number(value("maxUtterance", DEFAULT_CONFIG.max_utterance_sec)),
  };
}

function setSystemState(text) {
  const el = $("#systemState");
  if (el) el.textContent = text;
}

async function initDashboard() {
  $("#micBtn")?.addEventListener("click", toggleMic);
  $("#sendBtn")?.addEventListener("click", sendText);
  $("#resetBtn")?.addEventListener("click", newConversation);
  $("#newConversationBtn")?.addEventListener("click", newConversation);
  const textInput = $("#textInput");
  textInput?.addEventListener("input", () => resizeComposerInput(textInput));
  textInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendText();
    }
  });
  resizeComposerInput(textInput);

  await loadConversations();
  connectSocket();
  drawScope();
}

async function loadConversations() {
  if (state.previewMode) {
    renderConversationList();
    return;
  }
  try {
    const data = await fetchJson("/api/conversations");
    state.conversations = data.conversations || [];
    if (!state.activeConversationId && state.conversations.length) {
      state.activeConversationId = state.conversations[0].id;
      localStorage.setItem(ACTIVE_CONVERSATION_KEY, state.activeConversationId);
    }
    renderConversationList();
  } catch (error) {
    addMessage("system", `会话列表读取失败：${error.message}`);
  }
}

function renderConversationList() {
  const host = $("#conversationList");
  if (!host) return;
  host.innerHTML = "";
  const conversations = state.conversations.slice(0, 24);
  if (!conversations.length) {
    const empty = document.createElement("p");
    empty.className = "conversation-empty";
    empty.textContent = "还没有保存的对话";
    host.appendChild(empty);
    return;
  }
  for (const conversation of conversations) {
    const item = document.createElement("div");
    item.className = `conversation-item ${conversation.id === state.activeConversationId ? "active" : ""}`;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "conversation-open";
    openButton.innerHTML = "<strong></strong><span></span><small></small>";
    openButton.querySelector("strong").textContent = conversation.title || "新的对话";
    openButton.querySelector("span").textContent = conversation.last_message || "空会话";
    openButton.querySelector("small").textContent = formatConversationMeta(conversation);
    openButton.addEventListener("click", () => selectConversation(conversation.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "conversation-delete";
    deleteButton.title = "删除对话";
    deleteButton.innerHTML = '<i data-lucide="trash-2"></i>';
    deleteButton.addEventListener("click", () => deleteConversation(conversation));

    item.append(openButton, deleteButton);
    host.appendChild(item);
  }
  renderIcons();
}

function formatConversationMeta(conversation) {
  const sequence = conversation.sequence ? `第 ${conversation.sequence} 次` : "本次";
  const count = Number(conversation.message_count || 0);
  return `${sequence} · ${count} 条`;
}

async function newConversation() {
  if (state.previewMode) {
    clearTranscript();
    return;
  }
  try {
    const data = await fetchJson("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const conversation = data.conversation;
    state.activeConversationId = conversation.id;
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversation.id);
    await loadConversations();
    reconnectDialog();
  } catch (error) {
    addMessage("system", `新建会话失败：${error.message}`);
  }
}

async function deleteConversation(conversation) {
  if (!conversation?.id || state.previewMode) return;
  const title = conversation.title || "这次对话";
  if (!window.confirm(`删除「${title}」？这条记录会从本地历史里移除。`)) return;

  const wasActive = conversation.id === state.activeConversationId;
  try {
    await fetchJson(`/api/conversations/${encodeURIComponent(conversation.id)}`, { method: "DELETE" });
    if (wasActive) {
      state.activeConversationId = "";
      state.activeConversation = null;
      localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
      clearTranscript();
    }
    await loadConversations();
    if (wasActive) reconnectDialog();
  } catch (error) {
    addMessage("system", `删除会话失败：${error.message}`);
  }
}

function selectConversation(conversationId) {
  if (!conversationId || conversationId === state.activeConversationId) return;
  state.activeConversationId = conversationId;
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationId);
  renderConversationList();
  reconnectDialog();
}

function applyConversation(conversation, options = {}) {
  if (!conversation) return;
  state.activeConversation = conversation;
  state.activeConversationId = conversation.id;
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversation.id);
  setText("conversationTitle", conversation.title || "新的对话");
  setText("conversationMeta", formatConversationMeta(conversation));
  if (options.renderMessages) renderTranscript(conversation.messages || []);
  loadConversations();
}

function renderTranscript(messages) {
  clearTranscript();
  for (const message of messages) {
    if (message.role === "user" || message.role === "assistant" || message.role === "system") {
      addMessage(message.role, message.content || "");
    }
  }
}

function reconnectDialog() {
  state.manualSocketClose = true;
  window.clearTimeout(state.reconnectTimer);
  if (state.ws && state.ws.readyState <= WebSocket.OPEN) state.ws.close();
  state.ws = null;
  state.connected = false;
  state.currentAssistant = null;
  clearTranscript();
  window.setTimeout(() => {
    state.manualSocketClose = false;
    connectSocket();
  }, 120);
}

function connectSocket() {
  if (state.ws && state.ws.readyState <= WebSocket.OPEN) return;
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const query = state.activeConversationId ? `?conversation_id=${encodeURIComponent(state.activeConversationId)}` : "";
  const ws = new WebSocket(`${scheme}://${location.host}/ws/dialog${query}`);
  state.ws = ws;
  ws.binaryType = "arraybuffer";

  ws.addEventListener("open", () => {
    state.connected = true;
    setDialogState(state.micActive ? "监听中" : "待机");
    sendRuntimeSettings();
  });

  ws.addEventListener("message", handleSocketMessage);
  ws.addEventListener("close", () => {
    state.connected = false;
    setDialogState("断开");
    if (!state.previewMode && !state.manualSocketClose) {
      window.clearTimeout(state.reconnectTimer);
      state.reconnectTimer = window.setTimeout(connectSocket, 1200);
    }
  });
  ws.addEventListener("error", () => setDialogState(state.previewMode ? "预览" : "连接异常"));
}

function sendRuntimeSettings() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ws.send(JSON.stringify({ type: "settings", settings: state.currentConfig }));
}

async function handleSocketMessage(event) {
  if (event.data instanceof ArrayBuffer) {
    schedulePcm16(event.data);
    return;
  }
  if (event.data instanceof Blob) {
    schedulePcm16(await event.data.arrayBuffer());
    return;
  }

  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }
  handleDialogEvent(data);
}

function handleDialogEvent(data) {
  switch (data.type) {
    case "ready":
      setDialogState("待机");
      break;
    case "conversation":
      applyConversation(data.conversation, { renderMessages: true });
      break;
    case "conversation_saved":
      applyConversation(data.conversation, { renderMessages: false });
      break;
    case "settings":
      state.currentConfig = { ...state.currentConfig, ...(data.settings || {}) };
      break;
    case "status":
      if (data.stage === "vad") setText("vadLabel", data.label || "vad");
      break;
    case "vad_start":
      state.busy = false;
      setText("vadLabel", "speech");
      setDialogState("收音");
      break;
    case "vad_end":
      setText("vadLabel", `${data.duration_ms || 0} ms`);
      setDialogState("识别");
      state.busy = true;
      break;
    case "vad_short":
      setText("vadLabel", "short");
      break;
    case "user":
      addMessage("user", data.text || "");
      state.currentAssistant = null;
      break;
    case "assistant_start":
      state.currentAssistant = addMessage("assistant", "");
      setDialogState("生成");
      break;
    case "llm_delta":
      appendAssistant(data.text || "");
      break;
    case "audio_format":
      state.ttsSampleRate = Number(data.sample_rate || 24000);
      setDialogState("播放");
      break;
    case "metric":
      setMetric(data.name, data.value);
      break;
    case "error":
      addMessage("system", data.message || "出错了");
      setDialogState("错误");
      break;
    case "reset":
      applyConversation(data.conversation, { renderMessages: true });
      setDialogState("待机");
      break;
    case "turn_done":
      releaseAfterPlayback();
      break;
    default:
      break;
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setDialogState(text) {
  setText("dialogState", text);
}

function setMetric(name, value) {
  const text = Number.isFinite(Number(value)) ? `${value}ms` : "--";
  if (name === "asr_ms") setText("asrMetric", text);
  if (name === "llm_first_token_ms") setText("llmMetric", text);
  if (name === "tts_first_audio_ms") setText("ttsMetric", text);
}

function addMessage(role, text) {
  const transcript = $("#transcript");
  if (!transcript) return null;
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = text;
  transcript.appendChild(node);
  scrollTranscript();
  return node;
}

function appendAssistant(text) {
  if (!state.currentAssistant) state.currentAssistant = addMessage("assistant", "");
  if (state.currentAssistant) state.currentAssistant.textContent += text;
  scrollTranscript();
}

function clearTranscript() {
  const transcript = $("#transcript");
  if (transcript) transcript.innerHTML = "";
  state.currentAssistant = null;
}

function scrollTranscript() {
  const transcript = $("#transcript");
  if (transcript) transcript.scrollTop = transcript.scrollHeight;
}

async function sendText() {
  const input = $("#textInput");
  const text = input?.value.trim();
  if (!text) return;
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    addMessage("system", "对话后端未连接，请先启动 Web 控制台。");
    return;
  }
  await ensureAudioContext();
  state.busy = true;
  setDialogState("发送");
  state.ws.send(JSON.stringify({ type: "text", text }));
  input.value = "";
  resizeComposerInput(input);
}

function resizeComposerInput(input) {
  if (!input) return;
  input.style.height = "auto";
  const maxHeight = 132;
  const nextHeight = Math.min(maxHeight, Math.max(44, input.scrollHeight));
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
}

async function toggleMic() {
  if (state.micActive) stopMic();
  else await startMic();
}

async function ensureAudioContext() {
  if (!state.audioCtx) {
    state.audioCtx = new AudioContext();
    state.playerGain = state.audioCtx.createGain();
    state.playerGain.gain.value = 1;
    state.playerGain.connect(state.audioCtx.destination);
    state.playheadTime = state.audioCtx.currentTime;
  }
  if (state.audioCtx.state === "suspended") await state.audioCtx.resume();
}

async function startMic() {
  if (!state.connected) {
    addMessage("system", "对话通道未连接，不能打开麦克风。");
    return;
  }
  await ensureAudioContext();
  state.micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  });

  state.micSource = state.audioCtx.createMediaStreamSource(state.micStream);
  state.micProcessor = state.audioCtx.createScriptProcessor(1024, 1, 1);
  state.silentGain = state.audioCtx.createGain();
  state.silentGain.gain.value = 0;

  state.micProcessor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    updateLevel(input);
    if (!state.micActive || state.busy || state.ws?.readyState !== WebSocket.OPEN) return;
    sendMicSamples(downsample(input, state.audioCtx.sampleRate, 16000));
  };

  state.micSource.connect(state.micProcessor);
  state.micProcessor.connect(state.silentGain);
  state.silentGain.connect(state.audioCtx.destination);

  state.micActive = true;
  $("#micBtn")?.classList.add("active");
  const micBtn = $("#micBtn");
  if (micBtn) micBtn.innerHTML = '<i data-lucide="mic-off"></i>';
  renderIcons();
  setDialogState("监听中");
}

function stopMic() {
  state.micActive = false;
  state.micPending = new Float32Array(0);
  state.micProcessor?.disconnect();
  state.micSource?.disconnect();
  state.silentGain?.disconnect();
  for (const track of state.micStream?.getTracks() || []) track.stop();
  state.micStream = null;
  state.micSource = null;
  state.micProcessor = null;
  state.silentGain = null;
  $("#micBtn")?.classList.remove("active");
  const micBtn = $("#micBtn");
  if (micBtn) micBtn.innerHTML = '<i data-lucide="mic"></i>';
  renderIcons();
  setDialogState("待机");
}

function downsample(input, inputRate, outputRate) {
  if (inputRate === outputRate) return new Float32Array(input);
  const ratio = inputRate / outputRate;
  const newLength = Math.floor(input.length / ratio);
  const result = new Float32Array(newLength);
  let offsetInput = 0;
  for (let i = 0; i < newLength; i += 1) {
    const nextOffset = Math.round((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = offsetInput; j < nextOffset && j < input.length; j += 1) {
      sum += input[j];
      count += 1;
    }
    result[i] = count ? sum / count : 0;
    offsetInput = nextOffset;
  }
  return result;
}

function appendFloat32(left, right) {
  const merged = new Float32Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

function sendMicSamples(samples) {
  state.micPending = appendFloat32(state.micPending, samples);
  while (state.micPending.length >= 512) {
    const chunk = state.micPending.slice(0, 512);
    state.micPending = state.micPending.slice(512);
    state.ws.send(chunk.buffer);
  }
}

function updateLevel(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i += 4) sum += input[i] * input[i];
  const rms = Math.sqrt(sum / Math.max(1, input.length / 4));
  state.latestLevel = Math.min(1, rms * 8);
  const level = Math.round(state.latestLevel * 100);
  const bar = $("#levelBar");
  if (bar) bar.style.width = `${level}%`;
  setText("levelText", `${level}%`);
}

async function schedulePcm16(arrayBuffer) {
  await ensureAudioContext();
  if (!arrayBuffer.byteLength || arrayBuffer.byteLength < 2) return;
  const view = new DataView(arrayBuffer);
  const sampleCount = Math.floor(view.byteLength / 2);
  const sampleRate = Number(state.ttsSampleRate) || 24000;
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) samples[i] = view.getInt16(i * 2, true) / 32768;

  const fadeSamples = Math.min(Math.floor(sampleRate * 0.004), Math.floor(sampleCount / 4));
  for (let i = 0; i < fadeSamples; i += 1) {
    const gain = (i + 1) / fadeSamples;
    samples[i] *= gain;
    samples[sampleCount - 1 - i] *= gain;
  }

  const buffer = state.audioCtx.createBuffer(1, sampleCount, sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = state.audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(state.playerGain);

  const startAt = Math.max(state.audioCtx.currentTime + 0.06, state.playheadTime || 0);
  source.start(startAt);
  state.playheadTime = startAt + buffer.duration;
}

function releaseAfterPlayback() {
  window.clearTimeout(state.releaseTimer);
  const remaining = state.audioCtx ? Math.max(0, state.playheadTime - state.audioCtx.currentTime) : 0;
  state.releaseTimer = window.setTimeout(() => {
    state.busy = false;
    setDialogState(state.micActive ? "监听中" : "待机");
  }, remaining * 1000 + 140);
}

function drawScope() {
  const canvas = $("#scopeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 900;
  const height = canvas.clientHeight || 220;
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8faf9";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(23, 32, 38, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  state.levels.push(state.latestLevel);
  state.levels.shift();
  ctx.beginPath();
  state.levels.forEach((level, index) => {
    const x = (index / (state.levels.length - 1)) * width;
    const wobble = Math.sin(index * 0.45 + performance.now() / 260) * 0.06;
    const y = height / 2 - (level + wobble) * height * 0.36;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = state.busy ? "#c77900" : state.micActive ? "#007c74" : "#3158d4";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.strokeStyle = "rgba(23, 32, 38, 0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
  requestAnimationFrame(drawScope);
}

async function loadServices() {
  try {
    const data = await fetchJson("/api/services");
    state.previewMode = false;
    state.services = data.services || DEFAULT_SERVICES;
    setSystemState(serviceSummaryText());
  } catch {
    state.previewMode = true;
    setSystemState("静态预览");
  }

  if (page === "services") {
    renderServiceCards();
    renderLogTabs();
  }
  if (page === "settings") renderProfileList();
}

function serviceSummaryText() {
  const running = state.services.filter((service) => service.running).length;
  return `${running}/${state.services.length} 运行`;
}

function initServices() {
  $("#startAllBtn")?.addEventListener("click", startAllServices);
  $("#stopAllBtn")?.addEventListener("click", stopAllServices);
  $("#clearAllLogsBtn")?.addEventListener("click", clearAllServiceLogs);
  $("#healthBtn")?.addEventListener("click", loadServices);
  $("#refreshLogsBtn")?.addEventListener("click", () => refreshLogs(state.selectedLogService));
  const hashLog = location.hash.replace("#logs-", "");
  if (hashLog) state.selectedLogService = hashLog;
  renderServiceCards();
  renderLogTabs();
  refreshLogs(state.selectedLogService, { quiet: true });
  startServicePolling();
}

function initSettings() {
  $("#saveAllBtn")?.addEventListener("click", saveSettingsPage);
  renderProfileList();
}

function renderServiceCards() {
  const host = $("#serviceCards");
  if (!host) return;
  host.innerHTML = "";
  for (const service of state.services) host.appendChild(createServiceCard(service));
  renderIcons();
}

function createServiceCard(service) {
  const card = document.createElement("article");
  const healthOk = service.health?.ok;
  card.className = `service-card ${service.running ? "active" : healthOk === false ? "failed" : ""}`;
  const port = service.health_url ? new URL(service.health_url).port || "--" : "--";
  const pid = service.external ? "external" : service.pid || "--";
  const stateLabel = service.external ? "external" : service.running ? "running" : "stopped";
  const health = service.health ? (service.health.ok ? "ok" : "fail") : "--";

  card.innerHTML = `
    <div class="service-top">
      <span class="status-dot"></span>
      <div class="service-title">
        <strong></strong>
        <span></span>
      </div>
    </div>
    <div class="service-meta">
      <div class="meta-cell"><span>STATE</span><strong>${stateLabel}</strong></div>
      <div class="meta-cell"><span>PID</span><strong>${pid}</strong></div>
      <div class="meta-cell"><span>PORT</span><strong>${port}</strong></div>
      <div class="meta-cell"><span>HEALTH</span><strong>${health}</strong></div>
    </div>
    <div class="service-actions">
      <button class="service-action start" type="button"><i data-lucide="play"></i>启动</button>
      <button class="service-action stop" type="button"><i data-lucide="square"></i>停止</button>
      <button class="service-action logs" type="button"><i data-lucide="scroll-text"></i>日志</button>
      <button class="service-action clear-logs" type="button"><i data-lucide="trash-2"></i>清日志</button>
      <a class="service-action" href="/static/settings.html#${service.id}"><i data-lucide="settings-2"></i>配置</a>
    </div>
  `;
  card.querySelector(".service-title strong").textContent = service.label || service.id;
  card.querySelector(".service-title span").textContent = service.description || "";
  card.querySelector(".start").addEventListener("click", () => startService(service.id));
  card.querySelector(".stop").addEventListener("click", () => stopService(service.id));
  card.querySelector(".logs").addEventListener("click", () => refreshLogs(service.id));
  card.querySelector(".clear-logs").addEventListener("click", () => clearServiceLogs(service));
  return card;
}

function renderLogTabs() {
  const host = $("#logTabs");
  if (!host) return;
  host.innerHTML = "";
  for (const service of state.services) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `log-tab ${service.id === state.selectedLogService ? "active" : ""}`;
    button.textContent = service.id.toUpperCase();
    button.addEventListener("click", () => refreshLogs(service.id));
    host.appendChild(button);
  }
}

function renderProfileList() {
  const host = $("#profileList");
  if (!host) return;
  host.innerHTML = "";
  for (const service of state.services) host.appendChild(createProfileCard(service));
  renderIcons();
  const hash = location.hash.replace("#", "");
  if (hash) document.getElementById(`profile-${hash}`)?.scrollIntoView({ block: "center" });
}

function createProfileCard(service) {
  const card = document.createElement("section");
  card.className = "profile-card";
  card.id = `profile-${service.id}`;
  card.dataset.serviceId = service.id;
  card.innerHTML = `
    <div class="profile-head">
      <div>
        <strong></strong>
        <span></span>
      </div>
      <button class="small-button test-log" type="button"><i data-lucide="scroll-text"></i>日志</button>
    </div>
    <div class="form-grid">
      <label><span>Working Directory</span><input class="profile-cwd" type="text" /></label>
      <label><span>Health URL</span><input class="profile-health" type="text" /></label>
      <label><span>Startup Wait sec</span><input class="profile-wait" type="number" min="0" max="180" step="1" /></label>
      <label class="wide"><span>Start Command</span><textarea class="profile-command"></textarea></label>
    </div>
  `;
  card.querySelector("strong").textContent = service.label || service.id;
  card.querySelector(".profile-head span").textContent = service.description || "";
  card.querySelector(".profile-cwd").value = service.cwd || "";
  card.querySelector(".profile-health").value = service.health_url || "";
  card.querySelector(".profile-wait").value = service.startup_wait_sec ?? 0;
  card.querySelector(".profile-command").value = service.command || "";
  card.querySelector(".test-log").addEventListener("click", () => {
    location.href = `/static/services.html#logs-${service.id}`;
  });
  return card;
}

function collectProfileConfig(serviceId) {
  const card = document.querySelector(`[data-service-id="${serviceId}"]`);
  return {
    cwd: card?.querySelector(".profile-cwd")?.value.trim() || "",
    health_url: card?.querySelector(".profile-health")?.value.trim() || "",
    startup_wait_sec: Number(card?.querySelector(".profile-wait")?.value || 0),
    command: card?.querySelector(".profile-command")?.value.trim() || "",
  };
}

async function saveSettingsPage() {
  if (state.previewMode) {
    setSystemState("预览已保存");
    return;
  }
  try {
    await fetchJson("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectConfig()),
    });

    for (const service of state.services) {
      await fetchJson(`/api/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectProfileConfig(service.id)),
      });
    }

    await loadConfig();
    await loadServices();
    setSystemState("配置已应用");
  } catch (error) {
    setSystemState(`保存失败 ${error.message}`);
  }
}

async function startService(serviceId) {
  if (state.previewMode) {
    patchLocalService(serviceId, { running: true, pid: "preview" });
    renderServiceCards();
    return;
  }
  try {
    await fetchJson(`/api/services/${serviceId}/start`, { method: "POST" });
    await loadServices();
    await refreshLogs(serviceId);
  } catch (error) {
    showLog(`启动失败：${error.message}`);
  }
}

async function stopService(serviceId) {
  if (state.previewMode) {
    patchLocalService(serviceId, { running: false, pid: null });
    renderServiceCards();
    return;
  }
  try {
    await fetchJson(`/api/services/${serviceId}/stop`, { method: "POST" });
    await loadServices();
    await refreshLogs(serviceId);
  } catch (error) {
    showLog(`停止失败：${error.message}`);
  }
}

async function startAllServices() {
  if (state.previewMode) {
    state.services = state.services.map((service) => ({ ...service, running: true, pid: "preview" }));
    renderServiceCards();
    showLog("预览模式：已模拟启动全部服务。");
    return;
  }
  showLog("starting all services...");
  try {
    await fetchJson("/api/services/start-all", { method: "POST" });
    await loadServices();
  } catch (error) {
    showLog(`一键启动失败：${error.message}`);
  }
}

async function stopAllServices() {
  if (state.previewMode) {
    state.services = state.services.map((service) => ({ ...service, running: false, pid: null }));
    renderServiceCards();
    showLog("预览模式：已模拟停止全部服务。");
    return;
  }
  showLog("stopping all services...");
  try {
    await fetchJson("/api/services/stop-all", { method: "POST" });
    await loadServices();
  } catch (error) {
    showLog(`全部停止失败：${error.message}`);
  }
}

async function clearServiceLogs(service) {
  if (!service?.id) return;
  if (state.previewMode) {
    showLog(`preview: cleared ${service.id} logs`);
    return;
  }
  if (!window.confirm(`清空 ${service.label || service.id} 的运行日志？`)) return;

  try {
    state.selectedLogService = service.id;
    showLog(`clearing ${service.id} logs...`);
    await fetchJson(`/api/services/${encodeURIComponent(service.id)}/logs`, { method: "DELETE" });
    await refreshLogs(service.id, { quiet: true });
  } catch (error) {
    showLog(`清空日志失败：${error.message}`);
  }
}

async function clearAllServiceLogs() {
  if (state.previewMode) {
    showLog("preview: cleared all logs");
    return;
  }
  if (!window.confirm("清空所有服务的运行日志？")) return;

  try {
    showLog("clearing all service logs...");
    await fetchJson("/api/services/logs", { method: "DELETE" });
    await refreshLogs(state.selectedLogService, { quiet: true });
  } catch (error) {
    showLog(`清空全部日志失败：${error.message}`);
  }
}

function patchLocalService(serviceId, patch) {
  const service = state.services.find((item) => item.id === serviceId);
  if (service) Object.assign(service, patch);
}

async function refreshLogs(serviceId, options = {}) {
  state.selectedLogService = serviceId || state.selectedLogService || "asr";
  renderLogTabs();

  if (state.previewMode) {
    if (!options.quiet) showLog("预览模式没有真实日志。正式后端启动后这里会显示模型 stdout/stderr。");
    return;
  }

  try {
    const data = await fetchJson(`/api/services/${state.selectedLogService}/logs?max_bytes=36000`);
    showLog(data.logs || "暂无日志。");
  } catch (error) {
    if (!options.quiet) showLog(`日志读取失败：${error.message}`);
  }
}

function showLog(text) {
  const output = $("#logOutput");
  if (!output) return;
  output.textContent = text || "";
  output.scrollTop = output.scrollHeight;
}

function startServicePolling() {
  window.clearInterval(state.servicePollTimer);
  state.servicePollTimer = window.setInterval(loadServices, 4500);
}
