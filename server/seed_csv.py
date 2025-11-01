import csv
from models import engine, Question, SQLModel, Session

# CSV columns: text, answers|pipe|separated, correct_index
with Session(engine) as s:
    with open("questions.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            answers = [a.strip() for a in row["answers"].split("|")]
            q = Question(text=row["text"], answers=answers, correct_index=int(row["correct_index"]))
            s.add(q)
    s.commit()
print("Seeded.")