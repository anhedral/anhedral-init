import * as ImagePicker from 'expo-image-picker';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Text } from '@/components/ui/text';
import { useAccount } from '@/hooks/useAccount';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@clerk/expo';
import type { TriggerRef } from '@rn-primitives/popover';
import { CameraIcon, CreditCardIcon, CoinsIcon, LoaderCircleIcon, LogOutIcon } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Platform, View } from 'react-native';

function showNotice(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

export function UserMenu() {
  const { signOut } = useAuth();
  const { account, refresh, uploadAvatar } = useAccount();
  const subscription = useSubscription();
  const popoverTriggerRef = React.useRef<TriggerRef>(null);
  const [uploading, setUploading] = React.useState(false);

  const subscriptionLabel = subscription.isPaid
    ? 'RevenueCat Pro'
    : subscription.isTrial
      ? 'Trial'
      : subscription.isRedeemed
        ? 'Promo'
        : 'Free';

  async function onSignOut() {
    popoverTriggerRef.current?.close();
    await signOut();
  }

  async function onUploadAvatar() {
    popoverTriggerRef.current?.close();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showNotice('Permission required', 'Allow photo library access to upload an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      showNotice('Upload failed', 'Could not read the selected image.');
      return;
    }

    setUploading(true);
    try {
      await uploadAvatar({
        base64: asset.base64,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? 'avatar.jpg',
      });
      await refresh();
      showNotice('Avatar updated', 'Your profile photo is now stored in R2.');
    } catch (err) {
      showNotice('Upload failed', err instanceof Error ? err.message : 'Avatar upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function onSubscriptionAction() {
    popoverTriggerRef.current?.close();
    if (subscription.managementUrl) {
      await subscription.manageSubscription();
      return;
    }

    await subscription.subscribe('monthly');
  }

  const avatarSource = account?.avatarUrl || account?.imageUrl;
  const userName = account?.displayName || account?.email || 'Builder';
  const initials = userName
    .split(' ')
    .map((name) => name[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Popover>
      <PopoverTrigger asChild ref={popoverTriggerRef}>
        <Button variant="ghost" size="icon" className="size-9 rounded-full">
          <Avatar className="size-9" alt={userName}>
            <AvatarImage source={avatarSource ? { uri: avatarSource } : undefined} />
            <AvatarFallback>
              <Text>{initials}</Text>
            </AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" className="w-80 gap-0 p-0">
        <View className="gap-4 border-b border-border p-4">
          <View className="flex-row items-center gap-3">
            <Avatar className="size-12" alt={userName}>
              <AvatarImage source={avatarSource ? { uri: avatarSource } : undefined} />
              <AvatarFallback>
                <Text>{initials}</Text>
              </AvatarFallback>
            </Avatar>
            <View className="flex-1">
              <Text className="font-medium leading-5">{userName}</Text>
              <Text className="text-sm text-muted-foreground">{account?.email ?? 'Loading account...'}</Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl border border-border bg-muted/40 p-3">
              <View className="flex-row items-center gap-2">
                <CreditCardIcon size={16} color="currentColor" />
                <Text className="text-xs uppercase tracking-[2px] text-muted-foreground">Subscription</Text>
              </View>
              <Text className="mt-3 font-semibold">{subscriptionLabel}</Text>
              <Text className="text-sm text-muted-foreground">
                {subscription.isTrial ? `${subscription.trialDaysRemaining} days left` : (account?.subscriptionStatus ?? 'active')}
              </Text>
            </View>

            <View className="flex-1 rounded-2xl border border-border bg-muted/40 p-3">
              <View className="flex-row items-center gap-2">
                <CoinsIcon size={16} color="currentColor" />
                <Text className="text-xs uppercase tracking-[2px] text-muted-foreground">Credits</Text>
              </View>
              <Text className="mt-3 font-semibold">{account?.creditsBalance ?? 250}</Text>
              <Text className="text-sm text-muted-foreground">Starter balance</Text>
            </View>
          </View>
        </View>

        <View className="gap-2 p-3">
          <Button variant="outline" onPress={() => void onSubscriptionAction()}>
            <Icon as={CreditCardIcon} className="size-4" />
            <Text>{subscription.managementUrl ? 'Manage subscription' : 'Open paywall'}</Text>
          </Button>

          <Button variant="outline" onPress={() => void onUploadAvatar()} disabled={uploading}>
            <Icon as={uploading ? LoaderCircleIcon : CameraIcon} className={uploading ? 'size-4 animate-spin' : 'size-4'} />
            <Text>{uploading ? 'Uploading avatar...' : 'Upload avatar to R2'}</Text>
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
