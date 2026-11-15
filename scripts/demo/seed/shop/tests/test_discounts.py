import unittest

from shop.discounts import UnknownCode, discount_pence


class DiscountTests(unittest.TestCase):
    def test_no_code_means_no_discount(self):
        self.assertEqual(discount_pence(None, 2500), 0)
        self.assertEqual(discount_pence("", 2500), 0)

    def test_ten_percent(self):
        self.assertEqual(discount_pence("SAVE10", 2500), 250)

    def test_twenty_percent(self):
        self.assertEqual(discount_pence("SAVE20", 1200), 240)

    def test_percent_discount_rounds_half_up(self):
        self.assertEqual(discount_pence("WELCOME5", 450), 23)

    def test_codes_ignore_case_and_spaces(self):
        self.assertEqual(discount_pence(" save10 ", 2500), 250)

    def test_unknown_code_raises(self):
        with self.assertRaises(UnknownCode):
            discount_pence("FREEMONEY", 2500)

    def test_flat_code_needs_the_minimum_spend(self):
        self.assertEqual(discount_pence("FLAT5", 1999), 0)

    def test_flat_code_at_the_minimum_spend(self):
        self.assertEqual(discount_pence("FLAT5", 2000), 500)


if __name__ == "__main__":
    unittest.main()
