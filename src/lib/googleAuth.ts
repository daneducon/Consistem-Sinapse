export interface GoogleUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}

interface StoredSession {
  accessToken: string;
  expiresAt: number;
  user: GoogleUser;
}

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const ALLOWED_DOMAIN = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || "consistem.com.br").trim().toLowerCase();
const SESSION_KEY = "sinapse_google_oauth_session";
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

let currentSession: StoredSession | null = null;

function assertConfiguration(): void {
  if (!CLIENT_ID) {
    throw new Error("Configure VITE_GOOGLE_CLIENT_ID com o OAuth Client ID do Google Cloud Console.");
  }
}

function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function clearSession(): void {
  currentSession = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

function storeSession(session: StoredSession): void {
  currentSession = session;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

function restoreSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    if (!session.accessToken || !session.user?.uid || session.expiresAt <= Date.now()) {
      clearSession();
      return null;
    }
    if (!isAllowedEmail(session.user.email)) {
      clearSession();
      return null;
    }
    currentSession = session;
    return session;
  } catch {
    clearSession();
    return null;
  }
}

async function waitForGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("O serviço de autenticação do Google não carregou. Verifique sua conexão.")),
      10_000
    );
    const interval = window.setInterval(() => {
      if (!window.google?.accounts?.oauth2) return;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      resolve();
    }, 50);
  });
}

async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("A sessão Google expirou. Entre novamente para reconectar.");
  return response.json() as Promise<GoogleProfile>;
}

function toUser(profile: GoogleProfile): GoogleUser {
  if (!profile.sub || !profile.email || !profile.email_verified) {
    throw new Error("A conta Google precisa ter um e-mail verificado.");
  }
  if (!isAllowedEmail(profile.email)) {
    throw new Error(`Acesso restrito a contas @${ALLOWED_DOMAIN}.`);
  }
  return {
    uid: profile.sub,
    email: profile.email,
    displayName: profile.name || null,
    photoURL: profile.picture || null,
  };
}

export function initAuth(
  onAuthSuccess: (user: GoogleUser, token: string) => void,
  onAuthFailure: (message?: string) => void
): () => void {
  let active = true;
  void (async () => {
    try {
      assertConfiguration();
      await waitForGoogleIdentity();
      const session = restoreSession();
      if (!session) {
        if (active) onAuthFailure();
        return;
      }
      const user = toUser(await fetchProfile(session.accessToken));
      const refreshed = { ...session, user };
      storeSession(refreshed);
      if (active) onAuthSuccess(user, session.accessToken);
    } catch (error) {
      clearSession();
      if (active) onAuthFailure(error instanceof Error ? error.message : "Não foi possível restaurar a sessão Google.");
    }
  })();
  return () => {
    active = false;
  };
}

export async function googleSignIn(): Promise<{ user: GoogleUser; accessToken: string }> {
  assertConfiguration();
  await waitForGoogleIdentity();
  const token = await new Promise<{ access_token: string; expires_in: number }>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      hint: undefined,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || "A autorização do Google foi cancelada."));
          return;
        }
        resolve({ access_token: response.access_token, expires_in: Number(response.expires_in) || 3600 });
      },
      error_callback: () => reject(new Error("Não foi possível abrir a autorização do Google.")),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });

  try {
    const user = toUser(await fetchProfile(token.access_token));
    storeSession({
      accessToken: token.access_token,
      expiresAt: Date.now() + Math.max(60, token.expires_in - 300) * 1000,
      user,
    });
    return { user, accessToken: token.access_token };
  } catch (error) {
    window.google.accounts.oauth2.revoke(token.access_token, () => undefined);
    clearSession();
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  const accessToken = currentSession?.accessToken;
  clearSession();
  if (accessToken && window.google?.accounts?.oauth2) {
    await new Promise<void>((resolve) => window.google.accounts.oauth2.revoke(accessToken, () => resolve()));
  }
}

export function getAccessToken(): string | null {
  if (currentSession && currentSession.expiresAt > Date.now()) return currentSession.accessToken;
  clearSession();
  return null;
}
