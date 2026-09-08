/// <reference types="vite/client" />

interface GoogleOAuthTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface GoogleOAuthTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface Window {
  google: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          hint?: string;
          callback(response: GoogleOAuthTokenResponse): void;
          error_callback?(error: unknown): void;
        }): GoogleOAuthTokenClient;
        revoke(accessToken: string, callback: () => void): void;
      };
    };
  };
}
