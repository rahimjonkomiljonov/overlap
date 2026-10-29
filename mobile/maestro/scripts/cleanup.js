// Removes every account the helper made.
var r = http.post(HELPER + '/cleanup', { headers: { 'Content-Type': 'application/json' }, body: '{}' });
output.cleanup = json(r.body);
