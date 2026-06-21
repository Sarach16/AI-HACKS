import dotenv from "dotenv";
dotenv.config();

import { NodeSDK, resources } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import Anthropic from "@anthropic-ai/sdk";

const instrumentation = new AnthropicInstrumentation();
// Required for ESM: patch the class before any Anthropic client is instantiated
instrumentation.manuallyInstrument(Anthropic);

const projectName = process.env.ARIZE_PROJECT_NAME ?? "wayfarer-walking-guide";

const sdk = new NodeSDK({
  spanProcessors: [
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: "https://otlp.arize.com/v1/traces",
        headers: {
          "arize-space-id": process.env.ARIZE_SPACE_ID,
          "arize-api-key": process.env.ARIZE_API_KEY,
        },
      }),
    ),
  ],
  resource: resources.resourceFromAttributes({
    [ATTR_SERVICE_NAME]: projectName,
    [SEMRESATTRS_PROJECT_NAME]: projectName,
  }),
  instrumentations: [instrumentation],
});

sdk.start();

process.on("SIGTERM", () => sdk.shutdown());
process.on("SIGINT", () => sdk.shutdown());
