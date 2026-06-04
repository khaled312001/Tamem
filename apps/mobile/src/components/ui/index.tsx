/**
 * Tamem design-system primitives.
 *
 * Every component here is RTL-correct by default. Chevrons go through
 * `BackChevron`/`ForwardChevron` from theme/rtl so they always point the way
 * the user is travelling. Rows use `flexDirection: 'row'` which auto-flips
 * under I18nManager.forceRTL on native.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type ViewStyle,
} from 'react-native';

import { colors, fontFamilies, fontSizes, radii, shadows, spacing } from '../../theme/tokens';
import { ForwardChevron } from '../../theme/rtl';

// ════════════════════════════════════════════════════════════════════════════
// Card
// ════════════════════════════════════════════════════════════════════════════

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padding?: keyof typeof spacing | 0;
  style?: ViewStyle;
  elevation?: keyof typeof shadows;
}

export function Card({ children, onPress, padding = 'md', style, elevation = 'sm' }: CardProps) {
  const computedPad = padding === 0 ? 0 : spacing[padding];
  const card = (
    <View style={[styles.card, { padding: computedPad }, shadows[elevation] as ViewStyle, style]}>
      {children}
    </View>
  );
  if (!onPress) return card;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {card}
    </Pressable>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SectionHeader — labeled list group with optional "see all" CTA
// ════════════════════════════════════════════════════════════════════════════

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  compact,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.sectionHeader, compact && { marginTop: spacing.md }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {actionLabel && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.sectionAction, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <ForwardChevron size={14} color={colors.brand.red} />
        </Pressable>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Chip — pill used for tags, filters, category strip
// ════════════════════════════════════════════════════════════════════════════

export function Chip({
  label,
  Icon,
  active,
  onPress,
  tint,
  size = 'md',
}: {
  label: string;
  Icon?: LucideIcon;
  active?: boolean;
  onPress?: () => void;
  tint?: string;
  size?: 'sm' | 'md';
}) {
  const bg = active ? colors.brand.red : (tint ?? colors.white);
  const fg = active ? colors.white : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        size === 'sm' && styles.chipSm,
        { backgroundColor: bg, borderColor: active ? colors.brand.red : colors.line },
        pressed && { opacity: 0.85 },
      ]}
    >
      {Icon && <Icon size={size === 'sm' ? 12 : 14} color={fg} />}
      <Text style={[styles.chipText, size === 'sm' && { fontSize: fontSizes.xs }, { color: fg }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// StatusPill — small status badge with optional dot
// ════════════════════════════════════════════════════════════════════════════

export function StatusPill({
  label,
  color = colors.brand.red,
  tint,
  dot,
}: {
  label: string;
  color?: string;
  tint?: string;
  dot?: boolean;
}) {
  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: tint ?? color + '18', borderColor: color + '40' },
      ]}
    >
      {dot && <View style={[styles.statusDot, { backgroundColor: color }]} />}
      <Text style={[styles.statusPillText, { color }]}>{label}</Text>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Buttons — PrimaryButton (gradient), SecondaryButton (outline), GhostButton
// ════════════════════════════════════════════════════════════════════════════

interface ButtonProps {
  label: string;
  onPress?: () => void;
  Icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({
  label,
  onPress,
  Icon,
  loading,
  disabled,
  full = true,
  style,
  variant = 'brand',
}: ButtonProps & { variant?: 'brand' | 'gold' | 'dark' }) {
  const gradient = (variant === 'gold'
    ? ['#F2A93B', '#EC7A2C']
    : variant === 'dark'
      ? ['#241310', '#3B1E16']
      : ['#E0301E', '#EC7A2C']) as unknown as readonly [string, string, ...string[]];
  const shadow =
    variant === 'gold' ? shadows.gold : variant === 'dark' ? shadows.lg : shadows.brand;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        full && { width: '100%' },
        styles.btnWrap,
        shadow as ViewStyle,
        (pressed || disabled) && { opacity: 0.85 },
        style,
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.btnInner}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <>
            {Icon && <Icon size={18} color={colors.white} />}
            <Text style={styles.btnText}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  Icon,
  loading,
  disabled,
  full = true,
  style,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        full && { width: '100%' },
        styles.secondaryBtn,
        (pressed || disabled) && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.brand.red} />
      ) : (
        <>
          {Icon && <Icon size={18} color={colors.brand.red} />}
          <Text style={styles.secondaryBtnText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  Icon,
  disabled,
  style,
  tone = 'brand',
}: ButtonProps & { tone?: 'brand' | 'neutral' | 'danger' }) {
  const color =
    tone === 'danger' ? colors.danger : tone === 'neutral' ? colors.ink : colors.brand.red;
  const bg =
    tone === 'danger'
      ? colors.dangerLight
      : tone === 'neutral'
        ? colors.surface
        : colors.brand.redLight;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghostBtn,
        { backgroundColor: bg },
        (pressed || disabled) && { opacity: 0.8 },
        style,
      ]}
    >
      {Icon && <Icon size={16} color={color} />}
      <Text style={[styles.ghostBtnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ListItem — row with icon + label + chevron, used in Profile / Settings
// ════════════════════════════════════════════════════════════════════════════

export function ListItem({
  label,
  sublabel,
  Icon,
  trailing,
  onPress,
  destructive,
}: {
  label: string;
  sublabel?: string;
  Icon?: LucideIcon;
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? colors.danger : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.listItem, pressed && { opacity: 0.85 }]}
    >
      {Icon && (
        <View style={[styles.listItemIcon, destructive && { backgroundColor: colors.dangerLight }]}>
          <Icon size={18} color={destructive ? colors.danger : colors.brand.red} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.listItemLabel, { color }]}>{label}</Text>
        {sublabel && <Text style={styles.listItemSub}>{sublabel}</Text>}
      </View>
      {trailing ?? (onPress && <ForwardChevron size={16} color={colors.text.muted} />)}
    </Pressable>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Divider — subtle horizontal line
// ════════════════════════════════════════════════════════════════════════════

export function Divider({ inset }: { inset?: boolean }) {
  return <View style={[styles.divider, inset && { marginHorizontal: spacing.lg }]} />;
}

// ════════════════════════════════════════════════════════════════════════════
// EmptyState — friendly fallback for empty / error / no-results
// ════════════════════════════════════════════════════════════════════════════

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      {icon && <View style={styles.emptyIcon}>{icon}</View>}
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <View style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MerchantCard — horizontal restaurant/store card with image + meta
// ════════════════════════════════════════════════════════════════════════════

export interface MerchantCardProps {
  name: string;
  category?: string;
  rating?: number | null;
  deliveryMinutes?: string;
  deliveryFee?: string;
  imageUri?: string;
  imageSource?: ImageSourcePropType;
  isOpen?: boolean;
  promoLabel?: string;
  onPress?: () => void;
  variant?: 'large' | 'compact';
}

export function MerchantCard(props: MerchantCardProps) {
  const variant = props.variant ?? 'large';
  const image = props.imageUri ? { uri: props.imageUri } : props.imageSource;
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.merchantCard,
        variant === 'compact' && styles.merchantCardCompact,
        shadows.sm as ViewStyle,
        pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
      ]}
    >
      <View style={[styles.merchantImage, variant === 'compact' && styles.merchantImageCompact]}>
        {image ? (
          <Image source={image} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[colors.brand.orange, colors.brand.red]}
            style={StyleSheet.absoluteFill}
          />
        )}
        {props.promoLabel && (
          <View style={styles.promoTag}>
            <Text style={styles.promoTagText}>{props.promoLabel}</Text>
          </View>
        )}
        {props.isOpen === false && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedText}>مغلق حالياً</Text>
          </View>
        )}
      </View>
      <View style={styles.merchantBody}>
        <Text style={styles.merchantName} numberOfLines={1}>
          {props.name}
        </Text>
        {props.category && (
          <Text style={styles.merchantCategory} numberOfLines={1}>
            {props.category}
          </Text>
        )}
        <View style={styles.merchantMetaRow}>
          {props.rating != null && (
            <View style={styles.merchantMeta}>
              <Text style={styles.metaStar}>★</Text>
              <Text style={styles.merchantMetaText}>{Number(props.rating).toFixed(1)}</Text>
            </View>
          )}
          {props.deliveryMinutes && (
            <View style={styles.merchantMeta}>
              <Text style={styles.merchantMetaIcon}>⏱</Text>
              <Text style={styles.merchantMetaText}>{props.deliveryMinutes}</Text>
            </View>
          )}
          {props.deliveryFee && (
            <View style={styles.merchantMeta}>
              <Text style={styles.merchantMetaIcon}>🛵</Text>
              <Text style={styles.merchantMetaText}>{props.deliveryFee}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ServiceTile — square category/service entry on home + service pickers
// ════════════════════════════════════════════════════════════════════════════

export function ServiceTile({
  label,
  sublabel,
  Icon,
  gradient,
  tint,
  onPress,
}: {
  label: string;
  sublabel?: string;
  Icon: LucideIcon;
  gradient?: readonly [string, string, ...string[]];
  tint?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceTile,
        pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
      ]}
    >
      {gradient ? (
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.serviceIconLg}
        >
          <Icon size={26} color={colors.white} />
        </LinearGradient>
      ) : (
        <View style={[styles.serviceIconLg, { backgroundColor: tint ?? colors.brand.redLight }]}>
          <Icon size={26} color={colors.brand.red} />
        </View>
      )}
      <Text style={styles.serviceLabel}>{label}</Text>
      {sublabel && <Text style={styles.serviceSub}>{sublabel}</Text>}
    </Pressable>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Re-exports + skeletons
// ════════════════════════════════════════════════════════════════════════════

export { Skeleton, CardListSkeleton } from '../Skeleton';
export { AnimatedListItem } from '../AnimatedListItem';
export { ForwardChevron, BackChevron } from '../../theme/rtl';

// New design-system primitives (added in Phase 1 design pass).
// Coexist with the legacy PrimaryButton/SecondaryButton/GhostButton — the new
// `Button` exposes a unified `variant` prop and animated press scale, and is
// the preferred API for new screens.
export { Avatar } from './Avatar';
export type { AvatarProps } from './Avatar';

export { Badge } from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';

export { BottomSheet } from './BottomSheet';
export type { BottomSheetProps } from './BottomSheet';

export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export { MoneyText } from './MoneyText';
export type { MoneyTextProps } from './MoneyText';

export { OrderTimeline } from './OrderTimeline';
export type { OrderTimelineProps, TimelineStage } from './OrderTimeline';

export { Rating } from './Rating';
export type { RatingProps } from './Rating';

export { SearchBar } from './SearchBar';
export type { SearchBarProps } from './SearchBar';

export { Stat } from './Stat';
export type { StatProps } from './Stat';

export { StickyBar } from './StickyBar';
export type { StickyBarProps } from './StickyBar';

export { Tag } from './Tag';
export type { TagProps } from './Tag';

export function MerchantSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.merchantCard,
            shadows.sm as ViewStyle,
            { marginBottom: spacing.md, opacity: 0.6 },
          ]}
        >
          <View style={[styles.merchantImage, { backgroundColor: colors.line }]} />
          <View style={styles.merchantBody}>
            <View
              style={{ height: 14, width: '60%', backgroundColor: colors.line, borderRadius: 4 }}
            />
            <View
              style={{
                height: 10,
                width: '40%',
                backgroundColor: colors.line2,
                borderRadius: 4,
                marginTop: 6,
              }}
            />
            <View
              style={{
                height: 10,
                width: '70%',
                backgroundColor: colors.line2,
                borderRadius: 4,
                marginTop: 10,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderColor: colors.line,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  sectionSubtitle: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  sectionActionText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  // Chip
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipSm: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  chipText: { fontSize: fontSizes.sm, fontFamily: fontFamilies.bodyExtraBold },
  // Status pill — stronger visual prominence (border + bolder text)
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.headingBold,
  },
  // Buttons
  btnWrap: { borderRadius: radii.lg, overflow: 'hidden' },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  btnText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.brand.red,
  },
  secondaryBtnText: {
    color: colors.brand.red,
    fontFamily: fontFamilies.headingBold,
    fontSize: fontSizes.md,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  ghostBtnText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
  },
  // List item
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  listItemIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.brand.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItemLabel: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyBold,
    color: colors.ink,
  },
  listItemSub: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBold,
    color: colors.ink,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: fontSizes.sm,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 22,
  },
  // Merchant card
  merchantCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  merchantCardCompact: { flexDirection: 'row' },
  merchantImage: {
    width: '100%',
    height: 160,
    backgroundColor: colors.soft,
    position: 'relative',
  },
  merchantImageCompact: { width: 112, height: 112 },
  merchantBody: { padding: spacing.md, flex: 1 },
  merchantName: {
    fontSize: fontSizes.md,
    fontFamily: fontFamilies.headingBlack,
    color: colors.ink,
  },
  merchantCategory: {
    fontSize: fontSizes.xs,
    color: colors.text.muted,
    fontFamily: fontFamilies.body,
    marginTop: 2,
  },
  merchantMetaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  merchantMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  merchantMetaText: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyExtraBold,
    color: colors.ink,
  },
  metaStar: { color: colors.brand.gold, fontSize: 12 },
  merchantMetaIcon: { fontSize: 12 },
  promoTag: {
    position: 'absolute',
    top: spacing.sm,
    end: spacing.sm,
    backgroundColor: colors.brand.red,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  promoTagText: {
    color: colors.white,
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
  },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(36,19,16,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedText: {
    color: colors.white,
    fontFamily: fontFamilies.headingBlack,
    fontSize: fontSizes.md,
    letterSpacing: 1,
  },
  // Service tile
  serviceTile: {
    flex: 1,
    minWidth: 96,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 6,
  },
  serviceIconLg: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  serviceSub: {
    fontFamily: fontFamilies.body,
    fontSize: 10,
    color: colors.text.muted,
  },
});
