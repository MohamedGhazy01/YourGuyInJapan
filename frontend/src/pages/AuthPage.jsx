import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppProvider";
import api from "../services/api";

export const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth, setNotice } = useApp();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError("");

    if (mode === "register" && !form.name.trim()) {
      setError("Full name is required.");
      return;
    }

    if (!form.email.trim() || !form.password.trim()) {
      setError("Email and password are required.");
      return;
    }

    if (mode === "register" && form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        mode === "login"
          ? { email: form.email.trim().toLowerCase(), password: form.password }
          : { ...form, name: form.name.trim(), email: form.email.trim().toLowerCase() };
      const response = await api.post(endpoint, payload);
      setAuth(response.data);
      setNotice(mode === "login" ? "Welcome back." : "Account created successfully.");
      const redirectTo = location.state?.from?.pathname || "/";
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.message || "Unable to continue");
      } else {
        setError("Unable to reach the server. Make sure the backend is running on port 5000.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="container-shell py-12">
      <div className="mx-auto max-w-xl glass rounded-[40px] p-8">
        <h1 className="section-title">{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p className="mt-3 opacity-70">Sign in before checkout to save your orders and wishlist.</p>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          {mode === "register" && (
            <input
              className="input"
              placeholder="Full name"
              autoComplete="name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Sign up"}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm opacity-70"
          onClick={() => {
            setError("");
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
        </button>
      </div>
    </section>
  );
};
