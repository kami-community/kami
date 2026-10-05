import { startObservation } from "@langfuse/tracing";
import { langfuseSpanProcessor } from "@/lib/langfuseProcessor";

const ENABLED = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);

type Usage = { [key: string]: number };

/**
 * Trace one Hermes gateway call. Streaming-aware and zero-latency on the hot
 * path: the response stream is teed, the trace is finalized after the client
 * has received the last byte, and flush runs in the background.
 */
export function traceGatewayCall(params: {
  name: string;
  sessionId: string | null;
  model: string;
  input: unknown;
}): {
  wrap: (upstream: Response) => Response;
  fail: (error: string) => void;
} {
  if (!ENABLED) {
    return { wrap: (u) => u, fail: () => {} };
  }

  const span = startObservation(params.name, {
    input: params.input,
    ...(params.sessionId ? { metadata: { hermes_session_id: params.sessionId } } : {}),
  });
  const generation = span.startObservation(
    "hermes-gateway",
    { model: params.model, input: params.input },
    { asType: "generation" },
  );
  const startedAt = Date.now();

  function finalize(output: string, usage: Usage) {
    generation.update({
      output,
      ...(Object.keys(usage).length ? { usageDetails: usage } : {}),
      metadata: { latency_ms: Date.now() - startedAt },
    });
    generation.end();
    span.update({ output: output.slice(0, 2000) });
    span.end();
    void langfuseSpanProcessor.forceFlush().catch(() => {});
  }

  function wrap(upstream: Response): Response {
    if (!upstream.body) {
      finalize("", {});
      return upstream;
    }
    const [toClient, toTrace] = upstream.body.tee();

    // Consume the trace copy without blocking the client copy.
    void (async () => {
      const decoder = new TextDecoder();
      let raw = "";
      const reader = toTrace.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
      }
      // Extract assistant text + usage from either SSE chunks or plain JSON.
      let output = "";
      const usage: Usage = {};
      if (raw.trimStart().startsWith("{")) {
        try {
          const json = JSON.parse(raw);
          output = json.choices?.[0]?.message?.content ?? "";
          if (json.usage?.prompt_tokens != null) usage.input = json.usage.prompt_tokens;
          if (json.usage?.completion_tokens != null) usage.output = json.usage.completion_tokens;
        } catch {
          output = raw.slice(0, 4000);
        }
      } else {
        for (const line of raw.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            output += json.choices?.[0]?.delta?.content ?? "";
            if (json.usage) {
              if (json.usage.prompt_tokens != null) usage.input = json.usage.prompt_tokens;
              if (json.usage.completion_tokens != null) usage.output = json.usage.completion_tokens;
            }
          } catch {
            /* partial chunk */
          }
        }
      }
      finalize(output, usage);
    })();

    return new Response(toClient, { status: upstream.status, headers: upstream.headers });
  }

  function fail(error: string) {
    generation.update({ output: `ERROR: ${error}`, level: "ERROR" });
    generation.end();
    span.end();
    void langfuseSpanProcessor.forceFlush().catch(() => {});
  }

  return { wrap, fail };
}
