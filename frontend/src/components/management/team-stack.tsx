import { Avatar } from "@/components/ui/avatar";
import { fullName } from "./api";

/** Up to three overlapping avatars plus a "+N" count. */
export function TeamStack({ users }: { users?: { employee: { id: string; firstName: string; lastName: string } }[] }) {
  const list = users ?? [];
  if (!list.length) return <span className="text-xs text-ink-subtle">No one assigned</span>;
  return (
    <div className="flex items-center" title={list.map((u) => fullName(u.employee)).join(", ")}>
      {list.slice(0, 3).map((u, i) => (
        <Avatar key={u.employee.id} name={fullName(u.employee)} size={28} className={i ? "-ml-2" : ""} />
      ))}
      {list.length > 3 && <span className="-ml-2 grid h-7 w-7 place-items-center rounded-full bg-surface-muted text-[10px] font-semibold text-ink-muted ring-2 ring-surface">+{list.length - 3}</span>}
      <span className="sr-only">{list.length} people</span>
    </div>
  );
}
