// Selfie verification through the test helper. ACTION is decide (a moderator decides EMAIL's pending selfie: DECISION is
// REJECTED or APPROVED, with an optional REASON) or expect (what the database says about EMAIL's selfies must have FIELD equal
// to VALUE, checked for up to ten seconds because the app's upload lands a moment after the tap).
var result;
if (ACTION === 'decide') {
  var body = { email: EMAIL, decision: DECISION };
  if (typeof REASON !== 'undefined') body.reason = REASON;
  var r = http.post(HELPER + '/selfie/decide', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status < 200 || r.status >= 300) throw new Error('helper selfie decide failed: ' + r.status + ' ' + r.body);
  result = json(r.body);
} else {
  var deadline = Date.now() + 10000;
  for (;;) {
    var g = http.get(HELPER + '/selfie/state?email=' + encodeURIComponent(EMAIL));
    if (g.status < 200 || g.status >= 300) throw new Error('helper selfie state failed: ' + g.status + ' ' + g.body);
    result = json(g.body);
    if (String(result[FIELD]) === String(VALUE)) break;
    if (Date.now() > deadline) throw new Error('database says ' + FIELD + ' = ' + result[FIELD] + ', expected ' + VALUE + ' for ' + EMAIL);
    var until = Date.now() + 500;
    while (Date.now() < until) { /* wait half a second */ }
  }
}
output.result = result;
