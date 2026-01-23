# Iraq SMS Auth (KUBAZAR) — Vonage + Supabase

This repo already uses Supabase Phone OTP in `src/components/auth/auth-button.tsx`.
To make SMS auth compliant for Iraq, configure Vonage in Supabase and use a brand Sender ID.

## Iraq sender ID rules (Vonage)

- **Alphanumeric sender IDs are case-sensitive and must contain the brand name.**
- **Numeric sender IDs are not supported** unless using Vonage 2‑way service; they will be overwritten.
- **Generic sender IDs** (INFO, SMS, NOTICE, etc.) are **prohibited**.
- **P2P traffic is prohibited**.
- **Marketing requires opt‑in** and content restrictions apply (no political/religious/unsolicited promotion/gambling).

Reference: Vonage API Support → Iraq SMS Features & Restrictions.

## Recommended setup (KUBAZAR)

1. **Sender ID:** `KUBAZAR` (11 chars, alphanumeric, contains the brand).
2. **Supabase Auth → Phone:**
   - Enable **Phone** provider.
   - Select **Vonage** as the SMS provider.
   - Enter your Vonage API key/secret.
3. **Use the Send SMS Hook** to control the Sender ID and message content.
4. **Message template:**
   - Keep it short, transactional, no links.
   - Example wording: “KUBAZAR verification code: ######. Do not share.”
5. **Traffic type:** OTP only (transactional), not marketing.

## Send SMS Hook (Supabase → this app)

Use the hook to send OTPs with Vonage and enforce `from=KUBAZAR`.

1. **Hook URL** (production):
   - `https://<your-domain>/api/auth/send-sms`
2. **Hook URL** (local testing):
   - Use a public tunnel (ngrok/Cloudflare Tunnel) pointing to `http://localhost:5000/api/auth/send-sms`.
3. **Secret (recommended)**:
   - Generate the secret in Supabase (looks like `v1,whsec_...`).
   - Set `SUPABASE_SMS_HOOK_SECRET` to that exact value in your app env.
   - The hook endpoint validates the standard webhook signature headers automatically.

## Environment variables (server-side)

```
VONAGE_API_KEY=...
VONAGE_API_SECRET=...
VONAGE_SMS_SENDER_ID=KUBAZAR
VONAGE_SMS_TEMPLATE=KUBAZAR verification code: {{CODE}}. Do not share.
SUPABASE_SMS_HOOK_SECRET=... (optional)
```

## Operational notes

- Carriers may override sender IDs in Iraq; expect some normalization for delivery.
- Use an alphanumeric Sender ID (brand) rather than numeric to match Iraq guidelines.
- Avoid generic sender IDs and prohibited content to reduce filtering risk.
