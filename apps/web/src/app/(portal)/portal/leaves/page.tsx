import { redirect } from "next/navigation";

// Leave moved to its own module.
export default function LegacyLeave() {
  redirect("/leave");
}
