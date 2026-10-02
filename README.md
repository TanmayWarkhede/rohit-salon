# The Rohit Salon website (Node.js + MongoDB)

Plain HTML/CSS/JS frontend (in `public/`) served by a small Express server (`server.js`) that stores everything in MongoDB.
A browser can't talk to MongoDB directly, so the server sits in between. Compass is only a viewer for the same database.

## Run it on your computer
1. Install Node.js 18+ and MongoDB Community Server (Compass usually installs alongside it). Make sure MongoDB is running.
2. In this folder:
   ```
   npm install
   cp .env.example .env        (Windows: copy .env.example .env)
   ```
   Open `.env` and set `JWT_SECRET` to a long random text.
3. Create your admin login (stored in MongoDB, password hashed):
   ```
   npm run create-admin -- you@example.com YourStrongPassword
   ```
4. Start:
   ```
   npm start
   ```
5. Open http://localhost:3000. Admin: http://localhost:3000/admin/login.html
6. In admin: Services > Load sample services (check the prices), then Settings > confirm phone, address and hours, and Save.

## See the data in Compass
Connect to `mongodb://127.0.0.1:27017`. Database `rohit_salon` appears after the server starts. Collections: `settings`, `services`, `bookings`, `offers`, `gallery`, `reviews`, `inquiries`, `admins`.

## Using MongoDB Atlas (cloud) instead
Create a free cluster, add a database user, allow your server's IP, then put the connection string in `.env` as `MONGODB_URI`.

## Putting it online
You need a host that runs Node.js (Render, Railway, a VPS). Set the same variables from `.env` there and use `npm start`. Firebase Hosting alone can't run this server. Use HTTPS in production.

## How it works
- **Double booking:** each booking has a `slotId` (`date_time`) with a unique index, so MongoDB rejects a second booking for the same time. Cancelling removes the `slotId`, freeing the slot.
- **Server-side checks:** the server re-validates service, date, time, mobile and name on every booking. Browser checks are only for convenience.
- **Admin security:** passwords are hashed with scrypt, sign-in returns a 12-hour token, and every admin request re-checks it against the `admins` collection. Public forms and login are rate-limited.
- **Booking lookup:** needs ID and mobile together, with one generic error message.
- **Dates:** the server uses Indian time (IST) for "today", slots and past-time checks.

## Customising
Images uploaded from admin (gallery, offers) are stored inside MongoDB, so they survive redeploys.
Colours: `public/css/style.css`. Defaults, hours, images: `public/js/config.js`. Everything else: admin > Settings. Images live in `public/assets/images/`.

## Troubleshooting
- "Cannot reach MongoDB": start the MongoDB service, or fix `MONGODB_URI`.
- Admin redirects to login: run `create-admin` again, or sign in again after a server restart if `JWT_SECRET` is not set.
- Blank services: none added yet, or inactive.

## Not built
Not built: visiting card (add `public/assets/images/branding/visiting-card.jpg` and it appears automatically).

## Final checklist before going live
1. `.env` has a strong `JWT_SECRET`; admin created with `npm run create-admin`.
2. Admin > Settings: real phone, WhatsApp, address, Google Maps link, hours, holidays.
3. Admin > Services: load samples, then correct any prices.
4. Add `public/assets/images/branding/visiting-card.jpg` if you want the "Connect with us" card.
5. Make a test booking, try the same slot twice, cancel it, and check the lookup page.
6. Host on a Node.js service with HTTPS and MongoDB Atlas (see above), and back up the database and `public/uploads/`.

## Owner email alerts
The owner gets an email for every **new online booking** (subject shows the name, time and the day's total), **customer cancellation**, **enquiry** and **review to approve**, a **morning summary** of today's bookings (default 9:00 AM IST), and a **"customer arriving soon"** email 30 minutes before each appointment.
If a customer typed an email when booking, they also get a "booking received" email, and another when you mark it Confirmed or Cancelled.

Setup with Gmail (about 5 minutes):
1. Use a Gmail account for sending (a new one such as `rohitsalon.alerts@gmail.com` is best). Turn on **2-Step Verification**.
2. Create an **App Password** at https://myaccount.google.com/apppasswords (16 letters).
3. In `.env` set `SMTP_USER` (that Gmail), `SMTP_PASS` (the app password) and `OWNER_EMAIL` (where alerts should arrive).
4. Run `npm install` (one new package), then `npm start`. The terminal shows "Owner email alerts: ON".
5. Admin > Settings > **Send a test email to the owner**. Check the inbox and the spam folder the first time.

Make alerts easy to notice: install the Gmail app on the owner's phone, turn notifications on, and star or label the sender as important. Alerts only work while the server is running, and a failed email never affects the customer's booking (the error appears in the terminal). Gmail allows about 500 emails a day, far more than a salon needs.

## Booking rules and reports
- **Duration-based booking:** each service blocks its full duration. A 45-minute De Tan Cleanup at 5:00 PM ends 5:45 PM, and the next customer can start at 5:45 PM (the exact end minute is offered) but not earlier. Services also cannot run past closing time or into the break.
- **Free / Busy switch:** Admin > Dashboard. Busy shows a notice on the website and stops all online bookings.
- **Reports:** Admin > Reports shows daily or range totals (bookings, customers, revenue estimate) and a customer list. **Download Excel** saves a .xlsx with a Bookings sheet (customer, mobile, service, time, price, status) and a Daily summary sheet.
- **Opening hours:** the defaults are Monday closed and 7 AM to 10 PM on other days. If you saved hours in Admin > Settings before, they override the defaults, so re-save them there.

## Free deployment (Render free + MongoDB Atlas free + Brevo free + UptimeRobot free)
1. **GitHub:** create a free account, a new private repository, and upload this folder (`.env` and `node_modules` are ignored by `.gitignore`).
2. **MongoDB Atlas (free M0):** create a cluster, a database user with a strong password, and under Network Access allow `0.0.0.0/0` (free hosts have no fixed IP). Copy the connection string (`mongodb+srv://...`).
3. **Create the admin login on the live database:** on your computer put the Atlas string in `.env` as `MONGODB_URI`, then run `npm run create-admin -- you@example.com YourStrongPassword`.
4. **Brevo (free email over HTTPS):** create an account, verify a sender email address, and create an API key. Render's free plan blocks SMTP ports, so Gmail SMTP will not work there; Brevo's API does.
5. **Render:** New > Blueprint (or Web Service) > pick your repo. Plan: Free. Add environment variables: `MONGODB_URI`, `OWNER_EMAIL`, `BREVO_API_KEY`, `BREVO_SENDER` (`JWT_SECRET` is generated).
6. **Keep it awake:** Render free sleeps after 15 minutes without visits, which would stop reminders and the morning summary. Create a free monitor at uptimerobot.com that opens `https://YOUR-APP.onrender.com/healthz` every 5 minutes.
7. Open `https://YOUR-APP.onrender.com/admin/login.html`, sign in, load sample services, fill Settings, and press "Send a test email".
Limits: free plans can change, Render may restart the service at any time, and the first load after a restart can take about a minute.
