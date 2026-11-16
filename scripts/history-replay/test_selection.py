"""CLI regression for missing requested historical assertions (#167 C-RS-03)."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent


class SelectionTests(unittest.TestCase):
    def missing(self, selection, removed):
        with tempfile.TemporaryDirectory(prefix='pan-history-selection-') as directory:
            root = Path(directory)
            tool = root/'tool/scripts/history-replay'
            tool.mkdir(parents=True)
            shutil.copyfile(HERE/'run.py', tool/'run.py')
            manifest = json.loads((HERE/'manifest.json').read_text())
            for name in removed:
                del manifest['proofs'][name]
            (tool/'manifest.json').write_text(json.dumps(manifest))
            output = root/'output'
            command = [sys.executable, str(tool/'run.py'), selection,
                       '--repository', str(root/'unused-repository'),
                       '--npm-cache', str(root/'unused-cache'), '--output', str(output)]
            result = subprocess.run(command, capture_output=True, text=True, timeout=10)
            report = json.loads((output/'result.json').read_text())
            self.assertNotEqual(result.returncode, 0, json.dumps(report))
            self.assertEqual(report['status'], 'FAIL')
            self.assertEqual(report['proofs'], {})
            self.assertIn('missing selected historical proof', report['error'])
            for name in removed:
                self.assertIn(name, report['error'])

    def test_explicit_selection_requires_its_manifest_entry(self):
        for name in ('layout41', 'facts25', 'routing43'):
            with self.subTest(proof=name):
                self.missing(name, [name])

    def test_all_requires_each_declared_proof(self):
        for name in ('layout41', 'facts25', 'routing43'):
            with self.subTest(proof=name):
                self.missing('all', [name])

    def test_all_rejects_an_empty_inventory(self):
        self.missing('all', ['layout41', 'facts25', 'routing43'])


if __name__ == '__main__':
    unittest.main()
