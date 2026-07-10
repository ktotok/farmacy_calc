"""Backend tests: data shape, validation rules, CRUD, cost model, CSV round-trip."""
from app.cost import all_unit_costs


def test_data_shape_and_counts(client):
    d = client.get("/api/data").json()
    assert {"items", "recipes"} == set(d)
    assert len(d["items"]) == 60  # all from CSV minus 3 removed shop items
    assert len(d["recipes"]) == 76
    item = next(i for i in d["items"] if i["id"] == "antidote")
    # typed JSON: numbers are numbers, booleans are booleans
    assert item["sell_price"] == 5.0
    assert item["components_complete"] is True
    assert item["output_qty"] == 3


def test_cost_model_anchors(client):
    d = client.get("/api/data").json()
    costs = all_unit_costs(d["items"], d["recipes"])
    # bandage = (wool*2 + fiber*15)/5 with both raws at 0  -> 0
    assert costs["bandage"] == 0
    # tonic_herbs = (ginseng 0.3 *3 + bitter_weed 0*3 + desert_sage 0*3)/1 -> 0.9
    assert abs(costs["tonic_herbs"] - 0.9) < 1e-9
    # restoring_herbs = (yarrow 0.3*3 + milkweed 0*3 + sensitive_mimosa 0*3)/1 -> 0.9
    assert abs(costs["restoring_herbs"] - 0.9) < 1e-9


def test_orphan_component_rejected(client):
    r = client.post("/api/recipes", json={"product_id": "bandage", "component_id": "nope", "quantity": 1})
    assert r.status_code == 422


def test_cycle_rejected(client):
    # sterile_bandage needs alcohol_flask; making alcohol_flask need sterile_bandage = cycle
    r = client.post("/api/recipes", json={
        "product_id": "alcohol_flask", "component_id": "sterile_bandage", "quantity": 1})
    assert r.status_code == 422
    assert "цикл" in r.json()["detail"].lower()


def test_negative_quantity_rejected(client):
    r = client.post("/api/recipes", json={"product_id": "bandage", "component_id": "honey", "quantity": -1})
    assert r.status_code == 422


def test_self_component_rejected(client):
    r = client.post("/api/recipes", json={"product_id": "bandage", "component_id": "bandage", "quantity": 1})
    assert r.status_code == 422


def test_negative_price_rejected(client):
    r = client.put("/api/items/honey", json={"buy_price": -5})
    assert r.status_code == 422


def test_item_crud_and_cascade(client):
    # create item
    assert client.post("/api/items", json={
        "id": "test_widget", "name_uk": "Тест", "type": "product", "output_qty": 1,
    }).status_code == 201
    # add a recipe component referencing it
    assert client.post("/api/recipes", json={
        "product_id": "test_widget", "component_id": "honey", "quantity": 2,
    }).status_code == 201
    # deleting the item cascades to its recipe rows
    assert client.delete("/api/items/test_widget").status_code == 204
    recs = client.get("/api/recipes").json()
    assert not any(r["product_id"] == "test_widget" for r in recs)


def test_price_batch(client):
    r = client.put("/api/items/prices/batch", json=[
        {"id": "honey", "field": "buy_price", "value": 1.25},
    ])
    assert r.status_code == 200 and r.json()["applied"] == 1
    assert client.get("/api/items/honey").json()["buy_price"] == 1.25


def test_csv_roundtrip_no_drift(client):
    before = client.get("/api/data").json()
    items_csv = client.get("/api/export/items.csv").text
    recipes_csv = client.get("/api/export/recipes.csv").text
    # re-import the exact export -> data must be identical
    assert client.post("/api/import/items", content=items_csv,
                       headers={"Content-Type": "text/plain"}).status_code == 200
    assert client.post("/api/import/recipes", content=recipes_csv,
                       headers={"Content-Type": "text/plain"}).status_code == 200
    after = client.get("/api/data").json()
    key = lambda xs, k: sorted(xs, key=lambda x: x[k])  # noqa: E731
    assert key(before["items"], "id") == key(after["items"], "id")
    assert key(before["recipes"], "product_id") == key(
        after["recipes"], "product_id")


# ---- sales ledger ----

def test_record_sale_snapshots_cost(client):
    # tonic_herbs has a known unit_cost of 0.9 (see test_cost_model_anchors)
    r = client.post("/api/sales", json={"item_id": "tonic_herbs", "quantity": 5, "unit_price": 2.0})
    assert r.status_code == 201
    sale = r.json()
    assert abs(sale["unit_cost"] - 0.9) < 1e-9
    assert sale["unit_price"] == 2.0 and sale["quantity"] == 5
    assert sale["item_name"]  # snapshotted Ukrainian name
    # revenue is derived: qty * unit_price
    assert sale["unit_price"] * sale["quantity"] == 10.0
    # shows up in the ledger
    assert any(s["id"] == sale["id"] for s in client.get("/api/sales").json())


def test_record_sale_defaults_to_item_sell_price(client):
    # antidote sells for 5.0 in the seed; omitting unit_price uses that
    r = client.post("/api/sales", json={"item_id": "antidote", "quantity": 2})
    assert r.status_code == 201
    assert r.json()["unit_price"] == 5.0


def test_sale_immutable_after_price_change_and_survives_deletion(client):
    client.post("/api/items", json={
        "id": "test_sale_item", "name_uk": "Тестовий продаж", "type": "product",
        "output_qty": 1, "sell_price": 3.0,
    })
    sale = client.post("/api/sales", json={"item_id": "test_sale_item", "quantity": 4}).json()
    assert sale["unit_price"] == 3.0
    # editing the item's price must NOT rewrite the recorded sale
    client.put("/api/items/test_sale_item", json={"sell_price": 9.0})
    got = next(s for s in client.get("/api/sales").json() if s["id"] == sale["id"])
    assert got["unit_price"] == 3.0
    # deleting the item keeps the sale row (item_id nulled, name preserved)
    assert client.delete("/api/items/test_sale_item").status_code == 204
    got = next(s for s in client.get("/api/sales").json() if s["id"] == sale["id"])
    assert got["item_id"] is None
    assert got["item_name"] == "Тестовий продаж"


def test_sale_validation_and_delete(client):
    assert client.post("/api/sales", json={"item_id": "antidote", "quantity": 0}).status_code == 422
    assert client.post("/api/sales", json={"item_id": "nope", "quantity": 1}).status_code == 404
    sale = client.post("/api/sales", json={"item_id": "antidote", "quantity": 1}).json()
    assert client.delete(f"/api/sales/{sale['id']}").status_code == 204
    assert all(s["id"] != sale["id"] for s in client.get("/api/sales").json())


def test_sold_at_normalized_to_canonical_utc(client):
    # a '+02:00' local time is stored as the equivalent UTC millis with 'Z'
    r = client.post("/api/sales", json={
        "item_id": "antidote", "quantity": 1, "sold_at": "2026-03-15T14:30:00+02:00",
    })
    assert r.json()["sold_at"] == "2026-03-15T12:30:00.000Z"


def test_sales_date_window_and_limit(client):
    client.post("/api/items", json={
        "id": "filt_item", "name_uk": "Фільтр", "type": "product", "output_qty": 1, "sell_price": 1.0,
    })
    jan = client.post("/api/sales", json={
        "item_id": "filt_item", "quantity": 1, "sold_at": "2026-01-15T12:00:00.000Z"}).json()
    jun = client.post("/api/sales", json={
        "item_id": "filt_item", "quantity": 1, "sold_at": "2026-06-15T12:00:00.000Z"}).json()
    # [start, end) window covering only June
    got = client.get("/api/sales", params={
        "start": "2026-06-01T00:00:00.000Z", "end": "2026-07-01T00:00:00.000Z"}).json()
    ids = {s["id"] for s in got}
    assert jun["id"] in ids and jan["id"] not in ids
    # limit returns at most N (newest first)
    one = client.get("/api/sales", params={"limit": 1}).json()
    assert len(one) == 1
    # unparseable bound -> 422
    assert client.get("/api/sales", params={"start": "not-a-date"}).status_code == 422
