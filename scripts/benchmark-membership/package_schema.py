"""Frozen Criteria1.3 schema whitelist; no data rows, arrays, pixels or gold values emitted."""
import ast,csv,gzip,io,json,re,struct,zlib
MAX_HEADER=1024*1024
MAX_COLUMNS=200
MAX_NAME_BYTES=96
JSON_FIELDS=frozenset({'type','chart_type','plot_type','graph_type','figsize','graph_title','x_label','y_label','labels','legend_title','color','xtick_labels','ytick_labels','xlim','ylim','dpi'})
CHART_KINDS=frozenset({'bar','scatter','line','pie','histogram','box','violin','heatmap'})
SUSPICIOUS=re.compile(r'answer|solution|secret|base64|ignore\s+(?:previous|instructions)|[=<>`]|\bexpected\s+(?:result|value)',re.I)

def csv_header(stream):
    """Read only the first CSV record, with an aggregate decompression ceiling."""
    try:
        decoded=0
        def lines():
            nonlocal decoded
            while True:
                remaining=MAX_HEADER-decoded
                if remaining<=0:raise ValueError()
                line=stream.readline(remaining+1);decoded+=len(line)
                if decoded>MAX_HEADER or not line:raise ValueError()
                yield line.decode('utf-8-sig')
        fields=next(csv.reader(lines(),strict=True))
        if not 1<=len(fields)<=MAX_COLUMNS:raise ValueError()
        columns=[];withheld=[]
        for i,name in enumerate(fields):
            if not name or len(name.encode())>MAX_NAME_BYTES or SUSPICIOUS.search(name) or not re.search('[A-Za-z_]',name):withheld.append(i);continue
            # JSON serialization will escape control characters; never write raw names directly.
            columns.append({'index':i,'name':name})
        return {'schema':'csv_header_v1','status':'partial_withheld' if withheld else 'supported','columns':columns,'withheld_column_indices':withheld,'column_count':len(fields),'decoded_header_bytes':decoded,'rows_inspected':0}
    except Exception:raise ValueError('CSV header unsupported or bounded limit exceeded') from None

def csv_gzip(path):
    try:
        with gzip.open(path,'rb') as stream:return csv_header(stream)
    except Exception:raise ValueError('compressed CSV header refused') from None

def json_structure(data):
    try:
        if len(data)>65536:raise ValueError()
        def unique(pairs):
            out={}
            for k,v in pairs:
                if k in out:raise ValueError()
                out[k]=v
            return out
        obj=json.loads(data,object_pairs_hook=unique,parse_constant=lambda x:(_ for _ in ()).throw(ValueError()))
        if type(obj) is not dict or len(obj)>64:raise ValueError()
        def type_name(x):
            return {str:'string',int:'number',float:'number',bool:'boolean',list:'array',dict:'object',type(None):'null'}[type(x)]
        result={'schema':'da_plot_metadata_v1','status':'supported','fields':{k:{'present':True,'type':type_name(obj[k])} for k in sorted(JSON_FIELDS) if k in obj},'unknown_fields_withheld':bool(set(obj)-JSON_FIELDS)}
        for key in ('type','chart_type','plot_type','graph_type'):
            if key in obj:
                if isinstance(obj[key],str) and obj[key].strip().lower() in CHART_KINDS:result.setdefault('explicit_chart_kinds',{})[key]=obj[key].strip().lower()
                else:result['unrecognized_chart_kind_withheld']=True
        if not result['fields']:result['status']='unsupported_schema'
        return result
    except Exception:raise ValueError('GT JSON structure refused') from None

def npy_structure(stream):
    try:
        if stream.read(6)!=b'\x93NUMPY':raise ValueError()
        version=stream.read(2)
        if version not in (b'\x01\x00',b'\x02\x00',b'\x03\x00'):raise ValueError()
        size=2 if version[0]==1 else 4;raw=stream.read(size)
        if len(raw)!=size:raise ValueError()
        length=int.from_bytes(raw,'little')
        if not 1<=length<=65536:raise ValueError()
        header=stream.read(length)
        if len(header)!=length:raise ValueError()
        value=ast.literal_eval(header.decode('utf8' if version[0]==3 else 'latin1').strip())
        if type(value) is not dict or set(value)!={'descr','fortran_order','shape'}:raise ValueError()
        shape=value['shape'];dtype=value['descr']
        if type(shape) is not tuple or len(shape)>8 or any(type(n) is not int or not 0<=n<=10**9 for n in shape) or type(value['fortran_order']) is not bool:raise ValueError()
        if not isinstance(dtype,str):return {'schema':'npy_header_v1','status':'unsupported_structured_dtype','array_data_read':False}
        if not re.fullmatch(r'[<>=|]?[?biufcmMOSUV](?:[0-9]{1,5})?',dtype):raise ValueError()
        if 'O' in dtype:return {'schema':'npy_header_v1','status':'refused_object_dtype','object_presence':True,'array_data_read':False}
        return {'schema':'npy_header_v1','status':'supported','version':list(version),'shape':list(shape),'dtype':dtype,'object_presence':False,'fortran_order':value['fortran_order'],'array_data_read':False}
    except Exception:raise ValueError('NumPy structural header refused') from None

def png_structure(stream):
    try:
        data=stream.read(33)
        if len(data)!=33 or data[:8]!=b'\x89PNG\r\n\x1a\n' or data[8:12]!=b'\0\0\0\r' or data[12:16]!=b'IHDR':raise ValueError()
        if zlib.crc32(data[12:29])&0xffffffff!=int.from_bytes(data[29:33],'big'):raise ValueError()
        width,height=struct.unpack('>II',data[16:24])
        if not 0<width<2**31 or not 0<height<2**31:raise ValueError()
        return {'schema':'png_ihdr_v1','status':'supported','width':width,'height':height,'pixel_data_read':False}
    except Exception:raise ValueError('PNG structural header refused') from None
