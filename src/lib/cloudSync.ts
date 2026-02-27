import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where
} from "firebase/firestore";
import { firebaseAuth, firebaseDb, firebaseEnabled } from "./firebase";
import type { DictionaryTerm } from "../types/voicewave";

const MAX_RECENT_SENTENCES = 5;

export interface CloudProfile {
  uid: string;
  name: string;
  email: string;
  workspaceRole: string;
}

export interface CloudSentence {
  id: string;
  text: string;
  createdAtUtcMs: number;
}

function mapDictionaryTermRow(row: { id: string; data: () => Record<string, unknown> }): DictionaryTerm {
  const data = row.data();
  return {
    termId: row.id,
    term: typeof data.term === "string" ? data.term : "",
    source: typeof data.source === "string" ? data.source : "cloud-sync",
    createdAtUtcMs: typeof data.createdAtUtcMs === "number" ? data.createdAtUtcMs : Date.now()
  };
}

function requireCloud(): void {
  if (!firebaseEnabled || !firebaseAuth || !firebaseDb) {
    throw new Error(
      "Firebase is not configured. Set VITE_FIREBASE_* variables to enable cloud auth and sync."
    );
  }
}

function readFirebaseMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Cloud request failed.";
  }
  const code = "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Invalid email or password.";
  }
  if (code === "auth/email-already-in-use") {
    return "This email already has an account.";
  }
  if (code === "auth/weak-password") {
    return "Password is too weak. Use at least 6 characters.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Please try again shortly.";
  }
  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }
  if (code === "auth/missing-email") {
    return "Email is required for this action.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Google sign-in popup was closed before completing.";
  }
  if (code === "auth/popup-blocked") {
    return "Popup was blocked. Please allow popups and try again.";
  }
  if (code === "auth/cancelled-popup-request") {
    return "Another sign-in request is already in progress.";
  }
  if ("message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Cloud request failed.";
}

function toProfile(user: User, workspaceRole = "Personal Workspace"): CloudProfile {
  const fallbackName = user.email?.split("@")[0] ?? "VoiceWave User";
  return {
    uid: user.uid,
    name: user.displayName ?? fallbackName,
    email: user.email ?? "",
    workspaceRole
  };
}

export function getCloudErrorMessage(error: unknown): string {
  return readFirebaseMessage(error);
}

export function subscribeCloudAuth(listener: (user: User | null) => void): () => void {
  requireCloud();
  return onAuthStateChanged(firebaseAuth!, listener);
}

export async function signUpCloud(input: {
  email: string;
  password: string;
  name: string;
  workspaceRole: string;
}): Promise<CloudProfile> {
  requireCloud();
  try {
    const credential = await createUserWithEmailAndPassword(
      firebaseAuth!,
      input.email.trim(),
      input.password
    );
    const name = input.name.trim() || credential.user.email?.split("@")[0] || "VoiceWave User";
    await updateProfile(credential.user, { displayName: name });

    const profile = toProfile(credential.user, input.workspaceRole.trim() || "Personal Workspace");
    await setDoc(
      doc(firebaseDb!, "users", credential.user.uid),
      {
        name: profile.name,
        email: profile.email,
        workspaceRole: profile.workspaceRole,
        createdAtUtcMs: Date.now(),
        updatedAtUtcMs: Date.now()
      },
      { merge: true }
    );
    return profile;
  } catch (error) {
    throw new Error(readFirebaseMessage(error));
  }
}

export async function signInCloud(email: string, password: string): Promise<CloudProfile> {
  requireCloud();
  try {
    const credential = await signInWithEmailAndPassword(firebaseAuth!, email.trim(), password);
    return ensureCloudProfile(credential.user, "Personal Workspace");
  } catch (error) {
    throw new Error(readFirebaseMessage(error));
  }
}

export async function signInWithGoogleCloud(): Promise<CloudProfile> {
  requireCloud();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const credential = await signInWithPopup(firebaseAuth!, provider);
    return ensureCloudProfile(credential.user, "Personal Workspace");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

    if (code === "auth/popup-blocked") {
      await signInWithRedirect(firebaseAuth!, provider);
      throw new Error("GOOGLE_REDIRECT_STARTED");
    }

    throw new Error(readFirebaseMessage(error));
  }
}

export async function completeGoogleRedirectSignIn(): Promise<CloudProfile | null> {
  requireCloud();
  try {
    const credential = await getRedirectResult(firebaseAuth!);
    if (!credential?.user) {
      return null;
    }
    return ensureCloudProfile(credential.user, "Personal Workspace");
  } catch (error) {
    throw new Error(readFirebaseMessage(error));
  }
}

export async function signOutCloud(): Promise<void> {
  requireCloud();
  try {
    await signOut(firebaseAuth!);
  } catch (error) {
    throw new Error(readFirebaseMessage(error));
  }
}

export async function requestPasswordResetCloud(email: string): Promise<void> {
  requireCloud();
  try {
    await sendPasswordResetEmail(firebaseAuth!, email.trim());
  } catch (error) {
    throw new Error(readFirebaseMessage(error));
  }
}

export async function ensureCloudProfile(user: User, fallbackWorkspaceRole: string): Promise<CloudProfile> {
  requireCloud();
  const userRef = doc(firebaseDb!, "users", user.uid);
  const existing = await getDoc(userRef);
  const baseProfile = toProfile(user, fallbackWorkspaceRole);

  if (existing.exists()) {
    const data = existing.data();
    return {
      uid: user.uid,
      name:
        typeof data.name === "string" && data.name.trim().length > 0
          ? data.name
          : baseProfile.name,
      email:
        typeof data.email === "string" && data.email.trim().length > 0
          ? data.email
          : baseProfile.email,
      workspaceRole:
        typeof data.workspaceRole === "string" && data.workspaceRole.trim().length > 0
          ? data.workspaceRole
          : baseProfile.workspaceRole
    };
  }

  await setDoc(userRef, {
    name: baseProfile.name,
    email: baseProfile.email,
    workspaceRole: baseProfile.workspaceRole,
    createdAtUtcMs: Date.now(),
    updatedAtUtcMs: Date.now()
  });
  return baseProfile;
}

export async function listRecentCloudSentences(uid: string): Promise<CloudSentence[]> {
  requireCloud();
  const rows = await getDocs(
    query(
      collection(firebaseDb!, "users", uid, "recentSentences"),
      orderBy("createdAtUtcMs", "desc"),
      limit(MAX_RECENT_SENTENCES)
    )
  );

  return rows.docs.map((row) => {
    const data = row.data();
    return {
      id: row.id,
      text: typeof data.text === "string" ? data.text : "",
      createdAtUtcMs: typeof data.createdAtUtcMs === "number" ? data.createdAtUtcMs : Date.now()
    };
  });
}

export async function saveCloudSentence(uid: string, text: string): Promise<CloudSentence[]> {
  requireCloud();
  const normalized = text.trim();
  if (!normalized) {
    return listRecentCloudSentences(uid);
  }

  const rowRef = doc(collection(firebaseDb!, "users", uid, "recentSentences"));
  await setDoc(rowRef, {
    text: normalized,
    createdAtUtcMs: Date.now()
  });

  const recentRows = await getDocs(
    query(collection(firebaseDb!, "users", uid, "recentSentences"), orderBy("createdAtUtcMs", "desc"))
  );
  const stale = recentRows.docs.slice(MAX_RECENT_SENTENCES);
  await Promise.all(stale.map((entry) => deleteDoc(entry.ref)));

  return recentRows.docs.slice(0, MAX_RECENT_SENTENCES).map((row) => {
    const data = row.data();
    return {
      id: row.id,
      text: typeof data.text === "string" ? data.text : "",
      createdAtUtcMs: typeof data.createdAtUtcMs === "number" ? data.createdAtUtcMs : Date.now()
    };
  });
}

export async function listCloudDictionaryTerms(uid: string): Promise<DictionaryTerm[]> {
  requireCloud();
  const rows = await getDocs(
    query(collection(firebaseDb!, "users", uid, "dictionaryTerms"), orderBy("createdAtUtcMs", "desc"))
  );
  return rows.docs.map((row) => mapDictionaryTermRow({ id: row.id, data: () => row.data() }));
}

export async function addCloudDictionaryTerm(
  uid: string,
  term: string,
  source = "manual-add"
): Promise<DictionaryTerm[]> {
  requireCloud();
  const normalized = term.trim();
  if (!normalized) {
    return listCloudDictionaryTerms(uid);
  }

  const normalizedKey = normalized.toLowerCase();
  const existing = await getDocs(
    query(
      collection(firebaseDb!, "users", uid, "dictionaryTerms"),
      where("termNormalized", "==", normalizedKey),
      limit(1)
    )
  );
  if (!existing.empty) {
    return listCloudDictionaryTerms(uid);
  }

  const termRef = doc(collection(firebaseDb!, "users", uid, "dictionaryTerms"));
  await setDoc(termRef, {
    term: normalized,
    source,
    termNormalized: normalizedKey,
    createdAtUtcMs: Date.now()
  });

  return listCloudDictionaryTerms(uid);
}

export async function deleteCloudDictionaryTerm(uid: string, termId: string): Promise<DictionaryTerm[]> {
  requireCloud();
  await deleteDoc(doc(firebaseDb!, "users", uid, "dictionaryTerms", termId));
  return listCloudDictionaryTerms(uid);
}
