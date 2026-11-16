import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { View } from "react-native";

import { AppText as Text } from "../../../../components/ui/AppText";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../../state/preferences";
import { SettingsSection } from "../../components/SettingsSection";
import { SettingsSwitchRow } from "../../components/SettingsSwitchRow";

export function PromptCacheAppearanceSection() {
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const enabled = AsyncResult.isSuccess(preferences)
    ? preferences.value.promptCacheTimersEnabled === true
    : null;

  return (
    <View className="gap-3">
      <SettingsSection title="Threads">
        <SettingsSwitchRow
          disabled={enabled === null}
          icon="timer"
          label="Prompt cache timers"
          value={enabled}
          onValueChange={(value) => savePreferences({ promptCacheTimersEnabled: value })}
        />
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        Show how long each Claude thread's prompt cache stays warm. Replying before it goes cold
        reuses the cached context instead of writing all of it again.
      </Text>
    </View>
  );
}
