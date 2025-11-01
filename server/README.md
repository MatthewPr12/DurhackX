# Quiz Game Backend (FastAPI + SQLite)

This folder contains the **FastAPI backend** for the brick-breaker IQ quiz game.  
It serves questions, validates answers, and posts results into **TalkJS chat**.

---

## 🚀 Quick Start

### Create and activate a virtual environment
```bash
python -m venv venv
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
