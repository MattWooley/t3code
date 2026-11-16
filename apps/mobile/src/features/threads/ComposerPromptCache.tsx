import { useAtomValue } from "@effect/atom-react";
import { toServerClock } from "@t3tools/client-runtime/clock";
import {
  derivePromptCacheStateForMinute,
  presentPromptCacheIndicator,
  promptCacheRingPulses,
  type PromptCacheIndicator,
} from "@t3tools/client-runtime/state/context-window";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { useEffect, useState } from "react";
import { StyleSheet, View, type ColorValue } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useResolveClassNames } from "uniwind";

import { useNowMinuteMs } from "../../lib/clock";
import { cn } from "../../lib/cn";
import {
  promptCacheRingPulseEnabledAtom,
  promptCacheTimersEnabledAtom,
} from "../../state/preferences";

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

const SWEEP_MS = 800;
/** Share of the sweep spent drawing the ring; the rest fades it out. */
const SWEEP_DRAW_SHARE = 0.65;
const PULSE_MS = 700;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Runs from 0 to 1 once after mounting; a new `key` replays it. */
function useOneShotProgress(durationMs: number) {
  const progress = useSharedValue(0);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts the UI-thread animation once this view is mounted
  useEffect(() => {
    progress.set(withTiming(1, { duration: durationMs, easing: Easing.linear }));
  }, [progress, durationMs]);
  return progress;
}

/** Draws the ring from the top back to full, then fades to show the real state again. */
function RingSweep(props: { readonly color: ColorValue | undefined }) {
  const progress = useOneShotProgress(SWEEP_MS);
  const animatedProps = useAnimatedProps(() => {
    const drawn = Math.min(1, progress.get() / SWEEP_DRAW_SHARE);
    return {
      strokeDashoffset: RING_LENGTH * (1 - drawn) ** 3,
      strokeOpacity: Math.min(1, (1 - progress.get()) / (1 - SWEEP_DRAW_SHARE)),
    };
  });
  return (
    <AnimatedCircle
      cx={20}
      cy={20}
      r={RING_RADIUS}
      fill="none"
      stroke={props.color}
      strokeWidth={2.5}
      strokeDasharray={[RING_LENGTH, RING_LENGTH]}
      animatedProps={animatedProps}
    />
  );
}

/** A ring that grows and fades once: scale and opacity only. */
function RingPulse(props: { readonly color: ColorValue | undefined }) {
  const progress = useOneShotProgress(PULSE_MS);
  const style = useAnimatedStyle(() => {
    const eased = 1 - (1 - progress.get()) ** 3;
    return { opacity: 0.6 * (1 - eased), transform: [{ scale: 1 + 0.35 * eased }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, styles.pulse, { borderColor: props.color }, style]}
    />
  );
}

/** Draws around its parent: full while warm, draining when expiring, dashed when cold. */
export function ComposerPromptCacheRing(props: {
  readonly indicator: PromptCacheIndicator;
  /** Bumped per sent message; each new key sweeps the ring back to full once. */
  readonly sweepKey?: number;
}) {
  const tones = {
    warm: StyleSheet.flatten(useResolveClassNames("text-emerald-500"))?.color,
    expiring: StyleSheet.flatten(useResolveClassNames("text-warning-foreground"))?.color,
    cold: StyleSheet.flatten(useResolveClassNames("text-foreground-muted"))?.color,
  };
  const { tone, fraction } = props.indicator;
  const sweepKey = props.sweepKey ?? 0;
  const reducedMotion = useReducedMotion();
  const pulseEnabled = useAtomValue(promptCacheRingPulseEnabledAtom);
  // Sends from before this ring appeared do not sweep it.
  const [firstSweepKey] = useState(sweepKey);
  const [seen, setSeen] = useState({ tone, pulseKey: 0 });
  if (seen.tone !== tone) {
    const pulses = pulseEnabled && promptCacheRingPulses(seen.tone, tone);
    setSeen({ tone, pulseKey: seen.pulseKey + (pulses ? 1 : 0) });
  }
  return (
    <>
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
          {/* Sending rewarms the cache, so the sweep is green whatever the ring shows. */}
          {!reducedMotion && sweepKey !== firstSweepKey ? (
            <RingSweep key={sweepKey} color={tones.warm} />
          ) : null}
        </Svg>
      </View>
      {!reducedMotion && seen.pulseKey > 0 ? (
        <RingPulse key={seen.pulseKey} color={tones[tone]} />
      ) : null}
    </>
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
  pulse: { borderRadius: 999, borderWidth: 2 },
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
