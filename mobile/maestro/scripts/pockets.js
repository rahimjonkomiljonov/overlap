// Campus Pockets through the test helper. ACTION is visible (FROM turns their own visibility on) or expect (EMAIL must have VISIBLE true or false).
var r;
if (ACTION === 'visible') {
  r = http.post(HELPER + '/pockets/visible', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, visible: true }) });
} else {
  r = http.get(HELPER + '/pockets/state?email=' + encodeURIComponent(EMAIL));
}
if (r.status < 200 || r.status >= 300) throw new Error('helper pockets ' + ACTION + ' failed: ' + r.status + ' ' + r.body);
var result = json(r.body);
if (ACTION === 'expect' && String(result.visible) !== String(VISIBLE)) throw new Error('database says visible = ' + result.visible + ', expected ' + VISIBLE + ' for ' + EMAIL);
output.result = result;
