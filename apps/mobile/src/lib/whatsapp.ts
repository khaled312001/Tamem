import * as Linking from 'expo-linking';

const TAMEM_WHATSAPP = process.env.EXPO_PUBLIC_TAMEM_WHATSAPP ?? '+201010254819';

interface OrderSummary {
  orderNumber: string;
  serviceNameAr: string;
  customerName: string;
  deliveryAddress?: string;
  notes?: string;
  estimatedPrice?: number;
}

export async function openWhatsAppConfirmation(summary: OrderSummary): Promise<boolean> {
  const lines = [
    `✓ تم استلام طلبك ${summary.orderNumber}`,
    ``,
    `الخدمة: ${summary.serviceNameAr}`,
    `الاسم: ${summary.customerName}`,
  ];
  if (summary.deliveryAddress) lines.push(`العنوان: ${summary.deliveryAddress}`);
  if (summary.notes) lines.push(`التفاصيل: ${summary.notes}`);
  if (summary.estimatedPrice !== undefined) {
    lines.push(`الإجمالي التقديري: ${summary.estimatedPrice} ج.م`);
  }
  lines.push('', 'سنتواصل معك قريباً.');

  const text = encodeURIComponent(lines.join('\n'));
  const phone = TAMEM_WHATSAPP.replace(/[^\d+]/g, '');
  const url = `whatsapp://send?phone=${phone}&text=${text}`;

  const can = await Linking.canOpenURL(url);
  if (!can) {
    // fallback to wa.me web URL
    return Linking.openURL(`https://wa.me/${phone.replace('+', '')}?text=${text}`)
      .then(() => true)
      .catch(() => false);
  }
  return Linking.openURL(url)
    .then(() => true)
    .catch(() => false);
}
