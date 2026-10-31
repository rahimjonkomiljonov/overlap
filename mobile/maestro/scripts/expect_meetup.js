// Fails the flow unless the database agrees: what the helper says about the meetup of MATCH must have FIELD equal to VALUE.
var r = http.get(HELPER + '/meetup/state?matchId=' + MATCH);
var state = json(r.body);
var actual = String(state[FIELD]);
if (actual !== String(VALUE)) throw new Error('database says ' + FIELD + ' = ' + actual + ', expected ' + VALUE + ' for match ' + MATCH);
output.meetup = state;
