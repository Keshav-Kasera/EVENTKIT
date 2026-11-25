import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export function CountdownTimer({ targetIso, label }: { targetIso: string; label?: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diffMs = new Date(targetIso).getTime() - now;
  if (diffMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-red-700">
        <Clock className="h-3.5 w-3.5" />
        SLA Expired
      </span>
    );
  }

  const totalSec = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100/80 px-2 py-0.5 font-mono text-xs font-semibold text-amber-950 tabular-nums">
      <Clock className="h-3.5 w-3.5 text-amber-700" />
      {label ? `${label}: ` : ""}
      {pad(hrs)}h {pad(mins)}m {pad(secs)}s
    </span>
  );
}
