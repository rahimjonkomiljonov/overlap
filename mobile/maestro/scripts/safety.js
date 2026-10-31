// Safety through the test helper. ACTION is suspend (TARGET is suspended after REPORTER reported them; ACTOR acts as the moderator)
// or expect (what the database says about EMAIL, optionally towards OTHER, must have FIELD equal to VALUE; it is checked for up to
// ten seconds, because the app's request lands a moment after the tap).
var result;
if (ACTION === 'suspend') {
  var r = http.post(HELPER + '/safety/suspend', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: TARGET, reporter: REPORTER, actor: ACTOR }) });
  if (r.status < 200 || r.status >= 300) throw new Error('helper safety suspend failed: ' + r.status + ' ' + r.body);
  result = json(r.body);
} else {
  var url = HELPER + '/safety/state?email=' + encodeURIComponent(EMAIL);
  if (typeof OTHER !== 'undefined') url += '&other=' + encodeURIComponent(OTHER);
  var deadline = Date.now() + 10000;
  for (;;) {
    var g = http.get(url);
    if (g.status < 200 || g.status >= 300) throw new Error('helper safety state failed: ' + g.status + ' ' + g.body);
    result = json(g.body);
    if (String(result[FIELD]) === String(VALUE)) break;
    if (Date.now() > deadline) throw new Error('database says ' + FIELD + ' = ' + result[FIELD] + ', expected ' + VALUE + ' for ' + EMAIL);
    var until = Date.now() + 500;
    while (Date.now() < until) { /* wait half a second */ }
  }
}
output.result = result;
