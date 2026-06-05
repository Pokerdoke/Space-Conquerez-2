# Space Conquererz 2 Deployment Notes

## 1. Supabase database setup

Before creating an online room, open your Supabase project, go to **SQL Editor**, and run the full contents of:

```txt
supabase_schema.sql
```

This creates:

- `games` table: stores the entire game state JSON in one row per room code.
- `players` table: stores lobby player slots.
- permissive RLS policies for now so the no-auth multiplayer flow works.
- Realtime publication on both tables.

## 2. Environment variables

For Netlify or Vercel, add these environment variables:

```txt
VITE_SUPABASE_URL=https://bbmgrpynuqerbgkoasmk.supabase.co
VITE_SUPABASE_KEY=sb_publishable_z3z7bVxecowgDnU6r0p4SQ_cSxeaJYq
```

The publishable Supabase key is safe to expose in a browser app when RLS policies are configured.

## 3. Netlify deployment

Use these settings:

```txt
Build command: npm run build
Publish directory: dist
```

This repo includes `netlify.toml`, so Netlify should detect those settings automatically.

## 4. Vercel deployment

Connect the GitHub repo to Vercel, or use:

```bash
npm i -g vercel
vercel
```

This repo includes `vercel.json` with the SPA rewrite needed for React/Vite.

## 5. Playing with friends

After deployment, one player opens the public URL, creates a game, and shares the 6-character room code. Other players open the same URL from their own computers/phones and join using that code. No installation is required, though mobile users can install it as a PWA from their browser.
