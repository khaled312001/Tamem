# Tamem API

## المصدر الوحيد (Source of Truth)

عقد الـ API كاملاً في: [apps/backend/openapi.yaml](../apps/backend/openapi.yaml)

## Swagger UI

- **Dev:** http://localhost:4000/api/v1/docs
- **Prod:** https://api.deliverytamem.com/api/v1/docs

## توليد الـ TS types

```bash
pnpm --filter @tamem/backend gen:types
```

ينتج: `packages/shared-types/src/api/schema.ts`

## اتفاقيات

### Base path

```
/api/v1
```

### استجابة موحدة

```json
// نجاح
{ "data": {...}, "meta": { "pagination": {...} } }

// خطأ
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "messageAr": "...", "details": {...} } }
```

### المصادقة

```http
Authorization: Bearer <access_token>
```

### Pagination

```
?page=1&pageSize=20
```

### Filtering (مثال على Orders)

```
?status=NEW&from=2026-01-01&to=2026-12-31&serviceId=xxx
```

## Real-time (Socket.IO)

### Connection

```javascript
const socket = io('https://api.deliverytamem.com', {
  auth: { token: accessToken },
});
```

### Events

| Event                   | Direction               | Description                  |
| ----------------------- | ----------------------- | ---------------------------- |
| `order:new`             | server → admin          | طلب جديد دخل                 |
| `order:status`          | server → involved users | تغيّرت حالة طلب              |
| `order:priced`          | server → customer       | تم تسعير الطلب               |
| `order:driver-assigned` | server → customer       | تم تعيين سائق                |
| `alert:new`             | server → admin          | تنبيه جديد في مركز التنبيهات |

### Rooms

- `user:{userId}` — كل user له room خاص
- `order:{orderId}` — مشترك بين العميل والسائق والأدمن
- `admin:orders` — كل الأدمن يستمعون
- `admin:alerts` — كل الأدمن يستمعون
