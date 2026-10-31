// Two finished accounts that have matched: Alice (the app signs in as her) and Bobby, with their chat.
var stamp = Date.now();
var a = { email: 'mae.' + TAG + '.a.' + stamp + '@test.ac.kr', name: 'Alice' };
var b = { email: 'mae.' + TAG + '.b.' + stamp + '@test.ac.kr', name: 'Bobby' };
var r = http.post(HELPER + '/pair', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: a, b: b, freeTime: typeof FREE_TIME !== 'undefined' }) });
if (r.status < 200 || r.status >= 300) throw new Error('helper /pair failed: ' + r.status + ' ' + r.body);
var out = json(r.body);
output.a = a.email;
output.b = b.email;
output.conversation = out.conversationId;
output.match = out.matchId;
