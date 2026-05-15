import { Platform } from 'react-native';

type EnvKey =
  | 'EXPO_PUBLIC_API_URL'
  | 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'
  | 'EXPO_PUBLIC_RC_ENTITLEMENT_ID'
  | 'EXPO_PUBLIC_RC_API_KEY_IOS'
  | 'EXPO_PUBLIC_RC_API_KEY_ANDROID'
  | 'EXPO_PUBLIC_RC_WEB_API_KEY';

const envValue = (key: EnvKey): string | undefined => {
  switch (key) {
    case 'EXPO_PUBLIC_API_URL': return process.env.EXPO_PUBLIC_API_URL;
    case 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY': return process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    case 'EXPO_PUBLIC_RC_ENTITLEMENT_ID': return process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID;
    case 'EXPO_PUBLIC_RC_API_KEY_IOS': return process.env.EXPO_PUBLIC_RC_API_KEY_IOS;
    case 'EXPO_PUBLIC_RC_API_KEY_ANDROID': return process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID;
    case 'EXPO_PUBLIC_RC_WEB_API_KEY': return process.env.EXPO_PUBLIC_RC_WEB_API_KEY;
    default: return undefined;
  }
};

const requireEnv = (key: EnvKey): string => {
  const value = envValue(key);
  if (!value) throw new Error(`Missing ${key}. Set it in your environment variables.`);
  return value;
};

export const apiBaseUrl = requireEnv('EXPO_PUBLIC_API_URL');
export const clerkPublishableKey = requireEnv('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');

export type SubscriptionConfig = {
  entitlementId: string;
  iosApiKey: string;
  androidApiKey: string;
  webApiKey: string;
};

export const subscriptionConfig: SubscriptionConfig = {
  entitlementId: requireEnv('EXPO_PUBLIC_RC_ENTITLEMENT_ID'),
  iosApiKey: requireEnv('EXPO_PUBLIC_RC_API_KEY_IOS'),
  androidApiKey: requireEnv('EXPO_PUBLIC_RC_API_KEY_ANDROID'),
  webApiKey: requireEnv('EXPO_PUBLIC_RC_WEB_API_KEY'),
};

export function getPlatformRevenueCatApiKey(): string {
  if (Platform.OS === 'ios') return subscriptionConfig.iosApiKey;
  if (Platform.OS === 'android') return subscriptionConfig.androidApiKey;
  if (Platform.OS === 'web') return subscriptionConfig.webApiKey;
  throw new Error(`Unsupported platform: ${Platform.OS}`);
}
