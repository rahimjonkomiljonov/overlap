// The other person's side of a meetup, and what the database says about it.
// ACTION is propose | respond | past | state; FROM (their email), MATCH (the match id) and DECISION (ACCEPT or DECLINE) as needed.
var r;
if (ACTION === 'state') {
  r = http.get(HELPER + '/meetup/state?matchId=' + MATCH);
} else {
  var body = { matchId: MATCH };
  if (typeof FROM !== 'undefined') body.from = FROM;
  if (typeof DECISION !== 'undefined') body.decision = DECISION;
  r = http.post(HELPER + '/meetup/' + ACTION, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
if (r.status < 200 || r.status >= 300) throw new Error('helper meetup ' + ACTION + ' failed: ' + r.status + ' ' + r.body);
output.result = json(r.body);
