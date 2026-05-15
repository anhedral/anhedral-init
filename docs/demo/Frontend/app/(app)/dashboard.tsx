import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { Stack } from 'expo-router';
import { CoinsIcon, CreditCardIcon, HardDriveUploadIcon, SparklesIcon } from 'lucide-react-native';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

export default function DashboardScreen() {
  const { account, loading, error, refresh } = useAccount();
  const subscription = useSubscription();

  const subscriptionLabel = React.useMemo(() => {
    if (subscription.isPaid) return 'RevenueCat Pro';
    if (subscription.isTrial) return `Trial • ${subscription.trialDaysRemaining} days left`;
    if (subscription.isRedeemed) return 'Promo access';
    if (subscription.canAccess) return 'Access active';
    return 'Free';
  }, [subscription.canAccess, subscription.isPaid, subscription.isRedeemed, subscription.isTrial, subscription.trialDaysRemaining]);

  const subscriptionStatus = React.useMemo(() => {
    if (subscription.isPaid || subscription.isRedeemed) {
      return subscription.cancelAtPeriodEnd ? 'Cancels at period end' : 'Active';
    }
    if (subscription.isTrial) return 'Trialing';
    return 'Setup required';
  }, [subscription.cancelAtPeriodEnd, subscription.isPaid, subscription.isRedeemed, subscription.isTrial]);

  const runSubscriptionAction = React.useCallback(async () => {
    if (subscription.managementUrl) {
      await subscription.manageSubscription();
      return;
    }

    await subscription.subscribe('monthly');
  }, [subscription]);

  return (
    <>
      <Stack.Screen
        options={{
          header: () => (
            <View className="top-safe flex-row items-center justify-between bg-background px-4 py-3">
              <ThemeToggle />
              <UserMenu />
            </View>
          ),
        }}
      />

      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="px-4 pb-10 pt-4 sm:px-6"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}>
        <View className="mx-auto w-full max-w-5xl gap-4">
          <Card className="rounded-[28px] border-border/70 bg-card">
            <CardHeader className="gap-4 px-6 pt-8 sm:px-8">
              <View className="flex-row items-center gap-2">
                <SparklesIcon size={18} color="currentColor" />
                <Text className="text-xs uppercase tracking-[3px] text-muted-foreground">Signed-in shell</Text>
              </View>
              <CardTitle className="text-left text-4xl leading-tight">
                {account?.displayName ? `Make ${account.displayName} yours.` : 'Make this app yours.'}
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-7">
                This screen is the production starter: subscription state, credits, and avatar upload are already in place so your team can move straight to product work.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-row flex-wrap gap-3 px-6 pb-8 sm:px-8">
              <Button onPress={() => void runSubscriptionAction()}>
                <Text>{subscription.managementUrl ? 'Manage subscription' : 'Unlock pro'}</Text>
              </Button>
              <Button variant="outline" onPress={() => void refresh()}>
                <Text>Refresh profile</Text>
              </Button>
            </CardContent>
          </Card>

          <View className="gap-3 sm:flex-row sm:flex-wrap">
            <Card className="flex-1 rounded-[24px] border-border/70 bg-card sm:min-w-[240px]">
              <CardHeader className="px-5 pt-5">
                <View className="mb-2 size-11 items-center justify-center rounded-2xl bg-muted">
                  <CreditCardIcon size={20} color="currentColor" />
                </View>
                <CardTitle className="text-left text-xl">{subscriptionLabel}</CardTitle>
              </CardHeader>
              <CardContent className="gap-2 px-5 pb-5">
                <Text className="text-sm text-muted-foreground">{subscriptionStatus}</Text>
                {subscription.expiresAt ? (
                  <Text className="text-sm text-muted-foreground">Access until {new Date(subscription.expiresAt).toLocaleDateString()}</Text>
                ) : null}
              </CardContent>
            </Card>

            <Card className="flex-1 rounded-[24px] border-border/70 bg-card sm:min-w-[240px]">
              <CardHeader className="px-5 pt-5">
                <View className="mb-2 size-11 items-center justify-center rounded-2xl bg-muted">
                  <CoinsIcon size={20} color="currentColor" />
                </View>
                <CardTitle className="text-left text-xl">{account?.creditsBalance ?? 250} credits</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <Text className="text-sm leading-6 text-muted-foreground">
                  Credits are seeded in the backend user record so you can connect real usage accounting later without redesigning the shell.
                </Text>
              </CardContent>
            </Card>

            <Card className="flex-1 rounded-[24px] border-border/70 bg-card sm:min-w-[240px]">
              <CardHeader className="px-5 pt-5">
                <View className="mb-2 size-11 items-center justify-center rounded-2xl bg-muted">
                  <HardDriveUploadIcon size={20} color="currentColor" />
                </View>
                <CardTitle className="text-left text-xl">Avatar upload</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <Text className="text-sm leading-6 text-muted-foreground">
                  The header menu uploads profile photos into R2 and swaps the avatar immediately when the upload returns.
                </Text>
              </CardContent>
            </Card>
          </View>

          {error ? (
            <Card className="rounded-[24px] border-amber-300/60 bg-amber-50 dark:bg-amber-500/10">
              <CardContent className="px-5 py-5">
                <Text className="text-sm leading-6 text-amber-900 dark:text-amber-100">
                  Backend profile data is not ready yet: {error}
                </Text>
              </CardContent>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
