import {
  messagingTemplatePreviewValues,
  messagingTemplateVariables,
} from "../constants/messaging-template-catalog";

const tokenPattern = /{{\s*([^{}]+?)\s*}}/g;
const variableNames: Set<string> = new Set(messagingTemplateVariables.map((variable) => variable.name));

export function validateMessagingTemplate(content: string): string | null {
  if (!content.trim()) return "Ingresá un mensaje.";
  if (content.length > 4000) return "El mensaje puede tener hasta 4000 caracteres.";

  let match: RegExpExecArray | null;
  tokenPattern.lastIndex = 0;
  while ((match = tokenPattern.exec(content)) !== null) {
    const variable = match[1].trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(variable)) {
      return "Usá variables con el formato {{nombre}}.";
    }
    if (!variableNames.has(variable)) {
      return `La variable {{${variable}}} no está disponible.`;
    }
  }

  const withoutTokens = content.replace(tokenPattern, "");
  if (withoutTokens.includes("{{") || withoutTokens.includes("}}")) {
    return "Revisá las llaves de las variables.";
  }
  return null;
}

export function renderMessagingTemplate(content: string): string {
  tokenPattern.lastIndex = 0;
  return content.replace(tokenPattern, (full, rawVariable: string) => {
    const variable = rawVariable.trim();
    return messagingTemplatePreviewValues[variable] ?? full;
  });
}

export function isMessagingTemplateVariable(value: string): boolean {
  return variableNames.has(value);
}

