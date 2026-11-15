import unittest

from shop.cart import MAX_QTY, Cart
from shop.catalog import UnknownProduct


class CartTests(unittest.TestCase):
    def test_new_cart_is_empty(self):
        cart = Cart()
        self.assertTrue(cart.is_empty())
        self.assertEqual(cart.count(), 0)
        self.assertEqual(cart.subtotal_pence(), 0)

    def test_add_one_item(self):
        cart = Cart()
        cart.add("mug")
        self.assertEqual(cart.items(), [("mug", 1)])

    def test_adding_twice_merges_lines(self):
        cart = Cart()
        cart.add("mug")
        cart.add("mug", 2)
        self.assertEqual(cart.items(), [("mug", 3)])

    def test_rejects_zero_quantity(self):
        with self.assertRaises(ValueError):
            Cart().add("mug", 0)

    def test_rejects_fractional_quantity(self):
        with self.assertRaises(ValueError):
            Cart().add("mug", 1.5)

    def test_rejects_unknown_product(self):
        with self.assertRaises(UnknownProduct):
            Cart().add("nope")

    def test_rejects_more_than_the_maximum_of_one_item(self):
        cart = Cart()
        cart.add("sticker", MAX_QTY)
        with self.assertRaises(ValueError):
            cart.add("sticker")

    def test_remove_and_set_qty(self):
        cart = Cart()
        cart.add("mug", 2)
        cart.add("tee")
        cart.set_qty("mug", 5)
        self.assertEqual(cart.items(), [("mug", 5), ("tee", 1)])
        cart.set_qty("mug", 0)
        cart.remove("tee")
        self.assertTrue(cart.is_empty())

    def test_subtotal_sums_lines(self):
        cart = Cart()
        cart.add("tee")
        cart.add("mug", 2)
        self.assertEqual(cart.subtotal_pence(), 4900)

    def test_count_sums_quantities(self):
        cart = Cart()
        cart.add("tee", 2)
        cart.add("mug", 3)
        self.assertEqual(cart.count(), 5)


if __name__ == "__main__":
    unittest.main()
