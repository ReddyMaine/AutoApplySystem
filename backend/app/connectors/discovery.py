import hashlib
import ipaddress
import json
import re
import socket
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup
from app.config import get_settings

VALID_TOKEN = re.compile(r"^[a-zA-Z0-9_.-]{2,80}$")
USER_AGENT = "AutoApplyJobReader/0.2 (+https://localhost/autoapply)"


def plain(html: str) -> str:
    return BeautifulSoup(html or "", "html.parser").get_text(" ", strip=True)[:25000]


def infer_modality(location: str = "", description: str = "") -> str:
    haystack = f"{location} {description[:1200]}".lower()
    if any(k in haystack for k in ("híbrido", "hibrido", "hybrid")):
        return "hybrid"
    if any(k in haystack for k in ("remoto", "remote", "home office", "anywhere", "work from home", "100% remoto")):
        return "remote"
    if any(k in haystack for k in ("presencial", "on-site", "onsite", "in-office")):
        return "onsite"
    return "not_specified"


def infer_seniority(title: str = "", description: str = "") -> str:
    haystack = f"{title} {description[:600]}".lower()
    if re.search(r"\b(est[aá]gio|estagi[aá]ri[oa]|intern|internship)\b", haystack):
        return "intern"
    if re.search(r"\b(staff|principal|architect|arquiteto|head|director)\b", haystack):
        return "lead"
    if re.search(r"\b(s[eê]nior|senior|sr\.?|lead|tech lead|especialista)\b", haystack):
        return "senior"
    if re.search(r"\b(pleno|mid[- ]?level|middle)\b", haystack):
        return "pleno"
    if re.search(r"\b(j[uú]nior|junior|jr\.?|entry[- ]?level|trainee)\b", haystack):
        return "junior"
    return "not_specified"


def demo_jobs() -> list[dict]:
    data = [
        ("python-backend", "Desenvolvedor(a) Backend Python", "Acme Tech", "Remoto - Brasil", "remote", "pleno", "Desenvolvimento de APIs com Python, FastAPI, PostgreSQL, Redis e Docker. Experiência com testes, Git e CI/CD."),
        ("ai-engineer", "AI Engineer - RAG e Agentes", "Nova IA", "São Paulo / Híbrido", "hybrid", "senior", "Projetos de inteligência artificial com Python, LangChain, LangGraph, embeddings, RAG, avaliação de prompts e PostgreSQL."),
        ("fullstack", "Full Stack Developer", "Orion Systems", "Remoto", "remote", "pleno", "Desenvolvimento React, TypeScript, Node.js, Python, Docker e AWS."),
        ("data-eng", "Engenheiro(a) de Dados", "Atlas Data", "São Paulo", "onsite", "junior", "Python, SQL, Airflow, Pandas, modelagem de dados e pipelines de ETL."),
        ("platform", "DevOps / Platform Engineer", "Cloudstack", "Remoto", "remote", "senior", "Kubernetes, Docker, Terraform, AWS, observabilidade, CI/CD e automação."),
    ]
    return [
        {
            "source": "sandbox",
            "external_id": ext,
            "title": title,
            "company": company,
            "location": loc,
            "modality": mode,
            "seniority": seniority,
            "description": desc,
            "url": f"/sandbox/jobs/{ext}",
            "requirements": {},
        }
        for ext, title, company, loc, mode, seniority, desc in data
    ]


def greenhouse_jobs(board: str, client: httpx.Client) -> list[dict]:
    if not VALID_TOKEN.fullmatch(board):
        return []
    r = client.get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs", params={"content": "true"})
    r.raise_for_status()
    rows = []
    for job in r.json().get("jobs", [])[:300]:
        title = job.get("title", "Vaga")
        location = (job.get("location") or {}).get("name", "Não informado")
        desc = plain(job.get("content", ""))
        rows.append(
            {
                "source": "greenhouse",
                "external_id": f"{board}:{job['id']}",
                "title": title[:300],
                "company": board[:200],
                "location": location[:200],
                "modality": infer_modality(location, desc),
                "seniority": infer_seniority(title, desc),
                "description": desc,
                "url": job.get("absolute_url", ""),
                "requirements": {},
            }
        )
    return rows


def lever_jobs(site: str, client: httpx.Client) -> list[dict]:
    if not VALID_TOKEN.fullmatch(site):
        return []
    r = client.get(f"https://api.lever.co/v0/postings/{site}", params={"mode": "json", "limit": 100})
    r.raise_for_status()
    rows = []
    for job in r.json()[:100]:
        cats = job.get("categories") or {}
        title = job.get("text", "Vaga")
        location = cats.get("location", "Não informado")
        desc = plain(job.get("descriptionPlain", "") or job.get("description", ""))
        rows.append(
            {
                "source": "lever",
                "external_id": f"{site}:{job['id']}",
                "title": title[:300],
                "company": site[:200],
                "location": location[:200],
                "modality": infer_modality(location, desc),
                "seniority": infer_seniority(title, desc),
                "description": desc,
                "url": job.get("hostedUrl", ""),
                "requirements": {},
            }
        )
    return rows


def ashby_jobs(board: str, client: httpx.Client) -> list[dict]:
    if not VALID_TOKEN.fullmatch(board):
        return []
    r = client.get(f"https://api.ashbyhq.com/posting-api/job-board/{board}")
    r.raise_for_status()
    rows = []
    for job in r.json().get("jobs", [])[:200]:
        title = job.get("title", "Vaga")
        location = job.get("location", "Não informado") or "Não informado"
        desc = plain(job.get("descriptionPlain", "") or job.get("descriptionHtml", ""))
        modality = "remote" if job.get("isRemote") else infer_modality(location, desc)
        rows.append(
            {
                "source": "ashby",
                "external_id": f"{board}:{job['id']}",
                "title": title[:300],
                "company": board[:200],
                "location": location[:200],
                "modality": modality,
                "seniority": infer_seniority(title, desc),
                "description": desc,
                "url": job.get("jobUrl", ""),
                "requirements": {},
            }
        )
    return rows


def remotive_jobs(client: httpx.Client, limit: int = 40) -> list[dict]:
    r = client.get("https://remotive.com/api/remote-jobs", params={"limit": limit})
    r.raise_for_status()
    rows = []
    for job in r.json().get("jobs", [])[:limit]:
        title = job.get("title", "Vaga")
        company = job.get("company_name", "Empresa")
        location = job.get("candidate_required_location") or "Remoto"
        desc = plain(job.get("description", ""))
        rows.append(
            {
                "source": "remotive",
                "external_id": f"remotive:{job['id']}",
                "title": title[:300],
                "company": company[:200],
                "location": location[:200],
                "modality": "remote",
                "seniority": infer_seniority(title, desc),
                "description": desc,
                "url": job.get("url", ""),
                "requirements": {},
            }
        )
    return rows


def arbeitnow_jobs(client: httpx.Client, limit: int = 40) -> list[dict]:
    r = client.get("https://www.arbeitnow.com/api/job-board-api")
    r.raise_for_status()
    rows = []
    for job in r.json().get("data", [])[:limit]:
        title = job.get("title", "Vaga")
        company = job.get("company_name", "Empresa")
        location = job.get("location") or "Não informado"
        desc = plain(job.get("description", ""))
        modality = "remote" if job.get("remote") else infer_modality(location, desc)
        rows.append(
            {
                "source": "arbeitnow",
                "external_id": f"arbeitnow:{job.get('slug', hashlib.sha256(title.encode()).hexdigest()[:16])}",
                "title": title[:300],
                "company": company[:200],
                "location": location[:200],
                "modality": modality,
                "seniority": infer_seniority(title, desc),
                "description": desc,
                "url": job.get("url", ""),
                "requirements": {},
            }
        )
    return rows


def _is_public_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_public_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("URL deve começar com http:// ou https://")
    if not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("URL inválida")
    if parsed.port not in (None, 80, 443):
        raise ValueError("Apenas portas padrão 80/443 são permitidas")
    host = parsed.hostname.lower().rstrip(".")
    if host in {"localhost"} or host.endswith((".local", ".internal", ".localhost")):
        raise ValueError("Host local ou interno não é permitido")
    # Literal IP check before DNS resolution
    try:
        literal_ip = ipaddress.ip_address(host)
    except ValueError:
        literal_ip = None
    if literal_ip is not None:
        if not _is_public_ip(str(literal_ip)):
            raise ValueError("Endereço IP não público não é permitido")
        return url.strip()
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise ValueError("Não foi possível resolver o domínio da URL")
    if not infos or not all(_is_public_ip(info[4][0]) for info in infos):
        raise ValueError("O domínio aponta para endereço privado ou indisponível")
    return url.strip()


def _extract_job_posting_ld(soup: BeautifulSoup) -> dict | None:
    def walk(node):
        if isinstance(node, list):
            for item in node:
                found = walk(item)
                if found:
                    return found
        elif isinstance(node, dict):
            node_type = node.get("@type")
            types = node_type if isinstance(node_type, list) else [node_type]
            if any(isinstance(t, str) and t.lower() == "jobposting" for t in types):
                return node
            if "@graph" in node:
                return walk(node["@graph"])
        return None

    for script in soup.find_all("script", type="application/ld+json"):
        raw = script.string or script.get_text() or ""
        if not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        found = walk(data)
        if found:
            return found
    return None


def parse_job_html(url: str, html_body: str) -> dict:
    soup = BeautifulSoup(html_body or "", "html.parser")
    host = (urlparse(url).hostname or "site").replace("www.", "")
    ld = _extract_job_posting_ld(soup)

    title = ""
    company = ""
    location = ""
    description = ""
    modality = "not_specified"

    if ld:
        title = str(ld.get("title") or "").strip()
        org = ld.get("hiringOrganization")
        if isinstance(org, dict):
            company = str(org.get("name") or "").strip()
        elif isinstance(org, str):
            company = org.strip()
        loc = ld.get("jobLocation")
        if isinstance(loc, list) and loc:
            loc = loc[0]
        if isinstance(loc, dict):
            addr = loc.get("address")
            if isinstance(addr, dict):
                parts = [addr.get("addressLocality"), addr.get("addressRegion"), addr.get("addressCountry")]
                location = ", ".join(str(p) for p in parts if p)
            elif isinstance(addr, str):
                location = addr
        if str(ld.get("jobLocationType") or "").upper() == "TELECOMMUTE":
            modality = "remote"
        description = plain(str(ld.get("description") or ""))

    def meta_content(attr: str, val: str) -> str:
        tag = soup.find("meta", attrs={attr: val})
        return str(tag.get("content") or "").strip() if tag else ""

    if not title:
        title = meta_content("property", "og:title") or (soup.title.get_text(strip=True) if soup.title else "")
        if not title:
            h1 = soup.find("h1")
            title = h1.get_text(" ", strip=True) if h1 else "Vaga importada"
    if not company:
        company = meta_content("property", "og:site_name") or host.split(".")[0].capitalize()
    if not description:
        og_desc = meta_content("property", "og:description") or meta_content("name", "description")
        main = soup.find("main") or soup.find("article") or soup.body
        body_text = main.get_text(" ", strip=True)[:8000] if main else ""
        description = body_text if len(body_text) > len(og_desc) else og_desc
    if not location:
        location = "Remoto" if modality == "remote" else "Não informado"
    if modality == "not_specified":
        modality = infer_modality(location, description)

    ext_id = hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]
    return {
        "source": "url_import",
        "external_id": ext_id,
        "title": title[:300] or "Vaga importada",
        "company": company[:200] or host,
        "location": location[:200],
        "modality": modality,
        "seniority": infer_seniority(title, description),
        "description": description[:25000],
        "url": url,
        "requirements": {},
    }


def import_job_from_url(url: str) -> dict:
    current_url = validate_public_url(url)
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"}
    with httpx.Client(timeout=14, follow_redirects=False, headers=headers) as client:
        for _ in range(4):
            resp = client.get(current_url)
            if resp.status_code in {301, 302, 303, 307, 308} and resp.headers.get("location"):
                next_url = urljoin(current_url, resp.headers["location"])
                current_url = validate_public_url(next_url)
                continue
            resp.raise_for_status()
            return parse_job_html(current_url, resp.text)
    raise ValueError("Muitos redirecionamentos ao ler a URL da vaga")


def discover() -> tuple[list[dict], list[str]]:
    s = get_settings()
    jobs = demo_jobs() if s.demo_seed else []
    errors = []
    with httpx.Client(timeout=14, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
        for board in filter(None, (x.strip() for x in s.greenhouse_boards.split(","))):
            try:
                jobs.extend(greenhouse_jobs(board, client))
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                errors.append(f"Greenhouse/{board}: {type(exc).__name__}")
        for site in filter(None, (x.strip() for x in s.lever_sites.split(","))):
            try:
                jobs.extend(lever_jobs(site, client))
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                errors.append(f"Lever/{site}: {type(exc).__name__}")
        for board in filter(None, (x.strip() for x in s.ashby_boards.split(","))):
            try:
                jobs.extend(ashby_jobs(board, client))
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                errors.append(f"Ashby/{board}: {type(exc).__name__}")
        if s.remotive_enabled:
            try:
                jobs.extend(remotive_jobs(client))
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                errors.append(f"Remotive: {type(exc).__name__}")
        if s.arbeitnow_enabled:
            try:
                jobs.extend(arbeitnow_jobs(client))
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                errors.append(f"Arbeitnow: {type(exc).__name__}")
    return jobs, errors
