#!/usr/bin/env node
/*
  Local hardware bridge:
  - Schedule file mode: reads JSON file and schedules dispense commands.
  - Server mode: accepts schedule JSON from website (POST /schedule).

  Usage:
    node hardware/hardware_bridge.js --schedule hardware/sample_schedule.json --dry-run
    node hardware/hardware_bridge.js --schedule my.json --serial-port /dev/ttyACM0
    node hardware/hardware_bridge.js --server --dry-run
    node hardware/hardware_bridge.js --server --serial-port /dev/ttyACM0
*/

const fs = require("fs");
const http = require("http");

let activeEvents = [];

function parseArgs(argv) {
  const args = {
    schedule: null,
    serialPort: null,
    baud: 9600,
    dryRun: false,
    serverMode: false,
    httpPort: 8787,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--schedule") {
      args.schedule = argv[i + 1];
      i += 1;
    } else if (token === "--serial-port" || token === "--port") {
      args.serialPort = argv[i + 1];
      i += 1;
    } else if (token === "--baud") {
      args.baud = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    } else if (token === "--server") {
      args.serverMode = true;
    } else if (token === "--http-port") {
      args.httpPort = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!args.serverMode && !args.schedule) {
    throw new Error("Provide --schedule <path> or run with --server mode");
  }

  return args;
}

function loadSchedule(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.entries)) {
    throw new Error("Invalid schedule JSON: entries[] is required");
  }

  return parsed;
}

function normalizeEvents(entries) {
  const events = [];

  entries.forEach((entry) => {
    const days = Number(entry.days || 0);
    if (!days) {
      return;
    }

    const slots = [
      { slot: "MORNING", time: entry.morningTime },
      { slot: "AFTERNOON", time: entry.afternoonTime },
      { slot: "NIGHT", time: entry.nightTime },
    ];

    slots.forEach(({ slot, time }) => {
      if (!time || !/^\d{2}:\d{2}$/.test(time)) {
        return;
      }

      events.push({
        tabletName: entry.tabletName || "Unknown",
        slot,
        time,
        remainingDays: days,
        lastDispensedOn: null,
      });
    });
  });

  return events;
}

async function openSerialWriter(args) {
  if (args.dryRun) {
    return {
      async writeLine(line) {
        console.log(`[DRY-RUN] ${line}`);
      },
    };
  }

  if (!args.serialPort) {
    throw new Error("Missing --serial-port for non-dry-run mode");
  }

  let SerialPort;
  try {
    ({ SerialPort } = require("serialport"));
  } catch (error) {
    throw new Error(
      "serialport package is not installed. Run: npm install serialport",
    );
  }

  const serial = new SerialPort({
    path: args.serialPort,
    baudRate: args.baud,
  });

  serial.on("data", (chunk) => {
    process.stdout.write(`[ARDUINO] ${chunk.toString()}`);
  });

  return {
    async writeLine(line) {
      serial.write(`${line}\n`);
    },
  };
}

function todayKey(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function tickScheduler(events, writer) {
  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  const dayKey = todayKey(now);

  events.forEach(async (event) => {
    if (event.remainingDays <= 0) {
      return;
    }

    if (event.time !== currentHHMM) {
      return;
    }

    if (event.lastDispensedOn === dayKey) {
      return;
    }

    const command = `DISPENSE:${event.slot}`;
    console.log(
      `[${new Date().toISOString()}] Dispatching ${command} for ${event.tabletName}`,
    );

    await writer.writeLine(command);

    event.lastDispensedOn = dayKey;
    event.remainingDays -= 1;
  });
}

function withCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function startHttpServer(args) {
  const server = http.createServer((request, response) => {
    withCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          ok: true,
          mode: "server",
          loadedEvents: activeEvents.length,
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/schedule") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });

      request.on("end", () => {
        try {
          const payload = JSON.parse(body);
          if (!Array.isArray(payload.entries)) {
            throw new Error("entries[] missing");
          }

          activeEvents = normalizeEvents(payload.entries);

          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              ok: true,
              loadedEvents: activeEvents.length,
              receivedAt: new Date().toLocaleTimeString(),
            }),
          );
        } catch (error) {
          response.writeHead(400, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: error.message }));
        }
      });
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not found" }));
  });

  server.listen(args.httpPort, "127.0.0.1", () => {
    console.log(
      `Bridge server listening on http://127.0.0.1:${args.httpPort} (POST /schedule)`,
    );
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const writer = await openSerialWriter(args);

  if (args.serverMode) {
    startHttpServer(args);
  } else {
    const schedule = loadSchedule(args.schedule);
    activeEvents = normalizeEvents(schedule.entries);
    console.log(
      `Loaded ${activeEvents.length} timed dispense events from file.`,
    );
  }

  console.log("Scheduler started. Checking every 20 seconds...");

  tickScheduler(activeEvents, writer);
  setInterval(() => {
    tickScheduler(activeEvents, writer);
  }, 20_000);
}

main().catch((error) => {
  console.error(`[hardware_bridge] ${error.message}`);
  process.exit(1);
});
