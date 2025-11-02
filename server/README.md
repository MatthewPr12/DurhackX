# Quiz Game Backend (FastAPI + SQLite)

This folder contains the **FastAPI backend** for the brick-breaker IQ quiz game.  
It serves questions, validates answers, and posts results into **TalkJS chat**.

---

## 🚀 Quick Start

### Create and activate a virtual environment
```bash
python3.12 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
```

### Install dependencies
```bash
pip install -r requirements.txt
```
### Seed the database
#### Option A (CSV):
```bash
python seed_csv.py
```
#### Option B (python list):
todo: implement

This creates `quiz.db` with a few sample questions.

### Run the FastAPI server
```bash
uvicorn app:app --reload --port 8001
```
The API is now live at http://127.0.0.1:8001

## 🧭 API Endpoints

| Method | Endpoint | Description |
|--------|-----------|--------------|
| `GET`  | `/questions/next?after_id=<optional>` | Get the first or next question |
| `POST` | `/answer` | Validate an answer, return result and next question |

Open the interactive docs at **http://127.0.0.1:8001/docs**  
There you can test the endpoints directly.

---

## 💬 TalkJS integration (chat grading)

To have the backend grade answers that are typed in TalkJS chat (e.g. "A" or "1"), you need to expose a webhook that TalkJS can reach and configure credentials.

### 1) Set environment variables (server)
Create `server/.env` (use `.env.example` as a template):

```
TALKJS_APP_ID=your_app_id
TALKJS_SECRET=sk_test_your_secret
# Optional: prefer the Durhack host during the event
TALKJS_API_ORIGIN=https://api-durhack.talkjs.com
```

Restart the server so it picks these up.

### 2) Set environment variable (frontend)
In the Next.js app, set your public app id so the chat can connect:

```
NEXT_PUBLIC_TALKJS_APP_ID=your_app_id
```

### 3) Expose your local server and configure the webhook
TalkJS needs to reach your machine. Use a tunnel like ngrok:

```bash
ngrok http 8001
```

Copy the HTTPS URL that ngrok prints, e.g. `https://abc123.ngrok.io`.

In the TalkJS dashboard (Webhooks):
- Set the webhook URL to: `https://abc123.ngrok.io/webhooks/talkjs`
- Enable the `message.sent` event
- Set the signing secret to the same `TALKJS_SECRET` you used above

Our webhook endpoint verifies `X-TalkJS-Signature` and `X-TalkJS-Timestamp`. If the secret isn’t set or mismatched, you’ll get `401 Invalid webhook signature`.

### 4) Use the conversation id `quiz_room_2`
Both the frontend (`engine/constants.ts`) and backend are configured to use the same conversation id: `quiz_room_2`.

### 5) End-to-end test
1. Start the FastAPI server on `:8001`.
2. Start ngrok and configure the webhook in the TalkJS dashboard.
3. Open the chat UI at `http://localhost:3000/chat` and send `A` (or `1`).
4. The server will receive `message.sent` at `/webhooks/talkjs`, grade against the current question, and post a reply as `System Bot` via the TalkJS API. You should see "✅ Correct" or "❌ Incorrect" appear in the chat.

Troubleshooting:
- If you see `APP_ID = None` or `SECRET startswith sk_test? = False` in the server logs, your `.env` isn’t set or loaded.
- If the webhook never arrives, ensure you’re using the ngrok HTTPS URL in the TalkJS dashboard and that `ngrok` is running.
- If the webhook gets `401`, the signing secret is missing or mismatched.
