# Steps to build and deploy
rm -f index.js package.zip

npm run build

zip package.zip index.js

# Replace names to match your resources
az webapp deployment source config-zip --resource-group rg-tracing-test --name app-opteltracingtest --src package.zip