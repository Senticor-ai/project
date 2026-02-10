import uuid


def _register_user(client, email=None, username=None, password="Testpass1!"):
    email = email or f"user-{uuid.uuid4().hex}@example.com"
    username = username or f"user-{uuid.uuid4().hex}"
    return client.post(
        "/auth/register",
        json={"email": email, "username": username, "password": password},
    )


def test_register_and_login_returns_username(client):
    email = f"user-{uuid.uuid4().hex}@example.com"
    username = f"user-{uuid.uuid4().hex}"
    password = "Testpass1!"

    response = _register_user(client, email=email, username=username, password=password)
    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == email
    assert payload["username"] == username

    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == email
    assert payload["username"] == username

    response = client.get("/auth/me")
    assert response.status_code == 200
    payload = response.json()
    assert payload["email"] == email
    assert payload["username"] == username


def test_register_rejects_short_password(client):
    response = _register_user(client, password="short")
    assert response.status_code == 422


def test_register_rejects_invalid_email_domain(client):
    response = _register_user(client, email="user@invalid")
    assert response.status_code == 422


def test_register_rejects_password_without_digit_or_symbol(client):
    response = _register_user(client, password="Password")
    assert response.status_code == 422


def test_register_rejects_duplicate_username_case_insensitive(client):
    username = f"User{uuid.uuid4().hex}"
    response = _register_user(client, username=username)
    assert response.status_code == 200

    response = _register_user(
        client,
        email=f"other-{uuid.uuid4().hex}@example.com",
        username=username.lower(),
    )
    assert response.status_code == 409


def test_auth_required_for_items(client):
    response = client.get("/items")
    assert response.status_code == 401


def test_authorized_access_for_items(auth_client):
    response = auth_client.get("/items")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
