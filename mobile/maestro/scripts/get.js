// GET PATH from the test helper and keep the answer in output.result.
var r = http.get(HELPER + PATH);
if (r.status < 200 || r.status >= 300) throw new Error('helper ' + PATH + ' failed: ' + r.status + ' ' + r.body);
output.result = json(r.body);
