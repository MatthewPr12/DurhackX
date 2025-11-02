import csv
import os
from models import engine, Question, SQLModel, Session, init_db

def main():
    init_db()

    base_dir = os.path.dirname(__file__)
    csv_path = os.path.join(base_dir, "../data/questions.csv")

    with Session(engine) as s:
        with open(csv_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                answers = [a.strip() for a in row["answers"].split("|")]
                q = Question(
                    text=row["text"].strip(),
                    answers=answers,
                    correct_index=int(row["correct_index"]),
                    category=row.get("category"),
                    difficulty=row.get("difficulty"),
                )
                s.add(q)
        s.commit()

    print(f"✅ Seeded CSV into {engine.url.database}")

if __name__ == "__main__":
    main()
