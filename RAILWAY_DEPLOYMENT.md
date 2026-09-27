# 🚀 SonicSentinel AI — Railway Deployment Guide

This guide explains how to deploy SonicSentinel AI to [Railway](https://railway.app/) in less than 5 minutes.

---

## 📋 Features of the Railway Setup

- **Unified Container**: Single Docker container builds both the React Vite frontend and Python FastAPI backend.
- **Auto Admin Account Creation**: Automatically creates the initial administrator account on startup using environment variables.
- **3-Model ML Engine**: Evaluates Random Forest, SVM, and 2D CNN models on deployed audio clips.
- **Database Support**: Operates in local SQLite mode (default) or connects to MongoDB Atlas using `MONGO_URI`.

---

## 🛠️ Step-by-Step Railway Deployment

### Step 1: Push Code to GitHub
Ensure your repository contains all the code:
```bash
git add .
git commit -m "SonicSentinel Railway ready"
git push origin main
```

### Step 2: Create a New Project on Railway
1. Log in to [Railway](https://railway.app/).
2. Click **+ New Project**.
3. Select **Deploy from GitHub repo**.
4. Choose your `SonicSentinel-AI` repository.

### Step 3: Configure Environment Variables in Railway
Go to your service in Railway -> **Variables** tab -> Click **Raw Editor** or add these variables:

```env
# Server configuration
USE_SQLITE=true
SESSION_DAYS=7

# Initial Admin Credentials (AUTOMATICALLY CREATED)
ADMIN_EMAIL=admin@sonicsentinel.com
ADMIN_USERNAME=SonicSentinel Admin
ADMIN_PASSWORD=YourStrongPassword123!

# (Optional) MongoDB Atlas — set if using MongoDB instead of SQLite
# MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority

# (Optional) Google OAuth
# GOOGLE_CLIENT_ID=your-google-client-id
# GOOGLE_CLIENT_SECRET=your-google-client-secret

# (Optional) Facebook OAuth
# FACEBOOK_APP_ID=your-facebook-app-id
# FACEBOOK_APP_SECRET=your-facebook-app-secret
```

### Step 4: Deploy
Railway will automatically detect `railway.json` and `Dockerfile`, build the React frontend, set up Python 3.11 with audio libraries, and launch the service!

Once deployed, Railway will generate a public domain URL (e.g. `https://sonicsentinel-production.up.railway.app`).

---

## 🔒 Post-Deployment Verification

1. Open your Railway deployment domain in a browser.
2. Log in to the **Admin Dashboard** at `/admin/login` using your `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. Test public user registration — verify it creates a normal `USER` account.
4. Upload an audio clip to test the **3-Model ML Engine** (Random Forest, SVM, CNN predictions + Ensemble verdict).

---

## 📄 Deployment Files Included in Project

- `Dockerfile`: Multi-stage production build (Node.js + Python 3.11 + ffmpeg/libsndfile)
- `railway.json`: Railway build & deployment configuration
- `Procfile`: Procfile runner fallback
- `.dockerignore`: Optimizes build speed by ignoring non-essential files
- `ml-service/requirements.txt`: Python package requirements
