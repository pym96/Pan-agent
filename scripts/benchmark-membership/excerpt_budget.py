"""Single append-only gate for any future source excerpt or AST-symbol display."""
import json
from pathlib import Path


def reserve(ledger, payload, *, initial_bytes, cap_bytes, source_path):
    """Charge UTF-8 bytes before caller display; never store rejected text."""
    if not isinstance(payload,str) or not isinstance(initial_bytes,int) or initial_bytes<0:
        raise ValueError('invalid excerpt budget input')
    ledger=Path(ledger)
    records=[json.loads(line) for line in ledger.read_text().splitlines()] if ledger.exists() else []
    used=initial_bytes+sum(r['charged_bytes'] for r in records)
    size=len(payload.encode('utf8'));allowed=used+size<=cap_bytes
    record={'source_path':source_path,'attempted_bytes':size,'charged_bytes':size if allowed else 0,'prior_bytes':used,'cap_bytes':cap_bytes,'allowed':allowed}
    with ledger.open('a') as f:f.write(json.dumps(record,sort_keys=True)+'\n')
    if not allowed:raise ValueError('source excerpt cap reached; no display authorized')
    return payload
