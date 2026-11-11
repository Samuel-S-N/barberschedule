import { createContext, useContext, useEffect, useMemo } from "react";
import type { PropsWithChildren } from "react";
import { Platform, View } from "react-native";
import { vars } from "nativewind";

import type { Colors } from "../colors";
import { DEFAULT_THEME, deriveTheme } from "./derive";
import type { Theme, ThemeInput } from "./derive";

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export const useTheme = () => useContext(ThemeContext);
export const useColors = (): Colors => useContext(ThemeContext).colors;

function useDerived(input: ThemeInput | null | undefined) {
  return useMemo(() => deriveTheme(input ?? undefined), [input?.primary, input?.accent, input?.base]);
}

// Web: the variables go on <html>, because react-native-web renders Modal into document.body, outside the app root.
// Native: a root View with NativeWind's vars(); React context crosses Modal, so pop-ups inherit it. The default palette
// is always applied on native so it does not depend on :root being honoured there.
export function AppThemeProvider({ input, children }: PropsWithChildren<{ input?: ThemeInput | null }>) {
  const theme = useDerived(input);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || theme === DEFAULT_THEME) return undefined;
    const style = document.documentElement.style;
    const names = Object.keys(theme.vars);

    for (const name of names) style.setProperty(name, theme.vars[name]);

    return () => {
      for (const name of names) style.removeProperty(name);
    };
  }, [theme]);

  const content = <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;

  if (Platform.OS === "web") return content;

  return (
    <View className="flex-1" style={vars(theme.vars)}>
      {content}
    </View>
  );
}

// A theme limited to a subtree (the Appearance preview): same vars(), scoped to one View.
export function ThemeScope({ input, className, children }: PropsWithChildren<{ className?: string; input: ThemeInput | null }>) {
  const theme = useDerived(input);

  return (
    <ThemeContext.Provider value={theme}>
      <View className={className} style={vars(theme.vars)}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
