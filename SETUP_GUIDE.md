# Hormuz Crisis Tracker — Setup Guide for Beginners
### A plain-English walkthrough of every external step before you write a single line of code

> **Who this is for:** You've never deployed a web application. You may not know what a database, a server, or an API key is. That's fine — this guide explains everything from scratch, in plain English, with exact click-by-click instructions.

---

## Before You Start: The Big Picture

Here's what you're building and what you need to set up before the code can run:

**What the app is:** A live dashboard that tracks the oil supply crisis caused by the closure of the Strait of Hormuz. It pulls data from several sources automatically and displays prices, charts, and a running deficit counter.

**Why you need external services:** A website isn't just files on your computer. To be visible to the world 24/7, it needs to live on a *server* — a computer that's always on and connected to the internet. You also need a *database* to store historical data. And some of the data (oil prices, shipping rates) comes from third-party services that require accounts or API keys.

**The full list of things to set up:**

| # | What | Cost | Time |
|---|------|------|------|
| 1 | EIA API key (for energy data) | Free | 5 min |
| 2 | GitHub account + repository (code storage) | Free | 10 min |
| 3 | Railway account + project (your server + database) | ~$5/month | 15 min |
| 4 | Environment variables on Railway (secret keys) | Free | 5 min |
| 5 | Node.js installed on your computer (to run code locally) | Free | 5 min |
| 6 | (Optional) Custom domain name | ~$10–15/year | 15 min |

---

## Step 1 — Get Your EIA API Key

### What is it?

The **U.S. Energy Information Administration (EIA)** is a federal agency that publishes energy data — gasoline prices, crude oil production, refinery activity, and more. They offer a completely free API (Application Programming Interface).

**What's an API?** Think of it as a special door into a database. Instead of going to the EIA website and reading a table with your eyes, your app sends a request through this door and receives data as numbers it can work with automatically.

**What's an API key?** A unique password that identifies your app when it makes requests. It's free, it's instant, and it has no usage limits for personal projects.

### Why you need it

Without this key, your app can't fetch any of the weekly U.S. energy data — gasoline prices, diesel prices, crude production figures, or refinery statistics. These feed the dashboard's U.S. Domestic Energy panel and are also used as inputs to the deficit calculation.

### Click-by-click instructions

1. Open your web browser and go to: **https://www.eia.gov/opendata/**
2. In the top-right corner of the page, click the button that says **"Register"**
3. You'll see a short form. Fill in:
   - Your **name**
   - Your **email address**
   - A **password** (make it something you'll remember)
4. Click **"Register"** or **"Submit"**
5. Open your email inbox. You'll have a message from EIA with a confirmation link. Click that link.
6. Go back to https://www.eia.gov/opendata/ and click **"Login"** in the top right
7. Log in with your email and password
8. Once logged in, you'll see your **API Key** displayed on the page. It looks like a long string of random letters and numbers, for example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
9. **Copy this key and save it somewhere safe** — paste it into a notes app, a password manager, or a text file on your desktop. You will paste it again in Step 4.

> ✅ **Done when:** You have your API key saved somewhere you can find it.

---

## Step 2 — Create a GitHub Account and Repository

### What is it?

**GitHub** is a website where developers store their code. Think of it like Google Drive, but specifically for code files. Every time you save a new version of your code, GitHub keeps track of all the changes.

**What's a repository?** A repository (often called a "repo") is a project folder on GitHub. Your entire Hormuz Tracker codebase will live in one repository.

### Why you need it

Railway (your server, set up in Step 3) doesn't let you upload code directly. Instead, it watches your GitHub repository and automatically pulls your code every time you make a change. This means deploying your app is as simple as saving your code — Railway handles the rest.

### Click-by-click instructions

**Creating your account:**

1. Go to: **https://github.com**
2. Click the **"Sign up"** button in the top right
3. Enter your **email address**
4. Create a **password**
5. Choose a **username** — this will appear in your repository's URL (e.g., `github.com/yourname/hormuz-tracker`). Pick something you don't mind sharing.
6. Complete the verification puzzle (click the squares with traffic lights, etc.)
7. Click **"Create account"**
8. GitHub will send you a verification code by email. Enter it on the page.
9. On the next screen, you can click **"Skip personalization"** at the bottom — you don't need to fill out the survey.

**Creating your repository:**

1. Once logged in, look for the **"+"** icon in the top-right corner of the page (next to your profile picture)
2. Click it, then click **"New repository"**
3. On the new repository page:
   - **Repository name:** Type `hormuz-tracker`
   - **Description:** You can type something like "Strait of Hormuz crisis dashboard" or leave it blank
   - **Public or Private:** Select **"Private"** — your API keys won't be in the code, but it's still good practice to keep code private
   - **Initialize this repository:** Check the box next to **"Add a README file"**
4. Scroll down and click the green **"Create repository"** button
5. You'll be taken to your new repository page. The URL in your browser will look like: `https://github.com/yourusername/hormuz-tracker`
6. **Copy this URL** — you'll need it in the next step.

> ✅ **Done when:** You can see your new empty repository at `github.com/yourusername/hormuz-tracker`.

---

## Step 3 — Create a Railway Account, Project, and Database

### What is it?

**Railway** is a hosting platform — it's the service that runs your app on the internet, 24 hours a day, 7 days a week. When someone visits your dashboard's URL, Railway is what responds to them.

Railway also gives you a **database**. Your app needs to store data between visits — the running deficit total, historical tanker counts, weekly price snapshots. A database is where that data lives permanently, even when nobody is visiting the site.

**What's PostgreSQL?** It's the specific type of database this project uses. Think of it as a very sophisticated spreadsheet that your app can read from and write to automatically. Railway spins this up for you with one click — you don't need to install or configure it yourself.

### Why you need it

Without Railway (or a similar service), your app would only work on your own computer, and only while your computer is on. Railway keeps it running permanently and gives it a public URL.

### Click-by-click instructions

**Creating your Railway account:**

1. Go to: **https://railway.app**
2. Click the **"Login"** button in the top-right corner
3. Click **"Login with GitHub"** — this connects your Railway account to GitHub automatically (no separate password needed)
4. GitHub will ask you to authorize Railway. Click the green **"Authorize Railway"** button.
5. You'll be taken to the Railway dashboard. It may ask for a username — pick one.

**Creating your project:**

1. On the Railway dashboard, click the **"New Project"** button
2. Select **"Deploy from GitHub repo"**
3. Railway will ask permission to access your GitHub repositories. Click **"Configure GitHub App"** or **"Install & Authorize"** — this lets Railway watch your code.
4. On the GitHub permissions page, select **"Only select repositories"**, then choose your `hormuz-tracker` repository from the dropdown. Click **"Install & Authorize"**.
5. Back in Railway, select your `hormuz-tracker` repository from the list.
6. Railway will show you a deployment setup screen. **Don't click Deploy yet** — just note that the project was created. You'll see it appear in your Railway dashboard.

**Adding a PostgreSQL database:**

1. Inside your Railway project dashboard, look for a button that says **"New"** or **"+"** (usually in the top-right area of the project canvas)
2. Click it, then hover over **"Database"**
3. Click **"Add PostgreSQL"**
4. Railway will spin up a database in about 30 seconds. You'll see a new box appear on the project canvas labeled "Postgres".
5. Click on the **Postgres** box
6. In the panel that opens, click the **"Connect"** tab
7. You'll see several connection strings. Look for one labeled **"DATABASE_URL"** — it looks like: `postgresql://postgres:somepassword@somehost.railway.app:5432/railway`
8. Click the copy icon next to it to copy the full string.
9. **Paste this DATABASE_URL somewhere safe alongside your EIA key** — you'll need it in Step 4.

> ✅ **Done when:** You can see both your app and a Postgres database box inside your Railway project, and you have the DATABASE_URL copied.

---

## Step 4 — Configure Environment Variables on Railway

### What are environment variables?

Imagine your app is a locked safe. It needs a combination to open — but you don't want to write the combination on the outside of the safe. **Environment variables** are how you pass secrets (like API keys and database passwords) to your app without writing them into the code itself.

If you wrote your API key directly into the code and then pushed that code to GitHub, anyone who found your repository could use your key. Environment variables keep secrets out of the code entirely — they're stored in Railway's secure settings and injected into the app at runtime.

### Why you need to do this

Your app will refuse to start properly if it can't find these values. Setting them up now means the app will have everything it needs the moment it deploys.

### Click-by-click instructions

1. In your Railway project dashboard, click on your **app service** — the box that corresponds to your `hormuz-tracker` code (not the Postgres box)
2. In the panel that opens on the right, click the **"Variables"** tab
3. You'll see an empty list with a button that says **"New Variable"** or **"Add Variable"**. Click it.
4. Add the following variables one at a time. For each one, you'll type the **name** in the left field and the **value** in the right field, then click **"Add"** or press Enter:

   | Variable Name | What to paste as the value |
   |---|---|
   | `EIA_API_KEY` | The long string you copied from Step 1 |
   | `DATABASE_URL` | The `postgresql://...` string you copied from Step 3 |
   | `PORT` | `3000` |
   | `NODE_ENV` | `production` |

5. After adding all four variables, click the **"Deploy"** button (or Railway may redeploy automatically — either way is fine).

> ⚠️ **Double-check your work:** Make sure there are no extra spaces at the beginning or end of any value when you paste it. A space before `production` would make the app think its environment is ` production` (with a space), not `production`, which can cause subtle bugs.

> ✅ **Done when:** All four variables appear in the Variables tab and the app has redeployed.

---

## Step 5 — Install Node.js on Your Computer

### What is it?

**Node.js** is the software that lets your computer run JavaScript code outside of a web browser. The Hormuz Tracker's backend (its server logic) is written in JavaScript using Node.js.

You need Node.js on your own computer so you can:
- Test the app locally before deploying it
- Run the code that builds and sets up the project

### Why you need it

Without Node.js, you can't run any of the build commands or test anything on your machine. Railway handles running Node.js in production, but you need it locally too.

### Click-by-click instructions

1. Go to: **https://nodejs.org**
2. You'll see two download buttons. Click the one labeled **"LTS"** (Long-Term Support) — not "Current". LTS versions are the stable, reliable ones used in production.
3. The download will start automatically — it's an installer file (`.pkg` on Mac, `.msi` on Windows)
4. Open the downloaded file and follow the installation wizard:
   - Click **"Continue"** / **"Next"** through the steps
   - Accept the license agreement
   - Click **"Install"**
   - Enter your computer password if prompted (this is your regular Mac or Windows login password)
5. Once installation finishes, **verify it worked**:
   - On **Mac:** Open Terminal (press Cmd+Space, type "Terminal", press Enter)
   - On **Windows:** Open Command Prompt (press Windows key, type "cmd", press Enter)
   - Type this command and press Enter: `node --version`
   - You should see something like `v22.0.0` — a version number means it worked.

> ✅ **Done when:** Running `node --version` in your terminal shows a version number.

---

## Step 6 — Connect Your Local Code to Your Railway Database (Development Shortcut)

### What this means

Normally, developers set up a local database on their own computer for testing. But for beginners, that's an unnecessary extra step. Instead, you can just point your local app directly at the Railway database you already created.

This means you'll be working with real data from the start, and you skip the complexity of installing Postgres locally.

### How to do it

When Claude Code creates the `.env` file (a hidden file that stores your local environment variables), make sure it contains the **Railway DATABASE_URL**, not a local one.

The `.env` file will look like this:

```
EIA_API_KEY=your_eia_key_here
DATABASE_URL=postgresql://postgres:yourpassword@yourhost.railway.app:5432/railway
PORT=3000
NODE_ENV=development
```

Replace the placeholder values with the actual strings you copied in Steps 1 and 3.

> ⚠️ **Important:** This file is named `.env` and starts with a dot. On Mac and some Windows setups, files starting with a dot are hidden by default. Claude Code will create this file for you — you just need to paste in the right values.

> ⚠️ **Never commit `.env` to GitHub.** The project is set up with a `.gitignore` file that automatically excludes it. Just don't override this.

> ✅ **Done when:** Claude Code has created the `.env` file and you've pasted in your real keys.

---

## Step 7 — (Optional) Set Up a Custom Domain

### What is it?

By default, Railway gives your app an automatically generated URL like:
`hormuz-tracker-production.up.railway.app`

If you'd prefer a clean URL like `hormuztracker.com`, you need to buy a **domain name** and connect it.

### What it costs

- Domain name: ~$10–15/year from any registrar (Namecheap, Cloudflare Registrar, and Porkbun are all good options)
- Railway custom domain setup: Free (included in your Railway plan)

### Click-by-click instructions

**Buying a domain:**

1. Go to **https://www.namecheap.com** (or any other domain registrar)
2. In the search bar, type the domain name you want (e.g., `hormuztracker.com`)
3. If it's available, click **"Add to Cart"** and check out. Use a credit card. No account is strictly required, but creating one makes renewals easier.
4. Complete the purchase — you now own the domain for one year (renewable each year).

**Connecting it to Railway:**

1. In your Railway project, click on your app service
2. Click **"Settings"** in the panel
3. Find the **"Domains"** section and click **"Add Custom Domain"**
4. Type in your domain (e.g., `hormuztracker.com`) and click **"Add"**
5. Railway will show you a **CNAME record** — it looks like two pieces of text, for example:
   - **Name/Host:** `@` or `www`
   - **Value/Target:** `hormuz-tracker-production.up.railway.app`
6. Now log in to Namecheap (or wherever you bought your domain):
   - Click on **"Manage"** next to your domain
   - Click **"Advanced DNS"**
   - Find the section labeled **"Host Records"**
   - Click **"Add New Record"**
   - Select **"CNAME Record"** from the dropdown
   - Set **Host** to `@` (or `www`, depending on what Railway told you)
   - Set **Value** to the Railway URL Railway gave you
   - Click the green checkmark to save
7. **Wait 10–30 minutes.** DNS changes (the system that translates domain names into server addresses) take time to spread across the internet. After waiting, try visiting your domain — it should load your app.

> ✅ **Done when:** Visiting your custom domain shows the Hormuz Tracker dashboard.

---

## Step 8 — Understanding Web Scraping (Before Phase 3)

### What is web scraping?

Some data sources used in this project — the Drewry container index, the DAT trucking spot rate, and the VesselFinder tanker count — don't have official APIs. To get this data automatically, the app uses **web scraping**: it visits the public webpage like a browser would, reads the page content, and extracts the specific number it needs.

### Is this OK?

For personal, non-commercial use on public data (data you could look up yourself by visiting the site), web scraping is generally acceptable. These sites make their data publicly visible — the app is just automating the process of reading it.

**The one thing to know:** Websites sometimes change their layout or HTML structure. When they do, the scraper may break — it was looking for a number in a specific place and now it can't find it. This is normal and not a catastrophe. When it happens:

1. The app is designed to fail gracefully — it will display "Data unavailable" in that panel rather than crashing the whole dashboard
2. Claude Code can fix the scraper quickly if you paste in the error message and a sample of the new page HTML
3. You don't need to do anything right now — this is just context for later

> ✅ **No action needed for this step.** Just read it so you know what scraping means and what to expect.

---

## Quick Reference: Everything You Need Before Starting Claude Code

Before you open Claude Code and start Phase 1, confirm you have all of the following:

- [ ] **EIA API key** — a long alphanumeric string from https://www.eia.gov/opendata/
- [ ] **GitHub account** — with a private repository named `hormuz-tracker`
- [ ] **Railway account** — with a project containing your app + a Postgres database
- [ ] **DATABASE_URL** — copied from Railway's Postgres "Connect" tab
- [ ] **Environment variables set on Railway** — EIA_API_KEY, DATABASE_URL, PORT, NODE_ENV
- [ ] **Node.js installed locally** — verified by running `node --version` in Terminal/Command Prompt
- [ ] *(Optional)* Custom domain purchased and connected

Once all boxes are checked, you're ready to paste the Phase 1 prompt into Claude Code and start building.

---

## Glossary of Terms Used in This Guide

| Term | Plain-English definition |
|---|---|
| **API** | A door into someone else's database. Your app sends a request through it and gets data back. |
| **API key** | A password that identifies your app when it uses someone's API. |
| **Backend** | The part of your app that runs on the server — fetches data, does calculations, stores things in the database. |
| **Cron job** | A task set to run automatically on a schedule (e.g., every Wednesday at 2pm). |
| **Database** | Permanent storage for your app's data. Think of a spreadsheet that your app can read and write automatically. |
| **Deploy** | Publishing your code so it runs on a server and is accessible to the world. |
| **DNS** | The internet's phone book — translates domain names like `hormuztracker.com` into the actual server address. |
| **Environment variable** | A secret value stored securely outside your code, passed to your app when it runs. |
| **Frontend** | The part of your app that users see in their browser — HTML, CSS, charts. |
| **GitHub** | A website that stores code and tracks changes over time. |
| **Node.js** | Software that lets you run JavaScript code on a server (not just in a browser). |
| **PostgreSQL (Postgres)** | A type of database. Railway sets this up for you automatically. |
| **Railway** | The hosting platform — it runs your app and database on the internet 24/7. |
| **Repository (repo)** | A project folder on GitHub that contains your code. |
| **Scraping** | Automatically reading data from a public webpage the same way a human would, then extracting specific values. |
| **Server** | A computer that runs your app and responds to visitors. Railway provides this. |
| **Terminal / Command Prompt** | A text-based interface for giving your computer instructions by typing commands. |

---

*Generated from the Hormuz Crisis Tracker PRD · Covers all 🔧 steps in the implementation plan*
