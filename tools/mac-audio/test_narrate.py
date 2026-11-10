import copy
import json
import tempfile
import unittest
from pathlib import Path
from narrate import load_plan

class PlanTests(unittest.TestCase):
    def test_sample_and_invalid_coordinates(self):
        plan = json.loads(Path(__file__).with_name("example.narration.json").read_text())
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "plan.json"
            path.write_text(json.dumps(plan))
            self.assertEqual(load_plan(path), plan)
            broken = copy.deepcopy(plan)
            broken["chunks"][0]["sourceEnd"] = -1
            path.write_text(json.dumps(broken))
            with self.assertRaises(ValueError):
                load_plan(path)

    def test_incomplete_plan_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "plan.json"
            path.write_text('{"format":"ninefold-narration-plan","schema":1}')
            with self.assertRaises(ValueError):
                load_plan(path)

if __name__ == "__main__":
    unittest.main()
