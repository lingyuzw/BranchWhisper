export interface AudioRuntime {
  audioCtx: AudioContext | null;
  playerGain: GainNode | null;
  playheadTime: number;
  playbackSources: Set<AudioBufferSourceNode>;
  ttsSampleRate: number;
  micStream: MediaStream | null;
  micSource: MediaStreamAudioSourceNode | null;
  micProcessor: ScriptProcessorNode | null;
  silentGain: GainNode | null;
  micPending: Float32Array;
  latestLevel: number;
}

export function createAudioRuntime(): AudioRuntime {
  return {
    audioCtx: null,
    playerGain: null,
    playheadTime: 0,
    playbackSources: new Set(),
    ttsSampleRate: 24000,
    micStream: null,
    micSource: null,
    micProcessor: null,
    silentGain: null,
    micPending: new Float32Array(0),
    latestLevel: 0,
  };
}

export async function ensureAudioContext(runtime: AudioRuntime) {
  if (!runtime.audioCtx) {
    runtime.audioCtx = new AudioContext();
    runtime.playerGain = runtime.audioCtx.createGain();
    runtime.playerGain.gain.value = 1;
    runtime.playerGain.connect(runtime.audioCtx.destination);
    runtime.playheadTime = runtime.audioCtx.currentTime;
  }
  if (runtime.audioCtx.state === "suspended") await runtime.audioCtx.resume();
}

export async function startMic(runtime: AudioRuntime, onSendSamples: (samples: Float32Array) => void, onLevel: (level: number) => void) {
  await ensureAudioContext(runtime);
  if (!runtime.audioCtx) throw new Error("AudioContext unavailable");
  runtime.micStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  });
  runtime.micSource = runtime.audioCtx.createMediaStreamSource(runtime.micStream);
  runtime.micProcessor = runtime.audioCtx.createScriptProcessor(1024, 1, 1);
  runtime.silentGain = runtime.audioCtx.createGain();
  runtime.silentGain.gain.value = 0;
  runtime.micProcessor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    runtime.latestLevel = audioLevel(input);
    onLevel(runtime.latestLevel);
    onSendSamples(downsample(input, runtime.audioCtx?.sampleRate || 48000, 16000));
  };
  runtime.micSource.connect(runtime.micProcessor);
  runtime.micProcessor.connect(runtime.silentGain);
  runtime.silentGain.connect(runtime.audioCtx.destination);
}

export function stopMic(runtime: AudioRuntime) {
  runtime.micPending = new Float32Array(0);
  runtime.micProcessor?.disconnect();
  runtime.micSource?.disconnect();
  runtime.silentGain?.disconnect();
  runtime.micStream?.getTracks().forEach((track) => track.stop());
  runtime.micStream = null;
  runtime.micSource = null;
  runtime.micProcessor = null;
  runtime.silentGain = null;
}

export function appendMicSamples(runtime: AudioRuntime, samples: Float32Array, send: (chunk: ArrayBuffer) => void) {
  runtime.micPending = appendFloat32(runtime.micPending, samples);
  while (runtime.micPending.length >= 512) {
    const chunk = runtime.micPending.slice(0, 512);
    runtime.micPending = runtime.micPending.slice(512);
    send(chunk.buffer);
  }
}

export async function schedulePcm16(runtime: AudioRuntime, arrayBuffer: ArrayBuffer) {
  await ensureAudioContext(runtime);
  if (!runtime.audioCtx || !runtime.playerGain || arrayBuffer.byteLength < 2) return;
  const view = new DataView(arrayBuffer);
  const sampleCount = Math.floor(view.byteLength / 2);
  const sampleRate = Number(runtime.ttsSampleRate) || 24000;
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) samples[i] = view.getInt16(i * 2, true) / 32768;
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.004), Math.floor(sampleCount / 4));
  for (let i = 0; i < fadeSamples; i += 1) {
    const gain = (i + 1) / fadeSamples;
    samples[i] *= gain;
    samples[sampleCount - 1 - i] *= gain;
  }
  const buffer = runtime.audioCtx.createBuffer(1, sampleCount, sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = runtime.audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(runtime.playerGain);
  const startAt = Math.max(runtime.audioCtx.currentTime + 0.06, runtime.playheadTime || 0);
  runtime.playbackSources.add(source);
  source.onended = () => runtime.playbackSources.delete(source);
  source.start(startAt);
  runtime.playheadTime = startAt + buffer.duration;
}

export function stopAssistantAudio(runtime: AudioRuntime) {
  for (const source of runtime.playbackSources) {
    try {
      source.stop();
    } catch {
      // Source may already be stopped by the browser.
    }
  }
  runtime.playbackSources.clear();
  if (runtime.audioCtx) runtime.playheadTime = runtime.audioCtx.currentTime;
}

function audioLevel(input: Float32Array) {
  let sum = 0;
  for (let i = 0; i < input.length; i += 4) sum += input[i] * input[i];
  return Math.min(1, Math.sqrt(sum / Math.max(1, input.length / 4)) * 8);
}

function downsample(input: Float32Array, inputRate: number, outputRate: number) {
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

function appendFloat32(left: Float32Array, right: Float32Array) {
  const merged = new Float32Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}
