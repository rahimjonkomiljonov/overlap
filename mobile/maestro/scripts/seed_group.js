// Finished accounts that share a course: Alice (the one the app signs in as), then Bobby and, if COUNT is 3, Carla.
var stamp = Date.now();
var names = ['Alice', 'Bobby', 'Carla'].slice(0, Number(COUNT));
var people = names.map(function (name, i) {
  return { email: 'mae.' + TAG + '.' + 'abc'[i] + '.' + stamp + '@test.ac.kr', name: name };
});
var r = http.post(HELPER + '/group', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ people: people }) });
if (r.status < 200 || r.status >= 300) throw new Error('helper /group failed: ' + r.status + ' ' + r.body);
output.a = people[0].email;
output.b = people[1].email;
output.c = people.length > 2 ? people[2].email : null;
output.ids = json(r.body).people;
