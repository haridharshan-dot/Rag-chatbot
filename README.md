# College RAG Chatbot (Student + Live Agent)

Production-style full-stack chatbot for college admissions support with:

- Student chat widget (React)
- RAG-powered bot answers (Node + LangChain + Anthropic)
- Live human handoff (Socket.IO)
- Agent handoff APIs and realtime events for your existing staff dashboard
- MongoDB-backed chat sessions and history

## Architecture

### Core parts

1. Student Widget
2. RAG Engine
3. Agent Handoff Layer

### Runtime flow

1. Student sends a question.
2. Backend retrieves similar dataset chunks from vector store.
3. Claude generates a context-grounded reply.
4. If confidence is low, UI suggests escalation.
5. Student requests live help.
6. Agent queue updates in real time.
7. Agent joins and chats live over Socket.IO.
8. Conversation can be marked resolved.

## Project Structure

```text
.
├── client/                  # React app (student + agent UI)
│   ├── src/components/
│   ├── src/pages/
│   └── src/api.js
├── server/                  # Express + Socket.IO + Mongo
│   ├── src/config/
│   ├── src/models/
│   ├── src/routes/
│   ├── src/services/rag/
│   ├── src/socket/
│   └── src/scripts/ingestData.js
├── data/sample/             # Knowledge base source files
├── docker-compose.yml
└── .env.example
```

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Real-time: Socket.IO
- AI: Anthropic Claude API via LangChain
- RAG Framework: LangChain (splitter, embeddings interface, vector retrieval, prompting)
- Vector Retrieval: LangChain MemoryVectorStore
- Database: MongoDB

## Existing Dashboard Integration

If your student dashboard is already built, mount only the chatbot widget component:

- Use [client/src/components/EmbeddedStudentChatbot.jsx](client/src/components/EmbeddedStudentChatbot.jsx)
- It auto-creates chat sessions and renders the floating chatbot panel.
- Keep your existing dashboard UI untouched.

Example:

```jsx
import EmbeddedStudentChatbot from "./components/EmbeddedStudentChatbot";

export default function ExistingDashboard() {
	return (
		<div>
			{/* your existing dashboard content */}
			<EmbeddedStudentChatbot studentId="student-123" />
		</div>
	);
}
```

If `studentId` is omitted, it is generated and persisted in localStorage.

## Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Important keys:

- `ANTHROPIC_API_KEY`: Required for live Claude responses.
- `MONGO_URI`: MongoDB connection string.
- `CLIENT_URL`: Frontend URL used by CORS and Socket.IO.
- `RAG_CONFIDENCE_THRESHOLD`: Lower threshold reduces escalations.
- `AGENT_USERNAME` / `AGENT_PASSWORD`: Agent login credentials for dashboard/API access.
- `VECTOR_DB_PROVIDER`: Use `pinecone` for production retrieval or `local` for in-memory mode.

## Local Development

Install dependencies:

```bash
npm install
```

Ingest data into vector store:

```bash
npm run ingest
```

JSON datasets are supported. Place `.json` files in your data folder and ingestion will flatten + chunk them for retrieval.

LangChain retrieval supports Pinecone in production (`VECTOR_DB_PROVIDER=pinecone`). If Pinecone is unavailable at boot time, the server automatically falls back to local in-memory retrieval to keep chatbot service online.

Run client and server:

```bash
npm run dev
```

App URLs:

- Student UI: `http://localhost:5173/`
- Agent UI (demo console): `http://localhost:5173/agent`
- API health: `http://localhost:5001/api/health`

## Docker Deployment

Start full stack:

```bash
docker compose up --build
```

Services:

- Client (Nginx): `http://localhost:4173`
- Server API: `http://localhost:5001`
- MongoDB: `localhost:27017`

## Hosted Testing (Recommended)

For the quickest real-world test with live agent handoff:

1. Host backend on Render (supports WebSockets).
2. Host frontend on Vercel.
3. Use MongoDB Atlas or Render managed Mongo.

### Why this combo

- Socket.IO live chat works reliably on Render web services.
- Vercel gives fast static hosting for the Vite client.
- Easy environment variable setup on both platforms.

### Deploy backend (Render)

Create a Web Service pointing to this repo and use:

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`

Set backend env vars:

- `NODE_ENV=production`
- `PORT=5001`
- `MONGO_URI=<your mongo uri>`
- `CLIENT_URL=<your vercel frontend url>`
- `ANTHROPIC_API_KEY=<your anthropic key>`
- `JWT_SECRET=<strong random secret>`
- `AGENT_USERNAME=<agent username>`
- `AGENT_PASSWORD=<agent password>`
- `VECTOR_DB_PROVIDER=local` (or `pinecone` with pinecone keys)

After deploy, note your API host:

- `https://<render-service>.onrender.com`

### Deploy frontend (Vercel)

Create a Vercel project with:

- Root Directory: `client`
- Framework: `Vite`

Set frontend env vars:

- `VITE_API_BASE_URL=https://<render-service>.onrender.com/api`
- `VITE_SOCKET_URL=https://<render-service>.onrender.com`

Deploy and note frontend URL:

- `https://<your-app>.vercel.app`

### Final wiring check

1. Update Render `CLIENT_URL` to your final Vercel URL.
2. Open Vercel app and send a student message.
3. Visit `/agent`, log in with `AGENT_USERNAME`/`AGENT_PASSWORD`, and verify live handoff.

### Alternative hosts

- Railway (backend + Mongo), Vercel (frontend)
- Fly.io (backend), MongoDB Atlas, Netlify/Vercel (frontend)

## API Summary

### Chat

- `POST /api/chat/session` create session
- `POST /api/chat/:sessionId/message` student message + bot answer
- `GET /api/chat/:sessionId/history` full conversation
- `POST /api/chat/:sessionId/escalate` request human help

### Agent

- `GET /api/agent/queue` waiting sessions
- `POST /api/agent/:sessionId/join` agent joins session
- `POST /api/agent/:sessionId/message` agent reply
- `POST /api/agent/:sessionId/resolve` close conversation

## Production Hardening Checklist

- Add authentication/authorization for student and agent roles.
- Replace demo local vector store with Pinecone/Chroma deployment.
- Add structured logging and tracing.
- Add Redis adapter for multi-instance Socket.IO.
- Add integration tests (API + socket flows).
- Add CI/CD with image scans and secret management.
- Add PII scrubbing and retention policies.

## Development Phases Map

1. RAG pipeline: implemented with ingest + retrieval + Claude answer generation.
2. Student widget: implemented with escalation UX.
3. Escalation logic: implemented via confidence and manual action.
4. Agent dashboard + live messaging: implemented with Socket.IO.
5. End-to-end wiring: implemented with Docker, docs, and scripts.
