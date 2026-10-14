import { useEffect, useState } from "react";

import { getHealth } from "../api/health";

type ConnectionState = "checking" | "connected" | "unavailable";

const statusContent: Record<
  ConnectionState,
  { label: string; dotClassName: string }
> = {
  checking: {
    label: "Checking backend…",
    dotClassName: "bg-amber-400",
  },
  connected: {
    label: "Backend connected",
    dotClassName: "bg-emerald-400",
  },
  unavailable: {
    label: "Backend unavailable",
    dotClassName: "bg-rose-500",
  },
};

export function ApiStatus() {
  const [state, setState] = useState<ConnectionState>("checking");

  useEffect(() => {
    let active = true;

    getHealth()
      .then(() => {
        if (active) setState("connected");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });

    return () => {
      active = false;
    };
  }, []);

  const content = statusContent[state];

  return (
    <div
      className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 backdrop-blur"
      role="status"
    >
      <span
        aria-hidden="true"
        className={`size-2.5 rounded-full shadow-[0_0_16px_currentColor] ${content.dotClassName}`}
      />
      {content.label}
    </div>
  );
}
