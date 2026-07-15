/**
 * Admins management — CRUD for /User rows whose role is ADMIN or SUPER_ADMIN.
 *
 * Only SUPER_ADMIN can access; the sidebar link and the guard both check.
 * Each admin carries a `permissions` array (list of route keys). The layout
 * consults it to hide sidebar entries for non-super admins.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck, Trash2, UserPlus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Field, Input } from '../components/ui/Input.js';
import { PhoneInput } from '../components/ui/PhoneInput.js';
import { CardSkeleton, EmptyState } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

interface Admin {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: 'ADMIN' | 'SUPER_ADMIN';
  isActive: boolean | number;
  permissions?: string[] | null;
  createdAt?: string;
}

// Permission slugs match the sidebar `NAV_ITEMS.to` values (minus the leading
// slash) so the layout can trivially check `perms.includes('orders')`.
const ALL_PERMS: Array<{ key: string; label: string }> = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'alerts', label: 'التنبيهات' },
  { key: 'orders', label: 'الطلبات' },
  { key: 'customers', label: 'العملاء' },
  { key: 'drivers', label: 'السائقون' },
  { key: 'merchants', label: 'التجار' },
  { key: 'services', label: 'الخدمات' },
  { key: 'products', label: 'المنتجات' },
  { key: 'pricing', label: 'التسعير' },
  { key: 'payments', label: 'المدفوعات' },
  { key: 'payment-gateway', label: 'بوابة الدفع' },
  { key: 'coupons', label: 'الكوبونات' },
  { key: 'reports', label: 'التقارير' },
  { key: 'reviews', label: 'التقييمات' },
  { key: 'whatsapp', label: 'ربط واتساب' },
  { key: 'broadcast', label: 'إشعار جماعي' },
  { key: 'supervisors', label: 'المشرفون' },
  { key: 'home-settings', label: 'صفحة التطبيق' },
  { key: 'site-settings', label: 'صفحة الموقع' },
  { key: 'settings', label: 'الإعدادات' },
];

export function AdminsPage() {
  const me = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Admin | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'admins'],
    queryFn: () => api.raw.get<{ data: Admin[] }>('/admin/admins').then((r) => r.data.data ?? []),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.raw.delete(`/admin/admins/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'admins'] });
      toast.success('تم الحذف');
    },
    onError: (e: Error) => toast.error(e.message || 'فشل الحذف'),
  });

  const admins = data ?? [];

  if (me?.role !== 'SUPER_ADMIN') {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-3">
        <ShieldCheck className="w-10 h-10 text-brand-red mx-auto" />
        <h2 className="text-xl font-black">مسموح فقط لـ SUPER_ADMIN</h2>
        <p className="text-sm text-muted-foreground">هذه الصفحة لإدارة الحسابات الإدارية.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-brand-dark">المدراء</h1>
          <p className="text-xs text-muted-foreground mt-1">
            إدارة حسابات الأدمن والصلاحيات لكل صفحة
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <UserPlus className="w-4 h-4" />
          إضافة أدمن
        </Button>
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : admins.length === 0 ? (
        <EmptyState title="لا يوجد مدراء بعد" description="ابدأ بإضافة أدمن جديد" />
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground font-bold">
              <tr>
                <th className="text-start px-4 py-2.5">الاسم</th>
                <th className="text-start px-4 py-2.5">الإيميل</th>
                <th className="text-start px-4 py-2.5">الهاتف</th>
                <th className="text-start px-4 py-2.5">الدور</th>
                <th className="text-start px-4 py-2.5">الصلاحيات</th>
                <th className="text-start px-4 py-2.5">الحالة</th>
                <th className="text-end px-4 py-2.5">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const perms = Array.isArray(a.permissions) ? a.permissions : [];
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-3 font-bold">{a.name}</td>
                    <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                      {a.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                      {a.phone}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a.role === 'SUPER_ADMIN' ? 'danger' : 'default'}>
                        {a.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {a.role === 'SUPER_ADMIN' ? (
                        <span className="text-brand-red font-bold">كل الصلاحيات</span>
                      ) : perms.length === 0 ? (
                        <span className="text-muted-foreground">كل الصلاحيات (افتراضي)</span>
                      ) : (
                        <span className="text-muted-foreground">{perms.length} صفحة مسموحة</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a.isActive ? (
                        <span className="text-green-700 font-bold text-xs">مفعّل</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">موقوف</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                          <KeyRound className="w-3.5 h-3.5" /> تعديل
                        </Button>
                        {a.id !== me?.id && (
                          <button
                            className="text-red-600 hover:bg-red-50 rounded p-1.5"
                            onClick={() => {
                              if (confirm(`تأكيد حذف ${a.name}؟`)) del.mutate(a.id);
                            }}
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <AdminFormDialog onClose={() => setCreating(false)} />}
      {editing && <AdminFormDialog admin={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AdminFormDialog({ admin, onClose }: { admin?: Admin; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!admin;
  const [form, setForm] = useState({
    name: admin?.name ?? '',
    email: admin?.email ?? '',
    phone: admin?.phone ?? '',
    password: '',
    role: (admin?.role ?? 'ADMIN') as 'ADMIN' | 'SUPER_ADMIN',
    isActive: admin ? Boolean(admin.isActive) : true,
    permissions: Array.isArray(admin?.permissions) ? admin!.permissions! : [],
  });
  const togglePerm = (k: string) =>
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(k)
        ? f.permissions.filter((x) => x !== k)
        : [...f.permissions, k],
    }));

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        isActive: form.isActive,
        permissions: form.permissions,
      };
      if (form.password) body.password = form.password;
      if (isEdit) return api.raw.patch(`/admin/admins/${admin!.id}`, body).then((r) => r.data);
      return api.raw.post('/admin/admins', body).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'admins'] });
      toast.success(isEdit ? 'تم الحفظ' : 'تم إضافة الأدمن');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || 'فشل الحفظ'),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'تعديل أدمن' : 'إضافة أدمن جديد'}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="البريد الإلكتروني" required>
            <Input
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="رقم الهاتف" required>
            <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          </Field>
          <Field
            label={isEdit ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}
            hint="٨ حروف على الأقل"
            required={!isEdit}
          >
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
          <Field label="الدور">
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as 'ADMIN' | 'SUPER_ADMIN' })
              }
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-white text-sm"
            >
              <option value="ADMIN">ADMIN</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN (كل الصلاحيات)</option>
            </select>
          </Field>
          <Field label="الحالة">
            <label className="flex items-center gap-2 mt-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              مفعّل
            </label>
          </Field>
        </div>

        {form.role !== 'SUPER_ADMIN' && (
          <div>
            <div className="text-sm font-bold mb-2">
              الصلاحيات
              <span className="text-xs text-muted-foreground font-normal mr-2">
                (اترك الكل فارغ للسماح بكل الصفحات)
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 border border-border rounded-lg p-3">
              {ALL_PERMS.map((p) => (
                <label
                  key={p.key}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-2 py-1"
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(p.key)}
                    onChange={() => togglePerm(p.key)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            <XCircle className="w-4 h-4" /> إلغاء
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
