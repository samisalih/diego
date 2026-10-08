import { useState, type SyntheticEvent } from "react";
import { de } from "../i18n/de.ts";
import { signInWithPassword } from "./signIn.ts";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(await signInWithPassword(email, password));
    setIsSubmitting(false);
  }

  const fieldClass = errorMessage ? "field field-error" : "field";

  return (
    <main className="screen-center">
      <form className="panel" onSubmit={handleSubmit}>
        <h1 className="display">{de.app.title}</h1>
        <div className={fieldClass}>
          <label className="caps" htmlFor="login-email">{de.auth.email}</label>
          <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div className={fieldClass}>
          <label className="caps" htmlFor="login-password">{de.auth.password}</label>
          <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? de.auth.signingIn : de.auth.signIn}
        </button>
      </form>
    </main>
  );
}
