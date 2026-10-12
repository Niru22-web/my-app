import { Badge } from "@/components/ui/badge";
import { LEAVE_STATE_LABEL, leaveState, type Leave } from "./api";

const TONE = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;

export function LeaveBadge({ leave }: { leave: Pick<Leave, "status"> }) {
  const s = leaveState(leave);
  const auto = (leave.status ?? "").toLowerCase() === "auto_approved";
  return <Badge tone={TONE[s]}>{auto ? "Auto-approved" : LEAVE_STATE_LABEL[s]}</Badge>;
}
