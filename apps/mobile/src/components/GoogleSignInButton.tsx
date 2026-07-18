/**
 * Google Sign-In — NATIVE account picker, no browser.
 *
 * This used to run through expo-auth-session, which hands off to a Custom Tab /
 * external browser: the user leaves the app, signs in on a web page and is
 * redirected back. Now it uses the Google Play Services sign-in sheet, so the
 * account chooser appears as a native dialog inside the app (the WhatsApp /
 * Instagram behaviour).
 *
 * The backend contract is unchanged: we still POST the Google `idToken` to
 * /auth/google, which verifies it with Google and issues our own JWTs. The
 * native token's `aud` is the WEB client id, which is exactly what the server
 * checks against GOOGLE_CLIENT_ID.
 *
 * NOTE: this is a native module, so it only works in a real build (EAS / APK),
 * not in Expo Go. On web it falls back to a disabled button.
 */
import {
  GoogleSignin,
  statusCodes,
  type NativeModuleError,
} from '@react-native-google-signin/google-signin';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAuth, type SignupRole } from '../stores/auth';
import { fontFamilies, fontSizes, radii, spacing } from '../theme/tokens';

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
  /** Called when sign-in fails (network/auth). Cancelling is silent. */
  onError?: (message: string) => void;
  /**
   * Pre-selected role to send to the backend. ONLY honored by the backend
   * when creating a brand-new user — returning users keep their existing role.
   */
  role?: SignupRole;
  /**
   * Called BEFORE the backend exchange, so the caller can show a role-choice
   * modal when no role was pre-selected. Return the chosen role, or null to
   * abort the sign-in.
   */
  onResolveRole?: () => Promise<SignupRole | null | undefined>;
}

// Read at module load — Expo inlines EXPO_PUBLIC_* at build time.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

// The native module needs the WEB client id (it is what the returned idToken is
// issued for). Web has no native sign-in sheet, so the button is disabled there.
const HAS_GOOGLE_CONFIG = Platform.OS !== 'web' && !!WEB_CLIENT_ID;

export function GoogleSignInButton(props: GoogleSignInButtonProps) {
  if (!HAS_GOOGLE_CONFIG) return <DisabledGoogleButton label={props.label} />;
  return <ConfiguredGoogleButton {...props} />;
}

function ConfiguredGoogleButton({ label, onError, role, onResolveRole }: GoogleSignInButtonProps) {
  const loginWithGoogle = useAuth((s) => s.loginWithGoogle);
  const [loading, setLoading] = useState(false);

  // Configure once. Cheap + idempotent; must run before signIn().
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      iosClientId: IOS_CLIENT_ID,
      // We only need identity — asking for the id token keeps the consent
      // screen to name/email/picture.
      scopes: ['profile', 'email'],
      offlineAccess: false,
    });
  }, []);

  const onPress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // Play Services is what renders the native sheet; without it there is no
      // in-app picker to show.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Always start from a clean slate so the account chooser actually appears
      // instead of silently reusing the last account.
      try {
        await GoogleSignin.signOut();
      } catch {
        /* nothing was signed in */
      }

      const result = await GoogleSignin.signIn();
      // v13 returns { type: 'success' | 'cancelled', data }.
      if (result.type === 'cancelled') {
        setLoading(false);
        return; // user dismissed the sheet — not an error
      }
      const idToken = result.data?.idToken;
      if (!idToken) {
        setLoading(false);
        onError?.('لم يتم استلام رمز التحقق من Google');
        return;
      }

      // Ask for a role only for brand-new users; returning users keep theirs.
      let effectiveRole: SignupRole | null | undefined = role;
      if (effectiveRole == null && onResolveRole) {
        effectiveRole = await onResolveRole();
        if (effectiveRole === null) {
          setLoading(false);
          return; // role chooser cancelled
        }
      }

      await loginWithGoogle(idToken, effectiveRole ?? undefined);
    } catch (err: unknown) {
      const e = err as NativeModuleError;
      // Cancels are normal user behaviour — never surface them as failures.
      if (e?.code === statusCodes.SIGN_IN_CANCELLED || e?.code === statusCodes.IN_PROGRESS) {
        setLoading(false);
        return;
      }
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        onError?.('خدمات Google Play غير متاحة على هذا الجهاز');
      } else {
        onError?.(err instanceof Error ? err.message : 'فشل تسجيل الدخول بـ Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed, loading && styles.disabled]}
    >
      <View style={styles.row}>
        <GoogleLogo size={20} />
        {loading ? (
          <ActivityIndicator size="small" color="#1f1f1f" style={styles.spinner} />
        ) : (
          <Text style={styles.label}>{label ?? 'الدخول بحساب جوجل'}</Text>
        )}
        <View style={styles.spacer} />
      </View>
    </Pressable>
  );
}

function DisabledGoogleButton({ label }: { label?: string }) {
  return (
    <Pressable disabled style={[styles.btn, styles.disabled]}>
      <View style={styles.row}>
        <GoogleLogo size={20} />
        <Text style={styles.label}>{label ?? 'الدخول بحساب جوجل'}</Text>
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
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 1px 2px rgba(60,64,67,0.30), 0 1px 3px 1px rgba(60,64,67,0.15)' }
      : { elevation: 1 }),
  },
  pressed: { backgroundColor: '#F7F8F8' },
  disabled: { opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 20 },
  spinner: { flex: 1 },
  label: {
    flex: 1,
    color: '#1F1F1F',
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.bodyExtraBold,
    textAlign: 'center',
  },
});
