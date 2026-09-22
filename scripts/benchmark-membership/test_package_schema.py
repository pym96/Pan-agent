import hashlib,io,json,struct,unittest,zlib
from package_schema import csv_header,json_structure,npy_structure,png_structure
C='SYNTHETIC_ANSWER_WO73_CANARY'
def npy(dtype='<f8',shape=(4,2)):
 h=repr({'descr':dtype,'fortran_order':False,'shape':shape}).encode()+b'\n'
 return b'\x93NUMPY\x01\x00'+struct.pack('<H',len(h))+h
class HeaderOnly(io.BytesIO):
 def __init__(self,b):super().__init__(b);self.limit=len(b)
 def read(self,n=-1):
  if n<0 or self.tell()+n>self.limit:raise AssertionError('payload read forbidden')
  return super().read(n)
class PackageTests(unittest.TestCase):
 def absent(self,x):
  s=json.dumps(x);self.assertNotIn(C,s);self.assertNotIn(hashlib.sha256(C.encode()).hexdigest(),s)
 def test_csv_no_rows_and_escape(self):
  s=io.BytesIO(b'event_id,home_team,away_team\n'+C.encode()+b'\n');r=csv_header(s);self.absent(r);self.assertEqual(s.tell(),len(b'event_id,home_team,away_team\n'))
 def test_csv_untrusted_header(self):
  r=csv_header(io.BytesIO(('safe,'+C+'\n').encode()));self.absent(r);self.assertEqual(r['withheld_column_indices'],[1])
 def test_csv_bounds(self):
  for b in [b'x'*(1024*1024+1),(','.join('name'+str(i) for i in range(201))+'\n').encode(),b'"unterminated\n']:
   with self.assertRaises(ValueError):csv_header(io.BytesIO(b))
 def test_json_values_and_unknown_keys_withheld(self):
  r=json_structure(json.dumps({'type':'scatter','labels':[C],'graph_title':C,C:C}).encode());self.absent(r);self.assertEqual(r['explicit_chart_kinds'],{'type':'scatter'})
 def test_json_unknown_chart_kind(self):
  r=json_structure(json.dumps({'type':C}).encode());self.absent(r);self.assertNotIn('explicit_chart_kinds',r)
 def test_json_duplicate_malformed_oversized(self):
  for b in [b'{"type":"bar","type":"scatter"}',b'NaN',b'x'*65537,C.encode()]:
   with self.assertRaises(ValueError) as e:json_structure(b)
   self.absent(str(e.exception))
 def test_npy_reads_header_only(self):
  r=npy_structure(HeaderOnly(npy()));self.assertEqual(r['shape'],[4,2]);self.assertFalse(r['array_data_read'])
 def test_npy_object_refuses_without_unpickling(self):
  r=npy_structure(HeaderOnly(npy('|O')));self.assertEqual(r['status'],'refused_object_dtype')
 def test_npy_expression_never_executes(self):
  h=b'__import__("os").system("'+C.encode()+b'")';b=b'\x93NUMPY\x01\x00'+struct.pack('<H',len(h))+h
  with self.assertRaises(ValueError) as e:npy_structure(io.BytesIO(b))
  self.absent(str(e.exception))
 def test_npy_unknown_keys_and_shapes(self):
  for b in [npy('<f8',(-1,)),npy(C),b'\x93NUMPY\x02\x00'+struct.pack('<I',65537)]:
   with self.assertRaises(ValueError):npy_structure(io.BytesIO(b))
 def test_png_only_ihdr(self):
  h=b'IHDR'+struct.pack('>IIBBBBB',640,480,8,2,0,0,0);b=b'\x89PNG\r\n\x1a\n'+struct.pack('>I',13)+h+struct.pack('>I',zlib.crc32(h)&0xffffffff)
  r=png_structure(HeaderOnly(b));self.assertEqual((r['width'],r['height']),(640,480));self.assertFalse(r['pixel_data_read'])
 def test_png_bad_signature_crc_and_error_safe(self):
  with self.assertRaises(ValueError) as e:png_structure(io.BytesIO(C.encode()))
  self.absent(str(e.exception))
