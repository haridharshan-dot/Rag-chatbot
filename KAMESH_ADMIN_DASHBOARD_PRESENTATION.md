# Kamesh Presentation Content
## Topic: Admin Dashboard and Data Storage

Use this as a complete script for college officials.
You can present this in 8 to 12 minutes.

---

## 1) Opening (30 to 45 seconds)
Good morning respected officials and faculty members.
I am Kamesh.
In this project, my role is focused on two major parts:
1. Admin Dashboard
2. Data Storage Architecture

Today I will explain how the admin panel controls the system in real time, and how our data is stored securely and efficiently for chatbot operations, live agent handoff, analytics, and reporting.

---

## 2) What the Admin Dashboard Solves (45 seconds)
The admin dashboard is the command center of the platform.
It helps administrators do five things:
1. Monitor system readiness
2. Manage chatbot knowledge base
3. Control escalation and runtime settings
4. Supervise chat sessions and agent operations
5. Generate reports and export conversation transcripts

So instead of treating this as only a chatbot UI, we designed it like an operations platform.

---

## 3) Admin Dashboard Features (Detailed Walkthrough)

### 3.1 System Readiness and Health Monitoring
In the admin panel, we provide readiness status of:
- API health
- Database health
- LLM availability
- RAG service initialization status

This allows admin users to know whether the full AI pipeline is healthy before or during live usage.

We also maintain status logs for historical tracking of:
- API up or down
- LLM up or down
- response times

This is useful for reliability review.

### 3.2 Runtime Settings Control
Admin can update runtime behavior without code changes:
- RAG Top-K retrieval value
- Confidence threshold
- Out-of-scope threshold
- Auto escalation enabled or disabled
- OTP preferred channel
- Microsoft auth related allow-list settings

This gives operational flexibility during real traffic.

### 3.3 Knowledge Base Management
Admin can:
- View dataset files
- Preview dataset content
- Upload new dataset files
- Remove outdated dataset files
- Trigger re-indexing
- Warm up RAG manually

This is important because content updates are frequent in admission scenarios.
The dashboard allows quick dataset maintenance with minimal downtime.

### 3.4 Session and Agent Operations
Admin can view sessions by state:
- queued
- active
- resolved
- bot

Admin can also:
- force-assign a session to an agent
- reopen resolved sessions
- download transcript in TXT or JSON format

This ensures every critical student query is traceable and controllable.

### 3.5 Reports and Analytics
Admin can generate range-based reports (day, week, month) with:
- total sessions
- escalated sessions
- queued, active, resolved counts
- average resolution time
- top user intents

This supports decision-making and official reviews.

---

## 4) How Data is Stored (Core Architecture)
Now I will explain data storage.
We use MongoDB for operational records and a vector store for semantic retrieval.

### 4.1 Chat Session Storage (Main Collection)
Primary collection stores one document per session.
Each session contains:
- student identity references
- current status (bot, queued, active, resolved)
- assigned agent id
- escalation timestamps
- optional site context (title, URL, headings, visible page text)
- student profile fields (cutoff, category, preferred branch, stream)
- assistant state (flow and step tracking)
- complete message history

Every message inside session keeps metadata such as:
- intent
- confidence
- sources
- escalation flags
- suggestion chips
- cards
- seen markers

This design gives full conversation traceability and supports both AI and live-agent continuity.

### 4.2 Admin Runtime Settings Storage
Admin settings are stored centrally in a settings collection.
We persist runtime controls like thresholds and escalation behavior.
So dashboard updates are persistent across restarts and deployments.

### 4.3 Status Logs Storage
Health checks are stored as periodic status logs.
This helps with auditing uptime and measuring service quality over time.

### 4.4 Agent Activity Storage
Agent login and activity summary is stored with:
- agent id
- login timestamps
- provider information
- IP metadata

This improves accountability in live support operations.

### 4.5 Student User Storage
Student user records include:
- name, email, mobile
- password hash
- OTP metadata (hash, channel, expiry, attempts)
- last login information

Sensitive fields are not stored in plain text.
We use secure hash-based storage for authentication values.

### 4.6 Knowledge and Retrieval Storage
We maintain two storage layers for RAG:
1. Source dataset files under data/sample
2. Processed chunk store and vector index

Chunk artifacts are stored in JSON storage files.
Vector retrieval is supported through local memory store and Pinecone mode for production scale.

This separation gives us:
- easy content updates
- reusable chunked knowledge
- fast semantic retrieval

---

## 5) Demo Questions for Presentation (Use These Live)
While presenting, ask these exact queries to show practical behavior:

### Demo 1: Cutoff Query
Question:
What is the cutoff for CSE for BC community?

Say:
The chatbot retrieves structured cutoff data and returns a precise community-based answer.

### Demo 2: Scholarship Query
Question:
What scholarships are available for SC students?

Say:
For finance-sensitive questions, the chatbot follows a safe policy: it does not reveal scholarship money values and instead directs users to the official Sona website for latest verified details.

### Demo 3: First Graduate Clarification
Question:
Eligibility for first graduate scholarship?

Say:
If exact latest criteria is uncertain in available data, system responsibly directs user to live admissions support.

### Demo 4: General Institutional Query
Questions:
Does college provide hostel?
Placement percentage?

Say:
General facilities and placement highlights are answered from curated institutional knowledge.

### Demo 5: Personalized Smart Query (High Impact)
Question:
I am from BC, cutoff 180, can I get CSE?

Say:
Here the assistant combines user profile parameters with recommendation flow to give a meaningful admission chance response.

### Demo 6: Edge Case -> Live Agent Trigger
Question:
I have gap years and sports quota, what to do?

Say:
This is treated as a complex admission case, so the system escalates to live counselor support automatically.

---

## 6) Important Behavior Now (Exact Points)
You can speak these lines directly:

- What scholarships are available for SC students? -> treated as finance-sensitive; chatbot directs to https://www.sonatech.ac.in/ for latest verified scholarship details.
- Eligibility for first graduate scholarship? -> treated as finance-sensitive; chatbot avoids money-related disclosure and directs to official admissions/live support.
- Does college provide hostel? and Placement percentage? -> handled via general-info intents and official highlights.
- I am from BC, cutoff 180, can I get CSE? -> handled as personalized recommendation flow.
- I have gap years and sports quota, what to do? -> triggers live-agent escalation path.

---

## 7) Why This Matters for Officials (1 minute)
This platform is not only a chatbot.
It is a governed admission support system with:
- operational monitoring
- controllable AI behavior
- data-backed responses
- secure storage and audit traceability
- human fallback for complex cases

So from an institutional perspective, this is safer, more transparent, and easier to operate at scale.

---

## 8) Closing (20 to 30 seconds)
Thank you.
This was my role covering Admin Dashboard and Data Storage.
Next, my teammate will present the full project summary and additional modules.

---

## 9) Optional Quick Q and A Answers

Q: How do you ensure wrong answers are minimized?
A: We use RAG grounding, confidence thresholds, and escalation to live agent for uncertain or complex cases.

Q: Can admin update behavior without redeployment?
A: Yes. Runtime settings and dataset operations are available from admin dashboard.

Q: Is data traceable for auditing?
A: Yes. Session transcripts, message metadata, status logs, and reports are all maintained.

Q: Is user security considered?
A: Yes. Sensitive authentication and OTP data is hash-based, and admin actions are authenticated.
