// Device lock using Web Authentication API (biometrics / PIN)
// Falls back gracefully if not supported

const CREDENTIAL_KEY = 'ledger_device_lock_id';

function getStoredCredentialId(): string | null {
  return localStorage.getItem(CREDENTIAL_KEY);
}

function storeCredentialId(id: string) {
  localStorage.setItem(CREDENTIAL_KEY, id);
}

function isWebAuthnSupported(): boolean {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function registerDeviceLock(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'دفتر الحسابات', id: window.location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'ledger-user',
          displayName: 'مستخدم دفتر الحسابات',
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null;

    if (credential) {
      storeCredentialId(bufferToBase64(credential.rawId));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function verifyDeviceLock(): Promise<boolean> {
  if (!isWebAuthnSupported()) return true; // allow access if not supported
  const credId = getStoredCredentialId();
  if (!credId) return true; // no lock set up yet, allow access

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          id: base64ToBuffer(credId),
          type: 'public-key',
          transports: ['internal'],
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export function isDeviceLockEnabled(): boolean {
  return !!getStoredCredentialId();
}

export function removeDeviceLock() {
  localStorage.removeItem(CREDENTIAL_KEY);
}

export { isWebAuthnSupported };
