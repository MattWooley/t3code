import { useAtomValue } from "@effect/atom-react";
import { toServerClock } from "@t3tools/client-runtime/clock";
import {
  derivePromptCacheStateForMinute,
  presentPromptCacheIndicator,
  type PromptCacheIndicator,
} from "@t3tools/client-runtime/state/context-window";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useResolveClassNames } from "uniwind";

import { useNowMinuteMs } from "../../lib/clock";
import { cn } from "../../lib/cn";
import { promptCacheTimersEnabledAtom } from "../../state/preferences";

// Ticks on the shared minute clock, so only the small components that call it re-render.
export function usePromptCacheIndicator(
  thread: EnvironmentThreadShell,
): PromptCacheIndicator | null {
  const enabled = useAtomValue(promptCacheTimersEnabledAtom);
  // The server stamps the expiry, so compare it on the server's clock.
  const nowMs = toServerClock(thread.environmentId, useNowMinuteMs());
  if (!enabled || thread.promptCacheExpiresAt == null) return null;
  const cache = derivePromptCacheStateForMinute(thread, nowMs);
  return cache === null ? null : presentPromptCacheIndicator(cache);
}

const RING_RADIUS = 18.75;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const RING_COLD_DASH = RING_LENGTH / 24;

/** Draws around its parent: full while warm, draining when expiring, dashed when cold. */
export function ComposerPromptCacheRing(props: { readonly indicator: PromptCacheIndicator }) {
  const tones = {
    warm: StyleSheet.flatten(useResolveClassNames("text-emerald-500"))?.color,
    expiring: StyleSheet.flatten(useResolveClassNames("text-warning-foreground"))?.color,
    cold: StyleSheet.flatten(useResolveClassNames("text-foreground-muted"))?.color,
  };
  const { tone, fraction } = props.indicator;
  return (
    <View pointerEvents="none" style={styles.ring}>
      <Svg width="100%" height="100%" viewBox="0 0 40 40" style={styles.fromTop}>
        <Circle
          cx={20}
          cy={20}
          r={RING_RADIUS}
          fill="none"
          stroke={tones[tone]}
          strokeOpacity={tone === "cold" ? 0.7 : 1}
          strokeWidth={1.75}
          strokeDasharray={
            tone === "cold"
              ? [RING_COLD_DASH, RING_COLD_DASH]
              : fraction < 1
                ? [RING_LENGTH * fraction, RING_LENGTH]
                : undefined
          }
        />
      </Svg>
    </View>
  );
}

/** A corner dot for the model icon: solid while warm, amber when expiring, hollow when cold. */
export function ComposerPromptCacheBadge(props: {
  readonly thread: EnvironmentThreadShell;
  readonly surfaceColor: string;
}) {
  const indicator = usePromptCacheIndicator(props.thread);
  if (indicator === null) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.badge,
        { borderColor: props.surfaceColor, backgroundColor: props.surfaceColor },
      ]}
    >
      <View
        className={cn(
          "flex-1 rounded-full",
          indicator.tone === "warm" && "bg-emerald-500",
          indicator.tone === "expiring" && "bg-warning-foreground",
          indicator.tone === "cold" && "border border-foreground-muted",
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute", top: -4, right: -4, bottom: -4, left: -4 },
  fromTop: { transform: [{ rotate: "-90deg" }] },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
  },
});
