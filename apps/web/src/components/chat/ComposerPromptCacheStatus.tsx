import { toServerClock } from "@t3tools/client-runtime/clock";
import {
  derivePromptCacheStateForMinute,
  presentPromptCacheIndicator,
} from "@t3tools/client-runtime/state/context-window";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { useNowMinute } from "~/hooks/useNowMinute";
import { useClientSettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { useQuietThreadShell } from "~/state/entities";

// Ticks on the shared minute clock, so only the small components below re-render.
function usePromptCacheIndicator(threadRef: ScopedThreadRef | null) {
  const enabled = useClientSettings((settings) => settings.promptCacheTimersEnabled);
  const thread = useQuietThreadShell(enabled ? threadRef : null);
  const nowMinute = useNowMinute();
  if (thread?.promptCacheExpiresAt == null) return null;
  // The server stamps the expiry, so compare it on the server's clock.
  const now = toServerClock(thread.environmentId, Date.parse(`${nowMinute}:00.000Z`));
  const cache = derivePromptCacheStateForMinute(thread, now);
  return cache === null ? null : presentPromptCacheIndicator(cache);
}

const RING_TONE_CLASS_NAME = {
  warm: "stroke-success",
  expiring: "stroke-warning-foreground",
  cold: "stroke-muted-foreground/60",
};

/** Draws around its positioned parent: full while warm, draining when expiring, dashed when cold. */
export function ComposerPromptCacheRing(props: { threadRef: ScopedThreadRef | null }) {
  const indicator = usePromptCacheIndicator(props.threadRef);
  if (indicator === null) return null;
  return (
    <svg
      aria-hidden
      data-prompt-cache-status={indicator.tone}
      viewBox="0 0 40 40"
      className="pointer-events-none absolute -inset-1 size-[calc(100%+0.5rem)] -rotate-90"
    >
      <circle
        cx="20"
        cy="20"
        r="18.75"
        fill="none"
        strokeWidth="1.75"
        pathLength={100}
        strokeDasharray={
          indicator.tone === "cold" ? "4.2 4.133" : `${indicator.fraction * 100} 100`
        }
        className={RING_TONE_CLASS_NAME[indicator.tone]}
      />
    </svg>
  );
}

export function ComposerPromptCacheNote(props: { threadRef: ScopedThreadRef | null }) {
  const indicator = usePromptCacheIndicator(props.threadRef);
  return indicator === null ? null : <div>{indicator.description}</div>;
}

const BADGE_TONE_CLASS_NAME = {
  warm: "bg-success",
  expiring: "bg-warning-foreground",
  cold: "border border-muted-foreground/70 bg-(--chat-composer-glass-surface,var(--background))",
};

/** A corner dot for its positioned parent: solid while warm, amber when expiring, hollow when cold. */
export function ComposerPromptCacheBadge(props: { threadRef: ScopedThreadRef | null }) {
  const indicator = usePromptCacheIndicator(props.threadRef);
  if (indicator === null) return null;
  return (
    <span
      data-prompt-cache-badge={indicator.tone}
      className={cn(
        "absolute -top-1 -right-1 size-2 rounded-full ring-2 ring-(--chat-composer-glass-surface,var(--background))",
        BADGE_TONE_CLASS_NAME[indicator.tone],
      )}
    >
      <span className="sr-only">{indicator.description}</span>
    </span>
  );
}
