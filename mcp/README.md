# OpenHabit MCP server

Talk to your habits from Claude, ChatGPT, Cursor or any app that supports the
[Model Context Protocol](https://modelcontextprotocol.io): "I just ran 5 km", "what's left today?",
"how is my reading goal going?". The server is a thin layer over the OpenHabit REST API and runs on
your machine (or next to your OpenHabit server), so your data goes only between you, your OpenHabit
server and the assistant you chose.

## What the assistant can do

| Tool | What it does |
|---|---|
| `today` | Habits due today (or on a date): done or open, value, streak |
| `list_habits` | Every habit with its type, target, schedule and category |
| `log_habit` | Mark a habit done; for measurable habits set the day's total or **add** to it ("one more glass of water"); optional note |
| `skip_habit` | Excuse a day (the streak survives) |
| `clear_habit` | Undo what was logged on a day |
| `habit_stats` | Current and best streak, totals, recent months, strongest weekday, freezes left |
| `weekly_review` | Last week in a few sentences |
| `goals` | Goals with deadlines: progress, pace, on track or behind |
| `patterns` | Clear patterns in your data (sleep vs habits, habits that go together) |
| `log_wellness` | Mood (1 to 5) and hours of sleep |
| `create_habit` | A new habit (the assistant is told to confirm with you first) |

Habits are found by name, or a unique part of it ("gym"); when a name is ambiguous the tool says so
instead of guessing. Dates are your local calendar days (set `OPENHABIT_TZ`, e.g. `Europe/Berlin`, if the
machine's timezone isn't yours).

## Set up

1. In the web app: **Account → API tokens → Create**, and copy the token. A token can read everything and log
   entries, but can never change your password, delete the account or create more tokens. Revoke it there at any time.
2. Install Node.js 20 or newer, then `cd mcp && npm ci`.

### Claude Desktop

Settings → Developer → Edit config, and add:

```json
{
  "mcpServers": {
    "openhabit": {
      "command": "node",
      "args": ["/path/to/openhabit/mcp/src/cli.js"],
      "env": {
        "OPENHABIT_URL": "https://habits.example.com",
        "OPENHABIT_TOKEN": "oh_..."
      }
    }
  }
}
```

### Claude Code

```
claude mcp add openhabit --env OPENHABIT_URL=https://habits.example.com --env OPENHABIT_TOKEN=oh_... -- node /path/to/openhabit/mcp/src/cli.js
```

### Over HTTP (one endpoint for a household)

```
OPENHABIT_URL=https://habits.example.com node src/cli.js --http --port 3333
```

This serves MCP's Streamable HTTP transport at `http://<host>:3333/mcp`. It stores no tokens: every request
must carry its own `Authorization: Bearer <OpenHabit API token>`, and the tools act as that user. Put it behind
HTTPS (the same reverse proxy as OpenHabit) before exposing it. Clients that let you set a header can connect directly,
for example `claude mcp add --transport http openhabit https://habits.example.com/mcp --header "Authorization: Bearer oh_..."`.
(claude.ai's custom connectors expect OAuth, which this server doesn't implement yet.)

## Tests

`npm test` runs every tool end to end against an in-memory fake of the API.
