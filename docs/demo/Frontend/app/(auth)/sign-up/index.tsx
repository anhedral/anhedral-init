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
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <View>
            <Text className="text-lg font-semibold">demo</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="w-full sm:max-w-md sm:order-2">
            <SignUpForm />
          </View>

          <View className="flex-1 border border-border bg-card px-6 py-8 sm:order-1">
            <Text className="text-2xl font-semibold">Create account</Text>
            <Text className="mt-3 text-muted-foreground">
              Create a user and continue into the protected application area.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
