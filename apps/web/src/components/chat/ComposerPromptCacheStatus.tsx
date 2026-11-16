import { toServerClock } from "@t3tools/client-runtime/clock";
import {
  derivePromptCacheStateForMinute,
  presentPromptCacheIndicator,
  promptCacheRingPulses,
  type PromptCacheIndicator,
} from "@t3tools/client-runtime/state/context-window";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useState } from "react";

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
export function ComposerPromptCacheRing(props: {
  threadRef: ScopedThreadRef | null;
  /** Bumped per sent message; each new key sweeps the ring back to full once. */
  sweepKey?: number;
}) {
  const indicator = usePromptCacheIndicator(props.threadRef);
  if (indicator === null || props.threadRef === null) return null;
  return (
    <PromptCacheRing
      // Another thread's ring starts over, so it never animates a change it did not go through.
      key={`${props.threadRef.environmentId}:${props.threadRef.threadId}`}
      indicator={indicator}
      sweepKey={props.sweepKey ?? 0}
    />
  );
}

function PromptCacheRing(props: { indicator: PromptCacheIndicator; sweepKey: number }) {
  const { tone, fraction } = props.indicator;
  const pulseEnabled = useClientSettings((settings) => settings.promptCacheRingPulseEnabled);
  // Sends from before this ring appeared do not sweep it.
  const [firstSweepKey] = useState(props.sweepKey);
  const [seen, setSeen] = useState({ tone, pulseKey: 0 });
  if (seen.tone !== tone) {
    const pulses = pulseEnabled && promptCacheRingPulses(seen.tone, tone);
    setSeen({ tone, pulseKey: seen.pulseKey + (pulses ? 1 : 0) });
  }
  return (
    <>
      <svg
        aria-hidden
        data-prompt-cache-status={tone}
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
          strokeDasharray={tone === "cold" ? "4.2 4.133" : `${fraction * 100} 100`}
          className={RING_TONE_CLASS_NAME[tone]}
        />
        {props.sweepKey !== firstSweepKey ? (
          // Remounting per send restarts the one-shot sweep; it ends invisible. Sending rewarms
          // the cache, so the sweep is green whatever the ring shows. Reduced motion skips it.
          <circle
            key={props.sweepKey}
            data-prompt-cache-sweep
            cx="20"
            cy="20"
            r="18.75"
            fill="none"
            strokeWidth="2.5"
            pathLength={100}
            strokeDasharray="100 100"
            className="stroke-success opacity-0 motion-safe:animate-prompt-cache-sweep"
          />
        ) : null}
      </svg>
      {seen.pulseKey > 0 ? (
        // An HTML ring, so the one-shot pulse runs on the compositor (scale and opacity only).
        <span
          key={seen.pulseKey}
          aria-hidden
          data-prompt-cache-pulse
          className={cn(
            "pointer-events-none absolute -inset-1 rounded-full border-2 opacity-0 motion-safe:animate-prompt-cache-pulse",
            tone === "cold" ? "border-muted-foreground/60" : "border-warning-foreground",
          )}
        />
      ) : null}
    </>
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
