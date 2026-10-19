import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { auth } from "../firebase/firebase";
import adminLogo from "../assets/images/admin-login.png";

const DASHBOARD_PATH = "/admin/dashboard";
const MAX_ATTEMPTS = 3;
const LOCK_SECONDS = 30;
const LOCK_KEY = "admin_login_locked_until";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YEAR = new Date().getFullYear();

// Wrong email and wrong password share one message so the form
// never reveals which accounts exist.
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
};

const DEFAULT_ERROR = "Incorrect email or password.";
const FALLBACK_ERROR = "Something went wrong. Please try again.";

type Field = "email" | "password";
type FormErrors = Partial<Record<Field | "general", string>>;

// localStorage can throw (private mode, blocked storage), so keep it guarded.
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
    /* storage unavailable, lock still works for this session */
  }
};

const validate = (email: string, password: string): FormErrors => {
  const errors: FormErrors = {};
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL_REGEX.test(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  return errors;
};

const inputClass = (hasError: boolean) =>
  `w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400
   outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${
     hasError
       ? "border-red-400 focus:border-red-500 focus:ring-red-200"
       : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-200"
   }`;

export default function AdminLogin() {
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(readLock);
  const [now, setNow] = useState(Date.now);

  const isLocked = lockedUntil !== null && now < lockedUntil;
  const secondsLeft = isLocked ? Math.ceil((lockedUntil - now) / 1000) : 0;

  // Already signed in (or just signed in): go straight to the dashboard.
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (user) navigate(DASHBOARD_PATH, { replace: true });
      else setCheckingAuth(false);
    });
  }, [navigate]);

  // Tick once per second, only while a lock is active.
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading || isLocked) return;

    const cleanEmail = email.trim();
    const fieldErrors = validate(cleanEmail, password);

    if (fieldErrors.email || fieldErrors.password) {
      setErrors(fieldErrors);
      (fieldErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    if (!navigator.onLine) {
      setErrors({ general: ERROR_MESSAGES["auth/network-request-failed"] });
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      // onAuthStateChanged handles the redirect, so the spinner stays until we leave.
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
        setErrors({ general: DEFAULT_ERROR });
      } else {
        // Network or server problems are not the user's fault, so they don't count as attempts.
        setErrors({ general: ERROR_MESSAGES[code] ?? FALLBACK_ERROR });
      }
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Loading" />
      </div>
    );
  }

  const attemptsLeft = MAX_ATTEMPTS - attempts;
  const showWarning = errors.general && attempts > 0 && !isLocked;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <img src={adminLogo} alt="Admin portal" className="mx-auto mb-8 h-12 w-auto" />

          <h1 className="text-center text-2xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1.5 text-center text-sm text-slate-500">
            Use your admin account to open the dashboard.
          </p>

          {isLocked && (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>Too many failed attempts. Try again in {secondsLeft}s.</p>
            </div>
          )}

          {errors.general && !isLocked && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                {errors.general}
                {showWarning && (
                  <span className="block text-red-700/80">
                    {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left before a {LOCK_SECONDS}-second lock.
                  </span>
                )}
              </p>
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
                autoFocus
                placeholder="admin@example.com"
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

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
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
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700 focus-visible:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
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

            <button
              type="submit"
              disabled={loading || isLocked}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {loading ? "Signing in…" : isLocked ? `Try again in ${secondsLeft}s` : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {YEAR} Admin Portal. Authorized staff only.
        </p>
      </div>
    </main>
  );
}