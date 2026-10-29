// FROM waves at the person called TO_NAME (who must be in their picks), with NOTE.
var r = http.post(HELPER + '/wave', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, toName: TO_NAME, note: NOTE }) });
if (r.status < 200 || r.status >= 300) throw new Error('helper /wave failed: ' + r.status + ' ' + r.body);
output.wave = json(r.body);
