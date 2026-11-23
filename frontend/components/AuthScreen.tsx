"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { api, type Session } from "@/lib/api";

export function AuthScreen({ onLogin }: { onLogin: (s: Session) => void }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<Session>(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-background" />
      <section className="auth-intro">
        <div className="brand">
          <span className="brand-mark">
            <Zap size={23} />
          </span>
          <span>
            autoapply<span className="brand-accent">.ai</span>
          </span>
        </div>
        <div className="eyebrow">
          <Sparkles size={15} /> SUA CARREIRA, COM MAIS INTELIGÊNCIA
        </div>
        <h1>
          Vagas melhores.
          <br />
          <span>Menos trabalho repetitivo.</span>
        </h1>
        <p>
          Importe qualquer vaga, avalie compatibilidade com seu currículo, gere respostas e cartas
          com RAG e acompanhe todo o processo em um só painel.
        </p>
        <div className="auth-points">
          <span>
            <CheckCircle2 /> Importação universal
          </span>
          <span>
            <CheckCircle2 /> Kit 1-clique + RAG
          </span>
          <span>
            <CheckCircle2 /> Pipeline e comprovantes
          </span>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-card-heading">
          <div className="small-icon">
            <BriefcaseBusiness size={21} />
          </div>
          <h2>{register ? "Crie sua conta" : "Bem-vindo de volta"}</h2>
          <p>{register ? "Comece a encontrar vagas compatíveis" : "Acesse sua área de candidaturas"}</p>
        </div>
        <form onSubmit={submit}>
          <label>
            E-mail profissional
            <input
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={register ? 10 : 1}
              placeholder={register ? "Mínimo de 10 caracteres" : "Sua senha"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn primary full" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : null}
            {register ? "Criar conta" : "Entrar"}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="switch">
          {register ? "Já tem uma conta?" : "Ainda não tem conta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Fazer login" : "Criar gratuitamente"}
          </button>
        </p>
        <div className="auth-foot">
          <ShieldCheck size={15} /> Dados sob seu controle e aprovação humana obrigatória
        </div>
      </section>
    </main>
  );
}
