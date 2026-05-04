import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  workspace: "appraiser" | "architect";
  caseId?: string | null;
  meetingId?: string | null;
  onUploaded?: () => void;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm";
  label?: string;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function UploadPhotosButton({
  workspace, caseId, meetingId, onUploaded, variant = "outline", size = "sm",
  label = "העלה תמונות ל-Drive",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = () => inputRef.current?.click();

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const f of files) {
      try {
        if (!f.type.startsWith("image/")) {
          fail++;
          continue;
        }
        const dataBase64 = await fileToBase64(f);
        const { data, error } = await supabase.functions.invoke("upload-photo-to-drive", {
          body: {
            workspace,
            filename: f.name,
            mimeType: f.type,
            dataBase64,
            caseId: caseId ?? null,
            meetingId: meetingId ?? null,
          },
        });
        if (error || (data as any)?.error) {
          throw new Error((data as any)?.error || error?.message);
        }
        ok++;
      } catch (err: any) {
        console.error("upload-photo failed", err);
        fail++;
      }
    }
    setBusy(false);
    if (ok > 0) toast.success(`${ok} תמונות הועלו ל-Drive${fail ? ` (${fail} נכשלו)` : ""}`);
    else toast.error("העלאת תמונות נכשלה");
    if (ok > 0) onUploaded?.();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFiles}
      />
      <Button variant={variant} size={size} onClick={onPick} disabled={busy} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {label}
      </Button>
    </>
  );
}
