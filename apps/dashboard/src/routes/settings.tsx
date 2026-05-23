import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button.js';
import { Field, Input } from '../components/ui/Input.js';
import { CardSkeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const SETTING_LABELS: Record<string, string> = {
  driver_cash_limit: 'حد الكاش الأقصى للسائق (ج.م)',
  order_pending_alert_minutes: 'دقائق التنبيه على الطلب المعلق',
  driver_idle_alert_minutes: 'دقائق التنبيه على السائق الخامل',
  whatsapp_business_number: 'رقم WhatsApp الرسمي',
  cancellation_window_minutes: 'مهلة إلغاء العميل (دقيقة)',
  service_areas: 'مناطق الخدمة (JSON)',
};

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.adminListSettings() as Promise<Row[]>,
  });

  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      const map: Record<string, string> = {};
      for (const s of settings) {
        map[s.key] = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
      }
      setDraft(map);
    }
  }, [settings]);

  const mut = useMutation({
    mutationFn: ({ key, raw }: { key: string; raw: string }) => {
      // Try to parse as JSON, otherwise pass raw string
      let value: unknown = raw;
      try {
        value = JSON.parse(raw);
      } catch {
        // keep raw
      }
      return api.adminUpsertSetting(key, value);
    },
    onSuccess: () => {
      toast.success('تم الحفظ');
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <CardSkeleton />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-brand-dark">الإعدادات</h1>
      <div className="bg-white rounded-xl border border-border p-5 space-y-4 max-w-2xl">
        {settings?.map((s) => (
          <Field
            key={s.key}
            label={SETTING_LABELS[s.key] ?? s.key}
            hint={s.description ?? undefined}
          >
            <div className="flex gap-2">
              <Input
                value={draft[s.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
              />
              <Button
                onClick={() => mut.mutate({ key: s.key, raw: draft[s.key] ?? '' })}
                disabled={mut.isPending}
              >
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </Field>
        ))}
      </div>
    </div>
  );
}
