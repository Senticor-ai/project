import os
import socket
import sys
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, urlparse, urlunparse

import httpx
import psycopg
import pytest
import uvicorn
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from psycopg import sql

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
sys.path.insert(0, str(ROOT_DIR / "backend"))


def _build_base_db_url() -> str | None:
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return database_url

    password = os.environ.get("POSTGRES_PASSWORD")
    if not password:
        return None

    user = os.environ.get("POSTGRES_USER", "terminandoyo")
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    database = os.environ.get("POSTGRES_DB", "terminandoyo")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def _with_search_path(database_url: str, schema: str) -> str:
    parsed = urlparse(database_url)
    query = parse_qs(parsed.query)
    options = query.get("options", [])
    search_option = f"-c search_path={schema}"
    if options:
        options[0] = f"{options[0]} {search_option}"
    else:
        options = [search_option]
    query["options"] = options
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True, quote_via=quote)))


@pytest.fixture(scope="session")
def test_database_url(tmp_path_factory):
    base_url = _build_base_db_url()
    if not base_url:
        pytest.skip("DATABASE_URL or POSTGRES_PASSWORD not configured")

    schema = f"test_{uuid.uuid4().hex}"
    try:
        with psycopg.connect(base_url) as conn:
            with conn.cursor() as cur:
                cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            conn.commit()
    except psycopg.OperationalError:
        pytest.skip("Postgres not reachable on DATABASE_URL")

    test_url = _with_search_path(base_url, schema)
    os.environ["DATABASE_URL"] = test_url
    os.environ["FILE_STORAGE_PATH"] = str(tmp_path_factory.mktemp("storage"))
    os.environ.setdefault("VAPID_PUBLIC_KEY", "test-public")
    os.environ.setdefault("VAPID_PRIVATE_KEY", "test-private")
    os.environ.setdefault("VAPID_SUBJECT", "mailto:test@example.com")
    os.environ.setdefault("SESSION_TTL_SECONDS", "60")
    os.environ.setdefault("SESSION_REFRESH_TTL_DAYS", "7")
    os.environ.setdefault("SESSION_BIND_IP", "true")
    os.environ.setdefault("SESSION_BIND_USER_AGENT", "true")
    os.environ.setdefault("SESSION_ROLL_IP_ON_REFRESH", "true")
    os.environ.setdefault("SESSION_ROLL_UA_ON_REFRESH", "true")
    os.environ.setdefault("TRUST_PROXY_HEADERS", "true")

    try:
        yield test_url
    finally:
        try:
            with psycopg.connect(base_url) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema))
                    )
                conn.commit()
        except psycopg.OperationalError:
            pass


@pytest.fixture(scope="session")
def app(test_database_url):
    from app.db import run_sql_file

    schema_path = ROOT_DIR / "backend" / "db" / "schema.sql"
    run_sql_file(schema_path)

    from app.main import app as fastapi_app

    return fastapi_app


@pytest.fixture()
def client(app):
    return TestClient(app)


@pytest.fixture()
def auth_client(client):
    email = f"user-{uuid.uuid4().hex}@example.com"
    username = f"user-{uuid.uuid4().hex}"
    password = "Testpass1!"

    response = client.post(
        "/auth/register",
        json={"email": email, "username": username, "password": password},
    )
    assert response.status_code == 200

    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    payload = response.json()
    org_id = payload.get("default_org_id")
    assert org_id
    client.headers.update({"X-Org-Id": org_id})

    return client


def _get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session")
def api_base_url(app):
    port = _get_free_port()
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False,
        ws="none",
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            response = httpx.get(f"{base_url}/health", timeout=0.2)
            if response.status_code == 200:
                break
        except Exception:
            time.sleep(0.1)
    else:
        server.should_exit = True
        thread.join(timeout=5)
        raise RuntimeError("API server failed to start")

    yield base_url

    server.should_exit = True
    thread.join(timeout=5)
