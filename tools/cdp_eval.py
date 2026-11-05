"""Evaluate JS in the phone Chrome tab whose URL contains a marker (adb-forwarded CDP on :9333). Prints only the result."""
import asyncio, json, sys, urllib.request
import websockets
mark, expr = sys.argv[1], sys.argv[2]
tabs = [t for t in json.load(urllib.request.urlopen("http://127.0.0.1:9333/json")) if mark in t.get("url", "") and t.get("type") == "page"]
async def main():
    if not tabs: print(json.dumps({"error": "no tab"})); return
    async with websockets.connect(tabs[0]["webSocketDebuggerUrl"], max_size=2**24) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
        while True:
            m = json.loads(await ws.recv())
            if m.get("id") == 1: print(json.dumps(m.get("result", {}).get("result", {}).get("value", m))); return
asyncio.run(main())
