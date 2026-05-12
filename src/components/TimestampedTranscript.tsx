import { useMemo, useState } from "react";
import { formatSpeakerLabel } from "@/lib/serviceLabels";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
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

interface SpeakerBlock {
  speaker?: string;
  start: number;
  segments: TranscriptSegment[];
}

/** Group consecutive segments that share the same speaker into one visual block. */
function groupBySpeaker(segments: TranscriptSegment[]): SpeakerBlock[] {
  const blocks: SpeakerBlock[] = [];
  for (const seg of segments) {
    const last = blocks[blocks.length - 1];
    if (last && (last.speaker ?? null) === (seg.speaker ?? null)) {
      last.segments.push(seg);
    } else {
      blocks.push({ speaker: seg.speaker, start: seg.start, segments: [seg] });
    }
  }
  return blocks;
}

interface Props {
  segments: TranscriptSegment[] | null | undefined;
  fallbackText?: string | null;
  /** Optional: when provided, clicking a segment seeks the audio. */
  onSeek?: (seconds: number) => void;
  className?: string;
  /** Initial value for the timestamps toggle (default: true). */
  defaultShowTimestamps?: boolean;
  /** Hide the internal toggle (e.g. when parent provides its own). */
  hideToggle?: boolean;
  /** Controlled override for showing timestamps. */
  showTimestamps?: boolean;
}

/**
 * Renders a transcript grouped by speaker with a [דובר N · mm:ss] label per turn.
 * Includes a built-in toggle to hide all timestamps for a clean prose view.
 * Falls back to plain text when segments are unavailable.
 */
export function TimestampedTranscript({
  segments,
  fallbackText,
  onSeek,
  className,
  defaultShowTimestamps = true,
  hideToggle,
  showTimestamps: showTimestampsProp,
}: Props) {
  const blocks = useMemo(() => groupBySpeaker(Array.isArray(segments) ? segments : []), [segments]);
  const hasSpeakers = useMemo(() => blocks.some((b) => !!b.speaker), [blocks]);
  const [internalShow, setInternalShow] = useState(defaultShowTimestamps);
  const showTimes = showTimestampsProp ?? internalShow;

  if (!blocks.length) {
    return (
      <div className={`whitespace-pre-wrap text-sm leading-relaxed text-foreground ${className ?? ""}`}>
        {fallbackText || "אין תמלול עדיין."}
      </div>
    );
  }

  return (
    <div dir="rtl" className={`space-y-3 text-sm leading-relaxed ${className ?? ""}`}>
      {!hideToggle && (
        <div className="flex items-center justify-end gap-2 pb-1 border-b border-border/50">
          <Label htmlFor="ts-toggle" className="text-xs text-muted-foreground cursor-pointer">
            תוויות זמן
          </Label>
          <Switch
            id="ts-toggle"
            checked={showTimes}
            onCheckedChange={setInternalShow}
            disabled={showTimestampsProp !== undefined}
          />
        </div>
      )}
      {blocks.map((block, bi) => {
        const speakerLabel = formatSpeakerLabel(block.speaker);
        return (
          <div key={bi} className="space-y-1">
            {/* Speaker (+ optional start-time) header */}
            {hasSpeakers && (
              <button
                type="button"
                onClick={() => onSeek?.(block.start)}
                disabled={!onSeek}
                className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15 disabled:cursor-default disabled:hover:bg-primary/10"
                title={onSeek ? `נגן מ-${fmt(block.start)}` : fmt(block.start)}
              >
                <span>{speakerLabel ?? "דובר"}</span>
                {showTimes && (
                  <span className="font-mono tabular-nums opacity-80">· {fmt(block.start)}</span>
                )}
              </button>
            )}
            {showTimes ? (
              <div className="space-y-1.5">
                {block.segments.map((seg, i) => (
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
            ) : (
              <p className="text-foreground">
                {block.segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim()}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
