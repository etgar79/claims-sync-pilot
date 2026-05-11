import { useMemo } from "react";

export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  segments: TranscriptSegment[] | null | undefined;
  fallbackText?: string | null;
  /** Optional: when provided, clicking a segment seeks the audio. */
  onSeek?: (seconds: number) => void;
  className?: string;
}

/**
 * Renders a transcript segmented by sentence with [mm:ss] prefix.
 * Words inside a segment expose their timestamp via tooltip on hover.
 * Falls back to plain text when segments are unavailable.
 */
export function TimestampedTranscript({ segments, fallbackText, onSeek, className }: Props) {
  const items = useMemo(() => Array.isArray(segments) ? segments : [], [segments]);

  if (!items.length) {
    return (
      <div className={`whitespace-pre-wrap text-sm leading-relaxed text-foreground ${className ?? ""}`}>
        {fallbackText || "אין תמלול עדיין."}
      </div>
    );
  }

  return (
    <div dir="rtl" className={`space-y-2 text-sm leading-relaxed ${className ?? ""}`}>
      {items.map((seg, i) => (
        <div key={i} className="flex gap-2 items-baseline">
          <button
            type="button"
            onClick={() => onSeek?.(seg.start)}
            className="shrink-0 font-mono text-[11px] tabular-nums text-primary hover:underline disabled:cursor-default disabled:no-underline"
            disabled={!onSeek}
            title={onSeek ? `נגן מ-${fmt(seg.start)}` : fmt(seg.start)}
          >
            [{fmt(seg.start)}]
          </button>
          <p className="flex-1">
            {seg.words && seg.words.length > 0
              ? seg.words.map((w, j) => (
                  <span
                    key={j}
                    title={fmt(w.start)}
                    onClick={() => onSeek?.(w.start)}
                    className={onSeek ? "cursor-pointer hover:bg-primary/10 rounded px-0.5" : "hover:bg-muted/50 rounded px-0.5"}
                  >
                    {w.text}
                    {j < seg.words!.length - 1 ? " " : ""}
                  </span>
                ))
              : seg.text}
          </p>
        </div>
      ))}
    </div>
  );
}
