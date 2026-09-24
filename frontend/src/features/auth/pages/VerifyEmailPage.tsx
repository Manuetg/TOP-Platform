import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, MailCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { verifyEmail } from "../api/verify-email";
import { AuthPageShell } from "../components/AuthPageShell";
export function VerifyEmailPage() { const [params] = useSearchParams(); const mutation = useMutation({ mutationFn: () => verifyEmail(params.get("token") ?? "") }); useEffect(() => { mutation.mutate(); }, []); return <AuthPageShell labelledBy="verify-title"><div className="top-auth-success-state" role="status">{mutation.isSuccess ? <CheckCircle2 size={42} aria-hidden="true" /> : <MailCheck size={42} aria-hidden="true" />}<h1 id="verify-title">{mutation.isPending ? "Verificando tu correo" : mutation.isSuccess ? "Correo verificado" : "Este enlace ya no es válido"}</h1><p>{mutation.isSuccess ? "Tu cuenta ya está lista." : mutation.isPending ? "Un momento, estamos validando el enlace." : "Solicitá un nuevo enlace o volvé a iniciar sesión."}</p><Link className="top-button top-button--primary" to="/login">Iniciar sesión</Link></div></AuthPageShell>; }
