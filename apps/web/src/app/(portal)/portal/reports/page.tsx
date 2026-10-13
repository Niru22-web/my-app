import { redirect } from "next/navigation";

// Reports moved to their own section (My / Team / Organization).
export default function LegacyReports() {
  redirect("/reports/my");
}
