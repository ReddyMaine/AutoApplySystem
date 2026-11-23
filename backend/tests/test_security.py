from starlette.requests import Request
from app.security import extract_token, issue_token


def _make_request(headers=None, cookies=None):
    raw_headers = []
    if headers:
        for k, v in headers.items():
            raw_headers.append((k.lower().encode(), v.encode()))
    if cookies:
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items())
        raw_headers.append((b"cookie", cookie_str.encode()))
    return Request({"type": "http", "method": "GET", "path": "/", "headers": raw_headers})


def test_extract_token_prefers_bearer_over_cookie():
    bearer = issue_token("00000000-0000-0000-0000-000000000001")
    req = _make_request(
        headers={"Authorization": f"Bearer {bearer}"},
        cookies={"access_token": "cookie-token"},
    )
    assert extract_token(req) == bearer


def test_extract_token_falls_back_to_cookie():
    req = _make_request(cookies={"access_token": "cookie-token"})
    assert extract_token(req) == "cookie-token"
