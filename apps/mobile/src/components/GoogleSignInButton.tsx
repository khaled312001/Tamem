import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { api } from '../lib/api';
import { useAuth } from '../stores/auth';
import { fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

WebBrowser.maybeCompleteAuthSession();

// Official Google 4-color "G" logo (Google branding guidelines)
function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
}

interface GoogleSignInButtonProps {
  /** Override the default label */
  label?: string;
  /** Called when sign-in fails (network/cancel/auth). */
  onError?: (message: string) => void;
}

/**
 * Official Google Sign-In button — follows Google's branding guidelines:
 * white background, 1px gray border, 4-color "G" logo on the right (RTL),
 * "تسجيل الدخول بحساب جوجل" label centered.
 */
export function GoogleSignInButton({ label, onError }: GoogleSignInButtonProps) {
  const setSession = useAuth((s) => s.setSession);
  const [loading, setLoading] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: ['profile', 'email', 'openid'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.authentication?.idToken;
      const accessToken = response.authentication?.accessToken;
      if (!idToken && !accessToken) {
        setLoading(false);
        onError?.('لم يتم استلام رمز التحقق من Google');
        return;
      }
      // Exchange with our backend
      void exchangeWithBackend(idToken, accessToken);
    } else if (response?.type === 'error') {
      setLoading(false);
      onError?.(response.error?.message ?? 'فشل تسجيل الدخول بـ Google');
    } else if (response?.type === 'dismiss' || response?.type === 'cancel') {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  async function exchangeWithBackend(idToken?: string, accessToken?: string) {
    try {
      const res = await api.raw.post('/auth/google', {
        idToken: idToken ?? accessToken,
      });
      const { user, tokens } = res.data.data;
      await setSession(user, tokens);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل ربط حساب Google بالسيرفر';
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  const onPress = async () => {
    if (!request) {
      onError?.('Google OAuth غير مهيأ — تحقق من EXPO_PUBLIC_GOOGLE_CLIENT_ID');
      return;
    }
    setLoading(true);
    try {
      await promptAsync();
    } catch (err: unknown) {
      setLoading(false);
      onError?.(err instanceof Error ? err.message : 'تعذّر فتح نافذة Google');
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={loading || !request}
      style={({ pressed }) => [
        styles.btn,
        pressed && styles.pressed,
        (loading || !request) && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        <GoogleLogo size={20} />
        {loading ? (
          <ActivityIndicator size="small" color="#1f1f1f" style={styles.spinner} />
        ) : (
          <Text style={styles.label}>{label ?? 'الدخول بحساب جوجل'}</Text>
        )}
        {/* spacer to keep the label visually centered when the logo is on the side */}
        <View style={styles.spacer} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    justifyContent: 'center',
    // Subtle official-style elevation
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 1px 2px rgba(60,64,67,0.30), 0 1px 3px 1px rgba(60,64,67,0.15)' }
      : { elevation: 1 }),
  },
  pressed: { backgroundColor: '#F7F8F8' },
  disabled: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spacer: { width: 20 }, // matches logo width — keeps text optically centered
  spinner: { flex: 1 },
  label: {
    flex: 1,
    color: '#1F1F1F',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'center',
  },
});
