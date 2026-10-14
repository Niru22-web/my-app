import { Badge } from "@/components/ui/badge";
import { statusOf, type Timelog } from "./api";

const TONE = { draft: "neutral", submitted: "warning", approved: "success", rejected: "danger" } as const;
const LABEL = { draft: "Draft", submitted: "Awaiting approval", approved: "Approved", rejected: "Returned" } as const;

export function StatusBadge({ entry }: { entry: Pick<Timelog, "submissionStatus"> }) {
  const s = statusOf(entry);
  return <Badge tone={TONE[s]}>{LABEL[s]}</Badge>;
}
