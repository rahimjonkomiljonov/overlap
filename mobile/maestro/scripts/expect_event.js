// Fails the flow unless the database agrees: what the helper says about EMAIL at EVENT must have FIELD equal to VALUE.
var r = http.get(HELPER + '/event/state?email=' + encodeURIComponent(EMAIL) + '&eventId=' + EVENT);
var state = json(r.body);
var actual = String(state[FIELD]);
if (actual !== String(VALUE)) throw new Error('database says ' + FIELD + ' = ' + actual + ', expected ' + VALUE + ' for ' + EMAIL);
output.event_state = state;
