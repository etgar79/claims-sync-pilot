// Helpers for stitching transcribed chunks back into a single timeline.
// Speaker labels from each chunk are renumbered into a global namespace
// so chunk-1 "Speaker 1" and chunk-2 "Speaker 1" don't collide.

export interface StitchSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words?: { start: number; end: number; text: string; speaker?: string }[];
}

interface ChunkPart {
  segments: any[] | null;
  startSec: number;
}

/**
 * Stitch chunked transcription results into one continuous segment list.
 * Each chunk's local speakers ("Speaker 1", "Speaker 2"...) are remapped
 * onto a global counter so they remain unique.
 */
export function stitchChunkSegments(parts: ChunkPart[]): StitchSegment[] {
  const out: StitchSegment[] = [];
  let nextSpeakerId = 1;
  for (const part of parts) {
    if (!part.segments) continue;
    const offset = part.startSec || 0;
    const localToGlobal: Record<string, string> = {};
    const remap = (raw?: string): string | undefined => {
      if (!raw) return undefined;
      if (localToGlobal[raw]) return localToGlobal[raw];
      const mapped = `Speaker ${nextSpeakerId++}`;
      localToGlobal[raw] = mapped;
      return mapped;
    };
    for (const s of part.segments) {
      out.push({
        start: (Number(s.start) || 0) + offset,
        end: (Number(s.end) || 0) + offset,
        text: s.text,
        speaker: remap(s.speaker),
        words: Array.isArray(s.words)
          ? s.words.map((w: any) => ({
              start: (Number(w.start) || 0) + offset,
              end: (Number(w.end) || 0) + offset,
              text: w.text,
              speaker: remap(w.speaker),
            }))
          : undefined,
      });
    }
  }
  return out;
}
