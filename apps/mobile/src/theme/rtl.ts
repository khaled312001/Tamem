/**
 * RTL helpers. The app forces `I18nManager.forceRTL(true)` at startup so:
 *   - flexDirection: 'row' automatically draws right→left on native
 *   - the writing direction is right→left throughout
 *
 * But two things DON'T auto-flip and must be handled explicitly:
 *   1. SVG / lucide icons — they keep their visual direction
 *   2. RN-web's flex flipping is inconsistent across browsers
 *
 * Use these helpers everywhere a chevron or other directional glyph is shown.
 *
 * Conventions for Arabic RTL:
 *   - "Back"   → user comes FROM the right, so back-arrow points RIGHT  (→)
 *   - "Forward" / "Next" / "See more" → arrow points LEFT  (←)
 *   - Step progress reads right→left
 */
import { I18nManager, Platform } from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react-native';

// The app pins forceRTL(true) at boot. On web the rendering layer is LTR by
// default, so for icon-direction purposes we still treat the app as RTL.
export const isRTL: boolean = I18nManager.isRTL || Platform.OS === 'web';

/** Icon to use for a "go back" / "return to previous screen" affordance. */
export const BackChevron: LucideIcon = isRTL ? ChevronRight : ChevronLeft;

/** Icon to use for "forward" / "next" / "see more". */
export const ForwardChevron: LucideIcon = isRTL ? ChevronLeft : ChevronRight;

/** Full-size back arrow (for splash/onboarding/etc.). */
export const BackArrow: LucideIcon = isRTL ? ArrowRight : ArrowLeft;

/** Full-size forward arrow. */
export const ForwardArrow: LucideIcon = isRTL ? ArrowLeft : ArrowRight;

/** Pick a "start"-aligned style key — left in LTR, right in RTL. */
export function startEdge(): 'left' | 'right' {
  return isRTL ? 'right' : 'left';
}

/** Pick an "end"-aligned style key — right in LTR, left in RTL. */
export function endEdge(): 'left' | 'right' {
  return isRTL ? 'left' : 'right';
}
