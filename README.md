# 📚 History Chatbot — Backend

A Node.js + Express backend for a RAG-based history textbook chatbot. Uses Supabase for database storage and Groq (LLaMA 3.3 70B) as the AI model.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | Supabase (PostgreSQL) |
| AI Model | Groq — LLaMA 3.3 70B |
| Hosting | Railway |

---

## 📁 Project Structure

```
chatbot-backend/
├── index.js          # Main server file
├── package.json
├── .env              # Environment variables (not committed)
└── .gitignore
```

---

## ⚙️ Environment Variables

Create a `.env` file in the root of the project with the following variables:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_secret_key
GROQ_API_KEY=your_groq_api_key
PORT=3000
```

### Where to get each value

| Variable | Where to Find |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API Keys → Secret key |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys → Create API Key |
| `PORT` | Set to `3000` for local development |

---

## 🗄️ Database Setup

This project uses Supabase. Run the following SQL in **Supabase → SQL Editor** to create the required tables:

```sql
-- Textbook knowledge chunks
CREATE TABLE t_knowledge (
  knowledge_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson text,
  content text,
  keywords text[]
);

-- Chat sessions per user
CREATE TABLE t_chat (
  chat_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  title text DEFAULT 'New Chat',
  created_at timestamp DEFAULT now()
);

-- Messages per chat
CREATE TABLE t_message (
  message_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id uuid REFERENCES t_chat(chat_id),
  role text CHECK (role IN ('user', 'assistant')),
  content text,
  created_at timestamp DEFAULT now()
);
```

Also disable RLS for all three tables (backend uses service role key):

```sql
ALTER TABLE t_knowledge DISABLE ROW LEVEL SECURITY;
ALTER TABLE t_chat      DISABLE ROW LEVEL SECURITY;
ALTER TABLE t_message   DISABLE ROW LEVEL SECURITY;
```

---

## 📄 PDF Ingestion

To upload the textbook content to Supabase, use the separate ingestion script:

```
pdf-ingest/
├── ingest.js
├── package.json
└── textbook.pdf     ← place your PDF here
```

### Setup

```bash
mkdir pdf-ingest && cd pdf-ingest
npm init -y
npm install pdfjs-dist @supabase/supabase-js
```

Update `ingest.js` with your Supabase URL and anon key, then run:

```bash
node ingest.js
```

This extracts text from the PDF, splits it into ~400 word chunks, and uploads them to the `t_knowledge` table.

---

## 🚀 Local Development

```bash
# Install dependencies
npm install

# Start the server
node index.js
```

Server runs on `http://localhost:3000`

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check |
| `POST` | `/api/chats/new` | Create a new chat session |
| `GET` | `/api/chats/:userId` | Get all chats for a user |
| `GET` | `/api/messages/:chatId` | Get all messages in a chat |
| `POST` | `/api/chat` | Send a message and get AI reply |
| `PATCH` | `/api/chats/:chatId/title` | Update chat title |
| `DELETE` | `/api/chats/:chatId` | Delete a chat and its messages |

### Request Bodies

**POST `/api/chats/new`**
```json
{ "userId": "uuid" }
```

**POST `/api/chat`**
```json
{
  "userId": "uuid",
  "chatId": "uuid",
  "message": "Who is Gamika?"
}
```

**PATCH `/api/chats/:chatId/title`**
```json
{ "title": "Who is Gamika..." }
```

---

## ☁️ Deploying to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
3. Select this repository
4. Go to **Variables** tab and add all 4 environment variables
5. Go to **Settings → Networking → Generate Domain**
6. Copy the generated URL — this is your `VITE_API_URL` for the frontend

---

## 🔗 Related

- [Frontend Repository](https://github.com/MirajChathuranga/chatbot-frontend)
- [Supabase](https://supabase.com)
- [Groq Console](https://console.groq.com)
- [Railway](https://railway.app)
