// One finished, verified account (Alice, the one the app signs in as). Set SENSITIVE to give the "who I'd like to meet" consent, PARTIAL to stop before the photos (the wizard resumes there), UNVERIFIED to leave the selfie undone, INVITE for an invite code.
var stamp = Date.now();
var email = 'mae.' + TAG + '.a.' + stamp + '@test.ac.kr';
var body = { email: email, name: 'Alice', sensitive: typeof SENSITIVE !== 'undefined', partial: typeof PARTIAL !== 'undefined', unverified: typeof UNVERIFIED !== 'undefined' };
if (typeof INVITE !== 'undefined') body.invite = INVITE;
var r = http.post(HELPER + '/user', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
if (r.status < 200 || r.status >= 300) throw new Error('helper /user failed: ' + r.status + ' ' + r.body);
output.a = email;
