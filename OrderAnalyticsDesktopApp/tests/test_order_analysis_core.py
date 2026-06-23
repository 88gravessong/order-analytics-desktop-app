from __future__ import annotations

from io import BytesIO
from pathlib import Path
import sys
import unittest


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "app" / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from order_analysis_core import prepare_order_cache


class CountryRegionFallbackTests(unittest.TestCase):
    def test_country_is_used_when_state_or_province_is_absent(self):
        csv_bytes = (
            "Order ID,Order Substatus,Cancelation/Return Type,Seller SKU,"
            "Created Time,Shipped Time,Country\n"
            "1\t,运输中,,V200-01,23/06/2026 13:20:39\t,"
            "23/06/2026 13:44:41\t,Singapore\n"
        ).encode("utf-8-sig")
        stream = BytesIO(csv_bytes)
        stream.name = "cross-border-orders.csv"

        prepared = prepare_order_cache([stream], require_region=True)

        self.assertEqual(prepared["matched_columns"]["region"], "Country")
        self.assertEqual(prepared["start_date"].isoformat(), "2026-06-23")
        self.assertEqual(prepared["end_date"].isoformat(), "2026-06-23")
        self.assertEqual(len(prepared["normalized_rows"]), 1)
        self.assertEqual(prepared["normalized_rows"][0]["region"], "Singapore")
        self.assertEqual(prepared["normalized_rows"][0]["bucket"], "in_transit")

    def test_state_remains_preferred_when_country_is_also_present(self):
        csv_bytes = (
            "Order ID,Order Substatus,Cancelation/Return Type,Seller SKU,"
            "Created Time,Shipped Time,State,Country\n"
            "1,已送达,,V200-01,23/06/2026 13:20:39,"
            "23/06/2026 13:44:41,Central Region,Singapore\n"
        ).encode("utf-8-sig")
        stream = BytesIO(csv_bytes)
        stream.name = "orders-with-state.csv"

        prepared = prepare_order_cache([stream], require_region=True)

        self.assertEqual(prepared["matched_columns"]["region"], "State")
        self.assertEqual(prepared["normalized_rows"][0]["region"], "Central Region")


if __name__ == "__main__":
    unittest.main()
