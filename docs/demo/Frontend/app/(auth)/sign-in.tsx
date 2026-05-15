import { SignInForm } from '@/components/sign-in-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { Text } from '@/components/ui/text';
import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';

export default function SignInScreen() {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="min-h-full bg-background px-4 pb-10 pt-6 sm:px-6"
      keyboardDismissMode="interactive">
      <View className="mx-auto w-full max-w-5xl gap-6">
        <View className="flex-row items-center justify-between rounded-[28px] border border-border/70 bg-card px-4 py-3">
          <View>
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Clerk custom auth</Text>
            <Text className="mt-1 text-lg font-semibold">demo</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="flex-1 rounded-[28px] border border-border/70 bg-card px-6 py-8">
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Sign in</Text>
            <Text className="mt-4 text-4xl font-semibold leading-tight">Return to the app shell without rebuilding auth from scratch.</Text>
            <Text className="mt-4 text-base leading-7 text-muted-foreground">
              The starter already connects Clerk, RevenueCat subscription state, credits, and R2 avatar upload. This screen is here so your team starts from a real flow instead of a blank form.
            </Text>
            <Link href="/" className="mt-6 text-sm underline underline-offset-4">
              Back to landing
            </Link>
          </View>

          <View className="w-full sm:max-w-md">
            <SignInForm />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
