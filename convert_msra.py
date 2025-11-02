import json
import uuid

# === INPUT & OUTPUT PATHS ===
input_path = "data/msra_questions.json"
output_path = "data/msra_questions_converted.json"

with open(input_path, "r", encoding="utf-8") as f:
    data = json.load(f)

converted = []
for i, q in enumerate(data, start=1):
    # Extract explanation text if nested structure exists
    explanation = ""
    if isinstance(q.get("correct_answer_explanation_sections"), dict):
        parts = q["correct_answer_explanation_sections"]
        exp_parts = []
        for key in ["explanation", "key_points", "clinical_relevance", "memory_anchor"]:
            val = parts.get(key)
            if not val:
                continue
            # Handle lists in key_points
            if isinstance(val, list):
                val = "\n".join(f"- {v}" for v in val)
            exp_parts.append(f"**{key.replace('_',' ').title()}**\n{val}")
        explanation = "\n\n".join(exp_parts)

    new_item = {
        "id": str(uuid.uuid4()),
        "question_number": q.get("question_number", i),
        "question": q.get("question", "").strip(),
        "options": q.get("options", []),
        "correct_answer": q.get("correct_answer", ""),
        "explanation": explanation,
        "bullet_explanations": q.get("bullet_explanations", {}),
        "category": q.get("category", ""),
        "subsection": q.get("subsection", ""),
        "subsubsection": q.get("subsubsection", ""),
        "topic": q.get("topic", ""),
        "keywords": q.get("keywords", []),
        "difficulty": q.get("difficulty", ""),
        "references": q.get("references", []),
        "is_flashcard": False
    }

    converted.append(new_item)

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(converted, f, indent=2, ensure_ascii=False)

print(f"✅ Converted {len(converted)} questions → {output_path}")
