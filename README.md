# HubSpot Two-Way Email Sync

This project integrates Gmail/Outlook with HubSpot CRM to log incoming and outgoing emails, categorize them using AI, and enable direct replies from HubSpot.

## Project Structure
```
📂 hubspot_email_sync
├── 📂 backend
│   ├── app.py  # Main FastAPI backend
│   ├── email_fetcher.py  # Fetches emails from Gmail/Outlook
│   ├── hubspot_api.py  # Manages HubSpot API interactions
│   ├── ai_classifier.py  # AI-driven email classification
│   ├── database.py  # Stores email metadata
│   ├── config.py  # Stores API keys and environment variables
│   └── requirements.txt  # Python dependencies
│
├── 📂 frontend
│   ├── components
│   │   ├── EmailList.jsx  # Displays synced emails
│   │   ├── EmailDetail.jsx  # Shows detailed email view
│   │   ├── ReplyBox.jsx  # Enables replying to emails
│   ├── App.js  # Main React app
│   ├── index.js  # Entry point
│   ├── package.json  # Frontend dependencies
│
├── README.md  # Project overview
├── .env  # Environment variables
└── .gitignore  # Ignored files
```

## How to Set Up

### 1. Clone the repository:
```sh
git clone https://github.com/yourusername/hubspot_email_sync.git
cd hubspot_email_sync
```

### 2. Backend Setup (Python/FastAPI):
```sh
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

### 3. Frontend Setup (React):
```sh
cd frontend
npm install
npm start
```

### 4. Environment Variables (.env):
```
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
OUTLOOK_CLIENT_ID=your-client-id
OUTLOOK_CLIENT_SECRET=your-client-secret
HUBSPOT_API_KEY=your-hubspot-api-key
DATABASE_URL=your-database-url
```

## Features
- ✅ **Two-way email sync** with Gmail & Outlook
- 🤖 **AI-powered categorization** of emails (Sentiment & Topic)
- 📩 **HubSpot CRM email logging** (automatic contact association)
- 📬 **Reply directly from HubSpot UI**

## Next Steps
- 🔧 Add OAuth authentication
- 📊 Build a dashboard to visualize email trends
- 🛠 Optimize AI classification accuracy
