from pathlib import Path
from docx import Document
from app.services.resume import rule_based_extract, read_resume


def test_heuristic_extraction_marks_for_review():
    text = "Maria Silva\nDesenvolvedora Python e FastAPI\nContato: maria@exemplo.com\nDocker, PostgreSQL, LangGraph"
    result = rule_based_extract(text)
    assert result["name"] == "Maria Silva"
    assert "Python" in result["skills"]
    assert result["contact_email"] == "maria@exemplo.com"
    assert result["requires_review"]


def test_docx_text_extraction(tmp_path: Path):
    file = tmp_path / "cv.docx"
    document = Document()
    document.add_paragraph("Currículo de teste")
    document.add_paragraph("API com FastAPI")
    document.save(file)
    assert "FastAPI" in read_resume(str(file))
