import '@/global.css';

import { SubscriptionProvider } from '@/contexts/SubscriptionProvider';
import { clerkPublishableKey } from '@/lib/config';
import { NAV_THEME } from '@/lib/theme';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import * as React from 'react';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
        <SubscriptionProvider>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <Routes />
          <PortalHost />
        </SubscriptionProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { isSignedIn, isLoaded } = useAuth();

  React.useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />

      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false, title: 'Sign in' }} />
        <Stack.Screen name="(auth)/sign-up" options={{ presentation: 'modal', title: '', headerTransparent: true, gestureEnabled: false }} />
        <Stack.Screen name="(auth)/reset-password" options={{ title: '', headerShadowVisible: false, headerTransparent: true }} />
        <Stack.Screen name="(auth)/forgot-password" options={{ title: '', headerShadowVisible: false, headerTransparent: true }} />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)/system" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
