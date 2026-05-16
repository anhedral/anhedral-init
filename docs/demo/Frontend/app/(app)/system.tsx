import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { Stack } from 'expo-router';
import { CheckCircleIcon, CircleAlertIcon, CreditCardIcon, DatabaseIcon } from 'lucide-react-native';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

export default function SystemScreen() {
  const { account, loading, error, refresh } = useAccount();
  const subscription = useSubscription();

  const subscriptionLabel = React.useMemo(() => {
    if (subscription.isPaid) return 'Paid';
    if (subscription.isTrial) return `Trial, ${subscription.trialDaysRemaining} days left`;
    if (subscription.isRedeemed) return 'Redeemed';
    if (subscription.canAccess) return 'Active';
    return 'Inactive';
  }, [subscription.canAccess, subscription.isPaid, subscription.isRedeemed, subscription.isTrial, subscription.trialDaysRemaining]);

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
        <View className="mx-auto w-full max-w-3xl gap-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-left text-2xl">System status</CardTitle>
            </CardHeader>
            <CardContent className="flex-row flex-wrap gap-2">
              <Button onPress={() => void runSubscriptionAction()}>
                <Text>{subscription.managementUrl ? 'Manage subscription' : 'Open paywall'}</Text>
              </Button>
              <Button variant="outline" onPress={() => void refresh()}>
                <Text>Refresh</Text>
              </Button>
            </CardContent>
          </Card>

          <View className="gap-3">
            <Card className="border-border bg-card">
              <CardHeader>
                <View className="flex-row items-center gap-2">
                  {account ? <CheckCircleIcon size={18} color="currentColor" /> : <CircleAlertIcon size={18} color="currentColor" />}
                  <CardTitle className="text-left text-lg">Authenticated API</CardTitle>
                </View>
              </CardHeader>
              <CardContent className="gap-1">
                <Text className="text-sm text-muted-foreground">{account ? 'Connected' : loading ? 'Loading' : 'Unavailable'}</Text>
                {account ? <Text>{account.email}</Text> : null}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <View className="flex-row items-center gap-2">
                  <CreditCardIcon size={18} color="currentColor" />
                  <CardTitle className="text-left text-lg">Subscription entitlement</CardTitle>
                </View>
              </CardHeader>
              <CardContent className="gap-1">
                <Text>{subscriptionLabel}</Text>
                {subscription.expiresAt ? <Text className="text-sm text-muted-foreground">Expires {new Date(subscription.expiresAt).toLocaleDateString()}</Text> : null}
                {subscription.cancelAtPeriodEnd ? <Text className="text-sm text-muted-foreground">Cancels at period end</Text> : null}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <View className="flex-row items-center gap-2">
                  <DatabaseIcon size={18} color="currentColor" />
                  <CardTitle className="text-left text-lg">Database record</CardTitle>
                </View>
              </CardHeader>
              <CardContent className="gap-1">
                <Text>{account?.id ?? 'Not loaded'}</Text>
                <Text className="text-sm text-muted-foreground">Use this route as the starting point for your product data.</Text>
              </CardContent>
            </Card>
          </View>

          {error ? (
            <Card className="rounded-[24px] border-amber-300/60 bg-amber-50 dark:bg-amber-500/10">
              <CardContent className="px-5 py-5">
                <Text className="text-sm leading-6 text-amber-900 dark:text-amber-100">
                  API error: {error}
                </Text>
              </CardContent>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}
