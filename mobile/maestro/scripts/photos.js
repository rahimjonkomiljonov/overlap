// Three photos for the account EMAIL, through the helper (the app's own photo picker is covered separately).
var r = http.post(HELPER + '/photos', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL }) });
if (r.status < 200 || r.status >= 300) throw new Error('helper /photos failed: ' + r.status + ' ' + r.body);
output.photos = json(r.body);
