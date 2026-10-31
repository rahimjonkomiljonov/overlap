// Invite codes through the test helper. ACTION is create (CODE becomes a valid invite code for a cohort where Dating is closed)
// or expect (what the database says about EMAIL's cohort and CODE's uses must have FIELD equal to VALUE, checked for up to ten seconds).
var result;
if (ACTION === 'create') {
  var r = http.post(HELPER + '/invite', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: CODE }) });
  if (r.status < 200 || r.status >= 300) throw new Error('helper invite failed: ' + r.status + ' ' + r.body);
  result = json(r.body);
} else {
  var deadline = Date.now() + 10000;
  for (;;) {
    var g = http.get(HELPER + '/invite/state?email=' + encodeURIComponent(EMAIL) + '&code=' + encodeURIComponent(CODE));
    if (g.status < 200 || g.status >= 300) throw new Error('helper invite state failed: ' + g.status + ' ' + g.body);
    result = json(g.body);
    if (String(result[FIELD]) === String(VALUE)) break;
    if (Date.now() > deadline) throw new Error('database says ' + FIELD + ' = ' + result[FIELD] + ', expected ' + VALUE + ' for ' + EMAIL);
    var until = Date.now() + 500;
    while (Date.now() < until) { /* wait half a second */ }
  }
}
output.result = result;
