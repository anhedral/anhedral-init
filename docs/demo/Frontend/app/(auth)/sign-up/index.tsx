import { SignUpForm } from '@/components/sign-up-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { Text } from '@/components/ui/text';
import { ScrollView, View } from 'react-native';

export default function SignUpScreen() {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="min-h-full bg-background px-4 pb-10 pt-6 sm:px-6"
      keyboardDismissMode="interactive">
      <View className="mx-auto w-full max-w-5xl gap-6">
        <View className="flex-row items-center justify-between rounded-[28px] border border-border/70 bg-card px-4 py-3">
          <View>
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Starter onboarding</Text>
            <Text className="mt-1 text-lg font-semibold">demo</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="w-full sm:max-w-md sm:order-2">
            <SignUpForm />
          </View>

          <View className="flex-1 rounded-[28px] border border-border/70 bg-card px-6 py-8 sm:order-1">
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Create account</Text>
            <Text className="mt-4 text-4xl font-semibold leading-tight">Get users into the signed-in product shell immediately.</Text>
            <Text className="mt-4 text-base leading-7 text-muted-foreground">
              New accounts land in a dashboard that already exposes RevenueCat subscription state, credits, and an R2 avatar flow.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
