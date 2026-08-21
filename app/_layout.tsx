import { ClerkLoaded, ClerkProvider } from "@clerk/clerk-expo";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import { LogBox } from "react-native";

import { tokenCache } from "@/lib/auth";
import { applyRTL, getLocale } from "@/lib/i18n";
import { QueryProvider } from "@/lib/query-provider";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

applyRTL(getLocale());

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error(
    "Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env",
  );
}

LogBox.ignoreLogs(["Clerk:"]);

export default function RootLayout() {
  const locale = getLocale();
  const isArabic = locale === "ar";

  const [loaded] = useFonts({
    "Jakarta-Bold": isArabic
      ? require("../assets/fonts/arabic/Cairo-Bold.ttf")
      : require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
    "Jakarta-ExtraBold": isArabic
      ? require("../assets/fonts/arabic/Cairo-Bold.ttf")
      : require("../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
    "Jakarta-ExtraLight": isArabic
      ? require("../assets/fonts/arabic/Cairo-Regular.ttf")
      : require("../assets/fonts/PlusJakartaSans-ExtraLight.ttf"),
    "Jakarta-Light": isArabic
      ? require("../assets/fonts/arabic/Cairo-Regular.ttf")
      : require("../assets/fonts/PlusJakartaSans-Light.ttf"),
    "Jakarta-Medium": isArabic
      ? require("../assets/fonts/arabic/Cairo-SemiBold.ttf")
      : require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    Jakarta: isArabic
      ? require("../assets/fonts/arabic/Cairo-Regular.ttf")
      : require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "Jakarta-SemiBold": isArabic
      ? require("../assets/fonts/arabic/Cairo-SemiBold.ttf")
      : require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
      <ClerkLoaded>
        <QueryProvider>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(root)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </QueryProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
