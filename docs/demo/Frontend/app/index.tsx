import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAuth } from '@clerk/expo';
import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';

export default function HomeScreen() {
  const { isSignedIn } = useAuth();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="min-h-full px-4 pb-10 pt-6 sm:px-6">
      <View className="mx-auto w-full max-w-3xl gap-4">
        <View className="flex-row items-center justify-between border-b border-border py-3">
          <Text className="text-lg font-semibold">demo</Text>
          <ThemeToggle />
        </View>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-left text-2xl">Application foundation ready</CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            <Text className="text-muted-foreground">
              Configure providers, then use the protected area to verify auth, API, subscription, database, and storage wiring.
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {isSignedIn ? (
                <Link href="/system" asChild>
                  <Button>
                    <Text>Open app</Text>
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/(auth)/sign-in" asChild>
                    <Button>
                      <Text>Sign in</Text>
                    </Button>
                  </Link>
                  <Link href="/(auth)/sign-up" asChild>
                    <Button variant="outline">
                      <Text>Create account</Text>
                    </Button>
                  </Link>
                </>
              )}
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
