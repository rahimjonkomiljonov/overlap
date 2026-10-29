// POST BODY (a JSON string) to the test helper at PATH, and keep what it answers in output.result.
var r = http.post(HELPER + PATH, { headers: { 'Content-Type': 'application/json' }, body: BODY });
if (r.status < 200 || r.status >= 300) throw new Error('helper ' + PATH + ' failed: ' + r.status + ' ' + r.body);
output.result = json(r.body);
