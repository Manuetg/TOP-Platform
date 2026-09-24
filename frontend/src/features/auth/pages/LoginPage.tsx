import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { CalendarDays, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
import {
  createStaggerContainerVariants,
  createStaggerItemVariants,
} from "../../../shared/motion/motion-presets";

export function LoginPage() {
  const { establishSession } = useAuth();
  const submissionLock = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;
  const containerVariants = createStaggerContainerVariants(reducedMotion);
  const itemVariants = createStaggerItemVariants(reducedMotion);

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
      establishSession(data, rememberMe ? "PERSISTENT" : "SESSION");
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
    <motion.main className="top-auth-page" variants={containerVariants} initial="hidden" animate="visible">
      <motion.aside className="top-auth-hero" aria-label="TOP, gestión de alojamientos" variants={itemVariants}>
        <img className="top-auth-hero__image" src="/top-auth-hero.png" alt="Alojamiento rodeado de naturaleza al atardecer" />
        <div className="top-auth-hero__scrim" />
        <div className="top-auth-hero__content">
          <div className="top-auth-brand">TOP<span>Gestión de alojamientos</span></div>
          <div className="top-auth-hero__caption">
            <CalendarDays size={20} aria-hidden="true" />
            <span>Todo lo que tu equipo necesita para recibir mejor.</span>
          </div>
        </div>
      </motion.aside>
      <motion.section className="top-auth-panel" aria-labelledby="login-title" variants={itemVariants}>
        <div className="top-auth-mobile-brand">TOP<span>Gestión de alojamientos</span></div>
        <motion.div className="top-auth-form-shell" variants={containerVariants}>
          <motion.header className="top-auth-header" variants={itemVariants}>
            <h1 id="login-title" className="top-auth-title">Bienvenido<br />de nuevo</h1>
            <p className="top-auth-description">Ingresá a tu espacio de trabajo en TOP.</p>
          </motion.header>

          <motion.form className="top-auth-form" onSubmit={onSubmit} noValidate variants={containerVariants}>
            <motion.div variants={itemVariants}>
              <Input label="Correo electrónico" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
            </motion.div>

            <motion.div className="top-password-field" variants={itemVariants}>
              <Input label="Contraseña" type={showPassword ? "text" : "password"} autoComplete="current-password" error={errors.password?.message} {...register("password")} />
              <button type="button" className="top-password-field__toggle" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </motion.div>

            <motion.div className="top-auth-options" variants={itemVariants}>
              <label className="top-auth-remember"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span>Mantener sesión iniciada</span></label>
              <a className="top-auth-forgot" href="/forgot-password">¿Olvidaste tu contraseña?</a>
            </motion.div>

            {loginErrorMessage ? <motion.div className="top-auth-error" role="alert" variants={itemVariants}>{loginErrorMessage}</motion.div> : null}

            <motion.div variants={itemVariants}>
              <Button type="submit" size="lg" loading={loginMutation.isPending} loadingLabel="Ingresando...">
                Iniciar sesión <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </motion.div>
          </motion.form>
          <motion.p className="top-auth-footnote" variants={itemVariants}><ShieldCheck size={16} aria-hidden="true" />Acceso seguro para tu equipo.</motion.p>
          <motion.p className="top-auth-footnote" variants={itemVariants}>¿Todavía no tenés una cuenta? <a className="top-auth-forgot" href="/signup">Crear cuenta</a></motion.p>
        </motion.div>
      </motion.section>
    </motion.main>
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
