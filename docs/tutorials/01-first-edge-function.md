# Creating Your First Edge Function

This tutorial will guide you through creating your first Supabase Edge Function. We'll build a simple "Hello World" function that responds to HTTP requests.

## What Are Edge Functions?

Edge functions are serverless functions that run at the edge of the network, close to your users. They allow you to execute code without managing servers, and they scale automatically based on demand.

## Prerequisites

Before starting, make sure you have:

1. [Supabase CLI](https://supabase.com/docs/reference/cli/installing-and-updating) installed
2. [Deno](https://deno.land/#installation) installed
3. A Supabase project (free tier works fine)

## Step 1: Set Up Your Project

If you haven't already, initialize a Supabase project:

```bash
# Create a new directory for your project
mkdir my-edge-functions
cd my-edge-functions

# Initialize a Supabase project
supabase init
```

## Step 2: Create Your First Edge Function

Let's create a simple "Hello World" function:

```bash
# Create a new edge function
supabase functions new hello-world
```

This command creates a new directory `supabase/functions/hello-world` with a basic function template.

## Step 3: Write Your Function Code

Open the file `supabase/functions/hello-world/index.ts` and replace its contents with the following code:

```typescript
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Import type definitions for Supabase Edge Functions
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

console.log("Hello from Functions!")

Deno.serve(async (req) => {
  // Get the name from the request body
  let name = "World"
  
  try {
    // Try to parse the request body as JSON
    const { name: requestName } = await req.json()
    if (requestName) {
      name = requestName
    }
  } catch (error) {
    // If the request body is not valid JSON, that's okay
    console.error("Error parsing request body:", error.message)
  }
  
  // Create the response data
  const data = {
    message: `Hello ${name}!`,
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  }

  // Return the response
  return new Response(
    JSON.stringify(data),
    { headers: { "Content-Type": "application/json" } },
  )
})
```

This function:
1. Listens for HTTP requests
2. Tries to extract a `name` parameter from the request body
3. Returns a JSON response with a greeting, timestamp, and version

## Step 4: Run Your Function Locally

Now let's run the function locally to test it:

```bash
# Start the Supabase local development environment
supabase start

# Serve your function locally
supabase functions serve hello-world
```

This will start your function at `http://localhost:54321/functions/v1/hello-world`.

## Step 5: Test Your Function

You can test your function using `curl` or any HTTP client:

### Export `anon key`
```
export ANON_KEY=<anon key>
```
### Test with a Custom Name

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer "$ANON_KEY \
  -d '{"name":"Alice"}' \
  http://localhost:54321/functions/v1/hello-world
```

Expected response:
```json
{
  "message": "Hello Alice!",
  "timestamp": "2025-03-10T23:30:05.000Z",
  "version": "1.0.0"
}
```

## Understanding the Code

Let's break down the key parts of our function:

### Imports and Setup

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
```

This line imports type definitions for Supabase Edge Functions, which helps with code completion and type checking.

### Function Handler

```typescript
Deno.serve(async (req) => {
  // Function code here
})
```

`Deno.serve()` creates an HTTP server that handles incoming requests. The function we pass to it receives the request object and should return a `Response` object.

### Request Handling

```typescript
let name = "World"
  
try {
  const { name: requestName } = await req.json()
  if (requestName) {
    name = requestName
  }
} catch (error) {
  console.error("Error parsing request body:", error.message)
}
```

This code tries to extract a `name` parameter from the request body. If it can't (for example, if the request body is not valid JSON), it falls back to the default value "World".

### Response Creation

```typescript
const data = {
  message: `Hello ${name}!`,
  timestamp: new Date().toISOString(),
  version: "1.0.0"
}

return new Response(
  JSON.stringify(data),
  { headers: { "Content-Type": "application/json" } },
)
```

This creates a JSON response with our data. The `Response` object is a standard Web API object that represents an HTTP response.

## Next Steps

Congratulations! You've created your first Supabase Edge Function. In the next tutorial, we'll build on this foundation to create a more advanced function with agentic capabilities.

To learn more about deploying your function to production, check out the [Deploying and Testing Edge Functions](./03-deployment-and-testing.md) tutorial.

---

[Back to Tutorials](./README.md)
