import { Badge } from "@/components/ui/badge";
import { LEAVE_STATE_LABEL, leaveState, stageLabel, type Leave } from "./api";

const TONE = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as const;

export function LeaveBadge({ leave }: { leave: Pick<Leave, "status" | "stage" | "approvals"> }) {
  const s = leaveState(leave);
  const auto = (leave.status ?? "").toLowerCase() === "auto_approved";
  const step = s === "pending" ? stageLabel(leave) : null;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge tone={TONE[s]}>{auto ? "Auto-approved" : LEAVE_STATE_LABEL[s]}</Badge>
      {step && <span className="text-[11px] text-ink-subtle">{step}</span>}
    </span>
  );
}
