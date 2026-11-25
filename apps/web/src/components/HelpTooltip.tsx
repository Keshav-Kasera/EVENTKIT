import { useState } from "react";
import { HelpCircle } from "lucide-react";

export function HelpTooltip({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        aria-label={`Explain ${title}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted hover:bg-sand hover:text-ink transition"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-rule bg-ink p-2.5 text-left text-[11px] font-normal leading-relaxed text-white shadow-lg">
          <strong className="block font-semibold text-amber-300">{title}</strong>
          {text}
        </span>
      )}
    </span>
  );
}
