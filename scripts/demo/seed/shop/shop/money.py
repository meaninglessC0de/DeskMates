"""Money helpers. All amounts are integer pence."""


def div_round_half_up(numerator, denominator):
    """Integer division that rounds halves up (non-negative inputs)."""
    return (numerator * 2 + denominator) // (denominator * 2)


def percent_of(pence, basis_points):
    """`basis_points` of `pence` (1000 basis points = 10%), rounded half up."""
    return div_round_half_up(pence * basis_points, 10000)


def format_pence(pence):
    """12345 -> '£123.45'."""
    sign = "-" if pence < 0 else ""
    pence = abs(pence)
    return f"{sign}£{pence // 100}.{pence % 100:02d}"
