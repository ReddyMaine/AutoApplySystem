import re
import unicodedata

STOP = {"de", "da", "do", "com", "para", "uma", "uns", "das", "dos", "and", "the", "for", "you", "are", "que", "em", "por", "nos", "nas", "seu", "sua", "our"}


def tokens(text: str) -> set[str]:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return {t for t in re.findall(r"[a-z0-9+#.]{2,}", text) if t not in STOP}


def calculate_match(profile: dict, job: dict) -> tuple[float, list[str]]:
    skills = [s.lower() for s in profile.get("skills", []) if isinstance(s, str)]
    description = str(job.get("description", ""))
    title = str(job.get("title", ""))
    target = tokens(description + " " + title)
    title_tokens = tokens(title)
    candidate = tokens(" ".join(skills) + " " + str(profile.get("summary", "")) + " " + str(profile.get("title", "")))
    for exp in profile.get("experiences", []):
        if isinstance(exp, dict):
            candidate |= tokens(" ".join(str(v) for v in exp.values()))
    matched_skills = [s for s in skills if tokens(s) and tokens(s).issubset(target)]
    skill_score = len(matched_skills) / max(1, len(skills)) if skills else 0
    title_score = len(candidate & title_tokens) / max(1, len(title_tokens))
    overlap = len(candidate & target) / max(1, len(target))
    mode = profile.get("modality", "any")
    job_mode = job.get("modality", "not_specified")
    mode_ok = mode in ("any", "", None) or job_mode in ("not_specified", mode)
    score = round(100 * (0.45 * skill_score + 0.35 * title_score + 0.2 * min(overlap * 3, 1)), 1)
    if not mode_ok:
        score = min(score, 45)
    reasons = []
    if matched_skills:
        reasons.append("Competências compatíveis: " + ", ".join(matched_skills[:6]))
    if title_score > 0:
        reasons.append("Alinhamento entre experiência/perfil e cargo")
    if not mode_ok:
        reasons.append("Modalidade diferente da preferência cadastrada")
    if not reasons:
        reasons.append("Poucas evidências de compatibilidade no perfil cadastrado")
    return score, reasons
