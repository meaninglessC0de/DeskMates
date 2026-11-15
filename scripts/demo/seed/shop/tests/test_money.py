import unittest

from shop.money import div_round_half_up, format_pence, percent_of


class MoneyTests(unittest.TestCase):
    def test_round_half_up_rounds_halves_up(self):
        self.assertEqual(div_round_half_up(5, 2), 3)

    def test_round_half_up_rounds_down_below_half(self):
        self.assertEqual(div_round_half_up(1, 3), 0)

    def test_percent_of_rounds_half_up(self):
        self.assertEqual(percent_of(450, 500), 23)

    def test_format_pence(self):
        self.assertEqual(format_pence(12345), "£123.45")
        self.assertEqual(format_pence(5), "£0.05")
        self.assertEqual(format_pence(-150), "-£1.50")


if __name__ == "__main__":
    unittest.main()
