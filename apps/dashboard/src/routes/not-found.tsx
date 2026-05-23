import { Link } from 'react-router-dom';

import { Button } from '../components/ui/Button.js';

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="text-7xl font-black text-brand-red">404</div>
        <h1 className="text-2xl font-bold mt-2">الصفحة غير موجودة</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          الرابط الذي حاولت زيارته غير صحيح أو تم نقله. ارجع للوحة الرئيسية.
        </p>
        <Link to="/overview" className="inline-block mt-4">
          <Button>الذهاب للنظرة العامة</Button>
        </Link>
      </div>
    </div>
  );
}
