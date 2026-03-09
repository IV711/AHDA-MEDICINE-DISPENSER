# Hardware integration starter (Arduino Uno)

This setup uses your available parts:

- 4x micro servos
- 1x ultrasonic sensor (HC-SR04 compatible)
- 1x Arduino Uno

## Recommended slot strategy

Your idea (morning / afternoon / night containers) is correct ✅

Use the **4th servo as a safety/delivery gate**:

- Servo 1 → Morning slot
- Servo 2 → Afternoon slot
- Servo 3 → Night slot
- Servo 4 → Output gate / blocker

This gives you clean time-slot mapping and safer delivery.

## Wiring (example)

- Morning servo signal: D3
- Afternoon servo signal: D5
- Night servo signal: D6
- Gate servo signal: D9
- Ultrasonic TRIG: D10
- Ultrasonic ECHO: D11

> Power note: do not power all servos from Uno 5V directly in final build. Use an external 5V supply and common GND.

## Arduino firmware

Upload `hardware/arduino_dispenser_controller.ino`.

It supports serial commands at **9600 baud**:

- `PING`
- `STATUS`
- `DISPENSE:MORNING`
- `DISPENSE:AFTERNOON`
- `DISPENSE:NIGHT`
- `GATE:OPEN`
- `GATE:CLOSE`

The ultrasonic sensor is used as a safety interlock:

- if cup is not detected, dispense is blocked (`ERR:NO_CUP:*`).

## Will it dispense on prescription time?

### Direct answer

- **Arduino alone:** ❌ not by prescription clock (it only executes incoming commands).
- **With hardware bridge (`hardware/hardware_bridge.js`): ✅ yes** — it reads schedule JSON and sends `DISPENSE:*` at matching times.

## Timed scheduler bridge (new)

`hardware/hardware_bridge.js` is a local Node script that:

1. reads exported schedule JSON,
2. checks system time every 20 seconds,
3. sends due commands to Arduino serial,
4. tracks remaining days per slot.

### Run in dry-run mode (no Arduino needed)

```bash
node hardware/hardware_bridge.js --schedule hardware/sample_schedule.json --dry-run
```

### Run with Arduino

```bash
npm install serialport
node hardware/hardware_bridge.js --schedule hardware/sample_schedule.json --port /dev/ttyACM0
```

(Use `COMx` on Windows.)

## Frontend output format

Add Prescription page now exports a JSON payload that `hardware_bridge.js` can consume directly.

Sample: `hardware/sample_schedule.json`

## Demo flow for progress presentation

1. Show Add Prescription form and exported JSON.
2. Run bridge in `--dry-run` to prove time trigger logic.
3. Connect Arduino and run bridge with `--port`.
4. Show real servo actuation at scheduled times.
5. Show no-cup protection response from ultrasonic check.
