"""A minimal HTTP front for the shop. Run: python3 -m shop.server"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from .cart import Cart
from .catalog import PRODUCTS, UnknownProduct
from .discounts import UnknownCode
from .money import format_pence
from .pricing import checkout_total


def handle_checkout(payload):
    """payload: {"items": [{"sku": "mug", "qty": 2}], "code": "SAVE10"} -> (status, body)."""
    cart = Cart()
    try:
        for line in payload.get("items", []):
            cart.add(line["sku"], line.get("qty", 1))
        if cart.is_empty():
            return 400, {"error": "cart is empty"}
        totals = checkout_total(cart, payload.get("code"))
    except UnknownProduct as e:
        return 404, {"error": f"unknown product {e.args[0]}"}
    except UnknownCode:
        return 422, {"error": "unknown discount code"}
    except (KeyError, ValueError) as e:
        return 400, {"error": str(e)}
    return 200, {
        "subtotal": totals.subtotal,
        "discount": totals.discount,
        "tax": totals.tax,
        "shipping": totals.shipping,
        "total": totals.total,
        "display": format_pence(totals.total),
    }


def catalog_page():
    rows = "".join(f"<li>{p['name']}: {format_pence(p['price'])}</li>" for p in PRODUCTS.values())
    return f"<!doctype html><title>Shop</title><h1>Shop</h1><ul>{rows}</ul>"


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body, content_type="application/json"):
        data = body if isinstance(body, bytes) else (body if isinstance(body, str) else json.dumps(body)).encode()
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            self._send(200, catalog_page(), "text/html")
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/checkout":
            return self._send(404, {"error": "not found"})
        length = int(self.headers.get("content-length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self._send(400, {"error": "invalid json"})
        status, body = handle_checkout(payload)
        self._send(status, body)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
