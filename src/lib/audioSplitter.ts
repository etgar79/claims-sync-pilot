// Client-side audio splitter for large recordings.
// Decodes the file via Web Audio API and slices it into ~10-minute WAV chunks
// (≈ 19 MB at 16 kHz mono), so each chunk fits the 20–25 MB limits of the
// cheap transcription engines (Whisper / Lovable AI / ivrit.ai).
//
// To avoid cutting in the middle of a word we look for the quietest sample
// within a 3-second window around each cut point.

export interface AudioChunk {
  index: number;
  total: number;
  blob: Blob;
  startSec: number;
  endSec: number;
}

// Target ~10 minutes per chunk. With 16 kHz mono PCM16 WAV that's ~19 MB,
// safely under all engine limits.
const TARGET_SECONDS = 600;
const SILENCE_SEARCH_SECONDS = 3;
const TARGET_SAMPLE_RATE = 16000;

export function needsSplitting(file: File | Blob): boolean {
  // Anything ≥ 19 MB risks failing on Lovable AI (20MB) and Whisper (25MB).
  return file.size >= 19 * 1024 * 1024;
}

async function decodeAudio(file: File | Blob): Promise<AudioBuffer> {
  const ArrayBufferData = await file.arrayBuffer();
  // Use a regular AudioContext (OfflineAudioContext can't decode arbitrary formats).
  const Ctx: typeof AudioContext =
    (window.AudioContext as typeof AudioContext) ||
    // @ts-expect-error - webkit prefix for Safari
    (window.webkitAudioContext as typeof AudioContext);
  if (!Ctx) throw new Error("הדפדפן אינו תומך ב-Web Audio API");
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(ArrayBufferData.slice(0));
  } finally {
    // Best-effort close
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
  }
}

// Downsample + average channels to mono Float32Array at TARGET_SAMPLE_RATE.
async function toMonoBuffer(buffer: AudioBuffer): Promise<{ samples: Float32Array; sampleRate: number }> {
  const targetRate = TARGET_SAMPLE_RATE;
  const length = Math.ceil((buffer.duration * targetRate));
  const offline = new OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return { samples: rendered.getChannelData(0).slice(0), sampleRate: targetRate };
}

// Find the quietest sample index inside [center - window, center + window].
function findSilenceCut(samples: Float32Array, center: number, windowSamples: number): number {
  const start = Math.max(0, center - windowSamples);
  const end = Math.min(samples.length, center + windowSamples);
  let bestIdx = center;
  let bestVal = Infinity;
  // Sample every 50 frames is enough; we only need an approximate quiet point.
  for (let i = start; i < end; i += 50) {
    const v = Math.abs(samples[i] ?? 0);
    if (v < bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Encode a Float32 mono PCM segment to a WAV Blob.
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  // Write PCM16 samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export interface SplitOptions {
  targetSeconds?: number;
  onProgress?: (decoded: boolean, encodedChunks: number, totalChunks: number) => void;
}

export async function splitAudioFile(
  file: File | Blob,
  opts: SplitOptions = {},
): Promise<AudioChunk[]> {
  const targetSec = opts.targetSeconds ?? TARGET_SECONDS;

  let buffer: AudioBuffer;
  try {
    buffer = await decodeAudio(file);
  } catch (e) {
    throw new Error(
      `לא הצלחנו לקרוא את קובץ האודיו לפיצול. נסי להמיר ל-MP3 או WAV. (${
        e instanceof Error ? e.message : String(e)
      })`,
    );
  }

  const { samples, sampleRate } = await toMonoBuffer(buffer);
  opts.onProgress?.(true, 0, Math.max(1, Math.ceil(samples.length / (targetSec * sampleRate))));

  const totalSamples = samples.length;
  const chunkSamples = targetSec * sampleRate;
  const silenceWindow = SILENCE_SEARCH_SECONDS * sampleRate;

  const chunks: AudioChunk[] = [];
  let cursor = 0;
  const totalChunks = Math.max(1, Math.ceil(totalSamples / chunkSamples));

  while (cursor < totalSamples) {
    let end: number;
    if (cursor + chunkSamples >= totalSamples) {
      end = totalSamples;
    } else {
      end = findSilenceCut(samples, cursor + chunkSamples, silenceWindow);
      if (end <= cursor + sampleRate) end = cursor + chunkSamples; // safety
    }
    const slice = samples.subarray(cursor, end);
    const blob = encodeWav(slice, sampleRate);
    chunks.push({
      index: chunks.length,
      total: totalChunks,
      blob,
      startSec: cursor / sampleRate,
      endSec: end / sampleRate,
    });
    opts.onProgress?.(true, chunks.length, totalChunks);
    cursor = end;
    // Yield to the UI thread between encodes
    await new Promise((r) => setTimeout(r, 0));
  }

  // Update each chunk's `total` to the actual count (in case we generated fewer
  // due to the final partial chunk).
  for (const c of chunks) c.total = chunks.length;
  return chunks;
}
