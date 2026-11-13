import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Image as ImageIcon, Loader2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api } from '../../lib/api.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Field, Textarea } from '../ui/Input.js';

export interface BroadcastOffer {
  id: string;
  titleAr: string;
  imageUrl: string;
  descriptionAr?: string | null;
}

type Audience = 'recent' | 'ordered' | 'all';

interface Preview {
  recipients: number;
  available: number;
  skippedOptOut: number;
  skippedRecent: number;
  lines: {
    id: string;
    label: string;
    phone: string | null;
    bulkPerDay: number;
    leftToday: number;
  }[];
  perDay: number;
  alreadyQueued: number;
  days: number | null;
  withImage: boolean;
  sample: string;
}

const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: 'recent', label: 'اللي طلبوا قريب', hint: 'عملاء خلص لهم أوردر في آخر 60 يوم' },
  { key: 'ordered', label: 'كل اللي طلبوا قبل كده', hint: 'أي عميل خلص له أوردر' },
  { key: 'all', label: 'كل العملاء', hint: 'كل حساب عميل عليه رقم صحيح' },
];

function errMsg(e: unknown): string {
  const r = (e as { response?: { data?: { error?: { message?: string } } } }).response;
  return r?.data?.error?.message || (e as Error).message || 'حصل خطأ';
}

/**
 * Send an offer to customers on WhatsApp, from the numbers marked «للعروض».
 * Always previews first (how many people, from which numbers, over how many
 * days at the safe pace) and only queues on a second, explicit press.
 */
export function BroadcastDialog({
  open,
  onOpenChange,
  offer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offer?: BroadcastOffer | null;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<Audience>('recent');
  const [limit, setLimit] = useState(300);

  useEffect(() => {
    if (!open) return;
    setText(offer ? [offer.titleAr, offer.descriptionAr].filter(Boolean).join('\n\n') : '');
    setAudience('recent');
    setLimit(300);
  }, [open, offer]);

  // The preview asks the server; wait for the typing to settle first.
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSettled(text.trim()), 500);
    return () => clearTimeout(t);
  }, [text]);

  const body = {
    offerId: offer?.id,
    text: settled,
    imageUrl: offer?.imageUrl,
    audience,
    days: 60,
    limit,
  };

  const preview = useQuery({
    queryKey: ['admin', 'whatsapp', 'broadcast-preview', body],
    queryFn: () =>
      api.raw
        .post('/admin/whatsapp/broadcast', { ...body, dryRun: true })
        .then((r) => r.data.data as Preview),
    enabled: open && body.text !== '',
    retry: false,
  });

  const send = useMutation({
    mutationFn: () =>
      api.raw
        .post('/admin/whatsapp/broadcast', body)
        .then((r) => r.data.data as Preview & { queued: number }),
    onSuccess: (r) => {
      toast.success(`اتحط ${r.queued} رسالة في الطابور، هتتبعت على مهلها`);
      void qc.invalidateQueries({ queryKey: ['admin', 'whatsapp'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const p = preview.data;
  const noLine = p && p.lines.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="ابعت العرض واتساب">
      <div className="space-y-4">
        {offer?.imageUrl && (
          <div className="rounded-xl border border-border overflow-hidden">
            <img
              src={offer.imageUrl}
              alt=""
              className="w-full aspect-[16/6] object-cover bg-muted"
            />
          </div>
        )}
        <Field
          label="نص الرسالة"
          hint="بيتبعت تحت الصورة. اكتب {{name}} لو عايز اسم العميل في نص معين، وإلا هيبدأ بـ «أهلاً» واسمه"
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={1500}
          />
        </Field>

        <div>
          <div className="text-sm font-bold mb-1.5">مين يوصله</div>
          <div className="grid sm:grid-cols-3 gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAudience(a.key)}
                className={`text-start rounded-lg border p-2.5 transition ${
                  audience === a.key
                    ? 'border-brand-red bg-brand-red/5'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <div className="text-sm font-bold">{a.label}</div>
                <div className="text-[11px] text-muted-foreground leading-4 mt-0.5">{a.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <Field label="أقصى عدد المرة دي">
          <input
            type="number"
            min={1}
            max={5000}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(5000, +e.target.value || 1)))}
            className="w-32 px-3 py-2 rounded-lg border border-input bg-popover text-sm"
          />
        </Field>

        <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-2 min-h-[64px]">
          {body.text === '' ? (
            <span className="text-muted-foreground">اكتب نص العرض الأول.</span>
          ) : preview.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : preview.isError ? (
            <span className="text-destructive">{errMsg(preview.error)}</span>
          ) : p ? (
            <>
              {noLine ? (
                <div className="flex items-start gap-2 text-destructive font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  مفيش رقم متعلّم «للعروض» ومتصل دلوقتي. علّم رقم من صفحة ربط واتساب الأول.
                </div>
              ) : (
                <>
                  <div>
                    هيوصل لـ <b>{p.recipients}</b> عميل
                    {p.available > p.recipients && <> (من {p.available} متاحين)</>} من{' '}
                    {p.lines.map((l) => l.label).join(' و')}.
                  </div>
                  <div className="text-muted-foreground text-xs">
                    بالسرعة الآمنة: لحد {p.perDay} رسالة في اليوم، من 10 الصبح لحد 9 بالليل، رسالة
                    كل نص دقيقة تقريباً.
                    {p.days ? ` هيخلص في حوالي ${p.days} يوم.` : ''}
                    {p.alreadyQueued > 0
                      ? ` فيه ${p.alreadyQueued} رسالة من عرض قبله لسه مستنية.`
                      : ''}
                  </div>
                  {(p.skippedOptOut > 0 || p.skippedRecent > 0) && (
                    <div className="text-muted-foreground text-xs">
                      {[
                        p.skippedOptOut > 0 ? `${p.skippedOptOut} طلبوا إيقاف العروض` : '',
                        p.skippedRecent > 0 ? `${p.skippedRecent} وصلهم عرض في آخر 24 ساعة` : '',
                      ]
                        .filter(Boolean)
                        .join('، ')}{' '}
                      ومش هيتبعتلهم.
                    </div>
                  )}
                </>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer font-bold">شكل الرسالة</summary>
                <div className="mt-2 rounded-lg bg-white border border-border p-2 whitespace-pre-wrap leading-5 flex gap-2">
                  {p.withImage && <ImageIcon className="w-4 h-4 shrink-0 text-muted-foreground" />}
                  <span>{p.sample}</span>
                </div>
              </details>
            </>
          ) : null}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            واتساب بيقفل الأرقام اللي بتبعت لناس كتير مرة واحدة، عشان كده الرسايل بتطلع ببطء ومن
            أرقام العروض بس، مش من رقم التأكيد. لو حد رد بـ «إيقاف» مش هيوصله عرض تاني.
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={() => send.mutate()}
            disabled={
              !p ||
              noLine ||
              p.recipients === 0 ||
              send.isPending ||
              preview.isFetching ||
              settled !== text.trim()
            }
          >
            {send.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            ابعت لـ {p?.recipients ?? 0} عميل
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
