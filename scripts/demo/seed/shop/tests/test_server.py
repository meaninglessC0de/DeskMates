import unittest

from shop.server import catalog_page, handle_checkout


class CheckoutEndpointTests(unittest.TestCase):
    def test_empty_cart_is_a_bad_request(self):
        self.assertEqual(handle_checkout({"items": []})[0], 400)

    def test_unknown_product_is_not_found(self):
        self.assertEqual(handle_checkout({"items": [{"sku": "nope"}]})[0], 404)

    def test_unknown_code_is_unprocessable(self):
        status, _ = handle_checkout({"items": [{"sku": "mug"}], "code": "NOPE"})
        self.assertEqual(status, 422)

    def test_bad_quantity_is_a_bad_request(self):
        self.assertEqual(handle_checkout({"items": [{"sku": "mug", "qty": 0}]})[0], 400)

    def test_checkout_without_a_code(self):
        status, body = handle_checkout({"items": [{"sku": "mug", "qty": 1}]})
        self.assertEqual((status, body["total"], body["display"]), (200, 1939, "£19.39"))

    def test_checkout_with_a_code(self):
        status, body = handle_checkout({"items": [{"sku": "tee"}], "code": "SAVE10"})
        self.assertEqual((status, body["total"], body["display"]), (200, 3199, "£31.99"))

    def test_catalog_page_lists_products(self):
        self.assertIn("Ceramic mug", catalog_page())


if __name__ == "__main__":
    unittest.main()
