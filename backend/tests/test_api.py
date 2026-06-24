"""Backend tests: data shape, validation rules, CRUD, cost model, CSV round-trip."""
from app.cost import all_unit_costs


def test_data_shape_and_counts(client):
    d = client.get("/api/data").json()
    assert {"items", "recipes"} == set(d)
    assert len(d["items"]) == 64  # 63 from CSV + auto-created wolfberry
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
    # restoring_herbs depends on wolfberry (unknown price) -> None
    assert costs["restoring_herbs"] is None


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
