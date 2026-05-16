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
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <View>
            <Text className="text-lg font-semibold">demo</Text>
          </View>
          <ThemeToggle />
        </View>

        <View className="gap-4 sm:flex-row">
          <View className="flex-1 border border-border bg-card px-6 py-8">
            <Text className="text-2xl font-semibold">Sign in</Text>
            <Text className="mt-3 text-muted-foreground">
              Access the protected application area.
            </Text>
            <Link href="/" className="mt-6 text-sm underline underline-offset-4">
              Back
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
