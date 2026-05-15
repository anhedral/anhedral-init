import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAuth } from '@clerk/expo';
import { Link } from 'expo-router';
import { CloudIcon, CreditCardIcon, ShieldCheckIcon, DatabaseIcon } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

const FEATURES = [
  {
    title: 'Landing page here',
    description: 'Replace this placeholder copy with the actual acquisition story for your Expo app.',
    icon: CloudIcon,
  },
  {
    title: 'Clerk custom auth',
    description: 'Custom sign-in and sign-up screens are already wired into the Expo starter.',
    icon: ShieldCheckIcon,
  },
  {
    title: 'RevenueCat subscriptions',
    description: 'The signed-in shell already knows how to open a RevenueCat paywall and management flow.',
    icon: CreditCardIcon,
  },
  {
    title: 'Neon + Drizzle + R2',
    description: 'Backend routes for profile data, credits, and avatar upload are scaffolded for you.',
    icon: DatabaseIcon,
  },
];

export default function LandingScreen() {
  const { isSignedIn } = useAuth();

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="min-h-full px-4 pb-10 pt-6 sm:px-6">
      <View className="mx-auto flex w-full max-w-5xl gap-6">
        <View className="flex-row items-center justify-between rounded-[28px] border border-border/70 bg-card px-4 py-3">
          <View>
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">anhedral crossplatform</Text>
            <Text className="mt-1 text-lg font-semibold">demo</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <ThemeToggle />
            {isSignedIn ? (
              <Link href="/(app)/dashboard" asChild>
                <Button size="sm">
                  <Text>Open dashboard</Text>
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/(auth)/sign-in" asChild>
                  <Button size="sm" variant="ghost">
                    <Text>Sign in</Text>
                  </Button>
                </Link>
                <Link href="/(auth)/sign-up" asChild>
                  <Button size="sm">
                    <Text>Get started</Text>
                  </Button>
                </Link>
              </>
            )}
          </View>
        </View>

        <Card className="rounded-[32px] border-border/70 bg-card">
          <CardHeader className="gap-4 px-6 pt-8 sm:px-8">
            <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Starter shell</Text>
            <CardTitle className="text-left text-4xl leading-tight sm:text-5xl">
              Landing page here. Replace the story, keep the plumbing.
            </CardTitle>
            <CardDescription className="max-w-3xl text-base leading-7">
              This crossplatform starter already gives you a real auth flow, a protected dashboard, RevenueCat subscription plumbing, seeded credits, and avatar upload to R2.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3 px-6 pb-8 sm:px-8">
            {isSignedIn ? (
              <Link href="/(app)/dashboard" asChild>
                <Button className="self-start">
                  <Text>Continue to the app</Text>
                </Button>
              </Link>
            ) : (
              <Link href="/(auth)/sign-up" asChild>
                <Button className="self-start">
                  <Text>Create an account</Text>
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <View className="gap-3 sm:flex-row sm:flex-wrap">
          {FEATURES.map(({ title, description, icon: Icon }) => (
            <Card key={title} className="flex-1 rounded-[24px] border-border/70 bg-card sm:min-w-[240px]">
              <CardHeader className="px-5 pt-5">
                <View className="mb-2 size-11 items-center justify-center rounded-2xl bg-muted">
                  <Icon size={20} color="currentColor" />
                </View>
                <CardTitle className="text-left text-xl">{title}</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <Text className="text-sm leading-6 text-muted-foreground">{description}</Text>
              </CardContent>
            </Card>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
