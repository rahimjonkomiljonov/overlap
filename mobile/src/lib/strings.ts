/**
 * Every piece of text the screens show, in one place so Korean can sit next to it in M15.
 * The server only ever returns codes; the words are written here.
 */
export const strings = {
  loading: 'Loading…',
  tryAgain: 'Try again',

  offlineTitle: 'No connection',
  offlineBody: 'Overlap could not reach the server. Check your internet connection and try again.',

  upgradeTitle: 'Please update Overlap',
  upgradeBody: 'This version of the app is too old to work with our servers. Update Overlap from the app store to continue.',

  signInTitle: 'Sign in',
  signInIntro: 'Use your school email. We will send you a 6-digit code.',
  emailLabel: 'School email',
  emailPlaceholder: 'you@school.ac.kr',
  getCode: 'Get verification code',
  sending: 'Sending…',
  codeLabel: (email: string) => `Enter the 6-digit code sent to ${email}.`,
  codePlaceholder: '123456',
  verify: 'Sign in',
  verifying: 'Checking…',
  useDifferentEmail: 'Use a different email',
  errorNotSchoolEmail: 'That is not a school email address.',
  errorTooManyRequests: 'Too many requests. Please try again in a few minutes.',
  errorSendFailed: 'We could not send the code. Please try again.',
  errorWrongCode: 'That code did not work. Check it and try again, or ask for a new one.',

  signedInAs: 'Signed in as',
  signOut: 'Sign out',
  accountSetupNext: 'Next: finish setting up your account.',
  statusPaused: 'Your account is paused.',
  statusSuspended: 'Your account is suspended.',
  statusBanned: 'Your account has been removed.',
  sessionExpired: 'Your session ended. Please sign in again.',
} as const;
