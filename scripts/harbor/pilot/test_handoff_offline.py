import unittest,asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
from test_handoff_control import history
from broker import Bound,ManagedCommand
class Budget(unittest.TestCase):
 def test_fixed_history_rejects_open_repeated_invalid_and_exhausted_intervals(self):
  self.assertEqual(history([]),0)
  pair=[{'event':'start','attempt':'a','start_monotonic':10},{'event':'end','attempt':'a','end_monotonic':12,'elapsed':2}]
  self.assertEqual(history(pair),2)
  for bad in [pair[:1],pair*2,[pair[0],{**pair[1],'elapsed':0}],[pair[0],{**pair[1],'end_monotonic':1810,'elapsed':1800}]]:
   with self.assertRaises(RuntimeError):history(bad)
class Handoff(unittest.IsolatedAsyncioTestCase):
 async def test_admission_closes_before_inflight_finishes(self):
  entered=asyncio.Event();finish=asyncio.Event();interrupt=asyncio.Event()
  async def run(*_):entered.set();await interrupt.wait();await finish.wait();return {'status':'interrupted','termination':{'confirmed':True}}
  c=SimpleNamespace(run=run,interrupt=interrupt,confirm_quiescent=AsyncMock(return_value={'confirmed':True}))
  verifier=AsyncMock();b=Bound(None,AsyncMock(),verifier,c);op=asyncio.create_task(b.exec('writer',2));await entered.wait();q=asyncio.create_task(b.quiesce());await interrupt.wait()
  with self.assertRaises(RuntimeError):await b.exec('late',2)
  with self.assertRaises(RuntimeError):await b.verify()
  finish.set();await op;self.assertTrue((await q)['confirmed']);await b.verify();verifier.assert_awaited_once()
  with self.assertRaises(RuntimeError):await b.verify()
 async def test_unknown_identity_is_not_automatically_a_service(self):
  c=ManagedCommand('synthetic');c.baseline={1:{'start':'1'}};c.snapshot=AsyncMock(return_value={1:{'start':'1'},99:{'start':'2'}})
  self.assertFalse((await c.confirm_quiescent())['confirmed'])
  c.snapshot=AsyncMock(return_value={1:{'start':'other'}});self.assertFalse((await c.confirm_quiescent())['confirmed'])
 async def test_unconfirmed_quiescence_stops_environment_and_never_grades(self):
  c=SimpleNamespace(interrupt=asyncio.Event(),confirm_quiescent=AsyncMock(return_value={'confirmed':False}))
  stop=AsyncMock();verify=AsyncMock();b=Bound(None,stop,verify,c);self.assertFalse((await b.quiesce())['confirmed']);stop.assert_awaited_once()
  with self.assertRaises(RuntimeError):await b.verify()
  verify.assert_not_awaited()
