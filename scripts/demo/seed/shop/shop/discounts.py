"""Discount codes."""
from .money import percent_of


class UnknownCode(ValueError):
    pass


CODES = {
    "WELCOME5": {"kind": "percent", "basis_points": 500},
    "SAVE10": {"kind": "percent", "basis_points": 1000},
    "SAVE20": {"kind": "percent", "basis_points": 2000},
    "FLAT5": {"kind": "flat", "pence": 500, "min_spend": 2000},
}


def discount_pence(code, subtotal):
    """How much `code` takes off `subtotal` (pence). No code means no discount; never more than the subtotal."""
    if not code:
        return 0
    rule = CODES.get(code.strip().upper())
    if rule is None:
        raise UnknownCode(code)
    if rule["kind"] == "percent":
        amount = percent_of(subtotal, rule["basis_points"])
    else:
        amount = rule["pence"] if subtotal >= rule["min_spend"] else 0
    return min(amount, subtotal)
