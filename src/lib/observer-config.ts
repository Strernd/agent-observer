import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const extractionRuleSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  input: z.enum(["cwd", "cwdBasename", "source", "model"]),
  pattern: z.string().min(1),
  flags: z.string().optional(),
  outputs: z.record(z.string(), z.string()),
});

const modelsConfigSchema = z.object({
  summary: z.string().default("anthropic/claude-sonnet-4"),
  extraction: z.string().default("anthropic/claude-opus-4-6"),
});

const reportsConfigSchema = z.object({
  autoProcessPreviousDayOnFirstEvent: z.boolean().default(false),
});

const DEFAULT_MODELS: z.infer<typeof modelsConfigSchema> = {
  summary: "anthropic/claude-sonnet-4",
  extraction: "anthropic/claude-opus-4-6",
};

const observerConfigSchema = z.object({
  linear: z
    .object({
      baseUrl: z.string().optional(),
    })
    .optional(),
  models: modelsConfigSchema.optional(),
  extraction: z
    .object({
      rules: z.array(extractionRuleSchema).default([]),
    })
    .optional(),
  reports: reportsConfigSchema.optional(),
});

export type ExtractionRule = z.infer<typeof extractionRuleSchema>;
export type ObserverConfig = z.infer<typeof observerConfigSchema>;

const DEFAULT_CONFIG: ObserverConfig = {
  linear: {
    baseUrl: "",
  },
  extraction: {
    rules: [],
  },
  reports: {
    autoProcessPreviousDayOnFirstEvent: false,
  },
};
let cachedConfig: ObserverConfig | null = null;

function getConfigPath() {
  return path.join(process.cwd(), "observer.config.json");
}

export function loadObserverConfig(): ObserverConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      cachedConfig = DEFAULT_CONFIG;
      return cachedConfig;
    }

    const parsed = observerConfigSchema.parse(
      JSON.parse(fs.readFileSync(configPath, "utf8"))
    );

    cachedConfig = {
      linear: {
        baseUrl: parsed.linear?.baseUrl ?? DEFAULT_CONFIG.linear?.baseUrl ?? "",
      },
      models: {
        ...DEFAULT_MODELS,
        ...parsed.models,
      },
      extraction: {
        rules: parsed.extraction?.rules ?? [],
      },
      reports: {
        autoProcessPreviousDayOnFirstEvent:
          parsed.reports?.autoProcessPreviousDayOnFirstEvent ??
          DEFAULT_CONFIG.reports?.autoProcessPreviousDayOnFirstEvent ??
          false,
      },
    };
    return cachedConfig;
  } catch (error) {
    console.error("[agent-observer] Failed to load observer config:", error);
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }
}

export function getModelConfig() {
  const config = loadObserverConfig();
  return config.models ?? DEFAULT_MODELS;
}

export function buildLinearIssueUrl(ticketId: string | null | undefined) {
  if (!ticketId) {
    return null;
  }

  const baseUrl = loadObserverConfig().linear?.baseUrl?.trim();
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(ticketId)}`;
}
