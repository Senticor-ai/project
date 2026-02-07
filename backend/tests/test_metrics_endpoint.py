def test_metrics_endpoint_exposes_prometheus_metrics(client):
    response = client.get("/metrics")

    assert response.status_code == 200
    assert "text/plain" in response.headers.get("content-type", "")

    body = response.text
    assert "http_server_requests_total" in body
    assert 'app_queue_depth{queue="outbox_events"}' in body
    assert 'app_queue_depth{queue="push_outbox"}' in body
    assert 'app_queue_depth{queue="import_jobs"}' in body
    assert 'app_queue_depth{queue="search_index_jobs"}' in body
