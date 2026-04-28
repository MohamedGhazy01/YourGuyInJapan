# YourGuyInJapan.com

A full-stack e-commerce platform for sourcing products from Japan and shipping them worldwide.

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Auth: JWT + bcrypt

## Project Structure

```text
.
|-- backend
|   `-- src
|-- frontend
|   `-- src
|-- .env.example
`-- package.json
```

## Local Setup

1. Install Node.js 20+ and MongoDB.
2. Copy `.env.example` to `.env` and update values.
3. Copy `frontend/.env.example` to `frontend/.env` if you want to override default frontend API URLs.
4. Install dependencies:

```bash
npm run install:all
```

5. Start both apps:

```bash
npm run dev
```

6. Open `http://localhost:5173`.

## Default Runtime Behavior

- The backend seeds a secure admin user from environment variables on startup.
- Sample products are seeded automatically when the catalog is empty.
- Stripe is optional. If `STRIPE_SECRET_KEY` is missing, checkout uses a mock paid flow.
- Uploaded product media is stored locally in `backend/uploads`.

## Admin Access

Use the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values from your environment after startup.

## Important Environment Variables

- `MONGODB_URI`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `CLIENT_URL`
- `STRIPE_SECRET_KEY` (optional)
- `SMTP_*` (optional)
