import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, MailCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { forgotPassword } from "../api/forgot-password";
import { verifyResetCode } from "../api/verify-reset-code";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { AuthPageShell } from "../components/AuthPageShell";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [challengeId, setChallengeId] = useState<string | null>(null); const [code, setCode] = useState<string[]>(Array(6).fill("")); const [resendRemaining, setResendRemaining] = useState(0); const refs = useRef<Array<HTMLInputElement | null>>([]); const navigate = useNavigate();
  const request = useMutation({ mutationFn: forgotPassword, onSuccess: (data) => { setChallengeId(data.challengeId); setResendRemaining(60); } });
  const verify = useMutation({ mutationFn: () => verifyResetCode(challengeId ?? "", code.join("")), onSuccess: ({ resetGrant }) => { sessionStorage.setItem("top.auth.reset-grant.v1", resetGrant); navigate("/reset-password"); } });
  useEffect(() => { if (!resendRemaining) return; const timer = window.setInterval(() => setResendRemaining((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [resendRemaining]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (challengeId) { if (code.join("").length === 6) void verify.mutateAsync(); } else void request.mutateAsync(email.trim()); };
  const resend = () => { if (!resendRemaining) { setChallengeId(null); setCode(Array(6).fill("")); void request.mutateAsync(email.trim()); } };
  const setDigit = (index: number, value: string) => { const digit = value.replace(/\D/g, "").slice(-1); const next = [...code]; next[index] = digit; setCode(next); if (digit && index < 5) refs.current[index + 1]?.focus(); };
  const onPaste = (event: ClipboardEvent) => { const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split(""); if (!digits.length) return; event.preventDefault(); setCode([...digits, ...Array(6 - digits.length).fill("")]); refs.current[Math.min(digits.length, 6) - 1]?.focus(); };
  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Backspace" && !code[index] && index > 0) refs.current[index - 1]?.focus(); };
  const error = request.error ?? verify.error;
  return <AuthPageShell labelledBy="forgot-title"><Link className="top-auth-back" to="/login"><ArrowLeft size={16} aria-hidden="true" /> Volver al inicio de sesión</Link><div className="top-auth-mobile-brand">TOP<span>Gestión de alojamientos</span></div><header className="top-auth-header"><MailCheck size={30} aria-hidden="true" /><h1 id="forgot-title" className="top-auth-title">{challengeId ? "Revisá tu correo" : "Recuperá tu contraseña"}</h1><p className="top-auth-description">{challengeId ? `Enviamos un código de 6 dígitos a ${maskEmail(email)}.` : "Te enviaremos un código para verificar tu identidad."}</p></header><form className="top-auth-form" onSubmit={submit} noValidate>{challengeId ? <div className="top-otp" onPaste={onPaste}>{code.map((digit, index) => <input key={index} ref={(element) => { refs.current[index] = element; }} aria-label={`Dígito ${index + 1}`} autoComplete={index === 0 ? "one-time-code" : "off"} inputMode="numeric" maxLength={1} value={digit} onChange={(event: ChangeEvent<HTMLInputElement>) => setDigit(index, event.target.value)} onKeyDown={(event) => onKeyDown(index, event)} />)}</div> : <Input label="Correo electrónico" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />}{error ? <div className="top-auth-error" role="alert">{error instanceof ApiError ? error.message : "No pudimos procesar la solicitud."}</div> : null}<Button type="submit" size="lg" loading={request.isPending || verify.isPending} loadingLabel="Procesando...">{challengeId ? "Verificar código" : "Enviar código"} <ArrowRight size={18} aria-hidden="true" /></Button>{challengeId ? <button type="button" className="top-auth-resend" disabled={resendRemaining > 0} onClick={resend}>{resendRemaining > 0 ? `Reenviar en 00:${String(resendRemaining).padStart(2, "0")}` : "¿No recibiste el código? Reenviar código"}</button> : null}</form></AuthPageShell>;
}
function maskEmail(email: string): string { const [name, domain] = email.split("@"); return name && domain ? `${name[0]}•••••@${domain}` : email; }
