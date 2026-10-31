// Fails the flow unless the database agrees: what the helper says about EMAIL's privacy state must have FIELD equal to VALUE.
// Checked for up to ten seconds, because the app's request lands a moment after the tap.
var url = HELPER + '/privacy/state?email=' + encodeURIComponent(EMAIL);
var deadline = Date.now() + 10000;
var state;
for (;;) {
  var r = http.get(url);
  if (r.status < 200 || r.status >= 300) throw new Error('helper privacy state failed: ' + r.status + ' ' + r.body);
  state = json(r.body);
  if (String(state[FIELD]) === String(VALUE)) break;
  if (Date.now() > deadline) throw new Error('database says ' + FIELD + ' = ' + state[FIELD] + ', expected ' + VALUE + ' for ' + EMAIL);
  var until = Date.now() + 500;
  while (Date.now() < until) { /* wait half a second */ }
}
output.privacy = state;
