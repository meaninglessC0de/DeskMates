import unittest

from shop.catalog import PRODUCTS, UnknownProduct, all_skus, get_product, price_of


class CatalogTests(unittest.TestCase):
    def test_price_of_known_product(self):
        self.assertEqual(price_of("mug"), 1200)

    def test_unknown_product_raises(self):
        with self.assertRaises(UnknownProduct):
            get_product("nope")

    def test_all_skus_sorted(self):
        self.assertEqual(all_skus(), ["hoodie", "mug", "poster", "sticker", "tee", "tote"])

    def test_every_price_is_a_positive_whole_number_of_pence(self):
        for sku, product in PRODUCTS.items():
            self.assertIsInstance(product["price"], int, sku)
            self.assertGreater(product["price"], 0, sku)


if __name__ == "__main__":
    unittest.main()
