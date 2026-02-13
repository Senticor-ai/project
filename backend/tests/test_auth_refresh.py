import uuid


def _register_and_login(client, headers):
    email = f"user-{uuid.uuid4().hex}@example.com"
    username = f"user-{uuid.uuid4().hex}"
    password = "Testpass1!"
    response = client.post(
        "/auth/register",
        json={"email": email, "username": username, "password": password},
        headers=headers,
    )
    assert response.status_code == 200

    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


def _patch_frozen(request, obj, **kwargs):
    originals = {k: getattr(obj, k) for k in kwargs}
    for key, value in kwargs.items():
        object.__setattr__(obj, key, value)

    def _restore():
        for key, value in originals.items():
            object.__setattr__(obj, key, value)

    request.addfinalizer(_restore)


def test_session_binding_and_refresh(client, request):
    from app.config import settings

    _patch_frozen(
        request,
        settings,
        trust_proxy_headers=True,
        session_bind_ip=True,
        session_bind_user_agent=True,
        session_roll_ip_on_refresh=True,
        session_roll_user_agent_on_refresh=True,
    )

    headers = {"User-Agent": "TestAgent/1.0", "X-Forwarded-For": "1.2.3.4"}
    _register_and_login(client, headers)

    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 200

    mismatched_headers = {
        "User-Agent": "TestAgent/1.0",
        "X-Forwarded-For": "5.6.7.8",
    }
    response = client.get("/auth/me", headers=mismatched_headers)
    assert response.status_code == 401

    old_session = client.cookies.get(settings.session_cookie_name)
    response = client.post("/auth/refresh", headers=mismatched_headers)
    assert response.status_code == 200
    assert response.json()["user"]["email"]
    new_session = client.cookies.get(settings.session_cookie_name)
    assert new_session and new_session != old_session

    response = client.get("/auth/me", headers=mismatched_headers)
    assert response.status_code == 200

    ua_change_headers = {"User-Agent": "TestAgent/2.0", "X-Forwarded-For": "5.6.7.8"}
    response = client.post("/auth/refresh", headers=ua_change_headers)
    assert response.status_code == 200

    response = client.get("/auth/me", headers=ua_change_headers)
    assert response.status_code == 200
