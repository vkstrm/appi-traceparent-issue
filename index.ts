import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import {
  BatchSpanProcessor,
  BasicTracerProvider,
  ParentBasedSampler,
  AlwaysOnSampler,
  ConsoleSpanExporter
} from "@opentelemetry/sdk-trace-base";
import { ROOT_CONTEXT, SpanKind, trace, propagation, context as opentelemetryContext, Exception, SpanStatusCode, } from "@opentelemetry/api";
import { defaultClient, setup } from "applicationinsights";
import { Request, Response } from "express";
import express from "express";
import fetch, { RequestInit } from "node-fetch";

const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "MY-API",
  })
);
const sampler = new ParentBasedSampler({ root: new AlwaysOnSampler() });
const provider = new BasicTracerProvider({
  sampler,
  resource: resource,
});
const exporter = new ConsoleSpanExporter();
const processor = new BatchSpanProcessor(exporter);
provider.addSpanProcessor(processor);
provider.register();

// Setup application insights but do nothing with defaults
setup().start();
const appiClient = defaultClient;

async function handler(request: Request, response: Response) {
    const body = request.body;
    const url = body.url;

    // The traceparent from your request, log it in APPI
    const incomingTraceparent = request.header("traceparent");
    appiClient.trackTrace({message: `incoming traceparent: ${incomingTraceparent}`});
    
    // Start the first server span
    const tracer = trace.getTracer("tracer");
    const activeContext = propagation.extract(ROOT_CONTEXT, {
      traceparent: incomingTraceparent,
    });
    const parentSpan = tracer.startSpan(
      "incoming request",
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.method": "POST",
          "http.route": "/request"
        },
      },
      activeContext
    );

    // Start a span, the client span for the outgoing request
    const tracer2 = trace.getTracer("tracer");
    const ctx = trace.setSpan(opentelemetryContext.active(), parentSpan);
    const childSpan = tracer2.startSpan(
      "outgoing request",
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "http.method": "GET",
          "http.url": url,
        },
      },
      ctx
    );

    // Create the outgoing traceparent from the created childspan and log it in APPI
    const outgoingTraceparent = `00-${childSpan.spanContext().traceId}-${childSpan.spanContext().spanId}-01`;
    appiClient.trackTrace({message: `outgoing traceparent: ${outgoingTraceparent}`});

    const requestInit: RequestInit = {
        method: "GET",
        headers: {
            traceparent: outgoingTraceparent
        }
    };
    try {
      const res = await fetch(url, requestInit);

      // End spans
      childSpan.setAttribute("http.status_code", res.status);
      childSpan.end();
      parentSpan.setAttribute("http.status_code", 200);
      parentSpan.end();

      // End request
      response.status(200).send('{"message":"success"}');
    } catch (error: unknown) {
      childSpan.recordException(error as Exception);
      childSpan.setStatus({ code: SpanStatusCode.ERROR });
      childSpan.end();
      parentSpan.recordException(error as Exception);
      parentSpan.setStatus({ code: SpanStatusCode.ERROR });
      parentSpan.end();
      throw error;
    }
}

const app = express();
app.get("/hello", (_req, res: Response) => { res.status(200).send("hello")})
app.post("/request", express.json(),handler);

async function start() {
    const port = process.env.PORT || 4000;
    const server = app.listen(port, () =>
        console.info(`Servers started at http://localhost:${port}`)
    );
    server.keepAliveTimeout = 250 * 1000;
}

start().then().catch(e => {
  exporter.shutdown();
  console.error(e)
});