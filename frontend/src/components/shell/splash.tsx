import { LogoMark } from "@/components/brand/logo";

export function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg" role="status" aria-label="Loading ASA Portal">
      <div className="flex flex-col items-center gap-4">
        <LogoMark size={56} eager className="animate-pulse" />
        <div className="h-1 w-28 overflow-hidden rounded-full bg-line">
          <div className="h-full w-1/2 animate-[shimmer_1.1s_ease-in-out_infinite] rounded-full bg-brand" style={{ transform: "translateX(-100%)" }} />
        </div>
      </div>
    </div>
  );
}
