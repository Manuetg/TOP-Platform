import { isEmail } from 'class-validator';
import { isIP } from 'node:net';
import addressparser from 'nodemailer/lib/addressparser';

export type NodeEnvironment = 'development' | 'test' | 'production';
type EnvironmentInput = Record<string, unknown>;
export interface ConfigurationReader { get(key: string): unknown }
// Capturar runtime antes de importar módulos que puedan cargar dotenv (Prisma).
const runtimeEnvironment: EnvironmentInput = { ...process.env };

export class EnvironmentConfigurationError extends Error {
  constructor(variable: string, requirement: string) {
    super(`${variable}: ${requirement}`);
    this.name = 'EnvironmentConfigurationError';
  }
}

function invalid(variable: string, requirement: string): never {
  throw new EnvironmentConfigurationError(variable, requirement);
}

function text(input: EnvironmentInput, key: string, fallback?: string): string {
  const value = input[key] === undefined ? fallback : input[key];
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    invalid(key, 'debe contener un valor explícito válido, sin espacios exteriores.');
  }
  return value;
}

function optionalText(input: EnvironmentInput, key: string): string | undefined {
  return input[key] === undefined ? undefined : text(input, key);
}

function placeholder(value: string): boolean {
  return /development|dev[-_ ]?only|example|ejemplo|placeholder|change[-_ ]?me|cambiar|replace[-_ ]?me|your[-_ ]|ci[-_ ]?only|test[-_ ]?secret|not[-_ ]?for[-_ ]?production|<required>/i.test(value) || ['topminio', 'topminiosecret'].includes(value);
}

function productionValue(input: EnvironmentInput, key: string, production: boolean): string {
  const value = text(input, key);
  if (production && placeholder(value)) invalid(key, 'no admite valores de desarrollo ni ejemplos en producción.');
  return value;
}

function integer(input: EnvironmentInput, key: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const value = input[key] === undefined ? fallback : input[key];
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
    invalid(key, `debe ser un entero entre ${min} y ${max}.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) invalid(key, `debe ser un entero entre ${min} y ${max}.`);
  return number;
}

function boolean(input: EnvironmentInput, key: string, fallback: boolean): boolean {
  const value = input[key] === undefined ? fallback : input[key];
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return invalid(key, 'debe ser true o false.');
}

export function nodeEnvironment(value: unknown): NodeEnvironment {
  if (value === undefined) return 'development';
  if (value === 'development' || value === 'test' || value === 'production') return value;
  return invalid('NODE_ENV', 'debe ser development, test o production.');
}

export function runtimeNodeEnvironment(): NodeEnvironment {
  return nodeEnvironment(runtimeEnvironment.NODE_ENV);
}

export function validateApplicationEnvironment(loaded: EnvironmentInput): EnvironmentConfiguration {
  const env = runtimeNodeEnvironment();
  return validateEnvironment(env === 'development' ? { ...loaded, NODE_ENV: env } : runtimeEnvironment);
}

export function validateRuntimeBeforeImports(): void {
  if (runtimeNodeEnvironment() !== 'development') validateEnvironment(runtimeEnvironment);
}

export function readNodeEnvironment(config: ConfigurationReader): NodeEnvironment {
  return nodeEnvironment(config.get('NODE_ENV'));
}

function webUrl(input: EnvironmentInput, key: string, production: boolean, fallback?: string): URL {
  const value = text(input, key, fallback);
  let url: URL;
  try { url = new URL(value); } catch { return invalid(key, 'debe ser una URL HTTP/HTTPS absoluta válida.'); }
  if (invalidWebUrl(url, value)) {
    invalid(key, 'debe ser una URL HTTP/HTTPS sin credenciales, query ni fragmento.');
  }
  if (production && (url.protocol !== 'https:' || placeholder(value))) invalid(key, 'requiere HTTPS y no admite ejemplos en producción.');
  return url;
}

function invalidWebUrl(url: URL, value: string): boolean {
  return !/^https?:\/\/[^/]/i.test(value) || !['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hostname.includes('*') || Boolean(url.username || url.password) || /[?#\s\\]/.test(value);
}

function databaseUrl(input: EnvironmentInput, production: boolean): string {
  const value = productionValue(input, 'DATABASE_URL', production);
  let url: URL;
  try { url = new URL(value); } catch { return invalid('DATABASE_URL', 'debe ser una conexión PostgreSQL válida.'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash || /[\s\\]/.test(value)) {
    invalid('DATABASE_URL', 'debe ser una conexión PostgreSQL con host y base de datos.');
  }
  // No reconstruir: conservar parámetros de Prisma, socket, pooling y SSL.
  return value;
}

function secret(input: EnvironmentInput, key: string, production: boolean, fallback?: string): string {
  const value = text(input, key, fallback);
  if (production && (Buffer.byteLength(value, 'utf8') < 32 || placeholder(value))) invalid(key, 'requiere al menos 32 bytes y no admite secretos de desarrollo ni ejemplos.');
  return value;
}

export function readPasswordResetOtpSecret(config: ConfigurationReader): string {
  const production = readNodeEnvironment(config) === 'production';
  return secret({ PASSWORD_RESET_OTP_SECRET: config.get('PASSWORD_RESET_OTP_SECRET') }, 'PASSWORD_RESET_OTP_SECRET', production, production ? undefined : 'development-only-reset-secret');
}

export function readAppPublicUrl(config: ConfigurationReader): string {
  const production = readNodeEnvironment(config) === 'production';
  return webUrl({ APP_PUBLIC_URL: config.get('APP_PUBLIC_URL') }, 'APP_PUBLIC_URL', production, production ? undefined : 'http://localhost:3001').href.replace(/\/+$/, '');
}

export function readEmailDeliveryMode(config: ConfigurationReader): 'console' | 'smtp' {
  const production = readNodeEnvironment(config) === 'production';
  const mode = config.get('EMAIL_DELIVERY_MODE') ?? (production ? undefined : 'console');
  if (mode !== 'console' && mode !== 'smtp') return invalid('EMAIL_DELIVERY_MODE', 'debe ser console o smtp; smtp explícito es obligatorio en producción.');
  if (production && mode !== 'smtp') invalid('EMAIL_DELIVERY_MODE', 'smtp explícito es obligatorio en producción.');
  return mode;
}

function inputFrom(config: ConfigurationReader, keys: readonly string[]): EnvironmentInput {
  return Object.fromEntries(keys.map((key) => [key, config.get(key)]));
}

export function readIntegerConfiguration(config: ConfigurationReader, key: string, fallback: number, min = 1): number {
  return integer(inputFrom(config, [key]), key, fallback, min);
}

export interface SmtpConfiguration {
  host: string; port: number; from: string; secure: boolean; requireTLS: boolean;
  auth?: { user: string; pass: string };
}

function smtpConfiguration(input: EnvironmentInput, production: boolean): SmtpConfiguration {
  const host = productionValue(input, 'SMTP_HOST', production);
  if (!validSmtpHost(host)) invalid('SMTP_HOST', 'debe ser un hostname o dirección IP, sin URL ni puerto.');
  const from = productionValue(input, 'SMTP_FROM', production);
  const mailboxes = addressparser(from);
  if (mailboxes.length !== 1 || !('address' in mailboxes[0]) || !isEmail(mailboxes[0].address) || /[\r\n]/.test(from)) invalid('SMTP_FROM', 'debe identificar un único remitente de correo válido.');
  const port = integer(input, 'SMTP_PORT', 587, 1, 65535);
  return { host, port, from, secure: port === 465, requireTLS: production && port !== 465, auth: smtpAuth(input, production) };
}

function validSmtpHost(host: string): boolean {
  if (isIP(host)) return true;
  return host.length <= 253 && host.split('.').every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label));
}

function smtpAuth(input: EnvironmentInput, production: boolean): SmtpConfiguration['auth'] {
  const user = optionalText(input, 'SMTP_USER');
  const pass = optionalText(input, 'SMTP_PASSWORD');
  if ((user === undefined) !== (pass === undefined)) invalid('SMTP_USER / SMTP_PASSWORD', 'deben estar ambos ausentes o ambos presentes.');
  if (production && ((user !== undefined && placeholder(user)) || (pass !== undefined && placeholder(pass)))) invalid('SMTP_USER / SMTP_PASSWORD', 'no admiten credenciales de ejemplo en producción.');
  return user === undefined ? undefined : { user, pass: pass! };
}

export function readSmtpConfiguration(config: ConfigurationReader): SmtpConfiguration {
  return smtpConfiguration(inputFrom(config, ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD']), readNodeEnvironment(config) === 'production');
}

export interface S3Configuration {
  endpoint: string; publicEndpoint: string; region: string; bucket: string;
  accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean;
}

function s3Configuration(input: EnvironmentInput, production: boolean): S3Configuration {
  const endpoint = webUrl(input, 'S3_ENDPOINT', production).href.replace(/\/+$/, '');
  const publicEndpoint = webUrl(input, 'S3_PUBLIC_ENDPOINT', production, endpoint).href.replace(/\/+$/, '');
  const region = productionValue(input, 'S3_REGION', production);
  if (!/^[a-z\d][a-z\d-]*$/i.test(region)) invalid('S3_REGION', 'debe ser un identificador de región válido.');
  const bucket = productionValue(input, 'S3_BUCKET', production);
  if (!/^[a-z\d][a-z\d.-]{1,61}[a-z\d]$/.test(bucket) || /\.\.|-\.|\.-/.test(bucket) || isIP(bucket)) invalid('S3_BUCKET', 'debe ser un nombre de bucket S3 válido (3 a 63 caracteres).');
  const accessKeyId = productionValue(input, 'S3_ACCESS_KEY', production);
  const secretAccessKey = productionValue(input, 'S3_SECRET_KEY', production);
  const forcePathStyle = boolean(input, 'S3_FORCE_PATH_STYLE', false);
  return { endpoint, publicEndpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle };
}

export function readS3Configuration(config: ConfigurationReader): S3Configuration {
  return s3Configuration(inputFrom(config, ['S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_FORCE_PATH_STYLE']), readNodeEnvironment(config) === 'production');
}

export interface MetaWhatsAppConfiguration {
  accessToken?: string;
  phoneNumberId?: string;
  graphApiVersion: string;
}

export interface MetaWhatsAppEmbeddedSignupConfiguration {
  graphApiVersion: string;
  appId?: string;
  appSecret?: string;
  configurationId?: string;
  attemptTtlSeconds: number;
  processingTimeoutSeconds: number;
  environment: NodeEnvironment;
}

export interface MetaWhatsAppWebhookConfiguration {
  appSecret: string;
  verifyToken: string;
}

function metaWhatsAppConfiguration(input: EnvironmentInput, production: boolean): MetaWhatsAppConfiguration {
  const accessToken = optionalText(input, 'META_WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = optionalText(input, 'META_WHATSAPP_PHONE_NUMBER_ID');
  const graphApiVersion = input.META_WHATSAPP_GRAPH_API_VERSION === undefined && !production
    ? 'v26.0'
    : productionValue(input, 'META_WHATSAPP_GRAPH_API_VERSION', production);
  if (phoneNumberId !== undefined && !/^\d+$/.test(phoneNumberId)) invalid('META_WHATSAPP_PHONE_NUMBER_ID', 'debe ser un identificador numérico de teléfono de WhatsApp.');
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) invalid('META_WHATSAPP_GRAPH_API_VERSION', 'debe tener el formato vN.N.');
  return { accessToken, phoneNumberId, graphApiVersion };
}

export function readMetaWhatsAppConfiguration(config: ConfigurationReader): MetaWhatsAppConfiguration {
  return metaWhatsAppConfiguration(
    inputFrom(config, ['META_WHATSAPP_ACCESS_TOKEN', 'META_WHATSAPP_PHONE_NUMBER_ID', 'META_WHATSAPP_GRAPH_API_VERSION']),
    readNodeEnvironment(config) === 'production',
  );
}

export function readMetaWhatsAppEmbeddedSignupConfiguration(config: ConfigurationReader): MetaWhatsAppEmbeddedSignupConfiguration {
  return {
    ...readMetaWhatsAppConfiguration(config),
    appId: optionalText({ META_WHATSAPP_APP_ID: config.get('META_WHATSAPP_APP_ID') }, 'META_WHATSAPP_APP_ID'),
    appSecret: optionalText({ META_WHATSAPP_APP_SECRET: config.get('META_WHATSAPP_APP_SECRET') }, 'META_WHATSAPP_APP_SECRET'),
    configurationId: optionalText({ META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION_ID: config.get('META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION_ID') }, 'META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION_ID'),
    attemptTtlSeconds: readIntegerConfiguration(config, 'META_WHATSAPP_EMBEDDED_SIGNUP_ATTEMPT_TTL_SECONDS', 600),
    processingTimeoutSeconds: readIntegerConfiguration(config, 'META_WHATSAPP_EMBEDDED_SIGNUP_PROCESSING_TIMEOUT_SECONDS', 300),
    environment: readNodeEnvironment(config),
  };
}

export function readMetaWhatsAppWebhookConfiguration(config: ConfigurationReader): MetaWhatsAppWebhookConfiguration {
  const production = readNodeEnvironment(config) === 'production';
  return {
    appSecret: production ? productionValue(inputFrom(config, ['META_WHATSAPP_APP_SECRET']), 'META_WHATSAPP_APP_SECRET', true) : text(inputFrom(config, ['META_WHATSAPP_APP_SECRET']), 'META_WHATSAPP_APP_SECRET', 'development-only-meta-app-secret'),
    verifyToken: production ? productionValue(inputFrom(config, ['META_WHATSAPP_VERIFY_TOKEN']), 'META_WHATSAPP_VERIFY_TOKEN', true) : text(inputFrom(config, ['META_WHATSAPP_VERIFY_TOKEN']), 'META_WHATSAPP_VERIFY_TOKEN', 'development-only-meta-verify-token'),
  };
}

function corsOrigins(input: EnvironmentInput, production: boolean): string[] {
  if (input.CORS_ORIGIN === undefined && !production) return [];
  const value = text(input, 'CORS_ORIGIN');
  return [...new Set(value.split(',').map((entry) => {
    const origin = entry.trim();
    if (!/^https?:\/\/[^/?#]+\/?$/i.test(origin)) invalid('CORS_ORIGIN', 'debe contener orígenes exactos, sin path operativo.');
    const url = webUrl({ CORS_ORIGIN: origin }, 'CORS_ORIGIN', production);
    if (url.pathname !== '/') invalid('CORS_ORIGIN', 'debe contener orígenes exactos, sin path operativo.');
    return url.origin;
  }))];
}

export interface EnvironmentConfiguration extends EnvironmentInput {
  NODE_ENV: NodeEnvironment; PORT: number; DATABASE_URL: string; CORS_ORIGINS: string[];
  JWT_ACCESS_SECRET: string; PASSWORD_RESET_OTP_SECRET: string; APP_PUBLIC_URL: string;
  EMAIL_DELIVERY_MODE: 'console' | 'smtp';
}

const numericDefaults = {
  REFRESH_TOKEN_TTL_SECONDS: 2592000,
  PASSWORD_RESET_TTL_SECONDS: 1800,
  PASSWORD_RESET_OTP_TTL_SECONDS: 600,
  PASSWORD_RESET_OTP_RESEND_SECONDS: 60,
  EMAIL_VERIFICATION_TTL_SECONDS: 86400,
  EMAIL_VERIFICATION_RESEND_SECONDS: 60,
  META_WHATSAPP_EMBEDDED_SIGNUP_ATTEMPT_TTL_SECONDS: 600,
  META_WHATSAPP_EMBEDDED_SIGNUP_PROCESSING_TIMEOUT_SECONDS: 300,
};

function maximumExpirationTtlSeconds(now: number): number {
  // Reservar el instante base y respetar Date/TimeClip y el año de 4 dígitos
  // del DateTime RFC3339 que acepta el motor Prisma vigente (fin de 9999).
  return Math.min(
    Math.floor(Number.MAX_SAFE_INTEGER / 1000),
    Math.floor((8_640_000_000_000_000 - now) / 1000),
    Math.floor((253_402_300_799_999 - now) / 1000),
  );
}

function numericConfiguration(input: EnvironmentInput): Record<string, number> {
  const result: Record<string, number> = {};
  const maxTtlSeconds = maximumExpirationTtlSeconds(Date.now());
  for (const [key, fallback] of Object.entries(numericDefaults)) {
    const cooldown = key.includes('RESEND');
    result[key] = integer(input, key, fallback, cooldown ? 0 : 1, cooldown ? Number.MAX_SAFE_INTEGER : maxTtlSeconds);
  }
  return result;
}

export function validateEnvironment(input: EnvironmentInput): EnvironmentConfiguration {
  const env = nodeEnvironment(input.NODE_ENV);
  const production = env === 'production';
  const jwt = secret(input, 'JWT_ACCESS_SECRET', production);
  const otp = secret(input, 'PASSWORD_RESET_OTP_SECRET', production, production ? undefined : 'development-only-reset-secret');
  if (production && jwt === otp) invalid('PASSWORD_RESET_OTP_SECRET', 'debe ser independiente de JWT_ACCESS_SECRET.');
  const reader: ConfigurationReader = { get: (key: string) => input[key] };
  const mode = readEmailDeliveryMode(reader);
  const result: EnvironmentConfiguration = {
    ...input, NODE_ENV: env, PORT: integer(input, 'PORT', 3000, 1, 65535),
    DATABASE_URL: databaseUrl(input, production), CORS_ORIGINS: corsOrigins(input, production),
    JWT_ACCESS_SECRET: jwt, PASSWORD_RESET_OTP_SECRET: otp,
    APP_PUBLIC_URL: readAppPublicUrl(reader), EMAIL_DELIVERY_MODE: mode,
    ...numericConfiguration(input),
  };
  if (mode === 'smtp') {
    const smtp = smtpConfiguration(input, production);
    result.SMTP_PORT = smtp.port;
  }
  const storageSelected = input.S3_BUCKET !== undefined;
  if (production || storageSelected) {
    const storage = s3Configuration(input, production);
    result.S3_ENDPOINT = storage.endpoint; result.S3_PUBLIC_ENDPOINT = storage.publicEndpoint;
    result.S3_FORCE_PATH_STYLE = storage.forcePathStyle;
  } else if (input.S3_FORCE_PATH_STYLE !== undefined) result.S3_FORCE_PATH_STYLE = boolean(input, 'S3_FORCE_PATH_STYLE', false);
  return result;
}

export function configurationFrom(config: ConfigurationReader): EnvironmentConfiguration {
  return validateEnvironment(inputFrom(config, [
    'NODE_ENV', 'PORT', 'DATABASE_URL', 'JWT_ACCESS_SECRET', 'PASSWORD_RESET_OTP_SECRET',
    'APP_PUBLIC_URL', 'CORS_ORIGIN', 'EMAIL_DELIVERY_MODE', ...Object.keys(numericDefaults),
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD',
    'S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_FORCE_PATH_STYLE',
    'META_WHATSAPP_APP_SECRET', 'META_WHATSAPP_VERIFY_TOKEN',
    'META_WHATSAPP_APP_ID', 'META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION_ID',
  ]));
}
