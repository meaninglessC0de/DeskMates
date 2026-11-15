"""The product catalogue."""


class UnknownProduct(KeyError):
    pass


PRODUCTS = {
    "sticker": {"name": "Sticker pack", "price": 450},
    "mug": {"name": "Ceramic mug", "price": 1200},
    "tote": {"name": "Canvas tote bag", "price": 1800},
    "tee": {"name": "Cotton t-shirt", "price": 2500},
    "poster": {"name": "Art print", "price": 3500},
    "hoodie": {"name": "Hoodie", "price": 5500},
}


def get_product(sku):
    try:
        return PRODUCTS[sku]
    except KeyError:
        raise UnknownProduct(sku) from None


def price_of(sku):
    return get_product(sku)["price"]


def all_skus():
    return sorted(PRODUCTS)
