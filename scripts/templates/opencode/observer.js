const DEFAULT_HOOK_URL = "http://127.0.0.1:43199/api/hooks";

function getHookUrl() {
  return (
    process.env.AGENT_OBSERVER_HOOK_URL ||
    process.env.CLAUDE_OBSERVER_HOOK_URL ||
    DEFAULT_HOOK_URL
  );
}

function modelSlug(model) {
  if (!model) return null;
  if (typeof model === "string") return model;
  if (model.providerID && model.modelID) {
    return `${model.providerID}/${model.modelID}`;
  }
  return null;
}

function collectText(parts) {
  if (!Array.isArray(parts)) return null;

  const text = parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");

  return text || null;
}

async function postObserver(payload) {
  try {
    await fetch(getHookUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        observer_source: "opencode",
        ...payload,
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown delivery error";
    console.error(`[agent-observer] opencode hook delivery failed: ${message}`);
  }
}

export const ObserverPlugin = async ({ directory }) => {
  async function send(payload) {
    await postObserver({
      cwd: directory,
      ...payload,
    });
  }

  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.created":
          await send({
            opencode_event_type: event.type,
            session_id: event.properties.info.id,
            cwd: event.properties.info.directory,
            payload: event,
          });
          break;
        case "session.deleted":
          await send({
            opencode_event_type: event.type,
            session_id: event.properties.info.id,
            cwd: event.properties.info.directory,
            payload: event,
          });
          break;
        case "session.idle":
          await send({
            opencode_event_type: event.type,
            session_id: event.properties.sessionID,
            payload: event,
          });
          break;
        case "session.error":
          if (!event.properties.sessionID) break;
          await send({
            opencode_event_type: event.type,
            session_id: event.properties.sessionID,
            error: event.properties.error ?? null,
            payload: event,
          });
          break;
        case "message.part.updated": {
          const { part } = event.properties;

          if (
            part.type === "text" &&
            typeof part.text === "string" &&
            part.text.trim() &&
            part.time &&
            part.time.end
          ) {
            await send({
              opencode_event_type: "message.assistant",
              session_id: part.sessionID,
              last_assistant_message: part.text,
              payload: event,
            });
          }

          if (part.type === "tool" && part.state.status === "error") {
            await send({
              opencode_event_type: "tool.execute.error",
              session_id: part.sessionID,
              tool_name: part.tool,
              tool_input: part.state.input ?? null,
              tool_response: {
                error: part.state.error,
                metadata: part.state.metadata ?? null,
              },
              payload: event,
            });
          }

          break;
        }
        default:
          break;
      }
    },
    "chat.message": async (input, output) => {
      const prompt = collectText(output.parts);
      if (!prompt) return;

      await send({
        opencode_event_type: "message.user",
        session_id: input.sessionID,
        model: modelSlug(input.model),
        prompt,
        payload: {
          input,
          parts: output.parts,
        },
      });
    },
    "tool.execute.before": async (input, output) => {
      await send({
        opencode_event_type: "tool.execute.before",
        session_id: input.sessionID,
        tool_name: input.tool,
        tool_input: output.args ?? null,
        payload: {
          input,
          args: output.args ?? null,
        },
      });
    },
    "tool.execute.after": async (input, output) => {
      await send({
        opencode_event_type: "tool.execute.after",
        session_id: input.sessionID,
        tool_name: input.tool,
        tool_input: input.args ?? null,
        tool_response: {
          title: output.title,
          output: output.output,
          metadata: output.metadata ?? null,
        },
        payload: {
          input,
          output,
        },
      });
    },
  };
};
