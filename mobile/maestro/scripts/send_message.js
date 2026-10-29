// FROM sends TEXT in the conversation CONVERSATION.
var r = http.post(HELPER + '/message', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, conversationId: CONVERSATION, text: TEXT }) });
if (r.status < 200 || r.status >= 300) throw new Error('helper /message failed: ' + r.status + ' ' + r.body);
output.message = json(r.body);
