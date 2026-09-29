"""The API must only ever fetch symbols from the curated universe."""
from fastapi.testclient import TestClient

from backend import api
from backend.main import app

client = TestClient(app)


def test_prices_for_a_symbol_outside_the_universe_is_404_without_fetching(monkeypatch):
    def must_not_fetch(*args, **kwargs):
        raise AssertionError("load_history should not be called")

    monkeypatch.setattr(api.cache, "load_history", must_not_fetch)
    res = client.get("/api/prices/TSLA")

    assert res.status_code == 404
    assert "universe" in res.json()["detail"]


def test_quotes_ignores_symbols_outside_the_universe(monkeypatch):
    requested = []

    def fake_quote(symbol, **_):
        requested.append(symbol)
        return {"ticker": symbol, "price": 1.0, "currency": "USD", "timestamp": "2026-01-01T00:00:00Z"}

    monkeypatch.setattr(api.cache, "load_latest_quote", fake_quote)
    res = client.get("/api/quotes", params={"tickers": "vti,TSLA,NOTREAL,VTI,bnd"})

    assert res.status_code == 200
    assert sorted(requested) == ["BND", "VTI"]
    assert set(res.json()["quotes"]) == {"BND", "VTI"}


def test_recommend_rejects_symbols_outside_the_universe():
    res = client.post("/api/recommend", json={"tickers": ["VTI", "TSLA"]})
    assert res.status_code == 422
