// The sign-in code the website "sent" to EMAIL (it is only written to the dev outbox, never really sent).
var r = http.get(HELPER + '/otp?email=' + encodeURIComponent(EMAIL));
var code = json(r.body).code;
if (!code) throw new Error('no sign-in code arrived for ' + EMAIL);
output.code = code;
