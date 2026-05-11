import { UserCog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActAsUser } from "@/lib/actAs";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "sonner";

/**
 * Sticky banner shown at the top of every page when admin is acting as a user.
 * Shows target user name and a "stop" button.
 */
export function ActAsUserBanner() {
  const { isAdmin } = useUserRoles();
  const { isActing, actAsName, clearActAs } = useActAsUser();

  if (!isAdmin || !isActing) return null;

  return (
    <div className="sticky top-0 z-40 bg-amber-500/95 text-amber-950 border-b border-amber-700 px-4 py-2 flex items-center gap-3 text-sm shadow-md">
      <UserCog className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">מצב "פעל כמשתמש":</span>{" "}
        <span className="truncate">{actAsName || "משתמש"}</span>
        <span className="text-xs opacity-80 mr-2">— כל פעולה (יצירה/עריכה/מחיקה) תיוחס למשתמש זה</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 bg-white/80 hover:bg-white border-amber-700 text-amber-950"
        onClick={() => {
          clearActAs();
          toast.success("יצאת ממצב 'פעל כמשתמש'");
        }}
      >
        <X className="h-3.5 w-3.5 ml-1" />
        צא ממצב זה
      </Button>
    </div>
  );
}
