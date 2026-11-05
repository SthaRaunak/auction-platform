import { createHash } from 'node:crypto';
import { config } from '../config';
import { randomToken } from './tokens';

// Authorization-code flow with PKCE. The ID token comes straight from Google's
// token endpoint over TLS, so we read identity from the userinfo endpoint
// rather than verifying the JWT signature ourselves.

const redirectUri = () => `${config.APP_ORIGIN}/api/auth/google/callback`;

export function startGoogleAuth() {
  const state = randomToken(16);
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { url: url.toString(), state, verifier };
}

export async function finishGoogleAuth(code: string, verifier: string) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID!,
      client_secret: config.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) throw new Error(`Google userinfo failed: ${infoRes.status}`);
  const info = (await infoRes.json()) as { sub: string; email: string; email_verified: boolean; name?: string };
  return { sub: info.sub, email: info.email, emailVerified: info.email_verified === true, name: info.name ?? '' };
}
