"""A shopping cart: lines of (sku, quantity)."""
from .catalog import get_product, price_of

MAX_QTY = 20


class Cart:
    def __init__(self):
        self._lines = {}

    def add(self, sku, qty=1):
        get_product(sku)
        if not isinstance(qty, int) or qty < 1:
            raise ValueError("quantity must be a positive whole number")
        new_qty = self._lines.get(sku, 0) + qty
        if new_qty > MAX_QTY:
            raise ValueError(f"at most {MAX_QTY} of one item")
        self._lines[sku] = new_qty

    def remove(self, sku):
        self._lines.pop(sku, None)

    def set_qty(self, sku, qty):
        if qty == 0:
            self.remove(sku)
            return
        self._lines.pop(sku, None)
        self.add(sku, qty)

    def items(self):
        return sorted(self._lines.items())

    def count(self):
        return sum(self._lines.values())

    def is_empty(self):
        return not self._lines

    def subtotal_pence(self):
        return sum(price_of(sku) * qty for sku, qty in self._lines.items())
