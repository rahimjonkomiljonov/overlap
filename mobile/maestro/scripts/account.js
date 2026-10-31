// Account-level setup through the test helper. ACTION is wave-cap (EMAIL has already sent today's eight waves) or expire-session (EMAIL's
// sign-in is ended on the server).
var path = ACTION === 'wave-cap' ? '/wave-cap/fill' : '/session/expire';
var r = http.post(HELPER + path, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL }) });
if (r.status < 200 || r.status >= 300) throw new Error('helper ' + path + ' failed: ' + r.status + ' ' + r.body);
output.result = json(r.body);
