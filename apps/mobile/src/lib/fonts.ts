import {
  Cairo_400Regular,
  Cairo_700Bold,
  Cairo_800ExtraBold,
  Cairo_900Black,
} from '@expo-google-fonts/cairo';
import {
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
  Tajawal_800ExtraBold,
} from '@expo-google-fonts/tajawal';
import { useFonts } from 'expo-font';

/**
 * Loads Tamem brand fonts (Cairo for headings, Tajawal for body text).
 * Returns true once all fonts are ready. Hide splash screen after.
 */
export function useBrandFonts(): boolean {
  const [loaded] = useFonts({
    Cairo_400Regular,
    Cairo_700Bold,
    Cairo_800ExtraBold,
    Cairo_900Black,
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    Tajawal_800ExtraBold,
  });
  return loaded;
}
