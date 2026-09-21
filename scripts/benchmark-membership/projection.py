"""Fail-closed, narrow source projections. No execution or semantic-redaction guarantee."""
import ast
import hashlib
import json
import re
from pathlib import Path

TARGETS = ('data-sa-026','data-sa-028','data-sa-029','data-sa-031','data-sa-039','data-sa-043','ml-multi-003',
           'plot-bar-004','plot-bar-005','plot-bar-006','plot-bar-007','plot-bar-015','plot-line-006','plot-pie-005','plot-pie-008','plot-scatter-002')
DENY = re.compile(r'answer|solution|expected|gold|conclusion|p.value|correct.output|result|correlation|confidence.interval',re.I)
ALLOWED_CALLS = {'sns.load_dataset','seaborn.load_dataset','pd.read_csv','pandas.read_csv','pd.read_excel',
                 'np.random.seed','numpy.random.seed','np.random.normal','np.random.uniform','np.random.randint',
                 'np.random.default_rng','np.random.binomial','np.random.poisson','np.random.choice',
                 'np.random.randn','np.random.rand','np.arange','np.linspace'}


def whole_hash(data):
    return hashlib.sha256(data).hexdigest()


def task_projection(data):
    out = []; seen = set()
    try:
        for line in data.decode().splitlines():
            row=json.loads(line)
            if row.get('id') not in TARGETS:continue
            if row['id'] in seen:raise ValueError()
            seen.add(row['id'])
            if not isinstance(row.get('instruction'),str) or not row['instruction'].strip():raise ValueError()
            if not isinstance(row.get('post_process'),list) or not all(isinstance(x,str) for x in row['post_process']):raise ValueError()
            out.append({'id':row['id'],'instruction':row['instruction'],'post_process':row['post_process']})
        if seen != set(TARGETS):raise ValueError()
    except Exception:
        raise ValueError('task projection refused invalid or incomplete input') from None
    return {'source_sha256':whole_hash(data),'tasks':sorted(out,key=lambda x:x['id'])}


def readme_projection(data):
    """Emit only known data-loading/generation AST statements and bare dataset URLs.

    Arbitrary prose, tables, arrays, computations, output/solution sections and unknown
    code are withheld, without printing or hashing fragments. Whole-file hash only.
    A withheld input definition needs adjudication, not a cleanliness claim.
    """
    try:text=data.decode('utf8')
    except UnicodeError:raise ValueError('README encoding refused') from None
    lines=text.splitlines();emitted=[];withheld=[];fence=False;blocked=False;block_level=None
    for no,line in enumerate(lines,1):
        stripped=line.strip();heading=re.match(r'^(#{1,6})\s+(.+)$',stripped)
        if heading:
            level=len(heading[1])
            if blocked and level <= block_level:blocked=False
            if DENY.search(heading[2]):blocked=True;block_level=level
            if stripped:withheld.append(no)
            continue
        if blocked:
            if stripped:withheld.append(no)
            continue
        if stripped.startswith('```'):
            fence=not fence;continue
        if not stripped:continue
        if DENY.search(stripped):withheld.append(no);continue
        # Only bare metadata URLs on explicit source/dataset labels, never arbitrary prose.
        link=re.fullmatch(r'(?:Data source|Dataset|Source):\s*(https://[^\s<>]+)',stripped,re.I)
        if link:
            emitted.append({'line':no,'kind':'dataset_locator','text':link[0]});continue
        if fence:
            try:
                tree=ast.parse(stripped)
                if len(tree.body)!=1:raise ValueError()
                stmt=tree.body[0]
                call=stmt.value if isinstance(stmt,(ast.Expr,ast.Assign)) else None
                if not isinstance(call,ast.Call) or ast.unparse(call.func) not in ALLOWED_CALLS:raise ValueError()
                # Only literals/arithmetic-free literal keyword arguments: no arbitrary expressions.
                for arg in call.args+[x.value for x in call.keywords]:ast.literal_eval(arg)
                if isinstance(stmt,ast.Assign):
                    if len(stmt.targets)!=1 or not isinstance(stmt.targets[0],ast.Name):raise ValueError()
                    if DENY.search(stmt.targets[0].id):raise ValueError()
                emitted.append({'line':no,'kind':'data_recipe_statement','text':ast.unparse(stmt)})
                continue
            except (SyntaxError,ValueError,TypeError):pass
        withheld.append(no)
    return {'source_sha256':whole_hash(data),'emitted':emitted,'withheld_line_numbers':withheld,
            'limitation':'Only literal data-loader/random-generation declarations are projected. Other definitions/prose may be required; no universal semantic cleanliness claim.'}


def code_projection(data, names):
    """Implementation AST inventory only; body excerpt requires explicit named functions."""
    try:tree=ast.parse(data.decode())
    except (UnicodeError,SyntaxError):raise ValueError('implementation parse refused') from None
    functions=[n for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))]
    found={n.name:n for n in functions if n.name in names}
    if set(found)!=set(names):raise ValueError('implementation function missing')
    lines=data.decode().splitlines()
    return {'source_sha256':whole_hash(data),'functions':[{'name':n.name,'start_line':n.lineno,'end_line':n.end_lineno,
            'source':'\n'.join(lines[n.lineno-1:n.end_lineno])} for n in sorted(found.values(),key=lambda n:n.lineno)]}

# A closed vocabulary emits classifications, never arbitrary source prose/values.
README_CONCEPTS = {
    'football_domain': r'\b(?:football|soccer)\b',
    'betting_domain': r'\b(?:betting|bookmaker|odds)\b',
    'orders_domain': r'\b(?:order|orders|delivery|deliveries)\b',
    'sales_domain': r'\b(?:sales|revenue)\b',
    'birds_domain': r'\b(?:bird|birds|beak|beaks|finch|finches)\b',
    'frogs_domain': r'\b(?:frog|frogs)\b',
    'handwashing_domain': r'\b(?:handwashing|handwash|hand washing)\b',
    'simulated_data_description': r'\b(?:simulated|simulation|synthetic)\b',
    'generation_description': r'\b(?:generate|generated|generating)\b',
    'data_loader_declaration': r'\b(?:read_csv|read_excel|load_dataset)\b',
    'random_recipe_declaration': r'\b(?:seed|random\.normal|random\.uniform|random\.randint)\b',
    'package_provider': r'\b(?:seaborn|statsmodels|sklearn|scipy)\b',
    'external_locator': r'https?://',
}


def readme_concepts(data):
    try:lines=data.decode('utf8').splitlines()
    except UnicodeError:raise ValueError('README encoding refused') from None
    observations=[]
    for no,line in enumerate(lines,1):
        kinds=[name for name,pattern in README_CONCEPTS.items() if re.search(pattern,line,re.I)]
        if kinds:observations.append({'line':no,'concepts':kinds})
    return {'source_sha256':whole_hash(data),'observations':observations,
            'limitation':'Closed-vocabulary presence only; not full semantic review, provision proof, or universal redaction.'}
