// Fails unless EMAIL has exactly COUNT people in today's picks.
var state = json(http.get(HELPER + '/picks?email=' + encodeURIComponent(EMAIL)).body);
if (String(state.count) !== String(COUNT)) throw new Error('picks for ' + EMAIL + ': ' + state.count + ' (' + state.names.join(', ') + '), expected ' + COUNT);
output.picks = state.names;
