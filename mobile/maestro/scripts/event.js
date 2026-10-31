// Event setup and checks through the test helper. ACTION is create | rsvp | connect | ended | state.
//   create:  ORGANIZER (email), TITLE, START and END ("1 day", "-6 hours"), optional CAPACITY -> output.event
//   rsvp:    FROM (email), EVENT, GOING (yes|no), optional LISTED (yes)
//   connect: FROM (email), EVENT, TO (email)
//   ended:   EVENT
//   state:   EMAIL, EVENT -> output.result
var r;
var post = function (path, body) {
  return http.post(HELPER + path, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
};
if (ACTION === 'create') {
  var body = { organizer: ORGANIZER, title: TITLE + ' ' + Date.now(), start: START, end: END };
  if (typeof CAPACITY !== 'undefined') body.capacity = Number(CAPACITY);
  r = post('/event', body);
} else if (ACTION === 'rsvp') {
  r = post('/event/rsvp', { from: FROM, eventId: EVENT, going: GOING === 'yes', showInGuestList: typeof LISTED !== 'undefined' });
} else if (ACTION === 'connect') {
  r = post('/event/connect', { from: FROM, eventId: EVENT, toEmail: TO });
} else if (ACTION === 'ended') {
  r = post('/event/ended', { eventId: EVENT });
} else {
  r = http.get(HELPER + '/event/state?email=' + encodeURIComponent(EMAIL) + '&eventId=' + EVENT);
}
if (r.status < 200 || r.status >= 300) throw new Error('helper event ' + ACTION + ' failed: ' + r.status + ' ' + r.body);
output.result = json(r.body);
if (ACTION === 'create') output.event = output.result.id;
