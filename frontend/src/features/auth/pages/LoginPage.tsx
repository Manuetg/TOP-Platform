import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRef, type FormEvent } from "react";
import { CalendarDays, ArrowRight, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { login } from "../api/login";
import {
  loginSchema,
  type LoginFormValues,
} from "../schemas/login.schema";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";

export function LoginPage() {
  const { establishSession } = useAuth();
  const submissionLock = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      establishSession(data);
    },
  });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Lock before asynchronous validation: a queued resolver must not start
    // another request after the first mutation settles and unlocks.
    if (submissionLock.current) return;
    submissionLock.current = true;
    try {
      await handleSubmit(async (values) => {
        await loginMutation.mutateAsync(values);
      })(event);
    } catch {
      // Mutation errors are rendered below; keep the form available for retry.
    } finally {
      submissionLock.current = false;
    }
  };

  const loginErrorMessage = loginMutation.error
    ? loginMutation.error instanceof ApiError
      ? getLoginErrorMessage(loginMutation.error)
      : "No pudimos iniciar sesión. Intentá nuevamente."
    : null;

  return (
    <main className="top-auth-page">
      <aside className="top-auth-intro" aria-label="TOP, gestión de alojamientos">
        <div className="top-auth-brand">TOP<span>Gestión de alojamientos</span></div>
        <div className="top-auth-intro__copy">
          <span className="top-icon-container"><CalendarDays size={24} aria-hidden="true" /></span>
          <h2>Tu operación,<br />en un solo lugar.</h2>
          <p>Reservas, huéspedes y cobros. La información que tu equipo necesita para el día a día.</p>
        </div>
        <p className="top-auth-intro__footnote">Más claridad para tu operación.<br />Más tiempo para tus huéspedes.</p>
      </aside>
      <section className="top-auth-card" aria-labelledby="login-title">
        <header className="top-auth-header">
          <div>
            <h1 id="login-title" className="top-auth-title">
              Iniciar sesión
            </h1>

            <p className="top-auth-description">
              Accede a la gestión de tu alojamiento.
            </p>
          </div>
        </header>

        <form className="top-auth-form" onSubmit={onSubmit} noValidate>
          <Input
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />

          {loginErrorMessage ? (
            <div className="top-auth-error" role="alert">
              {loginErrorMessage}
            </div>
          ) : null}

          <Button type="submit" size="lg" loading={loginMutation.isPending} loadingLabel="Ingresando...">
            Iniciar sesión <ArrowRight size={18} aria-hidden="true" />
          </Button>
        </form>
        <p className="top-auth-footnote"><ShieldCheck size={16} aria-hidden="true" />Acceso seguro para tu equipo.</p>
      </section>
    </main>
  );
}

function getLoginErrorMessage(error: ApiError): string {
  switch (error.status) {
    case 400:
      return "Revisa los datos ingresados.";
    case 401:
      return "El correo o la contraseña no son correctos.";
    case 403:
      return "Tu usuario está deshabilitado.";
    default:
      return "No pudimos iniciar sesión. Intenta nuevamente.";
  }
}
