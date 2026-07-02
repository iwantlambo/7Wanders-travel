# Wandr Pro — Full Stack Travel App

Next.js · Supabase · Stripe · Google Maps · OpenAI

## Features

**Free tier**
- AI chat (10 messages/day)
- Build and view itinerary
- One-click route optimisation
- 3 hidden gem unlocks per city

**Premium (£2.99/month · £24.99/year · 7-day free trial)**
- 🌦️ Weather-smart routing — plans each day based on that day's forecast
- 💬 Unlimited AI chat
- 👥 Group trip sharing — shared route + personal private additions
- 🔄 Itinerary sync across devices (saved to database)
- 📄 Offline PDF download
- 🔔 Live trip alerts

---

## Setup — do these in order

### 1. Supabase (free at supabase.com)

1. Create a new project at https://supabase.com
2. Go to **SQL Editor** and run the entire contents of `supabase/schema.sql`
3. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Service role key → `SUPABASE_SERVICE_ROLE_KEY`
4. Go to **Authentication → Providers → Google**
5. Enable Google OAuth:
   - Go to https://console.cloud.google.com → APIs & Services → Credentials
   - Create OAuth 2.0 Client ID (Web application)
   - Add `https://your-supabase-project.supabase.co/auth/v1/callback` as Authorized redirect URI
   - Copy Client ID and Client Secret into Supabase Google provider settings
6. In Supabase Authentication → URL Configuration:
   - Add `https://your-site.vercel.app` to Redirect URLs

### 2. Stripe (free account at stripe.com)

1. Create account at https://stripe.com
2. Go to **Products** → Add product → **Wandr Premium**
3. Add two prices:
   - £2.99 / month recurring → copy Price ID → `STRIPE_MONTHLY_PRICE_ID`
   - £24.99 / year recurring → copy Price ID → `STRIPE_YEARLY_PRICE_ID`
4. Go to **Developers → API Keys**:
   - Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Secret key → `STRIPE_SECRET_KEY`
5. After deploying to Vercel, go to **Developers → Webhooks**:
   - Add endpoint: `https://your-site.vercel.app/api/stripe/webhook`
   - Select events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy Signing secret → `STRIPE_WEBHOOK_SECRET`

### 3. Google Maps

1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Create new API key
3. Enable: Maps JavaScript API, Directions API
4. Restrict to your Vercel domain

### 4. Fill in .env.local

```
cp .env.example .env.local
# Fill in all values
```

### 5. Deploy to Vercel

```bash
npm install -g vercel
vercel
# Follow prompts, add all env vars when asked
```

Or connect GitHub repo to Vercel at vercel.com/new.

---

## Local development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

---

## Project structure

```
app/
  page.tsx                    → redirects to /dashboard
  layout.tsx                  → root layout
  globals.css                 → global styles
  login/                      → Google sign-in page
  dashboard/                  → main travel app
  auth/callback/              → OAuth redirect handler
  api/
    chat/                     → OpenAI chat (checks message limits)
    weather/                  → Open-Meteo multi-day forecast
    trips/                    → trip CRUD + group trip management
    stripe/
      checkout/               → creates Stripe checkout session
      webhook/                → handles subscription events → updates Supabase
lib/
  supabase.ts                 → Supabase client (browser + server)
  stripe.ts                   → Stripe client + helpers
  weather.ts                  → weather fetch + route optimiser
  data.ts                     → Stop/Trip types + default Lisbon data
supabase/
  schema.sql                  → run this in Supabase SQL editor
```

---

## Premium feature gating

All premium checks happen server-side in API routes — users can't bypass them.

- **AI chat limit**: checked in `/api/chat/route.ts` against `profiles.ai_messages_today`
- **Weather multi-day**: checked in `/api/weather/route.ts` against `profiles.is_premium`
- **PDF download**: checked client-side (gate with server endpoint when scaling)
- **Group trips**: premium check before creating group trip
- **Stripe webhook**: automatically updates `profiles.is_premium` when subscription changes

---

## Group trip data model

- `trips` table: the shared group itinerary — everyone sees this
- `personal_stops` table: per-user additions that layer on top — only visible to that user
- `group_members` table: who's in the group + their role

When rendering a group trip, you fetch the shared `trips.days` + the current user's `personal_stops` for that trip and merge them, with personal stops marked visually differently.
