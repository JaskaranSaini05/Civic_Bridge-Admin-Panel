import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  WifiOff,
} from "lucide-react";
import { auth } from "../firebase/firebase";

const DASHBOARD_PATH = "/admin/dashboard";
const MAX_ATTEMPTS = 3;
const LOCK_SECONDS = 30;
const LOCK_KEY = "civic_bridge_admin_locked_until";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YEAR = new Date().getFullYear();

const CREDENTIAL_ERRORS = new Set([
  "auth/invalid-credential",
  "auth/user-not-found",
  "auth/wrong-password",
]);

const ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account has been disabled. Contact a super admin.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
  "auth/operation-not-allowed": "Email sign-in is turned off for this project.",
};

const BAD_CREDENTIALS = "Incorrect email or password.";
const FALLBACK_ERROR = "Something went wrong. Please try again.";

type Mode = "signin" | "reset";
type Field = "email" | "password";
type FormErrors = Partial<Record<Field | "general", string>>;

const readLock = (): number | null => {
  try {
    const until = Number(localStorage.getItem(LOCK_KEY));
    return until > Date.now() ? until : null;
  } catch {
    return null;
  }
};

const writeLock = (until: number | null) => {
  try {
    if (until) localStorage.setItem(LOCK_KEY, String(until));
    else localStorage.removeItem(LOCK_KEY);
  } catch {
    return;
  }
};

const validate = (email: string, password: string, needsPassword: boolean): FormErrors => {
  const errors: FormErrors = {};
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL_REGEX.test(email)) errors.email = "Enter a valid email address.";
  if (needsPassword && !password) errors.password = "Enter your password.";
  return errors;
};

const inputClass = (hasError: boolean) =>
  `w-full rounded-lg border bg-white px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400
   outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 ${
     hasError
       ? "border-red-400 focus:border-red-500 focus:ring-red-100"
       : "border-slate-300 focus:border-teal-600 focus:ring-teal-100"
   }`;

function BridgeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden>
      <path d="M3 28h34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M12 28V10M28 28V10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M3 24C8 24 10 10 12 10c3 0 5 14 8 14s5-14 8-14c2 0 4 14 9 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BridgeArt() {
  const hangers = Array.from({ length: 11 }, (_, i) => {
    const t = (i + 1) / 12;
    const x = 110 + 240 * t;
    const y = 40 * (1 - t) ** 2 + 300 * t * (1 - t) + 40 * t ** 2;
    return { x, y };
  });

  return (
    <svg viewBox="0 0 460 200" fill="none" className="w-full text-teal-200/70" aria-hidden>
      <path d="M0 170h460" stroke="currentColor" strokeWidth="2" />
      <path d="M110 170V30M350 170V30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M0 160L110 40Q230 150 350 40L460 160" stroke="currentColor" strokeWidth="2" />
      {hangers.map(({ x, y }) => (
        <path key={x} d={`M${x} ${y}V170`} stroke="currentColor" strokeWidth="1" opacity="0.5" />
      ))}
    </svg>
  );
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [errors, setErrors] = useState<FormErrors>({});
  const [resetSent, setResetSent] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(readLock);
  const [now, setNow] = useState(Date.now);

  const isReset = mode === "reset";
  const isLocked = lockedUntil !== null && now < lockedUntil;
  const secondsLeft = isLocked ? Math.ceil((lockedUntil - now) / 1000) : 0;
  const blocked = loading || !online || (!isReset && isLocked);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (user) navigate(DASHBOARD_PATH, { replace: true });
      else setCheckingAuth(false);
    });
  }, [navigate]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    const syncLock = (e: StorageEvent) => {
      if (e.key === LOCK_KEY) setLockedUntil(readLock());
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("storage", syncLock);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("storage", syncLock);
    };
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    setNow(Date.now());
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) {
        clearInterval(id);
        setLockedUntil(null);
        setAttempts(0);
        writeLock(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const handleChange =
    (field: Field, setter: (value: string) => void) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      setErrors((prev) =>
        prev[field] || prev.general ? { ...prev, [field]: undefined, general: undefined } : prev
      );
    };

  const trackCapsLock = (e: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState("CapsLock"));

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setPassword("");
    setShowPassword(false);
    setCapsLock(false);
    setResetSent(false);
    requestAnimationFrame(() => emailRef.current?.focus());
  };

  const rejectInvalid = (fieldErrors: FormErrors) => {
    if (!fieldErrors.email && !fieldErrors.password) return false;
    setErrors(fieldErrors);
    (fieldErrors.email ? emailRef : passwordRef).current?.focus();
    return true;
  };

  const signIn = async (cleanEmail: string) => {
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (err) {
      const code = (err as FirebaseError).code;

      if (CREDENTIAL_ERRORS.has(code)) {
        const next = attempts + 1;
        setAttempts(next);
        setPassword("");
        passwordRef.current?.focus();

        if (next >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCK_SECONDS * 1000;
          setLockedUntil(until);
          writeLock(until);
        }
        setErrors({ general: BAD_CREDENTIALS });
      } else {
        setErrors({ general: ERROR_MESSAGES[code] ?? FALLBACK_ERROR });
      }
      setLoading(false);
    }
  };

  const sendReset = async (cleanEmail: string) => {
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setResetSent(true);
    } catch (err) {
      const code = (err as FirebaseError).code;
      if (code === "auth/user-not-found") setResetSent(true);
      else setErrors({ general: ERROR_MESSAGES[code] ?? FALLBACK_ERROR });
    }
    setLoading(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (blocked) return;

    const cleanEmail = email.trim();
    if (rejectInvalid(validate(cleanEmail, password, !isReset))) return;

    setErrors({});
    setLoading(true);
    if (isReset) await sendReset(cleanEmail);
    else await signIn(cleanEmail);
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-teal-700" aria-label="Loading" />
      </div>
    );
  }

  const attemptsLeft = MAX_ATTEMPTS - attempts;
  const showWarning = !!errors.general && attempts > 0 && attemptsLeft > 0 && !isLocked && !isReset;

  const buttonLabel = loading
    ? isReset
      ? "Sending link…"
      : "Signing in…"
    : !online
      ? "You're offline"
      : !isReset && isLocked
        ? `Try again in ${secondsLeft}s`
        : isReset
          ? "Send reset link"
          : "Sign in";

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-teal-950 p-12 text-teal-50 lg:flex">
        <div className="flex items-center gap-3">
          <BridgeMark className="h-9 w-9 text-teal-300" />
          <span className="text-lg font-semibold tracking-tight">Civic Bridge</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            From a resident's report to a fixed street.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-teal-100/75">
            Review incoming issues, assign them to the right team, and keep residents updated until the work is done.
          </p>
        </div>

        <div>
          <BridgeArt />
          <p className="mt-6 text-sm text-teal-100/60">Staff access only. Sign-ins are logged.</p>
        </div>
      </aside>

      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <BridgeMark className="h-8 w-8 text-teal-700" />
            <span className="text-lg font-semibold tracking-tight text-slate-900">Civic Bridge</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {isReset ? "Reset your password" : "Sign in to the admin panel"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {isReset
              ? "Enter your work email and we'll send you a link to choose a new password."
              : "Use your staff account to manage reported issues."}
          </p>

          {!online && (
            <div
              role="status"
              className="mt-6 flex items-start gap-2.5 rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-700"
            >
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>You're offline. Reconnect to continue.</p>
            </div>
          )}

          {!isReset && isLocked && (
            <div
              role="status"
              className="mt-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>Too many failed attempts. You can try again in {secondsLeft}s.</p>
            </div>
          )}

          {errors.general && !(isLocked && !isReset) && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                {errors.general}
                {showWarning && (
                  <span className="mt-0.5 block text-red-700/80">
                    {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left before a {LOCK_SECONDS}-second lock.
                  </span>
                )}
              </p>
            </div>
          )}

          {resetSent && (
            <div
              role="status"
              className="mt-6 flex items-start gap-2.5 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>If an account exists for {email.trim()}, a reset link is on its way. Check your spam folder too.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                ref={emailRef}
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                placeholder="name@city.gov"
                value={email}
                onChange={handleChange("email", setEmail)}
                disabled={loading}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                className={inputClass(!!errors.email)}
              />
              {errors.email && (
                <p id="email-error" className="mt-1.5 text-sm text-red-600">
                  {errors.email}
                </p>
              )}
            </div>

            {!isReset && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode("reset")}
                    disabled={loading}
                    className="rounded text-sm font-medium text-teal-700 hover:text-teal-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-60"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={handleChange("password", setPassword)}
                    onKeyDown={trackCapsLock}
                    onKeyUp={trackCapsLock}
                    onBlur={() => setCapsLock(false)}
                    disabled={loading}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    className={`${inputClass(!!errors.password)} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={loading}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700 focus-visible:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="mt-1.5 text-sm text-red-600">
                    {errors.password}
                  </p>
                )}
                {capsLock && !errors.password && (
                  <p className="mt-1.5 text-sm text-amber-700">Caps Lock is on.</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={blocked}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {buttonLabel}
            </button>

            {isReset && (
              <button
                type="button"
                onClick={() => switchMode("signin")}
                disabled={loading}
                className="mx-auto flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-60"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to sign in
              </button>
            )}
          </form>

          <p className="mt-10 text-xs text-slate-400">© {YEAR} Civic Bridge. Authorized staff only.</p>
        </div>
      </section>
    </main>
  );
}