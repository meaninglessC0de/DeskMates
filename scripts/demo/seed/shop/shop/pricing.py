"""Checkout totals: discount, VAT and shipping."""
from dataclasses import dataclass

from .discounts import discount_pence
from .money import percent_of

TAX_BASIS_POINTS = 2000        # 20% VAT
SHIPPING_PENCE = 499
FREE_SHIPPING_FROM = 5000      # based on the subtotal before any discount


@dataclass(frozen=True)
class Totals:
    subtotal: int
    discount: int
    tax: int
    shipping: int
    total: int


def shipping_pence(subtotal):
    if subtotal == 0 or subtotal >= FREE_SHIPPING_FROM:
        return 0
    return SHIPPING_PENCE


def checkout_total(cart, code=None):
    subtotal = cart.subtotal_pence()
    tax = percent_of(subtotal, TAX_BASIS_POINTS)
    discount = discount_pence(code, subtotal)
    shipping = shipping_pence(subtotal)
    total = subtotal + tax - discount + shipping
    return Totals(subtotal=subtotal, discount=discount, tax=tax, shipping=shipping, total=total)
