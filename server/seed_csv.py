import csv
from models import engine, Question, SQLModel, Session

with Session(engine) as s:
    with open("../data/questions.csv", newline="", encoding="utf-8") as f:
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
print("Seeded CSV into quiz.db")
