# EventKit — B2B Event-Vendor Discovery, RFQ & Rental Lifecycle Platform

Built for **CS3CO40(P): Software Engineering Laboratory (Medi-Caps University, Indore)** following the IEEE 830 SRS, 15-table 3NF ERD, 15 Business Rules, and IEEE 829 Test Specification.

---

## Architecture (100% Free-Tier Cloud Ready)

- **Frontend (`apps/web`):** React 18 + TypeScript + Vite + Tailwind CSS + Socket.IO Client (Deploy free on **Vercel** or **Cloudflare Pages**)
- **Backend + Watchdog (`apps/api`):** Node.js + Express + TypeScript + Prisma ORM + Socket.IO + QRCode (`qrcode`) (Deploy free on **Render**)
- **Database:** PostgreSQL 15/16 via **Neon** or **Supabase** (Free tier, no credit card required; supports real ACID `SELECT ... FOR UPDATE` row-level locks)
- **Shared Domain Engine (`packages/shared`):** Single source of truth for Zod validation, 10% safety buffer math, indicative availability thresholds, 3-way bid totals, VRI formula, Haversine 25 km geofence, and privacy contact masking.

---

## 100% Free Cloud Deployment Guide (No Local DB Required)

Because your 4-person team wants live shareable links with zero local database setup:

### Step 1: Create Free Cloud PostgreSQL on Neon
1. Go to [neon.tech](https://neon.tech) and create a free account + project named `eventkit`.
2. Copy the PostgreSQL connection string (`postgresql://...?sslmode=require`).

### Step 2: Push Code to GitHub (Team Collaboration)
1. Create a GitHub repository and push the `eventkit/` folder (ensure `.env` is **never** committed; `.gitignore` already excludes it).

### Step 3: Push Schema & Seed Demo Data (Once from any teammate's machine or CI)
1. Copy `.env.example` to `apps/api/.env` and set `DATABASE_URL` and `DEMO_SEED_PASSWORD`.
2. Run:
   ```bash
   pnpm install
   pnpm db:generate
   pnpm db:push
   pnpm db:seed
   ```

### Step 4: Deploy Backend (`apps/api`) on Render (Free Tier)
1. On [render.com](https://render.com), select **New → Blueprint** (it reads `render.yaml` automatically) or **New Web Service**.
2. Add environment variables in Render Dashboard:
   - `DATABASE_URL` = your Neon connection string
   - `CLIENT_ORIGIN` = your Vercel frontend URL (e.g. `https://eventkit.vercel.app`)
   - `ENABLE_DEMO_MODE` = `true` (for viva/evaluator demo switching)
3. Copy your live Render URL (e.g., `https://eventkit-api.onrender.com`).

### Step 5: Deploy Frontend (`apps/web`) on Vercel (Free Tier)
1. On [vercel.com](https://vercel.com), import the GitHub repo and set **Root Directory** to `apps/web`.
2. Build command: `cd ../.. && pnpm install && pnpm --filter @eventkit/shared build && pnpm --filter @eventkit/web build` (Output directory: `dist`).
3. Add Vercel Environment Variables:
   - `VITE_API_URL` = `https://your-render-api.onrender.com/api`
   - `VITE_WS_URL` = `https://your-render-api.onrender.com`
4. Share the live Vercel link with your teammates and evaluators!

---

## Implemented Business Rules & Test Coverage

- **BR-01 / BR-02:** Unverified (`PENDING`) vendors never appear in public search (`TC-01`).
- **BR-03 / BR-14:** Strictly 3-way unbundled quotations (`Rental + Freight + Labor + Tax`) (`TC-03`).
- **BR-04 / BR-05 / BR-11:** Atomic quote acceptance with PostgreSQL `SELECT ... FOR UPDATE` row locks (`TC-04`, `TC-10`).
- **BR-06 / NFR-08:** 24-hour Soft-Hold Watchdog Daemon + startup recovery + Admin Time-Travel Simulator (`TC-05`).
- **BR-08 / NFR-06:** Pre-booking contact masking and unmasking upon `CONFIRMED` (`TC-06`, `TC-07`).
- **BR-09 / BR-10 / BR-12 / BR-13:** QR Delivery & Return Handover Manifests, automatic Dispute Ticket escalation (`TC-08`), and `COMPLETED`-gated verified reviews (`TC-09`).
