# Appi traceparent issue

Reproducible issue of the traceparent leaving an App Service with a HTTP call
not being the same as what shows up at the called server.

1. Create a Resouce group.
2. Create an App Service with Node 18 and a new Application Insights.
3. Deploy to the App Service, see `deploy.sh`
4. Make a request to the App Service. Get a URL here for example: https://webhook.site/#!/
    ```
    $ alias trace='echo "00-$(openssl rand -hex 16)-$(openssl rand -hex 8)-01"'
    $ curl -v https://myapp.azurewebsites.net/request \
        --data '{"url":"https://webhook.site/123-123-123"}' \
        -H 'content-type:application/json' -H "traceparent:$(trace)"
    ```
Now look at the incoming request to the webhook, and its traceparent header.

The trace ID should be the same there, as it is in the request you made to the App Service, 
as well as the Operation_Id in Application Insights Dependencies and Requests logs. No problem there.

In Application Insights Traces logs there should be a trace with `outgoing traceparent: ${outgoingTraceparent}`.

This is the traceparent I expect to be received at the called endpoint. Instead the Span ID of the traceparent at the called endpoint is the ID of the Dependencies trace in Application Insights for that call.

I expect the traceparent to be the same on the receiving server as it is in my outgoing request.
When the traceparent header is altered somewhere along the way the OpenTelemetry tracing sent to an external collector is disrupted.
