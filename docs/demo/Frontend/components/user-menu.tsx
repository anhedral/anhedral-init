import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@clerk/expo';
import type { TriggerRef } from '@rn-primitives/popover';
import { CreditCardIcon, LogOutIcon, UserIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

export function UserMenu() {
  const { signOut } = useAuth();
  const { account } = useAccount();
  const subscription = useSubscription();
  const popoverTriggerRef = React.useRef<TriggerRef>(null);

  async function onSignOut() {
    popoverTriggerRef.current?.close();
    await signOut();
  }

  async function onSubscriptionAction() {
    popoverTriggerRef.current?.close();
    if (subscription.managementUrl) {
      await subscription.manageSubscription();
      return;
    }

    await subscription.subscribe('monthly');
  }

  return (
    <Popover>
      <PopoverTrigger asChild ref={popoverTriggerRef}>
        <Button variant="ghost" size="sm">
          <Icon as={UserIcon} className="size-4" />
          <Text>Account</Text>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" className="w-72 gap-0 p-0">
        <View className="gap-1 border-b border-border p-4">
          <Text className="font-medium">{account?.displayName ?? 'Account'}</Text>
          <Text className="text-sm text-muted-foreground">{account?.email ?? 'Loading account...'}</Text>
        </View>

        <View className="gap-2 p-3">
          <Button variant="outline" onPress={() => void onSubscriptionAction()}>
            <Icon as={CreditCardIcon} className="size-4" />
            <Text>{subscription.managementUrl ? 'Manage subscription' : 'Open paywall'}</Text>
          </Button>

          <Button variant="outline" onPress={() => void onSignOut()}>
            <Icon as={LogOutIcon} className="size-4" />
            <Text>Sign out</Text>
          </Button>
        </View>
      </PopoverContent>
    </Popover>
  );
}
