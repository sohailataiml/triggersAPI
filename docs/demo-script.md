# 5-minute demo script

A recording script for the Zapier AI Automation Copilot. Built around the four
moments that show engineering judgment rather than features, and paced for the
real constraint: each agent turn takes roughly ten seconds, so six prompts is
the practical budget.

---

## Before recording

**Record against localhost, not the deployed instance.** Render's free tier
spins services down when idle and a cold start takes most of a minute — enough
to ruin a take. Behaviour is identical locally and the latency is far lower.

```bash
pnpm demo
```

Then:

1. Open **<http://localhost:5174>** (Copilot) and **<http://localhost:5173>**
   (Explorer) side by side, roughly 60/40.
2. Send one throwaway event so the Explorer is not empty on camera, then press
   **Clear** in the Copilot.
3. Press **Present** to hide the configuration strip.

---

## 0:00 – 0:25 · What it is

> TriggersAPI is a durable event delivery platform — publish once, and consumers
> get at-least-once delivery with leases, retries, and dead-letter recovery. I
> wrapped it in an MCP server, so an **AI agent** can operate it the same way a
> hand-written consumer would. This is that agent.

*Gesture across both windows.*

> Copilot on the left, the live Explorer on the right. Same database.

## 0:25 – 0:45 · Capabilities are discovered

*Exit Present briefly; point at the capability strip.*

> The Copilot doesn't hard-code anything. On connect it asks the MCP server what
> tools exist — fourteen here, gated by role. Given a producer-only key, the
> consumer and admin actions grey out and the agent tells you it can't do them.

*Return to Present.*

## 0:45 – 1:30 · Publish

**Type:** `Send a GitHub pull_request.opened event for repository acme/widgets.`

> That's a real MCP tool call — `ingest_event` — with its arguments and result
> visible.

*Point right.*

> And the Explorer just moved: **Ingested → Pending**. That's the database, over
> SSE.

## 1:30 – 2:15 · The judgment moment ⭐

**Type:** `What's waiting?`

> Watch which tool it picks. It used `list_deliveries` — **not**
> `lease_deliveries`.

> That matters. Leasing isn't a read. It hides the delivery from other
> consumers, increments the attempt count, and starts a visibility timeout. An
> agent that leases just to *look* quietly corrupts your queue. So the system
> prompt forbids it, and read-only questions route to a read-only tool.

## 2:15 – 3:15 · Consume

**Type:** `Check the inbox.`

*Point right.* > **Pending → Leased.**

**Type:** `Acknowledge it.`

*Point right.* > **Leased → Acknowledged.** Terminal — it will never be
redelivered.

> Nothing there was scripted. Every one of those was a tool call against the
> running platform.

## 3:15 – 4:00 · The bug worth showing ⭐

*Expand the `ack_delivery` tool card; point at the masked `leaseToken`.*

> One thing I found by testing against the live stack. Acknowledging needs a
> 64-character lease token. The model wouldn't copy it — it kept inventing a
> plausible-looking one. The platform rejected it and the delivery was stranded
> until its timeout.

> I didn't fix that by asking the model nicely. The server now holds the token,
> redacts it from the model's context entirely, and substitutes the real one on
> the way out. The credential reaches neither the model nor the browser, and the
> fabrication class of bug is gone structurally.

## 4:00 – 4:35 · Failure recovery

**Type:** `Show me any dead-letter deliveries.`

> Deliveries that exhausted their retry budget — the failures a human has to
> triage.

**Type:** `Replay the failed one.`

> Back into the delivery path, audited.

*If nothing is dead-lettered, skip this beat and go to the close. Don't fake it.*

## 4:35 – 5:00 · Close

> Under the hood: Postgres as the source of truth with `FOR UPDATE SKIP LOCKED`
> leasing, Redis for wake-ups, BullMQ recovering expired leases. The agent talks
> to all of it through MCP — it never touches the database.

> 269 tests, and the MCP boundary isn't mocked: one suite boots the real server
> over the real transport. It's also deployed on Render if you want to click
> through it.

---

## If you run long

Cut the dead-letter beat first, then the capability strip. **Keep 1:30 and
3:15** — those are the two that show engineering judgment rather than features.

## If you record against the deployed instance

Warm all four URLs a minute beforehand or you will film a spinner, and paste the
demo tokens into the deployed Explorer's Settings first. It does not auto-connect
by design: those tokens would otherwise be baked into a public JavaScript bundle
(see [`copilot.md`](./copilot.md#security-notes)).
