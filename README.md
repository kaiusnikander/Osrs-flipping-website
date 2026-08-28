# OSRS Flip Finder

School project full-stack web app for finding profitable Old School RuneScape flips.

## Stack

- **Frontend:** Next.js (App Router) + React + Tailwind CSS
- **Backend:** Next.js route handlers (Node runtime)
- **Database:** PostgreSQL + Prisma ORM
- **Data source:** OSRS Wiki price API (`prices.runescape.wiki`)

## Features (V1)

- Item search by name
- Live buy/sell prices and margin
- Estimated profit after 1% GE tax
- Favorites per browser profile
- 24h price history chart
- Manual "refresh market data" sync button

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   copy .env.example .env
   ```

3. Start PostgreSQL with Docker:

   ```bash
   docker compose up -d
   ```

4. Run Prisma migration:

   ```bash
   npm run prisma:migrate -- --name init
   ```

5. Start development server:

   ```bash
   npm run dev
   ```

6. Open http://localhost:3000

## API routes

- `POST /api/sync` - fetches latest data from OSRS Wiki and stores snapshots
- `GET /api/items?query=&profileId=` - searchable market list with latest margins
- `GET /api/items/:itemId/history?hours=24` - item price history for chart
- `GET /api/favorites?profileId=` - list favorite items for the profile
- `POST /api/favorites` - add or remove a favorite

## Notes

- For production, set a real `OSRS_WIKI_USER_AGENT` in `.env`.
- Favorites are profile-based (generated and stored in browser local storage).
