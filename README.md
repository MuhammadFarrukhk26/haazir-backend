# haazir-backend

## Vercel deployment

1. Import this repository in Vercel.
2. Add these environment variables in Vercel Project Settings:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `JWT_EXPIRES_IN` (optional, defaults to `7d`)
   - `ADMIN_JWT_SECRET`
   - `ADMIN_JWT_EXPIRES_IN` (optional, defaults to `8h`)
3. For MongoDB Atlas, allow Vercel network access in Atlas Network Access. If you cannot allow Vercel IPs directly, use `0.0.0.0/0` temporarily and restrict it after identifying the deployment network.
4. Generate long, unique values for both JWT secrets.

Do not set secrets in `.env`; keep them only in Vercel environment variables and local `.env.example`-style placeholders.