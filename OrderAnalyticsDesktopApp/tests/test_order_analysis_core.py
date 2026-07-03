from __future__ import annotations

from datetime import date
from io import BytesIO
from pathlib import Path
import sys
import unittest


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "app" / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from order_analysis_core import analyze_prepared_order_cache, prepare_order_cache


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

    def test_prepared_analysis_exposes_monthly_and_daily_summary_rows(self):
        csv_bytes = (
            "Order ID,Order Substatus,Cancelation/Return Type,Seller SKU,"
            "Created Time,Shipped Time,State\n"
            "1,已送达,,V200-01,22/06/2026 13:20:39,"
            "22/06/2026 15:00:00,Central Region\n"
            "2,运输中,,V200-02,23/06/2026 13:20:39,,North Region\n"
        ).encode("utf-8-sig")
        stream = BytesIO(csv_bytes)
        stream.name = "orders-two-days.csv"

        prepared = prepare_order_cache([stream], require_region=True)
        analysis = analyze_prepared_order_cache(prepared, date(2026, 6, 22), date(2026, 6, 23))

        self.assertEqual(analysis["summary"]["month_count"], 1)
        self.assertEqual(analysis["summary"]["day_count"], 2)
        self.assertEqual([row["month"] for row in analysis["monthly_rows"]], ["2026-06"])
        self.assertEqual([row["date"] for row in analysis["daily_rows"]], ["2026-06-22", "2026-06-23"])

    def test_insight_payload_exposes_matrix_risk_comparison_and_filtered_details(self):
        rows = [
            "Order ID,Order Substatus,Cancelation/Return Type,Seller SKU,Created Time,Shipped Time,State",
        ]
        order_id = 1
        for day in range(1, 8):
            rows.append(f"{order_id},已完成,,RISK-1,{day:02d}/06/2026 09:00:00,01/06/2026 10:00:00,North")
            order_id += 1
        for day in range(8, 13):
            rows.append(f"{order_id},,Return/Refund,RISK-1,{day:02d}/06/2026 09:00:00,08/06/2026 10:00:00,North")
            order_id += 1
        for day in range(13, 15):
            rows.append(f"{order_id},已取消,,RISK-1,{day:02d}/06/2026 09:00:00,08/06/2026 10:00:00,North")
            order_id += 1
        for day in range(8, 12):
            rows.append(f"{order_id},,Return/Refund,LOW-1,{day:02d}/06/2026 09:00:00,08/06/2026 10:00:00,South")
            order_id += 1
        csv_bytes = ("\n".join(rows) + "\n").encode("utf-8-sig")
        stream = BytesIO(csv_bytes)
        stream.name = "insight-orders.csv"

        prepared = prepare_order_cache([stream], require_region=True)
        analysis = analyze_prepared_order_cache(prepared, date(2026, 6, 8), date(2026, 6, 14))

        self.assertEqual(len(analysis["structured_rows"]), 11)
        self.assertTrue(all("2026-06-08" <= row["created_date"] <= "2026-06-14" for row in analysis["structured_rows"]))
        self.assertEqual(len(analysis["matrix_rows"]), len(analysis["region_rows"]))
        for matrix_row, region_row in zip(analysis["matrix_rows"], analysis["region_rows"]):
            for key in (
                "seller_sku",
                "region",
                "total",
                "share_rate",
                "sign_rate",
                "refund_rate",
                "cancel_before_rate",
                "cancel_after_rate",
                "in_transit_rate",
            ):
                self.assertEqual(matrix_row[key], region_row[key])
        self.assertEqual(analysis["comparison"]["previousRange"], {"startDate": "2026-06-01", "endDate": "2026-06-07"})
        self.assertEqual(analysis["comparison"]["summaryDelta"]["total"], 11)
        self.assertLess(analysis["comparison"]["summaryDelta"]["sign_delta"], 0)

        risk_keys = {row["key"] for row in analysis["risk_rows"]}
        self.assertIn("RISK-1", risk_keys)
        self.assertNotIn("LOW-1", risk_keys)

        risk_sku = next(row for row in analysis["sku_rows"] if row["seller_sku"] == "RISK-1")
        self.assertEqual(risk_sku["refund_rate"], 71.43)
        self.assertEqual(risk_sku["sign_rate"], 71.43)


if __name__ == "__main__":
    unittest.main()
