
# Invite‑only + USDT (TRC20) deposits + withdrawals (requests) + admin (MVP)

Monorepo: `apps/api` (Express), `apps/web` (Next.js), `prisma` (Postgres).
- Регистрация только по коду приглашения.
- Пополнение USDT TRC20: пользователь отправляет txid; крон `/cron/verify-deposits` сверяет транзакцию (MVP‑логика упрощена).
- Вывод только по заявкам: админ утверждает; крон `/cron/process-withdrawals` отправляет USDT с горячего кошелька.
- Админ‑панель через API: список пользователей, статусы (ACTIVE/FROZEN/BLOCKED), блокировка/заморозка, подтверждение депозитов, утверждение выводов.

> **Внимание**: это учебный MVP. Для продакшена нужны KMS/HSM, мультисиг/кастоди, валидация адресов/AML, защита от повторов, аудит логов, лимиты и т.д.

## Быстрый старт (локально)

```bash
# 1) зависимости
npm i
npm -w apps/api i
npm -w apps/web i

# 2) база
cp .env.example .env
# отредактируйте DATABASE_URL и секреты
npx prisma generate
npm run db:push
npm run db:seed

# 3) API и Web
npm run dev
# web: http://localhost:3000  api: http://localhost:4000
```

## Деплой бесплатно (пример)
- **База:** Neon (free) или Supabase (free Postgres).
- **API:** Render (Free web service). Укажите ENV из `.env.example`. Expose порт 4000.
- **WEB:** Vercel (free). ENV `NEXT_PUBLIC_API_URL` = ваш Render URL.
- **CRON:** cron-job.org (free) -> POST:
  - `https://<api-host>/cron/verify-deposits` (каждые 2–5 мин)
  - `https://<api-host>/cron/process-withdrawals` (каждые 2–5 мин)

## Админ
- Сид создает админа: `ADMIN_EMAIL`/`ADMIN_PASSWORD` и инвайт `TEST-INVITE-123`.
- Эндпоинты:
  - `GET /admin/users` (Bearer admin JWT)
  - `POST /admin/user/:id/status` `{ "status": "FROZEN" | "BLOCKED" | "ACTIVE" }`
  - `POST /admin/deposit/:id/confirm`
  - `POST /admin/withdrawal/:id/approve`

## Безопасность и интеграция TRON
- Контракт USDT TRC20: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`.
- `HOT_WALLET_PRIVATE_KEY` — приватный ключ горячего кошелька (для демо!).
- В бою: используйте кастодиальные провайдеры или безопасные хранилища ключей; не держите ключ на сервере.

## Статусы
- Пользователи: `ACTIVE`, `FROZEN`, `BLOCKED`.
- Депозит: `pending` → `confirmed` (крон/админ).
- Вывод: `requested` → `approved` (админ) → `sent` (крон).

## Файловая структура
```
invite-usdt-mono/
  apps/
    api/
    web/
  prisma/
  .env.example
  README.md
```
