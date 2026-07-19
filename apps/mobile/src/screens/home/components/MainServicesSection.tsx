/**
 * The three headline service cards in one equal-width row.
 *
 * A plain row (not a FlatList) because the count is fixed at three and the
 * design needs them to share the width exactly — a horizontal list would size
 * each card to its content instead.
 *
 * Which services appear, and where each one navigates, still comes from the
 * caller (home-config `visibleServiceKeys` → the existing SERVICES list), so
 * the admin can keep hiding a service from the dashboard.
 */
import type { LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../theme/tokens';
import { SERVICE_CARD_COPY, SERVICE_IMAGE, SERVICE_THEME, type ServiceKey } from '../homeData';

import { ServiceCard } from './ServiceCard';

// React Native already lays `flexDirection: 'row'` out right-to-left when
// I18nManager RTL is on. Adding 'row-reverse' on top of that flips it a
// SECOND time, back to left-to-right — which is why the header rendered
// mirrored. Plain 'row' is correct on native; the web build gets its
// direction from the document's dir="rtl".
const ROW = 'row' as const;

export interface HomeServiceItem {
  key: ServiceKey;
  Icon: LucideIcon;
  onPress: () => void;
}

interface Props {
  services: HomeServiceItem[];
}

function MainServicesSectionBase({ services }: Props) {
  if (!services.length) return null;
  return (
    <View style={[styles.row, { flexDirection: ROW }]}>
      {services.map((s) => {
        const copy = SERVICE_CARD_COPY[s.key];
        const theme = SERVICE_THEME[s.key];
        return (
          <ServiceCard
            key={s.key}
            title={copy.title}
            subtitle={copy.subtitle}
            Icon={s.Icon}
            image={SERVICE_IMAGE[s.key]}
            bg={theme.bg}
            fg={theme.fg}
            onPress={s.onPress}
          />
        );
      })}
    </View>
  );
}

export const MainServicesSection = memo(MainServicesSectionBase);

const styles = StyleSheet.create({
  row: { gap: spacing.md },
});
