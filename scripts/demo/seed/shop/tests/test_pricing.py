import unittest

from shop.cart import Cart
from shop.discounts import UnknownCode
from shop.pricing import checkout_total, shipping_pence


def cart_of(*lines):
    cart = Cart()
    for sku, qty in lines:
        cart.add(sku, qty)
    return cart


class ShippingTests(unittest.TestCase):
    def test_empty_cart_ships_free(self):
        self.assertEqual(shipping_pence(0), 0)

    def test_small_orders_pay_shipping(self):
        self.assertEqual(shipping_pence(4999), 499)

    def test_free_shipping_from_fifty_pounds(self):
        self.assertEqual(shipping_pence(5000), 0)


class CheckoutWithoutDiscountTests(unittest.TestCase):
    def test_empty_cart(self):
        t = checkout_total(Cart())
        self.assertEqual((t.subtotal, t.tax, t.shipping, t.total), (0, 0, 0, 0))

    def test_one_sticker_pack(self):
        t = checkout_total(cart_of(("sticker", 1)))
        self.assertEqual((t.subtotal, t.tax, t.shipping, t.total), (450, 90, 499, 1039))

    def test_one_mug(self):
        self.assertEqual(checkout_total(cart_of(("mug", 1))).total, 1939)

    def test_two_tees_get_free_shipping(self):
        t = checkout_total(cart_of(("tee", 2)))
        self.assertEqual((t.tax, t.shipping, t.total), (1000, 0, 6000))

    def test_just_under_free_shipping(self):
        t = checkout_total(cart_of(("tee", 1), ("tote", 1), ("sticker", 1), ("sticker", 1)))
        self.assertEqual((t.subtotal, t.shipping, t.total), (5200, 0, 6240))

    def test_unknown_code_is_rejected(self):
        with self.assertRaises(UnknownCode):
            checkout_total(cart_of(("mug", 1)), "NOPE")

    def test_flat_code_below_minimum_changes_nothing(self):
        self.assertEqual(checkout_total(cart_of(("mug", 1)), "FLAT5").total, 1939)


class CheckoutWithDiscountTests(unittest.TestCase):
    def test_ten_percent_off_one_tee(self):
        # 2500 - 250 = 2250, VAT 450, shipping 499
        self.assertEqual(checkout_total(cart_of(("tee", 1)), "SAVE10").total, 3199)

    def test_twenty_percent_off_two_tees_keeps_free_shipping(self):
        # shipping is decided before the discount: 5000 - 1000 = 4000, VAT 800
        self.assertEqual(checkout_total(cart_of(("tee", 2)), "SAVE20").total, 4800)

    def test_welcome_code_rounds_the_discount_up_and_the_tax_down(self):
        # discount 23, taxable 427, VAT 85, shipping 499
        t = checkout_total(cart_of(("sticker", 1)), "WELCOME5")
        self.assertEqual((t.discount, t.tax, t.total), (23, 85, 1011))

    def test_flat_code_comes_off_before_tax(self):
        # 2500 - 500 = 2000, VAT 400, shipping 499
        self.assertEqual(checkout_total(cart_of(("tee", 1)), "FLAT5").total, 2899)

    def test_lowercase_code_works(self):
        self.assertEqual(checkout_total(cart_of(("mug", 2)), "save10").total, 3091)

    def test_tax_is_charged_on_the_discounted_amount(self):
        # 5500 - 550 = 4950, VAT 990, free shipping
        t = checkout_total(cart_of(("hoodie", 1)), "SAVE10")
        self.assertEqual((t.discount, t.tax, t.total), (550, 990, 5940))

    def test_discount_lowers_the_tax(self):
        cart = cart_of(("tee", 1), ("mug", 1), ("sticker", 1))
        self.assertLess(checkout_total(cart, "SAVE10").tax, checkout_total(cart).tax)


if __name__ == "__main__":
    unittest.main()
