// Fails the flow unless the database agrees: what the helper says about EMAIL must have FIELD equal to VALUE.
var r = http.get(HELPER + '/state?email=' + encodeURIComponent(EMAIL));
var state = json(r.body);
var actual = String(state[FIELD]);
if (actual !== String(VALUE)) throw new Error('database says ' + FIELD + ' = ' + actual + ', expected ' + VALUE + ' for ' + EMAIL);
output.state = state;
