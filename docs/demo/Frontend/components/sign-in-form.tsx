import { SocialConnections } from '@/components/social-connections';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useSignIn } from '@clerk/expo/legacy';
import { Link } from 'expo-router';
import * as React from 'react';
import { type TextInput, View } from 'react-native';

export function SignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const passwordInputRef = React.useRef<TextInput>(null);
  const [error, setError] = React.useState<{ email?: string; password?: string }>({});

  async function onSubmit() {
    if (!isLoaded) return;

    try {
      const signInAttempt = await signIn.create({
        identifier: email,
        password,
      });

      if (signInAttempt.status === 'complete') {
        setError({ email: '', password: '' });
        await setActive({ session: signInAttempt.createdSessionId });
        return;
      }
    } catch (err) {
      if (err instanceof Error) {
        const message = err.message;
        const isEmailMessage = message.toLowerCase().includes('identifier') || message.toLowerCase().includes('email');
        setError(isEmailMessage ? { email: message } : { password: message });
      }
    }
  }

  return (
    <View className="gap-6">
      <Card className="rounded-[28px] border-border/70 bg-card shadow-sm shadow-black/5">
        <CardHeader className="px-6 pt-8">
          <CardTitle className="text-center text-2xl sm:text-left">Sign in</CardTitle>
          <CardDescription className="text-center sm:text-left">
            Continue with your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-6 px-6 pb-8">
          <View className="gap-4">
            <View className="gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                onChangeText={setEmail}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                returnKeyType="next"
                submitBehavior="submit"
              />
              {error.email ? <Text className="text-sm font-medium text-destructive">{error.email}</Text> : null}
            </View>

            <View className="gap-1.5">
              <View className="flex-row items-center">
                <Label htmlFor="password">Password</Label>
                <Link asChild href={`/(auth)/forgot-password?email=${email}`}>
                  <Button variant="link" size="sm" className="ml-auto h-4 px-1 py-0 web:h-fit sm:h-4">
                    <Text className="font-normal leading-4">Forgot password?</Text>
                  </Button>
                </Link>
              </View>
              <Input
                ref={passwordInputRef}
                id="password"
                secureTextEntry
                onChangeText={setPassword}
                returnKeyType="send"
                onSubmitEditing={onSubmit}
              />
              {error.password ? <Text className="text-sm font-medium text-destructive">{error.password}</Text> : null}
            </View>

            <Button className="w-full" onPress={onSubmit}>
              <Text>Continue</Text>
            </Button>
          </View>

          <Text className="text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/(auth)/sign-up" className="text-sm underline underline-offset-4">
              Sign up
            </Link>
          </Text>

          <View className="flex-row items-center">
            <Separator className="flex-1" />
            <Text className="px-4 text-sm text-muted-foreground">or</Text>
            <Separator className="flex-1" />
          </View>

          <SocialConnections />
        </CardContent>
      </Card>
    </View>
  );
}
