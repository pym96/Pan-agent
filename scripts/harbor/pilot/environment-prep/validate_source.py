"""Call the unchanged accepted broker's validator, without starting an environment."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from broker import validate_source
manifest=json.loads(Path(sys.argv[1]).read_text());task=next(t for t in manifest['tasks'] if t['id']==sys.argv[3]);validate_source(Path(sys.argv[2])/task['path'],task)
print(json.dumps({'task':task['id'],'files':len(task['files']),'broker_source_validation':'passed'}))
