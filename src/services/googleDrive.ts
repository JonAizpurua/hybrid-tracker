import { appRepository } from '../data/repository';
import type { HybridBackup } from '../types';
import { validateBackupValue } from './backupService';

const FILE_NAME = 'HybridTrackerBackup.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: TokenResponse) => void }) => TokenClient; revoke: (token: string, callback: () => void) => void } } };
  }
}

let accessToken = '';
let tokenClient: TokenClient | null = null;

const loadScript = () => new Promise<void>((resolve, reject) => {
  if (window.google) { resolve(); return; }
  const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
  if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); return; }
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.dataset.googleIdentity = 'true';
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Google sign-in could not be loaded.'));
  document.head.appendChild(script);
});

const request = async (url: string, init?: RequestInit) => {
  if (!navigator.onLine) throw new Error('Google Drive is unavailable while offline.');
  if (!accessToken) throw new Error('Connect Google Drive first.');
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers } });
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);
  return response;
};

export const googleDrive = {
  configured: Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID),
  isConnected: () => Boolean(accessToken),

  async connect() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('Google Drive setup is required. Add VITE_GOOGLE_CLIENT_ID to your environment.');
    if (!navigator.onLine) throw new Error('Connect to the internet before linking Google Drive.');
    await loadScript();
    await new Promise<void>((resolve, reject) => {
      tokenClient ??= window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) { reject(new Error('Google Drive connection was not completed.')); return; }
          accessToken = response.access_token;
          resolve();
        }
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  },

  disconnect() {
    if (accessToken && window.google) window.google.accounts.oauth2.revoke(accessToken, () => undefined);
    accessToken = '';
  },

  async findBackupFile(): Promise<string | undefined> {
    const query = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const response = await request(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc`);
    const result = await response.json() as { files?: Array<{ id: string }> };
    return result.files?.[0]?.id;
  },

  async backup(existingId?: string): Promise<string> {
    const backup = await appRepository.exportBackup();
    const body = JSON.stringify(backup);
    const fileId = existingId ?? await this.findBackupFile();
    if (fileId) {
      await request(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return fileId;
    }
    const boundary = `hybrid-${crypto.randomUUID()}`;
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const response = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
    return ((await response.json()) as { id: string }).id;
  },

  async restore(fileId?: string): Promise<HybridBackup> {
    const id = fileId ?? await this.findBackupFile();
    if (!id) throw new Error('No Hybrid Tracker backup was found in Google Drive.');
    const response = await request(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
    const value: unknown = await response.json();
    return validateBackupValue(value);
  }
};
