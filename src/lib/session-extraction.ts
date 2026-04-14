import { loadObserverConfig, type ExtractionRule } from "@/lib/observer-config";

export type SessionExtractionContext = {
  cwd: string | null;
  source: string | null;
  model: string | null;
};

export type SessionExtractionResult = {
  ticketId: string | null;
  customer: string | null;
  sessionName: string | null;
  sessionGroup: string | null;
  data: Record<string, string>;
  matchedRuleIds: string[];
};

type ExtractionInputName = ExtractionRule["input"];

type SessionRecordLike = SessionExtractionContext & {
  ticketId?: string | null;
  sessionName?: string | null;
  sessionGroup?: string | null;
  extractedData?: string | null;
};

const TEMPLATE_TOKEN_REGEX = /\{\{\s*([^}]+?)\s*\}\}/g;

export function extractSessionData(
  context: SessionExtractionContext
): SessionExtractionResult {
  const config = loadObserverConfig();
  const result: SessionExtractionResult = {
    ticketId: null,
    customer: null,
    sessionName: null,
    sessionGroup: null,
    data: {},
    matchedRuleIds: [],
  };

  for (const rule of config.extraction?.rules ?? []) {
    const input = getRuleInput(rule.input, context);
    if (!input) {
      continue;
    }

    const match = new RegExp(rule.pattern, rule.flags).exec(input);
    if (!match) {
      continue;
    }

    result.matchedRuleIds.push(rule.id);

    const templateValues = buildTemplateValues(
      context,
      input,
      match,
      config.linear?.baseUrl ?? ""
    );
    for (const [outputKey, template] of Object.entries(rule.outputs)) {
      const renderedValue = renderTemplate(template, templateValues).trim();
      if (!renderedValue) {
        continue;
      }

      if (outputKey === "ticketId") {
        result.ticketId = renderedValue;
        continue;
      }

      if (outputKey === "customer") {
        result.customer = renderedValue;
        continue;
      }

      if (outputKey === "sessionName") {
        result.sessionName = renderedValue;
        continue;
      }

      if (outputKey === "sessionGroup") {
        result.sessionGroup = renderedValue;
        continue;
      }

      if (outputKey.startsWith("data.")) {
        result.data[outputKey.slice("data.".length)] = renderedValue;
      }
    }

    break;
  }

  return result;
}

export function parseExtractedData(rawValue: string | null | undefined) {
  if (!rawValue) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, string>;
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {} as Record<string, string>;
  }
}

export function getSessionBasename(cwd: string | null | undefined) {
  if (!cwd) {
    return null;
  }

  const trimmed = cwd.replace(/[\\/]+$/, "");
  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

export function resolveSessionExtraction(session: SessionRecordLike) {
  const extracted = extractSessionData(session);
  const storedData = parseExtractedData(session.extractedData);

  return {
    ticketId: session.ticketId ?? extracted.ticketId,
    customer: extracted.customer,
    sessionName:
      session.sessionName ??
      extracted.sessionName ??
      getSessionBasename(session.cwd),
    sessionGroup: session.sessionGroup ?? extracted.sessionGroup,
    data: {
      ...extracted.data,
      ...storedData,
    },
    matchedRuleIds: extracted.matchedRuleIds,
  };
}

function getRuleInput(
  inputName: ExtractionInputName,
  context: SessionExtractionContext
) {
  switch (inputName) {
    case "cwd":
      return context.cwd;
    case "cwdBasename":
      return getSessionBasename(context.cwd);
    case "source":
      return context.source;
    case "model":
      return context.model;
    default:
      return null;
  }
}

function buildTemplateValues(
  context: SessionExtractionContext,
  input: string,
  match: RegExpExecArray,
  linearBaseUrl: string
) {
  const values: Record<string, string> = {
    input,
    cwd: context.cwd ?? "",
    cwdBasename: getSessionBasename(context.cwd) ?? "",
    source: context.source ?? "",
    model: context.model ?? "",
    linearBaseUrl,
  };

  match.forEach((value, index) => {
    values[String(index)] = value ?? "";
  });

  for (const [key, value] of Object.entries(match.groups ?? {})) {
    values[key] = value ?? "";
  }

  return values;
}

function renderTemplate(
  template: string,
  values: Record<string, string>
) {
  return template.replace(TEMPLATE_TOKEN_REGEX, (_match, expression) => {
    const parts = String(expression)
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    const [variableName, ...filters] = parts;

    if (!variableName) {
      return "";
    }

    let resolvedValue = values[variableName] ?? "";
    for (const filter of filters) {
      switch (filter) {
        case "upper":
          resolvedValue = resolvedValue.toUpperCase();
          break;
        case "lower":
          resolvedValue = resolvedValue.toLowerCase();
          break;
        case "trim":
          resolvedValue = resolvedValue.trim();
          break;
        default:
          break;
      }
    }

    return resolvedValue;
  });
}
