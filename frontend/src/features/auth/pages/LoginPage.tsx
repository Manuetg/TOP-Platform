import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

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
      navigate("/app");
    },
  });

  const onSubmit = handleSubmit((values) => {
    loginMutation.mutate(values);
  });

  const loginErrorMessage = loginMutation.error
    ? loginMutation.error instanceof ApiError
      ? getLoginErrorMessage(loginMutation.error)
      : "No pudimos conectarnos con el servidor."
    : null;

  return (
    <main className="top-auth-page">
      <section className="top-auth-card" aria-labelledby="login-title">
        <header className="top-auth-header">
          <span className="top-auth-brand">TOP</span>

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

          <Button type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Ingresando..." : "Iniciar sesión"}
          </Button>
        </form>
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
