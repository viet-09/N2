// Gemini Live API transport for browser voice conversations.
//
// Usage from voice.js:
//   const live = createLiveSession({
//     apiKey: settings.apiKey,
//     model: settings.liveModel,
//     systemInstruction,
//     callbacks: {
//       onInputTranscript: ({ text }) => { /* update learner caption */ },
//       onOutputTranscript: ({ text }) => { /* update model caption */ },
//       // Transcription messages may arrive after turnComplete. Persist by
//       // idempotently upserting every onTranscript event. onTranscriptSettled
//       // is only a non-final UI debounce and may be followed by more text.
//       onTranscript: ({ direction, text, sequence }) => { /* upsert caption */ },
//       onTranscriptSettled: ({ snapshot }) => { /* render quiet snapshot */ },
//       onFallback: ({ error }) => { /* switch to record -> send */ },
//     },
//   });
//   await live.start(); // connect, wait for setupComplete, then open the mic
//   await live.stop();

export const LIVE_INPUT_SAMPLE_RATE = 16000;
export const LIVE_OUTPUT_SAMPLE_RATE = 24000;

const LIVE_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const LIVE_CONSTRAINED_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const SOCKET_OPEN = 1;
const SOCKET_CONNECTING = 0;
const DEFAULT_SETUP_TIMEOUT_MS = 15000;
const DEFAULT_PROCESSOR_BUFFER_SIZE = 1024;
const DEFAULT_MAX_BUFFERED_AMOUNT = 1024 * 1024;
const DEFAULT_TRANSCRIPT_SETTLE_MS = 500;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normaliseModel(model) {
  const value = String(model || '').trim();
  if (!value) {
    throw new LiveSessionError('Thiếu model hỗ trợ Gemini Live.', {
      code: 'missing-model',
      fallbackRecommended: true,
    });
  }
  return value.startsWith('models/') ? value : `models/${value}`;
}

function getAudioContextConstructor() {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function bytesToBase64(bytes) {
  if (typeof btoa !== 'function') {
    throw new LiveSessionError('Trình duyệt không hỗ trợ mã hóa âm thanh base64.', {
      code: 'base64-unsupported',
      fallbackRecommended: true,
    });
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof atob !== 'function') {
    throw new LiveSessionError('Trình duyệt không hỗ trợ giải mã âm thanh base64.', {
      code: 'base64-unsupported',
      fallbackRecommended: true,
    });
  }
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function float32ToPcm16Bytes(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = clamp(samples[i], -1, 1);
    const pcm = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    view.setInt16(i * 2, pcm, true);
  }
  return new Uint8Array(buffer);
}

function pcm16BytesToFloat32(bytes) {
  const usableLength = bytes.byteLength - (bytes.byteLength % 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, usableLength);
  const samples = new Float32Array(usableLength / 2);
  for (let i = 0; i < samples.length; i += 1) {
    const value = view.getInt16(i * 2, true);
    samples[i] = value < 0 ? value / 0x8000 : value / 0x7fff;
  }
  return samples;
}

function sampleRateFromMimeType(mimeType, fallback) {
  const match = /(?:^|;)\s*rate=(\d+)/i.exec(String(mimeType || ''));
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function durationToMilliseconds(duration) {
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return Math.max(0, duration * 1000);
  }
  if (typeof duration === 'string') {
    const match = /^(-?\d+(?:\.\d+)?)s$/.exec(duration.trim());
    return match ? Math.max(0, Number(match[1]) * 1000) : null;
  }
  if (isObject(duration)) {
    const seconds = Number(duration.seconds || 0);
    const nanos = Number(duration.nanos || 0);
    if (Number.isFinite(seconds) && Number.isFinite(nanos)) {
      return Math.max(0, seconds * 1000 + nanos / 1e6);
    }
  }
  return null;
}

function audioRms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function stopMediaStreamTracks(stream) {
  if (!stream) return;
  try {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch (error) {
        // Continue stopping any remaining tracks.
      }
    }
  } catch (error) {
    // A browser may invalidate a stream while permissions are changing.
  }
}

async function decodeSocketData(data) {
  if (typeof data === 'string') return data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return String(data ?? '');
}

/** Streaming linear resampler that keeps its fractional position across callbacks. */
class StreamingResampler {
  constructor(sourceRate, targetRate) {
    this.ratio = sourceRate / targetRate;
    this.buffer = new Float32Array(0);
    this.position = 0;
    this.downsampling = sourceRate > targetRate;
    this.filterAlpha = this.downsampling
      ? 1 - Math.exp((-2 * Math.PI * targetRate * 0.45) / sourceRate)
      : 1;
    this.filterA = 0;
    this.filterB = 0;
    this.filterReady = false;
  }

  process(input) {
    if (!input || !input.length) return new Float32Array(0);

    let source = input;
    if (this.downsampling) {
      source = new Float32Array(input.length);
      if (!this.filterReady) {
        this.filterA = input[0];
        this.filterB = input[0];
        this.filterReady = true;
      }
      for (let i = 0; i < input.length; i += 1) {
        this.filterA += this.filterAlpha * (input[i] - this.filterA);
        this.filterB += this.filterAlpha * (this.filterA - this.filterB);
        source[i] = this.filterB;
      }
    }

    const joined = new Float32Array(this.buffer.length + source.length);
    joined.set(this.buffer, 0);
    joined.set(source, this.buffer.length);

    const output = [];
    let position = this.position;
    while (position + 1 < joined.length) {
      const index = Math.floor(position);
      const fraction = position - index;
      output.push(joined[index] + (joined[index + 1] - joined[index]) * fraction);
      position += this.ratio;
    }

    const consumed = Math.floor(position);
    this.buffer = joined.slice(Math.min(consumed, joined.length));
    this.position = Math.max(0, position - consumed);
    return Float32Array.from(output);
  }
}

export class LiveSessionError extends Error {
  constructor(message, { code = 'live-error', fallbackRecommended = false, cause } = {}) {
    super(message);
    this.name = 'LiveSessionError';
    this.code = code;
    this.fallbackRecommended = !!fallbackRecommended;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Return browser capabilities without requesting permissions or creating devices. */
export function getLiveSupport() {
  const mediaDevices = typeof navigator !== 'undefined' && navigator.mediaDevices;
  return {
    supported:
      typeof WebSocket !== 'undefined' &&
      !!getAudioContextConstructor() &&
      !!(mediaDevices && typeof mediaDevices.getUserMedia === 'function'),
    webSocket: typeof WebSocket !== 'undefined',
    audioContext: !!getAudioContextConstructor(),
    microphone: !!(mediaDevices && typeof mediaDevices.getUserMedia === 'function'),
  };
}

/**
 * Stateful browser client for Gemini Live's v1beta BidiGenerateContent API.
 * One instance represents one WebSocket session. It may be started and stopped
 * once; create a new instance when falling back or starting another call.
 */
export class GeminiLiveSession {
  constructor(options = {}) {
    this.apiKey = String(options.apiKey || '').trim();
    this.accessToken = String(options.accessToken || '').trim();
    this.model = String(options.model || '').trim();
    this.systemInstruction = options.systemInstruction || '';
    this.generationConfig = isObject(options.generationConfig) ? options.generationConfig : {};
    this.speechConfig = isObject(options.speechConfig) ? options.speechConfig : null;
    this.realtimeInputConfig = isObject(options.realtimeInputConfig)
      ? options.realtimeInputConfig
      : {};
    this.inputAudioTranscription = options.inputAudioTranscription !== false;
    this.outputAudioTranscription = options.outputAudioTranscription !== false;
    this.sessionResumption = isObject(options.sessionResumption)
      ? options.sessionResumption
      : null;
    this.contextWindowCompression = isObject(options.contextWindowCompression)
      ? options.contextWindowCompression
      : null;
    this.callbacks = isObject(options.callbacks) ? options.callbacks : {};
    this.setupTimeoutMs = Number(options.setupTimeoutMs) > 0
      ? Number(options.setupTimeoutMs)
      : DEFAULT_SETUP_TIMEOUT_MS;
    this.transcriptSettleMs = Number(options.transcriptSettleMs) >= 0
      ? Number(options.transcriptSettleMs)
      : DEFAULT_TRANSCRIPT_SETTLE_MS;
    this.processorBufferSize = Number(options.processorBufferSize) || DEFAULT_PROCESSOR_BUFFER_SIZE;
    this.maxBufferedAmount = Number(options.maxBufferedAmount) >= 0
      ? Number(options.maxBufferedAmount)
      : DEFAULT_MAX_BUFFERED_AMOUNT;
    this.playAudio = options.playAudio !== false;
    this.localBargeIn = options.localBargeIn !== false;
    this.bargeInThreshold = Number(options.bargeInThreshold) > 0
      ? Number(options.bargeInThreshold)
      : 0.035;
    this.bargeInFrames = Math.max(1, Number(options.bargeInFrames) || 2);
    this.microphoneConstraints = options.microphoneConstraints || {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    this._usesDefaultWebSocketFactory = typeof options.webSocketFactory !== 'function';
    this.webSocketFactory = this._usesDefaultWebSocketFactory
      ? (url) => new WebSocket(url)
      : options.webSocketFactory;

    this.state = 'idle';
    this.socket = null;
    this.stream = null;
    this.inputContext = null;
    this.inputSource = null;
    this.processor = null;
    this.silentGain = null;
    this.resampler = null;
    this.outputContext = null;
    this.playbackSources = new Set();
    this.nextPlaybackTime = 0;
    this.micActive = false;
    this.setupComplete = false;

    this._connectPromise = null;
    this._startPromise = null;
    this._micStartPromise = null;
    this._micStopPromise = null;
    this._stopPromise = null;
    this._failurePromise = null;
    this._resolveConnect = null;
    this._rejectConnect = null;
    this._setupTimer = null;
    this._goAwayTimer = null;
    this._transcriptTimer = null;
    this._messageQueue = Promise.resolve();
    this._epoch = 0;
    this._expectedClose = false;
    this._fatalError = null;
    this._failureEmitted = false;
    this._closeEmitted = false;
    this._highRmsFrames = 0;
    this._lowRmsFrames = 0;
    this._localSpeechActive = false;
    this._manualActivityActive = false;
    this._manualActivitySource = '';
    this._audioInputSent = false;
    this._suppressOutput = false;
    this._awaitingServerInterruption = false;
    this._modelResponseActive = false;
    this._automaticActivityDetectionEnabled = true;
    this._resumptionHandle = '';
    this._goAwayError = null;
    this._transcriptSequence = 0;
    this._turnCompleteCount = 0;
    this._lastTurnCompleteSequence = 0;
    this._lastSettledSequence = -1;
    this._lastSettledTurnCompleteCount = -1;
    this._transcriptFragments = { input: [], output: [] };
  }

  get ready() {
    return (
      this.state === 'ready' &&
      this.setupComplete &&
      this.socket?.readyState === SOCKET_OPEN
    );
  }

  get microphoneActive() {
    return this.micActive;
  }

  get resumptionHandle() {
    return this._resumptionHandle;
  }

  /** Clone the transcript accumulator so consumers can safely persist it. */
  getTranscriptSnapshot() {
    const clone = (fragment) => ({ ...fragment });
    const input = this._transcriptFragments.input.map(clone);
    const output = this._transcriptFragments.output.map(clone);
    return {
      sequence: this._transcriptSequence,
      turnCompleteCount: this._turnCompleteCount,
      inputText: input.map((fragment) => fragment.text).join(''),
      outputText: output.map((fragment) => fragment.text).join(''),
      fragments: { input, output },
    };
  }

  resetTranscriptBuffer() {
    this._clearTranscriptTimer();
    this._turnCompleteCount = 0;
    this._lastTurnCompleteSequence = this._transcriptSequence;
    this._lastSettledSequence = this._transcriptSequence;
    this._lastSettledTurnCompleteCount = 0;
    this._transcriptFragments = { input: [], output: [] };
  }

  /** A setup-ready sessionResumption value for a replacement connection. */
  getResumeConfig() {
    return this._resumptionHandle ? { handle: this._resumptionHandle } : null;
  }

  /** Connect and resolve only after the server acknowledges setupComplete. */
  connect() {
    if (this.ready) return Promise.resolve(this);
    if (
      this._connectPromise &&
      (this.state === 'connecting' || this.state === 'setting-up')
    ) {
      return this._connectPromise;
    }
    if (this.state !== 'idle') {
      return Promise.reject(
        new LiveSessionError('Phiên Gemini Live này không thể kết nối lại; hãy tạo phiên mới.', {
          code: 'session-not-reusable',
          fallbackRecommended: true,
        })
      );
    }

    try {
      this._validateConnectionOptions();
    } catch (error) {
      const liveError = this._asLiveError(error, 'invalid-options', true);
      this._connectPromise = this._abortWithFailure(liveError, 'connect').then(() => {
        throw liveError;
      });
      return this._connectPromise;
    }

    const epoch = ++this._epoch;
    this._connectPromise = new Promise((resolve, reject) => {
      this._resolveConnect = resolve;
      this._rejectConnect = reject;
    });
    this._setState('connecting');
    if (this.state !== 'connecting' || epoch !== this._epoch) return this._connectPromise;

    let socket;
    try {
      socket = this.webSocketFactory(this._buildUrl());
      this.socket = socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => this._handleSocketOpen(socket, epoch);
      socket.onmessage = (event) => this._enqueueMessage(event.data, socket, epoch);
      socket.onerror = (event) => this._handleSocketError(event, socket, epoch);
      socket.onclose = (event) => this._handleSocketClose(event, socket, epoch);
      // Cover both the WebSocket CONNECTING phase and the setup handshake.
      this._setupTimer = setTimeout(() => {
        if (!this._isEpochActive(epoch, socket) || this.setupComplete) return;
        void this._abortWithFailure(
          new LiveSessionError('Gemini Live setupComplete timed out.', {
            code: 'setup-timeout',
            fallbackRecommended: true,
          }),
          'setup'
        );
      }, this.setupTimeoutMs);
    } catch (error) {
      void this._abortWithFailure(
        this._asLiveError(error, 'websocket-create-failed', true),
        'connect'
      );
    }

    return this._connectPromise;
  }

  /** Connect, unlock audio playback, wait for setupComplete, and start always-on mic input. */
  start() {
    if (this._startPromise) return this._startPromise;
    const deferred = createDeferred();
    const operation = deferred.promise;
    this._startPromise = operation;
    Promise.resolve(this._startInternal()).then(deferred.resolve, deferred.reject);
    operation.then(
      () => {
        if (this._startPromise === operation) this._startPromise = null;
      },
      () => {
        if (this._startPromise === operation) this._startPromise = null;
      }
    );
    return operation;
  }

  async _startInternal() {
    try {
      if (this.state === 'closing' || this.state === 'closed' || this.state === 'failed') {
        throw new LiveSessionError('This Gemini Live session cannot be restarted.', {
          code: 'session-not-reusable',
          fallbackRecommended: false,
        });
      }
      await this._ensureOutputContext();
      await this.connect();
      await this.startMicrophone();
      if (!this.ready) {
        throw new LiveSessionError('Gemini Live stopped while starting the microphone.', {
          code: 'session-stopped',
          fallbackRecommended: false,
        });
      }
      return this;
    } catch (error) {
      const liveError = this._asLiveError(error, 'live-start-failed', true);
      if (
        this._expectedClose ||
        this.state === 'closing' ||
        this.state === 'closed' ||
        liveError.code === 'session-stopped'
      ) {
        throw liveError;
      }
      await this._abortWithFailure(liveError, 'start');
      throw this._fatalError || liveError;
    }
  }

  /** Start microphone capture after setupComplete and stream PCM16 LE at 16 kHz. */
  startMicrophone() {
    if (this.micActive) return Promise.resolve();
    if (this._micStartPromise) return this._micStartPromise;
    const deferred = createDeferred();
    const operation = deferred.promise;
    this._micStartPromise = operation;
    const internalOperation = (async () => {
      if (this._micStopPromise) await this._micStopPromise;
      await this._startMicrophoneInternal();
      if (!this.micActive || !this.ready) {
        throw new LiveSessionError('Microphone start was cancelled.', {
          code: 'session-stopped',
          fallbackRecommended: false,
        });
      }
    })();
    internalOperation.then(deferred.resolve, deferred.reject);
    operation.then(
      () => {
        if (this._micStartPromise === operation) this._micStartPromise = null;
      },
      () => {
        if (this._micStartPromise === operation) this._micStartPromise = null;
      }
    );
    return operation;
  }

  async _startMicrophoneInternal() {
    if (!this.ready) {
      throw new LiveSessionError('Gemini Live chưa setup xong nên chưa thể mở microphone.', {
        code: 'session-not-ready',
        fallbackRecommended: true,
      });
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new LiveSessionError('Trình duyệt không hỗ trợ truy cập microphone.', {
        code: 'microphone-unsupported',
        fallbackRecommended: true,
      });
    }

    let stream;
    let context;
    const epoch = this._epoch;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: this.microphoneConstraints });
      if (!this.ready || epoch !== this._epoch) {
        stopMediaStreamTracks(stream);
        throw new LiveSessionError('Phiên Live đã đóng trong lúc xin quyền microphone.', {
          code: 'session-closed-during-mic-permission',
          fallbackRecommended: true,
        });
      }

      const AudioContextCtor = getAudioContextConstructor();
      if (!AudioContextCtor) {
        throw new LiveSessionError('Trình duyệt không hỗ trợ Web Audio.', {
          code: 'audio-context-unsupported',
          fallbackRecommended: true,
        });
      }

      context = new AudioContextCtor();
      if (context.state === 'suspended') await context.resume();
      if (!this.ready || epoch !== this._epoch) {
        throw new LiveSessionError('Gemini Live closed while creating microphone input.', {
          code: 'session-closed-during-mic-permission',
          fallbackRecommended: false,
        });
      }
      if (typeof context.createScriptProcessor !== 'function') {
        throw new LiveSessionError('Trình duyệt không có bộ xử lý âm thanh realtime.', {
          code: 'audio-processor-unsupported',
          fallbackRecommended: true,
        });
      }

      this.stream = stream;
      this.inputContext = context;
      this.inputSource = context.createMediaStreamSource(stream);
      this.processor = context.createScriptProcessor(this.processorBufferSize, 1, 1);
      this.silentGain = context.createGain();
      this.silentGain.gain.value = 0;
      this.resampler = new StreamingResampler(context.sampleRate, LIVE_INPUT_SAMPLE_RATE);
      this.processor.onaudioprocess = (event) => this._handleMicrophoneFrame(event);
      this.inputSource.connect(this.processor);
      this.processor.connect(this.silentGain);
      this.silentGain.connect(context.destination);
      this.micActive = true;
      this._suppressOutput = this._awaitingServerInterruption;
      this._emit('onMicrophoneState', { active: true, sampleRate: context.sampleRate });
    } catch (error) {
      if (stream && stream !== this.stream) stopMediaStreamTracks(stream);
      if (context && context !== this.inputContext && context.state !== 'closed') {
        try {
          await context.close();
        } catch (closeError) {
          // Best-effort cleanup for a partially initialized microphone graph.
        }
      }
      await this._stopMicrophoneNodes();
      throw this._asLiveError(error, 'microphone-start-failed', true);
    }
  }

  /** Stop mic capture; end automatic-AAD audio or the active manual-AAD activity. */
  stopMicrophone(options = {}) {
    if (this._micStopPromise) return this._micStopPromise;
    const pendingStart = this._micStartPromise;
    const deferred = createDeferred();
    const operation = deferred.promise;
    this._micStopPromise = operation;
    const internalOperation = (async () => {
      if (pendingStart) {
        try {
          await pendingStart;
        } catch (error) {
          // A cancelled permission/start operation still needs final cleanup.
        }
      }
      await this._stopMicrophoneInternal(options);
    })();
    internalOperation.then(deferred.resolve, deferred.reject);
    operation.then(
      () => {
        if (this._micStopPromise === operation) this._micStopPromise = null;
      },
      () => {
        if (this._micStopPromise === operation) this._micStopPromise = null;
      }
    );
    return operation;
  }

  async _stopMicrophoneInternal({ sendAudioStreamEnd = true } = {}) {
    const wasActive = this.micActive;
    const hasInputToEnd = wasActive || this._audioInputSent || this._manualActivityActive;
    if (sendAudioStreamEnd && hasInputToEnd && this.setupComplete && this._transportCanSend()) {
      try {
        if (this._automaticActivityDetectionEnabled && (wasActive || this._audioInputSent)) {
          this._send(
            { realtimeInput: { audioStreamEnd: true } },
            { allowClosing: true }
          );
          this._audioInputSent = false;
        } else if (!this._automaticActivityDetectionEnabled && this._manualActivityActive) {
          this._sendManualActivityEnd(this._manualActivitySource || 'external', {
            allowClosing: true,
            reason: 'microphone-stop',
          });
          this._localSpeechActive = false;
        }
      } catch (error) {
        this._emitRecoverableError(this._asLiveError(error, 'audio-stream-end-failed', false));
      }
    }
    await this._stopMicrophoneNodes();
  }

  /** Begin a manually detected activity before external PCM is sent. */
  sendActivityStart() {
    return this._sendManualActivityStart('external');
  }

  /** End a manually detected activity after external PCM has been sent. */
  sendActivityEnd() {
    return this._sendManualActivityEnd('external');
  }

  /** Send already encoded raw PCM16 little-endian bytes at 16 kHz. */
  sendPcm16(data) {
    if (!this.ready) {
      throw new LiveSessionError('Không thể gửi audio khi phiên Live chưa sẵn sàng.', {
        code: 'session-not-ready',
        fallbackRecommended: true,
      });
    }
    if (!this._automaticActivityDetectionEnabled && !this._manualActivityActive) {
      throw new LiveSessionError(
        'Call sendActivityStart() before external PCM when automatic activity detection is disabled.',
        {
          code: 'manual-activity-not-started',
          fallbackRecommended: false,
        }
      );
    }
    const bytes = data instanceof Uint8Array
      ? data
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : null;
    if (!bytes || bytes.byteLength === 0) return false;
    if (this.socket.bufferedAmount > this.maxBufferedAmount) {
      this._emit('onAudioDrop', {
        reason: 'backpressure',
        bufferedAmount: this.socket.bufferedAmount,
        byteLength: bytes.byteLength,
      });
      return false;
    }
    this._send({
      realtimeInput: {
        audio: {
          data: bytesToBase64(bytes),
          mimeType: `audio/pcm;rate=${LIVE_INPUT_SAMPLE_RATE}`,
        },
      },
    });
    this._audioInputSent = true;
    return true;
  }

  /** Send realtime text into the same session. */
  sendText(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    this._send({ realtimeInput: { text: value } });
    return true;
  }

  /** Send explicit conversation content, useful for priming history after setup. */
  sendClientContent(turns, { turnComplete = true } = {}) {
    const list = Array.isArray(turns) ? turns : [turns];
    this._send({
      clientContent: {
        turns: list.filter(Boolean),
        turnComplete: !!turnComplete,
      },
    });
  }

  sendToolResponse(functionResponses) {
    this._send({
      toolResponse: {
        functionResponses: Array.isArray(functionResponses) ? functionResponses : [],
      },
    });
  }

  /** Immediately stop and discard queued model audio. */
  clearPlayback(reason = 'manual') {
    const hadPlayback = this.playbackSources.size > 0;
    for (const source of this.playbackSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch (error) {
        // A source may already have ended; teardown must remain idempotent.
      }
    }
    this.playbackSources.clear();
    this.nextPlaybackTime = this.outputContext?.currentTime || 0;
    if (hadPlayback) this._emit('onPlaybackState', { playing: false, reason });
    return hadPlayback;
  }

  /** Idempotent teardown: end audio input, stop tracks/playback, close contexts/socket. */
  stop(options = {}) {
    if (this._stopPromise) return this._stopPromise;
    if (this._failurePromise && this.state === 'failed') return this._failurePromise;
    const deferred = createDeferred();
    const operation = deferred.promise;
    this._stopPromise = operation;
    Promise.resolve(this._stopInternal(options)).then(deferred.resolve, deferred.reject);
    return operation;
  }

  async _stopInternal({ reason = 'client-stop', preserveFailure = false } = {}) {
    if (this.state === 'closed' || (this.state === 'failed' && this._failureEmitted)) return;
    this._expectedClose = !preserveFailure;
    if (!preserveFailure) this._setState('closing', { reason });
    this._epoch += 1;
    this._clearSetupTimer();
    this._clearGoAwayTimer();
    this._clearTranscriptTimer();
    if (this._rejectConnect) {
      this._settleConnectError(
        new LiveSessionError('Phiên Gemini Live đã được dừng trước khi setup hoàn tất.', {
          code: 'session-stopped',
          fallbackRecommended: false,
        })
      );
    }

    await this.stopMicrophone({ sendAudioStreamEnd: true });
    this.clearPlayback(reason);
    await this._closeOutputContext();

    const socket = this.socket;
    this.socket = null;
    this.setupComplete = false;
    this._detachSocket(socket);
    if (socket && (socket.readyState === SOCKET_OPEN || socket.readyState === SOCKET_CONNECTING)) {
      try {
        socket.close(1000, 'client-stop');
      } catch (error) {
        // Local resources are already closed; WebSocket close is best effort.
      }
    }
    this._suppressOutput = false;
    this._awaitingServerInterruption = false;
    this._modelResponseActive = false;
    this._manualActivityActive = false;
    this._manualActivitySource = '';
    this._audioInputSent = false;
    this._emitTranscriptSettled('session-stop');
    this._finaliseClosed({ code: 1000, reason: String(reason), wasClean: true });
  }

  destroy(options) {
    return this.stop(options);
  }

  _validateConnectionOptions() {
    this.model = normaliseModel(this.model);
    if (!this.apiKey && !this.accessToken) {
      throw new LiveSessionError('Thiếu API key hoặc ephemeral access token cho Gemini Live.', {
        code: 'missing-credential',
        fallbackRecommended: true,
      });
    }
    if (this._usesDefaultWebSocketFactory && typeof WebSocket === 'undefined') {
      throw new LiveSessionError('Trình duyệt không hỗ trợ WebSocket.', {
        code: 'websocket-unsupported',
        fallbackRecommended: true,
      });
    }
  }

  _buildUrl() {
    if (this.accessToken) {
      return `${LIVE_CONSTRAINED_ENDPOINT}?access_token=${encodeURIComponent(this.accessToken)}`;
    }
    return `${LIVE_ENDPOINT}?key=${encodeURIComponent(this.apiKey)}`;
  }

  _buildSetupMessage() {
    const generationConfig = {
      ...this.generationConfig,
      responseModalities: ['AUDIO'],
    };
    if (this.speechConfig) generationConfig.speechConfig = this.speechConfig;

    const automaticActivityDetection = {
      disabled: false,
      ...(isObject(this.realtimeInputConfig.automaticActivityDetection)
        ? this.realtimeInputConfig.automaticActivityDetection
        : {}),
    };
    this._automaticActivityDetectionEnabled = automaticActivityDetection.disabled !== true;
    const realtimeInputConfig = {
      activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
      ...this.realtimeInputConfig,
      automaticActivityDetection,
    };

    const setup = {
      model: this.model,
      generationConfig,
      realtimeInputConfig,
    };
    if (this.systemInstruction) {
      setup.systemInstruction = isObject(this.systemInstruction)
        ? this.systemInstruction
        : { parts: [{ text: String(this.systemInstruction) }] };
    }
    if (this.inputAudioTranscription) setup.inputAudioTranscription = {};
    if (this.outputAudioTranscription) setup.outputAudioTranscription = {};
    if (this.sessionResumption) setup.sessionResumption = this.sessionResumption;
    if (this.contextWindowCompression) {
      setup.contextWindowCompression = this.contextWindowCompression;
    }
    return { setup };
  }

  _handleSocketOpen(socket, epoch) {
    if (!this._isEpochActive(epoch, socket) || this.state !== 'connecting') return;
    this._clearSetupTimer();
    this._setState('setting-up');
    if (!this._isEpochActive(epoch, socket) || this.state !== 'setting-up') return;
    this._emit('onOpen', {});
    if (!this._isEpochActive(epoch, socket) || this.state !== 'setting-up') return;
    try {
      // Protocol invariant: setup must be the first and only first message.
      socket.send(JSON.stringify(this._buildSetupMessage()));
      this._setupTimer = setTimeout(() => {
        if (!this._isEpochActive(epoch, socket) || this.setupComplete) return;
        void this._abortWithFailure(
          new LiveSessionError('Gemini Live không phản hồi setupComplete đúng hạn.', {
            code: 'setup-timeout',
            fallbackRecommended: true,
          }),
          'setup'
        );
      }, this.setupTimeoutMs);
    } catch (error) {
      void this._abortWithFailure(
        this._asLiveError(error, 'setup-send-failed', true),
        'setup'
      );
    }
  }

  _enqueueMessage(data, socket, epoch) {
    if (!this._isEpochActive(epoch, socket)) return;
    this._messageQueue = this._messageQueue
      .then(async () => {
        if (!this._isEpochActive(epoch, socket)) return;
        const text = await decodeSocketData(data);
        if (!this._isEpochActive(epoch, socket)) return;
        const message = JSON.parse(text);
        await this._handleServerMessage(message, epoch, socket);
      })
      .catch((error) => {
        if (!this._isEpochActive(epoch, socket)) return;
        void this._abortWithFailure(
          this._asLiveError(error, 'invalid-server-message', true),
          'receive'
        );
      });
  }

  async _handleServerMessage(message, epoch, socket) {
    if (!this._isEpochActive(epoch, socket)) return;
    if (!isObject(message)) {
      throw new LiveSessionError('Gemini Live trả về message không hợp lệ.', {
        code: 'invalid-server-message',
        fallbackRecommended: true,
      });
    }
    this._emit('onMessage', message);
    if (message.usageMetadata) this._emit('onUsageMetadata', message.usageMetadata);
    if (!this._isEpochActive(epoch, socket)) return;

    if (message.error) {
      throw new LiveSessionError(message.error.message || 'Gemini Live báo lỗi.', {
        code: 'server-error',
        fallbackRecommended: true,
      });
    }

    if (Object.prototype.hasOwnProperty.call(message, 'setupComplete')) {
      if (this.setupComplete) return;
      if (this.state !== 'setting-up' || !this._isEpochActive(epoch, socket)) return;
      this.setupComplete = true;
      this._clearSetupTimer();
      this._setState('ready');
      if (!this._isEpochActive(epoch, socket) || this.state !== 'ready') return;
      this._settleConnectSuccess();
      this._emit('onSetupComplete', message.setupComplete || {});
      return;
    }

    if (!this.setupComplete) {
      throw new LiveSessionError('Gemini Live gửi dữ liệu trước setupComplete.', {
        code: 'protocol-before-setup-complete',
        fallbackRecommended: true,
      });
    }

    if (message.serverContent) {
      await this._handleServerContent(message.serverContent, epoch, socket);
      if (!this._isEpochActive(epoch, socket)) return;
    }
    if (message.toolCall) this._emit('onToolCall', message.toolCall);
    if (!this._isEpochActive(epoch, socket)) return;
    if (message.toolCallCancellation) {
      this._emit('onToolCallCancellation', message.toolCallCancellation);
    }
    if (!this._isEpochActive(epoch, socket)) return;
    if (message.sessionResumptionUpdate) {
      const update = message.sessionResumptionUpdate;
      const handle = update.newHandle || update.new_handle;
      if (update.resumable === false) this._resumptionHandle = '';
      else if (handle) this._resumptionHandle = String(handle);
      this._emit('onSessionResumptionUpdate', message.sessionResumptionUpdate);
    }
    if (!this._isEpochActive(epoch, socket)) return;
    if (message.goAway) {
      this._emit('onGoAway', message.goAway);
      if (!this._isEpochActive(epoch, socket)) return;
      const error = new LiveSessionError('Gemini Live sẽ đóng phiên hiện tại.', {
        code: 'server-go-away',
        fallbackRecommended: true,
      });
      this._goAwayError = error;
      const timeLeft = message.goAway.timeLeft ?? message.goAway.time_left;
      const timeLeftMs = durationToMilliseconds(timeLeft);
      this._emit('onReconnectNeeded', {
        error,
        timeLeft,
        timeLeftMs,
        resumptionHandle: this._resumptionHandle,
        sessionResumption: this.getResumeConfig(),
      });
      if (!this._isEpochActive(epoch, socket)) return;
      this._clearGoAwayTimer();
      if (timeLeftMs !== null) {
        this._goAwayTimer = setTimeout(() => {
          this._goAwayTimer = null;
          if (!this.ready) return;
          void this._abortWithFailure(error, 'go-away');
        }, Math.max(0, timeLeftMs - 250));
      }
    }
  }

  async _handleServerContent(content, epoch, socket) {
    if (!this._isEpochActive(epoch, socket)) return;
    if (content.inputTranscription?.text) {
      this._recordTranscript('input', content.inputTranscription.text, content.inputTranscription);
    }
    if (content.outputTranscription?.text) {
      this._recordTranscript(
        'output',
        content.outputTranscription.text,
        content.outputTranscription
      );
    }
    if (!this._isEpochActive(epoch, socket)) return;

    const parts = Array.isArray(content.modelTurn?.parts) ? content.modelTurn.parts : [];
    if (parts.length) this._modelResponseActive = true;
    for (const part of parts) {
      if (!this._isEpochActive(epoch, socket)) return;
      if (typeof part.text === 'string') this._emit('onText', { text: part.text, raw: part });
      if (!this._isEpochActive(epoch, socket)) return;
      const inlineData = part.inlineData || part.inline_data;
      if (!inlineData?.data) continue;
      const mimeType = inlineData.mimeType || inlineData.mime_type || 'audio/pcm;rate=24000';
      if (/^audio\/pcm/i.test(mimeType)) {
        await this._handleOutputAudio(inlineData.data, mimeType, epoch, socket);
      } else {
        this._emit('onInlineData', { data: inlineData.data, mimeType, raw: part });
      }
      if (!this._isEpochActive(epoch, socket)) return;
    }

    if (!this._isEpochActive(epoch, socket)) return;
    if (content.interrupted) {
      this.clearPlayback('server-interrupted');
      this._modelResponseActive = false;
      this._awaitingServerInterruption = false;
      this._suppressOutput = this._localSpeechActive;
      this._emit('onInterruption', { source: 'server', raw: content });
    }
    if (!this._isEpochActive(epoch, socket)) return;
    if (content.generationComplete) {
      this._modelResponseActive = false;
      this._awaitingServerInterruption = false;
      this._suppressOutput = this._localSpeechActive;
      this._emit('onGenerationComplete', content);
    }
    if (!this._isEpochActive(epoch, socket)) return;
    if (content.turnComplete) {
      this._modelResponseActive = false;
      this._awaitingServerInterruption = false;
      this._suppressOutput = this._localSpeechActive;
      this._turnCompleteCount += 1;
      this._lastTurnCompleteSequence = this._transcriptSequence;
      const transcriptSnapshot = this.getTranscriptSnapshot();
      this._emit('onTurnComplete', {
        ...content,
        raw: content,
        transcriptSnapshot,
        transcriptionMayFollow: true,
      });
      this._scheduleTranscriptSettled('turn-complete');
    }
  }

  async _handleOutputAudio(base64, mimeType, epoch, socket) {
    if (!this._isEpochActive(epoch, socket)) return;
    const bytes = base64ToBytes(base64);
    const sampleRate = sampleRateFromMimeType(mimeType, LIVE_OUTPUT_SAMPLE_RATE);
    if (this._suppressOutput) {
      this._emit('onAudioSuppressed', {
        pcm16: bytes,
        sampleRate,
        mimeType,
        reason: this._localSpeechActive
          ? 'local-speech'
          : 'awaiting-server-interruption',
      });
      return;
    }
    this._emit('onAudio', { pcm16: bytes, sampleRate, mimeType });
    if (!this._isEpochActive(epoch, socket)) return;
    if (!this.playAudio || bytes.byteLength === 0) return;

    let source = null;
    try {
      const context = await this._ensureOutputContext();
      if (!this._isEpochActive(epoch, socket) || this._suppressOutput) return;
      const samples = pcm16BytesToFloat32(bytes);
      if (!samples.length) return;
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const wasIdle = this.playbackSources.size === 0;
      const startAt = Math.max(context.currentTime, this.nextPlaybackTime);
      this.nextPlaybackTime = startAt + buffer.duration;
      this.playbackSources.add(source);
      source.onended = () => {
        this.playbackSources.delete(source);
        try {
          source.disconnect();
        } catch (error) {
          // Already disconnected.
        }
        if (this.playbackSources.size === 0) {
          this.nextPlaybackTime = context.currentTime;
          this._emit('onPlaybackState', { playing: false, reason: 'queue-empty' });
        }
      };
      source.start(startAt);
      if (wasIdle) this._emit('onPlaybackState', { playing: true });
    } catch (error) {
      if (source) {
        this.playbackSources.delete(source);
        try {
          source.disconnect();
        } catch (disconnectError) {
          // A partially initialized source may not have connected.
        }
      }
      if (!this._isEpochActive(epoch, socket) || this._suppressOutput) return;
      this._emitRecoverableError(this._asLiveError(error, 'audio-playback-failed', false));
    }
  }

  _handleMicrophoneFrame(event) {
    if (!this.micActive || !this.ready) return;
    try {
      const input = event.inputBuffer.getChannelData(0);
      const shouldSendAudio = this._handleLocalActivity(input);
      if (!this.micActive || !this.ready) return;
      const resampled = this.resampler.process(input);
      if (shouldSendAudio && resampled.length) {
        this.sendPcm16(float32ToPcm16Bytes(resampled));
      }
    } catch (error) {
      if (this._expectedClose || this.state === 'closing' || this.state === 'closed') return;
      void this._abortWithFailure(
        this._asLiveError(error, 'microphone-stream-failed', true),
        'microphone'
      );
    }
  }

  _sendManualActivityStart(source) {
    if (this._automaticActivityDetectionEnabled) {
      throw new LiveSessionError(
        'Explicit activity signals require automaticActivityDetection.disabled=true.',
        {
          code: 'manual-activity-not-enabled',
          fallbackRecommended: false,
        }
      );
    }
    if (this._manualActivityActive) return false;
    this._send({ realtimeInput: { activityStart: {} } });
    this._manualActivityActive = true;
    this._manualActivitySource = source;
    this._emit('onActivityStart', { source });
    return true;
  }

  _sendManualActivityEnd(source, { allowClosing = false, reason } = {}) {
    if (this._automaticActivityDetectionEnabled) {
      throw new LiveSessionError(
        'Explicit activity signals require automaticActivityDetection.disabled=true.',
        {
          code: 'manual-activity-not-enabled',
          fallbackRecommended: false,
        }
      );
    }
    if (!this._manualActivityActive) return false;
    const activitySource = this._manualActivitySource || source;
    this._send(
      { realtimeInput: { activityEnd: {} } },
      { allowClosing }
    );
    this._manualActivityActive = false;
    this._manualActivitySource = '';
    this._audioInputSent = false;
    this._emit('onActivityEnd', {
      source: activitySource,
      ...(reason ? { reason } : {}),
    });
    return true;
  }

  _handleLocalActivity(samples) {
    if (!this.localBargeIn && this._automaticActivityDetectionEnabled) return true;
    const active = audioRms(samples) >= this.bargeInThreshold;
    if (active) {
      this._highRmsFrames += 1;
      this._lowRmsFrames = 0;
      const startFrames = this._automaticActivityDetectionEnabled ? this.bargeInFrames : 1;
      if (!this._localSpeechActive && this._highRmsFrames >= startFrames) {
        this._localSpeechActive = true;
        if (!this._automaticActivityDetectionEnabled) {
          this._sendManualActivityStart('local-vad');
        } else {
          this._emit('onActivityStart', { source: 'local-vad' });
        }
        if (this.localBargeIn) {
          this._suppressOutput = true;
          const interruptedPlayback = this.clearPlayback('local-barge-in');
          this._awaitingServerInterruption =
            this._awaitingServerInterruption ||
            interruptedPlayback ||
            this._modelResponseActive;
          if (interruptedPlayback) {
            this._emit('onInterruption', { source: 'local-vad' });
          }
        }
      }
    } else {
      this._highRmsFrames = 0;
      this._lowRmsFrames += 1;
      if (this._localSpeechActive && this._lowRmsFrames >= this.bargeInFrames * 2) {
        if (!this._automaticActivityDetectionEnabled) {
          this._sendManualActivityEnd('local-vad');
        } else {
          this._emit('onActivityEnd', { source: 'local-vad' });
        }
        this._localSpeechActive = false;
        if (!this._awaitingServerInterruption) this._suppressOutput = false;
      }
    }
    // With manual activity detection, audio must be bracketed by explicit
    // activityStart/activityEnd messages. Automatic AAD receives all frames.
    return this._automaticActivityDetectionEnabled || this._localSpeechActive;
  }

  async _ensureOutputContext() {
    if (!this.playAudio) return null;
    if (!this.outputContext || this.outputContext.state === 'closed') {
      const AudioContextCtor = getAudioContextConstructor();
      if (!AudioContextCtor) {
        throw new LiveSessionError('Trình duyệt không hỗ trợ phát âm thanh realtime.', {
          code: 'audio-context-unsupported',
          fallbackRecommended: true,
        });
      }
      this.outputContext = new AudioContextCtor();
      this.nextPlaybackTime = this.outputContext.currentTime;
    }
    if (this.outputContext.state === 'suspended') await this.outputContext.resume();
    return this.outputContext;
  }

  async _stopMicrophoneNodes() {
    const stream = this.stream;
    const context = this.inputContext;
    const source = this.inputSource;
    const processor = this.processor;
    const gain = this.silentGain;
    const wasActive = this.micActive || !!stream || !!processor;

    // Detach instance state before awaiting, so a newer graph cannot be nulled
    // by completion of this teardown.
    this.micActive = false;
    this.stream = null;
    this.inputContext = null;
    this.inputSource = null;
    this.processor = null;
    this.silentGain = null;
    this.resampler = null;
    this._highRmsFrames = 0;
    this._lowRmsFrames = 0;
    this._localSpeechActive = false;
    this._suppressOutput = this._awaitingServerInterruption;

    if (processor) processor.onaudioprocess = null;
    for (const node of [source, processor, gain]) {
      try {
        node?.disconnect();
      } catch (error) {
        // Teardown is intentionally idempotent.
      }
    }
    stopMediaStreamTracks(stream);
    if (context && context.state !== 'closed') {
      try {
        await context.close();
      } catch (error) {
        // Browser may already be closing the audio context.
      }
    }
    if (wasActive) this._emit('onMicrophoneState', { active: false });
  }

  async _closeOutputContext() {
    const context = this.outputContext;
    this.outputContext = null;
    this.nextPlaybackTime = 0;
    if (context && context.state !== 'closed') {
      try {
        await context.close();
      } catch (error) {
        // Browser may already be closing the audio context.
      }
    }
  }

  _transportCanSend() {
    return !!this.socket && this.socket.readyState === SOCKET_OPEN;
  }

  _send(payload, { allowClosing = false } = {}) {
    const stateAllowsSend = this.ready || (allowClosing && this.setupComplete);
    if (!stateAllowsSend || !this._transportCanSend()) {
      throw new LiveSessionError('Kết nối Gemini Live chưa sẵn sàng.', {
        code: 'session-not-ready',
        fallbackRecommended: true,
      });
    }
    this.socket.send(JSON.stringify(payload));
  }

  _handleSocketError(event, socket, epoch) {
    if (!this._isEpochActive(epoch, socket) || this._expectedClose) return;
    void this._abortWithFailure(
      new LiveSessionError('Lỗi kết nối WebSocket Gemini Live.', {
        code: 'websocket-error',
        fallbackRecommended: true,
        cause: event,
      }),
      'transport'
    );
  }

  _handleSocketClose(event, socket, epoch) {
    if (epoch !== this._epoch || socket !== this.socket) return;
    if (this._expectedClose) {
      void this._finishExpectedSocketClose(event, socket);
      return;
    }
    const error = this._goAwayError || new LiveSessionError(
      `Gemini Live WebSocket closed${event.reason ? `: ${event.reason}` : '.'}`,
      {
        code: 'websocket-closed',
        fallbackRecommended: true,
      }
    );
    void this._abortWithFailure(error, 'transport', {
      closeEvent: event,
      socketAlreadyClosed: true,
    });
  }

  async _finishExpectedSocketClose(event, socket) {
    if (socket !== this.socket) return;
    this._epoch += 1;
    this.socket = null;
    this.setupComplete = false;
    this._detachSocket(socket);
    this._clearSetupTimer();
    this._clearGoAwayTimer();
    this._clearTranscriptTimer();
    await this._cleanupMediaAfterClose();
    this._emitTranscriptSettled('socket-close');
    this._finaliseClosed(event);
  }

  async _cleanupMediaAfterClose() {
    await this._stopMicrophoneNodes();
    this._manualActivityActive = false;
    this._manualActivitySource = '';
    this._audioInputSent = false;
    this.clearPlayback('socket-closed');
    await this._closeOutputContext();
  }

  _abortWithFailure(error, phase, options = {}) {
    if (this._failurePromise) return this._failurePromise;

    const liveError = this._asLiveError(error, 'live-failure', true);
    if (!this._fatalError) this._fatalError = liveError;
    const fatalError = this._fatalError;
    let resolveFailure;
    const failurePromise = new Promise((resolve) => {
      resolveFailure = resolve;
    });
    // Publish the operation before state callbacks run, preventing recursive
    // stop/error handlers from starting a competing teardown.
    this._failurePromise = failurePromise;
    this._expectedClose = false;
    this._epoch += 1;
    this._setState('failed', { error: fatalError, phase });
    this._clearSetupTimer();
    this._clearGoAwayTimer();
    this._clearTranscriptTimer();

    const socket = this.socket;
    const pendingMicStart = this._micStartPromise;
    this.socket = null;
    this.setupComplete = false;
    this._detachSocket(socket);

    const cleanupOperation = (async () => {
      if (
        socket &&
        !options.socketAlreadyClosed &&
        (socket.readyState === SOCKET_OPEN || socket.readyState === SOCKET_CONNECTING)
      ) {
        try {
          socket.close(4000, 'live-failure');
        } catch (closeError) {
          // Media teardown and fallback still proceed if close() itself fails.
        }
      }

      if (pendingMicStart) {
        try {
          await pendingMicStart;
        } catch (startError) {
          // The epoch change intentionally cancels an in-flight mic start.
        }
      }
      await this._stopMicrophoneNodes();
      this.clearPlayback('failure');
      await this._closeOutputContext();
      this._suppressOutput = false;
      this._awaitingServerInterruption = false;
      this._modelResponseActive = false;
      this._manualActivityActive = false;
      this._manualActivitySource = '';
      this._audioInputSent = false;
      this._emitTranscriptSettled('failure');
      this._settleConnectError(fatalError);
      this._finaliseClosed(
        options.closeEvent || { code: 4000, reason: 'live-failure', wasClean: false }
      );
      // Fallback is deliberately last: its handler may open another mic flow.
      this._emitFailure(fatalError, phase);
    })();

    cleanupOperation.then(
      resolveFailure,
      (cleanupError) => {
        this._settleConnectError(fatalError);
        this._finaliseClosed(
          options.closeEvent || { code: 4000, reason: 'live-failure', wasClean: false }
        );
        this._emitFailure(fatalError, phase);
        this._emitRecoverableError(
          this._asLiveError(cleanupError, 'failure-cleanup-failed', false)
        );
        resolveFailure();
      }
    );

    return failurePromise;
  }

  _settleConnectSuccess() {
    const resolve = this._resolveConnect;
    this._resolveConnect = null;
    this._rejectConnect = null;
    if (resolve) resolve(this);
  }

  _settleConnectError(error) {
    const reject = this._rejectConnect;
    this._resolveConnect = null;
    this._rejectConnect = null;
    if (reject) reject(error);
  }

  _clearSetupTimer() {
    if (this._setupTimer !== null) clearTimeout(this._setupTimer);
    this._setupTimer = null;
  }

  _clearGoAwayTimer() {
    if (this._goAwayTimer !== null) clearTimeout(this._goAwayTimer);
    this._goAwayTimer = null;
  }

  _clearTranscriptTimer() {
    if (this._transcriptTimer !== null) clearTimeout(this._transcriptTimer);
    this._transcriptTimer = null;
  }

  _isEpochActive(epoch, socket = this.socket) {
    return (
      epoch === this._epoch &&
      socket === this.socket &&
      this.state !== 'closing' &&
      this.state !== 'closed' &&
      this.state !== 'failed'
    );
  }

  _detachSocket(socket) {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  }

  _recordTranscript(direction, text, raw) {
    const value = String(text || '');
    if (!value || !this._transcriptFragments[direction]) return;
    const sequence = ++this._transcriptSequence;
    const fragment = {
      direction,
      text: value,
      sequence,
      receivedAt: Date.now(),
      turnCompleteCountAtReceipt: this._turnCompleteCount,
      receivedAfterTurnComplete:
        this._turnCompleteCount > 0 && sequence > this._lastTurnCompleteSequence,
    };
    // Backward-compatible alias; receipt order cannot prove which semantic
    // turn a late transcription fragment belongs to.
    fragment.afterTurnComplete = fragment.receivedAfterTurnComplete;
    this._transcriptFragments[direction].push(fragment);
    const payload = { ...fragment, raw };
    this._emit(direction === 'input' ? 'onInputTranscript' : 'onOutputTranscript', payload);
    this._emit('onTranscript', payload);
    this._scheduleTranscriptSettled('transcript');
  }

  _scheduleTranscriptSettled(reason) {
    this._clearTranscriptTimer();
    this._transcriptTimer = setTimeout(() => {
      this._transcriptTimer = null;
      this._emitTranscriptSettled(reason);
    }, this.transcriptSettleMs);
  }

  _emitTranscriptSettled(reason) {
    const unchanged =
      this._lastSettledSequence === this._transcriptSequence &&
      this._lastSettledTurnCompleteCount === this._turnCompleteCount;
    if (unchanged) return;
    if (this._transcriptSequence === 0 && this._turnCompleteCount === 0) return;
    this._lastSettledSequence = this._transcriptSequence;
    this._lastSettledTurnCompleteCount = this._turnCompleteCount;
    this._emit('onTranscriptSettled', {
      reason,
      final: false,
      transcriptionMayFollow: true,
      quietForMs: this.transcriptSettleMs,
      snapshot: this.getTranscriptSnapshot(),
    });
  }

  _finaliseClosed(event) {
    if (this._fatalError) this._setState('failed', { error: this._fatalError });
    else this._setState('closed', { reason: event.reason || '' });
    if (!this._closeEmitted) {
      this._closeEmitted = true;
      this._emit('onClose', {
        code: Number(event.code) || 0,
        reason: event.reason || '',
        wasClean: event.wasClean !== false,
        expected: this._expectedClose,
      });
    }
  }

  _setState(state, detail = {}) {
    if (this.state === state) return;
    const previous = this.state;
    this.state = state;
    this._emit('onStateChange', { state, previous, ...detail });
  }

  _emit(name, payload) {
    const callback = this.callbacks[name];
    if (typeof callback !== 'function') return;
    const callbackEpoch = this._epoch;
    try {
      const result = callback(payload, this);
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).catch((error) => {
          if (callbackEpoch !== this._epoch || this.state === 'closed') return;
          if (name !== 'onError') {
            this._emitRecoverableError(
              this._asLiveError(error, `callback-${name}-failed`, false)
            );
          }
        });
      }
    } catch (error) {
      if (name !== 'onError') {
        this._emitRecoverableError(
          this._asLiveError(error, `callback-${name}-failed`, false)
        );
      }
    }
  }

  _emitFailure(error, phase) {
    if (this._failureEmitted) return;
    this._failureEmitted = true;
    this._emit('onError', { error, phase, fallbackRecommended: error.fallbackRecommended });
    if (error.fallbackRecommended) {
      this._emit('onFallback', { error, phase, reason: error.code });
    }
  }

  _emitRecoverableError(error) {
    this._emit('onError', { error, phase: 'runtime', fallbackRecommended: false });
  }

  _asLiveError(error, code, fallbackRecommended) {
    if (error instanceof LiveSessionError) return error;
    return new LiveSessionError(error?.message || String(error || 'Lỗi Gemini Live.'), {
      code,
      fallbackRecommended,
      cause: error,
    });
  }
}

export function createLiveSession(options) {
  return new GeminiLiveSession(options);
}
